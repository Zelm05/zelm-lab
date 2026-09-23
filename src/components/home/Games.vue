<script setup>
/* ==========================================================================
 * Games.vue —— 小游戏区块
 *
 * 原状：src/modules/pages/home.js 的 renderGames / updateGamesDrawer /
 *   renderGamePagination / openGame / closeGame（约 120 行外壳），游戏本体在
 *   同文件里内联了 750 行 canvas 代码。
 * 现在：外壳改成模板（列表 / 分页 / 弹窗），游戏本体原样切到
 *   src/modules/games/index.js，通过 mountGame() 挂载、返回的 destroy 关闭。
 *
 * 原样保留的行为：
 *   · 每页 2 个（≤640px），桌面端一次显示全部；只有 1 页时隐藏翻页条
 *   · 抽屉「展开全部 / 收起」：桌面端且游戏数超过一行（5 列）才出现 ——
 *     当前正好 5 款，所以按钮恒隐藏（原站如此）
 *   · 打开游戏时清空舞台与消息行、旧的一局先销毁
 * ========================================================================== */
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useI18n } from '@/core/i18n';
import { GAMES, GAME_NAME_KEYS, mountGame } from '@/modules/games';
import { useSwipePagination } from '@/composables/useSwipePagination';

const { t } = useI18n('home');

/* ---------------- 分页 ---------------- */
const vw = ref(window.innerWidth);
const pageSize = computed(() => (vw.value <= 640 ? 2 : 999));
const page = ref(1);
const totalPages = computed(() => Math.max(1, Math.ceil(GAMES.length / pageSize.value)));
const curPage = computed(() => Math.min(Math.max(page.value, 1), totalPages.value));
const pageList = computed(() => {
  const start = (curPage.value - 1) * pageSize.value;
  return GAMES.slice(start, start + pageSize.value);
});
const pageNums = computed(() => {
  const c = curPage.value;
  const out = [];
  if (c > 1) out.push({ n: c - 1, active: false });
  out.push({ n: c, active: true });
  if (c < totalPages.value) out.push({ n: c + 1, active: false });
  return out;
});

/* ---------------- 桌面端抽屉（超过一行才出现） ---------------- */
const DRAWER_COLS = 5;   // 桌面端 .game-grid 固定 5 列
const expanded = ref(false);
const drawerVisible = computed(() => vw.value > 768 && GAMES.length > DRAWER_COLS);
const gridCollapsed = computed(() => drawerVisible.value && !expanded.value);
const drawerLabel = computed(() => (expanded.value ? t('gamesCollapse') : t('gamesExpand')));
const drawerArrow = computed(() => (expanded.value ? '▲' : '▼'));

let rzTimer = null;
function onResize() {
  if (rzTimer) clearTimeout(rzTimer);
  rzTimer = setTimeout(() => { vw.value = window.innerWidth; page.value = 1; }, 300);
}
onMounted(() => window.addEventListener('resize', onResize));
onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  if (rzTimer) clearTimeout(rzTimer);
});

/* ---------------- 游戏弹窗 ---------------- */
const game = ref(null);
const stageEl = ref(null);
const msgEl = ref(null);
let destroy = null;

const gameTitle = computed(() => {
  const g = game.value;
  if (!g) return t('navGames');
  return g.icon + ' ' + t(GAME_NAME_KEYS[g.id] || g.name);
});
const nameOf = (g) => t(GAME_NAME_KEYS[g.id] || g.name);

async function openGame(g) {
  if (destroy) { destroy(); destroy = null; }   // 原站：开新局前先销毁旧的
  game.value = g;
  await nextTick();
  stageEl.value.innerHTML = '';
  msgEl.value.textContent = '';
  destroy = mountGame(g.id, stageEl.value, msgEl.value);
}
function closeGame() {
  game.value = null;
  if (destroy) { destroy(); destroy = null; }
  if (stageEl.value) stageEl.value.innerHTML = '';
}

/* ---------------- 手机端左右滑动翻页 ---------------- */
const gridEl = ref(null);
useSwipePagination(gridEl, {
  next: () => { if (curPage.value < totalPages.value) page.value = curPage.value + 1; },
  prev: () => { if (curPage.value > 1) page.value = curPage.value - 1; },
});
</script>

<template>
  <section id="games" class="glass section-block">
    <div class="section-head">
      <h2>{{ t('navGames') }}</h2>
    </div>
    <p class="section-sub">{{ t('gamesSub') }}</p>
    <div id="gameGrid" ref="gridEl" class="game-grid" :class="{ collapsed: gridCollapsed }">
      <div v-for="g in pageList" :key="g.id" class="game-card" :data-game-id="g.id">
        <div class="game-icon">{{ g.icon }}</div>
        <h3>{{ nameOf(g) }}</h3>
        <el-button size="small" type="primary" @click="openGame(g)">▶ {{ t('gameStart') }}</el-button>
      </div>
      <!-- 原站：列表为空时放一条「—」占位（当前 5 款游戏，不会走到） -->
      <p v-if="pageList.length === 0" class="block-empty">—</p>
    </div>
    <el-button
id="gamesDrawerBtn" size="small"
      :hidden="!drawerVisible"
      @click="expanded = !expanded">
      <span id="gamesDrawerLabel">{{ drawerLabel }}</span><span id="gamesDrawerArrow" class="games-drawer-arrow">{{ drawerArrow }}</span>
    </el-button>
    <div id="gamePagination" class="quick-pagination" :hidden="totalPages <= 1">
      <button id="gamePrev" type="button" class="page-btn" :disabled="curPage <= 1" @click="page = curPage - 1">‹</button>
      <span id="gamePageNumbers" class="page-numbers">
        <button
v-for="p in pageNums" :key="p.n" type="button"
          class="page-num"
          :class="{ active: p.active }"
          :data-page="p.n"
          @click="page = p.n">{{ p.n }}</button>
      </span>
      <button id="gameNext" type="button" class="page-btn" :disabled="curPage>= totalPages" @click="page = curPage + 1">›</button>
    </div>
  </section>

  <!--
    小游戏舞台弹窗 Teleport 到 #overlayRoot（#viewRoot 内的静态弹窗宿主），
    脱离 <main class="container"> 的
    transform 包含块（animation: mainSlideUp … both 的终态），
    否则弹窗会按 container 的高度居中、跑到视口外。
  -->
  <Teleport to="#overlayRoot">
    <div id="gameOverlay" class="modal-overlay" :hidden="!game" @click.self="closeGame">
      <div id="gameModal" class="modal game-modal" role="dialog" :aria-label="t('navGames')">
        <el-button id="gameClose" size="small" circle @click="closeGame">✕</el-button>
        <h2 id="gameTitle">{{ gameTitle }}</h2>
        <div id="gameStage" ref="stageEl" class="game-stage"></div>
        <div id="gameMsg" ref="msgEl" class="game-msg"></div>
      </div>
    </div>
  </Teleport>
</template>
