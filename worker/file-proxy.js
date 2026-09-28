/* ==========================================================================
 * worker/file-proxy.js — Storage 文件同源代理（2026-09-28）
 *
 * 为什么需要：简历/证书 PDF 存在 Supabase Storage（公开桶），前端此前直接把
 *   Supabase URL 塞进 <iframe> / <a download>：
 *   ① Supabase 对象响应带 `X-Frame-Options: DENY` → Chrome iframe 内直接显示
 *      「已阻止此内容。请与网站所有者联系」；
 *   ② 跨域 <a download> 属性被浏览器忽略 → 点「下载」变成打开新标签页；
 *   ③ 国内直连 *.supabase.co 常被 RST → 文件根本拉不到。
 * 代理后：前端只请求本站 `/api/file-proxy`（同源），以上三个问题一起消失。
 *
 * 安全设计（**不是开放代理**）：
 *   - 只接受 `ref=<桶>/<路径>` 形式的**桶前缀引用**，桶必须在白名单内；
 *   - 路径复用 editor.js 的 safePath（拒绝对路径/反斜杠/`..` 段）；
 *   - 上游 URL 完全由服务端拼接，查询串里的任何绝对 URL 都不会被转发；
 *   - 只允许 GET/HEAD；响应头逐项白名单重写（不透传上游的安全头）。
 * ========================================================================== */
import { BUCKETS, safePath } from './editor.js';
import { json } from './auth.js';

/* 上游（Supabase）兜底地址：与 editor.js 的 DEFAULT_URL 一致 */
const DEFAULT_URL = 'https://wrguksjsbdvoqfedsdow.supabase.co';

function sbUrl(env) {
  return String((env && env.SUPABASE_URL) || '').trim().replace(/\/+$/, '') || DEFAULT_URL;
}

/** 路径按「段」编码：'/' 要保留（Supabase 靠它识别目录），其余字符转义 */
function encodePath(p) {
  return String(p).split('/').map(encodeURIComponent).join('/');
}

/**
 * Content-Disposition 的文件名：ASCII 走 filename=，非 ASCII 追加 RFC 5987
 * filename*=UTF-8''...（中文简历名在 Chrome/Firefox/Safari 都能正确落盘）。
 * @param {string} raw 文件名（来自代理路径 basename 或调用方 n= 参数）
 */
function contentDisposition(raw, download) {
  /* 清洗：去引号/反斜杠/控制字符，防响应头注入；长度压到 120 字符 */
  const base = String(raw || 'file')
    .replace(/[\\/:*?"<>|\r\n\0]/g, '')
    .replace(/^[.\s]+/, '')
    .slice(0, 120) || 'file';
  const type = download ? 'attachment' : 'inline';
  if (/^[\x20-\x7e]+$/.test(base)) return `${type}; filename="${base.replace(/"/g, '')}"`;
  const ascii = base.replace(/[^\x20-\x7e]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(base)}`;
}

/**
 * 处理 GET|HEAD /api/file-proxy。
 * @param {Request} request
 * @param {object} env  Worker 环境（SUPABASE_URL 可覆盖默认上游）
 * @returns {Promise<Response|null>} 命中路由时返回响应；否则 null（交给后续处理器）
 */
export async function handleFileProxyApi(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/file-proxy') return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: '仅支持 GET' }, 405);
  }

  /* ---- 参数解析与严格校验 ---- */
  const ref = url.searchParams.get('ref') || '';
  const sep = ref.indexOf('/');
  const bucket = sep === -1 ? '' : ref.slice(0, sep);
  if (BUCKETS.indexOf(bucket) === -1) return json({ error: '非法文件引用' }, 400);
  const path = safePath(ref.slice(sep + 1));
  if (!path) return json({ error: '非法文件路径' }, 400);

  const download = url.searchParams.get('dl') === '1';
  const nameParam = url.searchParams.get('n') || '';

  /* ---- 拉取上游（Range 透传：pdf.js 与 Chrome 查看器都会发分段请求） ---- */
  const upstream = sbUrl(env) + '/storage/v1/object/public/' + bucket + '/' + encodePath(path);
  const headers = {};
  const range = request.headers.get('Range');
  if (range) headers['Range'] = range;

  let res;
  try {
    /* cf.cacheEverything：公开桶对象在 CF 边缘缓存（Workers 专有字段，标 any 绕过 DOM RequestInit） */
    res = await fetch(upstream, /** @type {any} */ ({ headers, cf: { cacheEverything: true, cacheTtl: 3600 } }));
  } catch (e) {
    return json({ error: '文件服务不可达' }, 502);
  }
  if (res.status === 404 || res.status === 400) return json({ error: '文件不存在' }, 404);
  if (!res.ok) return json({ error: '文件服务返回 ' + res.status }, 502);

  /* ---- 响应头白名单重写（关键：不带任何上游的安全头） ----
     - Content-Type：以上游为准（桶上存的是什么就回什么），拿不到再按扩展名兜底；
     - Content-Disposition：inline（预览/缩略图）或 attachment（下载，dl=1）；
     - CSP frame-ancestors 'self'：明确允许**本站**iframe 内嵌（覆盖上游 DENY 语义）；
     - 不设置 X-Frame-Options（index.js 中间件对本路由改为 SAMEORIGIN）；
     - Cache-Control：对象路径带时间戳、内容不可变 → 允许边缘/浏览器缓存。 */
  const h = new Headers();
  const ct = (res.headers.get('Content-Type') || 'application/octet-stream').split(';')[0].trim();
  h.set('Content-Type', /\.pdf$/i.test(path) ? (ct === 'application/octet-stream' ? 'application/pdf' : ct) : ct);
  const fname = nameParam || path.split('/').pop() || 'file';
  h.set('Content-Disposition', contentDisposition(fname, download));
  h.set('Content-Security-Policy', "frame-ancestors 'self'");
  h.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  const len = res.headers.get('Content-Length');
  if (len) h.set('Content-Length', len);
  if (res.headers.get('Accept-Ranges')) h.set('Accept-Ranges', 'bytes');
  const cr = res.headers.get('Content-Range');
  if (cr) h.set('Content-Range', cr);
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('ETag', '"' + bucket + '/' + path + '"');

  return new Response(request.method === 'HEAD' ? null : res.body, {
    status: res.status,           /* 200 / 206 原样透传 */
    statusText: res.statusText,
    headers: h,
  });
}
