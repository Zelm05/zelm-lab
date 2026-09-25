/* ==========================================================================
 * motion.js —— 「减少动态效果」偏好（WCAG 2.3.3 Animation from Interactions）
 *
 * 为什么需要单独一个模块：
 *   `src/styles/overrides.css` 里已有一条全局 CSS 兜底
 *     @media (prefers-reduced-motion: reduce) { *, *::before, *::after { … } }
 *   但它只能压 CSS 的 animation / transition。**canvas / WebGL 里的 rAF 循环
 *   完全不归它管** —— 粒子背景、星光、gate 页的 WebGL 高光该动还是动。
 *   所以凡是 JS 驱动的动效，一律先问这里。
 *
 * 用法：
 *   import { prefersReducedMotion, onReducedMotionChange } from '@/core/motion';
 *   if (prefersReducedMotion()) { 画一帧静态画面; return; }
 *   const off = onReducedMotionChange((reduced) => { … });   // 组件卸载时 off()
 * ========================================================================== */

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * 当前是否偏好「减少动态效果」。
 * 取不到 matchMedia（极老浏览器 / 非浏览器环境）时返回 false，
 * 即保持原有表现 —— 不做无谓的降级。
 * @returns {boolean}
 */
export function prefersReducedMotion() {
  try {
    return !!(typeof window !== 'undefined' && window.matchMedia && window.matchMedia(QUERY).matches);
  } catch (e) {
    return false;
  }
}

/**
 * 订阅偏好变化（用户在系统设置里改「减少动态效果」时**实时**生效）。
 * @param {(reduced: boolean) => void} cb
 * @returns {() => void} 取消订阅
 */
export function onReducedMotionChange(cb) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(QUERY);
  const handler = (e) => cb(!!e.matches);
  /* Safari < 14 只有已废弃的 addListener；两者都试，避免静默失效 */
  if (mq.addEventListener) mq.addEventListener('change', handler);
  else if (mq.addListener) mq.addListener(handler);
  return () => {
    if (mq.removeEventListener) mq.removeEventListener('change', handler);
    else if (mq.removeListener) mq.removeListener(handler);
  };
}
