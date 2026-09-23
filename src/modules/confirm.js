/* ==========================================================================
 * src/modules/confirm.js —— 确认弹窗（原 public/legacy/lib/confirm-modal.js）
 *
 * 原实现：IIFE 里 createElement + innerHTML 自建弹窗、注入 <style>、挂到 body，
 *         再暴露 window.zelmConfirm。属于纯 DOM 命令式，且用全局当接口。
 * 现实现：状态放这里，界面交给 ConfirmDialog.vue（真 Vue 组件、响应式渲染）。
 *         对外仍导出同名 zelmConfirm，调用方式与原站完全一致：
 *           const ok = await zelmConfirm('确定删除吗？');
 *
 * 之所以保留自定义弹窗而不用原生 confirm()：微信 / QQ 内置浏览器（X5 内核）
 * 的原生 confirm 不可靠，表现为「点了没反应」。
 * ========================================================================== */
import { reactive } from 'vue';
import { i18n } from '@/core/i18n';

/**
 * 确定 / 取消按钮文案（跟随当前界面语言）。
 *
 * P1-4 之前这里是 `return { ok: '确定', cancel: '取消' };` —— 写死的中文，
 * 于是切到 English / 日本語 时确认弹窗的按钮永远是中文。
 * 现在从 common 命名空间取（四种语言都已补齐，见 src/i18n/packs/common.js）。
 *
 * 为什么是「取一次」而不是「响应式」：zelmConfirm() 是一次性 RPC 式的调用
 * （返回 Promise，弹窗几百毫秒就关），在弹窗打开期间切换语言这个场景实际上
 * 不会发生 —— 切语言要打开设置面板，那会先关掉确认弹窗。所以调用时取当前语言
 * 就够了，不需要引 computed / watch。
 */
export function confirmLabels() {
  return {
    ok: i18n.global.t('common.ok'),
    cancel: i18n.global.t('common.cancel'),
  };
}

/** 弹窗状态（由 ConfirmDialog.vue 渲染） */
export const confirmState = reactive({
  visible: false,
  message: '',
  okLabel: '',
  cancelLabel: '',
  resolve: null,
});

/** 关闭弹窗并把结果交还给等待中的 Promise */
export function resolveConfirm(result) {
  confirmState.visible = false;
  const fn = confirmState.resolve;
  confirmState.resolve = null;
  if (fn) fn(result);
}

/**
 * 弹出确认框。
 * @param {string} message 提示文案
 * @param {string} [okLabel] 自定义确定文案
 * @param {string} [cancelLabel] 自定义取消文案
 * @returns {Promise<boolean>} 用户点确定 → true，取消 / 关闭 → false
 */
export function zelmConfirm(message, okLabel, cancelLabel) {
  if (confirmState.resolve) resolveConfirm(false); // 前一弹窗未决时先关
  // 调用时按当前语言解析默认文案（P1-4）。顺带把原先写死的中文兜底句
  // `'确定继续吗？'` 也换成 common.confirmContinue —— 同一个函数里不该再留
  // 硬编码文案。该兜底实际不可达（所有调用点都用 t() 传了 message），属防御性保留。
  const L = confirmLabels();
  confirmState.message = message || i18n.global.t('common.confirmContinue');
  confirmState.okLabel = okLabel || L.ok;
  confirmState.cancelLabel = cancelLabel || L.cancel;
  confirmState.visible = true;
  return new Promise((resolve) => {
    confirmState.resolve = resolve;
  });
}
