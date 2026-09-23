/* ==========================================================================
 * src/core/session-guard.js —— 单端登录守护
 *
 * 原寄生在 stores/player.js（音乐播放器是常驻组件，顺手承担了轮询）。
 * 播放器移除后独立成模块，逻辑逐行保留：
 *   - 每 15s 轮询 /api/session/check（登录态下才启动轮询）
 *   - 被顶号（body.kicked）→ kicked = true，弹窗由 SessionKick.vue 渲染
 *   - 网络错误不处理、未登录不轮询（与原实现一致）
 * 启动时机：App.vue onMounted（原为播放器挂载时，等价）
 * ========================================================================== */
import { ref } from 'vue';

const SESSION_CHECK_MS = 15000;
let sessionTimer = null;

/** 被顶号 → true，SessionKick.vue 据此显示弹窗 */
export const kicked = ref(false);

function stopSessionGuard() {
  if (sessionTimer) { clearInterval(sessionTimer); sessionTimer = null; }
}

function sessionCheck() {
  fetch('/api/session/check', { credentials: 'include' })
    .then((r) => {
      if (r.ok) return;
      return r.json()
        .then((body) => {
          stopSessionGuard();
          if (body && body.kicked) kicked.value = true;
        })
        .catch(() => { stopSessionGuard(); });
    })
    .catch(() => { /* 网络错误不处理 */ });
}

/** 登录态下启动轮询（未登录 / 网络错误则不启动，与原实现一致） */
export function startSessionGuard() {
  stopSessionGuard();
  fetch('/api/session/check', { credentials: 'include' })
    .then((r) => { if (r.ok) sessionTimer = setInterval(sessionCheck, SESSION_CHECK_MS); })
    .catch(() => { /* 未登录或网络错误：不轮询 */ });
}

/** 弹窗「我知道了」：关弹窗并整页刷新（回到未登录态） */
export function dismissKick() { kicked.value = false; window.location.reload(); }
