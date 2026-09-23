<script setup>
/* ==========================================================================
 * ConfirmDialog.vue —— 确认弹窗（取代原 public/legacy/lib/confirm-modal.js）
 *
 * 原实现是 IIFE + createElement + innerHTML 自建 DOM、注入 <style>、挂到 body，
 * 再用 window.zelmConfirm 暴露。现在拆成两半：
 *   - 状态与 Promise：src/modules/confirm.js（导出同名 zelmConfirm）
 *   - 界面：本组件，响应式渲染，随 App 常驻
 * 样式沿用原来的 .zconfirm-* 类名，视觉与原站一致。
 * ========================================================================== */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { confirmState, confirmLabels, resolveConfirm } from '@/modules/confirm';

/* P1-4：原先这里是 `const labels = confirmLabels();` —— 在组件 setup 时**取一次**，
 * 而 ConfirmDialog 由 App.vue 常驻挂载（只 mount 一次），所以那份快照会把
 * 「启动时的语言」永久钉死，切语言后按钮文案不会变。
 * 改成在 computed 里现取：既跟着语言走，又保留兜底（正常路径下 confirmState
 * 已由 zelmConfirm 填好 okLabel/cancelLabel，这里的兜底是防御性的）。 */
const okBtn = ref(null);
/* 打开前记录触发元素，关闭后归还焦点（P2-13） */
let prevFocus = null;

/* P2-13：焦点陷阱 + Esc 关闭。Tab/Shift+Tab 在弹窗内循环，不跑到背景。 */
function dialogFocusables() {
  const root = document.querySelector('.zconfirm-modal');
  if (!root) return [];
  return Array.from(root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter((el) => !el.disabled && el.offsetParent !== null);
}
function onKey(e) {
  if (!confirmState.visible) return;
  if (e.key === 'Escape') { resolveConfirm(false); return; }
  if (e.key === 'Tab') {
    const f = dialogFocusables();
    if (f.length === 0) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKey);
});
onUnmounted(() => {
  document.removeEventListener('keydown', onKey);
});

// 打开时锁定页面滚动 + 焦点陷阱初始化，关闭时恢复（与原实现一致）
watch(() => confirmState.visible, async (v) => {
  document.body.style.overflow = v ? 'hidden' : '';
  document.documentElement.style.overflow = v ? 'hidden' : '';
  if (v) {
    prevFocus = document.activeElement;
    await nextTick();
    try { okBtn.value && okBtn.value.focus(); } catch (e) { /* 忽略 */ }
  } else {
    try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) { /* 忽略 */ }
    prevFocus = null;
  }
});

const okText = computed(() => confirmState.okLabel || confirmLabels().ok);
const cancelText = computed(() => confirmState.cancelLabel || confirmLabels().cancel);
</script>

<template>
  <div
    v-show="confirmState.visible"
    class="modal-overlay zconfirm-overlay"
    @click.self="resolveConfirm(false)"
  >
    <div class="modal zconfirm-modal" role="dialog" :aria-label="okText">
      <p class="zconfirm-text">{{ confirmState.message }}</p>
      <div class="zconfirm-actions">
        <button type="button" class="zconfirm-cancel" @click="resolveConfirm(false)">{{ cancelText }}</button>
        <button ref="okBtn" type="button" class="zconfirm-ok" @click="resolveConfirm(true)">{{ okText }}</button>
      </div>
    </div>
  </div>
</template>

<style>
/* 自包含样式（不依赖主站 .modal / .modal-overlay 的定位规则，
   确保 admin 等页面也能正确居中并跟随主题）——与原实现逐行一致 */
.zconfirm-overlay{position:fixed;inset:0;z-index:6000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(2,8,6,.6);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);animation:fadeIn .2s ease;}
.zconfirm-overlay[hidden]{display:none;}
.zconfirm-modal{position:relative;width:min(340px,100%);max-width:340px;padding:22px 20px 18px;text-align:left;background:rgba(9,14,20,.96);border:1px solid var(--border,rgba(79,240,208,.18));border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.6);animation:modalIn .28s ease;}
.zconfirm-text{font-size:.9rem;line-height:1.8;color:var(--text,#e9edf6);margin:0 0 18px;word-break:break-word;}
.zconfirm-actions{display:flex;gap:10px;justify-content:flex-end;}
.zconfirm-actions button{min-width:84px;height:34px;border-radius:9px;border:1px solid var(--border,rgba(79,240,208,.18));background:rgba(255,255,255,.05);color:var(--text,#e9edf6);font-size:.85rem;cursor:pointer;font-family:inherit;transition:all .2s;display:inline-flex;align-items:center;justify-content:center;}
.zconfirm-actions .zconfirm-cancel:hover{border-color:var(--accent,#4ff0d0);color:var(--accent,#4ff0d0);}
.zconfirm-actions .zconfirm-ok{background:rgba(239,68,68,.14);border-color:rgba(239,68,68,.5);color:#f87171;}
.zconfirm-actions .zconfirm-ok:hover{background:rgba(239,68,68,.24);box-shadow:0 0 12px rgba(239,68,68,.25);}
html[data-theme="light"] .zconfirm-overlay{background:rgba(20,60,40,.4);}
html[data-theme="light"] .zconfirm-modal{background:rgba(255,255,255,.97);}
html[data-theme="light"] .zconfirm-actions button{background:rgba(0,0,0,.04);color:#16332a;}
html[data-theme="light"] .zconfirm-actions .zconfirm-ok{background:rgba(239,68,68,.1);color:#b91c1c;}
</style>
