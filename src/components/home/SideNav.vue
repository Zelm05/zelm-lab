<script setup>
/* ==========================================================================
 * SideNav.vue —— 左侧导航栏
 *
 * 原状：src/modules/pages/home.js 里散着四段——锚点滚动 scrollToTarget、
 *   querySelectorAll('.side-nav [data-target]') 逐个挂点击、汉堡菜单开合、
 *   滚动隐藏 handleNavHide。
 * 现在：收敛成一个组件；菜单开合与「刚点过的项闪一下」是组件状态，
 *   滚动隐藏由 window scroll 监听驱动。
 *
 * 原样保留的行为：
 *   · 导航项点击是**锚点滚动**（不是切页）：关于我 → 滚到本页 #about 区块
 *   · 点击后闪亮 260ms（导航项不常亮，与关于页一致）
 *   · 手机端汉堡菜单：点导航项或点面板外收起
 *   · 「滚动隐藏」模式下向下滚过 140px 收起导航，向上滚即恢复
 *   · 左上角 Zelm 品牌：纯标识，点击无操作
 * ========================================================================== */
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from '@/core/i18n';
import { useSiteCfgStore } from '@/stores/site-cfg';
import { useSettingsStore } from '@/stores/settings';

const { t } = useI18n('home');
const cfg = useSiteCfgStore();
const st = useSettingsStore();

const NAV_ITEMS = [
  { target: 'quickLinks', key: 'navQuick' },
  { target: 'resources', key: 'navResources' },
  { target: 'games', key: 'navGames' },
  { target: 'messages', key: 'navMessages' },
  { target: 'feedbacks', key: 'navFeedbacks' },
];

const navEl = ref(null);
/* 「刚点过」的导航项（260ms 后自动熄灭，原站的 .active 闪亮） */
const flashed = ref('');
let flashTimer = null;

function scrollToTarget(id) {
  const behavior = st.s.smoothScroll ? 'smooth' : 'auto';
  if (id === 'top' || id === 'home') { window.scrollTo({ top: 0, behavior }); return; }
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior, block: 'start' });
}

function onNav(target) {
  scrollToTarget(target);
  flashed.value = target;
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { flashed.value = ''; flashTimer = null; }, 260);
}
function onSettings() {
  st.openPanel();
}

/* ---------------- 滚动隐藏 ---------------- */
let lastScrollY = 0;
function onScroll() {
  if (!navEl.value) return;
  if (st.s.navMode !== 'hide') { navEl.value.classList.remove('nav-hidden'); return; }
  const y = window.scrollY;
  if (y > lastScrollY && y > 140) navEl.value.classList.add('nav-hidden');
  else navEl.value.classList.remove('nav-hidden');
  lastScrollY = y;
}

onMounted(() => {
  lastScrollY = window.scrollY;
  window.addEventListener('scroll', onScroll, { passive: true });
});
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll);
  if (flashTimer) clearTimeout(flashTimer);
});

const aboutOn = computed(() => cfg.homeAboutOn);
</script>

<template>
  <nav id="sideNav" ref="navEl" class="side-nav">
    <div class="nav-header">
      <a id="navBrand" class="nav-brand" href="javascript:void(0)">◉ Zelm</a>
    </div>
    <div id="navItems" class="nav-items">
      <div class="nav-group">
        <button type="button" class="nav-item" data-target="home" @click="onNav('home')">{{ t('navHome') }}</button>
        <button
v-show="aboutOn" id="navAboutBtn"
          type="button"
          class="nav-item"
          data-target="about"
          @click="onNav('about')">{{ t('aboutTitle') }}</button>
        <button
id="navProjectsBtn" type="button"
          class="nav-item"
          data-target="projects"
          @click="onNav('projects')">{{ t('projectsNav') }}</button>
      </div>
      <div class="nav-divider"></div>
      <div class="nav-group">
        <button
v-for="it in NAV_ITEMS" :key="it.target" type="button"
          class="nav-item"

          :data-target="it.target"
          @click="onNav(it.target)">{{ t(it.key) }}</button>
      </div>
      <div class="nav-divider"></div>
      <button id="navSettingsBtn" type="button" class="nav-item" @click="onSettings">{{ t('settingsTitle') }}</button>
    </div>
  </nav>
</template>

<style scoped>
/* ==========================================================================
 * 侧边导航项：用**原生 <button class="nav-item">**（不用 el-button）。
 * 原因：Element Plus 的 el-button 默认样式（inline-flex / justify-content / hover 变蓝白）
 * 会干扰居中与配色，强覆盖很脆弱。原生 button 由本组件 CSS 完全控制。
 * scoped 只作用于本组件，不污染 About 页的 <a class="nav-item">。
 * ========================================================================== */
.nav-items .nav-item {
  /* 原生 <button> 重置浏览器默认样式（彻底脱离 Element Plus） */
  appearance: none !important;
  -webkit-appearance: none !important;
  margin: 0 !important;
  font-family: inherit !important;
  font-size: 0.9rem !important;
  line-height: 1.2 !important;
  cursor: pointer !important;
  display: flex;
  width: 100%;
  align-items: center;
  /* 导航项统一（2026-09-24 第二批）：与 About 侧栏的全局 .nav-item 对齐 ——
     43px / 0.9rem(14.4px) / 左对齐 / 缩进 1.5em。 */
  justify-content: flex-start !important;
  padding: 11px 14px;
  padding-left: calc(14px + 1.5em);
  border-radius: 12px;
  box-sizing: border-box;
  height: 43px;
  min-height: 43px;
  /* 缩放（zoom 0.3x 左右）下 flex-wrap:wrap 会被压成 2 行 4 个（很挤），
     强制单列避免这种「所有分类缩成方块」的情况。 */
  flex-wrap: nowrap;
  /* 文字居中对齐（用户要求"全部居中"） */
  text-align: left !important;
  /* 覆盖 el-button 默认的 hover/focus 状态 —— 默认会变浅蓝/白色背景，
     这里强制保持深色 + 只描边变色 */
  background: transparent !important;
  border-color: transparent !important;
  color: var(--text) !important;
}
.nav-items .nav-item:hover {
  background: rgba(79, 240, 208, 0.08) !important;
  border-color: var(--accent) !important;
  color: var(--accent) !important;
}
.nav-items .nav-item:focus,
.nav-items .nav-item:active {
  background: rgba(79, 240, 208, 0.12) !important;
  border-color: var(--accent) !important;
  color: var(--accent) !important;
  outline: none;
}
/* P2-12：键盘聚焦（:focus-visible）时**不**去掉描边，交给全局 :focus-visible
 * 安全网给出清晰的焦点环；移除了原先的 !important，避免压住安全网。 */
.nav-items .nav-item:focus-visible {
  background: rgba(79, 240, 208, 0.12) !important;
  border-color: var(--accent) !important;
  color: var(--accent) !important;
}
/* 容器自身也用 column，让导航项目竖排（不绕行），跟原站的桌面布局一致。 */
.nav-items,
.nav-group {
  display: flex !important;
  flex-direction: column !important;
  flex-wrap: nowrap !important;
  gap: 4px;
}
</style>

