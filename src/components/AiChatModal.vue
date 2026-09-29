<script setup>
/* ==========================================================================
 * AiChatModal.vue —— 站内 AI 对话（悬浮按钮 + 多会话弹窗，SSE 流式渲染）
 *
 * v2 多会话改造（2026-09-28，设计方案见 .workbuddy/reports/AI聊天窗口设计方案-2026-09-28.md）：
 *   · 左侧会话栏：＋新对话 / 置顶·今天·更早分组 / 单条 置顶·重命名·删除；
 *     新对话只新建空会话，不删任何已有会话；当前会话高亮，切换即加载对应消息。
 *   · 头部「清空」按钮移除（清空语义由删除会话承担）。
 *   · 输入区 DeepSeek 风格：圆角容器内嵌 textarea + 右下角圆形发送钮，
 *     自动增高（1→6 行），Enter 发送 / Shift+Enter 换行，生成中变 ■ 停止。
 *   · 存储：sessionStorage `zelm_ai_chat_v2`（多会话），旧 `zelm_ai_chat_v1`
 *     首次自动迁移成第一个会话（无损升级）；纯逻辑在 core/ai-chat-store.js。
 *
 * 后端：POST /api/ai/chat（见 worker/ai-chat.js）—— 仅登录用户，
 *       每分钟 10 次 / 每天 200 次；前端按 401/429/502 分别给双语提示（不变）。
 *
 * 设计约束（与站点一致）：
 *   · 颜色全部走 CSS 变量（--surface/--border/--text/--muted/--accent），
 *     深浅主题 × 全部配色方案（data-scheme）自动跟随，零硬编码色值；
 *   · 文案走 common 命名空间，跟随全局语言切换；
 *   · 无障碍：role=dialog + aria-modal + Esc 关闭（useDialog）+ 消息区 aria-live
 *     + 打开自动聚焦输入框 + 关闭后焦点归还悬浮按钮；会话条目 aria-current；
 *   · Markdown：轻量方案（转义优先，防 XSS），沿用原有渲染器。
 * ========================================================================== */
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { useI18n } from '@/core/i18n';
import { useUserStore } from '@/stores/user';
import { AuthPanel } from '@/modules/auth-panel';
import { useDialog } from '@/composables/useDialog';
import { zelmConfirm } from '@/modules/confirm';
import {
  loadState, clearLocal, createSession, groupSessions,
  autoTitle, nextActiveAfterRemove,
} from '@/core/ai-chat-store';
import {
  fetchSessions, fetchMessages, appendMessages, importSessions,
  createSession as createRemoteSession, patchSession, deleteSession,
} from '@/core/ai-chat-remote';

const { t } = useI18n('common');
const user = useUserStore();

const open = ref(false);
const busy = ref(false);          /* 正在等 AI 回复（流式输出进行中） */
const input = ref('');
const errMsg = ref('');
const panelEl = ref(null);
const inputEl = ref(null);
const listEl = ref(null);
const fabEl = ref(null);
const sideEl = ref(null);

/* ---------- 多会话状态（D1 为唯一真相；排序/分组/命名等纯逻辑仍在 ai-chat-store.js） ----------
 * 会话对象在本地多了两个运行时字段（不落库）：
 *   · remote —— 是否已在服务端建好。刚点「新对话」的草稿是 false，
 *               等第一条消息发出前才真正 POST 建会话，避免库里堆空壳。
 *   · loaded —— 消息是否已从服务端拉取。列表接口只返回会话元信息，
 *               消息在切换/激活时按需拉取（懒加载，省流量）。 */
const state = ref({ activeId: '', sessions: [] });
const activeId = computed(() => state.value.activeId);
const active = computed(() => state.value.sessions.find((s) => s.id === state.value.activeId) || null);
const groups = computed(() => groupSessions(state.value.sessions));
const hasAnySession = computed(() => state.value.sessions.length > 0);

let loadedOnce = false;            /* 本次登录是否已同步过服务端列表 */

/** 把服务端会话元信息包装成本地会话对象（消息留空，按需加载） */
function wrapSession(s) {
  return { id: s.id, title: s.title, pinned: s.pinned, createdAt: s.createdAt, updatedAt: s.updatedAt, messages: [], remote: true, loaded: false };
}

/** 按需拉取某会话的消息（已拉过或草稿会话直接跳过） */
async function ensureMessages(ses) {
  if (!ses || ses.loaded || !ses.remote) return;
  const r = await fetchMessages(ses.id);
  if (!r.ok) return;
  ses.messages = r.messages;
  ses.loaded = true;
}

/** 库里一个会话都没有时，建一个**仅本地**的空会话（等第一条消息时才落库） */
function ensureDraft() {
  if (state.value.sessions.length) return;
  const ses = createSession();
  ses.remote = false;
  ses.loaded = true;
  state.value = { activeId: ses.id, sessions: [ses] };
}

/** 一次性搬迁：把浏览器 sessionStorage 里残留的旧会话搬进 D1，成功后抹掉本地副本 */
async function migrateLegacyIfAny() {
  const local = loadState(sessionStorage);
  const usable = local.sessions.filter((s) => s.messages && s.messages.length);
  if (!usable.length) { ensureDraft(); return; }
  const r = await importSessions(usable);
  if (!r.ok) { ensureDraft(); return; }
  clearLocal(sessionStorage);   /* 只留 D1 一份真相，避免两边打架 */
  const again = await fetchSessions();
  if (again.ok && again.sessions.length) {
    state.value = { activeId: again.sessions[0].id, sessions: again.sessions.map(wrapSession) };
    await ensureMessages(state.value.sessions[0]);
    return;
  }
  ensureDraft();
}

/** 从 D1 拉取当前登录用户的会话列表；登录态失效时列表清空（聊天入口也会被挡住） */
async function loadFromServer() {
  if (!user.isLoggedIn) { state.value = { activeId: '', sessions: [] }; return; }
  const r = await fetchSessions();
  if (!r.ok) {
    /* 401 → http 层已广播 zelm:logout，登录态会被清掉；其它错误保持现状不打扰用户 */
    ensureDraft();
    return;
  }
  loadedOnce = true;
  if (!r.sessions.length) { await migrateLegacyIfAny(); return; }
  state.value = { activeId: r.sessions[0].id, sessions: r.sessions.map(wrapSession) };
  await ensureMessages(state.value.sessions[0]);
}

/* 登录态变化 / 首次挂载时同步服务端；登出即清空（严格隔离：不残留上一位用户的数据） */
watch(() => user.isLoggedIn, (v) => {
  loadedOnce = false;
  if (v) loadFromServer();
  else state.value = { activeId: '', sessions: [] };
});
onMounted(() => { if (user.isLoggedIn) loadFromServer(); });

/* 折叠侧栏（移动端抽屉；桌面端常显，仅 class 生效范围不同） */
const sideOpen = ref(false);
function toggleSide() { sideOpen.value = !sideOpen.value; }
function closeSide() { sideOpen.value = false; }

/* ---------- 剩余额度（Workers AI Neuron，00:00 UTC 重置） ----------
 * 后端逐日记账（worker/ai-chat.js → D1 ai_usage 表），这里只读数展示：
 * 打开弹窗时拉一次，每轮对话结束后再刷一次。失败静默（额度条不显示）。 */
const quota = ref(null);        /* { used, limit, remaining, resetsAt } | null */
async function fetchQuota() {
  if (!user.isLoggedIn) { quota.value = null; return; }
  try {
    const r = await fetch('/api/ai/usage');
    if (!r.ok) return;
    const j = await r.json();
    if (j && typeof j.remaining === 'number') quota.value = j;
  } catch (e) { /* 网络/登出等：保持上一次的显示即可 */ }
}

/* ---------- 弹窗开关（Esc 关闭 + 焦点管理走 useDialog） ---------- */
async function openChat() {
  /* 登录门槛在前端就拦一道：未登录直接给登录弹窗，不发注定 401 的请求
     （用户确认的规则：未登录 = 直接禁用 AI 聊天，不做本地草稿/离线暂存） */
  if (!user.isLoggedIn) { AuthPanel.open('login'); return; }
  errMsg.value = '';
  open.value = true;
  /* 登录后还没同步过（或上次同步失败）就补拉一次，避免只看到空草稿 */
  if (!loadedOnce) await loadFromServer();
  /* 没有任何会话时静默建一个草稿，保证永远有「当前会话」可写 */
  ensureDraft();
  fetchQuota();   /* 打开即刷当日剩余额度（异步，不阻塞弹窗） */
}
function closeChat() {
  /* 流式输出中直接关闭：断开读取即可（服务端会随连接取消停止生成） */
  if (busy.value && abortCtl) abortCtl.abort();
  open.value = false;
}
useDialog(() => open.value, { onClose: closeChat, panelRef: panelEl, initialFocus: () => inputEl.value });

/* ---------- 会话操作 ---------- */
function focusInput() {
  nextTick(() => { try { if (inputEl.value) inputEl.value.focus(); } catch (e) { /* 忽略 */ } });
}
function newChat() {
  if (busy.value) return;
  const cur = active.value;
  /* 当前会话本来就是空的 → 直接复用，避免空会话堆积 */
  if (cur && !cur.messages.length) { closeSide(); focusInput(); return; }
  /* 只建本地草稿，等第一条消息发出时才落库（避免库里堆一堆空会话） */
  const ses = createSession();
  ses.remote = false;
  ses.loaded = true;
  state.value.sessions.push(ses);
  state.value.activeId = ses.id;
  closeSide();
  focusInput();
}
async function switchSession(id) {
  if (busy.value || id === state.value.activeId) { closeSide(); return; }
  state.value.activeId = id;
  errMsg.value = '';
  closeSide();
  focusInput();
  /* 消息懒加载：首次切到该会话才拉，之后用内存里的副本 */
  await ensureMessages(state.value.sessions.find((s) => s.id === id));
  scrollBottom();
}
async function removeSession(id) {
  if (busy.value) return;
  const confirmed = await zelmConfirm(t('aiDeleteConfirm'), t('aiDeleteSession'));
  if (!confirmed) return;
  const ses = state.value.sessions.find((s) => s.id === id);
  const wasRemote = !!(ses && ses.remote);
  const sessions = state.value.sessions.filter((s) => s.id !== id);
  const wasActive = state.value.activeId === id;
  state.value.sessions = sessions;
  if (wasActive) state.value.activeId = nextActiveAfterRemove(sessions, id);
  ensureDraft();   /* 全删光了就补一个空草稿 */
  /* 服务端的删除与本地乐观更新并行；消息由数据库 ON DELETE CASCADE 一并清掉 */
  if (wasRemote) await deleteSession(id);
}
function togglePin(id) {
  if (busy.value) return;
  const ses = state.value.sessions.find((s) => s.id === id);
  if (!ses) return;
  ses.pinned = !ses.pinned;
  if (ses.remote) patchSession(ses.id, { pinned: ses.pinned });
}
/* 行内重命名 */
const renaming = ref(null);   /* { id, value } */
const renameEl = ref(null);
function startRename(ses) {
  if (busy.value) return;
  renaming.value = { id: ses.id, value: ses.title || '' };
  nextTick(() => { try { if (renameEl.value) renameEl.value.focus(); } catch (e) { /* 忽略 */ } });
}
function commitRename() {
  const r = renaming.value;
  if (!r) return;
  const ses = state.value.sessions.find((s) => s.id === r.id);
  if (ses) {
    const v = r.value.trim();
    ses.title = v || autoTitle(ses.messages);   /* 空标题回退自动命名 */
    if (ses.remote) patchSession(ses.id, { title: ses.title });
  }
  renaming.value = null;
}
function cancelRename() { renaming.value = null; }
/* 会话列表 ↑↓ 键盘导航（焦点在条目间移动） */
function onSideKey(e) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const items = Array.from((sideEl.value || document).querySelectorAll('.ai-s-item'))
    .filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const idx = items.indexOf(document.activeElement);
  e.preventDefault();
  const next = e.key === 'ArrowDown' ? items[idx + 1] : items[idx - 1];
  const fallback = e.key === 'ArrowDown' ? items[0] : items[items.length - 1];
  try { (next || fallback).focus(); } catch (err) { /* 忽略 */ }
}

/* ---------- 轻量 Markdown（转义优先，防 XSS；沿用原渲染器） ---------- */
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

/* ---------- 发送 + SSE 流式读取（逻辑不变，写入对象改为当前会话） ---------- */
let abortCtl = null;
function scrollBottom() {
  nextTick(() => {
    try { if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight; } catch (e) { /* 忽略 */ }
  });
}
/* DeepSeek 风格自动增高：1 行起，最多 ~6 行（120px）后内部滚动 */
function autoGrow() {
  const el = inputEl.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}
function stopGen() {
  if (busy.value && abortCtl) abortCtl.abort();
}
function onKeydown(e) {
  /* Enter 发送 / Shift+Enter 换行 */
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
}
/**
 * 草稿会话在服务端还不存在 —— 第一条消息发出前先落库。
 * 失败也**不阻断**聊天（D1 抖动不该让用户发不出话），只是这一轮不留存。
 */
async function ensureRemote(ses) {
  if (!ses || ses.remote) return true;
  const r = await createRemoteSession({ id: ses.id, title: ses.title || '', pinned: !!ses.pinned });
  if (r.ok) { ses.remote = true; return true; }
  return false;
}

async function send() {
  const text = input.value.trim();
  if (!text || busy.value) return;
  /* 理论上 openChat 已兜底建会话，这里再防一手 */
  if (!active.value) { newChat(); }
  const ses = active.value;
  if (!ses) return;
  errMsg.value = '';
  input.value = '';
  if (inputEl.value) inputEl.value.style.height = 'auto';
  const userMsg = { role: 'user', content: text, createdAt: Date.now() };
  ses.messages.push(userMsg);
  /* 首条消息 → 自动命名（手动重命名过的 title 也会被覆盖为空时的回退，故只在为空时命名） */
  if (!ses.title) ses.title = autoTitle(ses.messages);
  const reply = { role: 'assistant', content: '', createdAt: Date.now() };
  ses.messages.push(reply);
  ses.updatedAt = Date.now();
  busy.value = true;
  scrollBottom();

  /* 落库：① 草稿会话转正  ② 用户消息先写进去（即便后面 AI 失败，提问本身也不丢） */
  const remote = await ensureRemote(ses);
  if (remote) await appendMessages(ses.id, [userMsg], ses.title || undefined);

  abortCtl = new AbortController();
  let res = null;
  try {
    res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: ses.messages.slice(0, -1) }),
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
      ses.messages.pop(); /* 空回复不留在列表里 */
      busy.value = false;
      abortCtl = null;
      return;
    }
    /* 流式读取：SSE 以空行分帧，帧内 `data: ...` 行携带增量。
       2026-09-28 加固：① \r\n 归一化（部分上游用 CRLF 分帧，indexOf('\n\n') 会失配）；
       ② 流结束后冲掉残余缓冲（最后一帧没以空行收尾时不丢尾）。 */
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const handleFrame = (frame) => {
      for (const line of frame.split('\n')) {
        if (line.indexOf('data:') !== 0) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const obj = JSON.parse(payload);
          if (typeof obj.response === 'string') reply.content += obj.response;
        } catch (e) { /* 半截 JSON 忽略，等下一帧补齐（response 字段都在单帧内） */ }
      }
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      buf = buf.replace(/\r\n/g, '\n');
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        handleFrame(buf.slice(0, idx));
        buf = buf.slice(idx + 2);
        scrollBottom();
      }
    }
    /* 流收尾：冲掉没以空行结束的最后一帧 + 解码器残余 */
    buf += dec.decode();
    buf = buf.replace(/\r\n/g, '\n');
    if (buf.trim()) { handleFrame(buf); buf = ''; }
    if (!reply.content) reply.content = t('aiEmptyReply');
  } catch (e) {
    /* 主动 abort（用户关窗/停止生成）不算错误 */
    if (!e || e.name !== 'AbortError') errMsg.value = t('aiErrNet');
  } finally {
    busy.value = false;
    abortCtl = null;
    if (ses) ses.updatedAt = Date.now();
    /* 回复落库：失败轮次的 reply 已被 pop 掉且 content 为空，这里自然跳过 */
    if (ses && ses.remote && reply.content) {
      await appendMessages(ses.id, [reply], ses.title || undefined);
    }
    scrollBottom();
    fetchQuota();   /* 对话结束（含 429/502）后刷新当日额度显示 */
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
        ref="panelEl" class="ai-panel" :class="{ 'ai-panel--side-open': sideOpen }"
        role="dialog" aria-modal="true" :aria-label="t('aiChatTitle')"
      >
        <!-- 移动端抽屉遮罩 -->
        <div v-if="sideOpen" class="ai-side-mask" @click="closeSide"></div>

        <!-- 左侧会话栏 -->
        <aside ref="sideEl" class="ai-side" role="navigation" :aria-label="t('aiSidebarToggle')">
          <button type="button" class="ai-new-btn" :disabled="busy" @click="newChat">＋ {{ t('aiNewChat') }}</button>
          <div class="ai-side-list" tabindex="-1" @keydown="onSideKey">
            <template v-if="groups.pinned.length">
              <p class="ai-group-label">{{ t('aiPinnedGroup') }}</p>
              <div
                v-for="s in groups.pinned" :key="s.id"
                class="ai-s-item" :class="{ 'ai-s-item--on': s.id === activeId }"
              >
                <template v-if="renaming && renaming.id === s.id">
                  <input
                    ref="renameEl" v-model="renaming.value" class="ai-rename-input"
                    :aria-label="t('aiRenameTitle')" maxlength="60"
                    @keydown.enter.prevent="commitRename"
                    @keydown.esc.prevent="cancelRename"
                    @blur="commitRename"
                  />
                </template>
                <template v-else>
                  <button type="button" class="ai-s-title" :aria-current="s.id === activeId ? 'true' : undefined" @click="switchSession(s.id)">
                    📌 {{ s.title || t('aiUntitled') }}
                  </button>
                  <span class="ai-s-ops">
                    <button type="button" class="ai-s-btn" :disabled="busy" :aria-label="t('aiUnpinTitle')" :title="t('aiUnpinTitle')" @click="togglePin(s.id)">📍</button>
                    <button type="button" class="ai-s-btn" :disabled="busy" :aria-label="t('aiRenameTitle')" :title="t('aiRenameTitle')" @click="startRename(s)">✏️</button>
                    <button type="button" class="ai-s-btn ai-s-btn--danger" :disabled="busy" :aria-label="t('aiDeleteSession')" :title="t('aiDeleteSession')" @click="removeSession(s.id)">🗑</button>
                  </span>
                </template>
              </div>
            </template>
            <template v-if="groups.today.length">
              <p class="ai-group-label">{{ t('aiTodayGroup') }}</p>
              <div
                v-for="s in groups.today" :key="s.id"
                class="ai-s-item" :class="{ 'ai-s-item--on': s.id === activeId }"
              >
                <template v-if="renaming && renaming.id === s.id">
                  <input
                    ref="renameEl" v-model="renaming.value" class="ai-rename-input"
                    :aria-label="t('aiRenameTitle')" maxlength="60"
                    @keydown.enter.prevent="commitRename"
                    @keydown.esc.prevent="cancelRename"
                    @blur="commitRename"
                  />
                </template>
                <template v-else>
                  <button type="button" class="ai-s-title" :aria-current="s.id === activeId ? 'true' : undefined" @click="switchSession(s.id)">
                    {{ s.title || t('aiUntitled') }}
                  </button>
                  <span class="ai-s-ops">
                    <button type="button" class="ai-s-btn" :disabled="busy" :aria-label="t('aiPinTitle')" :title="t('aiPinTitle')" @click="togglePin(s.id)">📌</button>
                    <button type="button" class="ai-s-btn" :disabled="busy" :aria-label="t('aiRenameTitle')" :title="t('aiRenameTitle')" @click="startRename(s)">✏️</button>
                    <button type="button" class="ai-s-btn ai-s-btn--danger" :disabled="busy" :aria-label="t('aiDeleteSession')" :title="t('aiDeleteSession')" @click="removeSession(s.id)">🗑</button>
                  </span>
                </template>
              </div>
            </template>
            <template v-if="groups.earlier.length">
              <p class="ai-group-label">{{ t('aiEarlierGroup') }}</p>
              <div
                v-for="s in groups.earlier" :key="s.id"
                class="ai-s-item" :class="{ 'ai-s-item--on': s.id === activeId }"
              >
                <template v-if="renaming && renaming.id === s.id">
                  <input
                    ref="renameEl" v-model="renaming.value" class="ai-rename-input"
                    :aria-label="t('aiRenameTitle')" maxlength="60"
                    @keydown.enter.prevent="commitRename"
                    @keydown.esc.prevent="cancelRename"
                    @blur="commitRename"
                  />
                </template>
                <template v-else>
                  <button type="button" class="ai-s-title" :aria-current="s.id === activeId ? 'true' : undefined" @click="switchSession(s.id)">
                    {{ s.title || t('aiUntitled') }}
                  </button>
                  <span class="ai-s-ops">
                    <button type="button" class="ai-s-btn" :disabled="busy" :aria-label="t('aiPinTitle')" :title="t('aiPinTitle')" @click="togglePin(s.id)">📌</button>
                    <button type="button" class="ai-s-btn" :disabled="busy" :aria-label="t('aiRenameTitle')" :title="t('aiRenameTitle')" @click="startRename(s)">✏️</button>
                    <button type="button" class="ai-s-btn ai-s-btn--danger" :disabled="busy" :aria-label="t('aiDeleteSession')" :title="t('aiDeleteSession')" @click="removeSession(s.id)">🗑</button>
                  </span>
                </template>
              </div>
            </template>
            <p v-if="!hasAnySession" class="ai-side-empty">{{ t('aiUntitled') }}</p>
          </div>
        </aside>

        <!-- 右侧：头部 + 对话区 + 输入区 -->
        <div class="ai-main">
          <header class="ai-head">
            <button type="button" class="ai-side-toggle" :aria-label="t('aiSidebarToggle')" :aria-expanded="sideOpen ? 'true' : 'false'" @click="toggleSide">☰</button>
            <h2 class="ai-title">✦ {{ t('aiChatTitle') }}</h2>
            <div class="ai-head-actions">
              <button type="button" class="ai-icon-btn ai-icon-btn--close" :aria-label="t('cClose')" @click="closeChat">✕</button>
            </div>
          </header>

          <div ref="listEl" class="ai-list" aria-live="polite" aria-atomic="false">
            <p v-if="!active || !active.messages.length" class="ai-welcome">{{ t('aiWelcome') }}</p>
            <div
              v-for="(m, i) in (active ? active.messages : [])" :key="i"
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
            <div class="ai-input-wrap">
              <label class="sr-only" for="aiInput">{{ t('aiInputAria') }}</label>
              <textarea
                id="aiInput" ref="inputEl" v-model="input"
                class="ai-input" rows="1" maxlength="4000"
                :placeholder="t('aiPlaceholder')"
                :disabled="busy"
                @keydown="onKeydown"
                @input="autoGrow"
              ></textarea>
              <!-- 生成中 → ■ 停止；空闲 → ↑ 发送（DeepSeek 风格内嵌按钮） -->
              <button
                v-if="busy" type="button"
                class="ai-send ai-send--stop" :aria-label="t('aiStopGen')" :title="t('aiStopGen')"
                @click="stopGen"
              >■</button>
              <button
                v-else type="button"
                class="ai-send" :aria-label="t('aiSend')" :title="t('aiSend')"
                :disabled="!input.trim()" @click="send"
              >↑</button>
            </div>
            <!-- 当日剩余 Neuron 额度（00:00 UTC 重置；拉取失败则不显示） -->
            <p v-if="quota" class="ai-quota">{{ t('aiQuotaRemaining', { n: quota.remaining }) }}</p>
          </footer>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
/* 颜色全部走主题变量：深浅主题 × 配色方案（data-scheme）切换自动跟随，零硬编码 */
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
  width: min(920px, 96vw); max-height: 86vh; margin: auto;
  display: flex; flex-direction: row; overflow: hidden;
  border-radius: 20px; padding: 0;
  color: var(--text);
  background: color-mix(in srgb, var(--surface) 88%, var(--bg));
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  box-shadow: 0 20px 60px rgba(0, 0, 0, .5);
  animation: aiPop .26s cubic-bezier(.34, 1.56, .64, 1);
}

/* ---------- 左侧会话栏 ---------- */
.ai-side {
  flex: 0 0 220px; display: flex; flex-direction: column; gap: 8px;
  padding: 12px 10px; min-height: 0;
  background: color-mix(in srgb, var(--text) 4%, transparent);
  border-right: 1px solid var(--border);
}
.ai-new-btn {
  border: none; border-radius: 11px; padding: 9px 12px; cursor: pointer;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: #022; font-size: .84rem; font-weight: 700; font-family: inherit;
  transition: transform .15s, opacity .2s;
}
.ai-new-btn:disabled { opacity: .5; cursor: not-allowed; }
.ai-new-btn:not(:disabled):hover { transform: translateY(-1px); }
.ai-side-list { flex: 1 1 auto; overflow-y: auto; min-height: 0; display: flex; flex-direction: column; gap: 3px; padding: 2px; }
.ai-group-label { margin: 8px 4px 2px; font-size: .68rem; color: var(--muted); }
.ai-s-item {
  position: relative; display: flex; align-items: center; gap: 4px;
  border-radius: 9px; border: 1px solid transparent;
}
.ai-s-item--on {
  background: color-mix(in srgb, var(--accent) 13%, transparent);
  border-color: color-mix(in srgb, var(--accent) 40%, transparent);
}
.ai-s-title {
  flex: 1 1 auto; min-width: 0; text-align: left;
  border: none; background: none; color: inherit;
  font-size: .78rem; font-family: inherit; cursor: pointer;
  padding: 7px 6px 7px 8px; border-radius: 9px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ai-s-item:hover .ai-s-title { background: color-mix(in srgb, var(--text) 6%, transparent); }
.ai-s-ops { display: flex; gap: 2px; padding-right: 4px; flex: 0 0 auto; }
/* 桌面端悬浮才显示操作钮；触屏设备（无 hover）常显，保证手机也能删/改名/置顶 */
.ai-s-btn {
  width: 22px; height: 22px; border: none; border-radius: 6px; padding: 0;
  background: none; color: var(--muted); font-size: .68rem; line-height: 1;
  cursor: pointer; opacity: 0; transition: opacity .15s, background .15s;
}
.ai-s-item:hover .ai-s-btn, .ai-s-item:focus-within .ai-s-btn, .ai-s-item--on .ai-s-btn { opacity: .75; }
.ai-s-btn:hover { opacity: 1 !important; background: color-mix(in srgb, var(--text) 10%, transparent); }
.ai-s-btn--danger:hover { color: #f87171; }
@media (hover: none) {
  .ai-s-btn { opacity: .75; }
}
.ai-s-item--on .ai-s-btn { opacity: .75; }
.ai-rename-input {
  flex: 1 1 auto; min-width: 0; margin: 2px 4px;
  border: 1px solid var(--accent); border-radius: 7px; padding: 5px 8px;
  background: color-mix(in srgb, var(--text) 6%, transparent);
  color: inherit; font-size: .78rem; font-family: inherit; outline: none;
}
.ai-side-empty { margin: 10px 4px; font-size: .75rem; color: var(--muted); }
.ai-side-mask { display: none; }

/* ---------- 右侧 ---------- */
.ai-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; padding: 14px 14px 12px; }
.ai-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.ai-title { font-size: 1rem; color: var(--accent); letter-spacing: 1px; margin: 0; }
.ai-head-actions { display: flex; gap: 8px; margin-left: auto; }
.ai-icon-btn {
  border: 1px solid var(--border); background: color-mix(in srgb, var(--text) 6%, transparent);
  color: var(--muted); border-radius: 999px; padding: 4px 12px;
  font-size: .78rem; font-family: inherit; cursor: pointer; transition: all .2s;
}
.ai-icon-btn:hover { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
.ai-icon-btn--close { padding: 4px 10px; }
.ai-side-toggle { display: none; }

.ai-list {
  flex: 1 1 auto; min-height: 200px; overflow-y: auto;
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

/* ---------- DeepSeek 风格输入区：圆角容器内嵌 textarea + 右下角圆形发送钮 ---------- */
.ai-foot { margin-top: 10px; }
/* 当日剩余额度：弱化的小字，紧跟输入框下方右对齐 */
.ai-quota {
  margin: 6px 4px 0; text-align: right;
  font-size: .7rem; color: var(--muted); opacity: .85;
}
.ai-input-wrap {
  position: relative; display: flex; align-items: flex-end;
  border: 1px solid var(--border); border-radius: 14px;
  background: color-mix(in srgb, var(--text) 5%, transparent);
  transition: border-color .2s, box-shadow .2s;
}
.ai-input-wrap:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent);
}
.ai-input {
  flex: 1 1 auto; resize: none; border: none; outline: none;
  max-height: 120px; min-height: 38px;
  background: transparent; color: var(--text);
  font-size: .875rem; font-family: inherit; line-height: 1.55;
  padding: 9px 48px 9px 12px;
}
.ai-send {
  position: absolute; right: 7px; bottom: 6px;
  width: 30px; height: 30px; border-radius: 50%; border: none;
  display: grid; place-items: center; cursor: pointer;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: #022; font-size: .95rem; font-weight: 700; font-family: inherit;
  transition: transform .15s, opacity .2s;
}
.ai-send:disabled { opacity: .4; cursor: not-allowed; }
.ai-send:not(:disabled):hover { transform: translateY(-1px); }
.ai-send--stop { color: #022; font-size: .7rem; }

.sr-only {
  position: absolute; width: 1px; height: 1px; margin: -1px;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; padding: 0;
}

/* ---------- 移动端：侧栏变抽屉 ---------- */
@media (max-width: 640px) {
  /* 2026-09-29 手机端 FAB 放大一倍（用户要求）：46 → 92（缩放坐标系里 2×），
     图标字号同步 1.35rem → 2.7rem 保持比例；right/bottom 仍 14px，
     热区随尺寸扩大，不遮挡主内容（面板打开时 FAB 在 overlay 之下）。 */
  .ai-fab { right: 14px; bottom: 14px; width: 92px; height: 92px; font-size: 2.7rem; }
  /* 2026-09-28 移动端尺寸：站点在 <1280 视口用 body zoom 等比缩放，
     vw/vh 会被 zoom 二次缩小（若沿用桌面 96vw，渲染后只占屏 ~29% 太窄）。
     这里直接用「缩放坐标系」里的固定宽度 800px（桌面端为 920px）：
     渲染后 ≈ 800 × zoom ≈ 62% 屏宽，左右各留 ~19% 边距，不贴边。
     用户确认 800 左右比 96% 全屏更合适。 */
  .ai-overlay { padding: calc(2vh / var(--zelm-zoom, 1)) calc(8px / var(--zelm-zoom, 1)); }
  .ai-panel {
    width: 800px;
    max-height: calc(92vh / var(--zelm-zoom, 1));
    position: relative;
  }
  .ai-bubble { max-width: 92%; }
  .ai-side-toggle {
    display: grid; place-items: center; width: 32px; height: 32px;
    border: 1px solid var(--border); border-radius: 9px; background: none;
    color: var(--muted); font-size: .95rem; cursor: pointer;
  }
  .ai-side {
    position: absolute; inset: 0 auto 0 0; z-index: 3;
    width: min(240px, 78vw);
    background: color-mix(in srgb, var(--bg) 92%, var(--surface));
    transform: translateX(-102%);
    transition: transform .22s ease;
    box-shadow: var(--shadow);
  }
  .ai-panel--side-open .ai-side { transform: translateX(0); }
  .ai-side-mask {
    display: block; position: absolute; inset: 0; z-index: 2;
    background: rgba(0, 0, 0, .45); border: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ai-overlay, .ai-panel, .ai-thinking { animation: none; }
  .ai-side { transition: none; }
}
</style>
