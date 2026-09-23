<script setup>
/* ==========================================================================
 * Resources.vue —— 资源下载区块
 *
 * 原状：src/modules/pages/home.js 里约 370 行（renderFilters / renderResources /
 *   renderResPagination / createCard + 一大堆按钮 addEventListener）。
 * 现在：数据在 stores/library.js，这里只保留「分类 / 关键词 / 页码 / 视口宽度」
 *   这几项 UI 状态，卡片与分页交给模板。
 *
 * 原样保留的行为：
 *   · 每页 4 条，手机端（≤640px）8 条；视口变化时重置回第 1 页（300ms 防抖）
 *   · 分类严格相等 + 标题/简介/标签模糊匹配；标题按 zh-CN 排序
 *   · 空结果显示空状态并隐藏翻页条；**只有 1 页时隐藏翻页条**（快捷网页相反）
 *   · 页码跳转按「过滤后」的条目数算总页数（快捷网页那边是按全部条目，本就不同）
 * ========================================================================== */
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from '@/core/i18n';
import { useLibraryStore, resCatLabel, itemCatLabel, itemTitle, itemDesc, itemFull, itemTags } from '@/stores/library';
import { zelmConfirm } from '@/modules/confirm';
import { useSwipePagination } from '@/composables/useSwipePagination';

const { t } = useI18n('home');
const lib = useLibraryStore();

/* ---------------- 筛选 / 分页状态 ---------------- */
const category = ref('全部');
const keyword = ref('');
const page = ref(1);
/* 视口宽度决定每页条数；原站监听 resize 并做 300ms 防抖后回到第 1 页 */
const vw = ref(window.innerWidth);
const pageSize = computed(() => (vw.value <= 640 ? 8 : 4));

const cats = computed(() => lib.resFilterCats());
const list = computed(() => lib.filterRes(category.value, keyword.value));
const totalPages = computed(() => Math.max(1, Math.ceil(list.value.length / pageSize.value)));
const curPage = computed(() => Math.min(Math.max(page.value, 1), totalPages.value));
const pageList = computed(() => {
  const start = (curPage.value - 1) * pageSize.value;
  return list.value.slice(start, start + pageSize.value);
});
const pageNums = computed(() => {
  const c = curPage.value;
  const out = [];
  if (c > 1) out.push({ n: c - 1, active: false });
  out.push({ n: c, active: true });
  if (c < totalPages.value) out.push({ n: c + 1, active: false });
  return out;
});
const jumpPlaceholder = computed(() => '1-' + totalPages.value);

function pickCat(c) { category.value = c; page.value = 1; }
function onSearch() { page.value = 1; }

/* 跳转页码：按过滤后的条目数算（与原站一致） */
const jumpVal = ref('');
function onJump() {
  const val = parseInt(jumpVal.value, 10);
  if (val >= 1 && val <= totalPages.value) {
    page.value = val;
    jumpVal.value = '';
  }
}

let rzTimer = null;
function onResize() {
  if (rzTimer) clearTimeout(rzTimer);
  rzTimer = setTimeout(() => {
    vw.value = window.innerWidth;
    page.value = 1;
  }, 300);
}
onMounted(() => window.addEventListener('resize', onResize));
onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  if (rzTimer) clearTimeout(rzTimer);
});

/* ---------------- 详情弹窗 ---------------- */
const detail = ref(null);
const detailMeta = computed(() => {
  const item = detail.value;
  if (!item) return [];
  const meta = [];
  if (item.added) meta.push(`${t('addedLabel')} ${item.added}`);
  if (item.size) meta.push(`${t('sizeLabel')} ${item.size}`);
  return meta;
});
const detailFullText = computed(() => (detail.value ? itemFull(detail.value) : ''));
const detailTags = computed(() => (detail.value ? itemTags(detail.value) : []));
function openDetail(item) { detail.value = item; }
function onCardKey(e, item) {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(item); }
}

/* ---------------- 删除 ---------------- */
async function onDelete(item) {
  if (!(await zelmConfirm(t('delConfirm')))) return;
  lib.resRemove(item.id);
}

/* ---------------- 添加资源 ---------------- */
const addOpen = ref(false);
const blank = () => ({ name: '', url: '', icon: '', cat: '', tags: '', short: '', full: '', size: '' });
const f = ref(blank());
function openAdd() { f.value = blank(); addOpen.value = true; }
function onAdd() {
  const title = f.value.name.trim();
  let url = f.value.url.trim();
  if (!title || !url) return;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const tags = f.value.tags ? f.value.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : [];
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const added = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  lib.resAdd({
    id: 'r' + Date.now() + Math.floor(Math.random() * 1000),
    title,
    /* 原站新条目把 desc / full 写成 { zh, en }（en 与 zh 同值）。
     * 全站只有中文后这里直接存字符串 —— stores/library.js 的 itemDesc/itemFull
     * 两种形态都能读，老数据与旧导出文件不受影响。 */
    desc: f.value.short.trim(),
    full: f.value.full.trim(),
    url,
    category: f.value.cat.trim() || '其他',
    icon: f.value.icon.trim() || '📦',
    tags,
    added,
    size: f.value.size.trim() || '—',
  });
  addOpen.value = false;
}

/* ---------------- 手机端左右滑动翻页 ---------------- */
const gridEl = ref(null);
useSwipePagination(gridEl, {
  next: () => { if (curPage.value < totalPages.value) page.value = curPage.value + 1; },
  prev: () => { if (curPage.value > 1) page.value = curPage.value - 1; },
});
</script>

<template>
  <section id="resources" class="glass section-block">
    <div class="section-head">
      <h2>{{ t('navResources') }}</h2>
      <div class="section-actions">
        <el-button id="addResBtn" size="small" @click="openAdd">＋ <span>{{ t('addResource') }}</span></el-button>
      </div>
    </div>
    <div class="controls glass-inner">
      <div class="search-wrap">
        <el-input
id="searchInput"
          v-model="keyword"
          type="text"
          :placeholder="t('searchPlaceholder')"
          :aria-label="t('searchAria')"
          autocomplete="off"
          @input="onSearch" />
        <span class="search-icon">⌕</span>
      </div>
      <div id="categoryFilters" class="filters">
        <button
v-for="c in cats" :key="c" type="button"
          class="filter-btn"
          :class="{ active: category === c }"
          :data-category="c"
          :title="c === '全部' ? t('all') : resCatLabel(c)"
          @click="pickCat(c)">{{ c === '全部' ? t('all') : resCatLabel(c) }}</button>
      </div>
    </div>
    <div id="resourceGrid" ref="gridEl" class="resource-grid">
      <article
        v-for="item in pageList"
        :key="item.id"
        class="resource-card"
        tabindex="0"
        role="button"
        @click="openDetail(item)"
        @keydown="onCardKey($event, item)"
      >
        <el-button size="small" class="item-del" circle type="danger" :title="t('delConfirm')" @click.stop="onDelete(item)">✕</el-button>
        <div class="card-top">
          <div class="card-icon" v-text="item.icon || '📦'"></div>
          <span class="card-category">{{ itemCatLabel(item) }}</span>
        </div>
        <h3>{{ itemTitle(item) }}</h3>
        <p>{{ itemDesc(item) }}</p>
        <div class="card-tags">
          <span v-for="(tg, i) in itemTags(item)" :key="i" class="tag">{{ tg }}</span>
        </div>
        <el-button size="small" type="primary">{{ t('visit') }} <span>→</span></el-button>
      </article>
    </div>
    <section id="emptyState" class="empty-state" :hidden="list.length !== 0">
      <div class="empty-icon">∅</div>
      <p>{{ t('emptyText') }}</p>
    </section>
    <div id="resPagination" class="quick-pagination" :hidden="list.length === 0 || totalPages <= 1">
      <button id="resPrev" type="button" class="page-btn" :disabled="curPage <= 1" @click="page = curPage - 1">‹</button>
      <span id="resPageNumbers" class="page-numbers">
        <button
v-for="p in pageNums" :key="p.n" type="button"
          class="page-num"
          :class="{ active: p.active }"
          :data-page="p.n"
          @click="page = p.n">{{ p.n }}</button>
      </span>
      <button id="resNext" type="button" class="page-btn" :disabled="curPage>= totalPages" @click="page = curPage + 1">›</button>
      <span class="page-jump">
        <input
id="resJumpInput"
          v-model="jumpVal"
          type="number"
          min="1"
          :max="totalPages"
          :placeholder="jumpPlaceholder"
          :aria-label="t('resJumpAria')"
          @keydown.enter.prevent="onJump" />
        <button id="resJumpBtn" type="button" class="page-jump-btn" @click="onJump">{{ t('jumpBtn') }}</button>
      </span>
    </div>
  </section>

  <!--
    两个弹窗都 Teleport 到 #overlayRoot（#viewRoot 内的静态弹窗宿主），
    脱离 <main class="container"> 的
    transform 包含块（animation: mainSlideUp … both 的终态）。
    不这么做的话弹窗会按 container 的 1200×2702 居中，跑到视口外。
  -->
  <Teleport to="#overlayRoot">
    <!-- 资源详情弹窗 -->
    <div id="detailOverlay" class="modal-overlay" :hidden="!detail" @click.self="detail = null">
      <div id="detailModal" class="modal detail-modal" role="dialog" aria-label="资源详情">
        <el-button id="detailClose" size="small" circle :aria-label="t('detailClose')" @click="detail = null">✕</el-button>
        <div class="detail-top">
          <div id="detailIcon" class="detail-icon">{{ detail ? (detail.icon || '📦') : '' }}</div>
          <span id="detailCat" class="detail-category">{{ detail ? itemCatLabel(detail) : '' }}</span>
        </div>
        <h2 id="detailTitle">{{ detail ? itemTitle(detail) : t('detailTitle') }}</h2>
        <p id="detailDesc" class="detail-desc">{{ detail ? itemDesc(detail) : '' }}</p>
        <p id="detailFull" class="detail-full" :hidden="!detailFullText">{{ detailFullText }}</p>
        <div id="detailMeta" class="detail-meta" :hidden="detailMeta.length === 0">
          <span v-for="(m, i) in detailMeta" :key="i">{{ m }}</span>
        </div>
        <div id="detailTags" class="detail-tags">
          <span v-for="(tg, i) in detailTags" :key="i" class="tag">{{ tg }}</span>
        </div>
        <a
          id="detailVisit"
          class="detail-visit"
          target="_blank"
          rel="noopener noreferrer"
          :href="(detail && detail.url) || '#'"
        >{{ t('detailVisit') }}</a>
      </div>
    </div>

    <!-- 添加资源弹窗 -->
    <div id="resModalOverlay" class="modal-overlay" :hidden="!addOpen" @click.self="addOpen = false">
      <div id="resModal" class="modal add-modal" role="dialog" aria-label="添加资源">
        <el-button id="resModalClose" size="small" circle @click="addOpen = false">✕</el-button>
        <h2>{{ t('addResTitle') }}</h2>
        <form id="resForm" class="add-form" @submit.prevent="onAdd">
          <label class="add-field">
            <span>{{ t('resName') }}</span>
            <el-input id="resName" v-model="f.name" type="text" maxlength="40" :placeholder="t('resNamePh')" required />
          </label>
          <label class="add-field">
            <span>{{ t('resUrl') }}</span>
            <el-input id="resUrl" v-model="f.url" type="url" placeholder="https://..." required />
          </label>
          <label class="add-field">
            <span>{{ t('resIcon') }}</span>
            <el-input id="resIcon" v-model="f.icon" type="text" maxlength="2" placeholder="📦" />
          </label>
          <label class="add-field">
            <span>{{ t('resCat') }}</span>
            <el-input id="resCat" v-model="f.cat" type="text" maxlength="10" :placeholder="t('resCatPh')" />
          </label>
          <label class="add-field">
            <span>{{ t('resTags') }}</span>
            <el-input id="resTags" v-model="f.tags" type="text" :placeholder="t('resTagsPh')" />
          </label>
          <label class="add-field">
            <span>{{ t('resShort') }}</span>
            <el-input id="resShort" v-model="f.short" type="text" maxlength="80" :placeholder="t('resShortPh')" />
          </label>
          <label class="add-field">
            <span>{{ t('resFull') }}</span>
            <el-input id="resFull" v-model="f.full" type="textarea" rows="3" :placeholder="t('resFullPh')" />
          </label>
          <label class="add-field">
            <span>{{ t('resSize') }}</span>
            <el-input id="resSize" v-model="f.size" type="text" maxlength="20" :placeholder="t('resSizePh')" />
          </label>
          <p id="resError" class="add-error" hidden></p>
          <div class="modal-actions">
            <el-button id="resCancel" size="small" @click="addOpen = false">{{ t('cancelBtn') }}</el-button>
            <el-button size="small" type="submit">{{ t('saveBtn') }}</el-button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
