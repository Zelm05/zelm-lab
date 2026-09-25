<script setup>
/* 预设头像：注册时选一个，存 users.avatar（'av1'..'av6'）。
 * 用 emoji 而不是图片 —— 不依赖任何静态资源，任何主题/语言下都能显示。 */
const AVATARS = [
  { id: 'av1', emoji: '🐱', tk: 'avCat' },
  { id: 'av2', emoji: '🐶', tk: 'avDog' },
  { id: 'av3', emoji: '🐼', tk: 'avPanda' },
  { id: 'av4', emoji: '🦊', tk: 'avFox' },
  { id: 'av5', emoji: '🐯', tk: 'avTiger' },
  { id: 'av6', emoji: '🦁', tk: 'avLion' },
];

/* ==========================================================================
 * AuthPanel.vue —— 登录 / 注册弹窗
 *
 * 原实现（src/modules/auth-panel.js，498 行）：模块一执行就 createElement
 *   拼出整个弹窗、再 createElement('style') 往 head 里插一份 CSS、append 到
 *   document.body；文案靠 querySelectorAll 按下标刷，表单值留在 DOM 里。
 * 现在：弹窗是普通 SFC，状态在 stores/auth.js，文案在 packs/auth.js，
 *   样式在 styles/auth-panel.css（交给 Vite 打包，不再是运行时注入）。
 *   组件常驻在 App.vue 中，所以切换页面时弹窗状态不会丢。
 *
 * 对外接口保持不变：其它模块仍旧 import { AuthPanel } from '@/modules/auth-panel'，
 * 那个文件现在是本组件状态的薄门面。
 * ========================================================================== */
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useI18n } from '@/core/i18n';

const a = useAuthStore();

/* P3-6：头像 alt 是跨页面共用文案（欢迎页/主站/管理台/登录弹窗四处），
 * 统一放 common 命名空间，避免同一个字符串在 4 个包里各写一遍。 */
const { t: tc } = useI18n('common');

const loginUserEl = ref(null);
const regUserEl = ref(null);

/* 打开时聚焦第一个输入框（原实现是 setTimeout 60ms 后 focus，等入场动画） */
/* P2-13：打开时记录触发元素、关闭时归还焦点 + 焦点陷阱 */
let prevFocus = null;
watch(() => a.visible, async (on) => {
  if (!on) {
    try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) { /* 忽略 */ }
    prevFocus = null;
    return;
  }
  prevFocus = document.activeElement;
  await nextTick();
  setTimeout(() => {
    const el = a.tab === 'login' ? loginUserEl.value : regUserEl.value;
    try { if (el) el.focus(); } catch (e) { /* 忽略 */ }
  }, 60);
});

/* P2-13：Esc 关闭 + 焦点在登录/冲突弹窗内循环 */
function panelFocusables() {
  const conflict = document.querySelector('#apConflictModal:not([hidden])');
  const scope = conflict || document.querySelector('.auth-modal:not([hidden])');
  if (!scope) return [];
  return Array.from(scope.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter((el) => !el.disabled && !el.hidden && el.offsetParent !== null);
}
function onKeydown(e) {
  if (!a.visible) return;
  if (e.key === 'Escape') { a.close(); return; }
  if (e.key === 'Tab') {
    const f = panelFocusables();
    if (f.length === 0) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

/* 全局委托：任何带 data-auth-open 的按钮都能唤起认证窗（欢迎页 / 主站 / 关于我） */
function onDocClick(e) {
  const opener = e.target && e.target.closest && e.target.closest('[data-auth-open]');
  if (opener) a.open(opener.dataset.authOpen);
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('click', onDocClick);
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  document.removeEventListener('click', onDocClick);
});
</script>

<template>
  <!-- 认证弹窗（宿主在 #viewRoot 之外，因此不会被 z-index:1 的层叠上下文压低） -->
  <div class="auth-modal" :hidden="!a.visible" role="dialog" aria-modal="true">
    <div class="auth-backdrop" @click="a.close()"></div>
    <div class="auth-card">
      <button type="button" class="auth-close" :aria-label="a.T.close" @click="a.close()">✕</button>

      <div class="auth-head">
        <img src="assets/avatar.jpg" :alt="tc('avatarAlt')" width="256" height="256" />
        <span id="apTitle" class="auth-title">{{ a.title }}</span>
      </div>

      <!-- 登录 / 注册 Tab：原生 button 胶囊分段（el-radio-button 的原生圆点挤在一起，样式差） -->
      <div id="apTabs" class="auth-tabs" role="tablist">
        <button
          type="button"
          class="auth-tab"
          role="tab"
          :aria-selected="a.tab === 'login'"
          :class="{ active: a.tab === 'login' }"
          @click="a.switchTab('login')"
        >{{ a.T.tabLogin }}</button>
        <button
          type="button"
          class="auth-tab"
          role="tab"
          :aria-selected="a.tab === 'register'"
          :class="{ active: a.tab === 'register' }"
          @click="a.switchTab('register')"
        >{{ a.T.tabReg }}</button>
      </div>

      <!-- 登录面板 -->
      <div id="apPanelLogin" class="auth-panel" :hidden="a.tab !== 'login'">
        <form id="apLoginForm" novalidate @submit.prevent="a.doLogin(false)">
          <div class="auth-field">
            <label for="apLoginUser">{{ a.T.username }}</label>
            <input id="apLoginUser" ref="loginUserEl" v-model="a.loginUser" class="auth-input" type="text" autocomplete="username" :placeholder="a.T.uPlace" />
            <div class="auth-hint">{{ a.T.loginNameHint }}</div>
          </div>
          <div class="auth-field">
            <label for="apLoginPass">{{ a.T.password }}</label>
            <input id="apLoginPass" v-model="a.loginPass" class="auth-input" type="password" autocomplete="current-password" :placeholder="a.T.pPlace" required />
          </div>
          <button id="apLoginBtn" class="auth-btn" type="submit" :disabled="a.loginBusy">
            {{ a.loginBusy ? '…' : a.T.btnLogin }}
          </button>
          <div id="apLoginMsg" class="auth-msg" :class="a.loginMsg.type">{{ a.loginMsg.text }}</div>
        </form>
        <div id="apLoginLink" class="auth-link">{{ a.T.linkLogin }}<a href="#" @click.prevent="a.switchTab('register')">{{ a.T.toReg }}</a></div>
      </div>

      <!-- 注册面板 -->
      <div id="apPanelRegister" class="auth-panel" :hidden="a.tab !== 'register'">
        <form id="apRegForm" novalidate @submit.prevent="a.doRegister()">
          <div class="auth-field">
            <label for="apRegUser">{{ a.T.username }}</label>
            <input id="apRegUser" ref="regUserEl" v-model="a.regUser" class="auth-input" type="text" autocomplete="username" :placeholder="a.T.ruPlace" />
            <div class="auth-hint">{{ a.T.uHint }}</div>
          </div>
          <div class="auth-field">
            <label for="apRegPass">{{ a.T.password }}</label>
            <input id="apRegPass" v-model="a.regPass" class="auth-input" type="password" autocomplete="new-password" :placeholder="a.T.rpPlace" />
            <div class="auth-hint">{{ a.T.pHint }}</div>
          </div>
          <div class="auth-field">
            <label for="apRegConfirm">{{ a.T.confirm }}</label>
            <input id="apRegConfirm" v-model="a.regConfirm" class="auth-input" type="password" autocomplete="new-password" :placeholder="a.T.cPlace" />
          </div>
          <!-- 头像选择已移除（2026-09-25 第六批）：注册不再选头像，users.avatar 走默认值 -->
          <div class="auth-field">
            <label class="auth-agree">
              <input id="apRegAgree" v-model="a.regAgree" type="checkbox" />
              <span v-html="a.agreeHtml"></span>
            </label>
          </div>
          <button id="apRegBtn" class="auth-btn" type="submit" :disabled="a.regBusy">
            {{ a.regBusy ? '…' : a.T.btnReg }}
          </button>
          <div id="apRegMsg" class="auth-msg" :class="a.regMsg.type">{{ a.regMsg.text }}</div>
        </form>
        <div id="apRegLink" class="auth-link">{{ a.T.linkReg }}<a href="#" @click.prevent="a.switchTab('login')">{{ a.T.toLogin }}</a></div>
      </div>
    </div>
  </div>

  <!-- 单端登录冲突二次确认（z-index 必须高于登录框，否则会被遮住） -->
  <div
    id="apConflictModal"
    class="modal-overlay"
    :hidden="!a.conflict.visible"
    @click.self="a.cancelConflict()"
  >
    <div class="modal conflict-modal" role="dialog" :aria-label="a.T.conflictAria">
      <div class="conflict-icon"><svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M12 2 1 21h22L12 2zm1 14h-2v2h2v-2zm0-8h-2v6h2V8z"/></svg></div>
      <h3 class="conflict-title">{{ a.T.kickTitle }}</h3>
      <p class="conflict-desc">{{ a.conflict.message || a.T.conflictDescFallback }}</p>
      <div class="conflict-buttons">
        <button id="apConflictCancel" type="button" class="conflict-btn conflict-cancel" @click="a.cancelConflict()">{{ a.T.conflictCancel }}</button>
        <button id="apConflictOk" type="button" class="conflict-btn conflict-ok" @click="a.confirmConflict()">{{ a.T.conflictContinue }}</button>
      </div>
    </div>
  </div>
</template>

<!-- 样式原在 src/styles/auth-panel.css，已合并进本组件 -->
<style>
/* 来自 auth-panel.css（合并进组件，未加 scoped —— 保持与原来一致的全局作用域） */
/* ==========================================================================
 * auth-panel.css —— 登录 / 注册弹窗样式
 *
 * 原实现把这段 CSS 拼成字符串，在 auth-panel.js 执行时 createElement('style')
 * 注入 document.head —— 每挂载一次视图就多注入一份，实测切几轮视图会累积多个
 * \3c style>。现在作为真正的样式表交给 Vite 打包（带内容哈希，可长期强缓存）。
 * 选择器与原字符串逐条一致，避免任何视觉回归。
 * ========================================================================== */

.auth-modal { position: fixed; inset: 0; z-index: 2000; display: flex; align-items: center; justify-content: center; padding: 16px; }
.auth-modal[hidden] { display: none; }

.auth-backdrop { position: absolute; inset: 0; background: rgba(2, 8, 6, .55); backdrop-filter: blur(8px) brightness(.55) saturate(120%); -webkit-backdrop-filter: blur(8px) brightness(.55) saturate(120%); animation: authFade .25s ease; }
@keyframes authFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes authPop { from { opacity: 0; transform: scale(.92) translateY(14px); } to { opacity: 1; transform: scale(1) translateY(0); } }

.auth-card {
  position: relative; z-index: 1; width: min(480px, 92vw);
  /* 注册页带头像选择器后卡片很高，窗口一矮就会顶出屏幕 —— 原来完全没有上限。
     用 %（相对 .auth-modal 这个 fixed 容器）而不是 vh：`vh` 不随 body 的 zoom 缩放。 */
  max-height: 86%;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: rgba(13, 24, 19, .88);
  border: 1px solid color-mix(in srgb, var(--accent) 28%, transparent);
  border-radius: 20px; padding: 24px; color: #e9edf6;
  box-shadow: 0 24px 80px rgba(0, 0, 0, .55), 0 0 44px color-mix(in srgb, var(--accent) 12%, transparent);
  backdrop-filter: blur(22px); -webkit-backdrop-filter: blur(22px);
  animation: authPop .32s cubic-bezier(.34, 1.56, .64, 1);
}

.auth-head { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 4px; }
.auth-head img { width: 42px; height: 42px; border-radius: 50%; border: 2px solid color-mix(in srgb, var(--accent) 45%, transparent); box-shadow: 0 0 14px color-mix(in srgb, var(--accent) 25%, transparent); object-fit: cover; }
.auth-title { font-size: 1rem; font-weight: 700; letter-spacing: .5px; background: linear-gradient(135deg, var(--accent), var(--accent-2)); -webkit-background-clip: text; background-clip: text; color: transparent; }

.auth-close { position: absolute; top: 12px; right: 12px; width: 30px; height: 30px; border-radius: 50%; border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); background: rgba(255, 255, 255, .04); color: #9fe8d8; font-size: 1rem; line-height: 1; cursor: pointer; display: grid; place-items: center; transition: all .2s; }
.auth-close:hover { transform: rotate(90deg) scale(1.08); border-color: var(--accent); color: var(--accent); box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 35%, transparent); }

.auth-tabs { display: inline-flex; width: 100%; background: rgba(255, 255, 255, .07); border-radius: 999px; padding: 3px; gap: 3px; border: 1px solid color-mix(in srgb, var(--accent) 18%, transparent); margin: 14px 0 6px; box-sizing: border-box; }
.auth-tab { flex: 1; border: none; background: none; color: rgba(255, 255, 255, .6); font-size: 0.875rem; font-weight: 600; font-family: inherit; padding: 8px 0; border-radius: 999px; cursor: pointer; transition: all .2s; }
.auth-tab:hover { color: rgba(255, 255, 255, .9); background: rgba(255, 255, 255, .05); }
.auth-tab.active { background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 92%, transparent), color-mix(in srgb, var(--accent-2) 92%, transparent)); color: #022; box-shadow: 0 2px 12px color-mix(in srgb, var(--accent) 30%, transparent); }

.auth-panel[hidden] { display: none; }
.auth-field { margin-top: 12px; }
.auth-field label { display: block; font-size: .8rem; margin-bottom: 5px; opacity: .8; letter-spacing: .3px; }
.auth-input { width: 100%; box-sizing: border-box; padding: 11px 13px; border-radius: 11px; border: 1px solid rgba(255, 255, 255, .14); background: rgba(255, 255, 255, .06); color: #e9edf6; font-size: 0.9rem; font-family: inherit; outline: none; transition: border-color .2s, box-shadow .2s; }
.auth-input::placeholder { color: rgba(255, 255, 255, .36); }
.auth-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent); }
.auth-hint { font-size: 0.75rem; opacity: .5; margin-top: 4px; }

.auth-btn { width: 100%; margin-top: 18px; padding: 12px; border: none; border-radius: 11px; background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 95%, transparent), color-mix(in srgb, var(--accent-2) 95%, transparent)); color: #022; font-size: 1rem; font-weight: 700; font-family: inherit; cursor: pointer; letter-spacing: 2px; transition: transform .15s, box-shadow .2s, opacity .2s; box-shadow: 0 4px 18px color-mix(in srgb, var(--accent) 25%, transparent); }
.auth-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 24px color-mix(in srgb, var(--accent) 40%, transparent); }
.auth-btn:active { transform: translateY(0); }
.auth-btn:disabled { opacity: .55; cursor: not-allowed; transform: none; }

.auth-msg { margin-top: 12px; font-size: .8rem; min-height: 16px; text-align: center; }
.auth-msg.err { color: #f87171; }
.auth-msg.ok { color: #4ade80; }

.auth-link { margin-top: 12px; text-align: center; font-size: .8rem; opacity: .85; }
.auth-link a { color: var(--accent); text-decoration: none; font-weight: 600; }
.auth-link a:hover { text-decoration: underline; }

/* 隐私政策同意勾选 */
.auth-agree { display: flex; align-items: flex-start; gap: 10px; margin: 2px 0 4px; font-size: 0.875rem; line-height: 1.7; cursor: pointer; }
.auth-agree input { margin: 4px 10px 0 0; accent-color: #2d7a5a; flex-shrink: 0; width: 14px; height: 14px; }
.auth-agree > span { flex: 1; }
.auth-agree a { color: #4ff0d0; text-decoration: none; border-bottom: 1px solid rgba(79, 240, 208, .4); }

/* ---------------- 浅色主题 ---------------- */
html[data-theme="light"] .auth-card { background: rgba(244, 250, 247, .92); color: #0f2a1e; border-color: rgba(45, 122, 90, .25); box-shadow: 0 24px 80px rgba(20, 60, 40, .18), 0 0 40px rgba(45, 122, 90, .1); }
html[data-theme="light"] .auth-close { border-color: rgba(45, 122, 90, .3); background: rgba(45, 122, 90, .05); color: #2d7a5a; }
html[data-theme="light"] .auth-close:hover { border-color: #2d7a5a; color: #2d7a5a; }
html[data-theme="light"] .auth-tabs { background: rgba(45, 122, 90, .08); border-color: rgba(45, 122, 90, .18); }
html[data-theme="light"] .auth-tab { color: rgba(26, 46, 34, .7); }
html[data-theme="light"] .auth-tab:hover { color: rgba(26, 46, 34, .9); background: rgba(45, 122, 90, .08); }
html[data-theme="light"] .auth-input { background: rgba(45, 122, 90, .06); border-color: rgba(45, 122, 90, .18); color: #0f2a1e; }
html[data-theme="light"] .auth-input::placeholder { color: rgba(26, 46, 34, .55); }
html[data-theme="light"] .auth-input:focus { border-color: #2d7a5a; box-shadow: 0 0 0 3px rgba(45, 122, 90, .14); }
html[data-theme="light"] .auth-link a { color: #276b4e; }
html[data-theme="light"] .auth-agree a { color: #276b4e; border-bottom-color: rgba(45, 122, 90, .4); }

/* ===== 头像选择器（注册时选预设头像）===== */
.avatar-option:focus-visible {
  outline: 2px solid var(--accent, #4ff0d0);
  outline-offset: 2px;
}
</style>
