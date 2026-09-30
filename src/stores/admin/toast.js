/* ==========================================================================
 * src/stores/admin/toast.js —— 管理控制台的全局提示条
 *
 * 原 stores/admin.js 里的 toast 状态 + showToast()。单独成文件是因为
 * 用户 / 反馈 / 站点设置三个领域都要弹提示，属跨领域共享件。
 * ========================================================================== */
import { reactive } from 'vue';

export function useToast() {
  const toast = reactive({ text: '', err: false, show: false });

  let toastTimer = null;
  function showToast(text, isErr) {
    toast.text = text;
    toast.err = !!isErr;
    toast.show = true;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.show = false; }, 2600);
  }

  return { toast, showToast };
}
