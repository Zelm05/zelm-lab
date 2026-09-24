/* ==========================================================================
 * src/core/format.js —— 展示层公共格式化
 *
 * 原实现在社区脚本里内联了一个 fmtTime，管理台也重复写了一遍。
 * 现在收敛到这里，组件直接引用（纯函数、无副作用、可随处调用）。
 *
 * P2-16（2026-09-23）：改用 Intl.DateTimeFormat 做本地化时间格式，
 *   跟随站点当前语言（zh-CN/zh-TW/en/ja）—— 不同语种看到符合习惯的日期排布。
 *   仅在调用方显式传 locale 时用传入值；不传则跟随 i18n 当前 locale。
 *   极老环境（不支持 Intl）回落到原来的 `YYYY-MM-DD HH:mm` 手拼实现。
 * ========================================================================== */
import { getLocale } from '@/core/i18n';

/** 毫秒时间戳 → 本地化时间字符串（默认跟随站点语言）。
 *  @param {number} ms      毫秒时间戳（来自后端的 created_at 等）
 *  @param {string} [locale] 覆盖语言（BCP-47，如 'en'）；省略则跟随站点当前语言
 *  @returns {string} 形如 2026/09/22 23:42（zh-CN）或 9/22/2026, 23:42（en）等
 */
export function fmtTime(ms, locale) {
  if (!ms) return '—';
  const d = new Date(ms);
  const loc = locale === undefined ? getLocale() : locale;
  try {
    return new Intl.DateTimeFormat(loc || undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  } catch (e) {
    /* 回落：极老环境不支持 Intl（与现代浏览器无关） */
    const p = (n) => String(n).padStart(2, '0');
    return (
      d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
    );
  }
}

/** 日期字符串 → 本地化日期（**不含时分**，用于「添加于」这类纯日期展示）。
 *  存储 / 种子里的 `added` 是 locale 无关的 'YYYY-MM-DD'，本地化只发生在展示层。
 *  @param {string} dateStr  'YYYY-MM-DD'（或可被 Date 解析的字符串）
 *  @param {string} [locale] 覆盖语言；省略则跟随站点当前语言
 *  @returns {string} 形如 2026/08/22（zh-CN）或 8/22/2026（en）；无法解析时原样返回
 */
export function fmtDate(dateStr, locale) {
  if (!dateStr) return '—';
  const s = String(dateStr);
  /* 纯日期串补 T00:00:00 按**本地**零点解析：直接 new Date('YYYY-MM-DD') 会按 UTC 解析，
   *在西半球时区会显示成前一天。 */
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T00:00:00' : s);
  if (isNaN(d.getTime())) return s;
  const loc = locale === undefined ? getLocale() : locale;
  try {
    return new Intl.DateTimeFormat(loc || undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch (e) {
    return s; /* 回落：不支持 Intl 时原样展示（ISO 本身可读） */
  }
}
