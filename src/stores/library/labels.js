/* ==========================================================================
 * src/stores/library/labels.js —— 条目字段的「按语言取值」
 *
 * 原 stores/library.js 的 locField / TAG_MAP / tagLabel / locTags /
 * itemName / itemTitle / itemDesc / itemFull / itemTags 段落，
 * 自原文件逐行搬来（用 sed 按行区间抽取），未做任何改动。
 * ========================================================================== */
import { i18n } from '@/i18n';
import { t } from './i18n';

/*
 * 数据字段支持**按语言分桶**（{ 'zh-CN', 'zh-TW', en, ja }）或纯字符串两种形态：
 *   - 种子数据（QUICK_SEED / DEFAULT_RESOURCES）带四语言桶；
 *   - 用户自建条目 / 老版本 localStorage 数据是纯中文串，回落 zh-CN。
 * 读取一律走 locField：优先当前 locale，缺失回落 zh-CN（2026-09-22 起）。
 */
function locField(v) {
  if (typeof v === 'string') return v;
  if (!v) return '';
  const loc = i18n.global.locale.value;
  return v[loc] || v['zh-CN'] || v.zh || Object.values(v)[0] || '';
}
/* P1 修复（2026-09-23）：资源条目的 tags 在英/日界面下漏中文。
 *
 * 原实现 `if (Array.isArray(v)) return v;` —— 纯数组原样返回，而种子全是
 * `tags: ['代理','VPN','开源']` 这种纯中文数组，于是切到 en/ja 仍显示中文。
 * （分类没有这个问题：category 走 RES_CAT_MAP → i18n key，机制见下方。）
 *
 * 修法沿用**与 RES_CAT_MAP 完全相同的机制**：中文标签 → i18n key → t()。
 *   为什么不用「把种子的 tags 改成四语言桶」：
 *   ① 桶方案要改 27 条种子 + 4 份数组（约 270 个标签串），而映射表只需 27 个 key，
 *      且 IDE / 开源 这类标签在多条条目里复用，映射表天然去重；
 *   ② 更关键：`ensureDefaultResources()` 只同步 category/title/desc/icon，**不含 tags**
 *      —— 桶方案若不改这个函数，老用户的 localStorage 里仍是旧的中文数组，
 *      会出现「新用户正常、老用户照旧漏中文」的静默半修复。映射在渲染期发生，
 *      存储里存什么无所谓，因此**不需要任何数据迁移**；
 *   ③ 语言中立的标签（IDE / Python / SQL / VPN …）与用户自建标签不在表内 → 原样返回，
 *      行为与今天完全一致。
 *
 * 若将来仍想改成桶形态，本函数已同时支持：数组 → 逐项映射；对象 → 先取当前 locale
 * 的数组再逐项映射。两种形态可共存。 */
const TAG_MAP = {
  '代理': 'tagProxy',
  '优化': 'tagOptimize',
  '切换工具': 'tagSwitcher',
  '前端': 'tagFrontend',
  '剪辑': 'tagEditing',
  '平台': 'tagPlatform',
  '建模': 'tagModeling',
  '开发': 'tagDev',
  '开源': 'tagOpenSource',
  '录屏': 'tagScreenRec',
  '播放器': 'tagPlayer',
  '数值计算': 'tagNumeric',
  '数学建模': 'tagMathModeling',
  '数据分析': 'tagDataAnalysis',
  '数据库': 'tagDatabase',
  '框架': 'tagFramework',
  '游戏': 'tagGame',
  '独立游戏': 'tagIndieGame',
  '直播': 'tagLive',
  '科研绘图': 'tagSciPlot',
  '笔记': 'tagNotes',
  '统计': 'tagStatistics',
  '编程': 'tagProgramming',
  '编辑器': 'tagEditor',
  '考试': 'tagExam',
  '调色': 'tagColorGrading',
  '运行时': 'tagRuntime',
};

/** 单个标签的显示名（不在表内的原样返回，例如 IDE / Python / 用户自建标签） */
export function tagLabel(tag) {
  const key = TAG_MAP[tag];
  return key ? t(key) : tag;
}

function locTags(v) {
  const mapAll = (arr) => (Array.isArray(arr) ? arr.map(tagLabel) : []);
  if (Array.isArray(v)) return mapAll(v);
  if (!v) return [];
  const loc = i18n.global.locale.value;
  return mapAll(v[loc] || v['zh-CN'] || v.zh);
}
export function itemName(item) { return locField(item && item.name); }
export function itemTitle(item) { return locField(item && item.title); }
export function itemDesc(item) { return locField(item && item.desc); }
export function itemFull(item) { return locField(item && item.full); }
export function itemTags(item) { return locTags(item && item.tags); }
