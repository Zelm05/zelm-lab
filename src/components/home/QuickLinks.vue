<script setup>
/* ==========================================================================
 * QuickLinks.vue —— 快捷网页区块
 *
 * 原状：src/modules/pages/home.js 里约 350 行——renderQuickFilters / renderQuick /
 *   renderQuickPagination 三个函数反复重建 DOM，每张卡片再用 innerHTML 拼串，
 *   然后给 .item-pin / .item-del 各挂一个监听器；详情弹窗用 textContent 逐字段回填。
 * 现在：数据在 stores/library.js，这里只剩「当前分类 / 关键词 / 页码」三个 UI 状态；
 *   卡片、筛选条、页码都是模板推导，改动数据即自动重渲染。
 *
 * 原样保留的行为：
 *   · 每页 8 条（原站 getQuickPageSize 手机/桌面两个分支同为 8）
 *   · 置顶优先 + 名称按 zh-CN 排序；卡片可 Enter / 空格打开详情
 *   · 列表非空时翻页条**始终显示**（资源区块是「只有 1 页时隐藏」，两者本就不同）
 *   · 每个分类各自记住页码（原站 quickPages）
 *   · 手机端左右滑动翻页，滑动后吞掉紧随的点击
 * 有意不同的一处（见文件末注）：筛选条/分类随数据自动更新。
 * ========================================================================== */
import { ref, computed } from 'vue';
import { useI18n } from '@/core/i18n';
import { useLibraryStore, qGroups, quickCatLabel, itemName, itemDesc } from '@/stores/library';
import { zelmConfirm } from '@/modules/confirm';
import { useSwipePagination } from '@/composables/useSwipePagination';

const { t } = useI18n('home');
const lib = useLibraryStore();

const PAGE_SIZE = 8;

/* ---------------- 筛选 / 分页状态 ---------------- */
const group = ref('全部');
const keyword = ref('');
/* 每个分类各记一份页码（原站 quickPages） */
const pages = ref({});

const groups = computed(() => lib.quickFilterGroups());
const list = computed(() => lib.filterQuick(group.value, keyword.value));
const totalPages = computed(() => Math.max(1, Math.ceil(list.value.length / PAGE_SIZE)));
const curPage = computed(() => {
  const p = pages.value[group.value] || 1;
  return Math.min(Math.max(p, 1), totalPages.value);
});
const pageList = computed(() => {
  const start = (curPage.value - 1) * PAGE_SIZE;
  return list.value.slice(start, start + PAGE_SIZE);
});
/* 只显示前一页、当前页、后一页（原站 renderQuickPagination） */
const pageNums = computed(() => {
  const c = curPage.value;
  const out = [];
  if (c > 1) out.push({ n: c - 1, active: false });
  out.push({ n: c, active: true });
  if (c < totalPages.value) out.push({ n: c + 1, active: false });
  return out;
});
const jumpPlaceholder = computed(() => '1-' + totalPages.value);

function setPage(p) { pages.value[group.value] = p; }
function pickGroup(g) { group.value = g; }
function onSearch() { setPage(1); }

/* 跳转页码：总页数按**全部条目**计算 —— 与原站一致（筛选/搜索状态下与可见页数
 * 不一致，这是原站原有口径，此处未擅自修正）。 */
const jumpVal = ref('');
function onJump() {
  const val = parseInt(jumpVal.value, 10);
  const total = Math.ceil(lib.quick.length / PAGE_SIZE);
  if (val >= 1 && val <= total) {
    setPage(val);
    jumpVal.value = '';
  }
}

/* ---------------- 图标渲染 ---------------- */
/* P1 修复（2026-09-23）：QUICK_SEED 的 icon 原本是**整段 `<svg …>` 字符串**，
 *   而这里用 `v-text` 渲染 → 卡片上直接显示 `<svg viewBox="0 0 24 24" …>` 源码
 *   （实测 12306、哔哩哔哩等 12 条）。
 *
 * 修法（选「结构化 path」而非 v-html）：种子里的 icon 改成 `{ d, fill, viewBox }`，
 *   渲染成真正的 `<svg><path :d/></svg>` —— 与 data/contacts.js 的既有做法一致。
 *   · 零注入面：只从对象里取 d / fill / viewBox 三个**属性值**，从不拼 HTML，
 *     也不需要 v-html（P2-1 那次刻意把 icon 从 v-html 改成 v-text 的防线不后退）。
 *   · 向后兼容：用户自建条目 / 老 localStorage 里 icon 仍是字符串（emoji）→ 走 v-text 分支。
 *   · 图标不随语言变（品牌图形），故不做任何 i18n 处理。 */
const SVG_ICON_VIEW_BOX = '0 0 24 24';
function isSvgIcon(ic) {
  return !!ic && typeof ic === 'object' && typeof ic.d === 'string' && ic.d.length > 0;
}
function iconViewBox(ic) {
  return (ic && ic.viewBox) || SVG_ICON_VIEW_BOX;
}
function iconFill(ic) {
  return (ic && ic.fill) || 'currentColor';
}

/* ---------------- 详情弹窗 ---------------- */
const detail = ref(null);
/* P1 修复（2026-09-23）：必须走 itemDesc（locale 感知），不能直接读 detail.value.desc。
 *   种子的 desc 是四语言桶 `{ 'zh-CN': …, 'zh-TW': …, en: …, ja: … }`，
 *   直接插值会把这个对象**原样渲染成 JSON 字符串**（实测详情弹窗显示
 *   `{"zh-CN": "中国铁路官方购票平台。", …}`）。卡片处用的就是 itemDesc(q)，这里对齐。 */
const detailDesc = computed(() => (detail.value ? itemDesc(detail.value) : ''));
function openDetail(q) { detail.value = q; }
function onCardKey(e, q) {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(q); }
}

/* ---------------- 删除 ---------------- */
async function onDelete(q) {
  if (!(await zelmConfirm(t('delConfirm')))) return;
  lib.quickRemove(q.id);
}

/* ---------------- 添加快捷网页 ---------------- */
const addOpen = ref(false);
const ADD_GROUPS = [
  { v: 'AI', k: 'qkAI' }, { v: '工具', k: 'qkTool' }, { v: '购物', k: 'qkShop' },
  { v: '社交', k: 'qkSocial' }, { v: '视频', k: 'qkVideo' }, { v: '搜索', k: 'qkSearch' },
  { v: '校园', k: 'qkCampus' }, { v: '学习', k: 'qkStudy' },
];
const blank = () => ({ name: '', url: '', icon: '', desc: '', group: 'AI' });
const f = ref(blank());
function openAdd() { f.value = blank(); addOpen.value = true; }
function onAdd() {
  const name = f.value.name.trim();
  let url = f.value.url.trim();
  if (!name || !url) return;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  lib.quickAdd({
    id: 'q' + Date.now() + Math.floor(Math.random() * 1000),
    name,
    url,
    icon: f.value.icon.trim() || '🌐',
    group: f.value.group,
    desc: f.value.desc.trim() || '',
  });
  addOpen.value = false;
}

/* ---------------- 手机端左右滑动翻页 ---------------- */
const gridEl = ref(null);
useSwipePagination(gridEl, {
  next: () => { if (curPage.value < totalPages.value) setPage(curPage.value + 1); },
  prev: () => { if (curPage.value > 1) setPage(curPage.value - 1); },
});
</script>

<template>
  <section id="quickLinks" class="glass section-block">
    <div class="section-head">
      <h2>{{ t('navQuick') }}</h2>
      <div class="section-actions">
        <el-button id="addQuickBtn" size="small" @click="openAdd">＋ <span>{{ t('addQuick') }}</span></el-button>
      </div>
    </div>
    <div class="controls glass-inner">
      <div class="search-wrap">
        <el-input
id="quickSearch"
          v-model="keyword"
          type="text"
          :placeholder="t('quickSearchPlaceholder')"
          :aria-label="t('quickSearchAria')"
          autocomplete="off"
          @input="onSearch" />
        <span class="search-icon">⌕</span>
      </div>
      <div id="quickFilters" class="filters">
        <button
v-for="g in groups" :key="g" type="button"
          class="filter-btn"
          :class="{ active: group === g }"
          :data-qg="g"
          :title="quickCatLabel(g)"
          @click="pickGroup(g)">{{ quickCatLabel(g) }}</button>
      </div>
    </div>
    <div id="quickGrid" ref="gridEl" class="quick-grid">
      <div
        v-for="q in pageList"
        :key="q.id"
        class="quick-card"
        tabindex="0"
        role="button"
        :title="itemName(q)"
        @click="openDetail(q)"
        @keydown="onCardKey($event, q)"
      >
        <div class="q-top">
          <span class="quick-icon">
            <svg
              v-if="isSvgIcon(q.icon)"
              :viewBox="iconViewBox(q.icon)"
              width="26"
              height="26"
              :fill="iconFill(q.icon)"
              aria-hidden="true"
            >
              <path :d="q.icon.d" />
            </svg>
            <template v-else>{{ q.icon || '🌐' }}</template>
          </span>
          <span class="q-cat">{{ quickCatLabel(qGroups(q)[0] || '') }}</span>
          <el-button
size="small" class="item-pin"
            :class="{ pinned: q.pinned }"
            type="button"
            :title="q.pinned ? t('unpinTitle') : t('pinTitle')"
            @click.stop="lib.quickTogglePin(q.id)">📌</el-button>
        </div>
        <span class="quick-name">{{ itemName(q) }}</span>
        <span class="quick-desc">{{ itemDesc(q) }}</span>
        <el-button size="small" class="item-del" circle type="danger" :title="t('delConfirm')" @click.stop="onDelete(q)">✕</el-button>
      </div>
    </div>
    <section id="quickEmpty" class="empty-state" :hidden="list.length !== 0">
      <div class="empty-icon">∅</div>
      <p>{{ t('quickEmptyText') }}</p>
    </section>
    <div id="quickPagination" class="quick-pagination" :hidden="list.length === 0">
      <button id="quickPrev" type="button" class="page-btn" :disabled="curPage <= 1" @click="setPage(curPage - 1)">‹</button>
      <span id="quickPageNumbers" class="page-numbers">
        <button
v-for="p in pageNums" :key="p.n" type="button"
          class="page-num"
          :class="{ active: p.active }"
          :data-page="p.n"
          @click="setPage(p.n)">{{ p.n }}</button>
      </span>
      <button id="quickNext" type="button" class="page-btn" :disabled="curPage>= totalPages" @click="setPage(curPage + 1)">›</button>
      <span class="page-jump">
        <input
id="quickJumpInput"
          v-model="jumpVal"
          type="number"
          min="1"
          :max="totalPages"
          :placeholder="jumpPlaceholder"
          :aria-label="t('quickJumpAria')"
          @keydown.enter.prevent="onJump" />
        <button id="quickJumpBtn" type="button" class="page-jump-btn" @click="onJump">{{ t('jumpBtn') }}</button>
      </span>
    </div>
  </section>

  <!--
    两个弹窗都 Teleport 到 #overlayRoot（#viewRoot 内的静态弹窗宿主），
    脱离 <main class="container"> 的
    transform 包含块：container 上挂着 animation: mainSlideUp … both，终态
    transform: translateY(0) 会让它成为后代 position:fixed 的包含块，弹窗会按
    container 的 1200×2702 去居中（跑到视口外，看起来"没弹出来"）。
    原站也是特意把弹窗写在 <main class="container"> 之外。
  -->
  <Teleport to="#overlayRoot">
    <!-- 快捷网页详情弹窗（风格对齐资源详情） -->
    <div id="quickDetailOverlay" class="modal-overlay" :hidden="!detail" @click.self="detail = null">
      <div id="quickDetailModal" class="modal detail-modal" role="dialog" :aria-label="t('quickDetailAria')">
        <el-button id="quickDetailClose" size="small" circle @click="detail = null">✕</el-button>
        <div class="modal-body">
        <div class="detail-top">
          <div id="qdIcon" class="detail-icon">
            <svg
              v-if="detail && isSvgIcon(detail.icon)"
              :viewBox="iconViewBox(detail.icon)"
              width="26"
              height="26"
              :fill="iconFill(detail.icon)"
              aria-hidden="true"
            >
              <path :d="detail.icon.d" />
            </svg>
            <template v-else-if="detail">{{ detail.icon || '🌐' }}</template>
          </div>
          <span id="qdCat" class="detail-category">{{ detail ? quickCatLabel(detail.group || '') : '' }}</span>
        </div>
        <h2 id="qdTitle">{{ detail ? itemName(detail) : '' }}</h2>
        <p id="qdDesc" class="detail-desc" :style="{ display: detailDesc ? '' : 'none' }">{{ detailDesc }}</p>
        <div id="qdMeta" class="detail-meta" :hidden="!detail || !detail.url">
          <span v-if="detail && detail.url">{{ detail.url }}</span>
        </div>
        <a
          id="qdVisit"
          class="detail-visit"
          target="_blank"
          rel="noopener noreferrer"
          :href="(detail && detail.url) || '#'"
        >{{ t('detailVisit') }}</a>
        </div>
      </div>
    </div>

    <!-- 添加快捷网页弹窗 -->
    <div id="quickModalOverlay" class="modal-overlay" :hidden="!addOpen" @click.self="addOpen = false">
      <div id="quickModal" class="modal add-modal" role="dialog" :aria-label="t('addQuickAria')">
        <el-button id="quickModalClose" size="small" circle @click="addOpen = false">✕</el-button>
        <h2>{{ t('addQuickTitle') }}</h2>
        <form id="quickForm" class="add-form" @submit.prevent="onAdd">
          <div class="modal-body">
          <label class="add-field">
            <span>{{ t('qkName') }}</span>
            <el-input id="qkName" v-model="f.name" type="text" maxlength="20" :placeholder="t('qkNamePh')" required />
          </label>
          <label class="add-field">
            <span>{{ t('qkUrl') }}</span>
            <el-input id="qkUrl" v-model="f.url" type="url" placeholder="https://..." required />
          </label>
          <label class="add-field">
            <span>{{ t('qkIcon') }}</span>
            <el-input id="qkIcon" v-model="f.icon" type="text" maxlength="2" placeholder="🌐" />
          </label>
          <label class="add-field">
            <span>{{ t('qkDesc') }}</span>
            <el-input id="qkDesc" v-model="f.desc" type="text" maxlength="80" :placeholder="t('qkDescPh')" />
          </label>
          <label class="add-field">
            <span>{{ t('qkGroup') }}</span>
            <el-select id="qkGroup" v-model="f.group" size="small">
              <el-option v-for="o in ADD_GROUPS" :key="o.v" :label="t(o.k)" :value="o.v" />
            </el-select>
          </label>
          </div>
          <p id="quickError" class="add-error" hidden></p>
          <div class="modal-actions">
            <el-button id="quickCancel" size="small" @click="addOpen = false">{{ t('cancelBtn') }}</el-button>
            <el-button size="small" type="submit">{{ t('saveBtn') }}</el-button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<!--
  与原站有意不同的一处：
  原站增删条目后只重渲染列表（renderQuick），不重渲染分类筛选条（renderQuickFilters），
  所以新加的分类要等下一次 applyLang / resize 才出现在筛选条里。这里筛选条由 computed
  派生，数据一变就同步——属于响应式重构的自然结果，视觉上只会更及时。
-->
