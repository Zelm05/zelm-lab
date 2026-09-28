/* ==========================================================================
 * tests/ai-usage.test.js —— AI Neuron 额度记账单元测试（2026-09-28）
 *
 * 覆盖 worker/ai-chat.js 的纯逻辑部分：
 *   · neuronsFor   —— token → Neuron 定价换算（输入 26,668 / 输出 204,805 per M）
 *   · extractUsage —— 流式/非流式响应文本提取 usage，缺失时按字符数估算
 *   · recordAiUsage—— D1 UPSERT 记账（含记账失败不抛错）
 *   · todayUtc / nextUtcMidnightIso —— UTC 日界（00:00 UTC 重置锚点）
 *   · handleAiUsageApi 的路由/方法守卫（405 / null）
 * 登录态分支（401/200）依赖 sessions 表，放到真机验证里覆盖。
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import {
  neuronsFor,
  extractUsage,
  recordAiUsage,
  todayUtc,
  nextUtcMidnightIso,
  handleAiUsageApi,
  toSseFrame,
} from '../worker/ai-chat.js';

describe('neuronsFor：token → Neuron 换算', () => {
  it('按定价公式换算（输入 26,668 · 输出 204,805 per M tokens）', () => {
    /* 1,000 输入 + 500 输出 → 26.668 + 102.4025 ≈ 129 */
    expect(neuronsFor(1000, 500)).toBe(129);
    /* 纯输入 1M tokens → 26,668 */
    expect(neuronsFor(1_000_000, 0)).toBe(26668);
    /* 纯输出 1M tokens → 204,805 */
    expect(neuronsFor(0, 1_000_000)).toBe(204805);
  });

  it('零/负数/非法输入安全返回 0', () => {
    expect(neuronsFor(0, 0)).toBe(0);
    expect(neuronsFor(-1, 100)).toBe(0);
    expect(neuronsFor('abc', null)).toBe(0);
    expect(neuronsFor(undefined, undefined)).toBe(0);
  });
});

describe('extractUsage：usage 提取与估算回退', () => {
  it('标准 SSE 流（usage 在最后一帧）→ 精确提取，estimated=false', () => {
    const sse = [
      'data: {"response":"你好"}\n\n',
      'data: {"response":"！"}\n\n',
      'data: {"response":"","usage":{"prompt_tokens":120,"completion_tokens":45}}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    const u = extractUsage(sse, 400);
    expect(u).toEqual({ prompt: 120, completion: 45, estimated: false });
  });

  it('非流式 JSON（usage 平铺）也能提取', () => {
    const j = '{"result":"hi","usage":{"prompt_tokens":10,"completion_tokens":3}}';
    expect(extractUsage(j, 40)).toEqual({ prompt: 10, completion: 3, estimated: false });
  });

  it('无 usage 字段 → 按 ~4 字符/token 估算，estimated=true', () => {
    const sse = 'data: {"response":"abcdefghij"}\n\n'; // 10 字符输出
    const u = extractUsage(sse, 80);
    expect(u.estimated).toBe(true);
    expect(u.prompt).toBe(20);          /* 80/4 */
    expect(u.completion).toBeGreaterThanOrEqual(1);
  });

  it('空/垃圾输入不会崩，且至少估算 1 token', () => {
    expect(extractUsage('', 0).prompt).toBe(1);
    expect(extractUsage('not-json at all', 0).estimated).toBe(true);
  });
});

describe('recordAiUsage：D1 UPSERT 记账', () => {
  function fakeDb(calls) {
    return {
      prepare(sql) {
        return {
          bind(...args) {
            calls.push({ sql, args });
            return { run: async () => ({ success: true }) };
          },
        };
      },
    };
  }

  it('走 UPSERT：INSERT ... ON CONFLICT(day)，绑定 UTC 日期与 Neuron 数', async () => {
    const calls = [];
    await recordAiUsage({ DB: fakeDb(calls) }, 1000, 500);
    expect(calls.length).toBe(1);
    expect(calls[0].sql).toContain('INSERT INTO ai_usage');
    expect(calls[0].sql).toContain('ON CONFLICT(day) DO UPDATE');
    expect(calls[0].args[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/); // UTC 日期
    expect(calls[0].args[1]).toBe(129);                      // 与 neuronsFor(1000,500) 一致
    expect(typeof calls[0].args[2]).toBe('number');          // updated_at 时间戳
  });

  it('0 Neuron / 无 DB 时不发查询（避免垃圾写入）', async () => {
    const calls = [];
    await recordAiUsage({ DB: fakeDb(calls) }, 0, 0);
    await recordAiUsage(null, 100, 100);
    expect(calls.length).toBe(0);
  });

  it('D1 报错时静默降级（记账失败绝不影响对话）', async () => {
    const bad = {
      prepare: () => ({ bind: () => ({ run: async () => { throw new Error('D1 down'); } }) }),
    };
    await expect(recordAiUsage({ DB: bad }, 100, 100)).resolves.toBeUndefined();
  });
});

describe('UTC 日界（额度 00:00 UTC 重置）', () => {
  it('todayUtc 是 YYYY-MM-DD 格式', () => {
    expect(todayUtc()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('nextUtcMidnightIso 是「明天 00:00:00.000Z」', () => {
    const fixed = Date.UTC(2026, 8, 28, 23, 30, 0); // 2026-09-28T23:30Z
    const iso = nextUtcMidnightIso(fixed);
    expect(iso).toBe('2026-09-29T00:00:00.000Z');
  });

  it('UTC 午夜前一毫秒也归到当天次日（重置边界正确）', () => {
    const justBefore = Date.UTC(2026, 0, 1, 23, 59, 59, 999);
    expect(nextUtcMidnightIso(justBefore)).toBe('2026-01-02T00:00:00.000Z');
  });
});

describe('handleAiUsageApi：路由与方法守卫', () => {
  const base = 'https://luminae.dpdns.org';

  it('非 /api/ai/usage 路径返回 null（交回主路由）', async () => {
    expect(await handleAiUsageApi(new Request(base + '/api/ai/chat'), {})).toBeNull();
    expect(await handleAiUsageApi(new Request(base + '/x'), {})).toBeNull();
  });

  it('POST 被拒 405（只允许 GET）', async () => {
    const r = await handleAiUsageApi(new Request(base + '/api/ai/usage', { method: 'POST' }), {});
    expect(r.status).toBe(405);
  });
});

describe('toSseFrame：非流式结果包装成单帧 SSE（2026-09-28 丢 token 修复）', () => {
  it('输出 data: {response} 帧 + [DONE] 帧，前端解析协议不变', () => {
    const body = toSseFrame('1 + 2 = 3');
    const frames = body.split('\n\n').filter(Boolean);
    expect(frames).toHaveLength(2);
    expect(frames[0]).toBe('data: {"response":"1 + 2 = 3"}');
    expect(frames[1]).toBe('data: [DONE]');
  });

  it('特殊字符（引号/换行/中文）经 JSON.stringify 安全转义', () => {
    const body = toSseFrame('他说"你好"\n第二行');
    const obj = JSON.parse(body.split('\n\n')[0].slice(5));
    expect(obj.response).toBe('他说"你好"\n第二行');
  });

  it('空/非字符串输入兜底为空字符串帧', () => {
    expect(toSseFrame('')).toBe('data: {"response":""}\n\ndata: [DONE]\n\n');
    expect(toSseFrame(null)).toBe('data: {"response":""}\n\ndata: [DONE]\n\n');
  });
});
