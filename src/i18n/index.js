/* ==========================================================================
 * 文案库入口 —— 透传 @/core/i18n 的 API
 *
 * 文案包放在 src/i18n/packs/<ns>.js，命名空间就是 useI18n('ns') 的参数。
 * 实际消息在 @/core/i18n 里由「packs(中文源) + src/lang/<code>.json(其余语种)」
 * 合并构建，本文件只负责把 API 透传出去，避免散落多处重复导出。
 * ========================================================================== */
export {
  useI18n,
  setLocale,
  getLocale,
  initI18nHtmlLang,
  installI18n,
  LANGS,
  DEFAULT_LANG,
  i18n,
} from '@/core/i18n';
