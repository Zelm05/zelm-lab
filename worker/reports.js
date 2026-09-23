// ===================================================================
// reports.js — 浏览器上报落点（无状态、零依赖、不落库）
//
//   POST /api/client-error   前端运行期错误（Vue errorHandler / unhandledrejection）  —— P2-23
//   POST /api/csp-report     CSP 违规报告（Content-Security-Policy-Report-Only）      —— P2-24 阶段一
//
// 共同设计：
//   · 只 console.error，**不写 D1**（避免上报把库写爆；需要长期留存时用 `wrangler tail` 或
//     接 Workers Logs / Logpush）。
//   · 一律返回 204 No Content，绝不因为上报把调用方带崩。
//   · 上报体做长度上限，防止超大/畸形请求把日志刷爆。
//   · 两个路由都在 index.js 的 `/api/*` 处理里**置于写接口来源校验之前**：
//     CSP 报告由浏览器自动发出、不带 Origin 头，走 P2-8 的来源校验会被 403 拦掉。
// ===================================================================

// 上报体上限（字符）：正常错误/CSP 报告远小于此，超出即截断，避免日志被灌爆。
const MAX_REPORT_CHARS = 8192;

/** 读取上报 JSON（容错：非 JSON / 空体 / 超大 → 返回 null 或截断对象） */
async function readReport(request) {
  try {
    const text = await request.text();
    if (!text) return null;
    if (text.length > MAX_REPORT_CHARS) return { truncated: true, preview: text.slice(0, MAX_REPORT_CHARS) };
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

/** 前端运行期错误上报（P2-23） */
export async function reportClientError(request) {
  const body = await readReport(request);
  if (body) console.error('[client-error]', JSON.stringify(body).slice(0, 4000));
  return new Response(null, { status: 204 });
}

/** CSP 违规报告（P2-24 阶段一）。report-uri 的 POST 体形如
 *  { "csp-report": { "violated-directive": "...", "blocked-uri": "...", ... } } */
export async function reportCspViolation(request) {
  const body = await readReport(request);
  if (body) console.error('[csp-report]', JSON.stringify(body).slice(0, 4000));
  return new Response(null, { status: 204 });
}
