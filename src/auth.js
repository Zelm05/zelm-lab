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
