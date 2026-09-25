<script setup>
/* ==========================================================================
 * AdminView.vue —— 管理控制台
 *
 * 原状：标记 + 972 行命令式脚本（src/modules/pages/admin.js）。
 * 现在：页面只是把三个面板拼起来，数据与权限判断在 stores/admin.js，
 *       文案在 packs/admin.js，样式在 styles/pages/admin.css。
 * 常驻弹窗（修改关于页密码 / 查看新密码）与提示条仍留在本页，id 与原站一一对应。
 * ========================================================================== */
import { ref, watch, nextTick, onMounted } from 'vue';
import { useAdminStore } from '@/stores/admin';
import { usePageMeta } from '@/composables/usePageMeta';
import { useI18n } from '@/core/i18n';
import UsersPanel from '@/components/admin/UsersPanel.vue';
import FeedbackPanel from '@/components/admin/FeedbackPanel.vue';
import SiteSettingsPanel from '@/components/admin/SiteSettingsPanel.vue';
/* 数据看板：ECharts（动态 import）+ Element Plus（按需自动引入） */
import StatsBoard from '@/components/admin/StatsBoard.vue';
import PhotosPanel from '@/components/admin/PhotosPanel.vue';
import ResumePanel from '@/components/admin/ResumePanel.vue';
import EbookPanel from '@/components/admin/EbookPanel.vue';
import MomentsPanel from '@/components/admin/MomentsPanel.vue';
import EpLocaleProvider from '@/components/EpLocaleProvider.vue';

usePageMeta('admin');

const a = useAdminStore();
const { t } = useI18n('admin');
/* P3-6：头像 alt 走 common 命名空间（跨页面共用文案） */
const { t: tc } = useI18n('common');

const apwInputEl = ref(null);
const revealInputEl = ref(null);

/* 打开「修改密码」弹窗时自动聚焦（原实现是 setTimeout 60ms 后 focus） */
watch(() => a.apw.visible, async (on) => {
  if (!on) return;
  await nextTick();
  setTimeout(() => { try { if (apwInputEl.value) apwInputEl.value.focus(); } catch (e) { /* 忽略 */ } }, 60);
});

/* 打开「新密码」弹窗时全选，方便直接复制（原实现同） */
watch(() => a.reveal.visible, async (on) => {
  if (!on) return;
  await nextTick();
  setTimeout(() => { try { if (revealInputEl.value) revealInputEl.value.select(); } catch (e) { /* 忽略 */ } }, 60);
});

onMounted(() => { a.init(); });
</script>

<template>
<!-- P1-5：Element Plus 内置文案（表格空态 / 骨架屏 aria…）跟随界面语言。
     该组件不产生任何 DOM，包裹后页面结构与布局不变；子节点缩进保持原样以缩小 diff。 -->
<EpLocaleProvider>
<div class="admin-wrap">
    <!-- 顶栏 -->
    <header class="admin-header">
      <div class="admin-brand">
        <img src="assets/avatar.jpg" :alt="tc('avatarAlt')" />
        <div>
          <div class="admin-brand-text">{{ t('consoleTitle') }}</div>
          <div id="adminSub" class="admin-brand-sub">{{ a.adminSub }}</div>
        </div>
      </div>
      <div class="admin-actions">
        <a id="backToPrevBtn" class="btn" href="#/home" @click.prevent="a.back()">{{ t('backToPrev') }}</a>
      </div>
    </header>

    <!-- 数据看板：ECharts 图表 + Element Plus 明细表（都是按需加载，不进首屏） -->
    <StatsBoard />

    <!-- 统计 + 筛选 + 用户表 -->
    <UsersPanel />

    <!-- 反馈建议 -->
    <FeedbackPanel />

    <!-- 站长编辑功能（仅 owner 可写，接口层已校验） -->
    <PhotosPanel />
    <ResumePanel />
    <EbookPanel />
    <MomentsPanel />

    <!-- 站点设置（站长可改，管理员只读） -->
    <SiteSettingsPanel v-if="a.cfgVisible" />

    <div class="admin-footer">
      {{ t('footerLine1') }}<br>
      {{ t('footerLine2') }}
    </div>

    <!-- 修改关于页密码弹窗 -->
    <div id="apwModal" class="apw-overlay" :hidden="!a.apw.visible" @click.self="a.closeApwModal()">
      <div class="apw-modal">
        <h3>{{ t('apwTitle') }}</h3>
        <p style="opacity:.6;font-size:.78rem;margin:0 0 12px">{{ t('apwHint') }}</p>
        <el-input
id="apwInput"
          ref="apwInputEl"
          v-model="a.apw.input"
          type="password"
          maxlength="32"
          :placeholder="t('apwPlaceholder')"
          autocomplete="off"
          @keydown.enter="a.apwSave()"
          @keydown.esc="a.closeApwModal()" />
        <div class="apw-actions">
          <el-button id="apwSaveBtn" size="small" :disabled="a.apw.busy" @click="a.apwSave()">{{ t('apwSave') }}</el-button>
          <el-button id="apwCancelBtn" size="small" @click="a.closeApwModal()">{{ t('apwCancel') }}</el-button>
        </div>
        <div id="apwModalMsg" class="apw-msg">{{ a.apw.msg }}</div>
      </div>
    </div>
</div>

<!-- 站长查看用户密码（重置并显示一次性新密码） -->
<div id="revealModal" class="apw-overlay" :hidden="!a.reveal.visible" @click.self="a.closeReveal()">
  <div class="apw-modal">
    <h3>{{ t('revealTitle') }}<span id="revealTargetName" style="opacity:.6;font-size:.9rem">{{ a.reveal.name }}</span></h3>
    <p style="opacity:.7;font-size:.78rem;margin:0 0 12px;line-height:1.6">{{ t('revealWarn') }}</p>
    <div style="display:flex;gap:8px;align-items:stretch">
      <el-input
id="revealPasswordInput"
        ref="revealInputEl"
        :value="a.reveal.password"
        type="text"
        readonly
        style="font-family:'JetBrains Mono','Consolas',monospace;letter-spacing:2px;text-align:center;font-size:1.05rem;flex:1" />
      <el-button id="revealCopyBtn" size="small" @click="a.copyReveal(revealInputEl)">{{ t('revealCopy') }}</el-button>
    </div>
    <div class="apw-actions">
      <el-button id="revealCloseBtn" size="small" @click="a.closeReveal()">{{ t('revealClose') }}</el-button>
    </div>
    <div id="revealModalMsg" class="apw-msg" style="color:var(--accent)">{{ a.reveal.msg }}</div>
  </div>
</div>

<div id="toast" class="toast" :class="{ show: a.toast.show, err: a.toast.err }">{{ a.toast.text }}</div>
</EpLocaleProvider>
</template>

<!-- 样式原在 src/styles/pages/admin.css，已合并进本组件 -->
<style>
/* 来自 admin.css（合并进组件，未加 scoped —— 保持与原来一致的全局作用域） */
html:where([data-page="admin"]) { background-color: #061814; }
  html:where([data-page="admin"])[data-theme="light"] { background-color: #f2f7f4; }
  :where(html[data-page="admin"]) body { background-color: #061814; }
  :where(html[data-page="admin"]) * { box-sizing: border-box; }

  /* ===== 共享 CSS 变量（与主站 style.css 对齐，供搜索框/分页/确认弹窗等共用主题） ===== */
  :root:where([data-page="admin"]) {
    --accent: #4ff0d0;
    --text: #e9edf6;
    --border: rgba(79, 240, 208, 0.18);
    --muted: rgba(233, 237, 246, 0.6);
  }
  html:where([data-page="admin"])[data-theme="light"] {
    --accent: #2d7a5a;
    --text: #143325;
    --border: rgba(45, 122, 90, 0.18);
    --muted: rgba(20, 51, 37, 0.6);
  }

  :where(html[data-page="admin"]) body {
    margin: 0;
    min-height: 100vh;
    padding-left: 0; /* 管理台全宽布局（音乐组件样式已并入主站 site/player.css｜原 music-player.css 副本已删） */
    overflow-x: hidden;
    color: #e9edf6;
    font-family: system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    background:
      radial-gradient(1000px 500px at 85% -10%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 60%),
      radial-gradient(800px 420px at -10% 110%, color-mix(in srgb, var(--accent-2) 10%, transparent), transparent 60%),
      #061814;
  }

  :where(html[data-page="admin"]) .admin-wrap { max-width: 980px; margin: 0 auto; padding: 28px 20px 60px; }

  /* ===== 顶栏 ===== */
  :where(html[data-page="admin"]) .admin-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding: 16px 20px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
  :where(html[data-page="admin"]) .admin-brand { display: flex; align-items: center; gap: 12px; }
  :where(html[data-page="admin"]) .admin-brand img {
    width: 42px; height: 42px; border-radius: 50%;
    border: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
    box-shadow: 0 0 14px color-mix(in srgb, var(--accent) 25%, transparent);
    object-fit: cover;
  }
  :where(html[data-page="admin"]) .admin-brand-text {
    font-weight: 700; font-size: 1rem; letter-spacing: 0.5px;
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  :where(html[data-page="admin"]) .admin-brand-sub { font-size: 0.75rem; opacity: 0.55; margin-top: 2px; letter-spacing: 1px; }
  :where(html[data-page="admin"]) .admin-actions { display: flex; gap: 8px; align-items: center; }
  :where(html[data-page="admin"]) .btn {
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.06);
    color: #e9edf6;
    padding: 7px 14px;
    border-radius: 999px;
    font-size: 0.875rem;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.2s;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  :where(html[data-page="admin"]) .btn:hover { border-color: var(--accent); color: var(--accent); box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 20%, transparent); }

  /* ===== 统计卡片 ===== */
  :where(html[data-page="admin"]) .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; margin: 22px 0; }
  :where(html[data-page="admin"]) .stat-card {
    padding: 18px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.09);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    text-align: center;
    transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
  }
  :where(html[data-page="admin"]) .stat-card:hover { transform: translateY(-3px); border-color: color-mix(in srgb, var(--accent) 35%, transparent); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25); }
  :where(html[data-page="admin"]) .stat-num {
    font-size: 2rem; font-weight: 800;
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  :where(html[data-page="admin"]) .stat-num.amber {
    background: linear-gradient(135deg, #fbbf24, #f97316);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  :where(html[data-page="admin"]) .stat-label { font-size: 0.8rem; opacity: 0.6; margin-top: 4px; letter-spacing: 1px; }

  /* ===== 用户筛选 ===== */
  :where(html[data-page="admin"]) .user-filters { display: flex; flex-wrap: wrap; gap: 8px; margin: -6px 0 18px; }
  :where(html[data-page="admin"]) .filter-chip {
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.05);
    color: #e9edf6;
    padding: 5px 13px;
    border-radius: 999px;
    font-size: 0.78rem;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  :where(html[data-page="admin"]) .filter-chip:hover { border-color: color-mix(in srgb, var(--accent) 45%, transparent); color: var(--accent); }
  :where(html[data-page="admin"]) .filter-chip.active {
    background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 18%, transparent), color-mix(in srgb, var(--accent-2) 14%, transparent));
    border-color: color-mix(in srgb, var(--accent) 55%, transparent);
    color: var(--accent);
    box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 12%, transparent);
  }
  html:where([data-page="admin"])[data-theme="light"] .filter-chip { border-color: rgba(45, 122, 90, 0.2); color: #143325; background: rgba(45, 122, 90, 0.04); }
  html:where([data-page="admin"])[data-theme="light"] .filter-chip:hover { border-color: #2d7a5a; color: #2d7a5a; }
  html:where([data-page="admin"])[data-theme="light"] .filter-chip.active { background: rgba(45, 122, 90, 0.12); border-color: #2d7a5a; color: #1f6b4a; box-shadow: 0 0 12px rgba(45, 122, 90, 0.1); }

  /* 强制隐藏属性生效：避免作者样式的 display 覆盖 [hidden]（如 .cfg-readonly-note） */
  :where(html[data-page="admin"]) [hidden] { display: none !important; }

  /* ===== 用户表格 ===== */
  :where(html[data-page="admin"]) .panel {
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.09);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    overflow: hidden;
  }
  :where(html[data-page="admin"]) .panel-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  :where(html[data-page="admin"]) .panel-title { font-weight: 700; font-size: 1rem; letter-spacing: 0.5px; }
  :where(html[data-page="admin"]) .panel-title::before { content: "◉ "; color: var(--accent); }
  :where(html[data-page="admin"]) .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  :where(html[data-page="admin"]) table { width: 100%; border-collapse: collapse; font-size: 0.875rem; min-width: 760px; }
  :where(html[data-page="admin"]) th, :where(html[data-page="admin"]) td { padding: 12px 16px; text-align: left; white-space: nowrap; vertical-align: middle; }
  :where(html[data-page="admin"]) thead th {
    font-size: 0.75rem; letter-spacing: 1px; opacity: 0.55; font-weight: 600;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  :where(html[data-page="admin"]) tbody tr { transition: background 0.15s; }
  :where(html[data-page="admin"]) tbody tr:hover { background: color-mix(in srgb, var(--accent) 5%, transparent); }
  :where(html[data-page="admin"]) tbody tr + tr td { border-top: 1px solid rgba(255, 255, 255, 0.05); }

  :where(html[data-page="admin"]) .badge {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 600;
  }
  :where(html[data-page="admin"]) .badge.user { background: color-mix(in srgb, var(--accent-2) 16%, transparent); color: #9db8ff; border: 1px solid color-mix(in srgb, var(--accent-2) 35%, transparent); }
  :where(html[data-page="admin"]) .badge.admin { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent); }
  :where(html[data-page="admin"]) .badge.owner { background: rgba(250, 204, 21, 0.15); color: #ffe066; border: 1px solid rgba(250, 204, 21, 0.45); }
  :where(html[data-page="admin"]) .badge.me { background: rgba(255, 205, 90, 0.14); color: #ffd27a; border: 1px solid rgba(255, 205, 90, 0.4); }

  :where(html[data-page="admin"]) .row-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  :where(html[data-page="admin"]) .mini {
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.05);
    color: #e9edf6;
    padding: 5px 12px; border-radius: 999px; font-size: 0.75rem;
    font-family: inherit; cursor: pointer; transition: all 0.18s;
    white-space: nowrap; display: inline-flex; align-items: center; line-height: 1;
  }
  :where(html[data-page="admin"]) .mini:hover { border-color: var(--accent); color: var(--accent); }
  :where(html[data-page="admin"]) .mini.warn:hover { border-color: #fbbf24; color: #fbbf24; box-shadow: 0 0 10px rgba(251, 191, 36, 0.2); }
  :where(html[data-page="admin"]) .mini.danger:hover { border-color: #f87171; color: #f87171; box-shadow: 0 0 10px rgba(248, 113, 113, 0.2); }
  :where(html[data-page="admin"]) .mini:disabled { opacity: 0.4; cursor: not-allowed; }

  /* ===== 已冻结徽章 ===== */
  :where(html[data-page="admin"]) .badge.danger { background: rgba(248, 113, 113, 0.14); color: #fca5a5; border: 1px solid rgba(248, 113, 113, 0.4); }
  html:where([data-page="admin"])[data-theme="light"] .badge.user { background: rgba(45, 122, 90, 0.08); color: #1f6b4a; border-color: rgba(45, 122, 90, 0.3); }
  html:where([data-page="admin"])[data-theme="light"] .badge.admin { background: rgba(45, 122, 90, 0.1); color: #1f6b4a; border-color: rgba(45, 122, 90, 0.35); }
  html:where([data-page="admin"])[data-theme="light"] .badge.owner { background: rgba(180, 120, 0, 0.1); color: #8a5a00; border-color: rgba(180, 120, 0, 0.35); }
  html:where([data-page="admin"])[data-theme="light"] .badge.me { background: rgba(217, 119, 6, 0.1); color: #9a6b00; border-color: rgba(217, 119, 6, 0.3); }
  html:where([data-page="admin"])[data-theme="light"] .badge.danger { background: rgba(220, 38, 38, 0.08); color: #b91c1c; border-color: rgba(220, 38, 38, 0.3); }

  /* ===== 在线/离线徽章 ===== */
  :where(html[data-page="admin"]) .badge.online { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent); }
  :where(html[data-page="admin"]) .badge.offline { background: rgba(255, 255, 255, 0.04); color: rgba(255, 255, 255, 0.42); border: 1px solid rgba(255, 255, 255, 0.12); }
  html:where([data-page="admin"])[data-theme="light"] .badge.online { background: rgba(25, 179, 107, 0.1); color: #0e7a4a; border-color: rgba(25, 179, 107, 0.35); }
  html:where([data-page="admin"])[data-theme="light"] .badge.offline { background: rgba(0, 0, 0, 0.04); color: rgba(0, 0, 0, 0.42); border-color: rgba(0, 0, 0, 0.12); }
  html:where([data-page="admin"])[data-theme="light"] .panel-title::before { color: #2d7a5a; }
  html:where([data-page="admin"])[data-theme="light"] .admin-brand-sub, html:where([data-page="admin"])[data-theme="light"] .stat-label, html:where([data-page="admin"])[data-theme="light"] .panel-title-note { color: #4a6b55; opacity: 1; }
  html:where([data-page="admin"])[data-theme="light"] .state { color: #4a6b55; }
  html:where([data-page="admin"])[data-theme="light"] .stat-card:hover { box-shadow: 0 8px 24px rgba(30, 70, 50, 0.15); }

  /* ===== 反馈建议列表 ===== */
  :where(html[data-page="admin"]) .panel-title-note { font-size: 0.75rem; opacity: 0.55; font-weight: 500; }
  :where(html[data-page="admin"]) .fb-list { max-height: 480px; overflow-y: auto; }
  :where(html[data-page="admin"]) .fb-item {
    padding: 14px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }
  :where(html[data-page="admin"]) .fb-item:last-child { border-bottom: none; }
  :where(html[data-page="admin"]) .fb-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
  :where(html[data-page="admin"]) .fb-user { font-weight: 600; font-size: 0.875rem; }
  :where(html[data-page="admin"]) .fb-kind {
    display: inline-flex; padding: 2px 9px; border-radius: 999px;
    font-size: 0.75rem; font-weight: 600;
  }
  :where(html[data-page="admin"]) .fb-kind.feedback { background: color-mix(in srgb, var(--accent-2) 14%, transparent); color: #9db8ff; border: 1px solid color-mix(in srgb, var(--accent-2) 35%, transparent); }
  :where(html[data-page="admin"]) .fb-kind.suggestion { background: rgba(251, 191, 36, 0.13); color: #ffd27a; border: 1px solid rgba(251, 191, 36, 0.35); }
  html:where([data-page="admin"])[data-theme="light"] .fb-kind.feedback { background: rgba(45, 122, 90, 0.08); color: #1f6b4a; border-color: rgba(45, 122, 90, 0.3); }
  html:where([data-page="admin"])[data-theme="light"] .fb-kind.suggestion { background: rgba(217, 119, 6, 0.1); color: #9a6b00; border-color: rgba(217, 119, 6, 0.3); }
  :where(html[data-page="admin"]) .fb-time { margin-left: auto; font-size: 0.75rem; opacity: 0.5; }
  :where(html[data-page="admin"]) .fb-content { font-size: 0.875rem; line-height: 1.55; color: var(--fb-text, #e9edf6); white-space: pre-wrap; word-break: break-word; }
  html:where([data-page="admin"])[data-theme="light"] .fb-content { color: #143325; }
  :where(html[data-page="admin"]) .fb-reply {
    margin-top: 10px; padding: 10px 12px; border-radius: 10px;
    background: color-mix(in srgb, var(--accent) 5%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 16%, transparent);
    font-size: 0.8rem; line-height: 1.5; color: var(--fb-text, #b7d8cf);
  }
  html:where([data-page="admin"])[data-theme="light"] .fb-reply { background: rgba(45, 122, 90, 0.05); border-color: rgba(45, 122, 90, 0.16); color: #3c5a4a; }
  :where(html[data-page="admin"]) .fb-reply-prefix { color: var(--accent); font-weight: 600; }
  html:where([data-page="admin"])[data-theme="light"] .fb-reply-prefix { color: #2d7a5a; }
  :where(html[data-page="admin"]) .fb-reply-box { margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap; }
  :where(html[data-page="admin"]) .fb-reply-box textarea {
    flex: 1 1 240px; min-height: 54px; resize: vertical;
    padding: 8px 10px; border-radius: 10px; font-family: inherit; font-size: 0.8rem;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.06); color: #e9edf6;
    outline: none; transition: border-color 0.2s, box-shadow 0.2s;
  }
  :where(html[data-page="admin"]) .fb-reply-box textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent); }
  html:where([data-page="admin"])[data-theme="light"] .fb-reply-box textarea { border-color: rgba(45, 122, 90, 0.25); background: rgba(255, 255, 255, 0.7); color: #143325; }
  html:where([data-page="admin"])[data-theme="light"] .fb-reply-box textarea:focus { border-color: #2d7a5a; box-shadow: 0 0 0 3px rgba(45, 122, 90, 0.12); }
  :where(html[data-page="admin"]) .fb-empty { padding: 30px 20px; text-align: center; font-size: 0.875rem; opacity: 0.55; }

  /* ===== 页脚 ===== */
  :where(html[data-page="admin"]) .admin-footer {
    margin-top: 26px; text-align: center; font-size: 0.75rem; opacity: 0.45;
    letter-spacing: 0.5px; line-height: 1.7;
  }
  html:where([data-page="admin"])[data-theme="light"] .admin-footer { opacity: 0.6; }

  /* ===== 关于页密码弹窗 ===== */
  :where(html[data-page="admin"]) .apw-overlay {
    position: fixed; inset: 0; z-index: 2000;
    display: flex; align-items: center; justify-content: center; padding: 16px;
    background: rgba(2, 8, 6, 0.55);
    backdrop-filter: blur(8px) brightness(0.55) saturate(120%); -webkit-backdrop-filter: blur(8px) brightness(0.55) saturate(120%);
  }
  :where(html[data-page="admin"]) .apw-overlay[hidden] { display: none; }
  :where(html[data-page="admin"]) .apw-modal {
    width: min(760px, 92vw); max-height: 86%; padding: 24px;
    border-radius: 20px; text-align: center;
    background: rgba(13, 24, 19, 0.95); border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    color: #e9edf6; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    animation: apwPop .28s cubic-bezier(.34,1.56,.64,1);
  }
  @keyframes apwPop { from { opacity: 0; transform: scale(.94) translateY(12px); } to { opacity: 1; transform: scale(1) translateY(0); } }
  :where(html[data-page="admin"]) .apw-modal h3 { margin: 0 0 6px; font-size: 1rem; color: var(--accent); }
  :where(html[data-page="admin"]) .apw-input {
    width: 100%; box-sizing: border-box; padding: 11px 13px;
    border-radius: 11px; border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.06); color: #e9edf6;
    font-size: 1rem; font-family: inherit; outline: none; text-align: center;
    transition: border-color .2s, box-shadow .2s;
  }
  :where(html[data-page="admin"]) .apw-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent); }
  :where(html[data-page="admin"]) .apw-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 14px; }
  :where(html[data-page="admin"]) .apw-actions .mini { padding: 7px 20px; font-size: .8rem; }
  :where(html[data-page="admin"]) .apw-msg { margin-top: 10px; font-size: .8rem; min-height: 14px; color: #fca5a5; }
  html:where([data-page="admin"])[data-theme="light"] .apw-modal { background: rgba(255, 255, 255, 0.96); color: #143325; border-color: rgba(45, 122, 90, 0.3); }
  html:where([data-page="admin"])[data-theme="light"] .apw-modal h3 { color: #2d7a5a; }
  html:where([data-page="admin"])[data-theme="light"] .apw-input { border-color: rgba(45, 122, 90, 0.25); background: rgba(45, 122, 90, 0.05); color: #143325; }
  html:where([data-page="admin"])[data-theme="light"] .apw-input:focus { border-color: #2d7a5a; }

  /* ===== 状态提示 ===== */
  :where(html[data-page="admin"]) .state {
    padding: 40px 20px; text-align: center; font-size: 0.9rem; opacity: 0.8;
    display: none;
  }
  :where(html[data-page="admin"]) .state.show { display: block; }
  :where(html[data-page="admin"]) .state .spinner {
    width: 26px; height: 26px; margin: 0 auto 12px;
    border: 3px solid color-mix(in srgb, var(--accent) 20%, transparent); border-top-color: var(--accent);
    border-radius: 50%; animation: spin 0.8s linear infinite;
  }
  /* @keyframes spin 已删除 —— 原有定义是只写 `to { rotate(360deg) }` 的简版，与主站
   * site/player.css 的完整版（from 0deg → to 360deg）不一致。
   * 关键帧是**全局按名字替换**的：路由分包比入口后加载，这里的 spin 会盖住全站的 spin，
   * 风险大于收益。现已统一由主站 site/player.css 提供，本页 `animation: spin` 照常生效。 */

  :where(html[data-page="admin"]) .toast {
    position: fixed; left: 50%; bottom: 34px; transform: translateX(-50%) translateY(20px);
    background: rgba(13, 24, 19, 0.92); border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
    color: #e9edf6; padding: 10px 20px; border-radius: 999px; font-size: 0.875rem;
    /* P2-14：bottom: 34px 恰好等于 Home 指示条高度，提示条会压在指示条上。
       补安全区内边距把文字抬起来；calc() 保住原有的 10px 纵向内边距。 */
    padding-bottom: calc(10px + env(safe-area-inset-bottom));
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
    opacity: 0; pointer-events: none; transition: all 0.3s; z-index: 9999;
  }
  :where(html[data-page="admin"]) .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
  :where(html[data-page="admin"]) .toast.err { border-color: rgba(248, 113, 113, 0.5); color: #fca5a5; }

  /* ===== 浅色主题 ===== */
  html:where([data-page="admin"])[data-theme="light"] body {
    background:
      radial-gradient(1000px 500px at 85% -10%, rgba(45, 122, 90, 0.08), transparent 60%),
      radial-gradient(800px 420px at -10% 110%, color-mix(in srgb, var(--accent-2) 8%, transparent), transparent 60%),
      #f2f7f4;
    color: #143325;
  }
  html:where([data-page="admin"])[data-theme="light"] .admin-header, html:where([data-page="admin"])[data-theme="light"] .stat-card, html:where([data-page="admin"])[data-theme="light"] .panel {
    background: rgba(255, 255, 255, 0.72);
    border-color: rgba(45, 122, 90, 0.18);
  }
  html:where([data-page="admin"])[data-theme="light"] .btn { border-color: rgba(45, 122, 90, 0.25); color: #143325; background: rgba(45, 122, 90, 0.05); }
  html:where([data-page="admin"])[data-theme="light"] .btn:hover { border-color: #2d7a5a; color: #2d7a5a; }
  html:where([data-page="admin"])[data-theme="light"] .panel-head, html:where([data-page="admin"])[data-theme="light"] thead th, html:where([data-page="admin"])[data-theme="light"] tbody tr + tr td { border-color: rgba(45, 122, 90, 0.15); }
  html:where([data-page="admin"])[data-theme="light"] tbody tr:hover { background: rgba(45, 122, 90, 0.05); }
  html:where([data-page="admin"])[data-theme="light"] .mini { border-color: rgba(45, 122, 90, 0.2); color: #143325; background: rgba(45, 122, 90, 0.04); }
  html:where([data-page="admin"])[data-theme="light"] .mini:hover { border-color: #2d7a5a; color: #2d7a5a; }
  html:where([data-page="admin"])[data-theme="light"] .stat-label { opacity: 0.55; }
  html:where([data-page="admin"])[data-theme="light"] .toast { background: rgba(255, 255, 255, 0.95); border-color: rgba(45, 122, 90, 0.35); color: #143325; }

  /* ===== 用户搜索框 ===== */
  :where(html[data-page="admin"]) .admin-search {
    flex: 1; min-width: 0; max-width: 260px;
    padding: 7px 12px; border-radius: 8px;
    border: 1px solid var(--border);
    background: rgba(255, 255, 255, 0.04);
    color: var(--text);
    font-size: 0.875rem; font-family: inherit;
    outline: none; transition: border-color 0.2s;
  }
  :where(html[data-page="admin"]) .admin-search::placeholder { color: var(--muted); opacity: 0.7; }
  :where(html[data-page="admin"]) .admin-search:focus { border-color: var(--accent); }
  html:where([data-page="admin"])[data-theme="light"] .admin-search { background: rgba(0, 0, 0, 0.04); border-color: rgba(28, 75, 50, 0.18); }

  /* ===== 翻页（按键居中） ===== */
  :where(html[data-page="admin"]) .pager { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; align-items: center; margin-top: 14px; }
  :where(html[data-page="admin"]) .pager-btn {
    min-width: 36px; height: 32px; padding: 0 10px;
    border: 1px solid var(--border); border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
    color: var(--text); font-size: 0.875rem;
    cursor: pointer; font-family: inherit;
    transition: all 0.18s ease;
  }
  :where(html[data-page="admin"]) .pager-btn:hover:not(:disabled):not(.active) { border-color: var(--accent); color: var(--accent); transform: translateY(-1px); box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 15%, transparent); }
  :where(html[data-page="admin"]) .pager-btn.active { background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 90%, transparent), color-mix(in srgb, var(--accent-2) 90%, transparent)); color: #022; border-color: transparent; font-weight: 700; box-shadow: 0 2px 10px color-mix(in srgb, var(--accent) 25%, transparent); }
  :where(html[data-page="admin"]) .pager-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  :where(html[data-page="admin"]) .pager-info { color: var(--muted); font-size: 0.78rem; }
  html:where([data-page="admin"])[data-theme="light"] .pager-btn { background: rgba(0, 0, 0, 0.04); border-color: rgba(28, 75, 50, 0.15); }

  /* ===== 站点设置（仅站长） ===== */
  :where(html[data-page="admin"]) .cfg-row {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 12px 0; border-top: 1px dashed var(--border);
  }
    :where(html[data-page="admin"]) .cfg-row:first-child { border-top: 0; padding-top: 0; }
  /* 左侧（label + desc）占满剩余宽度 —— 否则 desc 被右侧 actions 挤窄，长文案被迫换行 */
  :where(html[data-page="admin"]) .cfg-row > div:first-child { flex: 1; min-width: 0; }
  :where(html[data-page="admin"]) .cfg-label { font-size: 0.875rem; font-weight: 600; }
  :where(html[data-page="admin"]) .cfg-desc { font-size: 0.75rem; opacity: 0.55; margin-top: 3px; line-height: 1.5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  :where(html[data-page="admin"]) .cfg-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }

  /* ===== 分段控件（原生 button，替换 el-radio-group）=====
     用于「欢迎页进入后落到」的 资源库主页 / 关于我 二选一。 */
  :where(html[data-page="admin"]) .seg-group {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    border-radius: 999px;
    border: 1px solid var(--border, rgba(79, 240, 208, 0.18));
    background: rgba(255, 255, 255, 0.04);
  }
  :where(html[data-page="admin"]) .seg-btn {
    appearance: none;
    -webkit-appearance: none;
    margin: 0;
    padding: 5px 14px;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--muted, #9db8b2);
    font-family: inherit;
    font-size: 0.875rem;
    line-height: 1.2;
    cursor: pointer;
    white-space: nowrap;
    transition: color 0.2s, background 0.2s;
  }
  :where(html[data-page="admin"]) .seg-btn:hover:not(:disabled) { color: var(--accent, #4ff0d0); }
  :where(html[data-page="admin"]) .seg-btn.active {
    color: #062018;
    font-weight: 700;
    background: var(--accent, #4ff0d0);
  }
  :where(html[data-page="admin"]) .seg-btn:disabled { opacity: 0.45; cursor: not-allowed; }
  :where(html[data-page="admin"]) .seg-btn:focus-visible { outline: 2px solid var(--accent, #4ff0d0); outline-offset: 1px; }
  :where(html[data-page="admin"]) .cfg-status { font-size: 0.75rem; opacity: 0.7; min-width: 92px; text-align: right; }
  :where(html[data-page="admin"]) .cfg-status.on { color: var(--accent); opacity: 1; }
  :where(html[data-page="admin"]) .cfg-status.off { opacity: 0.5; }
  :where(html[data-page="admin"]) .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  :where(html[data-page="admin"]) .seg button {
    border: 0; background: transparent; color: var(--text);
    font-family: inherit; font-size: 0.78rem; padding: 6px 14px; cursor: pointer;
    opacity: 0.6; transition: all 0.18s ease;
  }
  :where(html[data-page="admin"]) .seg button + button { border-left: 1px solid var(--border); }
  :where(html[data-page="admin"]) .seg button.active { background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); opacity: 1; font-weight: 700; }
  html:where([data-page="admin"])[data-theme="light"] .cfg-row { border-color: rgba(45, 122, 90, 0.18); }
  html:where([data-page="admin"])[data-theme="light"] .seg { border-color: rgba(45, 122, 90, 0.25); }
  html:where([data-page="admin"])[data-theme="light"] .seg button { color: #143325; }
  html:where([data-page="admin"])[data-theme="light"] .seg button + button { border-left-color: rgba(45, 122, 90, 0.25); }
  /* 开关改用共享样式（public/style.css 的 .switch / .switch-input），此处仅保留 admin 专属规则 */
  :where(html[data-page="admin"]) .switch-wrap { display: inline-flex; align-items: center; } :where(html[data-page="admin"]) .cfg-readonly .seg { cursor: not-allowed; }
  :where(html[data-page="admin"]) .cfg-readonly .seg button { cursor: not-allowed; opacity: 0.45; }
  :where(html[data-page="admin"]) .cfg-readonly-note { margin: 0 0 12px; font-size: 0.75rem; opacity: 0.7; }

  @media (max-width: 640px) {
    :where(html[data-page="admin"]) .stats { grid-template-columns: 1fr 1fr; }
    :where(html[data-page="admin"]) .panel-head { flex-wrap: wrap; gap: 8px; }
    :where(html[data-page="admin"]) .admin-search { order: 3; flex: 1 1 100%; max-width: 100%; font-size: 0.8rem; }
    :where(html[data-page="admin"]) .user-filters { margin: -2px 0 16px; }
    :where(html[data-page="admin"]) .pager-btn { min-width: 32px; height: 30px; padding: 0 8px; font-size: 0.78rem; }
    :where(html[data-page="admin"]) .pager-info { font-size: 0.75rem; flex-basis: 100%; text-align: center; margin-left: 0; margin-top: 4px; }
    :where(html[data-page="admin"]) .cfg-row { flex-direction: column; align-items: flex-start; }
    :where(html[data-page="admin"]) .cfg-actions { justify-content: flex-start; }
    :where(html[data-page="admin"]) .cfg-status { text-align: left; min-width: 0; }
  }

/* 站长编辑面板（照片墙/简历/电子书/朋友圈）—— 2026-09-25 第五步 */
:where(html[data-page="admin"]) .ed-bar { display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin:10px 0; }
:where(html[data-page="admin"]) .ed-form { display:flex; flex-direction:column; gap:10px; margin:10px 0 16px; }
:where(html[data-page="admin"]) .ed-input, :where(html[data-page="admin"]) .ed-area { padding:8px 12px; border-radius:9px; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.06); color:inherit; font-size:0.875rem; font-family:inherit; outline:none; }
:where(html[data-page="admin"]) .ed-area { resize:vertical; line-height:1.6; }
:where(html[data-page="admin"]) .ed-input:focus, :where(html[data-page="admin"]) .ed-area:focus { border-color:var(--accent); box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent); }
:where(html[data-page="admin"]) .ed-w160 { width:160px; }
:where(html[data-page="admin"]) .ed-btn { padding:6px 12px; border-radius:999px; border:1px solid rgba(255,255,255,.16); background:none; color:inherit; font-size:0.8125rem; font-family:inherit; cursor:pointer; text-decoration:none; }
:where(html[data-page="admin"]) .ed-btn:hover { border-color:var(--accent); color:var(--accent); }
:where(html[data-page="admin"]) .ed-primary { background:linear-gradient(135deg,color-mix(in srgb, var(--accent) 90%, transparent),color-mix(in srgb, var(--accent-2) 90%, transparent)); color:#022; font-weight:700; border:none; }
:where(html[data-page="admin"]) .ed-danger { border-color:rgba(248,113,113,.35); color:#f87171; }
:where(html[data-page="admin"]) .ed-msg { font-size:0.8125rem; opacity:.75; }
:where(html[data-page="admin"]) .ed-empty { opacity:.6; font-size:0.875rem; padding:10px 0; }
:where(html[data-page="admin"]) .ed-list { list-style:none; margin:0; padding:0; }
:where(html[data-page="admin"]) .ed-row { display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px dashed rgba(255,255,255,.08); }
:where(html[data-page="admin"]) .ed-col { flex-direction:column; align-items:stretch; }
:where(html[data-page="admin"]) .ed-fields { display:flex; flex-direction:column; gap:6px; flex:1; min-width:0; }
:where(html[data-page="admin"]) .ed-ops { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
:where(html[data-page="admin"]) .ed-thumb { width:64px; height:64px; object-fit:cover; border-radius:10px; }
:where(html[data-page="admin"]) .ed-imgs { display:flex; gap:8px; flex-wrap:wrap; }
:where(html[data-page="admin"]) .ed-chapter { font-size:0.9375rem; }
:where(html[data-page="admin"]) .ed-preview { margin:0; font-size:0.875rem; opacity:.85; white-space:pre-wrap; word-break:break-word; }
</style>
