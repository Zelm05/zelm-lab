// ===================================================================
// worker.js — 单 Worker 入口（真实部署用）
// 架构：/api/ 前缀走后端接口，其余路径由 Workers Assets 返回静态前端页面
// 访问策略：主站对游客开放（不登录也可进入）；登录后右上角切换为「登出」。
// 管理员：/admin.html 仅 role ∈ { 'admin', 'owner' } 可访问
// ===================================================================

import { handleAuthApi, exampleProtectedApi } from './api.js';
import { handleCommunityApi } from './community.js';
import { handleAboutApi } from './about.js';
import { handleSettingsApi, withSiteCfgCookie, getSetting } from './settings.js';
import { authenticate, json } from './auth.js';

// 管理员专属页面：未登录跳 gate.html；已登录但非管理员返回 403
// 注：Workers Assets 会把 /admin.html 307 重定向到 /admin（干净 URL），两个路径都要拦截
const ADMIN_PATHS = ['/admin.html', '/admin'];

// 需要下发「站点配置 Cookie」的页面请求：HTML 页面与干净 URL（/home、/about 等）。
// 静态资源（css/js/图片/音频）不需要，避免每次资源请求都多查一次 D1。
function isHtmlPage(p) {
  if (p === '/' || p.endsWith('/')) return true;
  if (/\.html?$/i.test(p)) return true;
  return !/\.[a-z0-9]{2,5}$/i.test(p);   // 无扩展名 = 干净 URL
}

// 安全响应头（全站统一下发，任何响应都携带）
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

// 基线 CSP。注意两点：
//  1) 伪 SPA 的 shell.js 用 new Function(code) 执行视图脚本 → 必须保留 'unsafe-eval'；
//  2) 视图 HTML 携带内联 <script>/<style> 且由 adoptHead/runScripts 注入 → 需 'unsafe-inline'。
// 核心防护是 object-src 'none'（禁插件/object 注入）与 frame-ancestors 'none'（防点击劫持）。
const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com",
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

function applySecurityHeaders(res, request) {
  if (!res || !res.headers) return res;
  const h = new Headers(res.headers);
  // 强制覆盖：Workers Assets 会给 HTML 默认加 X-Frame-Options: SAMEORIGIN 与
  // frame-ancestors CSP；本站无 iframe 嵌入需求，统一收紧为 DENY / 'none'。
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) h.set(k, v);
  // HSTS 仅对 HTTPS 请求下发（本地 http dev 不受影响）
  if (request && /^https:/i.test(request.url)) {
    h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  // CSP 仅对 HTML 页面下发（避免污染 JSON 接口 / 静态资源头）；
  // 直接覆盖 Assets 默认的 frame-ancestors CSP，换成含 object-src/base-uri 的完整基线
  let isHtml = false;
  try {
    const u = new URL(request.url);
    isHtml = u.pathname === '/' || u.pathname.endsWith('/')
      || /\.html?$/i.test(u.pathname) || !/\.[a-z0-9]{2,5}$/i.test(u.pathname);
  } catch (e) { isHtml = false; }
  if (isHtml) {
    h.set('Content-Security-Policy', CSP_POLICY);
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

export default {
  async fetch(request, env) {
    // 统一出口：所有响应（HTML/静态/API/重定向）都过一遍安全头
    return applySecurityHeaders(await handle(request, env), request);
  },
};

async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

    // ---------- 后端 API 路由 ----------
    if (path.startsWith('/api/')) {
      // ① 认证 + 管理员路由（注册/登录/登出/me/admin/*）
      const authRes = await handleAuthApi(request, env);
      if (authRes) return authRes;          // 命中认证/管理路由，直接返回

      // ② 社区路由（留言板 / 点赞 / 反馈建议）
      const communityRes = await handleCommunityApi(request, env);
      if (communityRes) return communityRes;

      // ②' 关于页密码路由
      const aboutRes = await handleAboutApi(request, env);
      if (aboutRes) return aboutRes;

      // ②'' 站点设置路由（GET 公开读取 / PUT 站长修改）
      const settingsRes = await handleSettingsApi(request, env);
      if (settingsRes) return settingsRes;

      // ③ 在此追加你自己的其它后端接口（示例：受保护的 /api/hello）
      if (path === '/api/hello' && request.method === 'GET') {
        return exampleProtectedApi(request, env);
      }

      // ④ 未匹配到的接口
      return json({ error: '接口不存在' }, 404);
    }

    // ---------- 管理员页面鉴权 ----------
    if (ADMIN_PATHS.includes(path)) {
      const user = await authenticate(request, env);
      if (!user) {
        return Response.redirect(new URL('/gate.html', request.url).toString(), 302);
      }
      if (user.role !== 'admin' && user.role !== 'owner') {
        return new Response(
          '<!DOCTYPE html><html lang="zh-CN"><meta charset="utf-8">' +
          '<title>无权访问</title>' +
          '<body style="background:#061814;color:#e9edf6;font-family:system-ui,sans-serif;' +
          'display:grid;place-items:center;height:100vh;margin:0;text-align:center">' +
          '<div><h1 style="color:#4ff0d0">403 无权访问</h1>' +
          '<p>该页面仅管理员可见。</p>' +
          '<a href="/index.html" style="color:#4ff0d0">返回资源库</a></div></body></html>',
          { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
    }

    // ---------- 关于页登录门槛（服务端兜底） ----------
    // about_login_required = 1 且访客未登录时，不返回含照片墙的完整 about.html，
    // 改为返回极简「请登录」页，避免内容被未登录直接抓取；前端 about.html 仍有密码门做二次拦截
    if (path === '/about.html' || path === '/about') {
      const alr = (await getSetting(env, 'about_login_required', '1')) === '1';
      if (alr) {
        const u = await authenticate(request, env);
        if (!u) {
          const stub = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<title>关于我 · 需登录</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#061814;color:#e9edf6;font-family:system-ui,'PingFang SC',sans-serif;text-align:center">
<div style="max-width:300px;padding:32px;border:1px solid rgba(79,240,208,.3);border-radius:18px;background:rgba(255,255,255,.04)">
<h2 style="color:#4ff0d0;margin:0 0 12px">需要登录</h2>
<p style="opacity:.8;line-height:1.6;margin:0 0 18px">查看完整「关于我」需先登录账号。</p>
<button onclick="if(window.ZelmShell)ZelmShell.goPage('home');else location.href='/'" style="background:#4ff0d0;border:none;color:#022;padding:9px 22px;border-radius:10px;font-weight:700;cursor:pointer">返回首页</button>
</div></body></html>`;
          return new Response(stub, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
          });
        }
      }
    }

    // ---------- 入口页面直供 ----------
    // 站点根地址展示欢迎页 gate.html（200，而非 302 重定向）。
    // 注意：不能对 / 用 302 跳 gate.html —— Assets 会把 /index.html → /index → / 逐级
    // 307 重定向，gate 点「进入网站」跳到 index.html 后最终落回 / 再被 302 回 gate，
    // 形成死循环。这里由 Worker 按映射直接取回对应 HTML 内容，并安全跟随 Assets
    // 的干净 URL 重定向（终点 / 会由 Assets 直接返回 index.html，不再经过本拦截）。
    const ENTRY_PAGES = {
      '/': '/gate.html',
      '/index.html': '/index.html',
      '/index': '/index.html',
      '/gate.html': '/gate.html',
      '/gate': '/gate.html',
    };
    if (path in ENTRY_PAGES) {
      let assetUrl = new URL(ENTRY_PAGES[path], request.url).toString();
      let res = await env.ASSETS.fetch(new Request(assetUrl, request));
      let hops = 0;
      while (res.status >= 301 && res.status <= 308 && hops < 3) {
        const loc = res.headers.get('Location');
        if (!loc) break;
        const next = new URL(loc, request.url).toString();
        if (next === assetUrl) break; // 防止自我重定向死循环
        assetUrl = next;
        hops++;
        res = await env.ASSETS.fetch(new Request(assetUrl, request));
      }
      // 防缓存：避免浏览器/边缘节点缓存早期 /index.html → /index → / 的重定向链，
      // 导致根地址被 307 跳走、gate 页"消失"
      if (res.status >= 200 && res.status < 300) {
        res = new Response(res.body, res);
        res.headers.set('Cache-Control', 'no-store, max-age=0');
      }
      // 下发站点配置 Cookie（供前端解析 HTML 时同步应用板块显隐）
      return await withSiteCfgCookie(res, env);
    }

    // ---------- 前端静态页面 ----------
    // 其余所有路径交给 Workers Assets 托管（public/ 目录）
    // 按资源类型加缓存头：字体长缓存；图片短缓存+版本号失效；音频 1 天；CSS/JS no-cache
    // （每次回源校验 ETag），避免改完代码后浏览器还抱着旧文件。
    const res = await env.ASSETS.fetch(request);
    if (res && res.ok) {
      const p = url.pathname;
      let cc = null;
      // 字体：文件名与内容基本不变，可安全长缓存
      if (/\.(woff2?|ttf)$/i.test(p)) {
        cc = 'public, max-age=31536000, immutable';
      } else if (/\.(png|jpe?g|gif|webp|svg|ico)$/i.test(p)) {
        // 图片：换图靠版本号失效（如照片墙 ?v=PHOTO_VER、资源文件改名），
        // 无需每次回源校验。短缓存 + must-revalidate：1 小时内不回源，
        // 超时后条件请求校验 ETag（未变走 304 几乎零流量）。
        cc = 'public, max-age=3600, must-revalidate';
      } else if (/\.mp3$/i.test(p)) {
        // 音频：单曲 3-8MB，1 天缓存显著减少回源；换歌时改文件名或加版本号即可
        cc = 'public, max-age=86400, must-revalidate';
      } else if (/\.(css|js)$/i.test(p)) {
        cc = 'no-cache';
      }
      if (cc) {
        const h = new Headers(res.headers);
        h.set('Cache-Control', cc);
        const out = new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
        // HTML 页面（含干净 URL）额外下发站点配置 Cookie
        return isHtmlPage(p) ? await withSiteCfgCookie(out, env) : out;
      }
    }
    // 未命中缓存头分支的 HTML 页面同样下发站点配置 Cookie
    return isHtmlPage(url.pathname) ? await withSiteCfgCookie(res, env) : res;
  }
