/* ==========================================================================
 * src/types/shims.d.ts — 渐进 TS 所需的全局类型补充（仅类型，无运行时代码）
 *
 * 为什么需要：
 *   jsconfig 只对 worker/* 与 src/stores/* 开 checkJs，但 tsc 会顺带检查它们
 *   传递依赖到的文件（src/api、src/core、src/router …）。这些文件里：
 *     1) `import('@/views/Xxx.vue')` —— 没有 .vue 模块声明会报 TS2307；
 *     2) `window.__zelmApplyZoom` —— index.html 内联脚本挂到 window 上的全局。
 *   本文件用最小声明补齐这两处，避免为此引入 vue-tsc 或改动业务代码。
 * ========================================================================== */

declare module '*.vue' {
  const component: any;
  export default component;
}

interface Window {
  /** index.html 内联脚本挂出的缩放重算函数（router.afterEach 会调用） */
  __zelmApplyZoom?: () => void;
}

/**
 * Vite 注入的环境变量。
 *
 * 2026-09-26 补：`src/stores/content.js` 开始 import `@/core/supabase`，
 *   而 supabase.js 用了 `import.meta.env.VITE_SUPABASE_URL` ——
 *   tsc 顺着 import 把它也纳入检查，于是报 TS2339（Property 'env' does not exist）。
 * 官方声明在 `vite/client`，但引入它要往 jsconfig 的 `types` 数组里加东西，
 *   那会连带改变 `node_modules/@types/*` 的自动包含范围。
 * 本文件本来就是干这个的，所以照旧用最小声明补齐。
 */
interface ImportMeta {
  readonly env: Record<string, string | undefined>;
}
