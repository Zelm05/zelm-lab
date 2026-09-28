/* ==========================================================================
 * ai-chat-store.js —— AI 聊天多会话纯逻辑（2026-09-28，v2 多会话改造）
 *
 * 设计约定（见 .workbuddy/reports/AI聊天窗口设计方案-2026-09-28.md）：
 *   · 存储仍是 sessionStorage 不落库：key 从 `zelm_ai_chat_v1`（单会话消息数组）
 *     升级为 `zelm_ai_chat_v2`（多会话）；首次读到 v1 自动迁移成第一个会话后删除。
 *   · 这里只放纯函数（无 Vue 依赖），AiChatModal.vue 负责绑定；纯函数可单测。
 *
 * 2026-09-28 晚：**持久化已改为 D1**（表见 migrations/migration-030）。
 *   本文件只剩两个用途：
 *     ① createSession / 排序 / 分组 / 自动命名等纯逻辑照旧复用；
 *     ② loadState 用于「读取浏览器里的旧数据 → 一次性 import 进 D1」，
 *        搬迁完成后由 clearLocal() 抹掉本地副本，避免两份真相打架。
 *   组件不再调用 saveState 写本地（Remote 适配层见 core/ai-chat-remote.js）。
 * ========================================================================== */

export const STORE_KEY = 'zelm_ai_chat_v2';
export const LEGACY_KEY = 'zelm_ai_chat_v1';
export const MAX_SESSIONS = 30;   /* 会话总数上限，超出淘汰最旧的未置顶会话 */
export const MAX_MESSAGES = 40;   /* 单会话消息条数上限（沿用 v1 的截尾策略） */
export const TITLE_LEN = 20;      /* 自动标题截断长度 */

/** 生成会话 id：时间戳 36 进制 + 4 位随机，够用且可读 */
export function newId(now) {
  return 's_' + (now || Date.now()).toString(36) + Math.random().toString(36).slice(2, 6);
}

/** 新建空会话 */
export function createSession(now) {
  const ts = now || Date.now();
  return { id: newId(ts), title: '', pinned: false, createdAt: ts, updatedAt: ts, messages: [] };
}

/**
 * 读取并解析 sessionStorage（含 v1 → v2 迁移）。
 * @returns {{activeId: string, sessions: Array}}
 */
export function loadState(storage) {
  const s = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  if (!s) return { activeId: '', sessions: [] };
  /* 先试 v2 */
  try {
    const raw = JSON.parse(s.getItem(STORE_KEY) || 'null');
    if (raw && Array.isArray(raw.sessions)) {
      const sessions = sanitizeSessions(raw.sessions);
      const activeId = sessions.some((x) => x.id === raw.activeId)
        ? raw.activeId
        : (sessions[0] ? sessions[0].id : '');
      return { activeId, sessions };
    }
  } catch (e) { /* 坏 JSON 落到迁移 */ }
  /* v1 迁移：旧格式是 [{role, content}, …] 消息数组 */
  try {
    const legacy = JSON.parse(s.getItem(LEGACY_KEY) || 'null');
    if (Array.isArray(legacy)) {
      const msgs = legacy
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-MAX_MESSAGES);
      const ses = createSession();
      ses.messages = msgs;
      ses.title = autoTitle(msgs);
      s.setItem(STORE_KEY, JSON.stringify({ version: 2, activeId: ses.id, sessions: [ses] }));
      try { s.removeItem(LEGACY_KEY); } catch (e2) { /* 忽略 */ }
      return { activeId: ses.id, sessions: [ses] };
    }
  } catch (e2) { /* 忽略 */ }
  return { activeId: '', sessions: [] };
}

/** 写回 sessionStorage（截尾 + 容量淘汰在此统一做） */
export function saveState(storage, state) {
  const s = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  if (!s) return;
  try {
    const sessions = trimSessions(state.sessions);
    /* activeId 指向的会话若被淘汰，回落到第一个 */
    const activeId = sessions.some((x) => x.id === state.activeId)
      ? state.activeId
      : (sessions[0] ? sessions[0].id : '');
    s.setItem(STORE_KEY, JSON.stringify({ version: 2, activeId, sessions }));
    return { activeId, sessions };
  } catch (e) { /* 存储满 / 隐私模式：忽略 */ }
  return undefined;
}

/** 逐条校验会话结构，剔掉坏数据 */
export function sanitizeSessions(arr) {
  return (Array.isArray(arr) ? arr : [])
    .filter((x) => x && typeof x === 'object' && typeof x.id === 'string')
    .map((x) => ({
      id: x.id,
      title: typeof x.title === 'string' ? x.title : '',
      pinned: !!x.pinned,
      createdAt: Number(x.createdAt) || 0,
      updatedAt: Number(x.updatedAt) || Number(x.createdAt) || 0,
      messages: (Array.isArray(x.messages) ? x.messages : [])
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-MAX_MESSAGES),
    }));
}

/** 容量淘汰：超上限时先删最旧的未置顶会话（按 updatedAt 最小；置顶的永远保留到最后） */
export function trimSessions(sessions) {
  const list = sanitizeSessions(sessions).slice();
  while (list.length > MAX_SESSIONS) {
    let victim = -1;
    let oldest = Infinity;
    for (let i = 0; i < list.length; i++) {
      if (!list[i].pinned && list[i].updatedAt < oldest) { victim = i; oldest = list[i].updatedAt; }
    }
    if (victim < 0) break;           /* 全是置顶：不再淘汰 */
    list.splice(victim, 1);
  }
  return list;
}

/** 排序：置顶在前，组内按 updatedAt 降序 */
export function sortSessions(sessions) {
  return sanitizeSessions(sessions).slice().sort((a, b) =>
    (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
}

/**
 * 自动命名：取第一条用户消息截 20 字；没有用户消息返回 ''（显示「新对话」）
 */
export function autoTitle(messages) {
  const first = (messages || []).find((m) => m.role === 'user');
  if (!first) return '';
  const t = String(first.content).replace(/\s+/g, ' ').trim();
  return t.length > TITLE_LEN ? t.slice(0, TITLE_LEN) + '…' : t;
}

/** 分组：{ pinned: [], today: [], earlier: [] }（今天 = 本地时区的自然日） */
export function groupSessions(sessions, now) {
  const today = new Date(now || Date.now());
  today.setHours(0, 0, 0, 0);
  const t0 = today.getTime();
  const groups = { pinned: [], today: [], earlier: [] };
  for (const s of sortSessions(sessions)) {
    if (s.pinned) groups.pinned.push(s);
    else if (s.updatedAt >= t0) groups.today.push(s);
    else groups.earlier.push(s);
  }
  return groups;
}

/**
 * 删除会话后的切换目标：优先右邻（同列表顺序），否则左邻，否则 ''
 * @param {Array} sessions 删除后的会话列表（任意顺序）
 * @param {string} removedId 被删的会话 id
 */
export function nextActiveAfterRemove(sessions, removedId) {
  const ordered = sortSessions(sessions);
  const idx = ordered.findIndex((x) => x.id === removedId);
  if (idx < 0) return ordered[0] ? ordered[0].id : '';
  return ordered[idx + 1] ? ordered[idx + 1].id : (ordered[idx - 1] ? ordered[idx - 1].id : '');
}

/**
 * 抹掉浏览器本地的旧聊天数据（v1 + v2 两个 key）。
 * 只在「旧数据已成功 import 进 D1」之后调用 —— 否则等于丢数据。
 */
export function clearLocal(storage) {
  const s = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  if (!s) return;
  try {
    s.removeItem(STORE_KEY);
    s.removeItem(LEGACY_KEY);
  } catch (e) { /* 隐私模式等：忽略 */ }
}
