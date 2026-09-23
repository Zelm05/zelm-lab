/* ==========================================================================
 * src/modules/auth-panel.js —— 认证弹窗门面（薄）
 *
 * 真正的实现已经搬到：
 *   界面 → src/components/AuthPanel.vue
 *   状态 → src/stores/auth.js
 *   文案 → src/i18n/packs/auth.js
 *   样式 → src/styles/auth-panel.css
 *
 * 这里只保留对外接口，让既有调用方（留言板 / 反馈区 / toast / 主站 / 关于我）
 * 继续用 AuthPanel.open('login') 这套老写法，无需改动。
 * ========================================================================== */
import { useAuthStore } from '@/stores/auth';

/** 惰性取 store：调用发生在运行时（此时 Pinia 已安装），不是模块加载时 */
const store = () => useAuthStore();

export const AuthPanel = {
  /** 打开认证弹窗：'login' | 'register' */
  open(tab) { store().open(tab); },
  /** 关闭认证弹窗 */
  close() { store().close(); },
  /** 切换 Tab：'login' | 'register' */
  switchTab(tab) { store().switchTab(tab); },
};

/** 统一登录拦截：未登录时弹窗并等待；登录成功 resolve，用户关闭则 reject */
export function requireLogin() {
  return store().requireLogin();
}
