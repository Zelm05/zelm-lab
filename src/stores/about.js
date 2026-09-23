/* ==========================================================================
 * src/stores/about.js —— 「关于我」页的状态（Pinia）
 *
 * 原状（src/modules/pages/about.js，784 行）：门控靠手工改 3 个元素的 hidden，
 *   密码输入值 / 错误提示 / 按钮禁用态都挂在 DOM 上；设置面板、语言切换、
 *   照片墙、星光、页脚联系方式全挤在同一个 IIFE 里。
 * 现在：这个 store 只管一件事 —— **谁可以看到正文**。
 *
 * 门控判定顺序（与原站逐条一致，顺序不能调）：
 *   ① 站长开启「关于页需要登录」且访客未登录        → 登录门
 *   ② 站长本人（role = owner）                      → 免密直接进
 *   ③ 站长已关闭「访问密码」                        → 免密直接进
 *   ④ 主站刚验过密码（sessionStorage 一次性放行标记）→ 直接进
 *   ⑤ 其余情况                                      → 密码门
 *
 * 保留的原站细节：
 *   - 密码验过之后先关窗、200ms 后再展示正文（原站为避免「直接闪进去」的突兀感）
 *   - 密码门每次进入都要重新输密码（不放行到 localStorage，只放行一次）
 *   - 登出按钮仅在「免登录也能进关于页」时出现（需登录时不给登出，免得误退出后进不来）
 * 改动的一处：原站登出后 window.location.reload()，这里改为就地重新判定门控 ——
 *   用户看到的结果一样，但不会打断外壳里正在播放的音乐（与 auth store 的取舍一致）。
 * ========================================================================== */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { postJSON } from '@/api/http';
import { useI18n } from '@/core/i18n';
import { useUserStore } from '@/stores/user';
import { useSiteCfgStore } from '@/stores/site-cfg';
import { AuthPanel } from '@/modules/auth-panel';

/** 主站点的「进入关于页」记下的待办意图：登录成功后主站据此接着弹密码窗 */
const PENDING_KEY = 'zelm_pending_about';
/** 主站密码窗验过密码后写下的一次性放行标记（进关于页后即用即弃） */
const ONESHOT_KEY = 'zelm_about_ok';

/** 读一次并立刻抹掉（sessionStorage 不可用时按「没有标记」处理） */
function takeOnce(key) {
  try {
    const v = sessionStorage.getItem(key) === '1';
    sessionStorage.removeItem(key);
    return v;
  } catch (e) {
    return false;
  }
}

export const useAboutStore = defineStore('about', () => {
  const { t } = useI18n('about');
  const user = useUserStore();
  const siteCfg = useSiteCfgStore();

  /** 门控状态：loading | login | password | main | none（none = 三块都不显示，用户已转去登录弹窗） */
  const gate = ref('loading');
  /** 密码门 */
  const pw = ref('');
  const pwMsg = ref('');
  const pwBusy = ref(false);

  const showLoginGate = computed(() => gate.value === 'login');
  const showPwGate = computed(() => gate.value === 'password');
  const showMain = computed(() => gate.value === 'main');
  /** 照片墙显隐（站长在管理台配置）：正文板块与左侧导航项同进同退 */
  const photoWallOn = computed(() => siteCfg.photoWallOn);
  /** 登出按钮：需要登录才能进关于页时不显示 */
  const logoutHidden = computed(() => siteCfg.aboutLoginRequired);

  /** 判定该给访客看哪一道门（进入页面、登出后各调用一次） */
  async function init() {
    gate.value = 'loading';
    const oneShot = takeOnce(ONESHOT_KEY);

    // 需要「最新」的登录态与站点配置：接口异常时各自回退
    // （登录态回退成未登录，配置回退成 Worker 随页面下发的 Cookie 快照）
    await Promise.all([user.load(), siteCfg.load()]);

    if (!user.isLoggedIn && siteCfg.aboutLoginRequired) { gate.value = 'login'; return; }
    if (user.isOwner) { gate.value = 'main'; return; }
    if (!siteCfg.aboutPasswordEnabled) { gate.value = 'main'; return; }
    if (oneShot) { gate.value = 'main'; return; }

    pw.value = '';
    pwMsg.value = '';
    gate.value = 'password';
  }

  /** 密码正确后：先关窗，200ms 后再展示正文（原站行为） */
  function enterAfterGateClose() {
    gate.value = 'none';
    setTimeout(() => { gate.value = 'main'; }, 200);
  }

  /** 校验访问密码 */
  async function submitPw() {
    if (!pw.value) { pwMsg.value = t('pwEmpty'); return; }
    pwBusy.value = true;
    let res;
    try {
      res = await postJSON('/api/about/auth', { password: pw.value });
    } catch (e) {
      pwBusy.value = false;
      pwMsg.value = t('netErr');
      return;
    }
    pwBusy.value = false;
    if (res.ok && res.data && res.data.ok) { enterAfterGateClose(); return; }
    pwMsg.value = t('pwWrong');
    pw.value = '';
  }

  /** 登录门上的「登录账号」：记下待办意图 → 收起当前门 → 打开登录弹窗 */
  function goLogin() {
    // 登录成功后认证弹窗会切回主站，主站据标记继续弹密码窗并回到本页
    try { sessionStorage.setItem(PENDING_KEY, '1'); } catch (e) { /* 忽略 */ }
    // 收起当前门，避免登录面板叠在密码门之上造成视觉混乱
    gate.value = 'none';
    AuthPanel.open('login');
  }

  /** 登出：清掉登录态后重新判定门控（需要登录的站点会回到登录门） */
  async function logout() {
    await user.logout();
    await init();
  }

  return {
    gate, pw, pwMsg, pwBusy,
    showLoginGate, showPwGate, showMain, photoWallOn, logoutHidden,
    init, submitPw, goLogin, logout,
  };
});
