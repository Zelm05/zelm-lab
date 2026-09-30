/* ==========================================================================
 * useDragSort.js —— 竖向列表的「拖拽排序」组合式（鼠标 + 触屏 + 键盘）
 *
 * 设计目标（对照规格）：
 *   · 鼠标 / 触屏都能拖 —— 用 **Pointer Events** 统一两套输入（无需引入拖拽库）；
 *   · 键盘可用 —— 暴露 `move(from, to)`，各组件用上下箭头按钮兜底；
 *   · 拖完把数组顺序**归一化**成 sort_order = (i+1)*10，保证落库顺序与视觉一致。
 *
 * 用法：
 *   const { dragging, setContainer, move, onPointerDown } = useDragSort(rows, 'sort_order');
 *   <ul ref="listEl">  →  onMounted(() => setContainer(listEl.value))
 *   <li data-drag-item>  →  拖拽手柄 @pointerdown="onPointerDown($event, i)"
 *   手柄上加 style="touch-action:none"（触屏拖拽不触发页面滚动）
 * ========================================================================== */
import { ref } from 'vue';

/**
 * @param {import('vue').Ref<Array<object>>} list  响应式数组（每行带 sortKey 字段）
 * @param {string} sortKey  排序字段名（默认 sort_order）
 */
export function useDragSort(list, sortKey = 'sort_order') {
  const dragging = ref(-1);
  const overIndex = ref(-1);
  let containerEl = null;

  function setContainer(el) {
    containerEl = el;
  }

  /** 拖完 / 箭头移动后：把数组当前顺序写回 sortKey（步长 10，留好插入余量） */
  function normalize() {
    list.value.forEach((it, i) => { it[sortKey] = (i + 1) * 10; });
  }

  /** 键盘 / 箭头按钮用：把第 from 行移到第 to 行位置，并归一化 */
  function move(from, to) {
    if (to < 0 || to >= list.value.length || from === to) return;
    const arr = list.value.slice();
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    list.value = arr;
    normalize();
  }

  function items() {
    if (!containerEl) return [];
    return Array.from(containerEl.querySelectorAll('[data-drag-item]'));
  }

  /** 根据指针 Y 坐标落到哪个 item 的下半区，算出目标下标 */
  function targetIndex(y) {
    const els = items();
    if (!els.length) return dragging.value;
    let target = dragging.value;
    for (let i = 0; i < els.length; i++) {
      const r = els[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) { target = i; break; }
      target = i;
    }
    return target;
  }

  function onPointerDown(e, index) {
    /* 只允许主键 / 单指；右键或辅助键不触发拖拽 */
    if (e.button != null && e.button !== 0) return;
    dragging.value = index;
    try { e.target.setPointerCapture(e.pointerId); } catch (_) { /* 部分环境不支持，忽略 */ }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (dragging.value < 0) return;
    const to = targetIndex(e.clientY);
    if (to !== dragging.value && to >= 0) {
      move(dragging.value, to);
      dragging.value = to;
      overIndex.value = to;
    }
  }

  function onPointerUp() {
    if (dragging.value < 0) return;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    dragging.value = -1;
    overIndex.value = -1;
  }

  return { dragging, overIndex, setContainer, move, onPointerDown };
}
