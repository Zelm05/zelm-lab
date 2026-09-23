/* ==========================================================================
 * 文案库（i18n）—— 全站唯一文案来源，基于 vue-i18n
 *
 * 设计目标：组件侧 API 保持不变（仍是 `useI18n(ns)` 返回 `{ t, isHtml }`），
 * 这样 src 下约 30 个组件无需改动；底层从「中文-only 字典」升级为
 * vue-i18n 的多语言实例，支持实时切换、localStorage 记忆、缺失回落中文。
 *
 * 语言资源：
 *   - 中文（zh-CN）：由 src/i18n/packs/<ns>.js 的 { zh: {...} } 合并而来（现状保留）。
 *   - 其余 4 语种：src/lang/<code>.json，结构为 { <ns>: { ...keys } }，
 *     与 zh-CN 命名空间一一对应，缺失 key 自动回落 zh-CN。
 *
 * 已保留语种（5 种）：简体中文、繁體中文、English、日本語。
 * 其余（한국어 / Español / Français / Deutsch）已按需求移除。
 *
 * 扩展：新增语种 = 在 src/lang/ 丢一份 <code>.json（含所需 key），
 *       并在下方 LANGS 里登记，业务代码零改动。
 * ========================================================================== */
import { createI18n } from 'vue-i18n';

/* 现有中文文案包（命名空间 = 文件名，导出 { zh: {...} }） */
import privacy from '@/i18n/packs/privacy';
import home from '@/i18n/packs/home';
import about from '@/i18n/packs/about';
import admin from '@/i18n/packs/admin';
import community from '@/i18n/packs/community';
import auth from '@/i18n/packs/auth';
import settings from '@/i18n/packs/settings';
import gate from '@/i18n/packs/gate';
import common from '@/i18n/packs/common';

/* 其余 4 语种（与 zh-CN 命名空间一一对应，缺失的回落 zh-CN） */
import zhTW from '@/lang/zh-TW.json';
import en from '@/lang/en.json';
import ja from '@/lang/ja.json';

/* 标准语种表（下拉用原生名展示，与切换无关） */
export const LANGS = [
  { code: 'zh-CN', name: '简体中文' },
  { code: 'zh-TW', name: '繁體中文' },
  { code: 'en', name: 'English' },
  { code: 'ja', name: '日本語' },
];
const LANG_CODES = LANGS.map((l) => l.code);

/** html[lang] 取值（便于 SEO / 浏览器翻译提示） */
const LANG_TAGS = {
  'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW', en: 'en', ja: 'ja',
};

/** 初始语言：localStorage → 浏览器语言 → 中文 */
function resolveInitial() {
  try {
    const saved = localStorage.getItem('zelm_lang');
    if (saved && LANG_CODES.includes(saved)) return saved;
  } catch (e) { /* 忽略 */ }
  const nav = (typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'zh-CN').toLowerCase();
  if (nav.startsWith('zh')) return (nav.includes('tw') || nav.includes('hk') || nav.includes('mo')) ? 'zh-TW' : 'zh-CN';
  const base = nav.split('-')[0];
  if (LANG_CODES.includes(base)) return base;
  return 'zh-CN';
}

/* 中文：由现有 packs 合并（命名空间 = useI18n 的参数） */
const zhCN = {
  home: home.zh,
  about: about.zh,
  privacy: privacy.zh,
  admin: admin.zh,
  community: community.zh,
  auth: auth.zh,
  settings: settings.zh,
  gate: gate.zh,
  common: common.zh,
};

const messages = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  en,
  ja,
};

/**
 * 消息编译：使用 vue-i18n 原生编译器（2026-09-22 混合方案）。
 * - UI 文案走原生 t() 插值（{name}/{n} 等占位由 vue-i18n 填充）；
 * - 数据内容仍走 locField()（library 种子），与编译无关；
 * - 唯一特殊字符冲突：community 的「回复 @{name}」已转义为「回复 @ {name}」避免被当链接消息。
 * 不再需要 rawMessageCompiler（原注释里 tpl() 仅 admin 面板用过，已改为原生插值）。
 */

export const i18n = createI18n({
  legacy: false,
  locale: resolveInitial(),
  fallbackLocale: 'zh-CN',
  messages,
  missingWarn: false,
  fallbackWarn: false,
});

export const DEFAULT_LANG = 'zh-CN';

/** 建站时调用（main.js）；实例已在模块加载时创建，这里仅同步 html lang */
export function installI18n() {
  applyHtmlLang();
}

function applyHtmlLang() {
  const code = getLocale();
  try { document.documentElement.lang = LANG_TAGS[code] || code; } catch (e) { /* 忽略 */ }
}

/** 早期（建站时）同步一次 html[lang] */
export function initI18nHtmlLang() { applyHtmlLang(); }

export function getLocale() {
  return i18n.global.locale.value;
}

/** 切换语言：实时生效（响应式）+ 写入 localStorage + 同步 html lang */
export function setLocale(code) {
  if (!LANG_CODES.includes(code)) return;
  i18n.global.locale.value = code;
  try { localStorage.setItem('zelm_lang', code); } catch (e) { /* 忽略 */ }
  applyHtmlLang();
}

/**
 * 组件侧取文案（保持原 API）。
 * @param {string} ns 命名空间（= src/i18n/packs/<ns>.js）
 */
export function useI18n(ns) {
  /** 取一条文案（原生 vue-i18n t()，支持命名插值 t('k',{name}) 与缺失回落键名）。
   *  命名空间 ns 自动拼到路径前，调用处仍写短 key。
   *  @param {string} key
   *  @param {...any} args */
  // 绑一下 this（t 需要正确的 composer 上下文），并用 rest 签名收敛 vue-i18n 的重载，
  // 否则 `...args` spread 会触发 TS2556（渐进 TS 类型修正，运行期行为不变）。
  /** @type {(key: string, ...args: any[]) => string} */
  const rawT = i18n.global.t.bind(i18n.global);
  const t = (key, ...args) => rawT(ns + '.' + key, ...args);

  /**
   * 取「数组型」文案（如 fortuneLevels / projectsDonateHints）。
   *
   * ⚠️ 必须用这个，不能用 `t()` —— vue-i18n 的 `t()` **只能返回字符串**：
   *    遇到数组型消息会当成「未命中」，直接**返回键路径字符串**。
   *    于是 `t('fortuneLevels')[随机下标]` 就变成了「随机单个字符」，
   *    而且因为返回的是非空字符串，调用处的 `|| FALLBACK` 也永远不会生效。
   *    （实测：`t('home.projectsDonateHints')` → `"home.projectsDonateHints"`，长度 24。）
   *
   * 这里直接读当前 locale 的**原始消息**；当前语种没有该数组时回落 zh-CN；
   * 都没有则返回空数组（调用处可自行给兜底）。
   */
  const tList = (key) => {
    const read = (locale) => {
      try {
        const msgs = i18n.global.getLocaleMessage(locale);
        const v = msgs && msgs[ns] && msgs[ns][key];
        return Array.isArray(v) ? v : null;
      } catch (e) {
        return null;
      }
    };
    return read(i18n.global.locale.value) || read('zh-CN') || [];
  };

  /* 文案里是否含 HTML 标记 —— 决定模板用 v-html 还是 v-text */
  const isHtml = (key) => {
    const v = i18n.global.t(ns + '.' + key);
    return typeof v === 'string' && v.includes('<');
  };
  return { t, tList, isHtml };
}
