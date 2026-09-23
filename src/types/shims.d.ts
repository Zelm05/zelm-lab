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
