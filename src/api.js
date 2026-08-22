// ===================================================================
// api.js — 认证相关接口 & 路由集成示例
// 这些函数可直接并入你现有的 Worker 路由中（单 Worker 架构不变）
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

  // 生成盐与哈希（绝不存明文）
  const { salt, hash } = await makePasswordRecord(password);

  // 写入用户表
  await env.DB
    .prepare(
      'INSERT INTO users (username, salt, password_hash, created_at) VALUES (?, ?, ?, ?)'
    )
    .bind(username, salt, hash, Date.now())
    .run();

  return json({ message: '注册成功' }, 201);
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

  // 查询用户
  const user = await env.DB
    .prepare('SELECT id, username, salt, password_hash FROM users WHERE username = ?')
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

  // 签发 JWT 并通过 HttpOnly Cookie 下发
  const token = await signJWT(
    { sub: user.id, username: user.username },
    env.JWT_SECRET,
    TOKEN_TTL
  );

  return new Response(JSON.stringify({ message: '登录成功' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': buildAuthCookie(token, TOKEN_TTL),
    },
  });
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
  });
}

// ---------------- 路由分发（可插入现有 fetch） ----------------
// 返回 Response 表示命中认证路由；返回 null 表示非认证路由，交由现有路由继续处理。
export async function handleAuthApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  try {
    if (path === '/api/register' && method === 'POST') return await register(request, env);
    if (path === '/api/login' && method === 'POST') return await login(request, env);
    if (path === '/api/logout' && method === 'POST') return await logout(request, env);
    if (path === '/api/me' && method === 'GET') return await me(request, env);
  } catch (err) {
    // 统一错误处理：避免敏感信息泄露，只返回通用信息
    console.error('Auth API Error:', err);
    return json({ error: '服务器内部错误' }, 500);
  }
  return null; // 不是认证路由，交给现有路由
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
