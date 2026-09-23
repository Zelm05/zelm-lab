<script setup>
/* ==========================================================================
 * UsersPanel.vue —— 统计卡 + 用户筛选 + 用户表（Element Plus 版）
 *
 * 迁移说明（原版 → 组件库）：
 *   手写 <table>/<tr>   → el-table + el-table-column（自带空态、固定列、斑马纹）
 *   .badge              → el-tag（type 对应语义色）
 *   .filter-chip        → el-radio-group + el-radio-button
 *   .admin-search input → el-input（clearable + 搜索图标）
 *   .mini / .btn        → el-button（size / type 由 cls 映射）
 *   Pager 组件          → el-pagination
 *   .state 加载/错误     → el-skeleton / el-empty
 *
 * ⚠️ 只换了"呈现层"，业务逻辑一行没动：
 *    数据仍来自 useAdminStore，操作仍走 a.userAct(u, act)，
 *    权限矩阵仍由 store 的 actionsFor(u) 决定 —— 这里只是把它渲染成 el-button。
 * ========================================================================== */
import { ref, computed } from 'vue';
import { useAdminStore } from '@/stores/admin';
import { useI18n } from '@/core/i18n';
import { fmtTime } from '@/core/format';

const a = useAdminStore();
const { t } = useI18n('admin');

const FILTERS = ['all', 'admin', 'user', 'frozen', 'online'];
const FILTER_LABEL = {
  all: 'filterAll', admin: 'filterAdmin', user: 'filterUser',
  frozen: 'filterFrozen', online: 'filterOnline',
};

/* 原版 badge 的 class → el-tag 的 type（视觉语义对齐，不引入新含义） */
const TAG_TYPE = { me: 'info', owner: 'danger', admin: 'warning', user: 'info', danger: 'danger' };
const tagType = (cls) => TAG_TYPE[cls] || 'info';

/* 原版操作按钮的 class → el-button 的 type */
const BTN_TYPE = { warn: 'warning', danger: 'danger', key: 'primary' };
const btnType = (cls) => BTN_TYPE[cls] || 'default';

/* 自定义翻页（替换 el-pagination）：需要用总页数和要显示的页码 */
const totalPages = computed(() => Math.max(1, Math.ceil(a.userTotal / a.userPageSize)));
/* 最多显示 5 个页码，当前页尽量居中（与 el-pagination 的 pager-count=5 一致） */
const pageNumbers = computed(() => {
  const n = totalPages.value;
  const cur = a.userPage;
  let start = Math.max(1, cur - 2);
  const end = Math.min(n, start + 4);
  start = Math.max(1, end - 4);
  const out = [];
  for (let p = start; p <= end; p += 1) out.push(p);
  return out;
});

/* 跳转输入框（与首页 page-jump 同一交互） */
const jumpVal = ref('');
function onJump() {
  const n = Number(jumpVal.value);
  if (!Number.isFinite(n) || n < 1) { jumpVal.value = ''; return; }
  a.pickUserPage(Math.min(Math.max(1, Math.trunc(n)), totalPages.value));
  jumpVal.value = '';
}

function reloadPage() { location.reload(); }
</script>

<template>
  <!-- 统计卡：用户要求"不用显示" → 整个 .stats 块隐藏（保留结构方便回退） -->
  <div v-if="false" class="stats">
    <div class="stat-card"><div id="statTotal" class="stat-num">{{ a.statsReady ? a.stats.total : '—' }}</div><div class="stat-label">{{ t('statTotal') }}</div></div>
    <div class="stat-card"><div id="statAdmins" class="stat-num">{{ a.statsReady ? a.stats.admins : '—' }}</div><div class="stat-label">{{ t('statAdmins') }}</div></div>
    <div class="stat-card"><div id="statUsers" class="stat-num">{{ a.statsReady ? a.statUsers : '—' }}</div><div class="stat-label">{{ t('statUsers') }}</div></div>
    <div class="stat-card"><div id="statSuspended" class="stat-num">{{ a.statsReady ? a.stats.suspended : '—' }}</div><div class="stat-label">{{ t('statSuspended') }}</div></div>
    <div class="stat-card"><div id="statOnline" class="stat-num">{{ a.statsReady ? a.stats.online : '—' }}</div><div class="stat-label">{{ t('statOnline') }}</div></div>
    <div class="stat-card" :title="a.stats.pending > 0 ? a.statPendingTitle : ''">
      <div id="statPending" class="stat-num amber">{{ a.statsReady ? a.stats.pending : '—' }}</div>
      <div class="stat-label">{{ t('statPending') }}</div>
    </div>
  </div>

  <!-- 用户筛选：改用**原生 button**胶囊（与首页筛选 chip 一致），
       不再用 el-radio-button（它的默认样式在管理台深色底上发灰、边框杂乱）。 -->
  <div id="userFilters" class="user-filters">
    <button
      v-for="f in FILTERS"
      :key="f"
      type="button"
      class="filter-chip"
      :class="{ active: a.userFilter === f }"
      :aria-pressed="a.userFilter === f"
      @click="a.setFilter(f)"
    >{{ t(FILTER_LABEL[f]) }}</button>
  </div>

  <!-- 用户表 -->
  <div class="panel">
    <div class="panel-head">
      <span class="panel-title">{{ t('panelUsers') }}</span>
      <!-- 搜索框紧跟标题（用户要求"移动到用户列表文字后面"） -->
      <el-input
        id="userSearch"
        class="panel-search"
        :model-value="a.userSearch"
        :placeholder="t('searchPh')"
        clearable
        size="small"
        @update:model-value="a.setSearch"
      />
      <span class="panel-head-spacer"></span>
      <el-button id="refreshBtn" size="small" :title="t('refresh')" :aria-label="t('refresh')" @click="a.refreshUsers()">
        ↻
      </el-button>
    </div>

    <!-- 加载中 -->
    <div v-if="a.usersLoading" class="state show">
      <el-skeleton :rows="4" animated />
    </div>

    <!-- 错误 -->
    <div v-else-if="a.usersError" class="state show">
      <el-empty v-if="a.usersError === 'forbidden'" :description="t('forbiddenMsg')">
        <el-button type="primary" size="small" @click="() => { location.hash = '#/home'; }">
          {{ t('backToLib') }}
        </el-button>
      </el-empty>
      <el-empty v-else :description="t('loadFailRetry')">
        <el-button type="primary" size="small" @click="reloadPage()">{{ t('reloadBtn') }}</el-button>
      </el-empty>
    </div>

    <!-- 表格 -->
    <div v-else id="tableWrap" class="table-wrap">
      <el-table :data="a.users" size="small" row-key="id" empty-text="暂无用户">
        <el-table-column prop="id" label="ID" width="46">
          <template #default="{ row }"><span style="opacity:.55">{{ row.id }}</span></template>
        </el-table-column>

        <el-table-column prop="username" :label="t('thUsername')" min-width="96">
          <template #default="{ row }"><span style="font-weight:600">{{ row.username }}</span></template>
        </el-table-column>

        <el-table-column :label="t('thRole')" width="150">
          <template #default="{ row }">
            <div class="role-tags">
              <el-tag
                v-for="(b, i) in a.badgesFor(row)"
                :key="i"
                :type="tagType(b.cls)"
                size="small"
                effect="plain"
              >{{ b.text }}</el-tag>
            </div>
          </template>
        </el-table-column>

        <el-table-column :label="t('thStatus')" width="124">
          <template #default="{ row }">
            <el-tag :type="a.statusFor(row).online ? 'success' : 'info'" size="small" effect="plain">
              {{ a.statusFor(row).text }}
            </el-tag>
            <span v-if="a.statusFor(row).note" style="opacity:.5;font-size:.7rem;margin-left:4px;white-space:nowrap">
              {{ a.statusFor(row).note }}
            </span>
          </template>
        </el-table-column>

        <el-table-column :label="t('thRegTime')" width="132">
          <template #default="{ row }"><span style="opacity:.7;white-space:nowrap">{{ fmtTime(row.created_at) }}</span></template>
        </el-table-column>

        <el-table-column :label="t('thAction')" min-width="340">
          <template #default="{ row }">
            <div class="row-actions">
              <template v-for="(act, i) in a.actionsFor(row)" :key="i">
                <el-button
                  v-if="act.act"
                  size="small"
                  :type="btnType(act.cls)"
                  :title="act.title || ''"
                  @click="a.userAct(row, act.act)"
                >{{ act.label }}</el-button>
                <span v-else style="opacity:.4;font-size:.74rem" :title="act.title || ''">{{ act.text }}</span>
              </template>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 分页：与首页（快捷网页 / 资源下载）同一套 UI ——
         ‹ 1 2 › 独立圆角按钮 + 「输入框 + 跳转」单一胶囊 -->
    <div
      v-if="!a.usersLoading && !a.usersError"
      id="userPager"
      class="admin-pager"
    >
      <button
type="button" class="page-btn" :disabled="a.userPage <= 1"
        :aria-label="t('prevPage')" @click="a.pickUserPage(a.userPage - 1)">‹</button>
      <button
        v-for="p in pageNumbers"
        :key="p"
        type="button"
        class="page-btn page-num"
        :class="{ active: p === a.userPage }"
        :aria-current="p === a.userPage ? 'page' : undefined"
        @click="a.pickUserPage(p)"
      >{{ p }}</button>
      <button
type="button" class="page-btn" :disabled="a.userPage >= totalPages"
        :aria-label="t('nextPage')" @click="a.pickUserPage(a.userPage + 1)">›</button>
      <span class="page-jump">
        <input
          v-model.number="jumpVal"
          type="number"
          :min="1"
          :max="totalPages"
          :placeholder="String(a.userPage)"
          :aria-label="t('jumpAria')"
          @keydown.enter.prevent="onJump"
        />
        <button type="button" class="page-jump-btn" @click="onJump">{{ t('jumpBtn') }}</button>
      </span>
    </div>
  </div>
</template>

<style scoped>
/* ===== 筛选 chip（原生 button —— 与首页筛选胶囊一致）===== */
.user-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0 14px;
}
.filter-chip {
  /* 原生 button 重置浏览器默认样式 */
  appearance: none;
  -webkit-appearance: none;
  margin: 0;
  padding: 6px 14px;
  font-family: inherit;
  font-size: 0.85rem;
  line-height: 1.2;
  cursor: pointer;
  border-radius: 999px;
  border: 1px solid var(--border, rgba(79, 240, 208, 0.18));
  background: rgba(255, 255, 255, 0.04);
  color: var(--muted, #9db8b2);
  transition: color 0.2s, border-color 0.2s, background 0.2s;
}
.filter-chip:hover {
  color: var(--accent, #4ff0d0);
  border-color: var(--accent, #4ff0d0);
  background: color-mix(in srgb, var(--accent, #4ff0d0) 8%, transparent);
}
.filter-chip.active {
  color: #062018;
  font-weight: 700;
  border-color: var(--accent, #4ff0d0);
  background: var(--accent, #4ff0d0);
}
.filter-chip:focus-visible {
  outline: 2px solid var(--accent, #4ff0d0);
  outline-offset: 2px;
}

/* ===== 用户表格：紧凑化 + 操作列一排显示 ===== */
.table-wrap { padding: 2px 0; }

/* panel-head：标题不换行，搜索框跟在标题后（弹性，但不挤压标题） */
.panel-head { flex-wrap: nowrap; }
.panel-head .panel-title { white-space: nowrap; flex-shrink: 0; }
.panel-search { flex: 0 1 auto; width: 220px; min-width: 140px; margin-left: 22px; }
.panel-head-spacer { flex: 1 1 auto; }

/* el-table 默认 cell padding 偏大（留白多）—— 收紧行高与内边距 */
.table-wrap :deep(.el-table) { font-size: 0.84rem; }
.table-wrap :deep(.el-table .cell) { padding: 0 6px; line-height: 1.4; }
.table-wrap :deep(.el-table td.el-table__cell),
.table-wrap :deep(.el-table th.el-table__cell) { padding: 6px 0; }
.table-wrap :deep(.el-table .el-table__row) { height: 40px; }

/* 角色列：多个 badge 不换行（"普通用户"+"已冻结" 一行显示完） */
.role-tags {
  display: flex;
  flex-wrap: nowrap;
  gap: 4px;
  align-items: center;
}
.role-tags :deep(.el-tag) {
  white-space: nowrap;
  flex-shrink: 0;
}

/* 操作按钮：优先一排显示；英文等长文案放不下时**换行**（而不是溢出被裁） */
.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.row-actions :deep(.el-button) {
  padding: 3px 7px !important;
  height: 24px !important;
  min-height: 24px !important;
  font-size: 0.72rem !important;
  border-radius: 8px !important;
  white-space: nowrap;
}

/* ===== 翻页：与首页（快捷网页 / 资源下载）完全同一套 UI ===== */
.admin-pager {
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
}
.page-btn {
  appearance: none;
  -webkit-appearance: none;
  margin: 0;
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  border-radius: 8px;
  border: 1px solid var(--border, rgba(79, 240, 208, 0.18));
  background: rgba(255, 255, 255, 0.04);
  color: var(--muted, #9db8b2);
  font-family: inherit;
  font-size: 0.85rem;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s, border-color 0.2s, background 0.2s;
}
.page-btn:hover:not(:disabled) {
  border-color: var(--accent, #4ff0d0);
  color: var(--accent, #4ff0d0);
  background: color-mix(in srgb, var(--accent, #4ff0d0) 8%, transparent);
}
.page-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.page-num.active {
  border-color: var(--accent, #4ff0d0);
  background: var(--accent, #4ff0d0);
  color: #062018;
  font-weight: 700;
}
.page-btn:focus-visible { outline: 2px solid var(--accent, #4ff0d0); outline-offset: 1px; }

.page-jump {
  display: inline-flex;
  align-items: center;
  gap: 0;
  margin-left: 8px;
  border: 1px solid var(--border, rgba(79, 240, 208, 0.18));
  background: rgba(255, 255, 255, 0.04);
  border-radius: 18px;
  overflow: hidden;
  height: 36px;
}
.page-jump input {
  width: 56px;
  height: 100%;
  padding: 0 10px;
  border: none;
  background: transparent;
  color: var(--text, #e8fbf7);
  font-family: inherit;
  font-size: 0.82rem;
  text-align: center;
  outline: none;
}
.page-jump input::placeholder { color: var(--muted, #9db8b2); opacity: 0.6; }
.page-jump input::-webkit-outer-spin-button,
.page-jump input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.page-jump input[type="number"] { -moz-appearance: textfield; }
.page-jump-btn {
  appearance: none;
  -webkit-appearance: none;
  margin: 0;
  height: 100%;
  padding: 0 14px;
  border: none;
  border-radius: 0 18px 18px 0;
  background: color-mix(in srgb, var(--accent, #4ff0d0) 12%, transparent);
  color: var(--accent, #4ff0d0);
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s;
}
.page-jump-btn:hover { background: color-mix(in srgb, var(--accent, #4ff0d0) 22%, transparent); }
</style>
