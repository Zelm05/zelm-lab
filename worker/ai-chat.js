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
 *   （usage 记账是旁路字节偷听，不改变转发内容 —— 见 makeUsageTap。）
 *
 * Neuron 额度（2026-09-28）：
 *   GET /api/ai/usage → { used, limit: 10000, remaining, resetsAt }
 *   每次对话结束从流里提取 token usage 换算 Neuron 累计进 D1 ai_usage 表。
 * ========================================================================== */
import { json, verifySession, checkRateLimit } from './auth.js';

const DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const ROLES = ['system', 'user', 'assistant'];
/* 防刷兜底：即便过了限流，单次请求也不能无限大 */
const MAX_MESSAGES = 24;
const MAX_CONTENT_CHARS = 4000;
const MAX_TOTAL_CHARS = 12000;
/* 首字节超时：模型挂起时不能让用户干等到浏览器自己超时。
   非流式要等完整生成，给到 60s；流式只等首字节，30s 足够。 */
const FIRST_BYTE_TIMEOUT_MS = 30000;
const RUN_TIMEOUT_MS = 60000;
/* 限流：每用户 10 次/分钟、200 次/天（按天分桶的 key，滑动窗口对齐当天） */
const RATE_PER_MIN = 10;
const RATE_PER_DAY = 200;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/* ---------- Neuron 额度（2026-09-28） ----------
 * Cloudflare 免费档按天给约 10,000 Neurons（00:00 UTC 重置），且没有
 * 「剩余额度」API —— 只能自己记账：从 AI 响应里提取 token usage，按
 * 模型定价换算成 Neuron 累计进 D1（ai_usage 表，migration-029）。
 * 定价（Neurons / M tokens）：输入 26,668 · 输出 204,805。 */
const NEURON_LIMIT_DAILY = 10000;
export { NEURON_LIMIT_DAILY };   // 翻译接口共用同一账本（2026-09-29 加）
const NEURONS_PER_M_INPUT = 26668;
const NEURONS_PER_M_OUTPUT = 204805;

/** 当天 UTC 日期（额度重置锚点，与 Cloudflare 计费日对齐） */
export function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

/** 下一个 UTC 午夜的 ISO 时间（前端展示「何时重置」用） */
export function nextUtcMidnightIso(now) {
  const d = now ? new Date(now) : new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
}

/** token 用量 → Neuron 换算（四舍五入到整数；负数/非法输入返回 0） */
export function neuronsFor(promptTokens, completionTokens) {
  const pt = Number(promptTokens) || 0;
  const ct = Number(completionTokens) || 0;
  if (pt < 0 || ct < 0) return 0;
  return Math.round((pt * NEURONS_PER_M_INPUT + ct * NEURONS_PER_M_OUTPUT) / 1e6);
}

/**
 * 从流式/非流式响应文本里提取 token usage；没有 usage 字段时按
 * ~4 字符 / token 粗估（llama 系英文偏低、中文偏高，记账够用）。
 * @returns {{ prompt: number, completion: number, estimated: boolean }}
 */
export function extractUsage(text, promptChars) {
  const src = String(text || '');
  /* usage 可能长这样：{"prompt_tokens":123,"completion_tokens":45}（包裹在 usage 键里）。
     用宽松正则而非严格 JSON.parse —— SSE 半截帧、多帧拼接都能兜住。 */
  const um = src.match(/"usage"\s*:\s*\{[^}]*\}/);
  const scope = um ? um[0] : src;
  const pm = scope.match(/"prompt_tokens"\s*:\s*(\d+)/);
  const cm = scope.match(/"completion_tokens"\s*:\s*(\d+)/);
  if (pm || cm) {
    return { prompt: pm ? Number(pm[1]) : 0, completion: cm ? Number(cm[1]) : 0, estimated: false };
  }
  /* 估算回退：上游没给 usage（部分模型/老接口）或被截断时 */
  const outChars = src.replace(/^data:\s*/gm, '').replace(/\[DONE\]/g, '').length;
  return {
    prompt: Math.max(1, Math.ceil((Number(promptChars) || 0) / 4)),
    completion: Math.max(1, Math.ceil(outChars / 4)),
    estimated: true,
  };
}

/** 把一次消耗累计进 D1（UPSERT 当天行）；记账失败绝不影响对话本身 */
export async function recordAiUsage(env, promptTokens, completionTokens) {
  const neurons = neuronsFor(promptTokens, completionTokens);
  if (!neurons || neurons <= 0 || !env || !env.DB) return;
  const day = todayUtc();
  try {
    await env.DB.prepare(
      'INSERT INTO ai_usage (day, neurons, updated_at) VALUES (?1, ?2, ?3) '
      + 'ON CONFLICT(day) DO UPDATE SET neurons = neurons + ?2, updated_at = ?3',
    ).bind(day, neurons, Date.now()).run();
  } catch (e) {
    console.error('ai_usage 记账失败:', (e && e.message) || e);
  }
}

/**
 * 透传式 usage 偷听管道：字节原样过（SSE 转发零改动、零延迟增加），
 * 旁路攒一份解码文本，流结束时提取 usage 并记账。
 * 注意：客户端中途 abort 时 flush 不会执行 → 该次不记账（可接受的偏差）。
 */
function makeUsageTap(env, promptChars) {
  const dec = new TextDecoder();
  let text = '';
  return new TransformStream({
    transform(chunk, ctrl) {
      try { text += dec.decode(chunk, { stream: true }); } catch (e) { /* 非 UTF-8 忽略 */ }
      ctrl.enqueue(chunk); /* 原字节透传，不做任何改写 */
    },
    async flush() {
      try { text += dec.decode(); } catch (e) { /* 忽略 */ }
      const u = extractUsage(text, promptChars);
      await recordAiUsage(env, u.prompt, u.completion);
    },
  });
}

/** GET /api/ai/usage —— 当天已用 Neuron / 剩余额度（登录用户） */
export async function handleAiUsageApi(request, env) {
  let p;
  try { p = new URL(request.url).pathname; } catch (e) { return null; }
  if (p !== '/api/ai/usage') return null;
  if (request.method !== 'GET') return json({ error: '方法不支持' }, 405);

  const user = await verifySession(request, env);
  if (!user || user.kicked) return json({ error: 'AI 对话需要先登录' }, 401);

  let used = 0;
  try {
    const row = await env.DB.prepare('SELECT neurons FROM ai_usage WHERE day = ?1')
      .bind(todayUtc())
      .first();
    used = row ? Number(row.neurons) || 0 : 0;
  } catch (e) {
    /* 表还没建（迁移未跑）等情况：按 0 处理，不能让额度接口 500 拖垮聊天 */
    used = 0;
  }
  return json({
    used,
    limit: NEURON_LIMIT_DAILY,
    remaining: Math.max(0, NEURON_LIMIT_DAILY - used),
    resetsAt: nextUtcMidnightIso(),
  });
}

/** 带超时的 AI 调用（超时抛含 abort 的错误 → 502）；
 *  opts.stream=true 时等首字节（流式），否则等完整结果（非流式，给更长超时） */
function runWithTimeout(env, model, messages, opts, timeoutMs) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('AI 调用超时（' + Math.round(timeoutMs / 1000) + 's），已 abort')), timeoutMs);
  });
  return Promise.race([env.AI.run(model, { messages, ...opts }), guard]).finally(
    () => clearTimeout(timer),
  );
}

/** 完整文本包装成单帧 SSE（data: {...}\n\n + data: [DONE]\n\n）——前端解析协议不变 */
export function toSseFrame(text) {
  return 'data: ' + JSON.stringify({ response: String(text || '') }) + '\n\ndata: [DONE]\n\n';
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

  /* ⑤ 调用并转发（AI 侧失败 502）。
   * 2026-09-28 晚：上游默认改为**非流式**——@cf/meta/llama-3.3-70b-instruct-fp8-fast
   * 的流式路径有已知的投机解码丢 token bug（约 5~10% 的回复恰好丢一个数字类 token，
   * whitespace 保留；Cloudflare Developers Discord 2026-04-29 有完整复现报告，
   * 本项目实测「1+2等于几」答成「+ 2 = 3」「5+8」答成「+ 8 = 13」——同模式）。
   * 非流式返回已提交的完整序列：内容 100% 完整，且响应自带精确 usage（记账不再估算）。
   * 完整文本包装成单个 SSE 帧下发，前端流式解析协议不变（打字机效果换成整段出现）。
   * 如需恢复上游逐 token 流式（官方修复后/换模型），设 env.AI_CHAT_STREAM = "1"。 */
  const promptChars = trimmed.reduce((n, m) => n + m.content.length, 0);
  const sseHeaders = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  };

  if (String(env.AI_CHAT_STREAM || '').trim() === '1') {
    /* 旧流式路径：字节透传 + makeUsageTap 旁路记账（保留给官方修复后切换） */
    let stream;
    try {
      stream = await runWithTimeout(env, model, trimmed, { stream: true }, FIRST_BYTE_TIMEOUT_MS);
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/abort/i.test(msg)) return json({ error: 'AI 服务超时，请重试' }, 502);
      return json({ error: 'AI 调用失败：' + msg }, 502);
    }
    if (!stream) return json({ error: 'AI 服务未返回流式结果' }, 502);
    return new Response(stream.pipeThrough(makeUsageTap(env, promptChars)), {
      status: 200,
      headers: sseHeaders,
    });
  }

  /* 默认非流式：完整结果 → 单帧 SSE */
  let result;
  try {
    result = await runWithTimeout(env, model, trimmed, {}, RUN_TIMEOUT_MS);
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/abort/i.test(msg)) return json({ error: 'AI 服务超时，请重试' }, 502);
    return json({ error: 'AI 调用失败：' + msg }, 502);
  }
  const text = result && typeof result.response === 'string' ? result.response : '';
  if (!text) return json({ error: 'AI 服务未返回内容' }, 502);
  /* usage 记账：非流式响应自带精确 token 数；记账失败不影响回复（函数内部已兜底） */
  const usage = extractUsage(JSON.stringify(result), promptChars);
  await recordAiUsage(env, usage.prompt, usage.completion);

  return new Response(toSseFrame(text), { status: 200, headers: sseHeaders });
}
