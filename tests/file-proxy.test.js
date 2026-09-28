/* ==========================================================================
 * file-proxy.test.js —— /api/file-proxy 单测（2026-09-28）
 *
 * 覆盖：
 *   1. 合法引用：上游 URL 正确拼装、inline、CSP frame-ancestors 'self'、
 *      不带 X-Frame-Options（DENY 由 index.js 中间件对非代理路径补）、可缓存
 *   2. dl=1 + 中文文件名：attachment + filename*（RFC 5987）
 *   3. 路径穿越（../）→ 400
 *   4. 桶不在白名单 → 400
 *   5. 上游 404 → 404
 *   6. 上游 500 → 502
 * fetch 一律打桩，不打真实网络。
 * ========================================================================== */
/* ⚠️ 不 import vitest API —— 见 vite.config.js test.globals 的根因说明：
 *   本环境下 `import { describe } from 'vitest'` 会解析到另一份模块实例，
 *   使整个文件在收集阶段就失败（0 test）。describe/it/expect/vi/afterEach 由 globals 注入。 */
import { handleFileProxyApi } from '../worker/file-proxy.js';

const ENV = { SUPABASE_URL: 'https://sb.example' };

/** 打桩全局 fetch：记录收到的 URL，返回可配置的上游响应 */
function stubFetch(status, headers = {}) {
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    calls.push(String(url));
    return new Response(status === 200 || status === 206 ? '%PDF-1.4 fake' : 'err', {
      status,
      headers,
    });
  }));
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function get(ref, extra = '') {
  const url = 'https://luminae.dpdns.org/api/file-proxy?ref=' + encodeURIComponent(ref) + extra;
  return handleFileProxyApi(new Request(url), ENV);
}

describe('GET /api/file-proxy', () => {
  it('1. 合法引用：转发到 Supabase 公开桶，响应头按白名单重写', async () => {
    const calls = stubFetch(200, { 'Content-Type': 'application/pdf', 'Content-Length': '13' });
    const res = await get('resume/cv/1/abc.pdf');
    expect(res.status).toBe(200);
    /* 上游 URL：桶 + 段编码路径 */
    expect(calls[0]).toBe('https://sb.example/storage/v1/object/public/resume/cv/1/abc.pdf');
    /* inline：浏览器原生查看器可渲染 */
    expect(res.headers.get('Content-Disposition')).toBe('inline; filename="abc.pdf"');
    /* 同源 iframe 可内嵌 */
    expect(res.headers.get('Content-Security-Policy')).toBe("frame-ancestors 'self'");
    /* 决不能带 X-Frame-Options（DENY/SAMEORIGIN 由 index.js 中间件统一处理） */
    expect(res.headers.get('X-Frame-Options')).toBeNull();
    /* 可缓存（对象不可变） */
    expect(res.headers.get('Cache-Control')).toContain('max-age=3600');
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    const body = await res.text();
    expect(body).toBe('%PDF-1.4 fake');
  });

  it('2. dl=1 + n=中文文件名 → attachment + filename*（RFC 5987）', async () => {
    stubFetch(200, { 'Content-Type': 'application/pdf' });
    const res = await get('resume/cv/1/abc.pdf', '&dl=1&n=' + encodeURIComponent('简历-2026.pdf'));
    const cd = res.headers.get('Content-Disposition');
    expect(cd.startsWith('attachment;')).toBe(true);
    /* ASCII 兜底名（非 ASCII 逐字替换为 _）+ UTF-8 编码名都要有 */
    expect(cd).toContain('filename="__-2026.pdf"');
    expect(cd).toContain("filename*=UTF-8''" + encodeURIComponent('简历-2026.pdf'));
  });

  it('3. 路径穿越（../）→ 400，绝不发起上游请求', async () => {
    const calls = stubFetch(200);
    const res = await get('resume/cv/../../service_role');
    expect(res.status).toBe(400);
    expect(calls.length).toBe(0);
  });

  it('4. 桶不在白名单 → 400（拒绝变成开放代理）', async () => {
    const calls = stubFetch(200);
    const res = await get('evil-bucket/secret.pdf');
    expect(res.status).toBe(400);
    expect(calls.length).toBe(0);
  });

  it('5. 上游 404 → 404（JSON 错误，不透传二进制空流）', async () => {
    stubFetch(404);
    const res = await get('certificate-assets/certs/1/gone.pdf');
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBeTruthy();
  });

  it('6. 上游 500 → 502', async () => {
    stubFetch(500);
    const res = await get('photos/x.webp');
    expect(res.status).toBe(502);
  });

  it('7. Range 请求透传：206 与 Content-Range 原样回给查看器', async () => {
    stubFetch(206, {
      'Content-Type': 'application/pdf',
      'Content-Range': 'bytes 0-99/5000',
      'Accept-Ranges': 'bytes',
    });
    const req = new Request('https://luminae.dpdns.org/api/file-proxy?ref=' +
      encodeURIComponent('resume/cv/1/abc.pdf'), { headers: { Range: 'bytes=0-99' } });
    const res = await handleFileProxyApi(req, ENV);
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 0-99/5000');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
  });
});
