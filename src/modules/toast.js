/* ==========================================================================
 * src/modules/toast.js —— 轻量提示 + 统一 API 错误处理
 *
 * 原实现分散在社区脚本里（apiErr / showApiToast），其它模块各写一遍类似逻辑。
 * 现收敛成一处，供留言板、反馈、管理台等复用。
 *
 * apiErr 的两条分支与原行为一致：
 *   401 / "请先登录" → 直接弹登录框（而不是丢一句没人看懂的错误）
 *   其它错误       → 浮动提示
 * ========================================================================== */
import { AuthPanel } from '@/modules/auth-panel';
import { i18n } from '@/core/i18n';

const LOGIN_ERR_RE = /请先[登登]录|unauthorized|401/i;

/** 浮动提示：优先复用页面上的 #toast 容器，没有就临时造一个 */
export function showToast(text, ms) {
  const dur = ms || 2200;
  /* P2-11：同步写入屏幕阅读器 live region，保证读屏用户也能收到提示 */
  const live = document.getElementById('toast-live');
  if (live) live.textContent = text;
  const el = document.getElementById('toast');
  if (el) {
    el.textContent = text;
    el.classList.add('show');
    el.hidden = false;
    setTimeout(() => { el.classList.remove('show'); }, dur);
    return;
  }
  const floater = document.createElement('div');
  floater.textContent = text;
  floater.style.cssText =
    'position:fixed;bottom:calc(24px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);z-index:99999;' +
    'padding:10px 20px;background:rgba(9,14,20,.94);color:var(--text,#e8fbf7);' +
    'border:1px solid var(--border,rgba(79,240,208,.18));border-radius:10px;font-size:.85rem;' +
    'font-family:inherit;box-shadow:0 8px 30px rgba(0,0,0,.45);animation:fadeIn .2s ease;pointer-events:none;';
  document.body.appendChild(floater);
  setTimeout(() => { try { floater.remove(); } catch (e) { /* 忽略 */ } }, dur);
}

/** 统一错误处理（同原 apiErr） */
export function apiErr(msg, fallback) {
  if (!msg) { showToast(fallback || i18n.global.t('common.opFailed')); return; }
  if (LOGIN_ERR_RE.test(msg)) {
    if (AuthPanel) AuthPanel.open('login');
    else showToast(msg);
  } else {
    showToast(msg);
  }
}
