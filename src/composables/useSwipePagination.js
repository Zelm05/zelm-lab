/* ==========================================================================
 * src/composables/useSwipePagination.js —— 手机端左右滑动翻页
 *
 * 原状：src/modules/pages/home.js 里的 bindSwipePagination(el, getNext, getPrev)
 *   —— 靠 document.getElementById 去取「下一页 / 上一页」按钮，再读它的
 *   disabled 决定能不能翻。三个区块各调一次。
 * 现在：接收一个容器 ref 和 { next, prev } 两个回调，边界判断由调用方负责
 *   （等价于原来的 disabled 判断），三个区块共用这一份实现。
 *
 * 行为逐条照搬：
 *   · 单指触摸才开始记录；只认明显的横向滑动（|dx| ≥ 50 且横向占优 1.5 倍）
 *   · 仅手机端（视口 ≤ 640px）生效
 *   · 滑动结束后在捕获阶段吞掉紧随而来的 click，避免误开详情/误点游戏
 * ========================================================================== */
import { onMounted, onUnmounted } from 'vue';

export function useSwipePagination(elRef, handlers) {
  let x0 = null;
  let y0 = null;
  let swiped = false;
  let el = null;

  function onTouchStart(e) {
    if (e.touches.length !== 1) { x0 = null; return; }
    const t = e.touches[0];
    x0 = t.clientX; y0 = t.clientY; swiped = false;
  }
  function onTouchMove(e) {
    if (x0 === null) return;
    const t = e.touches[0];
    const dx = t.clientX - x0;
    const dy = t.clientY - y0;
    if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 1.5) swiped = true;
  }
  function onTouchEnd(e) {
    if (x0 === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0;
    const dy = t.clientY - y0;
    x0 = null; y0 = null;
    if (window.innerWidth > 640) { swiped = false; return; }
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) handlers.next();   // 左滑 → 下一页
    else handlers.prev();          // 右滑 → 上一页
  }
  function onClickCapture(e) {
    if (swiped) { e.preventDefault(); e.stopPropagation(); swiped = false; }
  }

  onMounted(() => {
    el = elRef.value;
    if (!el) return;
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('click', onClickCapture, true);
  });
  onUnmounted(() => {
    if (!el) return;
    el.removeEventListener('touchstart', onTouchStart);
    el.removeEventListener('touchmove', onTouchMove);
    el.removeEventListener('touchend', onTouchEnd);
    el.removeEventListener('click', onClickCapture, true);
  });
}
