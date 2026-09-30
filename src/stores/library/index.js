/* ==========================================================================
 * src/stores/library/index.js —— 快捷网页 + 资源下载（Pinia，组合根）
 *
 * 原状：src/modules/pages/home.js 里两套几乎同构的「种子 + localStorage 持久化
 *   + 关键词过滤 + 分类过滤 + 分页」逻辑，各占约 300 行；渲染全部靠 innerHTML，
 *   再给每张卡片、每个页码按钮单独 addEventListener。
 * 现在：数据与持久化收在这里，两个区块组件（QuickLinks.vue / Resources.vue）
 *   只持有「当前分类 / 关键词 / 页码」这点 UI 状态，列表交给模板 v-for。
 *
 * P1-3 拆分：这个文件原本是 390 行的单文件（其中约 70 行是种子数据），
 * 现按领域拆成同目录下 4 个模块，本文件只负责组装 + 对外转出：
 *   i18n.js       领域内共享的取词函数 t（原模块顶层的 useI18n('home')）
 *   labels.js     条目字段的按语言取值（locField / itemName / itemTags / …）
 *   quick.js      快捷网页：QUICK_SEED + 持久化 + 分类标签
 *   resources.js  资源下载：DEFAULT_RESOURCES + 持久化 + 分类标签
 *
 * ⚠️ 对外导出与拆分前**逐个同名**（共 16 个），3 个消费组件
 * （QuickLinks.vue / Resources.vue / SettingsData.vue）与 2 个测试文件
 * （library-title / library.locField）无需任何改动。
 * store 实例的返回键（quick / resources / 6 个 action / 4 个筛选）同样不变。
 *
 * 存储键与数据结构**完全沿用原站**（zelm_quicklinks / zelm_resources）：
 * 老用户自己添加的条目、置顶状态都不会丢，导出的配置也能被原站版本读回。
 * ========================================================================== */
import { defineStore } from 'pinia';
import { ref } from 'vue';

import { LS_QUICK, loadQuick, saveQuick, ensureDefaultQuickLinks, quickCatLabel, qGroups } from './quick';
import { loadResources, saveResources, ensureDefaultResources, itemCats, resCatLabel } from './resources';
import { itemName, itemTitle, itemDesc, itemTags } from './labels';

/* ---- 对外转出：保持拆分前的导出名逐个不变（消费组件与测试都按名引用） ---- */
export { QUICK_SEED, LS_QUICK, quickCatLabel, qGroups } from './quick';
export { DEFAULT_RESOURCES, LS_RES, itemCats, resCatLabel, itemCatLabel } from './resources';
export { tagLabel, itemName, itemTitle, itemDesc, itemFull, itemTags } from './labels';

export const useLibraryStore = defineStore('library', () => {
  const quick = ref(loadQuick());
  if (ensureDefaultQuickLinks(quick.value)) saveQuick(quick.value);

  const resources = ref(loadResources());
  if (ensureDefaultResources(resources.value)) saveResources(resources.value);

  /* ---------------- 快捷网页 ---------------- */
  function quickTogglePin(id) {
    const q = quick.value.find((x) => x.id === id);
    if (!q) return;
    q.pinned = !q.pinned;
    saveQuick(quick.value);
  }
  function quickRemove(id) {
    quick.value = quick.value.filter((x) => x.id !== id);
    saveQuick(quick.value);
  }
  function quickAdd(item) {
    quick.value.push(item);
    saveQuick(quick.value);
  }
  /** 恢复默认列表：清掉本地记录后按种子重算（原站 resetQuickBtn） */
  function quickReset() {
    try { localStorage.removeItem(LS_QUICK); } catch (e) { /* 忽略 */ }
    quick.value = loadQuick();
  }

  /* ---------------- 资源下载 ---------------- */
  function resRemove(id) {
    resources.value = resources.value.filter((x) => x.id !== id);
    saveResources(resources.value);
  }
  function resAdd(item) {
    resources.value.push(item);
    saveResources(resources.value);
  }

  /* ---------------- 过滤 / 排序（原站口径） ---------------- */
  function filterQuick(group, keyword) {
    const kw = (keyword || '').trim().toLowerCase();
    const list = quick.value.filter((q) => {
      if (group !== '全部' && !qGroups(q).includes(group)) return false;
      if (!kw) return true;
      const hay = (itemName(q) + ' ' + (q.name || '') + ' ' + itemDesc(q) + ' ' + (typeof q.group === 'string' ? q.group : (q.group || []).join(' ')) + ' ' + (q.url || '')).toLowerCase();
      return hay.indexOf(kw) >= 0;
    });
    // 置顶优先，然后按名称拼音 A-Z
    list.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return itemName(a).localeCompare(itemName(b), 'zh-CN');
    });
    return list;
  }

  function filterRes(category, keyword) {
    const term = (keyword || '').toLowerCase().trim();
    const out = resources.value.filter((item) => {
      const matchCat = category === '全部' || itemCats(item).includes(category);
      const title = (itemTitle(item) + ' ' + (item.title || '')).toLowerCase();
      const desc = itemDesc(item).toLowerCase();
      /* 搜索匹配「翻译后标签 ∪ 原始标签」（2026-09-23）。
       * 背景：tags 本地化后，非中文界面下搜中文原标签会不再命中 —— 实测 en/ja 界面搜「代理」
       *   由 1 命中变 0 命中；而修复前是命中的（当时 itemTags 直接返回中文数组）。
       * 并集是「旧行为 ∪ 新行为」的超集，两个方向都不丢；title / desc 维持本地化后匹配不变。 */
      const rawTags = Array.isArray(item.tags) ? item.tags : [];
      const tags = [...itemTags(item), ...rawTags].map((x) => String(x).toLowerCase());
      const matchSearch = !term || title.includes(term) || desc.includes(term) || tags.some((x) => x.includes(term));
      return matchCat && matchSearch;
    });
    out.sort((a, b) => itemTitle(a).localeCompare(itemTitle(b), 'zh-CN'));
    return out;
  }

  /** 快捷网页筛选条：全部 + 出现过的分类，按显示名排序 */
  function quickFilterGroups() {
    const set = new Set();
    quick.value.forEach((q) => qGroups(q).forEach((g) => set.add(g)));
    return ['全部', ...Array.from(set).sort((a, b) => quickCatLabel(a).localeCompare(quickCatLabel(b), 'zh-CN'))];
  }
  /** 资源分类筛选条 */
  function resFilterCats() {
    return ['全部', ...Array.from(new Set(resources.value.flatMap((r) => itemCats(r))))
      .sort((a, b) => resCatLabel(a).localeCompare(resCatLabel(b), 'zh-CN'))];
  }

  return {
    quick, resources,
    quickTogglePin, quickRemove, quickAdd, quickReset,
    resRemove, resAdd,
    filterQuick, filterRes, quickFilterGroups, resFilterCats,
  };
});
