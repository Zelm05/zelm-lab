/* ==========================================================================
 * useAboutGate.js —— 「关于我」页密码门的输入交互
 *
 * 从 AboutView.vue 抽出来（原第 165–171 / 197–202 行）。
 *
 * 职责边界：门控**状态机**在 stores/about.js（谁可以看到正文），这里只管
 *   两个输入框层面的细节 ——
 *     ① 提交密码：失败（空 / 错 / 网络）时把焦点放回输入框（原站行为）
 *     ② 密码门出现时自动聚焦输入框
 *   两条都是「等 store 的状态变化 → 操作 DOM」，所以必须放在组件里
 *   （composable 在本组件的 setup 中调用，才能拿到正确的生命周期）。
 *
 * gateInputEl 由调用方传入：`ref="gateInputEl"` 写在视图模板里。
 *
 * 返回值刻意叫 `onPwSubmit`（而不是 `submit`）—— 模板里的
 *   `@click="onPwSubmit()"` / `@keydown.enter="onPwSubmit()"` 保持一字不改，
 *   这样「本次只搬逻辑、不动模板」这个约束可以被 SSR 逐字节比对直接验证。
 * ========================================================================== */
import { watch, nextTick } from 'vue';
import { useAboutStore } from '@/stores/about';

/**
 * @param {import('vue').Ref<HTMLElement|null>} gateInputEl 密码输入框（模板 ref）
 */
export function useAboutGate(gateInputEl) {
  const a = useAboutStore();

  /** 提交密码：失败（空 / 错 / 网络）时把焦点放回输入框 —— 原站行为 */
  async function onPwSubmit() {
    await a.submitPw();
    if (!a.showPwGate) return;
    await nextTick();
    try { gateInputEl.value.focus(); } catch (e) { /* 忽略 */ }
  }

  /* 密码门出现时自动聚焦输入框 */
  watch(() => a.showPwGate, async (on) => {
    if (!on) return;
    await nextTick();
    try { gateInputEl.value.focus(); } catch (e) { /* 忽略 */ }
  });

  return { onPwSubmit };
}
