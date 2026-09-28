/* ==========================================================================
 * tests/ai-chat.test.js —— /api/ai/chat 接口单测（2026-09-28）
 *
 * 覆盖规格要求的全部错误分支与流式转发：
 *   200 SSE 透传 / 400 请求体非法 / 401 未登录 / 429 限流（Retry-After）
 *   501 无 AI binding / 502 AI 调用失败 / 模型可由 AI_CHAT_MODEL 配置
 *
 * 桩说明：不引入任何运行时依赖 ——
 *   · env.AI  用假 run() 返回手工构造的 ReadableStream（SSE 帧）
 *   · env.DB  用最小 D1 桩（prepare→bind→first/run），按 SQL 关键字返回
 *   · JWT     用 auth.js 自己的 signJWT 签真令牌（Cookie: token=...），
 *             sessions 表桩返回存在行 → verifySession 通过
 * ========================================================================== */
import { describe, it, expect, vi } from 'vitest';
import { handleAiChatApi } from '../worker/ai-chat.js';
import { signJWT } from '../worker/auth.js';

const SECRET = 'test-jwt-secret';

/** 最小 D1 桩：按 SQL 关键字决定返回值 */
function fakeDb(opts = {}) {
  return {
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
        async run() { return { meta: {} }; },
      };
    },
  };
}

/** 真 SSE 流桩：两帧 response 增量 + [DONE] 结束帧 */
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

  it('200：SSE 透传（Content-Type / 帧内容 / 默认模型）', async () => {
    const run = vi.fn(() => sseStream());
    const env = { DB: fakeDb({ sessionExists: true }), JWT_SECRET: SECRET, AI: { run } };
    const req = await authedRequest(env, OK_BODY);
    const res = await handleAiChatApi(req, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    const text = await res.text();
    expect(text).toContain('data: {"response":"你"}');
    expect(text).toContain('[DONE]');
    /* 默认模型：llama-3.3-70b-instruct-fp8-fast */
    expect(run.mock.calls[0][0]).toBe('@cf/meta/llama-3.3-70b-instruct-fp8-fast');
    /* 只把 user/assistant/system 消息传给模型 */
    expect(run.mock.calls[0][1].messages).toEqual([{ role: 'user', content: '你好' }]);
  });

  it('模型可通过 env.AI_CHAT_MODEL 配置', async () => {
    const run = vi.fn(() => sseStream());
    const env = { DB: fakeDb({ sessionExists: true }), JWT_SECRET: SECRET, AI: { run }, AI_CHAT_MODEL: '@cf/qwen/qwen2.5-coder-32b-instruct' };
    const req = await authedRequest(env, OK_BODY);
    const res = await handleAiChatApi(req, env);
    expect(res.status).toBe(200);
    expect(run.mock.calls[0][0]).toBe('@cf/qwen/qwen2.5-coder-32b-instruct');
  });
});
