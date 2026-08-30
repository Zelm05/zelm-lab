// ===================================================================
// settings.js — 站点设置（仅站长可修改，全站生效）
// 存储：D1 表 site_settings（key-value，见 migrations/migration-add-site-settings.sql）
// 可配置项：
//   about_password_enabled  1/0    关于页是否需要访问密码（0 = 免密进入）
//   entry_page              index|about   从欢迎页「进入网站」的落地页
//   message_login_required  1/0    发表留言是否要求先登录
//   about_login_required    1/0    进入关于页是否要求先登录
//   photo_wall_enabled      1/0    关于页「照片墙」板块是否显示（0 = 板块与导航项同时隐藏）
//   home_about_enabled      1/0    主站是否显示「关于我」板块（0 = 板块与导航项同时隐藏）
// 接口：
//   GET /api/site/settings —— 公开（游客可读，前端按此决定是否弹登录/密码）
//   PUT /api/site/settings —— 仅站长（owner）
// ===================================================================

import { authenticate, json } from './auth.js';

// 默认值：site_settings 表缺失（未执行迁移）或没有对应行时的回退值
const DEFAULTS = {
  about_password_enabled: '1',
  entry_page: 'index',
  message_login_required: '1',
  about_login_required: '1',
  photo_wall_enabled: '1',
  home_about_enabled: '1',
};

// 允许写入的键 + 各自的值白名单校验
const WRITABLE = {
  about_password_enabled: (v) => (v === '1' || v === '0' ? v : null),
  entry_page: (v) => (v === 'index' || v === 'about' ? v : null),
  message_login_required: (v) => (v === '1' || v === '0' ? v : null),
  about_login_required: (v) => (v === '1' || v === '0' ? v : null),
  photo_wall_enabled: (v) => (v === '1' || v === '0' ? v : null),
  home_about_enabled: (v) => (v === '1' || v === '0' ? v : null),
};

// 归一化：把内部存储值（'1'/'0'、'about'/'index'）转成对外 API 的布尔/枚举形式
function normalizeForApi(s) {
  return {
    about_password_enabled: s.about_password_enabled === '1',
    entry_page: s.entry_page === 'about' ? 'about' : 'index',
    message_login_required: s.message_login_required === '1',
    about_login_required: s.about_login_required === '1',
    photo_wall_enabled: s.photo_wall_enabled === '1',
    home_about_enabled: s.home_about_enabled === '1',
  };
}

// 读取单个设置；异常（表不存在等）时回退默认值，绝不阻塞业务流程
export async function getSetting(env, key, fallback) {
  try {
    const row = await env.DB.prepare('SELECT value FROM site_settings WHERE key = ?').bind(key).first();
    if (row && row.value !== undefined && row.value !== null && row.value !== '') return String(row.value);
  } catch (e) {
    /* 表不存在时静默回退 */
  }
  return fallback !== undefined ? fallback : (DEFAULTS[key] || '');
}

// 写入单个设置（UPSERT）；返回是否成功
export async function setSetting(env, key, value) {
  await env.DB
    .prepare(
      'INSERT INTO site_settings (key, value) VALUES (?, ?) ' +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    .bind(key, String(value))
    .run();
}

// 读取全部站点设置（归一化后的对象）
export async function getSiteSettings(env) {
  const out = {};
  for (const key of Object.keys(DEFAULTS)) {
    out[key] = await getSetting(env, key);
  }
  return out;
}

// 便捷判定：是否需要关于页密码
export async function aboutPasswordEnabled(env) {
  return (await getSetting(env, 'about_password_enabled')) === '1';
}

// ---------------- 站点配置 Cookie（供前端在解析阶段同步读取） ----------------
// 背景：板块显隐若等 /api/site/settings 异步返回后再处理，页面会先显示、再被
// 隐藏，肉眼就是"设置没生效"。这里把配置随 HTML 响应写进 Cookie（非 HttpOnly），
// 前端在解析 HTML 时同步读出，即可在首屏绘制前完成显隐。
// 注意：Cookie 只放 6 个开关状态，不含任何凭据；权限判定始终以后端为准。
export const SITE_CFG_COOKIE = 'zelm_site_cfg';
const SITE_CFG_MAX_AGE = 86400;

// 精简结构（键名压缩以缩短 Cookie），字段与前端 public/site-cfg.js 保持一致
function compactFromRaw(s) {
  return {
    apw: s.about_password_enabled === '1' ? 1 : 0, // 关于页密码
    ep: s.entry_page === 'about' ? 'a' : 'i',      // 欢迎页落地页
    mlr: s.message_login_required === '1' ? 1 : 0, // 留言需登录
    alr: s.about_login_required === '1' ? 1 : 0,   // 关于页需登录
    pw: s.photo_wall_enabled === '1' ? 1 : 0,      // 照片墙
    ha: s.home_about_enabled === '1' ? 1 : 0,      // 主站「关于我」
  };
}

export function siteCfgCookie(compact) {
  return (
    SITE_CFG_COOKIE + '=' + encodeURIComponent(JSON.stringify(compact)) +
    '; Path=/; SameSite=Lax; Max-Age=' + SITE_CFG_MAX_AGE
  );
}

// 给 HTML 页面响应挂上站点配置 Cookie；出错时原样返回，绝不拖垮页面
export async function withSiteCfgCookie(res, env) {
  try {
    if (!res || !res.ok) return res;
    const s = await getSiteSettings(env);
    const h = new Headers(res.headers);
    h.append('Set-Cookie', siteCfgCookie(compactFromRaw(s)));
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  } catch (e) {
    return res;
  }
}

// ---------------- GET /api/site/settings（公开） ----------------
export async function getPublicSettings(request, env) {
  const s = await getSiteSettings(env);
  // 兼容旧前端：额外给出布尔形式；raw 为内部原始字符串
  const body = json(Object.assign(normalizeForApi(s), { raw: s }));
  // 顺带刷新一次 Cookie：本接口每次进页面都会被调用，可自愈"首次访问还没有 Cookie"
  try {
    const h = new Headers(body.headers);
    h.append('Set-Cookie', siteCfgCookie(compactFromRaw(s)));
    return new Response(body.body, { status: body.status, statusText: body.statusText, headers: h });
  } catch (e) {
    return body;
  }
}

// ---------------- PUT /api/site/settings（仅站长） ----------------
export async function updateSettings(request, env) {
  const user = await authenticate(request, env);
  if (!user) return json({ error: '请先登录' }, 401);
  if (user.role !== 'owner') return json({ error: '仅站长可修改站点设置' }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }
  if (!body || typeof body !== 'object') return json({ error: '请求体格式错误' }, 400);

  const patch = {};
  const invalid = [];
  for (const key of Object.keys(WRITABLE)) {
    if (!(key in body)) continue;
    // 兼容布尔值入参（true/false → '1'/'0'）
    let raw = body[key];
    if (typeof raw === 'boolean') raw = raw ? '1' : '0';
    raw = String(raw).trim();
    const normalized = WRITABLE[key](raw);
    if (normalized === null) { invalid.push(key); continue; }
    patch[key] = normalized;
  }
  if (invalid.length) return json({ error: '参数取值不合法：' + invalid.join(', ') }, 400);
  if (!Object.keys(patch).length) return json({ error: '没有需要更新的设置项' }, 400);

  try {
    for (const key of Object.keys(patch)) {
      await setSetting(env, key, patch[key]);
    }
  } catch (e) {
    console.error('save site settings failed:', e);
    return json({ error: '保存失败，请确认已执行 migrations/migration-add-site-settings.sql' }, 500);
  }

  const s = await getSiteSettings(env);
  return json({ message: '站点设置已保存', settings: normalizeForApi(s) });
}

// ---------------- 路由分发 ----------------
export async function handleSettingsApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  try {
    if (path === '/api/site/settings' && method === 'GET') return await getPublicSettings(request, env);
    if (path === '/api/site/settings' && method === 'PUT') return await updateSettings(request, env);
    // 兼容只支持 GET/POST 的调用方
    if (path === '/api/site/settings' && method === 'POST') return await updateSettings(request, env);
  } catch (err) {
    console.error('Settings API Error:', err);
    return json({ error: '服务器内部错误' }, 500);
  }
  return null;
}
