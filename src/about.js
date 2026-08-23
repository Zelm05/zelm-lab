// ===================================================================
// about.js — 「关于我」完整页密码保护
// 规则：
//   - POST /api/about/auth { password }：校验密码（任何访问者）
//   - POST /api/about/password { password }：仅管理员可修改密码
// 密码默认 "1234"，存于 D1 site_secrets 表（SHA-256 十六进制）
// ===================================================================
import { authenticate, json } from './auth.js';

const SECRET_KEY = 'about_password';
const DEFAULT_HASH = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'; // "1234"

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getHash(env) {
  const row = await env.DB.prepare('SELECT value FROM site_secrets WHERE key = ?').bind(SECRET_KEY).first();
  return (row && row.value) || DEFAULT_HASH;
}

// POST /api/about/auth —— 校验密码（任何人）
export async function aboutAuth(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }
  const pw = String(body.password || '');
  if (!pw) return json({ ok: false, error: '请输入密码' }, 400);
  const hash = await sha256Hex(pw);
  const cur = await getHash(env);
  return json({ ok: hash === cur });
}

// POST /api/about/password —— 仅管理员修改密码
export async function aboutChangePassword(request, env) {
  const user = await authenticate(request, env);
  if (!user) return json({ error: '请先登录' }, 401);
  if (user.role !== 'admin') return json({ error: '无权访问' }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }
  const pw = String(body.password || '');
  if (pw.length < 4 || pw.length > 32) {
    return json({ error: '密码长度需在 4-32 位之间' }, 400);
  }
  const hash = await sha256Hex(pw);
  await env.DB
    .prepare('INSERT INTO site_secrets (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(SECRET_KEY, hash)
    .run();
  return json({ message: '关于页密码已更新' });
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
