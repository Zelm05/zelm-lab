// ===================================================================
// worker/index.js — Hono 入口（替代旧的 src/worker.js）
//
// 职责：
//   1) 全站安全头 / CSP（Hono 中间件统一注入）
//   2) /api/* → 桥接到原后端模块（auth / community / about / settings）
//   4) 其余 → Workers Assets 静态资源（含 SPA 回退与分级缓存头）
//
// 与旧版的差异：路由由 Hono 承担；站点配置 Cookie、缓存策略、安全头逻辑保留。
// 原 5 个后端模块（auth/api/community/about/settings）逻辑未改动，原样复用。
// ===================================================================

import { Hono } from 'hono';
import { handleAuthApi } from './api.js';
import { handleCommunityApi } from './community.js';
import { handleAboutApi } from './about.js';
import { handleSettingsApi, withSiteCfgCookie } from './settings.js';
import { handleEditorApi } from './editor.js';
import { handleContentApi } from './content.js';
import { handleTranslateApi } from './translate.js';
import { json } from './auth.js';
import { reportClientError, reportCspViolation } from './reports.js';

/**
 * Worker 绑定与环境变量（渐进 TS：给 Hono 的 c.env 一个明确形状）。
 * 说明：未引入 @cloudflare/workers-types，故 D1 / Assets Fetcher 以 any 占位；
 *       需要精确类型时可装该包并替换 DB / ASSETS 的 any。
 * @typedef {object} WorkerEnv
 * @property {any} DB
 * @property {any} ASSETS
 * @property {string} [JWT_SECRET]
 * @property {string} [SEED_OWNER_SALT]
 * @property {string} [SEED_OWNER_HASH]
 */

const app = new Hono();

// ---------- 安全响应头 ----------
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

// 基线 CSP。
// 相比旧版：Vite 已把 .vue 预编译成渲染函数，运行时不再用 new Function，
// 因此 **去掉了 'unsafe-eval'**（这是换 Vue 工程化带来的实打实的安全收益）。
// style 仍需 'unsafe-inline'：Element Plus / Vue 会写内联 style 属性。
const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// 写接口请求体大小上限（字节）：留言 500 字 / 反馈 1000 字 + JSON 封装远不至此，
// 32KB 既留足余量又挡掉异常大请求（P2-7）
const MAX_API_BODY = 32768;
/* 内容管理专用上限：/api/admin/* 一次要提交**四语正文**（博客/日志的 content 可能很长），
   32KB 会直接被 413 拦掉。256KB 对纯文本已非常宽裕，同时仍挡得住异常大请求。 */
const MAX_CONTENT_BODY = 256 * 1024;
/* 上传中转专用上限（文件走 Worker 转发给 Supabase，绕过被 RST 的直连） */
const MAX_UPLOAD_BODY = 16 * 1024 * 1024;

// ---------- P2-24：CSP 分阶段落地 ----------
// 阶段一（本批）：把下面的「严格策略」以 Content-Security-Policy-Report-Only 下发，
//   同时**继续强制现行 CSP_POLICY**（不降低现有防护），靠 report-uri 收集一周违规。
// 阶段二（本批）：严格策略的 script-src 去掉 'unsafe-inline'，改为列出 index.html
//   两段内联引导脚本的 sha256。⚠️ 必须等于浏览器实际哈希：浏览器会把 HTML 输入流里的
//   CRLF/CR 规范化为 LF 后再取脚本文本，故哈希按 **LF 归一化后** 计算（见 scripts/csp-hash.mjs）。
// 阶段三（留待）：收紧 img-src / connect-src（现为 https: 全开）。
//
// 重新生成哈希（改动 index.html 内联脚本后必须更新，否则切强制时会被拦）：
//     npm run build && node scripts/csp-hash.mjs
const CSP_SCRIPT_HASHES = [
  "'sha256-GchK9PJ+0MS3IefBOQJl788ma6R+W6rORxi6aVm/Ppg='",
  "'sha256-V9J6ipHau3upESrGO01OMvDTqZBgYgag2edMKq/uVk0='",
].join(' ');

// 严格策略：与 CSP_POLICY 仅差 script-src（去 'unsafe-inline' → 换 sha256）+ 末尾 report-uri。
const CSP_POLICY_STRICT = [
  "default-src 'self'",
  `script-src 'self' ${CSP_SCRIPT_HASHES}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "report-uri /api/csp-report",
].join('; ');

// 【P2-24 切正式开关】Report-Only 观察满一周、`/api/csp-report` 无异常违规后，把这里改成 true：
//   false → 下发 CSP_POLICY（现行，含 'unsafe-inline'，强制）+ CSP_POLICY_STRICT（Report-Only 观察）
//   true  → 只下发 CSP_POLICY_STRICT（严格，强制），完成「切正式」
// 一行切换，便于回退：改回 false 即恢复观察态。
const CSP_ENFORCE = false;

function isHtmlPath(p) {
  if (p === '/' || p.endsWith('/')) return true;
  if (/\.html?$/i.test(p)) return true;
  return !/\.[a-z0-9]{2,5}$/i.test(p); // 无扩展名 = 干净 URL（可能被 SPA 回退成 HTML）
}

// ---------- 原站路径兼容 ----------
// 重构前各页面都是独立地址（/about、/admin.html 等），现在统一收敛到单页应用的
// hash 路由。这里做 302，保证旧链接、书签、搜索引擎收录与 sitemap 里的地址不断。
// 注意：「/」绝不重定向（它是应用本体，落到 #/ 展示欢迎页），否则会形成死循环。
const LEGACY_ROUTES = {
  '/index.html': '/#/home',
  '/home.html': '/#/home',
  '/home': '/#/home',
  '/about.html': '/#/about',
  '/about': '/#/about',
  '/admin.html': '/#/admin',
  '/admin': '/#/admin',
  '/gate.html': '/#/gate',
  '/gate': '/#/gate',
  '/privacy.html': '/#/privacy',
  '/privacy': '/#/privacy',
  // 复检（2026-09-23）发现：/privacy/t 直链此前不在表内，落到 307→「/」，
  // 丢掉「滚动到服务条款」的意图；站内链接都是 #/privacy/t，这里只影响直链/书签。
  '/privacy/t': '/#/privacy/t',
};

// 分级缓存：/static/* 是 Vite 带 hash 的产物，可安全 immutable 长缓存
function cacheControlFor(p) {
  if (/\.html?$/i.test(p) || p === '/') return 'no-cache';
  if (/^\/static\//i.test(p)) return 'public, max-age=31536000, immutable';
  if (/\.(woff2?|ttf)$/i.test(p)) return 'public, max-age=31536000, immutable';
  if (/\.(png|jpe?g|gif|webp|svg|ico)$/i.test(p)) return 'public, max-age=3600, must-revalidate';
  if (/\.mp3$/i.test(p)) return 'public, max-age=86400, must-revalidate';
  if (/\.(css|js|json|txt|xml)$/i.test(p)) return 'no-cache';
  return null;
}

// ---------- 中间件：统一出口安全头 ----------
app.use('*', async (c, next) => {
  await next();
  const res = c.res;
  if (!res || !res.headers) return;

  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) h.set(k, v);
  if (/^https:/i.test(c.req.url)) {
    h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  if (isHtmlPath(new URL(c.req.url).pathname)) {
    if (CSP_ENFORCE) {
      // 【切正式后】只下发严格策略（强制）
      h.set('Content-Security-Policy', CSP_POLICY_STRICT);
    } else {
      // 【阶段一】现行策略继续强制（不降防护）+ 严格策略以 Report-Only 观察
      // （违规 POST 到 /api/csp-report，仅记日志）
      h.set('Content-Security-Policy', CSP_POLICY);
      h.set('Content-Security-Policy-Report-Only', CSP_POLICY_STRICT);
    }
  }
  // H-4（2026-09-24）：API 响应一律禁止中间层缓存。
  //   原先只有 Content-Type + nosniff，运营商/CDN/企业代理可能缓存 API 响应 →
  //   用户可能读到别人的数据（如 /api/me）或过期值。
  if (new URL(c.req.url).pathname.startsWith('/api/')) {
    h.set('Cache-Control', 'no-store');
  }
  c.res = new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: h,
  });
});

// ---------- 后端 API：桥接到原有模块（命中即返回） ----------
app.all('/api/*', async (c) => {
  const req = c.req.raw;
  const env = /** @type {WorkerEnv} */ (c.env);

  // 上报落点先于写接口来源校验（P2-8）：CSP 报告由浏览器自动发出、**不带 Origin 头**，
  // 若走来源校验会被 403 拦掉。两路由均只 console.error、无状态变更（无 CSRF 面）。
  const rpath = new URL(req.url).pathname;
  if (rpath === '/api/csp-report' && req.method === 'POST') return await reportCspViolation(req);
  if (rpath === '/api/client-error' && req.method === 'POST') return await reportClientError(req);

  // P2-8 + P2-7：非 GET/HEAD 写接口做来源校验 + 请求体大小上限（纵深防御）。
  // 本地开发（localhost / 127.0.0.1）跳过，避免本地联调被误拦。
  const method = req.method;
  if (method !== 'GET' && method !== 'HEAD') {
    const host = new URL(req.url).host;
    const isLocal = host === 'localhost' || host === '127.0.0.1' ||
      host.startsWith('localhost:') || host.startsWith('127.0.0.1:');
    if (!isLocal) {
      let okOrigin = false;
      try {
        const origin = req.headers.get('Origin');
        okOrigin = !!origin && new URL(origin).host === host;
      } catch (e) {
        okOrigin = false;
      }
      if (!okOrigin) return json({ error: '非法来源' }, 403);
    }
    const cl = parseInt(req.headers.get('Content-Length') || '0', 10);
    const limit = rpath === '/api/editor/upload' ? MAX_UPLOAD_BODY
      : rpath.indexOf('/api/admin/') === 0 ? MAX_CONTENT_BODY
      : MAX_API_BODY;
    if (cl > limit) return json({ error: '请求体过大' }, 413);
  }

  const authRes = await handleAuthApi(req, env);
  if (authRes) return authRes;

  const communityRes = await handleCommunityApi(req, env);
  if (communityRes) return communityRes;

  const aboutRes = await handleAboutApi(req, env);
  if (aboutRes) return aboutRes;

  const editorRes = await handleEditorApi(req, env);
  if (editorRes) return editorRes;

  /* 内容多语言 API：/api/content/*（公开读，带 lang 回退）+ /api/admin/*（站长读写） */
  const contentRes = await handleContentApi(req, env);
  if (contentRes) return contentRes;

  /* 机器翻译：/api/admin/translate（仅站长；密钥走 secret，不下发前端） */
  const translateRes = await handleTranslateApi(req, env);
  if (translateRes) return translateRes;

  const settingsRes = await handleSettingsApi(req, env);
  if (settingsRes) return settingsRes;

  return json({ error: '接口不存在' }, 404);
});

// ---------- 静态资源 + SPA 回退 + 曲库开关 ----------
app.all('*', async (c) => {
  const env = /** @type {WorkerEnv} */ (c.env);
  const req = c.req.raw;
  const path = new URL(req.url).pathname;

  // 旧地址 → hash 路由（302 保留查询串）
  if (path in LEGACY_ROUTES) {
    const target = new URL(LEGACY_ROUTES[path], req.url);
    target.search = new URL(req.url).search;
    return Response.redirect(target.toString(), 302);
  }

  let res = await env.ASSETS.fetch(req);

  // SPA 回退：hash 路由下用户手敲 /about 这类路径时，交回 index.html 由前端接管
  if (res.status === 404 && !/\.[a-z0-9]{2,5}$/i.test(path)) {
    res = await env.ASSETS.fetch(new Request(new URL('/index.html', req.url).toString(), req));
  }

  if (res && res.ok) {
    const cc = cacheControlFor(path);
    if (cc) {
      const h = new Headers(res.headers);
      h.set('Cache-Control', cc);
      res = new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
    }
  }

  // HTML 页面下发站点配置 Cookie，供前端在首屏绘制前同步应用板块显隐
  return isHtmlPath(path) ? await withSiteCfgCookie(res, env) : res;
});

export default {
  fetch: app.fetch,
};
