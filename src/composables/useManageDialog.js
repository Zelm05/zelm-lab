/* ==========================================================================
 * useManageDialog.js —— 前台「管理」按钮的就地弹层状态（全局单例）
 *
 * 点击前台页面的「管理XX」不再跳转 /admin，而是在当前页弹出内容管理面板
 * （ContentManageDialog 内嵌唯一的 ContentPanel，仍是一套编辑器）。
 *
 * 为什么用模块级单例：弹层只有一个（挂在 App.vue），但触发入口分散在
 * AboutView / MomentsBoard / LogsView 等多处，必须共享同一份开关状态。
 * ========================================================================== */
import { reactive } from 'vue';

/* openManage(mod) 会同时设置 content store 的 adminModule ——
 * ContentPanel 挂载时读取它作为初始 tab，因此弹层里直接落在对应模块上。 */
const state = reactive({ open: false, mod: 'about' });

export function useManageDialog() {
  function openManage(mod) {
    if (mod) state.mod = mod;
    state.open = true;
  }
  function closeManage() { state.open = false; }
  return { state, openManage, closeManage };
}
