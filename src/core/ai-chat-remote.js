/* ==========================================================================
 * ai-chat-remote.js —— AI 聊天记录的 D1 读写适配层（2026-09-28）
 *
 * 背景：聊天记录原先只存浏览器 sessionStorage（core/ai-chat-store.js），
 *   换设备/清缓存即丢失。本次改为落 D1（表见 migration-030），本文件是
 *   前端唯一的出入通道 —— 组件不直接碰 fetch，便于单测与后续替换。
 *
 * 隔离：接口全部带 Cookie 鉴权，后端按 user_id 过滤；前端不需要也不应该
 *   传 userId —— 服务端从会话令牌里取（传了也不可信）。
 *
 * 数据形态约定：
 *   · 后端返回 ISO 8601 字符串（字典序 = 时间序，便于 SQL 排序）；
 *   · 前端 store 用**毫秒数值**（sortSessions / groupSessions 都是数值比较）；
 *   → 边界处统一在这里转换，别把两种形态混进状态树。
 * ========================================================================== */
import { getJSON, postJSON, patchJSON, delJSON } from '@/api/http';

const BASE = '/api/ai/sessions';

/** ISO 字符串 → 毫秒数值（非法值回落 0，保证排序不会出 NaN） */
function toMs(v) {
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
}

/** 后端会话行 → 前端会话对象（缺 messages，切换会话时再按需拉取） */
export function mapSession(r) {
  return {
    id: r.id,
    title: r.title || '',
    pinned: !!r.pinned,
    createdAt: toMs(r.createdAt),
    updatedAt: toMs(r.updatedAt),
  };
}

/** 后端消息行 → 前端消息对象 */
export function mapMessage(r) {
  return { id: r.id, role: r.role, content: r.content, createdAt: toMs(r.createdAt) };
}

/**
 * GET /api/ai/sessions —— 当前登录用户的全部会话（不含消息）
 * @returns {Promise<{ok: boolean, status: number, sessions: Array}>}
 */
export async function fetchSessions() {
  const r = await getJSON(BASE);
  if (!r.ok || !r.data || !Array.isArray(r.data.sessions)) {
    return { ok: false, status: r.status, sessions: [] };
  }
  return { ok: true, status: r.status, sessions: r.data.sessions.map(mapSession) };
}

/**
 * POST /api/ai/sessions —— 新建会话
 * @param {{id: string, title?: string, pinned?: boolean}} payload
 * @returns {Promise<{ok: boolean, status: number, session: object|null}>}
 */
export async function createSession(payload) {
  const r = await postJSON(BASE, payload || {});
  if (!r.ok || !r.data || !r.data.session) return { ok: false, status: r.status, session: null };
  return { ok: true, status: r.status, session: mapSession(r.data.session) };
}

/**
 * POST /api/ai/sessions/import —— 把旧 sessionStorage 的会话整批搬进 D1（一次性）
 * @param {Array} sessions ai-chat-store 形态的会话数组（含 messages）
 */
export async function importSessions(sessions) {
  const body = {
    sessions: (sessions || []).map((s) => ({
      id: s.id,
      title: s.title || '',
      pinned: !!s.pinned,
      createdAt: new Date(s.createdAt || Date.now()).toISOString(),
      updatedAt: new Date(s.updatedAt || s.createdAt || Date.now()).toISOString(),
      messages: (s.messages || []).map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: new Date(m.createdAt || s.updatedAt || Date.now()).toISOString(),
      })),
    })),
  };
  const r = await postJSON(BASE + '/import', body);
  return { ok: r.ok, status: r.status, data: r.data || null };
}

/**
 * PATCH /api/ai/sessions/:id —— 重命名 / 置顶
 * @param {string} id
 * @param {{title?: string, pinned?: boolean}} patch
 */
export async function patchSession(id, patch) {
  const r = await patchJSON(BASE + '/' + encodeURIComponent(id), patch || {});
  return { ok: r.ok, status: r.status, session: r.ok && r.data ? r.data.session : null };
}

/** DELETE /api/ai/sessions/:id —— 删除会话（消息由数据库级联清理） */
export async function deleteSession(id) {
  const r = await delJSON(BASE + '/' + encodeURIComponent(id));
  return { ok: r.ok, status: r.status };
}

/**
 * GET /api/ai/sessions/:id/messages —— 拉取某会话的全部消息
 * @returns {Promise<{ok: boolean, status: number, messages: Array}>}
 */
export async function fetchMessages(id) {
  const r = await getJSON(BASE + '/' + encodeURIComponent(id) + '/messages');
  if (!r.ok || !r.data || !Array.isArray(r.data.messages)) {
    return { ok: false, status: r.status, messages: [] };
  }
  return { ok: true, status: r.status, messages: r.data.messages.map(mapMessage) };
}

/**
 * POST /api/ai/sessions/:id/messages —— 追加消息（批量）
 * @param {string} id
 * @param {Array<{role: string, content: string, createdAt?: number}>} messages
 * @param {string} [title] 传入则同时更新会话标题（自动命名走这里，省一次往返）
 */
export async function appendMessages(id, messages, title) {
  const body = {
    messages: (messages || []).map((m) => ({
      role: m.role,
      content: m.content,
      createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : undefined,
    })),
  };
  if (title) body.title = title;
  const r = await postJSON(BASE + '/' + encodeURIComponent(id) + '/messages', body);
  return { ok: r.ok, status: r.status, data: r.data || null };
}
