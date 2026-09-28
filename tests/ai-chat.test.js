/* ==========================================================================
 * tests/ai-chat.test.js —— /api/ai/chat 接口单测（2026-09-28）
 *
 * 覆盖规格要求的全部错误分支与两种上游模式：
 *   200 非流式默认（单帧 SSE + usage 记账）/ 200 AI_CHAT_STREAM=1 流式透传 /
 *   400 请求体非法 / 401 未登录 / 429 限流（Retry-After）
 *   501 无 AI binding / 502 AI 调用失败 / 模型可由 AI_CHAT_MODEL 配置
 *
 * 桩说明：不引入任何运行时依赖 ——
 *   · env.AI  用假 run() 返回手工构造的 ReadableStream（SSE 帧）
 *   · env.DB  用最小 D1 桩（prepare→bind→first/run），按 SQL 关键字返回
 *   · JWT     用 auth.js 自己的 signJWT 签真令牌（Cookie: token=...），
 *             sessions 表桩返回存在行 → verifySession 通过
 * ========================================================================== */
/* ⚠️ 不 import vitest API —— 见 vite.config.js test.globals 的根因说明：
 *   本环境下 `import { describe } from 'vitest'` 会解析到另一份模块实例，
 *   使整个文件在收集阶段就失败（0 test）。describe/it/expect/vi 由 globals 注入。 */
import { handleAiChatApi } from '../worker/ai-chat.js';
import { signJWT } from '../worker/auth.js';

const SECRET = 'test-jwt-secret';

/** 最小 D1 桩：按 SQL 关键字决定返回值；记录 ai_usage UPSERT 便于断言记账 */
function fakeDb(opts = {}) {
  const upserts = [];
  return {
    upserts,
    prepare(sql) {
      return {
        bind(...args) { this._args = args; return this; },
        async first() {
          if (/FROM sessions/i.test(sql)) return opts.sessionExists ? { id: 1 } : null;
          if (/FROM rate_limits/i.test(sql)) {
            return { count: opts.rlCount || 0, last_request: Date.now() };
          }
          return null;
        },
        async run() {
          if (/INSERT INTO ai_usage/i.test(sql)) upserts.push(this._args);
          return { meta: {} };
        },
      };
    },
  };
}

/** 真 SSE 流桩：两帧 response 增量 + [DONE] 结束帧（AI_CHAT_STREAM=1 旧路径用） */
function sseStream() {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      c.enqueue(enc.encode('data: {"response":"你"}\n\n'));
      c.enqueue(enc.encode('data: {"response":"好"}\n\n'));
      c.enqueue(enc.encode('data: [DONE]\n\n'));
      c.close();
    },
  });
}

/* 非流式结果桩（2026-09-28 默认路径）：完整文本 + 精确 usage */
function nonStreamResult() {
  return { response: '你好', usage: { prompt_tokens: 100, completion_tokens: 20 } };
}

function aiStub(impl) {
  return { run: vi.fn(impl) };
}

async function authedRequest(env, body, extra = {}) {
  const jwt = await signJWT({ sub: 7, sid: 's1', username: 'tester', role: 'user' }, SECRET);
  return new Request('https://luminae.dpdns.org/api/ai/chat', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json', Cookie: 'token=' + jwt }, extra.headers || {}),
    body,
  });
}

const OK_BODY = JSON.stringify({ messages: [{ role: 'user', content: '你好' }] });

describe('POST /api/ai/chat', () => {
  it('401：未登录（无 Cookie）直接拒绝，且不触碰 AI', async () => {
    const ai = aiStub(() => sseStream());
    const env = { DB: fakeDb({ sessionExists: false }), JWT_SECRET: SECRET, AI: ai };
    const res = await handleAiChatApi(new Request('https://x/api/ai/chat', { method: 'POST', body: OK_BODY }), env);
    expect(res.status).toBe(401);
    expect(ai.run).not.toHaveBeenCalled();
  });

  it('400：请求体不是合法 JSON', async () => {
    const env = { DB: fakeDb({ sessionExists: true }), JWT_SECRET: SECRET, AI: aiStub(() => sseStream()) };
    const req = await authedRequest(env, '{bad json');
    expect((await handleAiChatApi(req, env)).status).toBe(400);
  });

  it('400：messages 非法（缺数组 / role 越界 / 单条超长）', async () => {
    const env = { DB: fakeDb({ sessionExists: true }), JWT_SECRET: SECRET, AI: aiStub(() => sseStream()) };
    for (const body of [
      JSON.stringify({ messages: 'nope' }),
      JSON.stringify({ messages: [] }),
      JSON.stringify({ messages: [{ role: 'tool', content: 'x' }] }),
      JSON.stringify({ messages: [{ role: 'user', content: 'a'.repeat(4001) }] }),
    ]) {
      const req = await authedRequest(env, body);
      expect((await handleAiChatApi(req, env)).status).toBe(400);
    }
  });

  it('501：wrangler.toml 未配置 [ai] binding', async () => {
    const env = { DB: fakeDb({ sessionExists: true }), JWT_SECRET: SECRET };
    const req = await authedRequest(env, OK_BODY);
    expect((await handleAiChatApi(req, env)).status).toBe(501);
  });

  it('429：每分钟限流触发，响应带 Retry-After', async () => {
    const env = { DB: fakeDb({ sessionExists: true, rlCount: 10 }), JWT_SECRET: SECRET, AI: aiStub(() => sseStream()) };
    const req = await authedRequest(env, OK_BODY);
    const res = await handleAiChatApi(req, env);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
  });

  it('502：AI 调用抛错', async () => {
    const env = { DB: fakeDb({ sessionExists: true }), JWT_SECRET: SECRET, AI: aiStub(() => { throw new Error('boom'); }) };
    const req = await authedRequest(env, OK_BODY);
    expect((await handleAiChatApi(req, env)).status).toBe(502);
  });

  it('200：默认非流式——完整文本单帧 SSE + 精确 usage 记账 + 默认模型', async () => {
    const run = vi.fn(() => nonStreamResult());
    const db = fakeDb({ sessionExists: true });
    const env = { DB: db, JWT_SECRET: SECRET, AI: { run } };
    const req = await authedRequest(env, OK_BODY);
    const res = await handleAiChatApi(req, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    const text = await res.text();
    /* 完整文本包成单帧（修复 fp8-fast 流式丢 token：内容必须一字不少） */
    expect(text).toBe('data: {"response":"你好"}\n\ndata: [DONE]\n\n');
    /* 默认模型：llama-3.3-70b-instruct-fp8-fast */
    expect(run.mock.calls[0][0]).toBe('@cf/meta/llama-3.3-70b-instruct-fp8-fast');
    /* 只把 user/assistant/system 消息传给模型；默认不带 stream 标志 */
    expect(run.mock.calls[0][1].messages).toEqual([{ role: 'user', content: '你好' }]);
    expect(run.mock.calls[0][1].stream).toBeUndefined();
    /* 记账走精确 usage：neuronsFor(100, 20) = round(2.6668 + 4.0961) = 7 */
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0][1]).toBe(7);
  });

  it('200：AI_CHAT_STREAM=1 恢复上游流式透传（旧路径兼容）', async () => {
    const run = vi.fn(() => sseStream());
    const env = { DB: fakeDb({ sessionExists: true }), JWT_SECRET: SECRET, AI: { run }, AI_CHAT_STREAM: '1' };
    const req = await authedRequest(env, OK_BODY);
    const res = await handleAiChatApi(req, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text).toContain('data: {"response":"你"}');
    expect(text).toContain('data: {"response":"好"}');
    expect(text).toContain('[DONE]');
    expect(run.mock.calls[0][1].stream).toBe(true);
  });

  it('200：非流式但上游没返回内容 → 502', async () => {
    const run = vi.fn(() => ({ response: '', usage: {} }));
    const env = { DB: fakeDb({ sessionExists: true }), JWT_SECRET: SECRET, AI: { run } };
    const req = await authedRequest(env, OK_BODY);
    expect((await handleAiChatApi(req, env)).status).toBe(502);
  });

  it('模型可通过 env.AI_CHAT_MODEL 配置', async () => {
    const run = vi.fn(() => nonStreamResult());
    const env = { DB: fakeDb({ sessionExists: true }), JWT_SECRET: SECRET, AI: { run }, AI_CHAT_MODEL: '@cf/qwen/qwen2.5-coder-32b-instruct' };
    const req = await authedRequest(env, OK_BODY);
    const res = await handleAiChatApi(req, env);
    expect(res.status).toBe(200);
    expect(run.mock.calls[0][0]).toBe('@cf/qwen/qwen2.5-coder-32b-instruct');
  });
});
