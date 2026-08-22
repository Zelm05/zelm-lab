// ===================================================================
// worker.js — 单 Worker 入口（真实部署用）
// 架构：/api/ 前缀走后端接口，其余路径由 Workers Assets 返回静态前端页面
// 访问策略：主站对游客开放（不登录也可进入）；登录后右上角切换为「登出」。
// 管理员：/admin.html 仅 role === 'admin' 可访问
// ===================================================================

import { handleAuthApi, exampleProtectedApi } from './api.js';
import { handleCommunityApi } from './community.js';
import { authenticate, json } from './auth.js';

// 管理员专属页面：未登录跳 gate.html；已登录但非管理员返回 403
// 注：Workers Assets 会把 /admin.html 307 重定向到 /admin（干净 URL），两个路径都要拦截
const ADMIN_PATHS = ['/admin.html', '/admin'];

export default {
  async fetch(request, env) {
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
      if (user.role !== 'admin') {
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

    // ---------- 入口：根路径先进欢迎页 ----------
    // 访问站点根地址时，先展示 gate.html（欢迎动画+登录/注册），
    // 点击「进入网站」后再跳转到 index.html 主站。
    if (path === '/' || path === '') {
      return Response.redirect(new URL('/gate.html', request.url).toString(), 302);
    }

    // ---------- 前端静态页面 ----------
    // 其余所有路径交给 Workers Assets 托管（public/ 目录）
    return env.ASSETS.fetch(request);
  },
};
