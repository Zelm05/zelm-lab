/* ==========================================================================
 * src/stores/user.js —— 登录态（Pinia）
 *
 * 这是本次迁移收益最大的一处：原站的登录态 UI 逻辑是「谁需要谁自己写一遍」——
 *   home.head1.js 拉 /api/me 后手工改 #userInfo / #guestBox / #userName / #adminBtn
 *   设置面板、留言板、管理台又各自判断一次角色
 * 现在统一成一份 store，组件用模板绑定，第三方脚本用 session 快照。
 * ========================================================================== */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { session } from '@/core/session';

export const useUserStore = defineStore('user', () => {
  const user = ref(null);
  /** 是否已拉取过一次（社区模块需要区分「未知」与「未登录」） */
  const loaded = ref(false);

  const name = computed(() => (user.value && user.value.username) || '');
  const isLoggedIn = computed(() => !!user.value);
  const isAdmin = computed(
    () => !!user.value && (user.value.role === 'admin' || user.value.role === 'owner'),
  );
  const isOwner = computed(() => !!user.value && user.value.role === 'owner');

  /** 写入登录态；同时同步给 src/core/session.js，供原站脚本按老方式读取 */
  function set(d) {
    user.value = d || null;
    session.user = d || null;
    loaded.value = true;
  }

  /** 拉取当前登录用户（原 home.head1.js 的 loadUser） */
  async function load() {
    try {
      const r = await fetch('/api/me', { credentials: 'include' });
      set(r.ok ? await r.json() : null);
    } catch (e) {
      set(null);
    }
    return user.value;
  }

  /** 登出。为与线上原站行为一致，这里只清状态并发事件，页面刷新由调用方决定 */
  async function logout() {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    } catch (e) { /* 忽略：本地状态无论接口成败都要清掉 */ }
    set(null);
    try { document.dispatchEvent(new Event('zelm:logout')); } catch (e) { /* 忽略 */ }
  }

  return { user, loaded, name, isLoggedIn, isAdmin, isOwner, set, load, logout };
});
