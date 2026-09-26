/* ==========================================================================
 * content.js —— 内容 API 客户端（配合 worker/content.js）
 *
 * 两条通道：
 *   · 公开读  /api/content/<模块>[/<id>]?lang=xx    → 自动带上当前界面语言
 *   · 后台读写 /api/admin/<模块>[/<id>]             → 需要登录且 role=owner
 *
 * ⚠️ 项目封装的 getJSON/postJSON 返回的是 **{ ok, status, data, error }**，
 *    不是裸数据 —— 取内容一律读 `.data`（`r.data.items` / `r.data.item`）。
 *    写请求**必须检查 ok**，否则失败会被当成成功。
 * ========================================================================== */
import { getJSON, postJSON, putJSON, delJSON } from './http';
import { getLocale } from '@/core/i18n';

/** 后端认可的模块名（与 worker/content.js 的 SPECS 一一对应，别随意加） */
export const CONTENT_MODULES = ['about', 'blogs', 'certificates', 'projects', 'logs', 'moments', 'photos'];

/**
 * 拼公开读的 URL。lang 默认取**当前界面语言** —— 这就是「语言切换后动态内容
 * 自动重新请求」的关键：调用方不用自己管语言，切了再调一次即可。
 * @param {string} mod 模块名
 * @param {{ lang?: string, kind?: string, id?: number|string }} [opts]
 */
export function contentUrl(mod, opts = {}) {
  const p = new URLSearchParams();
  p.set('lang', opts.lang || getLocale() || 'zh-CN');
  if (opts.kind) p.set('kind', opts.kind);
  const qs = p.toString();
  if (opts.id) return `/api/content/${mod}/${opts.id}?${qs}`;
  return `/api/content/${mod}?${qs}`;
}

/**
 * 读列表/详情。
 * @returns {Promise<{items?: any[], item?: any, lang: string, is_fallback?: boolean}>}
 *          接口失败时返回空壳（items 为空数组），**不抛异常** —— 页面退化为静态兜底即可。
 */
export async function fetchContent(mod, opts = {}) {
  const r = await getJSON(contentUrl(mod, opts));
  if (!r.ok || !r.data) return { items: [], item: null, lang: opts.lang || getLocale() };
  return r.data;
}

/* ---------------- 后台（站长） ---------------- */

/** 后台列表：拿**全量**（含草稿、隐藏项）与每条的完整 translations */
export async function adminList(mod) {
  const r = await getJSON(`/api/admin/${mod}`);
  if (!r.ok || !r.data) return { items: [], langs: [], default_lang: 'zh-CN' };
  return r.data;
}

/**
 * 新建 / 更新。
 * @param {string} mod 模块名
 * @param {object} payload 主表字段平铺 + translations: { lang: {...} }
 * @param {number|string} [id] 有 id 走 PUT，否则 POST
 * @returns {Promise<{ok: boolean, id?: number, error?: string}>}
 */
export async function adminSave(mod, payload, id) {
  const url = id ? `/api/admin/${mod}/${id}` : `/api/admin/${mod}`;
  const r = id ? await putJSON(url, payload) : await postJSON(url, payload);
  if (!r.ok) return { ok: false, error: (r.data && r.data.error) || `HTTP ${r.status}` };
  return { ok: true, id: r.data && r.data.id };
}

/** 删除 */
export async function adminRemove(mod, id) {
  const r = await delJSON(`/api/admin/${mod}/${id}`);
  if (!r.ok) return { ok: false, error: (r.data && r.data.error) || `HTTP ${r.status}` };
  return { ok: true, removed: r.data && r.data.removed };
}
