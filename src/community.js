// ===================================================================
// community.js — 社区接口：留言板 / 点赞 / 反馈建议
// 权限规则：
//   - 留言：所有人可见；发表是否需登录由站长设置（message_login_required）决定；
//           点赞是否需登录由站长设置（like_login_required）决定（每人每条一次）；
//           删除仅管理员级身份（admin/owner）
//   - 反馈/建议：仅普通用户(user)可提交；本人可查看自己的记录（含管理员回复）；
//           管理员级身份可查看全部并回复/删除
// ===================================================================

import { authenticate, json, checkRateLimit, getClientIP } from './auth.js';
import { getSetting } from './settings.js';

const MAX_MESSAGE_LEN = 500;   // 留言最长 500 字
const MAX_FEEDBACK_LEN = 1000; // 反馈/建议最长 1000 字
const FEEDBACK_KINDS = ['feedback', 'suggestion'];

// 游客留言的兜底展示名（user_id = 0 表示游客）
const GUEST_UID = 0;
const GUEST_NAME = '游客';
const MAX_NICKNAME_LEN = 20;

// 是否为管理员级身份（admin / owner）
function isPrivileged(role) { return role === 'admin' || role === 'owner'; }

// 是否要求「先登录才能留言」（站长可在管理台关闭；表缺失时默认要求登录）
async function messageLoginRequired(env) {
  return (await getSetting(env, 'message_login_required', '1')) === '1';
}

// 是否要求「先登录才能点赞」（站长可在管理台关闭；表缺失时默认要求登录）
async function likeLoginRequired(env) {
  return (await getSetting(env, 'like_login_required', '1')) === '1';
}

// ---------------- 留言板 ----------------

// GET /api/messages —— 所有人可见（含游客）
export async function listMessages(request, env) {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1), 100);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);

  const user = await authenticate(request, env); // 可能为 null（游客）
  const rows = await env.DB
    .prepare('SELECT m.id, m.user_id, m.username, m.content, m.likes, m.created_at, u.username AS current_name FROM messages m LEFT JOIN users u ON u.id = m.user_id ORDER BY m.id DESC LIMIT ? OFFSET ?')
    .bind(limit, offset)
    .all();

  const messages = (rows.results || []).map((m) => ({
    id: m.id,
    username: m.current_name || m.username,
    content: m.content,
    likes: m.likes,
    created_at: m.created_at,
    liked: false,
    is_mine: user ? Number(m.user_id) === Number(user.sub) : false,
    replies: [],
    reply_count: 0,
  }));

  // 已登录：批量查询当前用户点过赞的留言
  if (user && messages.length) {
    const ids = messages.map((m) => m.id);
    const placeholders = ids.map(() => '?').join(',');
    const likedRows = await env.DB
      .prepare(`SELECT message_id FROM message_likes WHERE user_id = ? AND message_id IN (${placeholders})`)
      .bind(user.sub, ...ids)
      .all();
    const likedSet = new Set((likedRows.results || []).map((r) => r.message_id));
    messages.forEach((m) => { m.liked = likedSet.has(m.id); });
  }

  // 批量查询本页留言的所有回复，按留言分组（回复按时间正序，同时间按 id）
  if (messages.length) {
    const ids = messages.map((m) => m.id);
    const placeholders = ids.map(() => '?').join(',');
    const replyRows = await env.DB
      .prepare(`SELECT r.id, r.message_id, r.username, r.content, r.parent_reply_id, r.created_at, u.username AS current_name FROM message_replies r LEFT JOIN users u ON u.id = r.user_id WHERE r.message_id IN (${placeholders}) ORDER BY r.id ASC`)
      .bind(...ids)
      .all();
    const byMsg = {};
    (replyRows.results || []).forEach((r) => {
      (byMsg[r.message_id] = byMsg[r.message_id] || []).push({
        id: r.id,
        username: r.current_name || r.username,
        content: r.content,
        parent_reply_id: r.parent_reply_id,
        created_at: r.created_at,
        is_mine: user ? Number(r.user_id) === Number(user.sub) : false,
      });
    });
    messages.forEach((m) => {
      m.replies = byMsg[m.id] || [];
      m.reply_count = m.replies.length;
    });
  }

  const requireLogin = await messageLoginRequired(env);
  return json({
    messages,
    can_post: !!user || !requireLogin,
    can_delete: !!(user && isPrivileged(user.role)),
    login_required: requireLogin,
  });
}

// POST /api/messages { content, nickname? } —— 是否要求登录由站长设置决定
//   需要登录（默认）：必须携带有效会话
//   免登录（站长关闭开关）：游客也可留言，user_id = 0，展示名取 nickname（默认「游客」）
export async function postMessage(request, env) {
  const user = await authenticate(request, env);
  const requireLogin = await messageLoginRequired(env);
  if (requireLogin && !user) return json({ error: '请先登录' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }
  const content = String(body.content || '').trim();
  if (!content) return json({ error: '留言内容不能为空' }, 400);
  if (content.length > MAX_MESSAGE_LEN) {
    return json({ error: `留言最长 ${MAX_MESSAGE_LEN} 字` }, 400);
  }

  // 游客留言：按 IP 限流，避免免登录后被刷屏
  if (!user) {
    const ip = getClientIP(request);
    const rate = await checkRateLimit(env, `guest_message:${ip}`, 5, 60000);
    if (!rate.allowed) {
      return json({ error: `留言过于频繁，请 ${Math.ceil(rate.retryAfter)} 秒后再试` }, 429);
    }
  }

  let uid = GUEST_UID;
  let uname = GUEST_NAME;
  if (user) {
    uid = user.sub;
    uname = user.username;
  } else {
    const nick = String(body.nickname || '').trim();
    if (nick) uname = nick.slice(0, MAX_NICKNAME_LEN);
  }

  const res = await env.DB
    .prepare('INSERT INTO messages (user_id, username, content, likes, created_at) VALUES (?, ?, ?, 0, ?)')
    .bind(uid, uname, content, Date.now())
    .run();

  return json({ message: '留言成功', id: res.meta.last_row_id }, 201);
}

// POST /api/messages/:id/like —— 点赞 / 取消点赞（toggle）
//   是否要求登录由站长设置（like_login_required）决定；关闭后游客也可点赞（共享游客标识）
export async function toggleLike(request, env, id) {
  const user = await authenticate(request, env);
  const requireLogin = await likeLoginRequired(env);
  if (requireLogin && !user) return json({ error: '请先登录' }, 401);

  const msg = await env.DB
    .prepare('SELECT id FROM messages WHERE id = ?')
    .bind(id)
    .first();
  if (!msg) return json({ error: '留言不存在' }, 404);

  const uid = user ? user.sub : GUEST_UID;
  const existing = await env.DB
    .prepare('SELECT id FROM message_likes WHERE message_id = ? AND user_id = ?')
    .bind(id, uid)
    .first();

  if (existing) {
    // 取消点赞
    await env.DB.prepare('DELETE FROM message_likes WHERE id = ?').bind(existing.id).run();
    await env.DB
      .prepare('UPDATE messages SET likes = MAX(likes - 1, 0) WHERE id = ?')
      .bind(id)
      .run();
    const after = await env.DB.prepare('SELECT likes FROM messages WHERE id = ?').bind(id).first();
    return json({ liked: false, likes: after.likes });
  }

  // 点赞
  await env.DB
    .prepare('INSERT INTO message_likes (message_id, user_id, created_at) VALUES (?, ?, ?)')
    .bind(id, uid, Date.now())
    .run();
  await env.DB
    .prepare('UPDATE messages SET likes = likes + 1 WHERE id = ?')
    .bind(id)
    .run();
  const after = await env.DB.prepare('SELECT likes FROM messages WHERE id = ?').bind(id).first();
  return json({ liked: true, likes: after.likes });
}

// POST /api/messages/:id/replies { content, parent_reply_id? } —— 登录可回复
export async function postReply(request, env, id) {
  const user = await authenticate(request, env);
  if (!user) return json({ error: '请先登录' }, 401);

  const msg = await env.DB
    .prepare('SELECT id FROM messages WHERE id = ?')
    .bind(id)
    .first();
  if (!msg) return json({ error: '留言不存在' }, 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }
  const content = String(body.content || '').trim();
  if (!content) return json({ error: '回复内容不能为空' }, 400);
  if (content.length > MAX_MESSAGE_LEN) {
    return json({ error: `回复最长 ${MAX_MESSAGE_LEN} 字` }, 400);
  }
  let parentReplyId = null;
  if (body.parent_reply_id != null) {
    parentReplyId = Number(body.parent_reply_id);
    if (!Number.isInteger(parentReplyId) || parentReplyId <= 0) {
      return json({ error: '回复目标无效' }, 400);
    }
    const parent = await env.DB
      .prepare('SELECT id FROM message_replies WHERE id = ? AND message_id = ?')
      .bind(parentReplyId, id)
      .first();
    if (!parent) return json({ error: '要回复的楼层不存在' }, 404);
  }

  const res = await env.DB
    .prepare('INSERT INTO message_replies (message_id, user_id, username, content, parent_reply_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, user.sub, user.username, content, parentReplyId, Date.now())
    .run();

  return json({ message: '回复成功', id: res.meta.last_row_id }, 201);
}

// DELETE /api/messages/:id/replies/:rid —— 本人或管理员
export async function deleteReply(request, env, messageId, replyId) {
  const user = await authenticate(request, env);
  if (!user) return json({ error: '请先登录' }, 401);

  const reply = await env.DB
    .prepare('SELECT id, user_id FROM message_replies WHERE id = ? AND message_id = ?')
    .bind(replyId, messageId)
    .first();
  if (!reply) return json({ error: '回复不存在' }, 404);
  if (!isPrivileged(user.role) && Number(reply.user_id) !== Number(user.sub)) {
    return json({ error: '无权删除该回复' }, 403);
  }

  // 级联删除以该回复为父级的子回复（只做一层，防递归）
  await env.DB.prepare('DELETE FROM message_replies WHERE parent_reply_id = ?').bind(replyId).run();
  await env.DB.prepare('DELETE FROM message_replies WHERE id = ?').bind(replyId).run();
  return json({ message: '回复已删除' });
}

// DELETE /api/messages/:id —— 仅管理员
export async function deleteMessage(request, env, id) {
  const user = await authenticate(request, env);
  if (!user) return json({ error: '请先登录' }, 401);
  if (!isPrivileged(user.role)) return json({ error: '无权操作，仅管理员可删除留言' }, 403);

  const msg = await env.DB
    .prepare('SELECT id FROM messages WHERE id = ?')
    .bind(id)
    .first();
  if (!msg) return json({ error: '留言不存在' }, 404);

  await env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM message_likes WHERE message_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM message_replies WHERE message_id = ?').bind(id).run();
  return json({ message: '留言已删除' });
}

// ---------------- 反馈 / 建议 ----------------

// POST /api/feedbacks { kind, content } —— 仅普通用户
export async function postFeedback(request, env) {
  const user = await authenticate(request, env);
  if (!user) return json({ error: '请先登录' }, 401);
  if (user.role !== 'user') {
    return json({ error: '仅普通用户可提交反馈/建议' }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }
  const kind = body.kind;
  if (!FEEDBACK_KINDS.includes(kind)) {
    return json({ error: 'kind 只能是 feedback 或 suggestion' }, 400);
  }
  const content = String(body.content || '').trim();
  if (!content) return json({ error: '内容不能为空' }, 400);
  if (content.length > MAX_FEEDBACK_LEN) {
    return json({ error: `内容最长 ${MAX_FEEDBACK_LEN} 字` }, 400);
  }

  const res = await env.DB
    .prepare('INSERT INTO feedbacks (user_id, username, kind, content, reply, replied_at, created_at) VALUES (?, ?, ?, ?, NULL, NULL, ?)')
    .bind(user.sub, user.username, kind, content, Date.now())
    .run();

  return json({ message: kind === 'feedback' ? '反馈已提交' : '建议已提交', id: res.meta.last_row_id }, 201);
}

// GET /api/feedbacks/my —— 本人提交的记录（含管理员回复）
export async function myFeedbacks(request, env) {
  const user = await authenticate(request, env);
  if (!user) return json({ error: '请先登录' }, 401);

  const rows = await env.DB
    .prepare('SELECT id, kind, content, reply, replied_at, created_at FROM feedbacks WHERE user_id = ? ORDER BY id DESC')
    .bind(user.sub)
    .all();

  return json({ items: (rows.results || []).map((f) => ({
    id: f.id,
    kind: f.kind,
    content: f.content,
    reply: f.reply,
    replied_at: f.replied_at,
    created_at: f.created_at,
  })) });
}

// ---------------- 管理员：反馈/建议管理 ----------------

// GET /api/admin/feedbacks —— 仅管理员级身份，查看全部
export async function adminFeedbacks(request, env) {
  const user = await authenticate(request, env);
  if (!user) return json({ error: '请先登录' }, 401);
  if (!isPrivileged(user.role)) return json({ error: '无权访问' }, 403);

  const url = new URL(request.url);
  const kind = url.searchParams.get('kind'); // 可选过滤 feedback/suggestion
  const pendingOnly = url.searchParams.get('pending') === '1'; // 只看未回复
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') || '3', 10) || 3));
  const offset = (page - 1) * pageSize;
  const conds = [];
  const countConds = [];
  const params = [];
  if (kind === 'feedback' || kind === 'suggestion') { conds.push('f.kind = ?'); countConds.push('kind = ?'); params.push(kind); }
  if (pendingOnly) { conds.push('f.reply IS NULL'); countConds.push('reply IS NULL'); }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
  const countWhere = countConds.length ? ' WHERE ' + countConds.join(' AND ') : '';
  const orderLimit = ' ORDER BY f.id DESC LIMIT ? OFFSET ?';
  const rows = await env.DB
    .prepare('SELECT f.id, f.user_id, f.username, f.kind, f.content, f.reply, f.replied_at, f.created_at, u.username AS current_name FROM feedbacks f LEFT JOIN users u ON u.id = f.user_id' + where + orderLimit)
    .bind(...params, pageSize, offset)
    .all();
  // 总数
  const countRow = await env.DB
    .prepare('SELECT COUNT(*) AS n FROM feedbacks' + countWhere)
    .bind(...params)
    .first();

  const stats = await env.DB
    .prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN reply IS NULL THEN 1 ELSE 0 END) AS pending FROM feedbacks")
    .first();

  return json({
    items: (rows.results || []).map((f) => ({
      id: f.id,
      username: f.current_name || f.username,
      kind: f.kind,
      content: f.content,
      reply: f.reply,
      replied_at: f.replied_at,
      created_at: f.created_at,
    })),
    total: countRow ? (countRow.n || 0) : 0,
    page: page,
    pageSize: pageSize,
    stats: { total: stats.total || 0, pending: stats.pending || 0 },
  });
}

// POST /api/admin/feedbacks/:id/reply { reply } —— 仅管理员级身份回复
export async function replyFeedback(request, env, id) {
  const user = await authenticate(request, env);
  if (!user) return json({ error: '请先登录' }, 401);
  if (!isPrivileged(user.role)) return json({ error: '无权访问' }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }
  const reply = String(body.reply || '').trim();
  if (!reply) return json({ error: '回复内容不能为空' }, 400);
  if (reply.length > MAX_FEEDBACK_LEN) {
    return json({ error: `回复最长 ${MAX_FEEDBACK_LEN} 字` }, 400);
  }

  const item = await env.DB
    .prepare('SELECT id FROM feedbacks WHERE id = ?')
    .bind(id)
    .first();
  if (!item) return json({ error: '记录不存在' }, 404);

  await env.DB
    .prepare('UPDATE feedbacks SET reply = ?, replied_at = ? WHERE id = ?')
    .bind(reply, Date.now(), id)
    .run();

  return json({ message: '回复成功', id });
}

// DELETE /api/admin/feedbacks/:id —— 仅管理员级身份删除
export async function deleteFeedback(request, env, id) {
  const user = await authenticate(request, env);
  if (!user) return json({ error: '请先登录' }, 401);
  if (!isPrivileged(user.role)) return json({ error: '无权访问' }, 403);

  const item = await env.DB
    .prepare('SELECT id FROM feedbacks WHERE id = ?')
    .bind(id)
    .first();
  if (!item) return json({ error: '记录不存在' }, 404);

  await env.DB.prepare('DELETE FROM feedbacks WHERE id = ?').bind(id).run();
  return json({ message: '已删除' });
}

// ---------------- 路由分发 ----------------
// 返回 Response 表示命中社区路由；返回 null 表示非本模块路由。
export async function handleCommunityApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  try {
    // ---- 留言板 ----
    if (path === '/api/messages' && method === 'GET') return await listMessages(request, env);
    if (path === '/api/messages' && method === 'POST') return await postMessage(request, env);

    // ---- 反馈/建议（普通用户） ----
    if (path === '/api/feedbacks' && method === 'POST') return await postFeedback(request, env);
    if (path === '/api/feedbacks/my' && method === 'GET') return await myFeedbacks(request, env);

    // ---- 带 id 的路由 ----
    const parts = path.split('/').filter(Boolean); // ['api', 'messages', ':id', ...] 或 ['api','admin','feedbacks',...]
    if (parts[0] === 'api' && parts[1] === 'messages' && parts.length >= 3) {
      const id = Number(parts[2]);
      if (Number.isInteger(id) && id > 0) {
        if (parts.length === 3 && method === 'DELETE') return await deleteMessage(request, env, id);
        if (parts.length === 4 && parts[3] === 'like' && method === 'POST') return await toggleLike(request, env, id);
        if (parts.length === 4 && parts[3] === 'replies' && method === 'POST') return await postReply(request, env, id);
        if (parts.length === 5 && parts[3] === 'replies' && method === 'DELETE') {
          const rid = Number(parts[4]);
          if (Number.isInteger(rid) && rid > 0) return await deleteReply(request, env, id, rid);
        }
      }
    }
    if (parts[0] === 'api' && parts[1] === 'admin' && parts[2] === 'feedbacks') {
      if (parts.length === 3 && method === 'GET') return await adminFeedbacks(request, env);
      const id = Number(parts[3]);
      if (Number.isInteger(id) && id > 0) {
        if (parts.length === 4 && method === 'DELETE') return await deleteFeedback(request, env, id);
        if (parts.length === 5 && parts[4] === 'reply' && method === 'POST') return await replyFeedback(request, env, id);
      }
    }
  } catch (err) {
    console.error('Community API Error:', err);
    return json({ error: '服务器内部错误' }, 500);
  }
  return null;
}
