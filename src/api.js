// ===================================================================
// api.js — 认证接口 & 管理员系统（单 Worker 架构不变）
// 角色体系：users.role ∈ { 'user', 'admin' }
//   - 内置管理员账号 zelm / zhouyuchao（首次 /api 请求时自动 seed）
//   - admin 拥有 /api/admin/* 管理接口权限
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

// 合法角色
const ROLES = ['user', 'admin'];

// ===================================================================
// 内置管理员（seed）：zelm / zhouyuchao
// 密码经 PBKDF2-SHA256(100000 轮, 16 字节盐) 预计算，硬编码避免运行时开销。
// 每次 /api 请求自动 INSERT OR IGNORE（幂等）：账号被删后下次请求自动重建。
// 注意：改密码后必须删除库里已存在的 zelm，seed 才会用新密码重建。
// ===================================================================
const SEED_ADMIN = {
  username: 'zelm',
  salt: '4SUCiiJF8KKekgV2Z1eNjA',
  hash: 'jG1B2L3hzncu6q05orfrhry-bTHj3CZPVLf4QaXmvVI',
  role: 'admin',
};

// 每次 /api 请求都会调用（INSERT OR IGNORE 幂等，约一条查询的开销）：
// 保证内置管理员 zelm 始终存在——即使被误删，下一次请求也会自动重建（自愈）。
async function ensureSeed(env) {
  await env.DB
    .prepare('INSERT OR IGNORE INTO users (username, salt, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(SEED_ADMIN.username, SEED_ADMIN.salt, SEED_ADMIN.hash, SEED_ADMIN.role, Date.now())
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

  // 查询用户（含角色）
  const user = await env.DB
    .prepare('SELECT id, username, salt, password_hash, role FROM users WHERE username = ?')
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

  // 签发 JWT（携带角色，管理台判断用）并通过 HttpOnly Cookie 下发
  const token = await signJWT(
    { sub: user.id, username: user.username, role: user.role },
    env.JWT_SECRET,
    TOKEN_TTL
  );

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
  const user = await authenticate(request, env);
  if (!user) {
    return json({ error: '未登录' }, 401);
  }
  return json({
    id: user.sub,
    username: user.username,
    role: user.role || 'user',
  });
}

// ===================================================================
// 管理员系统 —— 以下接口仅 role === 'admin' 可访问
// ===================================================================

// 管理员鉴权：返回 { user } / { code: 401 }（未登录）/ { code: 403 }（非管理员）
async function getAdminUser(request, env) {
  const user = await authenticate(request, env);
  if (!user) return { code: 401 };
  if (user.role !== 'admin') return { code: 403 };
  return { user };
}

// 从 /api/admin/users/:id 中取出 :id，非法返回 null
// 兼容 4 段（/api/admin/users/:id）与 5 段（/api/admin/users/:id/password）路径
function parseUserId(url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api','admin','users',':id'（,'password']）
  if (parts.length < 4 || parts[0] !== 'api' || parts[1] !== 'admin' || parts[2] !== 'users') {
    return null;
  }
  if (parts.length === 5 && parts[4] !== 'password') return null;
  const id = Number(parts[3]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// ---------------- GET /api/admin/users —— 用户列表 + 统计 ----------------
export async function adminListUsers(request, env) {
  const auth = await getAdminUser(request, env);
  if (auth.code) return json({ error: auth.code === 401 ? '请先登录' : '无权访问' }, auth.code);

  const users = await env.DB
    .prepare('SELECT id, username, role, created_at FROM users ORDER BY id ASC')
    .all();
  const stats = await env.DB
    .prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS admins FROM users")
    .first();

  return json({
    users: (users.results || []).map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      created_at: u.created_at,
    })),
    stats: { total: stats.total || 0, admins: stats.admins || 0 },
  });
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
    return json({ error: '角色只能是 user 或 admin' }, 400);
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

  // 不允许降级/撤销最后一位管理员
  if (target.role === 'admin' && role === 'user') {
    const { n } = await env.DB
      .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'")
      .first();
    if (n <= 1) return json({ error: '不能撤销最后一位管理员' }, 400);
  }

  await env.DB
    .prepare('UPDATE users SET role = ? WHERE id = ?')
    .bind(role, id)
    .run();

  return json({ message: '已更新角色', id, username: target.username, role });
}

// ---------------- POST /api/admin/users/:id/password —— 重置密码 ----------------
export async function adminResetPassword(request, env, id) {
  const auth = await getAdminUser(request, env);
  if (auth.code) return json({ error: auth.code === 401 ? '请先登录' : '无权访问' }, auth.code);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }
  const password = body.password || '';
  if (password.length < 8) {
    return json({ error: '新密码长度至少 8 位' }, 400);
  }

  const target = await env.DB
    .prepare('SELECT id, username FROM users WHERE id = ?')
    .bind(id)
    .first();
  if (!target) return json({ error: '用户不存在' }, 404);

  const { salt, hash } = await makePasswordRecord(password);
  await env.DB
    .prepare('UPDATE users SET salt = ?, password_hash = ? WHERE id = ?')
    .bind(salt, hash, id)
    .run();

  return json({ message: '密码已重置', id, username: target.username });
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
  // 不允许删除最后一位管理员
  if (target.role === 'admin') {
    const { n } = await env.DB
      .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'")
      .first();
    if (n <= 1) return json({ error: '不能删除最后一位管理员' }, 400);
  }

  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  return json({ message: '用户已删除', id, username: target.username });
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
