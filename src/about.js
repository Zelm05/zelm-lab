// ===================================================================
// about.js — 「关于我」完整页访问控制（密码可开关，由站长在管理台配置）
// 规则：
//   - POST /api/about/auth { password }：校验密码（任何访问者）
//     若站长已「取消密码」（about_password_enabled = 0），直接放行返回 ok:true
//   - POST /api/about/password：仅站长（owner）可设置 / 重置 / 取消密码
//     body:
//       { password: 'new' }   → 设置新密码（4-32 位）并启用密码保护
//       { reset: true }       → 重置为默认密码 1234 并启用
//       { enabled: false }    → 取消密码（此后免密进入关于页）
//       { enabled: true }     → 仅重新启用密码保护（沿用原密码）
// 密码存储：D1 site_secrets 表，PBKDF2 加盐哈希（兼容旧版 SHA-256 十六进制）
// ===================================================================
import { authenticate, json } from './auth.js';
import { makePasswordRecord, verifyPassword } from './auth.js';
import { getSetting, setSetting } from './settings.js';

const SECRET_KEY = 'about_password';
// 旧格式默认密码 "1234"（SHA-256 十六进制，用于向后兼容）
const DEFAULT_LEGACY_HASH = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';
// 站长「重置为默认」时使用的明文密码
const DEFAULT_PASSWORD = '1234';
const SETTING_ENABLED = 'about_password_enabled';

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 判断是否为新格式（salt:hash）
function isNewFormat(value) {
  return value && value.includes(':') && value.split(':').length === 2;
}

// 获取存储的密码值
async function getStoredValue(env) {
  const row = await env.DB.prepare('SELECT value FROM site_secrets WHERE key = ?').bind(SECRET_KEY).first();
  return (row && row.value) || DEFAULT_LEGACY_HASH;
}

// 密码保护是否已启用（表缺失时默认启用，保持既有行为）
async function passwordEnabled(env) {
  return (await getSetting(env, SETTING_ENABLED, '1')) === '1';
}

// 写入密码记录（PBKDF2 加盐哈希）
async function writePassword(env, plain) {
  const { salt, hash } = await makePasswordRecord(plain);
  const value = `${salt}:${hash}`;
  await env.DB
    .prepare('INSERT INTO site_secrets (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(SECRET_KEY, value)
    .run();
}

// POST /api/about/auth —— 校验密码（任何人）
export async function aboutAuth(request, env) {
  // 站长已取消密码：免密放行
  if (!(await passwordEnabled(env))) return json({ ok: true, skipped: true });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }
  const pw = String(body.password || '');
  if (!pw) return json({ ok: false, error: '请输入密码' }, 400);
  const stored = await getStoredValue(env);

  // 新格式（PBKDF2 加盐哈希）
  if (isNewFormat(stored)) {
    const [salt, hash] = stored.split(':');
    const ok = await verifyPassword(pw, salt, hash);
    return json({ ok });
  }

  // 旧格式（SHA-256 十六进制，向后兼容）
  const hash = await sha256Hex(pw);
  const ok = hash === stored;

  // 如果验证成功且是旧格式，自动升级为新格式
  if (ok) {
    try {
      const newRecord = await makePasswordRecord(pw);
      const newValue = `${newRecord.salt}:${newRecord.hash}`;
      await env.DB
        .prepare('INSERT INTO site_secrets (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .bind(SECRET_KEY, newValue)
        .run();
    } catch (e) {
      console.error('Failed to upgrade password format:', e);
    }
  }

  return json({ ok });
}

// POST /api/about/password —— 仅站长（owner）：设置 / 重置 / 取消密码
export async function aboutChangePassword(request, env) {
  const user = await authenticate(request, env);
  if (!user) return json({ error: '请先登录' }, 401);
  if (user.role !== 'owner') return json({ error: '仅站长可修改访问密码' }, 403);

  let body = {};
  try {
    body = (await request.json()) || {};
  } catch {
    body = {};
  }

  try {
    // ① 取消密码（免密进入）
    if (body.enabled === false) {
      await setSetting(env, SETTING_ENABLED, '0');
      return json({ message: '已取消关于页密码，此后免密进入', enabled: false });
    }

    // ② 重置为默认密码 1234（并启用）
    if (body.reset === true) {
      await writePassword(env, DEFAULT_PASSWORD);
      await setSetting(env, SETTING_ENABLED, '1');
      return json({ message: `已重置为默认密码 ${DEFAULT_PASSWORD}`, enabled: true });
    }

    // ③ 设置新密码（并启用）
    const hasPassword = Object.prototype.hasOwnProperty.call(body, 'password');
    if (hasPassword && String(body.password) !== '') {
      const pw = String(body.password);
      if (pw.length < 4 || pw.length > 32) {
        return json({ error: '密码长度需在 4-32 位之间' }, 400);
      }
      await writePassword(env, pw);
      await setSetting(env, SETTING_ENABLED, '1');
      return json({ message: '关于页密码已更新', enabled: true });
    }

    // ④ 仅重新启用密码保护（沿用原密码）
    if (body.enabled === true) {
      await setSetting(env, SETTING_ENABLED, '1');
      return json({ message: '已重新启用关于页密码', enabled: true });
    }

    return json({ error: '参数无效：需提供 password / reset:true / enabled:false' }, 400);
  } catch (e) {
    console.error('save about password failed:', e);
    return json({ error: '保存失败，请确认已执行 migrations/migration-add-site-settings.sql' }, 500);
  }
}

// ---------------- 路由分发 ----------------
export async function handleAboutApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  try {
    if (path === '/api/about/auth' && method === 'POST') return await aboutAuth(request, env);
    if (path === '/api/about/password' && method === 'POST') return await aboutChangePassword(request, env);
  } catch (err) {
    console.error('About API Error:', err);
    return json({ error: '服务器内部错误' }, 500);
  }
  return null;
}
