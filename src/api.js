// ===================================================================
// api.js — 认证接口 & 管理员系统（单 Worker 架构不变）
// 角色体系：users.role ∈ { 'user', 'admin', 'owner' }
//   - owner（最高管理员/站长）：全站唯一，账号 zelm，比 admin 权限更高，
//     可管理所有账号（含提升/降级/冻结/删除其他管理员）；不可被修改。
//   - admin：拥有 /api/admin/* 管理接口权限；不能互相修改身份、不能冻结/删除其他管理员。
//   - 内置账号 zelm 首次 /api 请求时自动 seed（role = owner，幂等自愈）。
// ===================================================================

import {
  makePasswordRecord,
  verifyPassword,
  signJWT,
  buildAuthCookie,
  authenticate,
  json,
} from './auth.js';

// Token 有效期（秒）：7 天
const TOKEN_TTL = 60 * 60 * 24 * 7;

// 会话「在线」判定：超过该时长（毫秒）无心跳即视为离线（前端每 15 秒心跳一次）
// 防止「没点登出就关闭页面」的残留记录永久占用登录名额
const SESSION_STALE_MS = 5 * 60 * 1000; // 5 分钟

// 合法角色（API 可赋值的角色；owner 为固定最高身份，不可通过接口授予）
const ROLES = ['user', 'admin'];

// 是否为管理员级身份（admin / owner）
function isPrivileged(role) { return role === 'admin' || role === 'owner'; }

// ===================================================================
// 内置最高管理员（seed）：zelm，role = owner（全站唯一）
// 密码经 PBKDF2-SHA256(100000 轮, 16 字节盐) 预计算，硬编码避免运行时开销。
// 每次 /api 请求自动 INSERT OR IGNORE（幂等）：账号被删后下次请求自动重建。
// 注意：改密码后必须删除库里已存在的 zelm，seed 才会用新密码重建。
// ===================================================================
const SEED_ADMIN = {
  username: 'zelm',
  salt: '4SUCiiJF8KKekgV2Z1eNjA',
  hash: 'jG1B2L3hzncu6q05orfrhry-bTHj3CZPVLf4QaXmvVI',
  role: 'owner',
};

// 每次 /api 请求都会调用（INSERT OR IGNORE 幂等，约一条查询的开销）：
// 保证内置管理员 zelm 始终存在——即使被误删，下一次请求也会自动重建（自愈）。
async function ensureSeed(env) {
  await env.DB
    .prepare('INSERT OR IGNORE INTO users (username, salt, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(SEED_ADMIN.username, SEED_ADMIN.salt, SEED_ADMIN.hash, SEED_ADMIN.role, Date.now())
    .run();
  // 自愈：zelm 必须是 owner，且 owner 全站唯一（其余 owner 降回 admin）
  await env.DB
    .prepare("UPDATE users SET role = 'owner' WHERE username = ? AND role <> 'owner'")
    .bind(SEED_ADMIN.username)
    .run();
  await env.DB
    .prepare("UPDATE users SET role = 'admin' WHERE role = 'owner' AND username <> ?")
    .bind(SEED_ADMIN.username)
    .run();
}

// ---------------- 注册 ----------------
export async function register(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }
  const username = (body.username || '').trim();
  const password = body.password || '';

  // 入参校验
  if (!username || !password) {
    return json({ error: '用户名和密码不能为空' }, 400);
  }
  if (username.length < 3 || username.length > 32) {
    return json({ error: '用户名长度需为 3-32 个字符' }, 400);
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return json({ error: '用户名仅支持字母、数字和下划线' }, 400);
  }
  if (password.length < 8) {
    return json({ error: '密码长度至少 8 位' }, 400);
  }

  // 校验用户名唯一性
  const exists = await env.DB
    .prepare('SELECT id FROM users WHERE username = ?')
    .bind(username)
    .first();
  if (exists) {
    return json({ error: '该用户名已被注册' }, 409);
  }

  // 普通注册用户固定为 user 角色；管理员仅内置 zelm 或由管理员提升
  const role = 'user';

  // 生成盐与哈希（绝不存明文）
  const { salt, hash } = await makePasswordRecord(password);

  // 写入用户表
  await env.DB
    .prepare(
      'INSERT INTO users (username, salt, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(username, salt, hash, role, Date.now())
    .run();

  return json({ message: '注册成功', role }, 201);
}

// ---------------- 登录 ----------------
export async function login(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }
  const username = (body.username || '').trim();
  const password = body.password || '';

  if (!username || !password) {
    return json({ error: '用户名和密码不能为空' }, 400);
  }

  // 查询用户（含角色、冻结状态）
  const user = await env.DB
    .prepare('SELECT id, username, salt, password_hash, role, suspended FROM users WHERE username = ?')
    .bind(username)
    .first();

  // 用户不存在或密码错误（统一返回 401，避免泄露用户名是否存在）
  if (!user) {
    return json({ error: '用户名或密码错误' }, 401);
  }
  const ok = await verifyPassword(password, user.salt, user.password_hash);
  if (!ok) {
    return json({ error: '用户名或密码错误' }, 401);
  }

  // 账号被冻结
  if (user.suspended) {
    return json({ error: '账号已被冻结，请联系管理员' }, 403);
  }

  // 单端登录：检测是否已有活跃会话（未强制顶号时）
  const force = !!body.force;
  try {
    if (!force) {
      // 先清理「长时间无心跳」的陈旧会话（用户没点登出就关了页面会残留记录，
      // 视为已离线，自动释放登录名额，避免任何账号都被误判为“已在别处登录”）
      await env.DB
        .prepare('DELETE FROM sessions WHERE user_id = ? AND last_seen < ?')
        .bind(user.id, Date.now() - SESSION_STALE_MS)
        .run();
      const existing = await env.DB
        .prepare('SELECT id FROM sessions WHERE user_id = ? LIMIT 1')
        .bind(user.id)
        .first();
      if (existing) {
        return json({ conflict: true, message: '该账号已在其他设备登录' }, 409);
      }
    }
  } catch (e) {
    // sessions 表缺失（未迁移）等数据库错误：给出可操作的提示，避免被统一 500 吞掉
    return json(
      { error: '数据库未初始化：请先执行 wrangler d1 execute auth-db --remote --file=./migration-add-sessions.sql' },
      500
    );
  }

  // 先生成会话 id 并签发 JWT：失败则直接返回、不写任何会话记录，
  // 避免「签名失败但 session 已插入」导致下次登录被误判为已在别处登录
  const sid = crypto.randomUUID();
  let token;
  try {
    token = await signJWT(
      { sub: user.id, username: user.username, role: user.role, sid },
      env.JWT_SECRET,
      TOKEN_TTL
    );
  } catch (e) {
    console.error('login signJWT error:', e);
    return json({ error: '服务端配置错误：JWT_SECRET 未设置或无效，请运行 wrangler secret put JWT_SECRET' }, 500);
  }

  // 签名成功后：清理旧会话并写入本次会话（单端登录顶号）
  try {
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
    await env.DB
      .prepare('INSERT INTO sessions (id, user_id, device, created_at, last_seen) VALUES (?, ?, ?, ?, ?)')
      .bind(sid, user.id, body.device || 'web', Date.now(), Date.now())
      .run();
  } catch (e) {
    // 会话写入失败不影响本次登录，但下次登录会重新建会话
    console.error('login session write error:', e);
  }

  return new Response(
    JSON.stringify({ message: '登录成功', username: user.username, role: user.role }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': buildAuthCookie(token, TOKEN_TTL),
      },
    }
  );
}

// ---------------- 登出 ----------------
export async function logout(request, env) {
  // 删除服务端会话记录，释放单端登录名额
  const payload = await authenticate(request, env);
  if (payload && payload.sid) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(payload.sid).run().catch(() => {});
  }
  // 将 Cookie 的 Max-Age 置 0，浏览器立即清除
  return new Response(JSON.stringify({ message: '已登出' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': 'token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
    },
  });
}

// ---------------- 获取当前登录用户 ----------------
export async function me(request, env) {
  const user = await verifySession(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  if (user.kicked) return json({ kicked: true, message: '账号已在其他设备登录' }, 401);
  // 拉取最新 nickname（显示名可能已被修改，JWT 里只有登录名）
  let nickname = null;
  try {
    const row = await env.DB.prepare('SELECT nickname FROM users WHERE id = ?').bind(Number(user.sub)).first();
    if (row && row.nickname) nickname = row.nickname;
  } catch (e) { /* 表未迁移时回退 username */ }
  return json({
    id: user.sub,
    username: user.username,
    nickname: nickname || user.username,
    role: user.role || 'user',
  });
}

// ---------------- PATCH /api/me/nickname —— 当前登录用户修改显示名（昵称） ----------------
// 三种角色（user / admin / owner）通用；昵称允许汉字、唯一、1-20 字符
export async function changeNickname(request, env) {
  const user = await authenticate(request, env);
  if (!user) return json({ error: '未登录' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';

  if (!nickname) {
    return json({ error: '名字不能为空' }, 400);
  }
  if (nickname.length > 20) {
    return json({ error: '名字长度不能超过 20 个字符' }, 400);
  }
  // 允许汉字、字母、数字、下划线、连字符、空格（不能是纯空格）
  if (!/^[\u4e00-\u9fa5A-Za-z0-9_\- ]+$/.test(nickname)) {
    return json({ error: '名字仅支持汉字、字母、数字、下划线、连字符和空格' }, 400);
  }

  // 唯一性校验（排除自己）
  const dup = await env.DB
    .prepare('SELECT id FROM users WHERE nickname = ? AND id <> ?')
    .bind(nickname, Number(user.sub))
    .first();
  if (dup) return json({ error: '这个名字已被使用，请换一个' }, 409);

  try {
    await env.DB.prepare('UPDATE users SET nickname = ? WHERE id = ?').bind(nickname, Number(user.sub)).run();
  } catch (e) {
    // 唯一索引兜底（并发场景）
    return json({ error: '这个名字已被使用，请换一个' }, 409);
  }
  return json({ message: '名字已更新', nickname });
}

// ---------------- POST /api/change-password —— 当前登录用户修改密码 ----------------
export async function changePassword(request, env) {
  const user = await authenticate(request, env);
  if (!user) return json({ error: '未登录' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }
  const oldPassword = body.oldPassword || '';
  const newPassword = body.newPassword || '';

  if (!oldPassword || !newPassword) {
    return json({ error: '旧密码和新密码不能为空' }, 400);
  }
  if (newPassword.length < 8) {
    return json({ error: '新密码长度至少 8 位' }, 400);
  }

  const row = await env.DB
    .prepare('SELECT salt, password_hash FROM users WHERE id = ?')
    .bind(Number(user.sub))
    .first();
  if (!row) return json({ error: '用户不存在' }, 404);

  const ok = await verifyPassword(oldPassword, row.salt, row.password_hash);
  if (!ok) return json({ error: '旧密码错误' }, 401);

  const { salt, hash } = await makePasswordRecord(newPassword);
  await env.DB
    .prepare('UPDATE users SET salt = ?, password_hash = ? WHERE id = ?')
    .bind(salt, hash, Number(user.sub))
    .run();

  return json({ message: '密码已修改' });
}

// ===================================================================
// 管理员系统 —— 以下接口仅 role === 'admin' 可访问
// ===================================================================

// 管理员鉴权：返回 { user } / { code: 401 }（未登录）/ { code: 403 }（非管理员）
async function getAdminUser(request, env) {
  const user = await authenticate(request, env);
  if (!user) return { code: 401 };
  if (!isPrivileged(user.role)) return { code: 403 };
  return { user };
}

// owner 是否存在于系统中（用于"最后一位管理员"保护：有 owner 时允许清空 admin）
async function ownerExists(env) {
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner' AND suspended = 0").first();
  return (n || 0) > 0;
}

// 从 /api/admin/users/:id 中取出 :id，非法返回 null
// 兼容 4 段（/api/admin/users/:id）与 5 段（/api/admin/users/:id/password）路径
function parseUserId(url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api','admin','users',':id'（,'password'|'suspend']）
  if (parts.length < 4 || parts[0] !== 'api' || parts[1] !== 'admin' || parts[2] !== 'users') {
    return null;
  }
  if (parts.length === 5 && !['password', 'suspend'].includes(parts[4])) return null;
  const id = Number(parts[3]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// ---------------- GET /api/admin/users —— 用户列表 + 统计 ----------------
export async function adminListUsers(request, env) {
  const auth = await getAdminUser(request, env);
  if (auth.code) return json({ error: auth.code === 401 ? '请先登录' : '无权访问' }, auth.code);

  const users = await env.DB
    .prepare('SELECT id, username, nickname, role, suspended, created_at FROM users ORDER BY id ASC')
    .all();
  // 在线判定：最近 SESSION_STALE_MS 内有心跳（前端每 15 秒心跳一次）
  const onlineRows = await env.DB
    .prepare('SELECT DISTINCT user_id FROM sessions WHERE last_seen >= ?')
    .bind(Date.now() - SESSION_STALE_MS)
    .all();
  const onlineSet = new Set((onlineRows.results || []).map((r) => r.user_id));
  const stats = await env.DB
    .prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN role IN ('admin','owner') THEN 1 ELSE 0 END) AS admins, SUM(CASE WHEN suspended = 1 THEN 1 ELSE 0 END) AS suspended FROM users")
    .first();

  return json({
    users: (users.results || []).map((u) => ({
      id: u.id,
      username: u.username,
      nickname: u.nickname || u.username,
      role: u.role,
      suspended: !!u.suspended,
      online: onlineSet.has(u.id),
      created_at: u.created_at,
    })),
    stats: { total: stats.total || 0, admins: stats.admins || 0, suspended: stats.suspended || 0 },
  });
}

// ---------------- POST /api/admin/users/:id/kick —— 站长踢下线（仅 owner） ----------------
export async function adminKickUser(request, env, id) {
  const auth = await getAdminUser(request, env);
  if (auth.code) return json({ error: auth.code === 401 ? '请先登录' : '无权访问' }, auth.code);
  if (auth.user.role !== 'owner') {
    return json({ error: '仅站长可踢用户下线' }, 403);
  }
  const uid = Number(id);
  if (!uid) return json({ error: '用户不存在' }, 404);
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(uid).run();
  return json({ ok: true, message: '已将该账号踢下线' });
}

// ---------------- PATCH /api/admin/users/:id —— 修改角色 ----------------
export async function adminUpdateRole(request, env, id) {
  const auth = await getAdminUser(request, env);
  if (auth.code) return json({ error: auth.code === 401 ? '请先登录' : '无权访问' }, auth.code);
  const me = auth.user;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }
  const role = body.role;
  if (!ROLES.includes(role)) {
    return json({ error: '角色只能是 user 或 admin（最高管理员不可通过接口授予）' }, 400);
  }

  const target = await env.DB
    .prepare('SELECT id, username, role FROM users WHERE id = ?')
    .bind(id)
    .first();
  if (!target) return json({ error: '用户不存在' }, 404);

  // 不允许自己给自己改角色（防止把自己降级导致失去管理员）
  if (Number(me.sub) === id) {
    return json({ error: '不能修改自己的角色' }, 400);
  }

  // 最高管理员（owner）不可被任何账号修改
  if (target.role === 'owner') {
    return json({ error: '最高管理员不可被修改' }, 403);
  }

  // 普通管理员之间不能互相修改身份；提升/降级管理员仅站长（owner）可操作
  if (me.role !== 'owner' && (target.role === 'admin' || role === 'admin')) {
    return json({ error: '仅最高管理员可修改管理员身份' }, 403);
  }

  // 允许降级最后一位管理员的前提是系统中存在 owner（有站长兜底）
  if (target.role === 'admin' && role === 'user') {
    const { n } = await env.DB
      .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'")
      .first();
    const hasOwner = await ownerExists(env);
    if (n <= 1 && !hasOwner) return json({ error: '不能撤销最后一位管理员' }, 400);
  }

  await env.DB
    .prepare('UPDATE users SET role = ? WHERE id = ?')
    .bind(role, id)
    .run();

  return json({ message: '已更新角色', id, username: target.username, role });
}

// ---------------- POST /api/admin/users/:id/password —— 重置密码 ----------------
// body: { password?: string, reveal?: boolean }
//   - 普通重置（admin/owner）：传入 password 重置为该值（≥8 位），不返回明文
//   - 站长查看密码（owner only）：reveal:true 自动生成 12 位随机密码并返回明文 newPassword
export async function adminResetPassword(request, env, id) {
  const auth = await getAdminUser(request, env);
  if (auth.code) return json({ error: auth.code === 401 ? '请先登录' : '无权访问' }, auth.code);
  const me = auth.user;
  const isOwner = me.role === 'owner';

  // 不能重置自己的密码（避免锁死）
  if (Number(me.id) === Number(id)) return json({ error: '不能重置自己的密码' }, 400);

  let body = {};
  try { body = await request.json(); } catch { /* 允许空 body（reveal 模式） */ }
  const reveal = body.reveal === true;
  const providedPassword = (body.password || '').trim();

  if (reveal && !isOwner) return json({ error: '只有站长可以查看/重置密码' }, 403);

  let password = providedPassword;
  if (reveal) {
    if (!password) password = generateRandomPassword(12);
  } else {
    if (password.length < 8) return json({ error: '新密码长度至少 8 位' }, 400);
  }

  const target = await env.DB
    .prepare('SELECT id, username, role FROM users WHERE id = ?')
    .bind(id)
    .first();
  if (!target) return json({ error: '用户不存在' }, 404);
  // 不能重置站长自己的密码（双重保护）
  if (target.role === 'owner') return json({ error: '不能重置最高管理员的密码' }, 403);
  // 管理员不能给管理员重置密码，重置密码仅站长可操作
  if (me.role !== 'owner' && target.role === 'admin') {
    return json({ error: '仅站长可重置管理员的密码' }, 403);
  }

  const { salt, hash } = await makePasswordRecord(password);
  await env.DB
    .prepare('UPDATE users SET salt = ?, password_hash = ? WHERE id = ?')
    .bind(salt, hash, id)
    .run();

  return json({
    message: reveal ? '已生成新密码，仅显示一次' : '密码已重置',
    id,
    username: target.username,
    ...(reveal ? { newPassword: password } : {})
  });
}

// 生成 12 位随机密码（去掉易混字符 0/O/1/l/I），使用加密随机
function generateRandomPassword(len = 12) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  let pwd = '';
  for (let i = 0; i < len; i++) pwd += chars[arr[i] % chars.length];
  return pwd;
}

// ---------------- PATCH /api/admin/users/:id/suspend —— 冻结/解冻用户 ----------------
export async function adminToggleSuspend(request, env, id) {
  const auth = await getAdminUser(request, env);
  if (auth.code) return json({ error: auth.code === 401 ? '请先登录' : '无权访问' }, auth.code);
  const me = auth.user;

  if (Number(me.sub) === id) {
    return json({ error: '不能冻结自己的账号' }, 400);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }
  const suspended = body.suspended === true || body.suspended === 1 ? 1 : 0;

  const target = await env.DB
    .prepare('SELECT id, username, role, suspended FROM users WHERE id = ?')
    .bind(id)
    .first();
  if (!target) return json({ error: '用户不存在' }, 404);

  // 最高管理员不可被冻结
  if (target.role === 'owner') {
    return json({ error: '最高管理员不可被冻结' }, 403);
  }
  // 普通管理员不能冻结其他管理员
  if (me.role !== 'owner' && isPrivileged(target.role)) {
    return json({ error: '仅最高管理员可冻结管理员' }, 403);
  }

  // 不允许冻结最后一位活跃管理员（有 owner 时允许）
  if (target.role === 'admin' && suspended === 1) {
    const { n } = await env.DB
      .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND suspended = 0")
      .first();
    const hasOwner = await ownerExists(env);
    if (n <= 1 && !hasOwner) return json({ error: '不能冻结最后一位活跃管理员' }, 400);
  }

  await env.DB
    .prepare('UPDATE users SET suspended = ? WHERE id = ?')
    .bind(suspended, id)
    .run();

  return json({ message: suspended ? '账号已冻结' : '账号已解冻', id, username: target.username, suspended: !!suspended });
}

// ---------------- DELETE /api/admin/users/:id —— 删除用户 ----------------
export async function adminDeleteUser(request, env, id) {
  const auth = await getAdminUser(request, env);
  if (auth.code) return json({ error: auth.code === 401 ? '请先登录' : '无权访问' }, auth.code);
  const me = auth.user;

  const target = await env.DB
    .prepare('SELECT id, username, role FROM users WHERE id = ?')
    .bind(id)
    .first();
  if (!target) return json({ error: '用户不存在' }, 404);

  // 不允许删除自己
  if (Number(me.sub) === id) {
    return json({ error: '不能删除自己的账号' }, 400);
  }
  // 最高管理员不可被删除
  if (target.role === 'owner') {
    return json({ error: '最高管理员不可被删除' }, 403);
  }
  // 删除用户账号仅站长（owner）可操作，管理员不可删除任何账号
  if (me.role !== 'owner') {
    return json({ error: '仅站长可删除用户账号' }, 403);
  }
  // 不允许删除最后一位管理员（有 owner 时允许）
  if (target.role === 'admin') {
    const { n } = await env.DB
      .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'")
      .first();
    const hasOwner = await ownerExists(env);
    if (n <= 1 && !hasOwner) return json({ error: '不能删除最后一位管理员' }, 400);
  }

  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  return json({ message: '用户已删除', id, username: target.username });
}

// ---------------- 会话校验（单端登录） ----------------
// 校验 JWT 并核对 sessions 表：签名无效返回 null；会话已被顶号（记录不存在）返回 { kicked: true }
async function verifySession(request, env) {
  const payload = await authenticate(request, env);
  if (!payload) return null;
  const sid = payload.sid;
  if (!sid) return payload; // 旧令牌无 sid，放行
  const row = await env.DB
    .prepare('SELECT id FROM sessions WHERE id = ? AND user_id = ?')
    .bind(sid, Number(payload.sub))
    .first();
  if (!row) return { kicked: true };
  // 心跳：刷新 last_seen，便于未来清理僵尸会话
  await env.DB
    .prepare('UPDATE sessions SET last_seen = ? WHERE id = ?')
    .bind(Date.now(), sid)
    .run()
    .catch(() => {});
  return payload;
}

// 单端登录：当前设备会话是否仍有效
export async function sessionCheck(request, env) {
  const user = await verifySession(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  if (user.kicked) return json({ kicked: true, message: '账号已在其他设备登录' }, 401);
  let nickname = null;
  try {
    const row = await env.DB.prepare('SELECT nickname FROM users WHERE id = ?').bind(Number(user.sub)).first();
    if (row && row.nickname) nickname = row.nickname;
  } catch (e) { /* 表未迁移时回退 username */ }
  return json({ ok: true, id: user.sub, username: user.username, nickname: nickname || user.username, role: user.role || 'user' });
}

// ---------------- 播放进度持久化（按账号） ----------------
export async function getPlayback(request, env) {
  const user = await verifySession(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  if (user.kicked) return json({ kicked: true }, 401);
  const row = await env.DB
    .prepare('SELECT track_index, position, mode FROM playback_state WHERE user_id = ?')
    .bind(Number(user.sub))
    .first();
  if (!row) return json({ has: false });
  return json({ has: true, track_index: row.track_index, position: row.position, mode: row.mode });
}

export async function savePlayback(request, env) {
  const user = await verifySession(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  if (user.kicked) return json({ kicked: true }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: '请求体格式错误' }, 400); }
  const idx = Math.max(0, Math.min(999, Math.floor(Number(body.track_index) || 0)));
  const pos = Math.max(0, Number(body.position) || 0);
  const mode = ['order', 'shuffle', 'loop'].includes(body.mode) ? body.mode : 'order';
  await env.DB
    .prepare(`INSERT INTO playback_state (user_id, track_index, position, mode, updated_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET
                track_index = excluded.track_index,
                position = excluded.position,
                mode = excluded.mode,
                updated_at = excluded.updated_at`)
    .bind(Number(user.sub), idx, pos, mode, Date.now())
    .run();
  return json({ ok: true });
}

// ---------------- 路由分发（可插入现有 fetch） ----------------
// 返回 Response 表示命中认证/管理路由；返回 null 表示非本模块路由，交由现有路由继续处理。
export async function handleAuthApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // 确保内置管理员 zelm 已存在（幂等，仅首次真正写库）
  try {
    await ensureSeed(env);
  } catch (_) {
    // seed 失败不阻塞认证流程（避免账号系统整体不可用）
  }

  try {
    // ---- 认证路由 ----
    if (path === '/api/register' && method === 'POST') return await register(request, env);
    if (path === '/api/login' && method === 'POST') return await login(request, env);
    if (path === '/api/logout' && method === 'POST') return await logout(request, env);
    if (path === '/api/me' && method === 'GET') return await me(request, env);
    if (path === '/api/session/check' && method === 'GET') return await sessionCheck(request, env);
    if (path === '/api/playback' && method === 'GET') return await getPlayback(request, env);
    if (path === '/api/playback' && method === 'POST') return await savePlayback(request, env);
    if (path === '/api/change-password' && method === 'POST') return await changePassword(request, env);
    if (path === '/api/me/nickname' && method === 'PATCH') return await changeNickname(request, env);

    // ---- 管理员路由 ----
    if (path === '/api/admin/users' && method === 'GET') return await adminListUsers(request, env);

    const id = parseUserId(url);
    if (id !== null) {
      if (path === `/api/admin/users/${id}` && method === 'PATCH') {
        return await adminUpdateRole(request, env, id);
      }
      if (path === `/api/admin/users/${id}` && method === 'DELETE') {
        return await adminDeleteUser(request, env, id);
      }
      if (path === `/api/admin/users/${id}/password` && method === 'POST') {
        return await adminResetPassword(request, env, id);
      }
      if (path === `/api/admin/users/${id}/suspend` && method === 'PATCH') {
        return await adminToggleSuspend(request, env, id);
      }
      if (path === `/api/admin/users/${id}/kick` && method === 'POST') {
        return await adminKickUser(request, env, id);
      }
    }
  } catch (err) {
    // 统一错误处理：避免敏感信息泄露，只返回通用信息
    console.error('Auth API Error:', err);
    return json({ error: '服务器内部错误' }, 500);
  }
  return null; // 不是本模块路由，交给现有路由
}

// ---------------- 受保护接口示例（鉴权中间件用法） ----------------
// 复制此模式即可为任意接口加登录校验
export async function exampleProtectedApi(request, env) {
  const user = await authenticate(request, env);
  if (!user) {
    return json({ error: '请先登录' }, 401);
  }
  // user.sub / user.username 已可用
  return json({ message: `你好，${user.username}！这是受保护的数据。` });
}
