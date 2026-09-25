/* ==========================================================================
 * src/stores/auth.js —— 登录 / 注册弹窗状态
 *
 * 原实现在 src/modules/auth-panel.js（498 行）里：
 *   - 一进模块就 createElement 出整个弹窗 + 注入一份 <style>，再 append 到 body
 *   - 文案靠 applyLang() 用 querySelectorAll 按下标硬刷（labels[0] 是 username…
 *     这种"靠顺序猜"的写法，改一处结构就会错位）
 *   - 表单值、错误提示、按钮禁用态全存在 DOM 上，组件之间只能靠读写 DOM 通信
 * 现在：状态（当前 Tab / 表单值 / 提示 / 请求中 / 顶号确认）都在这里，
 * 文案由 packs/auth.js 提供，DOM 交给 AuthPanel.vue 的模板推导。
 *
 * 保留的原站行为：
 *   - 登录后按当前视图决定「就地关闭」还是「切回主站」，绝不 reload
 *     （reload 会销毁外壳的常驻 <audio>，音乐会被打断）
 *   - 单端登录冲突：返回 conflict 时弹二次确认，确认后带 force 重发
 *   - 注册必须先勾选隐私政策与服务条款；两次密码不一致直接拦下
 *   - 注册成功 → 用户名回填到登录框 → 800ms 后自动切到登录 Tab
 * ========================================================================== */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { postJSON } from '@/api/http';
import { session } from '@/core/session';
import { shell } from '@/core/shell';
import { useI18n, i18n } from '@/core/i18n';
import authPack from '@/i18n/packs/auth';   /* 仅用于中文兜底，实际文案走 i18n */

export const useAuthStore = defineStore('auth', () => {
  const { t } = useI18n('auth');

  /* ---------------- 状态 ---------------- */
  const visible = ref(false);
  const tab = ref('login');            // 'login' | 'register'
  const loginUser = ref('');
  const loginPass = ref('');
  const regUser = ref('');
  const regPass = ref('');
  const regConfirm = ref('');
  const regAvatar = ref('av1');   // 注册时选的头像（'av1'..'av6'）
  const regAgree = ref(false);
  const loginMsg = ref({ text: '', type: '' });   // type: '' | 'err' | 'ok'
  const regMsg = ref({ text: '', type: '' });
  const loginBusy = ref(false);
  const regBusy = ref(false);
  const conflict = ref({ visible: false, message: '', onContinue: null });

  /* ---------------- 文案（跟随当前语言，P1-3） ----------------
   *
   * 曾经这里写的是 `const T = authPack.zh;` —— 常量，永远是中文，
   * 导致切到 English / 日本語 时登录注册弹窗整块不跟着变（四语言形同虚设）。
   * 注释里当时写「用 t() 会显示 raw key，根因待查」—— 那是旧的 rawMessageCompiler
   * 时期的问题，现在用的是 vue-i18n 原生编译器（见 core/i18n.js 顶部注释），
   * `t()` 已经能正常取到文案。
   *
   * 现在 T 改成 computed：
   *   · 以 authPack.zh 为底（自带中文兜底，某个 key 在目标语言缺失时不会变空白），
   *   · 再铺上当前 locale 的 auth 段；
   *   · computed 内读 i18n.global.locale.value → 语言切换时自动重算，
   *     Pinia 会把 ref 解包，模板里的 `a.T.xxx` 21 处引用**一行都不用改**。
   */
  const T = computed(() => ({
    ...authPack.zh,
    ...((i18n.global.getLocaleMessage(i18n.global.locale.value) || {}).auth || {}),
  }));

  /* 同意条款那段含 <a> 标记，模板用 v-html 渲染（AuthPanel.vue:146）。
   * 四个语言包里都有该 key 且链接路径一致（#/privacy、#/privacy/t），已核对。
   * ⚠️ 这是开发者文案，不是用户输入 —— 不构成 XSS 面。 */
  const agreeHtml = computed(() => t('agreeText'));

  const title = computed(() => (tab.value === 'register' ? T.value.titleReg : T.value.titleLogin));

  /* ---------------- 开合 ---------------- */
  let pendingClose = null;

  function lockScroll(on) {
    document.body.style.overflow = on ? 'hidden' : '';
    document.documentElement.style.overflow = on ? 'hidden' : '';
  }
  function clearMsg() {
    loginMsg.value = { text: '', type: '' };
    regMsg.value = { text: '', type: '' };
  }
  function open(name) {
    switchTab(name === 'register' ? 'register' : 'login');
    visible.value = true;
    lockScroll(true);
  }
  function close() {
    visible.value = false;
    lockScroll(false);
    clearMsg();
    // 通知等待中的 requireLogin()（以及任何关心关闭时机的调用方）
    document.dispatchEvent(new CustomEvent('authpanel:close', { bubbles: true }));
    if (pendingClose) { const f = pendingClose; pendingClose = null; f(); }
  }
  function switchTab(name) {
    tab.value = name === 'register' ? 'register' : 'login';
    clearMsg();
    // 原实现把按钮禁用态焊死在 DOM 上，注册成功切回登录后再点注册会一直是禁用态 —— 这里一并复位
    loginBusy.value = false;
    regBusy.value = false;
  }

  /* ---------------- 登录成功后的去向 ---------------- */
  function onLoginSuccess() {
    /* 通知其它模块（外壳的音乐播放器据此启动单端登录守护） */
    try { document.dispatchEvent(new Event('zelm:login')); } catch (e) { /* 忽略 */ }
    /* ⚠️ 必须**无条件关闭弹窗**（2026-09-25 修）：
       原实现在非 home 页走 `shell.goPage('home')`，而它只是 router.push('/home') ——
       只切页、不关弹窗 → 从 /logs、/about 等页面登录后弹窗一直挂着不消失。
       SPA 下登录态是响应式的（user store），不需要切页刷新用户态。 */
    close();
  }

  /* ---------------- 提交 ---------------- */
  async function doLogin(force) {
    loginBusy.value = true;
    loginMsg.value = { text: '', type: '' };
    let res;
    try {
      res = await postJSON('/api/login', {
        username: loginUser.value.trim(),
        password: loginPass.value,
        force: !!force,
      });
    } catch (e) {
      loginMsg.value = { text: t('netErr'), type: 'err' };
      loginBusy.value = false;
      return;
    }
    if (res.ok) {
      loginMsg.value = { text: t('entering'), type: 'ok' };
      setTimeout(onLoginSuccess, 450);
    } else if (res.data && res.data.conflict) {
      // 单端登录冲突：问一句是否继续（继续将顶掉原设备）
      loginBusy.value = false;
      loginMsg.value = { text: '', type: '' };
      conflict.value = { visible: true, message: res.data.message, onContinue: () => doLogin(true) };
    } else {
      loginMsg.value = { text: (res.data && res.data.error) || t('netErr'), type: 'err' };
      loginBusy.value = false;
    }
  }

  async function doRegister() {
    regMsg.value = { text: '', type: '' };
    // 明示同意：未勾选隐私政策与服务条款时不允许注册
    if (!regAgree.value) { regMsg.value = { text: t('agreeRequired'), type: 'err' }; return; }
    if (regPass.value !== regConfirm.value) { regMsg.value = { text: t('pwMismatch'), type: 'err' }; return; }
    regBusy.value = true;
    let res;
    try {
      res = await postJSON('/api/register', {
        username: regUser.value.trim(),
        password: regPass.value,
        avatar: regAvatar.value,
      });
    } catch (e) {
      regMsg.value = { text: t('netErr'), type: 'err' };
      regBusy.value = false;
      return;
    }
    if (res.ok) {
      regMsg.value = { text: t('regOk'), type: 'ok' };
      loginUser.value = regUser.value.trim();   // 回填，省得再敲一遍
      setTimeout(() => switchTab('login'), 800);
    } else {
      regMsg.value = { text: (res.data && res.data.error) || t('netErr'), type: 'err' };
      regBusy.value = false;
    }
  }

  /* ---------------- 单端登录冲突二次确认 ---------------- */
  function confirmConflict() {
    const fn = conflict.value.onContinue;
    conflict.value = { visible: false, message: '', onContinue: null };
    if (fn) fn();
  }
  function cancelConflict() {
    conflict.value = { visible: false, message: '', onContinue: null };
  }

  /* ---------------- requireLogin：统一登录拦截 ---------------- */
  /** 未登录时弹出登录框并等待结果：登录成功 resolve，用户关闭弹窗 reject
   *  @returns {Promise<void>} */
  function requireLogin() {
    return new Promise((resolve, reject) => {
      if (session.user) { resolve(); return; }
      const cleanup = () => {
        document.removeEventListener('zelm:login', onLogin);
        pendingClose = null;
      };
      const onLogin = () => { cleanup(); resolve(); };
      document.addEventListener('zelm:login', onLogin);
      pendingClose = () => { cleanup(); reject(new Error('login_cancelled')); };
      open('login');
    });
  }

  return {
    visible, tab, loginUser, loginPass, regUser, regPass, regConfirm, regAgree, regAvatar,
    loginMsg, regMsg, loginBusy, regBusy, conflict,
    T, agreeHtml, title,
    open, close, switchTab, doLogin, doRegister, confirmConflict, cancelConflict,
    requireLogin,
  };
});
