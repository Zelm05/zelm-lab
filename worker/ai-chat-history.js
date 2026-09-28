/* ==========================================================================
 * ai-chat-history.js —— AI 聊天记录落库（D1，按登录用户严格隔离）
 *
 * 接口（全部需要先登录，未登录一律 401 —— 与 /api/ai/chat 同一门槛）：
 *   GET    /api/ai/sessions                 → { sessions: [...] }（不含消息）
 *   POST   /api/ai/sessions                 → 201 { session }  { id?, title?, pinned? }
 *   POST   /api/ai/sessions/import          → { imported, messages, skipped? }（一次性搬迁）
 *   PATCH  /api/ai/sessions/:id             → { session }      { title?, pinned? }
 *   DELETE /api/ai/sessions/:id             → { ok: true }
 *   GET    /api/ai/sessions/:id/messages    → { messages: [...] }
 *   POST   /api/ai/sessions/:id/messages    → { ok, count }    { messages:[…], title? }
 *
 * 隔离设计（**本文件的核心约束**，改代码时不要破坏）：
 *   1) 每个入口先 verifySession 拿 uid（users.id）；
 *   2) 会话层：所有 SQL 必带 `AND user_id = ?`；
 *   3) 消息层：先 `assertOwnSession()` 确认「这个会话是我的」，再动消息；
 *      消息表还冗余了一份 user_id，即使 JOIN 漏了也能单表判定归属；
 *   4) 越权一律 **404 而不是 403** —— 不泄露「这个 id 存在但不属于你」，
 *      避免会话 id 可被探测枚举。
 *
 * 表结构见 migrations/migration-030-ai-chat-history.sql。
 * 时间统一 ISO 8601 文本（字典序 = 时间序），对外统一转成 camelCase。
 * ========================================================================== */
import { json, verifySession } from './auth.js';

/* 会话/消息 id 沿用前端算法：`s_`/`m_` + base36(ms时间戳) + 4 位随机 */
const ID_RE = /^[sm]_[0-9a-z]{6,32}$/;
const ROLES = ['user', 'assistant'];
const DEFAULT_TITLE = '新对话';
const MAX_TITLE = 60;
const MAX_CONTENT = 8000;          /* 单条消息字符上限（比 /api/ai/chat 放宽：历史可更长） */
const MAX_MSGS_PER_POST = 60;      /* 单次批量追加消息上限 */
const MAX_IMPORT_SESSIONS = 30;    /* 一次性搬迁的会话上限（与前端 MAX_SESSIONS 一致） */
const MAX_IMPORT_MSGS = 40;        /* 单个会话搬迁的消息上限 */
const LIST_LIMIT = 200;            /* 会话列表硬上限，防异常账号拖垮响应 */

/** 生成 id：prefix('s'|'m') + base36(ms) + 4 位 base36 随机 */
export function newId(prefix, now) {
  return prefix + '_' + (now || Date.now()).toString(36) + Math.random().toString(36).slice(2, 6);
}

/** ISO 8601（毫秒精度，UTC）——字典序即时间序，排序直接 ORDER BY */
function iso(now) {
  return new Date(now || Date.now()).toISOString();
}

/** 标题清洗：压平空白（顺带吃掉换行/制表符）、截断、空则回落默认标题 */
function cleanTitle(v, fallback) {
  const s = String(v == null ? '' : v)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TITLE);
  if (s) return s;
  return fallback === undefined ? DEFAULT_TITLE : fallback;
}

/** 时间戳清洗：只接受能被 Date 解析的输入，否则用当前时间 */
function cleanIso(v, fallbackNow) {
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : iso(fallbackNow);
}

const toSession = (r) => ({
  id: r.id,
  title: r.title,
  pinned: !!Number(r.pinned),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const toMessage = (r) => ({
  id: r.id,
  role: r.role,
  content: r.content,
  createdAt: r.created_at,
});

const SESSION_COLS = 'id, user_id, title, pinned, created_at, updated_at';

/**
 * 「这个会话是我的吗」—— 会话层所有写操作的唯一入口。
 * @returns {Promise<object|null>} 属于自己则返回行，否则 null（调用方给 404）
 */
async function assertOwnSession(env, id, uid) {
  if (!env || !env.DB || typeof id !== 'string' || !ID_RE.test(id) || !uid) return null;
  try {
    const row = await env.DB
      .prepare('SELECT ' + SESSION_COLS + ' FROM ai_chat_sessions WHERE id = ? AND user_id = ?')
      .bind(id, uid)
      .first();
    return row || null;
  } catch (e) {
    console.error('ai_chat 会话归属校验失败:', (e && e.message) || e);
    return null;
  }
}

/** 表还没建（迁移未跑）时的统一兜底：列表退化为空，聊天本身不受影响 */
async function listSessions(env, uid) {
  try {
    const { results } = await env.DB
      .prepare('SELECT ' + SESSION_COLS + ' FROM ai_chat_sessions WHERE user_id = ? '
        + 'ORDER BY pinned DESC, updated_at DESC LIMIT ' + LIST_LIMIT)
      .bind(uid)
      .all();
    return (results || []).map(toSession);
  } catch (e) {
    console.error('ai_chat 会话列表读取失败:', (e && e.message) || e);
    return [];
  }
}

/* --------------------------- 各端点实现 --------------------------- */

async function onCreate(request, env, uid) {
  let b = {};
  try { b = await request.json(); } catch (e) { return json({ error: '请求体不是合法 JSON' }, 400); }
  b = b && typeof b === 'object' ? b : {};
  /* id 由客户端生成（沿用 s_<base36>），格式不合法或缺失时服务端兜底生成 */
  const id = typeof b.id === 'string' && ID_RE.test(b.id) ? b.id : newId('s');
  const now = iso();
  const title = cleanTitle(b.title);
  const pinned = b.pinned ? 1 : 0;
  try {
    await env.DB
      .prepare('INSERT INTO ai_chat_sessions (id, user_id, title, pinned, created_at, updated_at) '
        + 'VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, uid, title, pinned, now, now)
      .run();
  } catch (e) {
    console.error('ai_chat 新建会话失败:', (e && e.message) || e);
    return json({ error: '新建会话失败' }, 500);
  }
  return json({ session: { id, title, pinned: !!pinned, createdAt: now, updatedAt: now } }, 201);
}

async function onPatch(request, env, uid, id) {
  const own = await assertOwnSession(env, id, uid);
  if (!own) return json({ error: '会话不存在' }, 404);

  let b = {};
  try { b = await request.json(); } catch (e) { return json({ error: '请求体不是合法 JSON' }, 400); }
  b = b && typeof b === 'object' ? b : {};

  const sets = [];
  const args = [];
  if (typeof b.title === 'string') { sets.push('title = ?'); args.push(cleanTitle(b.title)); }
  if (b.pinned !== undefined) { sets.push('pinned = ?'); args.push(b.pinned ? 1 : 0); }
  if (!sets.length) return json({ error: '没有可更新的字段（title / pinned）' }, 400);

  const now = iso();
  sets.push('updated_at = ?');
  args.push(now, id, uid);
  try {
    await env.DB
      .prepare('UPDATE ai_chat_sessions SET ' + sets.join(', ') + ' WHERE id = ? AND user_id = ?')
      .bind(...args)
      .run();
  } catch (e) {
    console.error('ai_chat 更新会话失败:', (e && e.message) || e);
    return json({ error: '更新会话失败' }, 500);
  }
  const fresh = await assertOwnSession(env, id, uid);
  return json({ session: fresh ? toSession(fresh) : null });
}

async function onDelete(env, uid, id) {
  const own = await assertOwnSession(env, id, uid);
  if (!own) return json({ error: '会话不存在' }, 404);
  try {
    /* 消息靠 ON DELETE CASCADE 一并清理，不手动删（少一次往返，也不会删漏） */
    await env.DB
      .prepare('DELETE FROM ai_chat_sessions WHERE id = ? AND user_id = ?')
      .bind(id, uid)
      .run();
  } catch (e) {
    console.error('ai_chat 删除会话失败:', (e && e.message) || e);
    return json({ error: '删除会话失败' }, 500);
  }
  return json({ ok: true });
}

async function onGetMessages(env, uid, id) {
  const own = await assertOwnSession(env, id, uid);
  if (!own) return json({ error: '会话不存在' }, 404);
  try {
    const { results } = await env.DB
      .prepare('SELECT id, role, content, created_at FROM ai_chat_messages '
        + 'WHERE session_id = ? AND user_id = ? ORDER BY created_at, rowid')
      .bind(id, uid)
      .all();
    return json({ messages: (results || []).map(toMessage) });
  } catch (e) {
    console.error('ai_chat 消息读取失败:', (e && e.message) || e);
    return json({ error: '消息读取失败' }, 500);
  }
}

async function onPostMessages(request, env, uid, id) {
  const own = await assertOwnSession(env, id, uid);
  if (!own) return json({ error: '会话不存在' }, 404);

  let b = {};
  try { b = await request.json(); } catch (e) { return json({ error: '请求体不是合法 JSON' }, 400); }
  b = b && typeof b === 'object' ? b : {};
  if (!Array.isArray(b.messages) || !b.messages.length) {
    return json({ error: 'messages 必须是非空数组' }, 400);
  }
  if (b.messages.length > MAX_MSGS_PER_POST) {
    return json({ error: '单次最多追加 ' + MAX_MSGS_PER_POST + ' 条消息' }, 400);
  }

  const now = iso();
  const stmts = [];
  let count = 0;
  for (const m of b.messages) {
    if (!m || ROLES.indexOf(m.role) === -1 || typeof m.content !== 'string') continue;
    const content = m.content.slice(0, MAX_CONTENT);
    if (!content) continue;
    const mid = typeof m.id === 'string' && ID_RE.test(m.id) ? m.id : newId('m');
    stmts.push(env.DB
      .prepare('INSERT INTO ai_chat_messages (id, session_id, user_id, role, content, created_at) '
        + 'VALUES (?, ?, ?, ?, ?, ?)')
      .bind(mid, id, uid, m.role, content, cleanIso(m.createdAt, Date.now())));
    count++;
  }
  if (!count) return json({ error: '没有合法消息（需要 role + 非空 content）' }, 400);

  /* 顺带刷新会话 updated_at；title 仅在客户端显式传时更新（自动命名就是这么写的） */
  const hasTitle = typeof b.title === 'string';
  const sql = 'UPDATE ai_chat_sessions SET updated_at = ?'
    + (hasTitle ? ', title = ?' : '')
    + ' WHERE id = ? AND user_id = ?';
  const args = hasTitle ? [now, cleanTitle(b.title), id, uid] : [now, id, uid];
  stmts.push(env.DB.prepare(sql).bind(...args));

  try {
    await env.DB.batch(stmts);
  } catch (e) {
    console.error('ai_chat 追加消息失败:', (e && e.message) || e);
    return json({ error: '追加消息失败' }, 500);
  }
  return json({ ok: true, count });
}

/**
 * 一次性搬迁：把浏览器 sessionStorage 里的旧会话整批搬进 D1。
 * 幂等保护：该用户已有会话时直接跳过（返回 skipped），避免重复导入。
 */
async function onImport(request, env, uid) {
  let b = {};
  try { b = await request.json(); } catch (e) { return json({ error: '请求体不是合法 JSON' }, 400); }
  b = b && typeof b === 'object' ? b : {};
  if (!Array.isArray(b.sessions) || !b.sessions.length) {
    return json({ error: 'sessions 必须是非空数组' }, 400);
  }
  if (b.sessions.length > MAX_IMPORT_SESSIONS) {
    return json({ error: '单次最多导入 ' + MAX_IMPORT_SESSIONS + ' 个会话' }, 400);
  }
  try {
    const existing = await listSessions(env, uid);
    if (existing.length) return json({ imported: 0, messages: 0, skipped: true });
  } catch (e) { /* 读不到就当没有，继续导入 */ }

  const stmts = [];
  let nSes = 0;
  let nMsg = 0;
  for (const s of b.sessions) {
    if (!s || typeof s !== 'object') continue;
    const sid = typeof s.id === 'string' && ID_RE.test(s.id) ? s.id : newId('s');
    const createdAt = cleanIso(s.createdAt, Date.now());
    const updatedAt = cleanIso(s.updatedAt, Date.parse(createdAt));
    stmts.push(env.DB
      .prepare('INSERT INTO ai_chat_sessions (id, user_id, title, pinned, created_at, updated_at) '
        + 'VALUES (?, ?, ?, ?, ?, ?)')
      .bind(sid, uid, cleanTitle(s.title), s.pinned ? 1 : 0, createdAt, updatedAt));
    nSes++;
    const msgs = Array.isArray(s.messages) ? s.messages.slice(0, MAX_IMPORT_MSGS) : [];
    for (const m of msgs) {
      if (!m || ROLES.indexOf(m.role) === -1 || typeof m.content !== 'string') continue;
      const content = m.content.slice(0, MAX_CONTENT);
      if (!content) continue;
      stmts.push(env.DB
        .prepare('INSERT INTO ai_chat_messages (id, session_id, user_id, role, content, created_at) '
          + 'VALUES (?, ?, ?, ?, ?, ?)')
        .bind(newId('m'), sid, uid, m.role, content, cleanIso(m.createdAt, Date.parse(createdAt))));
      nMsg++;
    }
  }
  if (!nSes) return json({ error: '没有合法会话可导入' }, 400);
  try {
    await env.DB.batch(stmts);
  } catch (e) {
    console.error('ai_chat 导入失败:', (e && e.message) || e);
    return json({ error: '导入失败' }, 500);
  }
  return json({ imported: nSes, messages: nMsg });
}

/**
 * 路由分发：只认 `/api/ai/sessions` 前缀，其余返回 null（交给其他 handler）。
 * @returns {Promise<Response|null>}
 */
export async function handleAiHistoryApi(request, env) {
  let p;
  try { p = new URL(request.url).pathname; } catch (e) { return null; }
  const BASE = '/api/ai/sessions';
  if (p.indexOf(BASE) !== 0) return null;

  /* ① 登录门槛：未登录 / 被踢下线一律 401（与 /api/ai/chat 一致） */
  const user = await verifySession(request, env);
  if (!user || user.kicked) return json({ error: '请先登录' }, 401);
  const uid = Number(user.sub) || 0;
  if (!uid) return json({ error: '请先登录' }, 401);

  const rest = p.slice(BASE.length);
  const m = request.method;

  /* ② /api/ai/sessions —— 列表 / 新建 */
  if (rest === '' || rest === '/') {
    if (m === 'GET') return json({ sessions: await listSessions(env, uid) });
    if (m === 'POST') return onCreate(request, env, uid);
    return json({ error: '方法不支持' }, 405);
  }

  /* ③ /api/ai/sessions/import —— 旧 sessionStorage 数据一次性搬迁 */
  if (rest === '/import') {
    if (m === 'POST') return onImport(request, env, uid);
    return json({ error: '方法不支持' }, 405);
  }

  /* ④ /api/ai/sessions/:id/messages —— 消息读写（先校验会话归属） */
  const mm = rest.match(/^\/([^/]+)\/messages$/);
  if (mm) {
    let id = mm[1];
    try { id = decodeURIComponent(id); } catch (e) { /* 非法编码保持原样，ID_RE 会拒 */ }
    if (m === 'GET') return onGetMessages(env, uid, id);
    if (m === 'POST') return onPostMessages(request, env, uid, id);
    return json({ error: '方法不支持' }, 405);
  }

  /* ⑤ /api/ai/sessions/:id —— 重命名/置顶/删除 */
  const sm = rest.match(/^\/([^/]+)$/);
  if (sm) {
    let id = sm[1];
    try { id = decodeURIComponent(id); } catch (e) { /* 同上 */ }
    if (m === 'PATCH') return onPatch(request, env, uid, id);
    if (m === 'DELETE') return onDelete(env, uid, id);
    return json({ error: '方法不支持' }, 405);
  }

  return json({ error: '接口不存在' }, 404);
}
