/* ==========================================================================
 * src/api/http.js —— 极简 fetch 封装
 *
 * 原站每个模块各写一遍 fetch + r.json() + 错误分支，这里收敛成一处。
 * 统一带 credentials（同源 Cookie 鉴权）与 JSON 头，并把响应解成
 * { ok, status, data, error }，调用方不必再判断 r.ok 与手动解析。
 *
 * P1-6（2026-09-23）：**永不 reject**。此前网络异常时 fetch 直接抛，
 *   而全仓 21 个调用点没有一个 .catch（实测 grep 命中 0），于是弱网下
 *   Promise 永不 settle：管理台的 usersLoading 永远是 true —— 页面卡在
 *   「加载中」，只有刷新能救。现在异常/超时/取消都归一化成
 *   { ok:false, status:0, data:null, error:'…' }，调用方原有的失败分支
 *   会自动生效。
 * ========================================================================== */

import { i18n } from '@/core/i18n';

/** 单请求超时（毫秒）。弱网下不能让请求无限期挂着。 */
const TIMEOUT_MS = 15000;

/**
 * 把「调用方传入的 signal」（P1-7 的竞态取消）与「15s 超时」合成一个 signal，
 * 并记录中断来源，好让 error 文案能区分「被取消」和「超时」。
 */
function linkSignal(external) {
  const ac = new AbortController();
  let source = '';
  const onExternalAbort = () => { source = 'caller'; ac.abort(); };
  if (external) {
    if (external.aborted) onExternalAbort();
    else external.addEventListener('abort', onExternalAbort, { once: true });
  }
  const timer = setTimeout(() => { source = 'timeout'; ac.abort(); }, TIMEOUT_MS);
  return {
    signal: ac.signal,
    source: () => source,
    dispose: () => {
      clearTimeout(timer);
      if (external) external.removeEventListener('abort', onExternalAbort);
    },
  };
}

/**
 * 统一发请求 + 归一化结果。永远 resolve，永不 reject。
 *   · HTTP 层 2xx      → { ok:true,  status, data, error:'' }
 *   · HTTP 层 4xx/5xx  → { ok:false, status, data, error:'' }   ← data 里是后端的 { error }
 *   · 网络异常         → { ok:false, status:0, data:null, error:'网络错误' }
 *   · 超时             → { ok:false, status:0, data:null, error:'请求超时' }
 *   · 被调用方取消     → { ok:false, status:0, data:null, error:'请求已取消' }
 */
async function request(url, init, opts) {
  const link = linkSignal(opts && opts.signal);
  try {
    const r = await fetch(url, { ...init, signal: link.signal });
    let data = null;
    try { data = await r.json(); } catch (e) { /* 204 / 非 JSON：保持 null */ }
    // P2-18：会话失效（401）时广播一次，让应用把前端登录态同步成「未登录」，
    // 监听方在 App.vue（user.set(null)）。401 也会出现在「本来就未登录」的探测
    // 请求上（如 /api/me），那时 set(null) 是无害空操作，不会造成循环或误伤。
    if (r.status === 401) {
      try { document.dispatchEvent(new Event('zelm:logout')); } catch (e) { /* 非 DOM 环境忽略 */ }
    }
    return { ok: r.ok, status: r.status, data, error: '' };
  } catch (e) {
    const src = link.source();
    return {
      ok: false,
      status: 0,
      data: null,
      error: src === 'timeout'
      ? i18n.global.t('common.netTimeout')
      : src === 'caller' ? i18n.global.t('common.netAborted') : i18n.global.t('common.netError'),
    };
  } finally {
    link.dispose();
  }
}

/** JSON 请求体的公共 init */
const jsonInit = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify(body || {}),
});

/** GET —— 默认只读接口。opts.signal 可选（竞态取消） */
export function getJSON(url, opts) {
  return request(url, { credentials: 'include' }, opts);
}

/** POST —— 写接口（无 body 时传 {}） */
export function postJSON(url, body, opts) {
  return request(url, jsonInit('POST', body), opts);
}

/** PUT —— 整份覆盖写（管理台站点设置） */
export function putJSON(url, body, opts) {
  return request(url, jsonInit('PUT', body), opts);
}

/** PATCH —— 局部更新（改角色 / 冻结） */
export function patchJSON(url, body, opts) {
  return request(url, jsonInit('PATCH', body), opts);
}

/** DELETE */
export function delJSON(url, opts) {
  return request(url, { method: 'DELETE', credentials: 'include' }, opts);
}
