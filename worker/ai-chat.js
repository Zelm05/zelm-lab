/* ==========================================================================
 * ai-chat.js —— 站内 AI 对话接口（Workers AI，SSE 流式）
 *
 *   POST /api/ai/chat
 *   body: { messages: [{ role: 'user'|'assistant'|'system', content: '...' }] }
 *   → 200  text/event-stream（直接转发 Workers AI 的流式输出）
 *   → 400  请求体格式错误（不是 JSON / messages 非法 / 超长）
 *   → 401  未登录（防滥用门槛：仅登录用户可用）
 *   → 429  触发限流（带 Retry-After，秒）
 *   → 501  wrangler.toml 未配置 [ai] binding
 *   → 502  AI 调用失败
 *
 * 防滥用（2026-09-28）：
 *   · 登录门槛 —— 未登录直接 401（比 Turnstile 少一套密钥配置，够用）；
 *   · 复用 rate_limits 表双层限流：每用户 10 次/分钟 + 200 次/天。
 *
 * 模型：默认 @cf/meta/llama-3.3-70b-instruct-fp8-fast（对话质量/成本平衡），
 *       设 env.AI_CHAT_MODEL 可换（vars 或 secret 均可）。
 *
 * SSE 细节：Workers AI 的 stream:true 返回的就是 EventSource 兼容流
 *   （`data: {"response":"..."}\n\n` … `data: [DONE]`），直接透传即可，
 *   不在边缘做逐块解析 —— 解析留给前端，边缘只做转发，延迟最低。
 * ========================================================================== */
import { json, verifySession, checkRateLimit } from './auth.js';

const DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const ROLES = ['system', 'user', 'assistant'];
/* 防刷兜底：即便过了限流，单次请求也不能无限大 */
const MAX_MESSAGES = 24;
const MAX_CONTENT_CHARS = 4000;
const MAX_TOTAL_CHARS = 12000;
/* 首字节超时：模型挂起时不能让用户干等到浏览器自己超时 */
const FIRST_BYTE_TIMEOUT_MS = 30000;
/* 限流：每用户 10 次/分钟、200 次/天（按天分桶的 key，滑动窗口对齐当天） */
const RATE_PER_MIN = 10;
const RATE_PER_DAY = 200;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 带首字节超时的 AI 调用（超时抛含 abort 的错误 → 502） */
function runWithTimeout(env, model, messages) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('AI 调用超时（30s），已 abort')), FIRST_BYTE_TIMEOUT_MS);
  });
  return Promise.race([env.AI.run(model, { messages, stream: true }), guard]).finally(
    () => clearTimeout(timer),
  );
}

export async function handleAiChatApi(request, env) {
  let p;
  try { p = new URL(request.url).pathname; } catch (e) { return null; }
  if (p !== '/api/ai/chat') return null;
  if (request.method !== 'POST') return json({ error: '方法不支持' }, 405);

  /* ① 登录门槛（防滥用首选方案，未登录 401）。
     verifySession 需要查 sessions 表；返回 { kicked:true } 视同未登录。 */
  const user = await verifySession(request, env);
  if (!user || user.kicked) return json({ error: 'AI 对话需要先登录' }, 401);

  /* ② 请求体校验（400） */
  let b = null;
  try { b = await request.json(); } catch (e) { return json({ error: '请求体不是合法 JSON' }, 400); }
  if (!b || !Array.isArray(b.messages) || !b.messages.length) {
    return json({ error: 'messages 必须是非空数组' }, 400);
  }
  const msgs = [];
  let total = 0;
  for (const m of b.messages) {
    if (!m || ROLES.indexOf(m.role) === -1 || typeof m.content !== 'string') {
      return json({ error: '消息格式错误（需要 role + content）' }, 400);
    }
    if (m.content.length > MAX_CONTENT_CHARS) {
      return json({ error: '单条消息超过 ' + MAX_CONTENT_CHARS + ' 字符' }, 400);
    }
    total += m.content.length;
    /* 只保留最近 MAX_MESSAGES 条（旧的直接丢弃，不给模型堆积上下文） */
    msgs.push({ role: m.role, content: m.content });
  }
  if (total > MAX_TOTAL_CHARS) return json({ error: '会话总长度超过 ' + MAX_TOTAL_CHARS + ' 字符' }, 400);
  const trimmed = msgs.slice(-MAX_MESSAGES);

  /* ③ 限流（复用 rate_limits 表）：分钟 + 天双层，超限 429 + Retry-After */
  const uid = Number(user.sub) || 0;
  const dayKey = 'ai:chat:day:' + uid + ':' + new Date().toISOString().slice(0, 10);
  const minRl = await checkRateLimit(env, 'ai:chat:min:' + uid, RATE_PER_MIN, MINUTE_MS);
  if (!minRl.allowed) {
    const retry = Math.max(1, Math.ceil(minRl.retryAfter || 60));
    return new Response(JSON.stringify({ error: '发送太频繁，请稍后再试' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': String(retry) },
    });
  }
  const dayRl = await checkRateLimit(env, dayKey, RATE_PER_DAY, DAY_MS);
  if (!dayRl.allowed) {
    return new Response(JSON.stringify({ error: '今日 AI 对话次数已用完，明天再来吧' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '3600' },
    });
  }

  /* ④ AI binding（501） */
  if (!env || !env.AI) return json({ error: 'AI 服务未配置（缺 [ai] binding）' }, 501);
  const model = String(env.AI_CHAT_MODEL || '').trim() || DEFAULT_MODEL;

  /* ⑤ 调用并转发 SSE 流（AI 侧失败 502） */
  let stream;
  try {
    stream = await runWithTimeout(env, model, trimmed);
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/abort/i.test(msg)) return json({ error: 'AI 服务超时，请重试' }, 502);
    return json({ error: 'AI 调用失败：' + msg }, 502);
  }
  if (!stream) return json({ error: 'AI 服务未返回流式结果' }, 502);

  /* 客户端断开：直接把上游流交给运行时 —— fetch 请求被取消时
     Response 的流会被 cancel，Workers AI 侧停止生成，无需手动清理。 */
  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
