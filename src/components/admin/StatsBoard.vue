<script setup>
/* ==========================================================================
 * StatsChart.vue —— 管理台数据看板（ECharts）
 *
 * 接入原则（与 main.js 里的约定一致）：
 *   1. **不进首屏**：echarts 用 `await import('echarts/index.common')` 动态加载，
 *      只有本组件真正挂载时才会去下载那个 chunk；
 *   2. **不注册全局**：不需要 app.use()，避免全量 940KB 那种首屏回退；
 *   3. 主题跟随站点：配色直接读 CSS 变量（--accent / --text / --muted …），
 *      切换深浅主题时图表一起变，不用维护两套配置。
 *
 * 生命周期：init → setOption；主题或数据变化 → 重新 setOption；
 * 卸载 → dispose + 断开 ResizeObserver + 取消动画帧（漏掉任何一个都会泄漏）。
 * ========================================================================== */
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { useAdminStore } from '@/stores/admin';
import { useSettingsStore } from '@/stores/settings';
import { useI18n, i18n } from '@/core/i18n';

const a = useAdminStore();
const st = useSettingsStore();
const { t } = useI18n('admin');

/* 图表下方那张明细表用 Element Plus 的 el-table / el-tag。
 * 这两个组件**不需要 import**：vite.config.js 里的 Components({ ElementPlusResolver() })
 * 会在编译期自动补上 `import { ElTable } from 'element-plus'` 以及对应的组件 CSS。
 * —— 只打包用到的这两个组件，不会把整个 Element Plus 拉进来。 */
const rows = computed(() => {
  const s = a.stats;
  /* 文案走 i18n（之前硬编码中文，切语言时不跟着变） */
  return [
    { label: t('metricUsers'), value: s.total || 0, hint: t('metricUsersHint'), type: 'primary' },
    { label: t('metricNormal'), value: Math.max(0, a.statUsers), hint: t('metricNormalHint'), type: 'success' },
    { label: t('metricAdmins'), value: s.admins || 0, hint: t('metricAdminsHint'), type: 'warning' },
    { label: t('metricSuspended'), value: s.suspended || 0, hint: t('metricSuspendedHint'), type: 'danger' },
    { label: t('metricOnline'), value: s.online || 0, hint: t('metricOnlineHint'), type: 'success' },
    { label: t('metricPending'), value: s.pending || 0, hint: t('metricPendingHint'), type: s.pending ? 'warning' : 'info' },
  ];
});

const pieEl = ref(null);
const barEl = ref(null);
const loading = ref(true);
const failed = ref('');

let echarts = null;          // 动态加载进来的模块
let pieInst = null;
let barInst = null;
let ro = null;
let rafId = 0;

/* 从 CSS 变量取色 —— 这样图表配色永远和站点一致，不用硬编码 */
function palette() {
  const cs = getComputedStyle(document.documentElement);
  const g = (n, fb) => (cs.getPropertyValue(n) || fb).trim() || fb;
  return {
    accent: g('--accent', '#4ff0d0'),
    /* ⚠️ 不要用 --accent-2 当分类色：它是 --accent 的同色系浅色（专给渐变用的），
       实测 7 个配色里有 6 个（morandi/ocean/violet/sakura/aurora/sunset）两色太接近，
       饼图两个扇区几乎一个色。这里改用固定的高区分度对比色，任何主题下都分得清。 */
    accent2: '#ffc078',
    accent3: '#adb5bd',
    text: g('--text', '#e8fbf7'),
    muted: g('--muted', '#9db8b2'),
    border: g('--border', 'rgba(79,240,208,.18)'),
  };
}

function baseOption(c) {
  /* tooltip 背景必须跟随主题 —— 之前硬编码深色 'rgba(10,28,26,.92)'，
     浅色主题下变成「深底 + 深字」，完全看不清。 */
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  return {
    textStyle: { color: c.muted, fontFamily: 'inherit' },
    tooltip: {
      backgroundColor: isLight ? 'rgba(255, 255, 255, 0.97)' : 'rgba(10, 28, 26, 0.94)',
      borderColor: isLight ? 'rgba(45, 122, 90, 0.35)' : c.border,
      textStyle: { color: isLight ? '#143325' : '#e9edf6' },
      extraCssText: isLight ? 'box-shadow: 0 6px 20px rgba(30,70,50,.18);' : 'box-shadow: 0 6px 20px rgba(0,0,0,.45);',
    },
  };
}

function render() {
  if (!echarts || !pieInst || !barInst) return;
  const c = palette();
  const s = a.stats;

  const base = baseOption(c);

  pieInst.setOption({
    ...base,
    tooltip: { ...base.tooltip, trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: {
      bottom: 0,
      textStyle: { color: c.muted, fontSize: 11 },
      itemWidth: 10, itemHeight: 10,
    },
    series: [{
      type: 'pie',
      /* 环再收窄一点、中心下移，给四周的 label 留出空间
         （之前 radius 到 70% + center 44% 时，左上角的「管理员」label 会被容器边缘裁掉） */
      radius: ['42%', '62%'],
      center: ['50%', '46%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: 'transparent', borderWidth: 2 },
      label: {
        color: c.muted,
        fontSize: 11,
        formatter: '{b}\n{c}',
        /* 不截断、不换行溢出 —— 让 ECharts 自己找位置 */
        overflow: 'none',
        lineHeight: 14,
      },
      labelLine: { lineStyle: { color: c.border }, length: 8, length2: 8 },
      data: [
        { name: t('metricNormal'), value: Math.max(0, a.statUsers), itemStyle: { color: c.accent } },
        { name: t('metricAdmins'), value: s.admins || 0, itemStyle: { color: c.accent2 } },
        { name: t('metricSuspended'), value: s.suspended || 0, itemStyle: { color: c.accent3 } },
      ],
    }],
  }, true);

  barInst.setOption({
    ...base,
    tooltip: { ...base.tooltip, trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 8, right: 12, top: 16, bottom: 24, containLabel: true },
    xAxis: {
      type: 'category',
      data: [t('chartBarTotal'), t('chartBarOnline'), t('chartBarPending')],
      axisLine: { lineStyle: { color: c.border } },
      axisLabel: { color: c.muted, fontSize: 11 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: c.muted, fontSize: 11 },
      splitLine: { lineStyle: { color: c.border, type: 'dashed' } },
    },
    series: [{
      type: 'bar',
      barWidth: '46%',
      itemStyle: { borderRadius: [6, 6, 0, 0], color: c.accent },
      data: [s.total || 0, s.online || 0, s.pending || 0],
    }],
  }, true);
}

function resize() {
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    pieInst && pieInst.resize();
    barInst && barInst.resize();
  });
}

/* ⚠️ 这里不能只在 onMounted 里初始化一次。
 * 图表容器在 `v-else` 里，被 `a.statsReady` 守卫 —— 统计是**异步**加载的，
 * 首次挂载时 statsReady 还是 false，容器根本没渲染，`pieEl/barEl` 是 null。
 * 如果那时直接 return，等统计回来容器出现了，ECharts **永远不会再初始化**
 * （实测：容器 598×220 生成了，但里面是空的，一个 canvas 都没有）。
 * 所以做成「确保已初始化」的幂等函数：挂载时试一次，statsReady 变化时再试一次。 */
async function ensureInit() {
  if (failed.value) return;
  if (!echarts) {
    try {
      /* ⚠️ 用 `echarts/index.common`，**不要**用 `echarts` 或 `echarts/charts`。
       *
       * 三个入口的实际差别（实测 gzip）：
       *   `echarts`          = 整库（30+ 种图表全部注册）  → 371 KB
       *   `echarts/charts`   = 看起来能按需，其实**不能** ——
       *                        charts.js → lib/export/charts.js → lib/chart/*.js，
       *                        而 package.json 的 sideEffects 把 `lib/chart/*.js` 标成
       *                        有副作用，打包器必须全部保留 → 365 KB（几乎没省）
       *   `echarts/index.common` = 官方预构建的**常用子集**（line/bar/pie/scatter
       *                        + tooltip/legend/grid/title…），内部直接引各组件的
       *                        install 模块，不是 barrel → 只带这些
       *
       * 另外 `echarts/lib/**` 想深引也不行：exports 字段没放行 `./lib/*`。
       *
       * 本看板只用 pie + bar + tooltip + legend + grid，index.common 完全够。
       * 若将来只要最简（可再小一些），可换 `echarts/index.simple`，
       * 但它**不含 tooltip 和 legend**，图表配置要相应删掉这两块。 */
      echarts = await import('echarts/index.common');
    } catch (e) {
      failed.value = String(e && e.message ? e.message : e);
      loading.value = false;
      return;
    }
  }
  await nextTick();
  // 容器还没出现就先返回，等 statsReady 变化时会再次调用
  if (!pieEl.value || !barEl.value) return;

  if (!pieInst) {
    pieInst = echarts.init(pieEl.value, null, { renderer: 'canvas' });
    barInst = echarts.init(barEl.value, null, { renderer: 'canvas' });
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(resize);
      ro.observe(pieEl.value);
      ro.observe(barEl.value);
    }
    window.addEventListener('resize', resize);
  }
  render();
  loading.value = false;
}

onMounted(ensureInit);
/* 统计就绪（容器随之出现）→ 补一次初始化 */
watch(() => a.statsReady, (v) => { if (v) ensureInit(); });

/* 主题切换 / 数据更新 / 语言切换 → 重绘（已初始化才重绘）
   ⚠️ 语言也要监听：饼图 name、柱图 xAxis 文案都走 t()，不重绘的话切语言图表不跟着变 */
watch(
  () => [st.theme, i18n.global.locale.value, a.stats.total, a.stats.admins, a.stats.suspended, a.stats.online, a.stats.pending],
  () => { if (pieInst && barInst) render(); },
);

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  window.removeEventListener('resize', resize);
  if (ro) { ro.disconnect(); ro = null; }
  if (pieInst) { pieInst.dispose(); pieInst = null; }
  if (barInst) { barInst.dispose(); barInst = null; }
  echarts = null;
});
</script>

<template>
  <section class="stats-board">
    <div class="stats-board-head">
      <h3>{{ t('dashTitle') }}</h3>
      <span class="stats-board-hint">{{ t('dashHint') }}</span>
    </div>

    <div v-if="failed" class="stats-board-msg">
      {{ t('dashFail') }}{{ failed }}
    </div>
    <div v-else-if="!a.statsReady" class="stats-board-msg">
      {{ t('dashNotReady') }}
    </div>
    <div v-else class="stats-board-grid">
      <div class="stats-chart">
        <div class="stats-chart-title">{{ t('chartUsers') }}</div>
        <div ref="pieEl" class="stats-chart-canvas"></div>
      </div>
      <div class="stats-chart">
        <div class="stats-chart-title">{{ t('chartOverview') }}</div>
        <div ref="barEl" class="stats-chart-canvas"></div>
      </div>
      <div v-if="loading" class="stats-board-loading">{{ t('dashLoading') }}</div>
    </div>

    <!-- 明细表：原生 table 已换成组件库的 el-table + el-table-column + el-tag。
         注：el-table 单组件约 169 KB，但管理台 UsersPanel 已经在用，共用同一个
             element-plus 分包，所以这里换过去不增加体积。 -->
    <el-table v-if="a.statsReady" :data="rows" size="small" class="stats-table">
      <el-table-column prop="label" :label="t('thMetric')" min-width="100" />
      <el-table-column prop="value" :label="t('thValue')" width="70" align="right">
        <template #default="{ row }"><span class="num">{{ row.value }}</span></template>
      </el-table-column>
      <el-table-column :label="t('thNote')" min-width="130">
        <template #default="{ row }">
          <!-- 用户要求"UI 框去掉"：hint 列直接显示纯文字（不用 el-tag 外框） -->
          <span class="stats-hint">{{ row.hint }}</span>
        </template>
      </el-table-column>
    </el-table>
  </section>
</template>

<style scoped>
.stats-board {
  margin: 0 0 12px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
}
.stats-board-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.stats-board-head h3 { margin: 0; font-size: 0.95rem; color: var(--text); }
.stats-board-hint { font-size: 0.7rem; color: var(--muted); }
.stats-board-msg { font-size: 0.82rem; color: var(--muted); padding: 6px 0; }
.stats-board-loading {
  position: absolute; inset: 0;
  display: grid; place-items: center;
  font-size: 0.8rem; color: var(--muted);
}
.stats-board-grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 10px;
  min-height: 170px;
  margin-bottom: 10px;
}
.stats-chart-title { font-size: 0.75rem; color: var(--muted); margin-bottom: 2px; }
/* ECharts 必须有明确高度，否则画不出来（这里给固定高，ResizeObserver 只负责宽度） */
.stats-chart-canvas { width: 100%; height: 170px; }

/* 明细表：el-table（数值列右对齐 + 等宽数字）
   用户反馈"留白太多" → 收紧行高 / 内边距 / 字号 */
.stats-table .num { font-variant-numeric: tabular-nums; }
.stats-table :deep(.el-table) { font-size: 0.84rem; }
.stats-table :deep(.el-table .cell) { padding: 0 8px; line-height: 1.4; }
.stats-table :deep(.el-table td.el-table__cell),
.stats-table :deep(.el-table th.el-table__cell) { padding: 5px 0; }
.stats-table :deep(.el-table .el-table__row) { height: 34px; }
/* 说明列：纯文字（用户要求去掉 UI 框） */
.stats-hint { color: var(--muted, #9db8b2); font-size: 0.8rem; }
</style>
