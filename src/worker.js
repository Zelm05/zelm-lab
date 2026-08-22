// ===================================================================
// worker.js — 单 Worker 入口（真实部署用）
// 架构：/api/ 前缀走后端接口，其余路径由 Workers Assets 返回静态前端页面
// ===================================================================

import { handleAuthApi, exampleProtectedApi } from './api.js';
import { authenticate, json } from './auth.js';

// 受保护路径：访问这些页面会先校验登录态，未登录则 302 跳登录页。
// 这里是资源库主站；登录页 / 注册页 / 欢迎页(gate) 保持公开。
const PROTECTED_PATHS = ['/', '/index.html'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ---------- 后端 API 路由 ----------
    if (path.startsWith('/api/')) {
      // ① 认证相关路由（注册/登录/登出/获取当前用户）
      const authRes = await handleAuthApi(request, env);
      if (authRes) return authRes;          // 命中认证路由，直接返回

      // ② 在此追加你自己的其它后端接口（示例：受保护的 /api/hello）
      if (path === '/api/hello' && request.method === 'GET') {
        return exampleProtectedApi(request, env);
      }

      // ③ 未匹配到的接口
      return json({ error: '接口不存在' }, 404);
    }

    // ---------- 受保护页面鉴权 ----------
    // 访问资源库主站时校验 Cookie 里的 JWT，无效则跳转到登录页
    if (PROTECTED_PATHS.includes(path)) {
      const user = await authenticate(request, env);
      if (!user) {
        // 基于当前请求构造绝对地址，兼容性最好
        return Response.redirect(new URL('/login.html', request.url).toString(), 302);
      }
    }

    // ---------- 前端静态页面 ----------
    // 其余所有路径交给 Workers Assets 托管（public/ 目录）
    return env.ASSETS.fetch(request);
  },
};
