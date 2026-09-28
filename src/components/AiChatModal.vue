<script setup>
/* ==========================================================================
 * AiChatModal.vue —— 站内 AI 对话（悬浮按钮 + 居中玻璃弹窗，SSE 流式渲染）
 *
 * 后端：POST /api/ai/chat（见 worker/ai-chat.js）—— 仅登录用户，
 *       每分钟 10 次 / 每天 200 次；前端按 401/429/502 分别给双语提示。
 *
 * 设计约束（与站点一致）：
 *   · 颜色全部走 CSS 变量（--surface/--border/--text/--muted/--accent），
 *     深浅主题自动跟随，零硬编码色值；
 *   · 文案走 common 命名空间，跟随全局语言切换（不设独立语言按钮）；
 *   · 无障碍：role=dialog + aria-modal + Esc 关闭（useDialog）+ 消息区 aria-live
 *     + 打开自动聚焦输入框 + 关闭后焦点归还悬浮按钮；
 *   · 聊天记录只存 sessionStorage（zelm_ai_chat_v1），不落库，关标签页即清。
 *
 * 流式渲染：fetch 读 res.body（ReadableStream），按 SSE 帧（空行分隔）
 *   解析 `data: {...}` / `data: [DONE]`，把 response 增量追加到最后一条
 *   assistant 消息 —— 打字机效果由 Vue 响应式渲染自然获得。
 *
 * Markdown：轻量方案（零依赖、防 XSS）—— 先把整段文本 HTML 转义，
 *   再只放行 **加粗 / *斜体* / `行内码` / ```代码块``` / [文字](链接) / 换行
 *   六种形态；链接强制 rel="noopener noreferrer"。绝不把原始输入当 HTML。
 * ========================================================================== */
import { ref, nextTick, onMounted, onUnmounted } from 'vue';
import { useI18n } from '@/core/i18n';
import { useUserStore } from '@/stores/user';
import { AuthPanel } from '@/modules/auth-panel';
import { useDialog } from '@/composables/useDialog';

const { t } = useI18n('common');
const user = useUserStore();

const open = ref(false);
const busy = ref(false);          /* 正在等 AI 回复（流式输出进行中） */
const input = ref('');
const messages = ref([]);         /* [{ role: 'user'|'assistant', content }] */
const errMsg = ref('');
const panelEl = ref(null);
const inputEl = ref(null);
const listEl = ref(null);
const fabEl = ref(null);

/* ---------- 会话记录（sessionStorage，不落库） ---------- */
const STORE_KEY = 'zelm_ai_chat_v1';
function loadHistory() {
  try {
    const a = JSON.parse(sessionStorage.getItem(STORE_KEY) || '[]');
    if (Array.isArray(a)) messages.value = a.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string');
  } catch (e) { messages.value = []; }
}
function saveHistory() {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify(messages.value.slice(-40))); } catch (e) { /* 存储满/隐私模式忽略 */ }
}
function clearChat() {
  if (busy.value && abortCtl) abortCtl.abort();
  messages.value = [];
  errMsg.value = '';
  saveHistory();
}

/* ---------- 弹窗开关（Esc 关闭 + 焦点管理走 useDialog） ---------- */
function openChat() {
  /* 登录门槛在前端就拦一道：未登录直接给登录弹窗，不发注定 401 的请求 */
  if (!user.isLoggedIn) { AuthPanel.open('login'); return; }
  if (!messages.value.length) loadHistory();
  errMsg.value = '';
  open.value = true;
}
function closeChat() {
  /* 流式输出中直接关闭：断开读取即可（服务端会随连接取消停止生成） */
  if (busy.value && abortCtl) abortCtl.abort();
  open.value = false;
}
useDialog(() => open.value, { onClose: closeChat, panelRef: panelEl, initialFocus: () => inputEl.value });

/* ---------- 轻量 Markdown（转义优先，防 XSS） ---------- */
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function renderMarkdown(raw) {
  const src = escHtml(raw == null ? '' : raw);
  /* 代码块先摘出来占位，避免块内文本被后续规则误伤 */
  const blocks = [];
  let txt = src.replace(/```([\s\S]*?)```/g, (_, code) => {
    blocks.push('<pre class="ai-code"><code>' + code.replace(/^\w*\n/, '') + '</code></pre>');
    return '\uE000' + (blocks.length - 1) + '\uE000';
  });
  /* 行内形态：`code` → **bold** → *italic* → [text](http链接) */
  txt = txt
    .replace(/`([^`\n]+)`/g, '<code class="ai-inline-code">$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  /* 换行 → <br>；代码块占位还原 */
  txt = txt.replace(/\n/g, '<br>').replace(/\uE000(\d+)\uE000/g, (_, i) => blocks[Number(i)] || '');
  return txt;
}

/* ---------- 发送 + SSE 流式读取 ---------- */
let abortCtl = null;
function scrollBottom() {
  nextTick(() => {
    try { if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight; } catch (e) { /* 忽略 */ }
  });
}
function onKeydown(e) {
  /* Enter 发送 / Shift+Enter 换行 */
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
}
async function send() {
  const text = input.value.trim();
  if (!text || busy.value) return;
  errMsg.value = '';
  input.value = '';
  messages.value.push({ role: 'user', content: text });
  const reply = { role: 'assistant', content: '' };
  messages.value.push(reply);
  busy.value = true;
  saveHistory();
  scrollBottom();

  abortCtl = new AbortController();
  let res = null;
  try {
    res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages.value.slice(0, -1) }),
      signal: abortCtl.signal,
    });
    /* 错误状态：后端给的都是 JSON，读出来按状态码给双语提示 */
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).error || ''; } catch (e) { /* 非 JSON 忽略 */ }
      if (res.status === 401) { errMsg.value = t('aiErr401'); user.set(null); }
      else if (res.status === 429) errMsg.value = detail || t('aiErr429');
      else if (res.status === 502) errMsg.value = detail || t('aiErr502');
      else errMsg.value = detail || t('aiErrNet');
      messages.value.pop(); /* 空回复不留在列表里 */
      busy.value = false;
      abortCtl = null;
      saveHistory();
      return;
    }
    /* 流式读取：SSE 以空行分帧，帧内 `data: ...` 行携带增量 */
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const line of frame.split('\n')) {
          if (line.indexOf('data:') !== 0) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const obj = JSON.parse(payload);
            if (typeof obj.response === 'string') reply.content += obj.response;
          } catch (e) { /* 半截 JSON 忽略，等下一帧补齐（response 字段都在单帧内） */ }
        }
        scrollBottom();
      }
    }
    if (!reply.content) reply.content = t('aiEmptyReply');
  } catch (e) {
    /* 主动 abort（用户关窗/清空）不算错误 */
    if (!e || e.name !== 'AbortError') errMsg.value = t('aiErrNet');
  } finally {
    busy.value = false;
    abortCtl = null;
    saveHistory();
    scrollBottom();
  }
}

/* 全局快捷键：Shift+A 呼出（可选入口，不与输入框冲突时才生效） */
function onGlobalKey(e) {
  if (open.value || busy.value) return;
  if (e.shiftKey && (e.key === 'A' || e.key === 'a')) {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    openChat();
  }
}
onMounted(() => document.addEventListener('keydown', onGlobalKey));
onUnmounted(() => document.removeEventListener('keydown', onGlobalKey));
</script>

<template>
  <!-- 悬浮入口：右下角常驻，玻璃拟态小球 -->
  <button
    ref="fabEl" type="button"
    class="ai-fab" :aria-label="t('aiChatTitle')"
    :class="{ 'ai-fab--active': open }"
    @click="open ? closeChat() : openChat()"
  >✦</button>

  <Teleport to="#overlayRoot">
    <!-- 居中弹窗：flex + margin:auto（与 ContentManageDialog 同一套居中方案，
         内容超高时 overlay 可滚动，不会像 align-items:center 那样裁掉顶部） -->
    <div v-if="open" class="ai-overlay" @click.self="closeChat">
      <section
        ref="panelEl" class="ai-panel"
        role="dialog" aria-modal="true" :aria-label="t('aiChatTitle')"
      >
        <header class="ai-head">
          <h2 class="ai-title">✦ {{ t('aiChatTitle') }}</h2>
          <div class="ai-head-actions">
            <button type="button" class="ai-icon-btn" :disabled="busy" @click="clearChat">{{ t('aiClear') }}</button>
            <button type="button" class="ai-icon-btn ai-icon-btn--close" :aria-label="t('cClose')" @click="closeChat">✕</button>
          </div>
        </header>

        <div ref="listEl" class="ai-list" aria-live="polite" aria-atomic="false">
          <p v-if="!messages.length" class="ai-welcome">{{ t('aiWelcome') }}</p>
          <div
            v-for="(m, i) in messages" :key="i"
            class="ai-msg" :class="'ai-msg--' + m.role"
          >
            <!-- assistant 内容经转义后的轻量 Markdown 渲染；user 内容纯文本 -->
            <span v-if="m.role === 'assistant'" class="ai-bubble" v-html="renderMarkdown(m.content)"></span>
            <span v-else class="ai-bubble">{{ m.content }}</span>
          </div>
          <p v-if="busy" class="ai-thinking">{{ t('aiThinking') }}</p>
        </div>

        <p v-if="errMsg" class="ai-err" role="alert">{{ errMsg }}</p>

        <footer class="ai-foot">
          <label class="sr-only" for="aiInput">{{ t('aiInputAria') }}</label>
          <textarea
            id="aiInput" ref="inputEl" v-model="input"
            class="ai-input" rows="2" maxlength="4000"
            :placeholder="t('aiPlaceholder')"
            :disabled="busy"
            @keydown="onKeydown"
          ></textarea>
          <button type="button" class="ai-send" :disabled="busy || !input.trim()" @click="send">{{ t('aiSend') }}</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
/* 颜色全部走主题变量：深浅色切换自动跟随，零硬编码 */
.ai-fab {
  position: fixed; right: 22px; bottom: 22px; z-index: 850;
  width: 52px; height: 52px; border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
  background: var(--surface);
  backdrop-filter: blur(14px) saturate(140%); -webkit-backdrop-filter: blur(14px) saturate(140%);
  color: var(--accent); font-size: 1.35rem; line-height: 1; cursor: pointer;
  box-shadow: var(--shadow);
  display: grid; place-items: center;
  transition: transform .18s, box-shadow .2s;
}
.ai-fab:hover { transform: translateY(-2px) scale(1.04); box-shadow: var(--shadow-hover); }
.ai-fab--active { transform: scale(.94); }

.ai-overlay {
  position: fixed; inset: 0; z-index: 920;
  display: flex; overflow-y: auto; padding: 4vh 16px;
  background: rgba(2, 8, 6, .55);
  backdrop-filter: blur(8px) brightness(.55) saturate(120%); -webkit-backdrop-filter: blur(8px) brightness(.55) saturate(120%);
  animation: aiFade .2s ease;
}
.ai-panel {
  width: min(640px, 94vw); max-height: 86vh; margin: auto;
  display: flex; flex-direction: column;
  border-radius: 20px; padding: 16px;
  color: var(--text);
  background: color-mix(in srgb, var(--surface) 88%, var(--bg));
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  box-shadow: 0 20px 60px rgba(0, 0, 0, .5);
  animation: aiPop .26s cubic-bezier(.34, 1.56, .64, 1);
}
.ai-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.ai-title { font-size: 1rem; color: var(--accent); letter-spacing: 1px; margin: 0; }
.ai-head-actions { display: flex; gap: 8px; }
.ai-icon-btn {
  border: 1px solid var(--border); background: color-mix(in srgb, var(--text) 6%, transparent);
  color: var(--muted); border-radius: 999px; padding: 4px 12px;
  font-size: .78rem; font-family: inherit; cursor: pointer; transition: all .2s;
}
.ai-icon-btn:hover { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
.ai-icon-btn--close { padding: 4px 10px; }

.ai-list {
  flex: 1 1 auto; min-height: 220px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 10px; padding: 6px 4px;
}
.ai-welcome { color: var(--muted); font-size: .85rem; text-align: center; margin: auto 0; }
.ai-msg { display: flex; }
.ai-msg--user { justify-content: flex-end; }
.ai-msg--assistant { justify-content: flex-start; }
.ai-bubble {
  max-width: 82%; padding: 9px 13px; border-radius: 14px;
  font-size: .875rem; line-height: 1.65; word-break: break-word; white-space: normal;
}
.ai-msg--user .ai-bubble {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  white-space: pre-wrap;
}
.ai-msg--assistant .ai-bubble {
  background: color-mix(in srgb, var(--text) 7%, transparent);
  border: 1px solid var(--border);
}
.ai-msg--assistant :deep(.ai-code) {
  overflow-x: auto; padding: 8px 10px; margin: 6px 0; border-radius: 8px;
  background: color-mix(in srgb, var(--bg) 70%, transparent);
  border: 1px solid var(--border); font-size: .8125rem;
}
.ai-msg--assistant :deep(.ai-inline-code) {
  padding: 1px 5px; border-radius: 5px;
  background: color-mix(in srgb, var(--bg) 60%, transparent);
  border: 1px solid var(--border); font-size: .8125rem;
}
.ai-msg--assistant :deep(a) { color: var(--accent); }
.ai-thinking { color: var(--muted); font-size: .78rem; margin: 0; animation: aiBlink 1.2s ease-in-out infinite; }
@keyframes aiBlink { 50% { opacity: .35; } }
.ai-err { color: #f87171; font-size: .8rem; margin: 8px 0 0; }

.ai-foot { display: flex; gap: 8px; align-items: flex-end; margin-top: 10px; }
.ai-input {
  flex: 1 1 auto; resize: none; max-height: 120px;
  border-radius: 12px; border: 1px solid var(--border);
  background: color-mix(in srgb, var(--text) 5%, transparent);
  color: var(--text); font-size: .875rem; font-family: inherit;
  padding: 9px 12px; outline: none; transition: border-color .2s, box-shadow .2s;
}
.ai-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent); }
.ai-send {
  border: none; border-radius: 12px; padding: 10px 18px; cursor: pointer;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: #022; font-size: .875rem; font-weight: 700; font-family: inherit;
  transition: transform .15s, opacity .2s;
}
.ai-send:disabled { opacity: .5; cursor: not-allowed; transform: none; }
.ai-send:not(:disabled):hover { transform: translateY(-1px); }

@media (max-width: 640px) {
  .ai-fab { right: 14px; bottom: 14px; width: 46px; height: 46px; }
  .ai-overlay { padding: 2vh 8px; }
  .ai-panel { max-height: 92vh; }
  .ai-bubble { max-width: 92%; }
}
@media (prefers-reduced-motion: reduce) {
  .ai-overlay, .ai-panel, .ai-thinking { animation: none; }
}
</style>
