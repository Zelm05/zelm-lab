// ===================================================================
// auth.js — 认证工具模块（纯原生实现，零第三方依赖）
// 依赖环境：Cloudflare Workers（全局提供 crypto / btoa / atob）
// 提供能力：
//   1) 密码加盐哈希       —— Web Crypto API 的 PBKDF2-SHA256
//   2) JWT 签发 / 校验    —— 原生 HMAC-SHA256
//   3) Cookie 解析 / 生成 —— HttpOnly + Secure + SameSite
//   4) 鉴权中间件         —— authenticate()
// ===================================================================

// ---------- 配置常量 ----------
// PBKDF2 迭代次数：安全与性能的平衡点。
// ⚠️ 免费版 Cloudflare Workers 单请求 CPU 时间约 10ms，迭代过高会触发 CPU 超时。
//    若部署后报 CPU 超时，可下调到 30000；或升级 Workers Paid（$5/月，CPU 50ms）。
const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 16;   // 盐长度 16 字节 = 128 位
const HASH_BITS = 256;   // 哈希输出 256 位

// ---------- 基础工具：Base64URL 编解码 ----------
// JWT 使用 URL 安全的 Base64（去掉 + / = 这三个在 URL 中有特殊含义的字符）

export function bytesToBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToBytes(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function strToBase64Url(str) {
  return bytesToBase64Url(new TextEncoder().encode(str));
}

function base64UrlToStr(str) {
  return new TextDecoder().decode(base64UrlToBytes(str));
}

// ---------- 常量时间字符串比较（防时序攻击） ----------
function constantTimeCompare(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ---------- 密码哈希（PBKDF2 + 随机盐） ----------

// 生成随机盐（16 字节）
export function generateSalt() {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

// 对密码做 PBKDF2-SHA256 哈希，返回 256 位二进制
export async function hashPassword(password, saltBytes) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    HASH_BITS
  );
  return new Uint8Array(bits);
}

// 便捷方法：传入明文密码，返回 { salt(字符串), hash(字符串) } 可直接入库
export async function makePasswordRecord(password) {
  const salt = generateSalt();
  const hash = await hashPassword(password, salt);
  return {
    salt: bytesToBase64Url(salt),
    hash: bytesToBase64Url(hash),
  };
}

// 验证明文密码是否与库中记录一致
export async function verifyPassword(password, saltStr, hashStr) {
  const salt = base64UrlToBytes(saltStr);
  const computed = await hashPassword(password, salt);
  const computedStr = bytesToBase64Url(computed);
  if (computedStr.length !== hashStr.length) return false;
  return constantTimeCompare(computedStr, hashStr);
}

// ---------- JWT（原生 HMAC-SHA256） ----------

// 用 HMAC-SHA256 对数据签名，返回二进制签名
export async function hmacSign(data, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return new Uint8Array(sig);
}

// 签发 JWT。payload 至少包含用户标识；默认 7 天有效期
export async function signJWT(payload, secret, expiresInSeconds = 60 * 60 * 24 * 7) {
  if (!secret || typeof secret !== 'string') {
    throw new Error('JWT_SECRET is not configured');
  }
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,          // 签发时间
    exp: now + expiresInSeconds, // 过期时间
  };
  const h = strToBase64Url(JSON.stringify(header));
  const p = strToBase64Url(JSON.stringify(fullPayload));
  const data = `${h}.${p}`;
  const sig = await hmacSign(data, secret);
  const s = bytesToBase64Url(sig);
  return `${data}.${s}`;
}

// 校验 JWT：验证签名 + 有效期，成功返回 payload，失败返回 null
export async function verifyJWT(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [h, p, s] = parts;
  const data = `${h}.${p}`;

  // 重新计算签名并做常量时间比较（防伪造）
  const expectedSig = await hmacSign(data, secret);
  const expectedStr = bytesToBase64Url(expectedSig);
  if (!constantTimeCompare(expectedStr, s)) return null;

  // 解析并校验 payload
  let payload;
  try {
    payload = JSON.parse(base64UrlToStr(p));
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now) return null;

  return payload;
}

// ---------- Cookie 解析 ----------
export function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    cookies[k] = decodeURIComponent(v);
  }
  return cookies;
}

// 生成 Set-Cookie 头（HttpOnly + Secure + SameSite）
// localhost/127.0.0.1（本地 wrangler dev 走 http）不加 Secure，否则本地浏览器不保存 cookie 导致登录失效
export function buildAuthCookie(token, maxAgeSeconds, request) {
  let host = '';
  try { host = (request && request.headers && request.headers.get('host')) || ''; } catch (e) { /* 忽略 */ }
  const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host.startsWith('localhost:') || host.startsWith('127.0.0.1:');
  const attrs = [
    `token=${token}`,
    'HttpOnly',          // JS 无法读取，防 XSS 窃取
    ...(isLocalhost ? [] : ['Secure']),  // 仅 HTTPS 传输（生产/workers.dev 均满足）；本地 http 豁免
    'SameSite=Strict',   // 防 CSRF；要求前端与 API 同源
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
  ];
  return attrs.join('; ');
}

// ---------- 鉴权中间件 ----------
// 从请求 Cookie 中取出 token 并校验，返回 payload（含 sub/username）或 null
export async function authenticate(request, env) {
  const cookieHeader = request.headers.get('Cookie');
  const cookies = parseCookies(cookieHeader);
  const token = cookies.token;
  if (!token) return null;
  return await verifyJWT(token, env.JWT_SECRET);
}

// 统一 JSON 响应
export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// ---------- 请求频率限制（Rate Limiting） ----------
// 基于 IP 的简单频率限制，防止暴力破解
// 使用 D1 存储请求记录，支持滑动窗口算法

// 获取客户端 IP（支持 Cloudflare Workers 的 CF-Connecting-IP 头）
export function getClientIP(request) {
  return request.headers.get('CF-Connecting-IP') || 
         request.headers.get('X-Forwarded-For')?.split(',')[0].trim() ||
         'unknown';
}

// 检查并记录请求频率
// limit: 时间窗口内最大请求数
// windowMs: 时间窗口（毫秒）
// 返回：{ allowed: boolean, remaining: number, resetAt: number }
export async function checkRateLimit(env, key, limit = 5, windowMs = 60000) {
  const now = Date.now();
  const windowStart = now - windowMs;
  
  try {
    // 清理过期记录并获取当前窗口内的请求数
    const row = await env.DB
      .prepare(`
        SELECT COUNT(*) as count, MAX(created_at) as last_request
        FROM rate_limits 
        WHERE key = ? AND created_at > ?
      `)
      .bind(key, windowStart)
      .first();
    
    const count = row?.count || 0;
    const remaining = Math.max(0, limit - count - 1);
    const resetAt = now + windowMs;
    
    if (count >= limit) {
      return { allowed: false, remaining: 0, resetAt, retryAfter: Math.ceil((row?.last_request || now) + windowMs - now) / 1000 };
    }
    
    // 记录本次请求
    await env.DB
      .prepare('INSERT INTO rate_limits (key, created_at) VALUES (?, ?)')
      .bind(key, now)
      .run();
    
    return { allowed: true, remaining, resetAt };
  } catch (e) {
    // 如果 rate_limits 表不存在，放行请求（不阻塞正常流程）
    console.error('Rate limit check failed:', e);
    return { allowed: true, remaining: limit, resetAt: now + windowMs };
  }
}

// 清理过期的频率限制记录（可在后台定期调用）
export async function cleanupRateLimits(env, windowMs = 60000) {
  try {
    await env.DB
      .prepare('DELETE FROM rate_limits WHERE created_at < ?')
      .bind(Date.now() - windowMs * 2)
      .run();
  } catch (e) {
    console.error('Rate limit cleanup failed:', e);
  }
}

// ---------- 中间件系统 ----------
// 提供可复用的中间件工厂，减少重复的鉴权代码

// 是否为管理员级身份（admin / owner）
export function isPrivileged(role) { 
  return role === 'admin' || role === 'owner'; 
}

// 认证中间件工厂
// options: { requireAuth: boolean, adminOnly: boolean, ownerOnly: boolean }
// 返回一个中间件函数，会在 handler 前执行鉴权，成功则调用 handler(request, env, user)
export function withAuth(handler, options = {}) {
  const { requireAuth = true, adminOnly = false, ownerOnly = false } = options;
  
  return async (request, env) => {
    // 需要认证
    if (requireAuth || adminOnly || ownerOnly) {
      const user = await authenticate(request, env);
      if (!user) {
        return json({ error: '请先登录' }, 401);
      }
      if (ownerOnly && user.role !== 'owner') {
        return json({ error: '仅站长可执行此操作' }, 403);
      }
      if (adminOnly && !isPrivileged(user.role)) {
        return json({ error: '无权访问，仅管理员可执行此操作' }, 403);
      }
      return handler(request, env, user);
    }
    // 无需认证，直接调用（user 可能为 null）
    const user = await authenticate(request, env);
    return handler(request, env, user);
  };
}

// 频率限制中间件工厂
// options: { limit: number, windowMs: number, keyPrefix: string }
export function withRateLimit(handler, options = {}) {
  const { limit = 5, windowMs = 60000, keyPrefix = '' } = options;
  
  return async (request, env, user) => {
    const ip = getClientIP(request);
    const rateKey = `${keyPrefix}:${ip}`;
    const rateCheck = await checkRateLimit(env, rateKey, limit, windowMs);
    if (!rateCheck.allowed) {
      return json({ 
        error: `请求过于频繁，请 ${Math.ceil(rateCheck.retryAfter)} 秒后再试`,
        retryAfter: rateCheck.retryAfter 
      }, 429);
    }
    return handler(request, env, user);
  };
}

// 组合中间件（从右到左执行）
export function compose(...middlewares) {
  return (handler) => {
    return middlewares.reduceRight((h, mw) => mw(h), handler);
  };
}

// ---------- 路由工具 ----------
// 简化路由分发逻辑

// 解析路径中的 ID 参数
// 例如：/api/admin/users/123/password -> { id: 123, action: 'password' }
export function parsePathId(pathname, pattern) {
  // pattern 示例：'/api/admin/users/:id/:action?'
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  
  if (pathParts.length < patternParts.length) return null;
  
  const result = {};
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i];
    const actual = pathParts[i];
    if (pp.startsWith(':')) {
      const key = pp.slice(1).replace('?', '');
      if (actual !== undefined) {
        result[key] = actual;
      } else if (!pp.endsWith('?')) {
        return null; // 必需参数缺失
      }
    } else if (pp !== actual) {
      return null; // 路径不匹配
    }
  }
  return result;
}

// 创建路由表匹配器
// routes: [{ method, path, handler, options }] 或 Map
export function createRouter(routes) {
  const routeList = Array.isArray(routes) ? routes : [];
  
  return async (request, env) => {
    const url = new URL(request.url);
    const { pathname, method } = { pathname: url.pathname, method: request.method };
    
    for (const route of routeList) {
      if (route.method && route.method !== method) continue;
      
      const params = parsePathId(pathname, route.path);
      if (params !== null) {
        const handler = route.options?.middleware 
          ? route.options.middleware(route.handler)
          : route.handler;
        return handler(request, env, params);
      }
    }
   return null; // 无匹配路由
 };
}
