/* ==========================================================================
 * useDialog.js —— 遮罩弹窗的无障碍行为（WCAG 2.1.2 无键盘陷阱 / 2.4.3 焦点顺序）
 *
 * 覆盖 4 件事（`AuthPanel.vue` / `ConfirmDialog.vue` 里已各自手写过一遍，这里抽出来复用）：
 *   ① 打开时把焦点送进弹窗（默认首个可聚焦元素）
 *   ② Tab / Shift+Tab 在弹窗内**循环**，不会跑到背后的页面上
 *   ③ Esc 关闭
 *   ④ 关闭后把焦点**归还**给打开它的那个元素
 *
 * 模板侧还需要自己补语义属性（这里不管模板）：
 *   role="dialog" aria-modal="true" :aria-labelledby="titleId"
 *   —— 其中 aria-modal="true" 告诉读屏软件「弹窗外的内容是惰性的」，
 *      与这里的焦点陷阱是一对，缺一个都会让读屏用户迷路。
 *
 * 用法：
 *   const panelEl = ref(null);
 *   useDialog(() => props.open, { onClose: () => emit('close'), panelRef: panelEl });
 *   <div class="my-modal" ref="panelEl" role="dialog" aria-modal="true" :aria-labelledby="titleId">
 * ========================================================================== */
import { watch, nextTick, onMounted, onBeforeUnmount } from 'vue';

/* 可聚焦元素的选择器。tabindex="-1" 排除掉（那是「可编程聚焦但不在 Tab 序里」）。 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * @param {() => boolean} isOpen 打开状态 getter（如 `() => props.open`）
 * @param {object} [opts]
 * @param {() => void} [opts.onClose] 关闭回调（Esc 触发；遮罩点击由调用方自理）
 * @param {import('vue').Ref<HTMLElement|null>} [opts.panelRef] 弹窗面板元素；
 *        不传则退化为在 document 里找（多弹窗并存时可能串味，尽量传）
 * @param {() => HTMLElement|null} [opts.initialFocus] 打开时要聚焦的元素（默认首个可聚焦）
 * @param {boolean} [opts.immediate] 是否在挂载时就按当前状态跑一次（默认 false，
 *        与 AuthPanel 的既有行为一致：常驻组件 + 状态驱动）
 */
export function useDialog(isOpen, opts = {}) {
  const { onClose, panelRef = null, initialFocus = null, immediate = false } = opts;
  let prevFocus = null;

  function focusables() {
    const scope = (panelRef && panelRef.value) || document;
    if (!scope || !scope.querySelectorAll) return [];
    return Array.from(scope.querySelectorAll(FOCUSABLE))
      /* offsetParent !== null 用来滤掉 display:none / 被 [hidden] 的祖先里的元素 ——
         弹窗里常有「按角色显隐」的按钮，不滤掉会把 Tab 送到看不见的地方。 */
      .filter((el) => !el.disabled && !el.hidden && el.offsetParent !== null);
  }

  function onKeydown(e) {
    if (!isOpen || !isOpen()) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (onClose) onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const f = focusables();
    if (f.length === 0) { e.preventDefault(); return; }
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  watch(isOpen, async (on) => {
    if (!on) {
      /* 归还焦点。用 try 包住：触发元素可能已经从 DOM 上摘掉了 */
      try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) { /* 忽略 */ }
      prevFocus = null;
      return;
    }
    prevFocus = document.activeElement;
    await nextTick();
    /* 60ms 是原实现的经验值：等弹窗的入场动画起来，元素才有布局盒可聚焦 */
    setTimeout(() => {
      let el = null;
      try { el = (initialFocus && initialFocus()) || focusables()[0]; } catch (e) { /* 忽略 */ }
      try { if (el) el.focus(); } catch (e) { /* 忽略 */ }
    }, 60);
  }, { immediate });

  onMounted(() => document.addEventListener('keydown', onKeydown));
  onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
}
