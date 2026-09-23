<script setup>
/* ==========================================================================
 * App.vue —— 外壳
 *
 * 与原 index.html 外壳一一对应，但不再有「挂载引擎」：
 *   之前：Vue 只画一个空壳，页面标记与脚本由 src/shell/legacy.js
 *         按 manifest 用 DOMParser 注入 #viewRoot，再用 <script src> 执行页面脚本。
 *   现在：#viewRoot 由 Vue 渲染，页面是真正的路由组件（src/views/*.vue），
 *         标记写在各自的 <template> 里，DOM 归 Vue 所有，卸载即真正卸载。
 *
 * 职责划分：
 *   - #viewRoot      → <router-view/> 承载页面（会整体包含 z-index:1 层叠上下文）
 *   - 常驻组件        → 认证弹窗 / 确认弹窗 / 顶号弹窗，必须放在 #viewRoot 之外，
 *                       否则会被压在 z-index:1 的层叠上下文里
 * ========================================================================== */
import { nextTick, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import SessionKick from '@/components/SessionKick.vue';
import AuthPanel from '@/components/AuthPanel.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import { useUserStore } from '@/stores/user';
import { startSessionGuard } from '@/core/session-guard';

const user = useUserStore();
const route = useRoute();

// 切页时把内容容器滚回顶部（原站 shell.js 每装载一页都会 `viewRoot.scrollTop = 0`），
// 之后再处理锚点路由（如 #/privacy/t → 服务条款）。
// 注意真正的滚动容器是 #viewRoot 而不是 window，路由自带的 scrollBehavior 不适用。
watch(() => route.path, async () => {
  await nextTick();
  const vr = document.getElementById('viewRoot');
  if (vr) vr.scrollTop = 0;
  const id = route.meta && route.meta.scrollTo;
  if (!id) return;
  const el = document.getElementById(id);
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView();
}, { immediate: true });

onMounted(() => {
  // 登录态：进站拉一次，之后登录/登出事件触发局部刷新（原 home.head1.js 的职责）
  user.load();
  document.addEventListener('zelm:login', () => user.load());
  // P2-18：任何接口返回 401（会话过期/失效）时，http.js 会广播 zelm:logout，
  // 这里把前端登录态同步成「未登录」。本来就未登录时 set(null) 是无害空操作。
  document.addEventListener('zelm:logout', () => user.set(null));
  // 单端登录守护：登录态下每 15s 轮询 /api/session/check（原在音乐播放器挂载时启动）
  startSessionGuard();
});

</script>

<!-- Element Plus 主题桥接：原 styles/element-theme.css，已合并进外壳组件。
     里面用 html:root（特异性 0,1,1）而不是 :root —— 因为 Element Plus 的组件 CSS 是
     **按需加载**的，一定排在入口样式表之后；提权后与加载顺序无关，稳定生效。 -->
<template>
  <!-- 内容区：各页由路由组件渲染；切页时这里被替换，音乐不中断 -->
  <div id="viewRoot">
    <!-- ============================================================
         弹窗宿主容器（勿删、勿改成直接 Teleport 到 #viewRoot）

         为什么需要这一层：小游戏 / 快捷网页 / 资源下载的弹窗必须放在
         <main class="container"> 之外，否则会落进 container 的 transform
         包含块（animation: mainSlideUp … both 的终态），按 container 的
         高度居中而跑到视口外。

         但**不能直接 Teleport 到 #viewRoot**：那样 Teleport 的节点会和
         <router-view/> 的锚点混在同一个父节点的子列表里，切页时 Vue 找不到
         锚点，抛 `insertBefore ... is not a child of this node`，
         整个 #viewRoot 被清空 —— 表现为**点页脚「隐私政策」后整站白屏**。

         放在 <router-view/> **之前**，是为了确保子组件挂载、Teleport 解析
         目标时这个容器已经存在于 DOM 中。
         它是静态空 div（无 z-index / 无 position），不产生新的层叠上下文，
         因此弹窗的层叠关系与修复前完全一致。
         ============================================================ -->
    <div id="overlayRoot"></div>
    <router-view />
  </div>

  <!-- 常驻：登录 / 注册弹窗宿主 -->
  <AuthPanel />

  <!-- 常驻：顶号通知弹窗（单端登录守护） -->
  <SessionKick />

  <!-- 常驻：确认弹窗 -->
  <ConfirmDialog />

  <!-- P2-11：toast 的无障碍播报区。src/modules/toast.js 会往 #toast-live 写入文案，
       由读屏器播报；视觉上不可见（.sr-only），只服务辅助技术。
       之前只有 CSS（.sr-only）和 JS（getElementById）两头，中间这个元素一直没建。 -->
  <div id="toast-live" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>
</template>

<style>
/* ==========================================================================
 * 主站设计系统 —— 原 styles/index.css 按**固定顺序** @import 的 12 个切片，
 * 现已整体内联到这里。**文件内的先后顺序必须保持原样**：
 *   这些切片是原站单张 style.css（5409 行）的连续切片，原站样式依赖
 *   「书写顺序 + 同特异性」做层叠覆盖（例如 overrides.css 是后期补丁，必须最后）。
 *   调换顺序会造成样式回归 —— 2026-09-19 曾做过三重校验（拼接逐字节一致 /
 *   剥注释后一致 / 构建产物内容哈希一致）才敢拆，这里只是把 12 个文件合成 1 处。
 * ========================================================================== */
/* ===== 原 src/styles/site/base.css ===== */
/* ============================================================================
 * base.css —— CSS 变量（:root）/ 全局 reset / body 基线
 *
 * 来源：原 src/styles/style.css 第 1-43 行，按分节边界原样切出，未改动一个字符。
 * 顺序敏感：本文件与 site/ 下其它片段共同构成全局样式，必须按 index.css 的
 *   顺序加载 —— 原站样式依赖源码书写顺序做层叠覆盖，调整顺序会造成样式回归。
 * ========================================================================== */

:root {
  --bg: #061814;
  --surface: rgba(10, 28, 26, 0.62);
  --surface-hover: rgba(18, 46, 42, 0.74);
  --accent: #4ff0d0;
  --accent-2: #7fd3ff;
  --text: #e8fbf7;
  --muted: #9db8b2;
  /* 卡片/区块标题等「硬编码近白」统一走这里：深色下 #eef3f7，浅色下压成深绿（原硬编码在浅底只有 1.11:1） */
  --title: #eef3f7;
  /* 次级灰（副标题 / 排序按钮 / 空态提示等硬编码 #8b94a3 的 15 处统一走这里）。
     深色下 #8b94a3 对暗底 5.98:1 达标；浅色下只有 2.52:1 不及格，故浅色块内压深。 */
  --soft: #8b94a3;
  --border: rgba(79, 240, 208, 0.18);
  --shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
  --radius: 20px;
  --font-body: "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;
}

/* color-scheme —— 让**原生控件**（下拉列表、滑条轨道、复选框、滚动条）
   跟随站点的深浅主题。全项目此前从未声明过它，于是原生控件永远按浏览器的
   默认配色渲染：深色主题下弹出的是浅色下拉面板，浅色主题下滑条轨道反而是深色。
   2026-09-21 设置面板改用原生控件后这个缺陷才暴露出来。
   ⚠️ 只声明 color-scheme，不碰任何已有变量 —— 它不会参与其它规则的层叠。 */
html[data-theme="dark"] { color-scheme: dark; }
html[data-theme="light"] { color-scheme: light; }

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  min-height: 100vh;
  font-family: var(--font-body);
  color: var(--text);
  background: var(--bg);
  overflow-x: hidden;
  padding-left: 190px; /* 左侧导航栏占位 */
  animation: pageEnter 0.8s ease both;
}

@keyframes pageEnter {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* ===== 原 src/styles/site/layout.css ===== */
/* ============================================================================
 * layout.css —— 左侧导航栏 / 导航头部 / 页脚联系方式图标 / QQ tooltip
 *
 * 来源：原 src/styles/style.css 第 44-706 行，按分节边界原样切出，未改动一个字符。
 * 顺序敏感：本文件与 site/ 下其它片段共同构成全局样式，必须按 index.css 的
 *   顺序加载 —— 原站样式依赖源码书写顺序做层叠覆盖，调整顺序会造成样式回归。
 * ========================================================================== */

/* ===== 左侧导航栏（原版布局） ===== */
.side-nav {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 190px;
  z-index: 150;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 14px;
  /* P2-14：iPhone 等刘海屏的底部 Home 指示条（约 34px）会盖住贴底元素。
     .side-nav 是 top:0 + bottom:0 的满高左栏，窄屏下仍贴到视口最底，
     底部导航项会落进指示条区域，所以补一段安全区内边距。
     用 calc() 叠加原有 18px —— 直接写 env() 会把 padding 简写里的 18px 覆盖成 0，
     桌面端（env 解析为 0）反而丢掉原有留白。 */
  padding-bottom: calc(18px + env(safe-area-inset-bottom));
  background: rgba(6, 20, 18, 0.82);
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
  border-right: 1px solid var(--border);
  box-shadow: var(--shadow);
  transition: transform 0.3s ease;
}
/* 滚动隐藏模式（设置中可选）：向下滚动收起，向上滚动恢复 */
body.nav-hide-mode .side-nav.nav-hidden {
  transform: translateX(-100%);
}

.nav-brand {
  display: flex;
  align-items: center;
  justify-content: center;          /* 与 .nav-item 一致：胶囊内文字居中 */
  gap: 8px;
  /* 关键：宽度铺满，让胶囊左右边缘与下方 .nav-item 的方框完全对齐。
     原来只包住文字（实测 96px vs 导航项 161px），视觉上"上面那块短一截"。 */
  width: 100%;
  box-sizing: border-box;
  /* 高度也与 .nav-item 一致（44px），整列形成规整的等高方块 */
  height: 44px;
  min-height: 44px;
  padding: 0 12px;
  margin-bottom: 10px;
  color: var(--accent);
  font-weight: 800;
  font-size: 1.05rem;
  letter-spacing: 1px;
  text-decoration: none;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
  background: color-mix(in srgb, var(--accent) 6%, transparent);
}


/* 修复：.nav-item 的 display:block 会覆盖 hidden 属性，这里显式隐藏 */
.nav-item[hidden] {
  display: none;
}

.nav-divider {
  height: 1px;
  margin: 10px 8px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 22%, transparent), transparent);
}

/* 页脚联系方式图标 */
.footer-contacts {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 14px;
}

.footer-contacts .contact-icon-only {
  width: 34px;
  height: 34px;
  font-size: 1rem;
  border-color: rgba(255, 255, 255, 0.12);
  box-sizing: border-box;
}

.footer-contacts .contact-icon-only svg {
  width: 18px;
  height: 18px;
}

.footer-contacts .contact-icon-only:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 12%, transparent);
}

/* 导航栏头部（品牌名+汉堡按钮） */
.nav-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.bg-layer {
  position: fixed;
  inset: 0;
  /* 回退：不支持 image-set 的老浏览器（含 IE）继续用原 JPG */
  background: url("/assets/bg.jpg") center center / cover no-repeat;
  /* 现代浏览器走 WebP（1600×900 q80，93.5KB，原 JPG 180.7KB）。
     本层在 .overlay 深色渐变（0.35→0.96 不透明）之下、又带 brightness(.85)，
     降到 1600 宽没有可见差别。 */
  background-image: image-set(
    url("/assets/bg.webp") type("image/webp"),
    url("/assets/bg.jpg") type("image/jpeg")
  );
  z-index: -2;
  transform: scale(1.05);
  filter: brightness(0.85) saturate(1.1);
}

.overlay {
  position: fixed;
  inset: 0;
  background: radial-gradient(circle at 50% 30%, rgba(6, 24, 20, 0.35) 0%, rgba(6, 24, 20, 0.88) 80%, rgba(2, 10, 8, 0.96) 100%);
  z-index: -1;
}

.glass {
  background: var(--surface);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.site-header {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  /* 用固定 px（原 6vw 与视口相关，不随 body zoom 缩放 → 缩放版留白比例不对） */
  padding: 16px 40px;
}

.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.header-right {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 1.4rem;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--accent);
  text-decoration: none;
}

.brand-icon {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: #022;
  font-size: 1rem;
  box-shadow: 0 0 16px color-mix(in srgb, var(--accent) 35%, transparent);
}

.subtitle {
  font-size: 0.9rem;
  color: var(--muted);
  letter-spacing: 0.5px;
}

.container {
  /* max-width = 设计基准 1280 − 左侧导航 190 = 1090。
     这样「导航 190 : 内容 1090」的比值恒为 190/1280 ≈ 0.148，
     无论窗口多宽（> 1280 时容器居中、比例不变）。
     padding 用固定 px（原来的 6vw 与视口相关，缩放版下会不一致）。 */
  max-width: 1090px;
  margin: 0 auto;
  padding: 20px 40px 140px;
  animation: containerEnter 0.8s ease 0.1s both;
}

@keyframes containerEnter {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.intro {
  text-align: center;
  padding: 50px 30px;
  margin-bottom: 32px;
}

.intro h1 {
  font-size: clamp(1.8rem, 4vw, 2.8rem);
  margin-bottom: 14px;
  text-shadow: 0 2px 14px color-mix(in srgb, var(--accent) 25%, transparent);
}

.intro p {
  color: var(--muted);
  max-width: 680px;
  margin: 0 auto;
  font-size: 1.05rem;
  line-height: 1.8;
}

.controls {
  padding: 22px 28px;
  margin-bottom: 28px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.search-wrap {
  position: relative;
}

.search-wrap input {
  width: 100%;
  padding: 14px 20px 14px 48px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.25);
  color: var(--text);
  font-size: 1rem;
  font-family: inherit;
  outline: none;
  transition: all 0.25s;
}

.search-wrap input::placeholder {
  color: var(--muted);
}

.search-wrap input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent);
}

.search-icon {
  position: absolute;
  left: 18px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--accent);
  font-size: 1.3rem;
  pointer-events: none;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;


}
/* 分类标签（快捷网页 / 资源下载共用）：不论文案多少字、哪种语言，统一 96×28。
   超长文案（如 ja「ゲームプラットフォーム」）省略号截断，title 悬停看全文。 */
.filter-btn {
  width: 96px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--muted);
  font-size: 0.78rem;
  font-family: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: all 0.2s;
}
.filter-btn:hover,
.filter-btn.active {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  box-shadow: 0 0 14px color-mix(in srgb, var(--accent) 12%, transparent);
}

.resource-grid {
  display: grid;
  /* 强制 4 列 */
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.resource-card {
  /* 原为 `composes: glass`（CSS Modules 语法，普通 \3c style> 里被浏览器忽略 → 毛玻璃从未生效）。
     改为等效声明：与 .glass 一致的 backdrop-filter（background/border 等本规则已自带覆盖）。 */
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  padding: 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  transition: transform 0.25s, border-color 0.25s, background 0.25s;
  cursor: pointer;
  animation: fadeUp 0.5s ease both;
}

.resource-card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

.resource-card:hover {
  transform: translateY(-6px);
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  background: var(--surface-hover);
}

.card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 10px;
}

.card-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-size: 1.15rem;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border: 1px solid var(--border);
}

.card-category {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 5px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
  border: 1px solid color-mix(in srgb, var(--accent) 18%, transparent);
}

.resource-card h3 {
  font-size: 0.98rem;
  margin-bottom: 6px;
}

.resource-card p {
  color: var(--muted);
  font-size: 0.84rem;
  line-height: 1.55;
  flex: 1;
  margin-bottom: 12px;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.tag {
  font-size: 0.68rem;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(127, 211, 255, 0.1);
  color: var(--accent-2);
  border: 1px solid rgba(127, 211, 255, 0.15);
}

.card-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--accent);
  font-weight: 600;
  font-size: 0.82rem;
  text-decoration: none;
  background: none;
  border: none;
  padding: 0;
  margin-top: auto;
  font-family: inherit;
  cursor: pointer;
  transition: gap 0.2s;
}

.card-link:hover {
  gap: 10px;
  text-decoration: underline;
}

.empty-state {
  text-align: center;
  padding: 70px 20px;
  color: var(--muted);
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 10px;
  opacity: 0.6;
}

.contact-icon-only {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.22);
  color: #9aa0a6;
  font-size: 1.55rem;
  text-decoration: none;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: all 0.25s;
}

.contact-icon-only:hover {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
  transform: translateY(-4px);
  box-shadow: 0 8px 20px color-mix(in srgb, var(--accent) 15%, transparent);
}

.contact-icon-only.copied {
  border-color: var(--accent);
  background: rgba(16, 185, 129, 0.18);
}

/* QQ tooltip */
.contact-icon-only.has-qq-tooltip {
  position: relative;
}
.qq-tooltip {
  position: absolute;
  bottom: calc(100% + 12px);
  left: 50%;
  transform: translateX(-50%) translateY(8px);
  width: 200px;
  padding: 16px;
  background: rgba(10, 20, 18, 0.95);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  border-radius: 14px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5), 0 0 20px color-mix(in srgb, var(--accent) 10%, transparent);
  opacity: 0;
  visibility: hidden;
  transition: all 0.25s ease;
  z-index: 100;
  text-align: center;
  pointer-events: none;
}
.qq-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 8px solid transparent;
  border-top-color: color-mix(in srgb, var(--accent) 30%, transparent);
}
.contact-icon-only.has-qq-tooltip:hover .qq-tooltip {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(0);
}
.qq-tooltip-title {
  font-size: 0.75rem;
  color: color-mix(in srgb, var(--accent) 70%, transparent);
  margin-bottom: 4px;
  letter-spacing: 1px;
}
.qq-tooltip-number {
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--accent);
  margin-bottom: 12px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 1px;
}
.qq-tooltip-qrcode {
  width: 140px;
  height: 140px;
  border-radius: 10px;
  background: #fff;
  padding: 6px;
  object-fit: cover;
  margin: 0 auto 10px;
  display: block;
}
.qq-tooltip-tip {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.5);
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.site-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 14px 16px 30px;
  color: var(--muted);
  font-size: 0.85rem;
}
/* 打赏按钮与下方联系图标保持合理间距，结构更清晰 */
.site-footer .donate-btn {
  margin-bottom: 16px;
}

/* ===== 原 src/styles/site/footer-fortune.css ===== */
/* ============================================================================
 * footer-fortune.css —— 页脚免责声明与合规入口 / 浮动运势按钮与弹窗
 *
 * 来源：原 src/styles/style.css 第 1191-1614 行，按分节边界原样切出，未改动一个字符。
 * 顺序敏感：本文件与 site/ 下其它片段共同构成全局样式，必须按 index.css 的
 *   顺序加载 —— 原站样式依赖源码书写顺序做层叠覆盖，调整顺序会造成样式回归。
 * ========================================================================== */

/* 页脚免责声明（home / about 共用） */
.footer-disclaimer {
  max-width: 680px;
  margin: 6px auto 0;
  font-size: 0.72rem;
  line-height: 1.5;
  opacity: 0.7;
}

/* 页脚合规入口：隐私政策 / 服务条款 / 侵权投诉邮箱 */
.footer-legal {
  margin: 8px auto 0;
  font-size: 0.75rem;
  line-height: 1.6;
  opacity: 0.85;
}
.footer-legal a {
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px solid transparent;
}
.footer-legal a:hover,
.footer-legal a:focus-visible {
  border-bottom-color: var(--accent);
}

@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 640px) {
  .site-header {
    flex-direction: column;
    gap: 8px;
    text-align: center;
  }

  /* 窄屏下右上角账号区/时钟改回纵向，避免溢出 */
  .header-right {
    flex-direction: column;
    gap: 6px;
  }

  .controls {
    padding: 18px;
  }

  /* 手机版今日运势按钮（放在光盘上方） */
  .fortune-float {
    width: 40px !important;
    height: 40px !important;
    right: 20px !important;
    top: auto !important;
    bottom: 150px !important;
    left: auto !important;
    position: fixed !important;
    font-size: 1.1rem !important;
    z-index: 160 !important;
  }
  .fortune-popup {
    right: 10px !important;
    left: 10px !important;
    top: auto !important;
    bottom: 200px !important;
    width: auto !important;
    max-height: 60vh !important;
    z-index: 160 !important;
  }

  /* 小游戏移动端样式已移至文件末尾媒体查询 */

  /* ===== 手机端欢迎页优化 ===== */
  .gate-card {
    padding: 16px 12px;
    width: 94vw;
  }

  /* 头像缩小 */
  .warp-avatar {
    width: 72px;
    height: 72px;
    margin-bottom: 10px;
  }

  /* 品牌名缩小 */
  .warp-brand {
    height: 24px;
    margin-bottom: 8px;
  }
  .gate-brand-text {
    font-size: 1.1rem !important;
  }

  /* 粒子标题高度减小 */
  .particle-title {
    height: 120px;
    margin-bottom: 16px;
  }

  /* 分隔线 */
  .gate-divider {
    display: block !important;
    width: 60% !important;
    max-width: 200px !important;
    height: 1px !important;
    margin: 10px auto !important;
    margin-left: auto !important;
    margin-right: auto !important;
    float: none !important;
  }

  /* 进入按钮缩小 */
  html:root .specular-btn {
    min-width: 180px;
    min-height: 44px;
    padding: 8px 28px;
    border-radius: 22px;
  }
  .specular-label {
    font-size: 0.9rem !important;
  }
  .gate-hint {
    font-size: 0.7rem !important;
    margin: 0 0 8px !important;
    opacity: 0.7;
  }

  /* 控制栏（主题） */
  .gate-controls {
    gap: 8px;
    margin-top: 10px;
  }
  .gate-theme-btn {
    font-size: 0.8rem !important;
    padding: 4px 8px !important;
  }

  /* 手机版弹窗内边距优化（限高覆盖见 html:root.is-phone .settings-modal，靠后放置） */
  .modal {
    padding: 20px 16px;
    border-radius: 16px;
  }
  .settings-modal-header {
    padding: 14px 16px 10px;
  }
  .settings-modal-body {
    padding: 0 16px 16px;
  }

  /* 手机版游戏区域 */
  .game-stage {
    max-width: 100%;
  }

  .container {
    padding-bottom: 100px;
  }

  /* 电脑端翻页控件（基线） */
  .quick-pagination {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 18px;
    flex-wrap: wrap;
    justify-content: center;
    /* 外层不要再画胶囊了（之前 border + background + padding 让 1-6 看起来像「嵌在胶囊里」），
       全部交给内层 el-button 画 */
  }

  /* 手机端翻页控件优化 */
  @media (max-width: 768px) {
  .quick-pagination {
    gap: 8px;
    margin-top: 14px;
    padding-top: 12px;
    flex-wrap: wrap;
  }
  .quick-pagination .page-btn {
    width: 32px;
    min-width: 32px;
    height: 32px;
    padding: 0;
    font-size: 1rem;
    border-radius: 50%;
  }
  .quick-pagination .page-numbers {
    gap: 4px;
  }
  .quick-pagination .page-num {
    min-width: 28px;
    height: 28px;
    padding: 0 6px;
    font-size: 0.78rem;
    border-radius: 6px;
  }
  .quick-pagination .page-jump {
    gap: 4px;
    height: 32px;
    margin-left: 4px;
  }
  .quick-pagination .page-jump input {
    width: 48px;
    height: 32px;
    padding: 0 6px;
    font-size: 0.75rem;
    border-radius: 16px;
  }
  .quick-pagination .page-jump-btn {
    width: auto !important;
    min-width: auto !important;
    padding: 0 10px !important;
    font-size: 0.72rem !important;
    height: 32px !important;
    border-radius: 16px !important;
  }
  } /* end @media */
}

/* 浮动运势按钮 */
.fortune-float {
  position: fixed;
  right: 24px;
  top: 24px;
  z-index: 95;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  background: rgba(10, 14, 20, 0.85);
  font-size: 1.25rem;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
  transition: transform 0.2s, box-shadow 0.2s;
  display: grid;
  place-items: center;
  animation: fortunePulse 2s ease-in-out infinite;
}
@keyframes fortunePulse {
  0%, 100% { box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45), 0 0 0 0 color-mix(in srgb, var(--accent) 40%, transparent); }
  50% { box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45), 0 0 0 8px color-mix(in srgb, var(--accent) 0%, transparent); }
}
.fortune-float:hover {
  transform: scale(1.1);
  box-shadow: 0 0 22px color-mix(in srgb, var(--accent) 35%, transparent);
}

/* 运势弹窗 */
.fortune-popup {
  position: fixed;
  right: 24px;
  top: 80px;
  z-index: 96;
  width: 280px;
  border-radius: 14px;
  background: rgba(9, 14, 20, 0.97);
  border: 1px solid color-mix(in srgb, var(--accent) 28%, transparent);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  animation: fortuneSlideDown 0.3s ease;
  overflow: hidden;
}
@keyframes fortuneSlideDown {
  from { opacity: 0; transform: translateY(-10px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.fortune-popup[hidden] {
  display: none;
}
.fortune-popup-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 15%, transparent);
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--accent);
}
.fortune-popup-close {
  background: none;
  border: none;
  color: var(--muted);
  font-size: 1.2rem;
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
  transition: color 0.2s;
}
.fortune-popup-close:hover {
  color: var(--accent);
}
.fortune-popup-body {
  padding: 14px 16px;
}
.fortune-popup-date {
  font-size: 0.75rem;
  color: var(--muted);
  text-align: center;
  margin-bottom: 10px;
}
.fortune-popup-overall {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 6%, transparent);
  margin-bottom: 10px;
}
.fortune-popup-overall span:first-child {
  font-size: 0.82rem;
  color: var(--text);
}
.fortune-popup-stars {
  color: #ffd700;
  font-size: 0.85rem;
  letter-spacing: 1px;
}
.fortune-popup-items {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 10px;
}
.fortune-popup-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.78rem;
  color: var(--muted);
}
.fortune-popup-item b {
  color: var(--accent);
  font-weight: 600;
}
.fortune-popup-lucky {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--muted);
  padding: 8px 0;
  border-top: 1px solid rgba(255,255,255,0.06);
  margin-bottom: 8px;
}
.fortune-popup-lucky b {
  color: var(--text);
  font-weight: 600;
}
.fortune-popup-tip {
  font-size: 0.78rem;
  color: var(--text);
  opacity: 0.85;
  line-height: 1.6;
  padding: 10px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 5%, transparent);
  border-left: 3px solid var(--accent);
  margin: 0;
}

/* ===== 原 src/styles/site/settings.css ===== */
/* ============================================================================
 * settings.css —— 背景星光 / 设置面板 / 设置弹窗
 *
 * 来源：原 src/styles/style.css 第 1615-2792 行，按分节边界原样切出，未改动一个字符。
 * 顺序敏感：本文件与 site/ 下其它片段共同构成全局样式，必须按 index.css 的
 *   顺序加载 —— 原站样式依赖源码书写顺序做层叠覆盖，调整顺序会造成样式回归。
 * ========================================================================== */

/* ===== 背景星光 ===== */
.star-field {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  overflow: hidden;
}

.star-dot {
  position: absolute;
  background: #ffe9a8;
  border-radius: 50%;
  box-shadow: 0 0 6px rgba(255, 233, 168, 0.8);
  animation: twinkle ease-in-out infinite;
}

@keyframes twinkle {
  0%, 100% { opacity: 0.15; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.25); }
}

/* ===== 设置面板 ===== */
/* ===== 设置弹窗 ===== */
/* ⚠️ 必须用 `html:root` 提权（(0,2,1) > .modal 的 (0,1,0)）。
   这一段原本只写 `.settings-modal`，与后面的通用 `.modal` **特异性相同**，
   而 `.modal` 排在文件更后面 → 它的 width:440px / padding:28px 26px /
   max-height:86vh 全部盖住了这里：
     · 面板实际只有 440px 宽（本意 520px）→ 行内容区只剩 304px，
       日文长标签被挤到折行
     · padding 28px 26px + body 的 18px 22px **叠加成双层留白**
     · max-height 变成 86vh（本意 min(88vh,720px)）
   这是「设置窗口排版看着乱」的一个直接原因。 */
/* 项目详情弹窗（2026-09-22 优化尺寸）：
   - width 用 % 而非模板里的 vw（vw 不随 zoom 缩，窄屏基准错）；
   - min-height 防止内容只有一两行时弹窗扁成一条（实测 700px 窗口仅 109px 高）。 */
html:root #projectModal.el-dialog {
  width: min(760px, 92%) !important;
  min-height: 300px;
  display: flex;
  flex-direction: column;
}
html:root #projectModal .el-dialog__body {
  flex: 1 1 auto;
}
html:root .settings-modal {
  width: min(520px, calc(100vw - 32px));
  /* 用 %（相对 .modal-overlay 的高度）而不是 vh：
     `vh` 不随 body 的 zoom 缩放，窄屏下会把弹窗压到屏幕高度的 ~30%，
     而 % 相对的是「已经被 zoom 缩过的 overlay」，比例才是对的。 */
  max-height: 88%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  border-radius: 18px;
}
/* 缩放版（is-phone，窗口 < 1280）弹窗限高 76%：88% 在矮窗口下几乎顶满全屏
   （2026-09-22 用户反馈「窗口变小后弹窗拉太长」）。特异性 (0,3,1) > base，无需 !important；
   body 自带滚动，内容不会被截断。 */
html:root.is-phone .settings-modal {
  max-height: 76%;
}
.settings-modal-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px 14px;
  background: inherit;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
}
.settings-modal-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.settings-modal .modal-close {
  position: static;
  margin: 0;
}
.settings-modal-title {
  font-size: 1.25rem;
  color: var(--accent);
  margin: 0;
}
.settings-modal-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 18px 22px 28px;
  overflow-y: auto;
  /* 隐藏滚动条但保留滚动 */
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.settings-modal-body::-webkit-scrollbar {
  display: none;
}
.settings-modal-body .settings-group {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 16px 18px;
}
.settings-modal-body .settings-group h3 {
  font-size: 1rem;
  margin-bottom: 14px;
  color: var(--text);
  border-bottom: 1px solid var(--border);
  padding-bottom: 8px;
}

/* ==========================================================================
 * 设置面板：统一的「标签 + 控件」两列行（2026-09-21 重构）
 *
 * 背景：这一块原来用的是 Element Plus 的 el-radio-group / el-select /
 *   el-switch / el-slider，实测三个问题（有截图为证）：
 *     ① el-radio-button 渲染成一排**没加样式的原生圆点**，跟旁边的胶囊按钮不是一套语言
 *     ② 行高在 36 / 40 / 44 / 48 之间跳（每种控件的默认高度都不同）
 *     ③ 开关靠右、分段控件居中 —— 左右两条竖线都对不齐
 *
 * 现在控件全部换原生元素（与 AuthPanel / 管理台同一套），行结构统一：
 *   <div class="settings-row"><span class="settings-label">…</span>
 *     <span class="settings-ctrl">…</span></div>
 * 控件一律 **贴右对齐**（margin-left:auto），行高统一 34px。
 * ========================================================================== */
.settings-row {
  display: flex;
  align-items: center;
  gap: 12px;
  box-sizing: border-box;
  min-height: 36px;
  font-size: 0.9rem;
  color: var(--text);
}
/* 面板里的分段控件/下拉统一 28px 高 —— 原来每种控件默认高度不同，
   行高在 34/36/37/39 之间跳，看起来「不齐」。 */
.settings-group .seg {
  height: 28px;
  box-sizing: border-box;
  align-items: center;
  padding: 3px;
}
.settings-group .seg-btn {
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  line-height: 1;
}
.settings-label {
  flex: 0 1 auto;
  min-width: 0;
  line-height: 1.35;
}
.settings-ctrl {
  flex: 0 0 auto;
  margin-left: auto;          /* 控件一律贴右，形成一条竖线 */
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;           /* 与分段控件等高 —— 窄屏标签换行时行高才一致 */
}
/* 语言胶囊也压到 28px，跟同一面板里的其他控件同高 */
html:root .settings-group .lang-switcher { height: 28px; }
/* 需要吃掉剩余宽度的行（语言下拉 / 滑条） */
.settings-row--fill .settings-ctrl,
.settings-ctrl--grow { flex: 1 1 auto; }
/* 纯按钮行（重置配置）：按钮贴右 */
.settings-row--action { justify-content: flex-end; }

/* 原生下拉（配色方案） */
.settings-select {
  appearance: none;
  -webkit-appearance: none;
  background-color: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 10px;
  height: 28px;
  box-sizing: border-box;
  padding: 0 30px 0 12px;
  font-size: 13px;
  font-family: inherit;
  line-height: 1;
  cursor: pointer;
  min-width: 172px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238aa' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 11px center;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.settings-select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(79, 240, 208, 0.18);
}
.settings-select option { background: var(--bg); color: var(--text); }

/* 原生滑条（背景遮罩）
   ⚠️ 必须自己画轨道：Chrome 的默认 range 轨道用的是 **currentColor** 系的颜色，
   在浅色主题下 `--text` 是很深的墨绿 → 未填充的那半截渲染成一条**黑杠**（有截图为证）。
   这里显式画轨道，并用 --fill（模板里按当前值算出来的百分比）画出已填充部分，
   于是不用 accent-color 也能有「左填充 / 右空槽」的观感，且深浅主题都跟随变量。 */
.settings-range {
  flex: 1 1 auto;
  min-width: 0;
  height: 20px;
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  cursor: pointer;
}
.settings-range::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    var(--accent) 0 var(--fill, 50%),
    color-mix(in srgb, var(--text) 16%, transparent) var(--fill, 50%) 100%
  );
}
.settings-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 15px;
  height: 15px;
  margin-top: -4.5px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid var(--bg);
  box-shadow: 0 0 8px color-mix(in srgb, var(--accent) 45%, transparent);
}
.settings-range::-moz-range-track {
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    var(--accent) 0 var(--fill, 50%),
    color-mix(in srgb, var(--text) 16%, transparent) var(--fill, 50%) 100%
  );
}
.settings-range::-moz-range-thumb {
  width: 15px;
  height: 15px;
  border: 2px solid var(--bg);
  border-radius: 50%;
  background: var(--accent);
}
.settings-range:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; border-radius: 999px; }

/* 面板内的原生输入框（账号安全：改名 / 改密）。
   用站点变量上色 → 深浅主题自动跟随（auth-input 是给深色登录卡硬编码的，不适用）。 */
.settings-input {
  width: 100%;
  box-sizing: border-box;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text);
  font-size: 0.88rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.settings-input::placeholder { color: color-mix(in srgb, var(--text) 35%, transparent); }
.settings-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent);
}

/* 面板内的原生按钮 */
.settings-btn {
  font-family: inherit;
  font-size: 12.5px;
  padding: 6px 14px;
  border-radius: 9px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s, background 0.2s;
}
.settings-btn:hover { border-color: var(--accent); color: var(--accent); }
.settings-btn--danger {
  border-color: color-mix(in srgb, #f87171 45%, transparent);
  background: color-mix(in srgb, #f87171 8%, transparent);
  color: #f87171;
}
.settings-btn--danger:hover {
  background: color-mix(in srgb, #f87171 16%, transparent);
  border-color: #f87171;
  color: #fca5a5;
}

/* 访客统计那一行（原来无条件占一行，关掉统计后还留空白） */
.settings-group .visitor-line[hidden] { display: none; }

/* 数据管理：三个按钮等宽三等分（原来 .data-grid 想用两列网格，
   但后面那条 `.data-actions{display:flex}` 把 display 覆盖掉了，
   结果是靠 flex-wrap 自然换行 —— 宽度参差）。特异性 (0,3,0) 高于 .data-actions。 */
.settings-group .data-actions.data-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.settings-group .data-actions.data-grid .settings-btn {
  width: 100%;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 账号安全：按钮行与输入框之间的间距 */
.settings-group .auth-field + .settings-row--action { margin-top: 10px; }
.settings-group .settings-row--action + .auth-field { margin-top: 14px; }
.settings-group .auth-msg { text-align: left; }

.settings-group {
  padding: 14px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.settings-group:last-child {
  border-bottom: none;
}

.settings-group h3 {
  font-size: 0.82rem;
  color: var(--accent);
  letter-spacing: 1px;
  margin: 0 0 12px;
  text-transform: uppercase;
}

/* 开关行 */
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  cursor: pointer;
  font-size: 0.92rem;
  color: var(--text);
}

/* 统一开关（home / about / admin 共用）。
   结构：<el-input class="switch-input" /> + <span class="switch"></span>（兄弟关系，input 在前）。
   原生控件折叠为 0x0 并隐藏，点击由外层 label 承接；键盘焦点环画在视觉开关上。 */
.switch-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  appearance: none;
  -webkit-appearance: none;
}

.switch {
  position: relative;
  width: 44px;
  height: 24px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  transition: background 0.25s;
  flex-shrink: 0;
}

.switch::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.25s;
}

.switch-input:checked + .switch {
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
}

.switch-input:checked + .switch::after {
  transform: translateX(20px);
}

/* 键盘聚焦可见：0x0 原生控件不可见，故把焦点环画在视觉开关上 */
.switch-input:focus-visible + .switch {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

/* 只读态（管理员查看站长设置时）：置灰、禁止改 */
.cfg-readonly .switch,
.cfg-readonly .switch-input { cursor: not-allowed; }
.cfg-readonly .switch { opacity: 0.45; }

/* 滑条行 */
.range-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  font-size: 0.92rem;
  color: var(--text);
}

.range-row > span:first-child {
  min-width: 84px;
}

.range-row input[type="range"] {
  flex: 1;
  accent-color: var(--accent);
  min-width: 0;
}

.range-val {
  min-width: 44px;
  text-align: right;
  font-size: 0.8rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

/* 分段按钮 */
.seg {
  display: inline-flex;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 999px;
  padding: 3px;
  gap: 2px;
}

.seg-btn {
  border: none;
  background: none;
  color: var(--muted);
  font-size: 0.82rem;
  font-family: inherit;
  padding: 5px 14px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.2s;
}

.seg-btn.active {
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: #022;
  font-weight: 700;
}

/* 数据管理按钮网格 */
.data-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.data-btn {
  width: 100%;
  padding: 12px 14px;
  font-size: 0.85rem;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.25s ease;
  white-space: nowrap;
}

.data-btn:hover {
  transform: translateY(-2px);
}

.data-btn:active {
  transform: translateY(0);
}

/* 数据操作按钮 */
.data-actions {
  display: flex;
}

.btn-ghost:hover {
  background: color-mix(in srgb, var(--accent) 18%, transparent);


}
.btn-danger:hover {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}

/* 修改密码按钮（账号安全）：渐变色取自 CSS 变量，随主题/配色方案自动变化 */
.btn-primary {
  width: 100%;
  margin-top: 14px;
  padding: 11px;
  border: none;
  border-radius: 11px;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: #022;
  font-size: 0.92rem;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  letter-spacing: 2px;
  transition: transform 0.15s, box-shadow 0.2s, opacity 0.2s;
  box-shadow: 0 4px 18px color-mix(in srgb, var(--accent) 25%, transparent);

}
.btn-primary:active {
  transform: translateY(0);


/* 设置面板内账号安全的输入框，与主题玻璃拟态统一（含浏览器自动填充场景） */
}
.settings-group .auth-input {
  background: var(--surface);
  border-color: var(--border);
  color: var(--text);
}
.settings-group .auth-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
}
/* 密码管理器自动填充时强制跟随主题，避免白底黄底破坏观感 */
.settings-group .auth-input:-webkit-autofill,
.settings-group .auth-input:-webkit-autofill:hover,
.settings-group .auth-input:-webkit-autofill:focus {
  -webkit-text-fill-color: var(--text);
  -webkit-box-shadow: 0 0 0 1000px var(--surface) inset;
  transition: background-color 9999s ease-in-out 0s;
  caret-color: var(--text);
}
html[data-theme="light"] .settings-group .auth-input {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(28, 75, 50, 0.15);
  color: #1a2e22;
}
html[data-theme="light"] .settings-group .auth-input:focus {
  border-color: #2d7a5a;
  box-shadow: 0 0 0 3px rgba(45, 122, 90, 0.14);
}
html[data-theme="light"] .settings-group .auth-input:-webkit-autofill,
html[data-theme="light"] .settings-group .auth-input:-webkit-autofill:hover,
html[data-theme="light"] .settings-group .auth-input:-webkit-autofill:focus {
  -webkit-text-fill-color: #1a2e22;
  -webkit-box-shadow: 0 0 0 1000px #f4faf5 inset;
  caret-color: #1a2e22;
}
/* 账号安全区的字段标签颜色跟随主题 */
.settings-group .auth-field label {
  color: var(--muted);
}
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(2, 8, 6, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  animation: fadeIn 0.2s ease;
}

.modal-overlay[hidden] {
  display: none;
}

.modal {
  position: relative;
  width: min(440px, 100%);
  /* ⚠️ 用 %（相对 .modal-overlay 这个 fixed 容器）而不是 vh。
     `vh` 不随 body 的 zoom 缩放 —— 窄屏（zoom≈0.31）时 86vh 的视觉高度只有
     屏幕的 27%，弹窗被压成一条小条，与「等比缩放」的设计相矛盾。
     % 相对的是已经被 zoom 缩过的 overlay，比例才对。 */
  max-height: 86%;
  overflow-y: auto;
  background: rgba(9, 14, 20, 0.96);
  border: 1px solid color-mix(in srgb, var(--accent) 28%, transparent);
  border-radius: 20px;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  padding: 28px 26px;
  animation: modalIn 0.28s ease;
}
/* ---- 顶号通知弹窗（账号在别处登录，本设备被下线） ---- */
.session-kick-modal,
.conflict-modal {
  position: relative;
  overflow: hidden;
  max-width: 380px;
  padding: 36px 32px 30px;
  text-align: center;
  background: linear-gradient(165deg, rgba(32, 38, 48, 0.98) 0%, rgba(21, 26, 34, 0.98) 100%);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 18px;
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  animation: modalPop 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.session-kick-modal::before,
.conflict-modal::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
}
@keyframes modalPop {
  from { opacity: 0; transform: translateY(16px) scale(0.95); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.session-kick-icon,
.conflict-icon {
  width: 54px;
  height: 54px;
  margin: 0 auto 16px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(255, 178, 54, 0.14);
  border: 1px solid rgba(255, 178, 54, 0.38);
  color: #ffc46b;
  animation: kickPulse 2.4s ease-in-out infinite;
}
@keyframes kickPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 178, 54, 0.28); }
  50%      { box-shadow: 0 0 0 9px rgba(255, 178, 54, 0); }
}
.session-kick-title,
.conflict-title {
  margin: 0 0 8px;
  font-size: 1.12rem;
  font-weight: 700;
  letter-spacing: 0.4px;
  color: rgba(255, 255, 255, 0.95);
}
.session-kick-desc,
.conflict-desc {
  margin: 0 0 24px;
  font-size: 0.86rem;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.6);
}
.session-kick-ok,
.conflict-ok {
  padding: 11px 36px;
  border-radius: 999px;
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  letter-spacing: 1px;
  cursor: pointer;
  border: none;
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 72%, transparent));
  color: #06121a;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--accent) 26%, transparent);
  transition: all 0.25s ease;
}
.session-kick-ok:hover,
.conflict-ok:hover {
  transform: translateY(-2px);
  filter: brightness(1.08);
  box-shadow: 0 12px 32px color-mix(in srgb, var(--accent) 40%, transparent);
}
html[data-theme="light"] .session-kick-modal,
html[data-theme="light"] .conflict-modal {
  background: linear-gradient(165deg, rgba(222, 240, 229, 0.99) 0%, rgba(198, 226, 210, 0.99) 100%);
  border-color: rgba(28, 75, 50, 0.18);
  box-shadow: 0 30px 90px rgba(30, 70, 50, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.5);
}
html[data-theme="light"] .session-kick-title,
html[data-theme="light"] .conflict-title { color: #16301f; }
html[data-theme="light"] .session-kick-desc,
html[data-theme="light"] .conflict-desc { color: #4a6b55; }
html[data-theme="light"] .session-kick-icon,
html[data-theme="light"] .conflict-icon {
  background: rgba(255, 165, 50, 0.16);
  border-color: rgba(255, 150, 40, 0.4);
  color: #b06000;
}

/* ---- 登录冲突确认弹窗：按钮组 ---- */
.conflict-buttons {
  display: flex;
  justify-content: center;
  gap: 12px;
}
.conflict-btn {
  padding: 11px 26px;
  border-radius: 999px;
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s ease;
}
.conflict-cancel {
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.72);
}
.conflict-cancel:hover {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.95);
}
html[data-theme="light"] .conflict-cancel {
  border-color: rgba(0, 0, 0, 0.14);
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.66);
}
html[data-theme="light"] .conflict-cancel:hover {
  background: rgba(0, 0, 0, 0.09);
  color: #000;
}

.modal-close {
  position: sticky;
  top: 14px;
  margin-left: auto;
  display: block;
  z-index: 10;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: var(--text);
  font-size: 0.9rem;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.modal-close:hover {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
}

/* 资源详情 */
.detail-top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.detail-icon {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  font-size: 1.8rem;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border: 1px solid var(--border);
}
.detail-icon svg { width: 40px; height: 40px; }
.quick-icon svg { display: block; }
/* 取消快捷网页的添加与删除功能 */
#addQuickBtn { display: none !important; }
.quick-card .item-del { display: none !important; }
/* 取消资源分享的添加与删除功能 */
#addResBtn { display: none !important; }
.resource-card .item-del { display: none !important; }

.detail-category {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 5px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
  border: 1px solid color-mix(in srgb, var(--accent) 18%, transparent);
}

.detail-modal {
  max-width: 420px;
}
.detail-modal h2 {
  font-size: 1.3rem;
  margin-bottom: 10px;
}

.detail-desc {
  color: var(--muted);
  font-size: 0.95rem;
  line-height: 1.7;
  margin-bottom: 16px;
}

.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 22px;
}

.detail-visit {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 11px 22px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: #022;
  font-weight: 700;
  text-decoration: none;
  transition: transform 0.2s, box-shadow 0.2s;
}

.detail-visit:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 20px color-mix(in srgb, var(--accent) 40%, transparent);
}

/* ⚠️ 历史说明：原站有两份同名 @keyframes modalIn（settings.css 8px/0.97 与
 * player.css 18px/0.96），同名整块替换、靠后者生效，实际一直是 18px/0.96。
 * 两份副本均已删除，此处为唯一存活定义，值不变。 */
@keyframes modalIn {
  from { opacity: 0; transform: translateY(18px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }


}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ===== 移动端：导航栏改为顶部横条 ===== */
@media (max-width: 768px) {
  .fortune-float {
    width: 40px !important;
    height: 40px !important;
    right: 18px !important;
    top: auto !important;
    bottom: 145px !important;
    left: auto !important;
    position: fixed !important;
    font-size: 1.1rem !important;
    z-index: 160 !important;
  }
  @media (max-width: 768px) {
    /* body 改 padding-left: 0 是为旧版"手机端堆叠布局"用的 —— 缩放版下会盖掉 body
       让位给 fixed nav 的 190px padding，导致 main 被 nav 盖住（错位根因）。删掉。 */

/* 左侧导航：窄屏**不再**改成顶部横条 / 汉堡菜单 —— 用户要求始终「左导航 + 右内容」。
   （原来这里有一整套 .side-nav{width:100%} + .nav-header + .nav-brand 的小屏覆盖，已删除） */
  }


  /* 用户要求：**始终「左侧导航 + 右侧内容」**，不要「收起 + 汉堡全屏菜单」这种排版。
     所以窄屏下 nav 也照常显示（不再 display:none + .open 展开）。 */
  .nav-items {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: 8px;
    overflow: visible;
  }
  /* 手机端导航打开时隐藏滚动条，但保留滑动功能 */
  .nav-items {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .nav-items::-webkit-scrollbar {
    width: 0;
    height: 0;
    display: none;
  }

  .nav-divider {
    margin: 6px;
  }

  /* 手机端页脚联系方式：缩小一行放下 */
  .footer-contacts {
    gap: 10px;
    margin-bottom: 12px;
  }

  .footer-contacts .contact-icon-only {
    width: 28px;
    height: 28px;
    font-size: 0.9rem;
  }

  .footer-contacts .contact-icon-only svg {
    width: 15px;
    height: 15px;
  }

  .site-footer {
    padding: 10px 12px 24px;
  }
  .site-footer .donate-btn {
    margin-bottom: 12px;
  }

  /* 展开时导航栏有阴影 */
  .side-nav:has(.nav-items.open) {
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  }


/* ===== 原 src/styles/site/gate.css ===== */
/* ============================================================================
 * gate.css —— 欢迎页（Gate）/ 退出与进入过渡动画
 *
 * 来源：原 src/styles/style.css 第 2793-3292 行，按分节边界原样切出，未改动一个字符。
 * 顺序敏感：本文件与 site/ 下其它片段共同构成全局样式，必须按 index.css 的
 *   顺序加载 —— 原站样式依赖源码书写顺序做层叠覆盖，调整顺序会造成样式回归。
 * ========================================================================== */

/* ===== 欢迎页面 ===== */
}
html:not(.site-open) {
  overflow: hidden;
  height: 100%;
}

#gate {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  overflow: hidden;
  animation: gateFade 0.5s ease both;
}

#gate::before {
  content: "";
  position: absolute;
  inset: -30px;
  /* 回退：不支持 image-set 的老浏览器继续用原 JPG */
  background: url('/assets/bg.jpg') center/cover no-repeat;
  /* 这一层叠了 blur(28px) + brightness(.45)，原图的细节早已被抹平，
     用 480×270 的 WebP（15.6KB）与 1920 原图（180.7KB）视觉无从分辨。
     欢迎页首屏的图片开销基本由这一张决定。 */
  background-image: image-set(
    url("/assets/bg-blur.webp") type("image/webp"),
    url("/assets/bg.jpg") type("image/jpeg")
  );
  filter: blur(28px) brightness(0.45) saturate(1.1);
  transform: scale(1.08);
  z-index: 0;
}

#gate::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(6, 18, 14, 0.3), rgba(6, 18, 14, 0.5));
  z-index: 0;
}

/* ===== 主站进入动画 ===== */
html:not(.site-open) .bg-layer,
html:not(.site-open) .overlay,
html:not(.site-open) .star-field,
html:not(.site-open) .side-nav,
html:not(.site-open) .site-header {
  opacity: 0;
}

/* 欢迎页的 .bg-layer 被 #gate（position:fixed / z-index:9999）整屏盖住，
   自身又是 opacity:0 —— 下载它的背景图纯属浪费（实测 93.5KB）。
   这里直接跳过；主站（site-open）才需要它，按需加载即可。

   注：曾试过在这一层配 <link rel="prefetch"> 预热主站背景，但 prefetch 是
   全局的，会让 privacy 这种根本不含 .bg-layer 的页面也白下 93.5KB
   （实测该页从 100KB 涨到 195KB），得不偿失，故改为纯按需。 */
html:not(.site-open) .bg-layer { background-image: none; }

@keyframes mainFadeIn {
  from { opacity: 0; }
  /* 修复：原来 to 写死 opacity:1，配 `both` 填充会把元素的行内 opacity 永久压成 1
     （动画级联高于行内样式）→ 设置面板的「星空开关」「遮罩透明度」全部失效。
     现在 to 值走 --fade-to（各元素自带，缺省 1），填充值跟随实时设置。 */
  to { opacity: var(--fade-to, 1); }
}
@keyframes mainSlideLeft {
  from { opacity: 0; transform: translateX(-20px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes mainSlideDown {
  from { opacity: 0; transform: translateY(-15px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes mainSlideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

html.site-open .bg-layer { animation: mainFadeIn 0.4s ease-out 0.02s both; }
html.site-open .overlay { animation: mainFadeIn 0.4s ease-out 0.04s both; }
html.site-open .star-field { animation: mainFadeIn 0.5s ease-out 0.06s both; }
html.site-open .side-nav { animation: mainSlideLeft 0.4s ease-out 0.08s both; }
html.site-open .site-header { animation: mainSlideDown 0.4s ease-out 0.1s both; }
html.site-open .container { animation: mainSlideUp 0.5s ease-out 0.12s both; }

/* 兜底：进入站点后内容强制可见 */
html.site-open .container,
html.site-open .site-header {
  opacity: 1;
}

html.site-open #gate {
  display: none;
}

@keyframes gateFade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.gate-card {
  position: relative;
  z-index: 1;
  width: min(960px, 92vw);
  padding: 20px;
  text-align: center;
  color: #e9edf6;
  animation: gateCardIn 0.6s ease 0.05s both;
}

@keyframes gateCardIn {
  from { opacity: 0; transform: translateY(20px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes gateFadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes gateFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.warp-avatar {
  animation: gateFadeUp 0.5s ease 0.15s both;
}
.warp-brand {
  animation: gateFadeUp 0.5s ease 0.28s both;
}
.particle-title {
  animation: gateFadeIn 0.6s ease 0.4s both;
}
.gate-divider {
  animation: gateFadeIn 0.6s ease 0.5s both;
}
.captcha {
  animation: gateFadeUp 0.5s ease 0.6s both;
}
.gate-hint {
  animation: gateFadeIn 0.5s ease 0.82s both;
}

/* 欢迎页控制栏（主题） */
.gate-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 14px;
  animation: gateFadeIn 0.5s ease 0.9s both;
}
/* 语言下拉与同一行的「主题切换」胶囊对齐。
 * 两个问题（实测）：
 *   1. 高度不等 —— 主题分段 32.41px（3px padding + 1px border + 24.41px 按钮），
 *      语言下拉 31px（6px padding + 13px 字号 + 1px border），居中后上下各差 0.7px；
 *   2. 圆角不同 —— 主题分段是胶囊（999px），语言下拉是 10px 圆角矩形，并排显得不是一个体系。
 * 用 align-self: stretch + height: 100% 让语言下拉直接取行高，避免写死 32.41 这种小数；
 * 圆角与内边距按胶囊重算（右侧留出箭头的位置）。
 * ⚠️ 注意：原先注释写「设置面板里保持组件默认值即可」—— 那是**原生 <select> 时代**的判断。
 *    换成 el-select 后原生规则全部失效，设置面板那个反而没样式了。
 *    现在胶囊样式已下放到 LanguageSwitcher.vue 组件自身，两个地方都生效。
 * ⚠️ 选择器必须写成 `.gate-controls .lang-switcher .lang-switcher__select`（三层）。
 *    组件自己的规则是 `.lang-switcher .lang-switcher__select`（两层），而 lang-switcher.css
 *    在**路由分包**里、比入口的 gate.css 后加载 —— 同特异性下后者胜，两层写法会被它盖掉。
 *    多一层祖先前缀把特异性抬到 (0,3,0)，才能稳定生效。 */
.gate-controls .lang-switcher {
  align-self: stretch;
}
.gate-controls .lang-switcher .lang-switcher__select {
  height: 100%;
  border-radius: 999px;
  padding: 0 28px 0 14px;
}
.gate-theme-seg {
  display: inline-flex;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  padding: 3px;
  gap: 2px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
}
.gate-theme-btn {
  border: none;
  background: none;
  color: rgba(255, 255, 255, 0.6);
  font-family: inherit;
  font-weight: 600;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.2s;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.9rem;
  padding: 5px 10px;
}
.gate-theme-btn:hover {
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.06);
}
.gate-theme-btn.active {
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 90%, transparent), color-mix(in srgb, var(--accent-2) 90%, transparent));
  color: #022;
  box-shadow: 0 2px 10px color-mix(in srgb, var(--accent) 30%, transparent);
}

/* 浅色模式下欢迎页控制栏 */
html[data-theme="light"] .gate-theme-seg {
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(45, 122, 90, 0.2);
}
html[data-theme="light"] .gate-theme-btn {
  color: rgba(26, 46, 34, 0.6);
}
html[data-theme="light"] .gate-theme-btn:hover {
  color: rgba(26, 46, 34, 0.9);
  background: rgba(45, 122, 90, 0.08);
}

.warp-avatar {
  position: relative;
  width: 88px;
  height: 88px;
  margin: 0 auto 14px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid color-mix(in srgb, var(--accent) 40%, transparent);
  box-shadow: 0 0 24px color-mix(in srgb, var(--accent) 25%, transparent);
  cursor: pointer;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}
.warp-avatar:hover {
  transform: scale(1.12);
  box-shadow: 0 0 32px color-mix(in srgb, var(--accent) 50%, transparent);
}
.warp-avatar:active {
  transform: scale(1.05);
}

/* 头像查看大图弹窗 */
.avatar-viewer {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.avatar-viewer[hidden] {
  display: none;
}
.avatar-viewer-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  animation: fadeIn 0.25s ease;
}
.avatar-viewer-content {
  position: relative;
  z-index: 1;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  animation: avatarPopIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes avatarPopIn {
  from { opacity: 0; transform: scale(0.8); }
  to { opacity: 1; transform: scale(1); }
}
.avatar-viewer-close {
  position: absolute;
  top: -12px;
  right: -12px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid color-mix(in srgb, var(--accent) 40%, transparent);
  background: rgba(10, 14, 20, 0.95);
  color: var(--accent);
  font-size: 1.3rem;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: all 0.2s;
  z-index: 2;
}
.avatar-viewer-close:hover {
  transform: rotate(90deg) scale(1.1);
  box-shadow: 0 0 16px color-mix(in srgb, var(--accent) 40%, transparent);
}
.avatar-viewer-img {
  max-width: min(420px, 85vw);
  max-height: min(420px, 70vh);
  width: auto;
  height: auto;
  border-radius: 20px;
  border: 3px solid color-mix(in srgb, var(--accent) 50%, transparent);
  box-shadow: 0 0 40px color-mix(in srgb, var(--accent) 30%, transparent), 0 20px 60px rgba(0, 0, 0, 0.5);
  object-fit: contain;
}
.avatar-viewer-actions {
  display: flex;
  gap: 12px;
}
.avatar-viewer-save {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 24px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: #022;
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.25s;
  box-shadow: 0 4px 16px color-mix(in srgb, var(--accent) 30%, transparent);
}
.avatar-viewer-save:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 24px color-mix(in srgb, var(--accent) 50%, transparent);
}
.avatar-viewer-save:active {
  transform: translateY(0);
}
.warp-avatar .warp-original {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.warp-brand {
  position: relative;
  width: 100%;
  height: 30px;
  margin: 0 0 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.warp-brand .warp-original {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--accent);
  text-shadow: 0 0 20px color-mix(in srgb, var(--accent) 30%, transparent);
}

/* WebGL 初始化成功后隐藏原始内容 */
.warp-ready .warp-original {
  display: none;
}

.particle-title {
  width: 100%;
  height: 192px;
  margin: 0 0 32px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.particle-title__canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.gate-sub {
  margin: 0 0 22px;
  font-size: 13px;
  color: var(--soft);
  line-height: 1.7;
}

.captcha {
  user-select: none;
  -webkit-user-select: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

html:root .specular-btn {
  position: relative;
  width: auto;
  min-width: 220px;
  min-height: 52px;
  padding: 10px 36px;
  border-radius: 26px;
  background: rgba(14, 48, 36, 0.55);
  backdrop-filter: blur(12px) saturate(130%);
  -webkit-backdrop-filter: blur(12px) saturate(130%);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.3;
  box-sizing: border-box;
  /* overflow 必须 visible：内部 .specular-fx 是 inset:-20px 的光晕层，hidden 会裁掉光晕 */
  overflow: visible;
  color: var(--text);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
html:root .specular-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 40px color-mix(in srgb, var(--accent) 18%, transparent), inset 0 1px 0 rgba(255, 255, 255, 0.12);
}
html:root .specular-btn:active {
  transform: translateY(0) scale(0.98);
}
html:root .specular-btn:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 70%, transparent);
  outline-offset: 2px;
}
.specular-fx {
  position: absolute;
  inset: -20px;
  width: calc(100% + 40px);
  height: calc(100% + 40px);
  pointer-events: none;
  z-index: 1;
}
.specular-label {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.gate-btn-cn {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 2px;
  line-height: 1.2;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.gate-divider {
  width: 60%;
  max-width: 320px;
  height: 1px;
  margin: 0 auto 28px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 40%, transparent), transparent);
}

.gate-hint {
  margin: 12px 0 0;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  letter-spacing: 0.5px;
}

/* ===== 原 src/styles/site/home.css ===== */
/* ============================================================================
 * home.css —— 区块通用 / 快捷网页卡片与详情 / 表单弹窗
 *
 * 来源：原 src/styles/style.css 第 3293-3744 行，按分节边界原样切出，未改动一个字符。
 * 顺序敏感：本文件与 site/ 下其它片段共同构成全局样式，必须按 index.css 的
 *   顺序加载 —— 原站样式依赖源码书写顺序做层叠覆盖，调整顺序会造成样式回归。
 * ========================================================================== */

/* ===== 区块通用 ===== */
.section-block {
  padding: 22px 24px;
  margin-bottom: 26px;
  scroll-margin-top: 84px;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}
.section-head h2 {
  font-size: 20px;
  font-weight: 600;
  color: var(--title);
  letter-spacing: 0.5px;
}
.section-sub {
  margin: -6px 0 16px;
  color: var(--soft);
  font-size: 13px;
}
.section-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
/* 留言板排序切换 */
.msg-sort { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.sort-btn {
  border: 1px solid rgba(139, 148, 163, 0.35);
  background: transparent;
  color: var(--soft);
  font-size: 0.78rem;
  padding: 3px 12px;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s;
}
.sort-btn:hover { border-color: color-mix(in srgb, var(--accent) 50%, transparent); color: var(--accent); }
.sort-btn.active {
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
html[data-theme="light"] .sort-btn { color: #5a6a5f; border-color: rgba(45, 122, 90, 0.3); }
html[data-theme="light"] .sort-btn:hover { border-color: rgba(45, 122, 90, 0.55); color: #2d7a5a; }
html[data-theme="light"] .sort-btn.active { border-color: rgba(45, 122, 90, 0.5); color: #2d7a5a; background: rgba(45, 122, 90, 0.08); }
/* 留言板/反馈收纳展开按钮 */
.msg-collapse-btn {
  display: block;
  margin: 14px auto 0;
  border: 1px dashed rgba(139, 148, 163, 0.4);
  background: transparent;
  color: var(--soft);
  font-size: 0.8rem;
  padding: 6px 18px;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s;
}
.msg-collapse-btn:hover { border-color: var(--accent); color: var(--accent); }
html[data-theme="light"] .msg-collapse-btn { border-color: rgba(45, 122, 90, 0.35); color: #5a6a5f; }
html[data-theme="light"] .msg-collapse-btn:hover { border-color: #2d7a5a; color: #2d7a5a; }
/* 留言板/反馈抽屉翻页栏 */
.msg-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 14px auto 0;
  flex-wrap: wrap;
}
.msg-pager .pager-btn {
  border: 1px solid rgba(139, 148, 163, 0.35);
  background: transparent;
  color: var(--soft);
  font-size: 0.78rem;
  padding: 3px 12px;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s;
}
.msg-pager .pager-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.msg-pager .pager-btn:disabled { opacity: 0.4; cursor: default; }
.msg-pager .pager-info { font-size: 0.78rem; color: var(--soft); }
html[data-theme="light"] .msg-pager .pager-btn { color: #5a6a5f; border-color: rgba(45, 122, 90, 0.3); }
html[data-theme="light"] .msg-pager .pager-btn:hover:not(:disabled) { border-color: #2d7a5a; color: #2d7a5a; }
html[data-theme="light"] .msg-pager .pager-info { color: #5a6a5f; 
}
.btn-add:hover {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  border-color: var(--accent);
}
.block-empty {
  color: var(--soft);
  font-size: 13px;
  padding: 16px 4px;
}

/* ===== 快捷网页（卡片 + 详情，风格对齐资源下载） ===== */
.quick-grid {
  display: grid;
  /* 强制 4 列（用户要求一行 4 个）—— 不用抽屉折叠、不换行 */
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}
.quick-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.quick-pagination[hidden] {
  display: none;
}
.page-btn {
  width: 36px;
  min-width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
  font-size: 1.2rem;
  font-family: inherit;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: all 0.2s;
  line-height: 1;
  white-space: nowrap;
}
.page-btn:hover:not(:disabled) {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
}
.page-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.page-numbers {
  display: flex;
  align-items: center;
  gap: 6px;
}
.page-num {
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.04);
  color: var(--muted);
  font-size: 0.85rem;
  font-family: inherit;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: all 0.2s;
  font-variant-numeric: tabular-nums;
}
.page-num:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}
.page-num.active {
  border-color: var(--accent);
  background: var(--accent);
  color: #062018;
  font-weight: 700;
}

/* 跳转输入框 */
.page-jump {
  display: flex;
  align-items: center;
  gap: 0;  /* 无 gap，让 input 和 button 无缝拼接成一个胶囊 */
  height: 36px;  /* 与 .page-btn（36px 圆形翻页钮）统一高度 —— 2026-09-21 修复高矮不齐 */
  margin-left: 8px;
  /* 整个 .page-jump 是「单一外框胶囊」—— 内部 input/button 去掉自己的边框 */
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.04);
  border-radius: 18px;
  overflow: hidden;  /* 让 input/button 的圆角被外框裁掉 */
}
.page-jump input {
  width: 60px;
  height: 36px;
  padding: 0 10px;
  /* 去掉自己的边框和圆角 —— 由外层 .page-jump 统一管理 */
  border: none !important;
  background: transparent !important;
  border-radius: 0 !important;
  color: var(--text);
  font-size: 0.85rem;
  font-family: inherit;
  text-align: center;
  outline: none;
  transition: all 0.2s;
}
.page-jump input:focus {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}
.page-jump input::placeholder {
  color: var(--muted);
  opacity: 0.6;
}
/* 跳转按钮（2026-09-21 起为原生 <button class="page-jump-btn">，id 保留 #quickJumpBtn/#resJumpBtn）。
   高度吃满胶囊（36px），与两侧圆形翻页钮对齐。 */
.page-jump .page-jump-btn {
  height: 36px;  /* 超出胶囊内容区的部分被 overflow:hidden 裁掉，视觉与 36px 圆形翻页钮齐高 */
  padding: 0 14px;
  font-size: 0.8rem;
  font-family: inherit;
  border: none;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}
.page-jump .page-jump-btn:hover {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
}
/* 隐藏number输入框的上下箭头 */
.page-jump input::-webkit-outer-spin-button,
.page-jump input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.page-jump input[type="number"] {
  -moz-appearance: textfield;
}
.quick-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.07);
  color: var(--title);
  cursor: pointer;
  transition: all 0.2s ease;
}
.quick-card:hover {
  transform: translateY(-3px);
  border-color: color-mix(in srgb, var(--accent) 50%, transparent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}
.quick-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.q-top {
  display: flex;
  align-items: center;
  gap: 10px;
}
.quick-icon {
  font-size: 26px;
  line-height: 1;
}
.q-cat {
  margin-left: auto;
  font-size: 11px;
  padding: 3px 9px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
  border: 1px solid color-mix(in srgb, var(--accent) 18%, transparent);
}
.quick-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--title);
  word-break: break-all;
}
.quick-desc {
  font-size: 12px;
  color: var(--soft);
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 通用删除按钮 */
.item-del {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 90, 110, 0.18);
  color: #ff8a9b;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.18s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}
.quick-card:hover .item-del,
.resource-card:hover .item-del {
  opacity: 1;
}
.item-del:hover { background: rgba(255, 90, 110, 0.35); }

/* 置顶按钮 */
.item-pin {
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.4);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 5px;
  border-radius: 6px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
}
.item-pin:hover {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: color-mix(in srgb, var(--accent) 80%, transparent);
}
.item-pin.pinned {
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  color: var(--accent);
  opacity: 1;
}
.quick-card:has(.item-pin.pinned) {
  border-color: color-mix(in srgb, var(--accent) 50%, transparent);
  box-shadow: 0 0 16px color-mix(in srgb, var(--accent) 15%, transparent);
}

/* 资源卡片需为相对定位以承载删除按钮 */
.resource-card { position: relative; }

/* 搜索/筛选容器（资源区内） */
.glass-inner {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 16px;
}

/* ===== 弹窗（添加表单） ===== */
.add-modal { max-width: 420px; }
.add-modal h2 {
  font-size: 18px;
  color: var(--title);
  margin-bottom: 16px;
}
.add-form { display: flex; flex-direction: column; gap: 12px; }
.add-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #aeb8c6;
}
.add-field input,
.add-field select,
.add-field textarea {
  background: rgba(13, 27, 42, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9px;
  padding: 9px 11px;
  color: var(--title);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.18s ease;
}
.add-field input:focus,
.add-field select:focus,
.add-field textarea:focus {
  border-color: var(--accent);
}
.add-field textarea { resize: vertical; }
.add-error {
  color: #ff8a9b;
  font-size: 12px;
  margin: 0;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;

}
.btn-ghost:hover { background: rgba(255, 255, 255, 0.08); 
}
.btn-danger:hover { filter: brightness(1.08); }

/* ===== 富化详情弹窗 ===== */
.detail-full {
  color: #b9c3d1;
  font-size: 13.5px;
  line-height: 1.7;
  margin: 4px 0 12px;
}
.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.detail-meta span {
  font-size: 12px;
  color: var(--soft);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 3px 10px;
  border-radius: 20px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ===== 原 src/styles/site/games.css ===== */
/* ============================================================================
 * games.css —— 小游戏（记忆翻牌 / 猜数字 / 贪吃蛇 / 俄罗斯方块 / 扫雷 / 跑酷）
 *
 * 来源：原 src/styles/style.css 第 3745-4097 行，按分节边界原样切出，未改动一个字符。
 * 顺序敏感：本文件与 site/ 下其它片段共同构成全局样式，必须按 index.css 的
 *   顺序加载 —— 原站样式依赖源码书写顺序做层叠覆盖，调整顺序会造成样式回归。
 * ========================================================================== */

/* ===== 小游戏 ===== */
.game-grid {
  display: grid;
  /* 强制 5 列（用户要求一行 5 个） */
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}
.game-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 14px;
  text-align: center;
  transition: all 0.2s ease;
}
.game-card:hover {
  border-color: color-mix(in srgb, var(--accent) 50%, transparent);
  background: color-mix(in srgb, var(--accent) 7%, transparent);
}
.game-icon { font-size: 28px; margin-bottom: 6px; }
.game-card h3 { color: var(--text); font-size: 13.5px; margin-bottom: 10px; }
/* 「▶ 开始游戏」按钮：不论文案多少字、不论哪种语言，统一 100×28。
   （实测最长文案 zh「▶ 开始游戏」87px 不裁切；html:root 提权防 EP 按需 CSS 后加载覆盖） */
html:root .game-card .el-button {
  width: 100px;
  height: 28px;
  min-height: 28px;
  padding: 0;
  justify-content: center;
  margin: 0 auto;
  display: flex;
  align-items: center;
}
/* .game-play 旧按钮类已删（2026-09-22 死代码清理）：模板用的是 .game-card 内的 el-button，
   统一尺寸规则见上方 html:root .game-card .el-button。 */

/* 小游戏抽屉（电脑端收纳） */
.games-drawer-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 16px auto 0;
  padding: 7px 18px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: var(--accent);
  font-size: 0.82rem;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s;
}
.games-drawer-btn:hover {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 20%, transparent);
}
.games-drawer-arrow { font-size: 0.7rem; }
@media (min-width: 769px) {
  /* 桌面端固定列数：资源 4 列 / 小游戏 5 个一行 */
  .resource-grid { grid-template-columns: repeat(4, 1fr); }
  .game-grid { grid-template-columns: repeat(5, 1fr); }
}
.game-modal { max-width: 540px; max-height: 95%; }
.game-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}
.game-msg {
  min-height: 20px;
  color: var(--accent);
  font-size: 14px;
  text-align: center;
}

/* 记忆翻牌 */
.mem-board {
  display: grid;
  gap: 6px;
  justify-content: center;
}
.mem-card {
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(13, 27, 42, 0.8);
  color: #cdd6e2;
  cursor: pointer;
  transition: all 0.18s ease;
}
.mem-card.open, .mem-card.done {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  border-color: var(--accent);
}
.mem-card.done { opacity: 0.55; }
.mem-card.mem-wild.done {
  background: rgba(255, 217, 61, 0.25);
  border-color: #ffd93d;
  opacity: 1;
}
.mem-info { color: var(--soft); font-size: 13px; }
.mem-restart-btn {
  margin-top: 10px;
  padding: 8px 20px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.mem-restart-btn:hover { background: color-mix(in srgb, var(--accent) 20%, transparent); }
/* 记忆翻牌难度选择 */
.mem-diff { text-align: center; padding: 20px 0; }
.mem-diff-title { color: var(--accent); font-size: 18px; font-weight: 600; margin-bottom: 20px; }
.mem-diff-btns { display: flex; flex-direction: column; gap: 12px; align-items: center; }
.mem-diff-btn {
  width: 200px;
  padding: 14px 20px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  line-height: 1.4;
}
.mem-diff-btn small { display: block; font-size: 11px; color: var(--soft); font-weight: 400; margin-top: 4px; }
.mem-diff-btn:hover {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  border-color: var(--accent);
  transform: translateY(-2px);
}

/* 猜数字 */
.guess-tip { color: #b9c3d1; font-size: 14px; margin: 0; text-align: center; }
.guess-row { display: flex; gap: 8px; }
.guess-input {
  width: 120px;
  background: rgba(13, 27, 42, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9px;
  padding: 8px 11px;
  color: var(--title);
  font-size: 14px;
  outline: none;
}
.guess-input:focus { border-color: var(--accent); }
.guess-go {
  border: 1px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent-2);
  padding: 8px 16px;
  border-radius: 9px;
  cursor: pointer;
}
.guess-log {
  width: 100%;
  max-height: 120px;
  overflow-y: auto;
  font-size: 12.5px;
  color: #aeb8c6;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

/* 贪吃蛇 */
.snake-canvas {
  background: #0d1b2a;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  touch-action: none;
}
.snake-info { color: var(--soft); font-size: 13px; }
.snake-start-btn {
  margin-top: 10px;
  padding: 10px 24px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.snake-start-btn:hover {
  background: color-mix(in srgb, var(--accent) 24%, transparent);
  transform: translateY(-1px);
}
.snake-score { color: var(--accent); font-weight: 600; }

/* 设置：数据管理按钮换行 */
.data-actions { display: flex; flex-wrap: wrap; gap: 8px; }

/* 俄罗斯方块 */
.tetris-canvas {
  background: #0d1b2a;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
  display: block;
}
.tetris-info { color: var(--soft); font-size: 13px; margin-top: 8px; }
.tetris-info b { color: var(--accent); font-weight: 600; }
.tetris-restart-btn {
  margin-top: 10px;
  padding: 8px 20px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.tetris-restart-btn:hover { background: color-mix(in srgb, var(--accent) 20%, transparent); }
/* 俄罗斯方块模式选择 */
.tetris-mode { text-align: center; padding: 20px 0; }
.tetris-mode-title { color: var(--accent); font-size: 18px; font-weight: 600; margin-bottom: 20px; }
.tetris-mode-btns { display: flex; flex-direction: column; gap: 12px; align-items: center; }
.tetris-mode-btn {
  width: 200px;
  padding: 14px 20px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  line-height: 1.4;
}
.tetris-mode-btn small { display: block; font-size: 11px; color: var(--soft); font-weight: 400; margin-top: 4px; }
.tetris-mode-btn:hover {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  border-color: var(--accent);
  transform: translateY(-2px);
}

/* 扫雷游戏 */
.ms-info { color: var(--soft); font-size: 13px; margin-bottom: 8px; }
.ms-info span { color: var(--accent); font-weight: 600; }
.ms-board-wrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  width: 100%;
  padding-bottom: 8px;
  margin-bottom: 12px;
  text-align: center;
}
.ms-board-wrap::-webkit-scrollbar {
  height: 6px;
}
.ms-board-wrap::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
}
.ms-board-wrap::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--accent) 30%, transparent);
  border-radius: 3px;
}
.ms-board-wrap::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--accent) 50%, transparent);
}
.ms-board { display: inline-grid; gap: 2px; }
.ms-cell {
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background 0.15s;
  border-radius: 3px;
}
.ms-cell:hover { background: color-mix(in srgb, var(--accent) 18%, transparent); }
.ms-cell.revealed {
  background: rgba(0, 0, 0, 0.3);
  cursor: default;
}
.ms-cell.n1 { color: var(--accent-2); }
.ms-cell.n2 { color: #5bff9d; }
.ms-cell.n3 { color: #ff6b7d; }
.ms-cell.n4 { color: #b07cff; }
.ms-cell.n5 { color: #ffa14d; }
.ms-cell.n6 { color: #3ee6f0; }
.ms-cell.n7 { color: #ffd93d; }
.ms-cell.n8 { color: #ff6bff; }
.ms-restart-btn {
  margin-top: 12px;
  padding: 8px 20px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.ms-restart-btn:hover { background: color-mix(in srgb, var(--accent) 20%, transparent); }
/* 扫雷难度选择 */
.ms-diff { text-align: center; padding: 20px 0; }
.ms-diff-title { color: var(--accent); font-size: 18px; font-weight: 600; margin-bottom: 20px; }
.ms-diff-btns { display: flex; flex-direction: column; gap: 12px; align-items: center; }
.ms-diff-btn {
  width: 200px;
  padding: 14px 20px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  line-height: 1.4;
}
.ms-diff-btn small { display: block; font-size: 11px; color: var(--soft); font-weight: 400; margin-top: 4px; }
.ms-diff-btn:hover {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  border-color: var(--accent);
  transform: translateY(-2px);
}

/* 跑酷游戏 */
.runner-canvas { border-radius: 8px; display: block; }
.runner-info { color: var(--soft); font-size: 13px; margin-top: 8px; }
.runner-start-btn {
  margin-top: 10px;
  padding: 10px 28px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.runner-start-btn:hover {
  background: color-mix(in srgb, var(--accent) 24%, transparent);
  transform: translateY(-1px);
}
.runner-info span { color: var(--accent); font-weight: 600; }

/* ===== 原 src/styles/site/portfolio.css ===== */
/* ============================================================================
 * portfolio.css —— 作品集区块 / 项目详情弹窗 / 主题切换与配色方案
 *
 * 来源：原 src/styles/style.css 第 4098-4474 行，按分节边界原样切出，未改动一个字符。
 * 顺序敏感：本文件与 site/ 下其它片段共同构成全局样式，必须按 index.css 的
 *   顺序加载 —— 原站样式依赖源码书写顺序做层叠覆盖，调整顺序会造成样式回归。
 * ========================================================================== */

/* =========================================================
 * 新增：作品集页面区块 / 设置面板扩展 / 主题与配色切换
 * ========================================================= */

/* ---- 首页 Hero ---- */
.hero { padding: 56px 6vw; text-align: center; }
.hero h1 { font-size: clamp(1.8rem, 4vw, 2.6rem); margin-bottom: 14px; }
.hero p { max-width: 640px; margin: 0 auto; line-height: 1.8; }

/* ---- 关于我 / 项目 / 证书 卡片网格 ---- */
.about-grid, .project-grid, .cert-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}
.about-card, .project-card, .cert-card {
  padding: 20px;
  border-radius: 14px;
}
.about-card h3, .project-card h3, .cert-card h3 {
  margin-bottom: 10px;
  font-size: 1rem;
}
.about-card p, .project-card p {
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.7;
  margin-bottom: 10px;
}
/* 项目卡片的源码链接（与 about 页共用同一套 .project-* 类） */
.project-links { margin-top: 2px; }
.project-links a { color: var(--accent); font-size: 0.84rem; text-decoration: none; }
.project-links a:hover { text-decoration: underline; }
/* 项目作品区：打赏引导（点击打开 DonateModal） */
.projects-donate-hint {
  display: block;
  width: 100%;
  margin: 18px 0 0;
  padding: 0;
  border: none;
  background: none;
  text-align: center;
  font-size: 0.88rem;
  line-height: 1.7;
  color: var(--muted);
  cursor: pointer;
}
.projects-donate-hint:hover { color: var(--accent); }
/* 项目卡片：可点击查看详情 */
.project-card--clickable { cursor: pointer; transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
.project-card--clickable:hover { transform: translateY(-3px); border-color: var(--accent); box-shadow: 0 10px 30px rgba(0,0,0,.18); }
.project-card--clickable:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.project-card-more { display: inline-block; margin-top: 6px; font-size: 0.84rem; font-weight: 600; color: var(--accent); }

/* ===== 项目作品详情弹窗 ===== */
.project-modal-overlay {
  position: fixed; inset: 0; z-index: 9500;
  display: flex; align-items: center; justify-content: center; padding: 16px;
  background: rgba(2, 10, 7, 0.62);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
}
.project-modal-overlay[hidden] { display: none; }
.project-modal {
  position: relative; width: min(520px, 94vw); max-height: 86vh; overflow: auto;
  padding: 30px 28px 26px; border-radius: 22px;
  background: var(--surface); border: 1px solid var(--border);
  box-shadow: var(--shadow); color: var(--text);
  animation: projectPop .3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes projectPop { from { opacity: 0; transform: translateY(18px) scale(.97); } to { opacity: 1; transform: none; } }
.project-modal-close {
  position: absolute; top: 12px; right: 14px;
  width: 32px; height: 32px; border-radius: 50%;
  border: none; background: color-mix(in srgb, var(--text) 8%, transparent);
  color: var(--muted); font-size: 1.3rem; line-height: 1; cursor: pointer;
  transition: background .15s ease, color .15s ease;
}
.project-modal-close:hover { background: color-mix(in srgb, var(--text) 16%, transparent); color: var(--text); }
.project-modal-title { font-size: 1.15rem; margin-bottom: 12px; padding-right: 28px; }
.project-modal-body { color: var(--muted); font-size: 0.94rem; line-height: 1.85; white-space: pre-line; }
/* 详情布局：正文在左、表盘预览在右（移动端堆叠） */
.project-modal-layout { display: flex; gap: 22px; align-items: flex-start; }
.project-modal-main { flex: 1 1 auto; min-width: 0; }
.project-modal-media { flex: 0 0 auto; align-self: center; }
.project-modal-media .project-modal-img {
  display: block;
  width: auto; max-width: 200px; max-height: 360px;
  border-radius: 16px; object-fit: contain;
}
.project-modal-links { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
@media (max-width: 640px) {
  .project-modal-layout { flex-direction: column; align-items: stretch; }
  .project-modal-media { align-self: center; order: -1; }
  .project-modal-media .project-modal-img { max-width: 56vw; max-height: 300px; }
}
.project-modal-link {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 9px 16px; border-radius: 11px;
  background: var(--accent); color: #fff;
  font-size: 0.86rem; font-weight: 600; text-decoration: none;
  transition: transform .15s ease, box-shadow .15s ease, background .15s ease;
}
.project-modal-link:hover { transform: translateY(-2px); box-shadow: 0 8px 20px color-mix(in srgb, var(--accent) 40%, transparent); }
.project-modal-link.ghost { background: transparent; color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent); }
.project-modal-link.ghost:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }
.tag-cloud { display: flex; flex-wrap: wrap; gap: 8px; }
.tag-cloud .tag {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.78rem;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
  border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
}
.project-links a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--accent);
  text-decoration: none;
  font-size: 0.88rem;
  font-weight: 600;
}
.project-links a:hover { text-decoration: underline; }

/* ---- 博客 ---- */
.blog-list { list-style: none; display: flex; flex-direction: column; gap: 10px; }
.blog-item { padding: 16px 18px; border-radius: 12px; }
.blog-item a { color: var(--text); text-decoration: none; }
.blog-item a:hover { color: var(--accent); }

/* ---- 简历 ---- */
.resume-box {
  padding: 22px;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
}
.resume-box p { color: var(--muted); }
.resume-dl { text-decoration: none; }

/* ---- 证书 ---- */
.cert-card { text-align: center; }
.cert-icon { font-size: 2rem; display: block; margin-bottom: 8px; }

.tools-wrap { scroll-margin-top: 84px; }

/* ---- 设置面板新增控件 ---- */
/* ⚠️ 这里原本是 `.settings-group select { flex:1; max-width:220px; padding:8px 10px; ... }`，
   针对面板里那个原生「配色方案」下拉。2026-09-21 排版重构后，控件统一改名成
   `.settings-select`（样式见上方「设置面板：统一的标签+控件两列行」），本段已由那份取代。

   为什么必须删掉而不是留着：`.settings-group select` 特异性 (0,1,1) 高于 `.settings-select`
   (0,1,0)，会把重构后的样式整个盖掉 —— 实测下拉框又变回 padding 8px 10px / 字号 0.9rem /
   背景 rgba(255,255,255,.05)，连 `background-image` 的下拉箭头都被 `background` 简写清掉。
   更糟的是 `max-width: 220px` 会连带截断**语言下拉**（它也是 select），
   让语言那一行右边空出一大片。 */

/* 设置面板数据统计 */
.stats-rows { display: flex; flex-direction: column; gap: 8px; margin-bottom: 4px; }
.stat-line {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 7px 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 0.88rem; color: var(--text);
}
.stat-line b { color: var(--accent); font-variant-numeric: tabular-nums; }
html[data-theme="light"] .stat-line { background: rgba(0, 0, 0, 0.03); }
.visitor-line { margin: 2px 0 14px; font-size: 13px; color: var(--muted); }
.visitor-line b { color: var(--accent); }

.about-site {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 0.88rem;
  color: var(--muted);
  line-height: 1.7;
}
.about-site li span { color: var(--text); font-weight: 600; margin-right: 4px; }
.about-site a { color: var(--accent); text-decoration: none; }
.about-site a:hover { text-decoration: underline; }

/* ---- 简约粒子背景 ---- */
#particleCanvas {
  position: fixed;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}

/* =========================================================
 * 主题切换（浅色）与配色方案（莫兰迪 / 高对比护眼）
 * ========================================================= */
html[data-theme="light"] {
  --bg: #e6f2ea;
  --surface: rgba(214, 236, 222, 0.72);
  --surface-hover: rgba(200, 230, 212, 0.92);
  --text: #1a2e22;
  --muted: #4a6b55;
  --title: #12301f;
  /* ⚠️ 原站缺陷修复：浅色主题不覆盖 --accent，导致所有强调色文字（区块标题/标签/链接/
     筛选钮）在浅绿底上只有 1.15:1 几乎不可读。这里换成深青（约 5.6:1 / 蓝 4.9:1）。 */
  --accent: #0d6b57;
  --accent-2: #1c6f9c;
  /* 浅色下 --soft 压深：#55606e 对浅底约 5.6:1（原 #8b94a3 仅 2.52:1，不达 AA 4.5） */
  --soft: #55606e;
  --border: rgba(28, 75, 50, 0.14);
  --shadow: 0 8px 32px rgba(30, 70, 50, 0.12);
}
html[data-theme="light"] .side-nav {
  background: rgba(214, 236, 222, 0.9);
}
html[data-theme="light"] .nav-brand { background: rgba(0, 0, 0, 0.04); }
html[data-theme="light"] .bg-layer { filter: brightness(1.05) saturate(1.05); opacity: 0.5; }
html[data-theme="light"] .overlay {
  background: radial-gradient(circle at 50% 30%, rgba(214, 236, 222, 0.5) 0%, rgba(230, 242, 234, 0.9) 80%, rgba(205, 225, 212, 0.96) 100%);
}
/* ⚠️ 必须排除语言下拉（.lang-switcher__select）。
 * 这条规则原本是给设置面板里的「主题模式 / 配色方案」下拉用的；语言切换在原站是
 * `#langSeg` 分段按钮，不是 <select>，所以当年没考虑它。
 * 现在语言切换是独立组件（src/styles/lang-switcher.css 自带样式），一旦被这条命中：
 *   · 这里用的是 `background` **简写** → 会把 background-image 一起重置为 none，
 *     于是下拉框的箭头消失；
 *   · 特异性 (0,2,2) 也高于组件自己的 (0,2,0)，组件设的底色同样被盖掉。
 * 结果就是「浅色下语言下拉没有箭头、深色下有」这种主题间不一致。
 * 排除之后 #schemeSel 等真正的设置项不受影响。 */
html[data-theme="light"] .settings-group select:not(.lang-switcher__select) {
  background: rgba(0, 0, 0, 0.04);
}
html[data-theme="light"] .settings-select option { background: #d8ecde; color: #1a2e22; }
html[data-theme="light"] .modal {
  background: rgba(214, 236, 222, 0.98);
}
html[data-theme="light"] .add-field input,
html[data-theme="light"] .add-field select,
html[data-theme="light"] .add-field textarea,
html[data-theme="light"] .search-wrap input,
html[data-theme="light"] .controls input[type="text"],
html[data-theme="light"] .guess-input {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(28, 75, 50, 0.15);
}
html[data-theme="light"] .game-card,
html[data-theme="light"] .quick-card,
html[data-theme="light"] .resource-card,
html[data-theme="light"] .about-card,
html[data-theme="light"] .project-card,
html[data-theme="light"] .cert-card,
html[data-theme="light"] .blog-item,
html[data-theme="light"] .resume-box {
  background: rgba(214, 236, 222, 0.55);
}
html[data-theme="light"] .mem-card { background: rgba(0, 0, 0, 0.05); }
html[data-theme="light"] .snake-canvas,
html[data-theme="light"] .tetris-canvas { background: #d8ecde; }
html[data-theme="light"] .gate-card {
  color: #1a2e22;
}
html[data-theme="light"] .gate-sub { color: #4a6b55; }
html[data-theme="light"] .gate-hint { color: rgba(26, 46, 34, 0.4); }
html[data-theme="light"] .gate-divider {
  background: linear-gradient(90deg, transparent, rgba(45, 122, 90, 0.3), transparent);
}
html[data-theme="light"] #gate::before {
  filter: blur(28px) brightness(0.75) saturate(1.1);
}
html[data-theme="light"] #gate::after {
  background: linear-gradient(180deg, rgba(230, 242, 234, 0.35), rgba(230, 242, 234, 0.55));
}
html[data-theme="light"] .specular-btn {
  background: rgba(20, 70, 50, 0.55);
  border-color: rgba(255, 255, 255, 0.2);
}
html[data-theme="light"] .specular-btn:hover {
  background: rgba(24, 82, 58, 0.65);
  border-color: color-mix(in srgb, var(--accent) 40%, transparent);
}

/* ===== 原 src/styles/site/fallback.css ===== */
/* ============================================================================
 * fallback.css —— QQ / 微信 / X5 内核降级 / 手机端补充样式
 *
 * 来源：原 src/styles/style.css 第 4475-4863 行，按分节边界原样切出，未改动一个字符。
 * 顺序敏感：本文件与 site/ 下其它片段共同构成全局样式，必须按 index.css 的
 *   顺序加载 —— 原站样式依赖源码书写顺序做层叠覆盖，调整顺序会造成样式回归。
 * ========================================================================== */

/* ===== QQ/微信/X5 内核及低端移动设备降级 =====
 * 这些浏览器对全屏 filter:blur() 与 backdrop-filter 支持不佳，
 * 经常出现整屏黑屏或内容不可见，故直接关闭滤镜，改用纯色/渐变兜底。
 */
/* 统一降级：is-legacy 浏览器全局关闭玻璃滤镜，彻底避免合成层黑屏 */
html.is-legacy * {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
html.is-legacy #gate::before,
html.is-qq #gate::before,
html.is-wechat #gate::before,
html.is-x5 #gate::before,
html.is-mobile.no-webgl2 #gate::before {
  filter: none;
  background: radial-gradient(circle at 50% 30%, rgba(8, 36, 30, 0.95), rgba(2, 10, 8, 1));
}
html[data-theme="light"].is-legacy #gate::before,
html[data-theme="light"].is-qq #gate::before,
html[data-theme="light"].is-wechat #gate::before,
html[data-theme="light"].is-x5 #gate::before,
html[data-theme="light"].is-mobile.no-webgl2 #gate::before {
  filter: none;
  background: radial-gradient(circle at 50% 30%, rgba(200, 225, 210, 0.95), rgba(180, 205, 190, 1));
}

html.is-qq .specular-btn,
html.is-wechat .specular-btn,
html.is-x5 .specular-btn,
html.is-mobile.no-webgl2 .specular-btn,
html.is-qq .gate-theme-seg,
html.is-wechat .gate-theme-seg,
html.is-x5 .gate-theme-seg,
html.is-mobile.no-webgl2 .gate-theme-seg {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

html.is-qq .specular-btn,
html.is-wechat .specular-btn,
html.is-x5 .specular-btn,
html.is-mobile.no-webgl2 .specular-btn {
  background: rgba(14, 48, 36, 0.9);
  border-color: color-mix(in srgb, var(--accent) 35%, transparent);
}
html[data-theme="light"].is-qq .specular-btn,
html[data-theme="light"].is-wechat .specular-btn,
html[data-theme="light"].is-x5 .specular-btn,
html[data-theme="light"].is-mobile.no-webgl2 .specular-btn {
  background: rgba(20, 70, 50, 0.85);
  border-color: rgba(45, 122, 90, 0.35);
}

/* 确保降级模式下文字与按钮始终可见 */
html.is-qq .gate-card,
html.is-wechat .gate-card,
html.is-x5 .gate-card,
html.is-mobile.no-webgl2 .gate-card,
html.is-qq .captcha,
html.is-wechat .captcha,
html.is-x5 .captcha,
html.is-mobile.no-webgl2 .captcha {
  opacity: 1 !important;
  transform: none !important;
}

/* 主站玻璃拟态元素同步降级，避免进入后出现卡片黑屏 */
html.is-qq .glass,
html.is-wechat .glass,
html.is-x5 .glass,
html.is-mobile.no-webgl2 .glass,
html.is-qq .modal,
html.is-wechat .modal,
html.is-x5 .modal,
html.is-mobile.no-webgl2 .modal,
html.is-qq .side-nav,
html.is-wechat .side-nav,
html.is-x5 .side-nav,
html.is-mobile.no-webgl2 .side-nav {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

html[data-theme="light"] .switch {
  background: rgba(0, 0, 0, 0.12);
}
html[data-theme="light"] .switch::after {
  background: #f0f7f2;
}
html[data-theme="light"] .fortune-popup {
  background: rgba(214, 236, 222, 0.97);
  border-color: rgba(28, 75, 50, 0.2);
  box-shadow: 0 10px 40px rgba(30, 70, 50, 0.15);
}
html[data-theme="light"] .fortune-float {
  background: rgba(214, 236, 222, 0.9);
  border-color: rgba(28, 75, 50, 0.3);
  box-shadow: 0 6px 20px rgba(30, 70, 50, 0.15);
}
html[data-theme="light"] .qq-tooltip {
  background: rgba(214, 236, 222, 0.97);
  border-color: rgba(28, 75, 50, 0.2);
  box-shadow: 0 12px 40px rgba(30, 70, 50, 0.2);
}
html[data-theme="light"] .contact-icon-only {
  color: #6b7280;
  background: rgba(45, 122, 90, 0.08);
}
html[data-theme="light"] .qq-tooltip-title,
html[data-theme="light"] .qq-tooltip-number,
html[data-theme="light"] .qq-tooltip-tip {
  color: #1a2e22;
}
html[data-theme="light"] .qq-tooltip::after {
  border-top-color: rgba(214, 236, 222, 0.97);
}
html[data-theme="light"] .ms-info {
  color: #4a6b55;
}
html[data-theme="light"] .ms-cell {
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(28, 75, 50, 0.15);
}
html[data-theme="light"] .ms-cell:hover {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
}
html[data-theme="light"] .ms-cell.revealed {
  background: rgba(255, 255, 255, 0.6);
}
html[data-theme="light"] .ms-diff-btn {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(28, 75, 50, 0.2);
  color: #1a2e22;
}
html[data-theme="light"] .ms-diff-btn:hover {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
}
html[data-theme="light"] .ms-restart-btn,
html[data-theme="light"] .snake-start-btn,
html[data-theme="light"] .tetris-restart-btn,
html[data-theme="light"] .tetris-mode-btn {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(28, 75, 50, 0.2);
  color: #1a2e22;
}
html[data-theme="light"] .ms-restart-btn:hover,
html[data-theme="light"] .snake-start-btn:hover,
html[data-theme="light"] .tetris-restart-btn:hover,
html[data-theme="light"] .tetris-mode-btn:hover {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
}
html[data-theme="light"] .mem-diff-btn {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(28, 75, 50, 0.2);
  color: #1a2e22;
}
html[data-theme="light"] .mem-diff-btn:hover {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
}
html[data-theme="light"] .runner-canvas {
  background: #d8ecde;
}

/* 配色：莫兰迪低饱和 */
html[data-scheme="morandi"] {
  --accent: #a3b8a1;
  --accent-2: #b9c4bd;
  --border: rgba(163, 184, 161, 0.35);
}
html[data-theme="light"][data-scheme="morandi"] { --bg: #ecece6; }

/* 配色：高对比护眼 */
html[data-scheme="eye"] {
  --accent: #19b36b;
  --accent-2: #2f7de1;
  --border: rgba(25, 179, 107, 0.4);
}
html[data-theme="light"][data-scheme="eye"] { --bg: #f2f7f2; }

/* 配色：日落橙 */
html[data-scheme="sunset"] {
  --accent: #ff8c42;
  --accent-2: #ff6b9d;
  --border: rgba(255, 140, 66, 0.4);
}
html[data-theme="light"][data-scheme="sunset"] { --bg: #fdf2ec; }

/* 配色：海洋蓝 */
html[data-scheme="ocean"] {
  --accent: #4dabf7;
  --accent-2: #74c0fc;
  --border: rgba(77, 171, 247, 0.4);
}
html[data-theme="light"][data-scheme="ocean"] { --bg: #eef5fc; }

/* 配色：紫罗兰 */
html[data-scheme="violet"] {
  --accent: #9775fa;
  --accent-2: #b197fc;
  --border: rgba(151, 117, 250, 0.4);
}
html[data-theme="light"][data-scheme="violet"] { --bg: #f3f0fc; }

/* 配色：樱花粉 */
html[data-scheme="sakura"] {
  --accent: #f783ac;
  --accent-2: #faa2c1;
  --border: rgba(247, 131, 172, 0.4);
}
html[data-theme="light"][data-scheme="sakura"] { --bg: #fcf0f4; }

/* 配色：极光绿 */
html[data-scheme="aurora"] {
  --accent: #51cf66;
  --accent-2: #69db7c;
  --border: rgba(81, 207, 102, 0.4);
}
html[data-theme="light"][data-scheme="aurora"] { --bg: #eef7ef; }

/* 等宽字体 */
html[data-font="mono"] {
  --font-body: "JetBrains Mono", Consolas, "Courier New", monospace;
}

/* 关闭动画（低配设备 / 用户偏好） */
html.no-anim *,
html.no-anim *::before,
html.no-anim *::after {
  animation: none !important;
  transition: none !important;
}

/* ===== 手机端补充样式 ===== */
@media (max-width: 640px) {
  /* 小游戏画布自适应宽度，避免溢出 */
  .snake-canvas,
  .tetris-canvas,
  .runner-canvas {
    max-width: 100%;
    height: auto;
  }

  /* 小游戏：两列网格 + 显示全部游戏 */
  .game-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  .game-card {
    padding: 14px 10px;
    display: block;
  }
  .game-card[data-game-id="snake"],
  .game-card[data-game-id="tetris"],
  .game-card[data-game-id="runner"] {
    display: block;
  }
  #gameToggles .switch-row[data-game-id="snake"],
  #gameToggles .switch-row[data-game-id="tetris"],
  #gameToggles .switch-row[data-game-id="runner"] {
    display: flex;
  }
  .game-icon {
    font-size: 28px;
  }
  .game-card h3 {
    font-size: 13px;
    margin-bottom: 8px;
  }

  /* 分类筛选按钮：手机端一行 5 个。
     英文分类名较长时允许换行，文字水平垂直完全居中，
     不裁切、不偏移、间距均等，按钮大小统一、不超出容器 */
  .filters {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
  

  /* 快捷网页：手机端 4 列小卡片，图标左上 + 置顶右上 + 名称底部，等高 */
  .quick-grid {
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }
  .quick-card {
    padding: 8px 6px;
    gap: 4px;
    border-radius: 12px;
    min-height: 80px;           /* 等高，避免参差 */
  }
  .quick-card .q-top {
    justify-content: space-between; /* 图标左 / 置顶右 */
    gap: 2px;
  }
  .quick-card .q-cat { display: none; }
  .quick-card .quick-icon { font-size: 22px; }
  .quick-card .item-pin {
    margin-left: 0;
    font-size: 9px;
    padding: 1px 4px;
  }
  .quick-card .quick-name {
    font-size: 10px;
    text-align: center;
    margin-top: auto;           /* 名称贴底 */
    line-height: 1.25;
  }
  .quick-card .quick-desc { display: none; }

  /* 资源下载：手机端 4 列，图标上 + 标题底，卡片等高 */
  .resource-grid {
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }
  .resource-card {
    padding: 8px 6px;
    border-radius: 12px;
    min-height: 80px;           /* 与快捷卡片同高对齐 */
    display: flex;
    flex-direction: column;
  }
  .resource-card .card-top {
    margin-bottom: 0;
    justify-content: center;
  }
  .resource-card .card-icon {
    width: 22px;
    height: 22px;
    border-radius: 7px;
    font-size: 0.95rem;
  }
  .resource-card .card-category { display: none; }
  .resource-card h3 {
    font-size: 10px;
    text-align: center;
    margin-bottom: 0;
    margin-top: auto;           /* 标题贴底，与快捷卡片同位 */
    line-height: 1.25;
  }
  .resource-card p,
  .resource-card .card-tags,
  .resource-card .card-link { display: none; }


/* ===== 原 src/styles/site/mobile.css ===== */
/* ============================================================================
 * mobile.css —— 手机端设置弹窗 UI 修复 / 打赏按钮与收款码弹窗
 *
 * 来源：原 src/styles/style.css 第 4864-5211 行，按分节边界原样切出，未改动一个字符。
 * 顺序敏感：本文件与 site/ 下其它片段共同构成全局样式，必须按 index.css 的
 *   顺序加载 —— 原站样式依赖源码书写顺序做层叠覆盖，调整顺序会造成样式回归。
 * ========================================================================== */

/* =========================================================
 * 手机端设置弹窗（含英文）UI 修复：
 * 长标签允许换行、不裁切、不溢出；控件宽度自适应；间距均等。
 * ========================================================= */
}
@media (max-width: 640px) {
  .settings-modal {
    width: calc(100vw - 16px);
    max-height: 92vh;
  }
  .settings-modal-header {
    padding: 12px 14px 8px;
  }
  .settings-modal-header .settings-modal-title {
    font-size: 1.05rem;
  }
  .settings-modal-body {
    padding: 0 12px 14px;
    gap: 12px;
  }
  .settings-modal-body .settings-group {
    padding: 13px 12px;
  }
  .settings-modal-body .settings-group h3 {
    font-size: 0.9rem;
    margin-bottom: 10px;
    padding-bottom: 6px;
  }

  /* 行容器：switch 行允许换行；range 行改用两行网格（标签一行、控件一行） */
  .settings-group .switch-row {
    flex-wrap: wrap;
    row-gap: 6px;
    column-gap: 10px;
    align-items: center;
  }
  .settings-group .switch-row > span:first-child {
    flex: 1 1 auto;
    min-width: 0;
    white-space: normal;
    overflow-wrap: break-word;
    word-break: break-word;
    line-height: 1.3;
    font-size: 0.88rem;
  }
  .settings-group .range-row {
    display: grid;
    grid-template-columns: 1fr auto;
    column-gap: 10px;
    row-gap: 6px;
    align-items: center;
  }
  .settings-group .range-row > span:first-child {
    grid-column: 1 / -1;
    min-width: 0;
    white-space: normal;
    overflow-wrap: break-word;
    word-break: break-word;
    line-height: 1.3;
    font-size: 0.88rem;
  }
  .settings-group .range-row .seg,
  .settings-group .range-row select {
    grid-column: 1 / -1;
    width: 100%;
    justify-self: stretch;
  }
  .settings-group .range-row input[type="range"] {
    grid-column: 1;
    width: 100%;
  }
  .settings-group .range-row .range-val {
    grid-column: 2;
    min-width: 40px;
  }

  /* 统一行结构（.settings-row）：窄屏改成「标签一行、控件一行」。
     这样日文那种长标签（外部リンクを新しいタブで開く）也不需要折行。 */
  .settings-group .settings-row {
    flex-wrap: wrap;
    row-gap: 6px;
    column-gap: 10px;
    min-height: 0;
    padding: 5px 0;
  }
  .settings-group .settings-label {
    flex: 1 1 100%;
    min-width: 0;
    font-size: 0.88rem;
    line-height: 1.3;
    overflow-wrap: break-word;
    word-break: break-word;
  }
  .settings-group .settings-ctrl {
    margin-left: 0;
    flex: 1 1 100%;
    /* 分段控件/下拉都是 width:100% 会自己撑满，这里只影响开关这类定宽控件 ——
       让开关靠右，与桌面端「控件贴右」的观感一致。 */
    justify-content: flex-end;
  }
  .settings-group .settings-select {
    width: 100%;
    min-width: 0;
  }
  .settings-group .settings-row--action { justify-content: flex-start; }

  /* 分段按钮组：允许换行，按钮文字居中不裁切 */
  .settings-group .seg {
    flex-wrap: wrap;
    width: 100%;
  }
  .settings-group .seg-btn {
    flex: 1 1 auto;
    min-width: 0;
    padding: 6px 8px;
    white-space: normal;
    overflow-wrap: break-word;
    text-align: center;
    font-size: 0.78rem;
    line-height: 1.25;
  }
  /* 语言切换组保持等宽两列 */
  .settings-group .lang-seg .seg-btn {
    flex: 1 1 45%;
  }

  /* 下拉框/滑杆宽度自适应，不超出弹窗 */
  .settings-select {
    max-width: 100%;
    min-width: 0;
    font-size: 12.5px;
  }

  /* 数据操作按钮：两列网格等距 */
  .settings-group .data-actions.data-grid {
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .settings-group .data-btn {
    padding: 8px 6px;
    font-size: 0.78rem;
    white-space: normal;
    overflow-wrap: break-word;
    text-align: center;
    width: 100%;
  }

  /* 关于本站 / 访客统计等长文本区域 */
  .settings-group .about-site li,
  .settings-group .visitor-line {
    font-size: 0.82rem;
    overflow-wrap: break-word;
    word-break: break-word;
    line-height: 1.45;
  }


/* =========================================================
 * 打赏：页脚按钮 + 收款码弹窗（随主题/配色方案变化）
 * ========================================================= */
}
.donate-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 20px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, transparent), color-mix(in srgb, var(--accent-2) 10%, transparent));
  color: var(--accent);
  font-size: 0.85rem;
  font-family: inherit;
  font-weight: 600;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
}
}
.donate-btn:hover {
  border-color: var(--accent);
  box-shadow: 0 0 18px color-mix(in srgb, var(--accent) 35%, transparent);
  transform: translateY(-1px);
}
.donate-btn svg { color: var(--accent); 
}
.donate-modal-overlay[hidden] { display: none; }
.donate-modal {
  position: relative;
  width: min(360px, 92vw);
  padding: 28px 26px 24px;
  border-radius: 22px;
  text-align: center;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  color: var(--text);
  animation: donatePop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes donatePop {
  from { opacity: 0; transform: scale(0.92) translateY(14px); }
  to { opacity: 1; transform: scale(1) translateY(0); }

}
.donate-modal-close:hover {
  border-color: var(--accent);
  color: var(--accent);
  transform: rotate(90deg);

}
.donate-qr {
  width: 200px;
  height: 200px;
  max-width: 70vw;
  border-radius: 14px;
  border: 1px solid var(--border);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
  object-fit: contain;
  background: #fff;
}
.donate-blessing {
  margin: 16px 0 6px;
  font-size: 0.92rem;
  line-height: 1.6;
  color: var(--text);
}
.donate-tip {
  margin: 0


/* ===== 关于我完整版入口（个人简介方框下方居中） ===== */
}
.about-more { text-align: center; margin-top: 18px; }
.about-enter-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 26px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, transparent), color-mix(in srgb, var(--accent-2) 10%, transparent));
  color: var(--accent);
  font-size: 0.9rem;
  font-weight: 600;
  font-family: inherit;
  text-decoration: none;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
}
.about-enter-btn:hover {
  border-color: var(--accent);
  box-shadow: 0 0 18px color-mix(in srgb, var(--accent) 30%, transparent);
  transform: translateY(-1px);
}
.about-enter-arrow { font-size: 0.85rem; transition: transform 0.2s; }
.about-enter-btn:hover .about-enter-arrow { transform: translateX(3px); }

/* ===== 关于页访问密码弹窗（主站入口处） ===== */
.about-pw-overlay {
  position: fixed
}
.about-pw-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: all 0.2s;
}
.about-pw-close:hover { border-color: var(--accent); color: var(--accent); transform: rotate(90deg); 
}
.about-pw-sub { margin: 0 0 16px; font-size: 0.82rem; color: var(--muted); 
}
.about-pw-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent); 
}
.about-pw-btn:hover { transform: translateY(-1px); 
}
.about-pw-msg { margin-top: 10px

/* ===== 原 src/styles/site/overrides.css ===== */
/* ============================================================================
 * overrides.css —— UI 精修补丁（空态 / 对齐 / 动画 / 触屏 hover / 分页 / header / 滚动条）
 *
 * 来源：原 src/styles/style.css 第 5212-5409 行，按分节边界原样切出，未改动一个字符。
 * 顺序敏感：本文件与 site/ 下其它片段共同构成全局样式，必须按 index.css 的
 *   顺序加载 —— 原站样式依赖源码书写顺序做层叠覆盖，调整顺序会造成样式回归。
 * ========================================================================== */

/* ============================================================
 * UI 精修：空态 / 对齐 / 动画统一
 * ============================================================ */

/* 空态统一：留言板 / 反馈 / 回复 / 游戏 / 无结果 */
}
.fb-empty,
.block-empty {
  display: block;
  text-align: center;
  padding: 40px 16px;
  margin: 10px 0;
  color: var(--muted);
  font-size: 0.88rem;
  letter-spacing: 0.4px;
  line-height: 1.7;
  border: 1px dashed var(--border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
}
.fb-reply-empty {
  text-align: center;
  padding: 10px;
  color: var(--muted);
  font-size: 0.8rem;
}

/* 设置面板控件对齐：滑块弹性占宽，标签最小宽度一致 */
.range-row input[type="range"] { flex: 1; min-width: 0; }
.range-row > span:first-child { min-width: 84px; }

/* 卡片 hover 阴影提升（配合既有位移，不覆盖 transform） */
.resource-card:hover { box-shadow: 0 14px 34px rgba(0, 0, 0, 0.28); }
.quick-card:hover   { box-shadow: 0 10px 26px rgba(0, 0, 0, 0.22); }
.game-card:hover    { box-shadow: 0 10px 26px rgba(0, 0, 0, 0.22); }

/* 无障碍：用户偏好减少动态时，关闭全部动画/过渡 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* =========================================================
 * 移动端 auth-panel 登录/注册弹窗字号与间距适配
 * （手机端 input 与说明文字偏大，做紧凑化）
 * ========================================================= */
@media (max-width: 640px) {
  .auth-panel { max-width: calc(100vw - 24px); padding: 18px 16px; }
  .auth-panel .auth-title { font-size: 1.05rem; }
  .auth-panel .auth-field { margin-bottom: 10px; }
  .auth-panel .auth-field label { font-size: 0.78rem; margin-bottom: 4px; }
  .auth-panel .auth-input { font-size: 0.88rem; padding: 8px 10px; }
  .auth-panel .auth-hint { font-size: 0.72rem; line-height: 1.5; margin-top: 4px; }
  .auth-panel .auth-msg { font-size: 0.78rem; 

/* =========================================================
 * 管理后台：用户搜索 + 列表分页
 * ========================================================= */
}
.admin-search {
  flex: 1; min-width: 0; max-width: 260px;
  padding: 7px 12px; border-radius: 8px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
  font-size: 0.84rem; font-family: inherit;
  outline: none; transition: border-color 0.2s;
}
}
.admin-search::placeholder { color: var(--muted); opacity: 0.7; }
.admin-search:focus { border-color: var(--accent); }
html[data-theme="light"] .admin-search { background: rgba(0, 0, 0, 0.04); border-color: rgba(28, 75, 50, 0.18); }

.pager { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; align-items: center; margin-top: 14px; }
.pager-btn {
  min-width: 36px; height: 32px; padding: 0 10px;
  border: 1px solid var(--border); border-radius: 7px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text); font-size: 0.82rem;
  cursor: pointer; font-family: inherit;
  transition: all 0.15s;
}
.pager-btn:hover:not(:disabled):not(.active) { border-color: var(--accent); color: var(--accent); }
.pager-btn.active { background: color-mix(in srgb, var(--accent) 15%, transparent); border-color: var(--accent); color: var(--accent); font-weight: 600; }
.pager-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.pager-info { color: var(--muted); font-size: 0.78rem; margin-left: 8px; }
html[data-theme="light"] .pager-btn { background: rgba(0, 0, 0, 0.04); border-color: rgba(28, 75, 50, 0.15); }
@media (max-width: 640px) {
  .admin-search { max-width: 100%; font-size: 0.8rem; }
  .pager-btn { min-width: 32px; height: 30px; padding: 0 8px; font-size: 0.78rem; }
  .pager-info { font-size: 0.72rem; flex-basis: 100%; text-align: center; margin-left: 0; margin-top: 4px; }
}

/* =========================================================
 * 主站 header：◉ Zelm 品牌与副标题调小（仅 header 顶栏）
 * ========================================================= */
.brand { font-size: 1.1rem; gap: 8px; letter-spacing: 0.5px; }
.brand-col { display: flex; flex-direction: column; gap: 2px; }
.brand-icon { width: 28px; height: 28px; font-size: 0.78rem; box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 30%, transparent); }
.subtitle { font-size: 0.78rem; letter-spacing: 0.3px; margin: 0; }

/* =========================================================
 * 管理后台分页控件 UI 优化
 * ========================================================= */
.pager-btn { border-radius: 8px; transition: all 0.18s ease; }
.pager-btn:hover:not(:disabled):not(.active) { transform: translateY(-1px); box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 15%, transparent); }
.pager-btn.active {
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 90%, transparent), color-mix(in srgb, var(--accent-2) 90%, transparent));
  color: #022; border-color: transparent; font-weight: 700;
  box-shadow: 0 2px 10px color-mix(in srgb, var(--accent) 25%, transparent);
}

/* =========================================================
 * ① header 顶栏对齐：品牌与时钟顶端对齐
 * ========================================================= */
.header-top { align-items: flex-start; padding-top: 2px; }
.header-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; padding-top: 2px; }
.header-right .user-box { margin-top: 0; }

/* =========================================================
 * ② 统一 hero 标题与 section 标题字号（"Zelm 的信息资源库" ≈ "快捷网页"）
 * ③ hero 介绍文字与 about-card 介绍一致
 * ========================================================= */
.hero h1 {
  font-size: 32px;          /* 桌面 hero 主标题放大，凸显着陆感 */
  font-weight: 700;
  letter-spacing: 0.5px;
  margin-bottom: 14px;
  line-height: 1.25;
}
.hero p {
  font-size: 1.05rem;       /* 与放大后的标题协调 */
  line-height: 1.7;
  color: var(--muted);
}
.section-head h2 { font-size: 20px; font-weight: 600; color: var(--text); letter-spacing: 0.5px; }
html[data-theme="light"] .section-head h2 { color: #1a2e22; }

/* =========================================================
 * ④ 移动端 hero 字体略增 + 不溢出（与 about 介绍一致）
 * ========================================================= */
@media (max-width: 640px) {
  .hero { padding: 22px 14px; }
  .hero h1 { font-size: 24px; margin-bottom: 10px; }
  .hero p { font-size: 0.95rem; line-height: 1.65; }
  .search-wrap input { padding: 9px 16px 9px 40px; font-size: 0.9rem; }
  .search-icon { left: 14px; font-size: 1.1rem; }


/* =========================================================
 * ⑤ 全局水平滚动条主题化（青绿细滚条，符合界面主题）
 * ⑥ admin 控制台禁止横向溢出
 * ⑦ 预留滚动条槽位：开关设置/弹窗时不再因滚动条出现消失而左右抖动
 * ========================================================= */
}
html { scrollbar-gutter: stable; }
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--accent) 35%, transparent);
  border-radius: 4px;
  transition: background 0.2s;
}
::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--accent) 60%, transparent); }
html[data-theme="light"] ::-webkit-scrollbar-thumb { background: rgba(28, 75, 50, 0.3); }
html[data-theme="light"] ::-webkit-scrollbar-thumb:hover { background: rgba(28, 75, 50, 0.55); }

/* admin 整页禁止横向溢出（防止 pager/stats/table 在窄屏撑出横滚条） */
body { overflow-x: hidden; }   /* 已被 line 30 的 html overflow-x: hidden 覆盖全局，body 冗余加防 panel 自身溢出 */
.pager { max-width: 100%; flex-wrap: wrap; }
.table-wrap { overflow-x: auto; max-width: 100%; }
.stats { max-width: 100%; }
@media (max-width: 640px) {
  .stats { grid-template-columns: repeat(2, 1fr); gap: 10px; }
}

/* ==========================================================================
 * element-theme.css —— Element Plus 主题桥接
 *
 * 目的：让组件库的配色**跟随站点主题**，而不是 Element Plus 默认的蓝色 / 白底。
 *
 * ⚠️ 两个关键点：
 *
 * 1. 选择器必须是 `html:root`（特异性 0,1,1），不能只写 `:root`（0,1,0）。
 *    Element Plus 的变量定义在 `:root` 上，而它的组件 CSS 是**按需加载**的
 *    —— 组件用到时才 import，因此一定排在入口样式表**之后**。
 *    只写 `:root` 的话同特异性下后加载者胜，我们的覆盖会被它的默认值盖掉。
 *    `html:root` 多一个类型选择器，特异性更高，与加载顺序无关，稳定生效。
 *
 * 2. 值一律写 `var(--accent)` 这类**站点变量**，不要写死颜色。
 *    站点切换深浅主题时改的是 `--accent` / `--text` / `--surface` 这些变量，
 *    这里引用它们，组件库就自动跟着变，不需要维护两套配置。
 * ========================================================================== */

html:root {
  /* ---- 主色 / 语义色 ---- */
  --el-color-primary: var(--accent);
  --el-color-success: #34c38f;
  --el-color-warning: #f1b44c;
  --el-color-danger: #f46a6a;
  --el-color-error: #f46a6a;
  --el-color-info: var(--muted);

  /* ---- 文字 ---- */
  --el-text-color-primary: var(--text);
  --el-text-color-regular: var(--text);
  --el-text-color-secondary: var(--muted);
  --el-text-color-placeholder: var(--muted);
  --el-text-color-disabled: var(--muted);

  /* ---- 边框 ---- */
  --el-border-color: var(--border);
  --el-border-color-light: var(--border);
  --el-border-color-lighter: var(--border);
  --el-border-color-extra-light: var(--border);
  --el-border-color-hover: var(--accent);

  /* ---- 填充 / 背景 ----
     站点是毛玻璃半透明卡片，所以组件背景用 transparent，
     让底下的 --surface（带 backdrop-filter 的卡片）透出来，避免"一块死白/死黑"。 */
  --el-fill-color-blank: transparent;
  --el-fill-color: rgba(127, 127, 127, 0.12);
  --el-fill-color-light: rgba(127, 127, 127, 0.16);
  --el-fill-color-lighter: rgba(127, 127, 127, 0.1);
  --el-fill-color-dark: rgba(127, 127, 127, 0.24);
  --el-bg-color: var(--surface);
  --el-bg-color-page: var(--bg);
  --el-bg-color-overlay: var(--surface);

  /* ---- 圆角 / 阴影 ---- */
  --el-border-radius-base: 10px;
  --el-border-radius-small: 8px;
  --el-box-shadow-light: var(--shadow);
  --el-box-shadow: var(--shadow);

  /* ---- 尺寸 ---- */
  --el-font-size-base: 0.86rem;
  --el-component-size: 32px;
  --el-component-size-small: 28px;
}

/* 表格：与站点卡片融合（透明底 + 站点边框），去掉 Element Plus 默认的白底 */
html:root .el-table {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: transparent;
  --el-table-border-color: var(--border);
  --el-table-text-color: var(--text);
  --el-table-header-text-color: var(--muted);
  --el-table-row-hover-bg-color: rgba(127, 127, 127, 0.1);
  background-color: transparent;
}
html:root .el-table th.el-table__cell {
  background-color: transparent;
  font-weight: 500;
}
html:root .el-table td.el-table__cell,
html:root .el-table th.el-table__cell.is-leaf {
  border-bottom-color: var(--border);
}

/* 输入框 / 下拉：半透明，跟站点 .auth-input 一类控件观感一致 */
html:root .el-input__wrapper,
html:root .el-textarea__inner,
html:root .el-select__wrapper {
  background-color: rgba(127, 127, 127, 0.1);
  box-shadow: 0 0 0 1px var(--border) inset;
}
html:root .el-input__wrapper:hover,
html:root .el-textarea__inner:hover {
  box-shadow: 0 0 0 1px var(--accent) inset;
}
html:root .el-input__wrapper.is-focus,
html:root .el-textarea__inner:focus {
  box-shadow: 0 0 0 1px var(--accent) inset;
}

/* 弹窗：沿用站点毛玻璃卡片，而不是 Element Plus 的白底方块
   （2026-09-22 清理：.el-message-box / .el-drawer 全站已无组件使用，规则删除） */
html:root .el-dialog {
  background: var(--surface);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
html:root .el-dialog__title {
  color: var(--text);
}
html:root .el-dialog__body {
  color: var(--text);
}

/* 分页：el-pagination 已被各面板的自定义翻页替换（见 FeedbackPanel/UsersPanel 注释），
   .el-pager / .el-pagination 规则随之删除（2026-09-22 死代码清理）。 */

/* 标签：plain 风更贴合站点的轻量观感 */
html:root .el-tag {
  border-color: var(--border);
  background: transparent;
  color: var(--text);
}

/* 开关 / 滑块：主色跟随站点 */
html:root .el-switch.is-checked .el-switch__core {
  border-color: var(--accent);
  background-color: var(--accent);
}

/* 卡片 / 空状态 */
html:root .el-card {
  background: var(--surface);
  border-color: var(--border);
  color: var(--text);
}
html:root .el-empty__description p {
  color: var(--muted);
}


/* ---- specular 按钮：el-button 时代的抵消块已随按钮原生化删除 ----
 * 字体/盒模型/overflow:visible/color 已合并进上面的基础 .specular-btn 规则。 */

/* ==========================================================================
 * 旧手写按钮类 → 挂上 el-button 之后的统一处理
 *
 * 背景：迁移时**保留了原来的 class**（怕破坏布局和既有选择器），
 * 但这些旧规则里的 width/height/padding/display/background 会和 el-button
 * 自带的样式**叠加或互相覆盖**，表现为：
 *   · 同一处出现两层外观（底色 + 边框重复）——「重叠」
 *   · 圆形关闭按钮被拉成方形、侧边导航项不再等宽——「大小/对齐不一致」
 * 这里按「旧 class 现在的真实角色」显式定型，让 el-button 的尺寸让位给它们。
 * 用 html:root 提权是因为 el-button 的 CSS 按需加载、排在入口样式表之后。
 * ========================================================================== */

/* 圆形关闭按钮（弹窗 / 认证面板）：32×32 正圆 */
html:root .modal-close.el-button,
html:root .auth-close.el-button {
  width: 32px;
  height: 32px;
  min-width: 32px;
  min-height: 32px;
  padding: 0;
  border-radius: 50%;
}

/* 侧边导航项：块级、全宽、左对齐 —— 这一条同时修掉「不等宽」 */

/* 卡片右上角的小圆形删除按钮：22×22 */
html:root .item-del.el-button {
  width: 22px;
  height: 22px;
  min-width: 22px;
  min-height: 22px;
  padding: 0;
  border-radius: 50%;
}

/* 顶号冲突弹窗的胶囊按钮 —— 已改原生 <button>（原来这里是
   `html:root .conflict-btn.el-button { height:auto; min-height:auto }`，
   只是为了压掉 Element Plus 给按钮加的默认高度）。
   现在 .conflict-btn 自己的 padding/圆角就是最终值，不需要任何 el-* 覆盖。 */

/* 卡片网格：显式等高（grid 默认 stretch，这里写明以防某处被覆盖） */
html:root .project-grid,
html:root .stats-grid,
html:root .ql-grid,
html:root .res-grid,
html:root .quick-grid {
  align-items: stretch;
}
html:root .project-grid > *,
html:root .stats-grid > *,
html:root .ql-grid > *,
html:root .res-grid > *,
html:root .quick-grid > * {
  height: 100%;
}

/* 欢迎页底部控件组（主题切换 / 语言）：原来两个控件 103×32 与 105×32，差 2px，
   同一排看起来不齐。统一最小宽度 + 等高 + 内容居中。 */
html:root .gate-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
html:root .gate-controls > * {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  min-height: 32px;
  min-width: 132px;   /* 同时容纳"简体中文" + 🌐 + ▼ */
}

/* ==========================================================================
 * 欢迎页底部主题切换按钮 —— 跟语言切换对齐
 *
 * 之前问题：
 *   · `.gate-theme-seg` 被统一覆盖层强制 32px 高
 *   · 但内部 `.gate-theme-btn` 是 24px 圆形 (padding:4px 8px + border-radius:999px)
 *   · 加上 seg 自己的 padding:3px，按钮看起来"飘"在胶囊容器里
 *   · 而且 seg 是浅色半透明背景，跟**实心**的 lang-switcher 视觉不统一
 *
 * 修法：让 seg 内部按钮撑满（flex:1 + height:100%），去掉 seg 的 padding
 * 让两个按钮 + seg 一起形成一个无缝胶囊（视觉与 lang-switcher 一致）。
 * ========================================================================== */
html:root .gate-theme-seg {
  padding: 0;            /* 不要自己的 padding，让按钮铺满 */
  gap: 0;               /* 按钮之间 0 间距 */
  overflow: hidden;     /* **关键**：裁剪按钮让胶囊外型由容器决定 */
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
}
/* 主题胶囊按钮已原生化（.gate-theme-btn）：几何沿用 el-button 时代的实测值。
   特异性用 (0,2,0) 而非 html:root 提权 —— 让浅色主题的 html[data-theme="light"] 规则能赢。 */
.gate-theme-seg .gate-theme-btn {
  flex: 1;
  height: 32px;
  padding: 0 8px;
  margin: 0;
  border: none;
  background: transparent;   /* 非激活态透明 —— 高亮由容器/激活态给 */
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.9rem;
  font-weight: 500;
  border-radius: 0;        /* 按钮无圆角，由容器 999px 配合 overflow:hidden 统一圆角 */
}
.gate-theme-seg .gate-theme-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
}
.gate-theme-seg .gate-theme-btn.active {
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 90%, transparent), color-mix(in srgb, var(--accent-2) 90%, transparent));
  color: #022;
}

/* ==========================================================================
 * 欢迎页语言切换 —— 跟主题胶囊一致
 *
 * 之前问题：el-select 自己画了一个 999px 圆角的边框，**内部又**有一个
 * .el-select__wrapper (35×24) 的小灰底框 → 视觉上「双层嵌套」，
 * 而且跟左边无缝主题胶囊视觉风格不一致。
 *
 * 修法：把胶囊外型让给 .lang-switcher 容器统一画：
 *   · 容器 999px 圆角 + 描边 + 半透明背景 + overflow:hidden
 *   · el-select 透明无边框，flex:1 填满容器剩余空间
 *   · .el-select__wrapper（小灰框）去掉自己的背景
 * ========================================================================== */
html:root .gate-controls .lang-switcher {
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
  padding: 0 14px;
  display: flex;
  align-items: center;
}
html:root .gate-controls .lang-switcher .lang-switcher__select {
  border: none;
  background: transparent;
  width: auto;
  flex: 1;
  height: 100%;
  padding: 0;
  min-height: 0;
}
html:root .gate-controls .lang-switcher .lang-switcher__select .el-select__wrapper {
  background: transparent;
  box-shadow: none;
  border: none;
  padding: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  align-items: center;
}
html:root .gate-controls .lang-switcher .lang-switcher__select .el-select__wrapper .el-select__selection {
  display: flex; align-items: center;
}

/* 语言切换：select 文字不被截断 */
html:root .gate-controls .lang-switcher .lang-switcher__select .el-select__selected-item {
  max-width: none;
  white-space: nowrap;
}
html:root .gate-controls .lang-switcher .lang-switcher__select .el-select__wrapper .el-select__selection {
  width: auto;
  min-width: 0;
}

/* ==========================================================================
 * 设置面板：同一行控件撑满并平分 —— **已作废（2026-09-21）**
 *
 * 这段是给 el-radio-group / el-select 写的（Element Plus 默认
 * `display:inline-flex`，光 flex:1 不够，还得显式 display:flex）。
 * 排版重构后面板已不用任何 el-* 控件，分段控件换成原生 `.seg`/`.seg-btn`
 * （.seg 自带 flex-wrap + 按钮 flex:1 1 auto），本段全部失效，已删除。
 * 需要「分段控件等宽平分」时请看 `.settings-group .seg` / `.seg-btn`。
 * ========================================================================== */

/* Games 弹窗关闭按钮：旧 .modal-close 类已移除（避免与 el-button 叠成两层），
 * 圆形外观交给 el-button 的 circle 属性，这里只补**定位**。 */
#gameClose {
  position: sticky;
  top: 14px;
  margin-left: auto;
  display: block;
}

/* ==========================================================================
 * 搜索框：旧 CSS 给 `.search-wrap input` 画了一整套边框/背景/内边距，
 * 而 el-input 内部**本身就是一个 <input>**，于是出现
 *   el-input 自己的框 + 旧 CSS 的框 = **两层叠在一起**（用户截图的问题）。
 * 修法：样式只给 el-input 的 wrapper，内层 input 全部清空。
 * ========================================================================== */
html:root .search-wrap .el-input__wrapper {
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.25);
  box-shadow: 0 0 0 1px var(--border) inset;
  padding-left: 40px;
  padding-right: 14px;
}
html[data-theme="light"] .search-wrap .el-input__wrapper {
  background: rgba(0, 0, 0, 0.04);
  box-shadow: 0 0 0 1px rgba(28, 75, 50, 0.15) inset;
}
html:root .search-wrap .el-input__wrapper.is-focus {
  box-shadow: 0 0 0 1px var(--accent) inset,
              0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent);
}
html:root .search-wrap input.el-input__inner {
  border: none;
  background: transparent;
  box-shadow: none;
  padding: 0;
}

/* 弹窗关闭按钮：旧 .modal-close 类已移除（避免与 el-button 叠成两层），
 * 圆形外观交给 el-button 的 circle，这里只补**定位**（原本由 .modal-close 提供）。 */
#quickDetailClose,
#quickModalClose,
#gameClose {
  position: sticky;
  top: 14px;
  margin-left: auto;
  display: block;
}

/* ==========================================================================
 * 搜索框：旧 CSS 给 `.search-wrap input` 画了一整套边框/背景/内边距，
 * 而 el-input 内部**本身就是一个 <input>**，于是出现
 *   el-input 自己的框 + 旧 CSS 的框 = **两层叠在一起**（用户截图的问题）。
 * 修法：样式只给 el-input 的 wrapper，内层 input 全部清空。
 * ========================================================================== */
html:root .search-wrap .el-input__wrapper {
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.25);
  box-shadow: 0 0 0 1px var(--border) inset;
  padding-left: 40px;
  padding-right: 14px;
}
html[data-theme="light"] .search-wrap .el-input__wrapper {
  background: rgba(0, 0, 0, 0.04);
  box-shadow: 0 0 0 1px rgba(28, 75, 50, 0.15) inset;
}
html:root .search-wrap .el-input__wrapper.is-focus {
  box-shadow: 0 0 0 1px var(--accent) inset,
              0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent);
}
html:root .search-wrap input.el-input__inner {
  border: none;
  background: transparent;
  box-shadow: none;
  padding: 0;
}

/* 弹窗关闭按钮：旧 .modal-close 类已移除（避免与 el-button 叠成两层），
 * 圆形外观交给 el-button 的 circle，这里只补**定位**（原本由 .modal-close 提供）。 */
#quickDetailClose,
#quickModalClose,
#gameClose {
  position: sticky;
  top: 14px;
  margin-left: auto;
  display: block;
}

/* ==========================================================================
 * ⚠️ 恢复 .nav-item —— 之前删过头了
 *
 * About 页的侧边导航是**原生 <a class="nav-item">**（不是 el 组件），
 * 这些规则是它们**唯一**的外观来源。我在清理 Home 时把 CSS 一起删了，
 * 结果 About 导航退化成浏览器默认的蓝色小链接（padding:0 / color:#00e）。
 * 这里恢复。
 *
 * 注意：Home 的 SideNav 已经不用这些 class（改成原生 button + 组件内 scoped），
 * 所以不会造成「旧 CSS + el 组件」的叠加。
 * ========================================================================== */
.nav-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 11px 14px;
  height: auto;
  min-height: auto;
  border-radius: 12px;
  border: 1px solid transparent;
  background: none;
  color: var(--text);
  font-size: 0.92rem;
  font-family: inherit;
  text-decoration: none;
  cursor: pointer;
  transition: color 0.2s, background 0.2s, border-color 0.2s;
}
.nav-item:hover {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  border-color: color-mix(in srgb, var(--accent) 30%, transparent);
}
/* 汉堡菜单已彻底移除（用户要求「始终左侧导航 + 右侧内容」，不要全屏展开菜单）。 */

/* ==========================================================================
 * 【兜底】窗口 < 1280 但 JS 的 zoom 没生效时（浏览器缓存了旧 index.html /
 * 脚本执行时序问题），用 vw 保证「导航 : 内容」比例仍然恒定。
 *
 * 190 / 1280 = 14.84%  → 导航宽 14.84vw，内容 85.16vw，比值恒为 0.148。
 * 用 `html:not(.is-phone)` 限定：is-phone 生效时走 zoom 方案（字体/UI 也等比），
 * 这里只在「JS 没加上 is-phone」时才兜底。
 * ========================================================================== */
@media (max-width: 1279px) {
  html:not(.is-phone) .side-nav { width: 14.84vw !important; }
  /* ⚠️ 不能给 body 加 padding-left（#app 是 position:fixed，会跳过 body padding），
     也不能只给 main 加 margin-left（#viewRoot 宽度由内容撑开，会形成循环依赖，
     实测 main 宽只有 722 而非 920）。正确做法：给 #viewRoot 加 padding-left 让位。 */
  html:not(.is-phone):has(.side-nav) #viewRoot {
    left: 0 !important;
    padding-left: 14.84vw !important;
    box-sizing: border-box !important;
  }
  html:not(.is-phone) main.container {
    margin-left: 0 !important;
    margin-right: 0 !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
  }
}

/* About 导航排版与主站统一（2026-09-22：用户反馈排版不一样）。
   主站 SideNav 的 .nav-items / .nav-group 是 flex + gap:4px；about 页这两层是
   display:block —— 导航项贴死、分组无间距。这里对齐（#navItems 提特异性）。 */
html:root #navItems,
html:root #navItems .nav-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* About 导航的「设置」兼容块已删：2026-09-21 该按钮已换成原生
   <button class="nav-item">（与主站 SideNav 同构），不再需要 el-button 对齐补丁。 */

/* ==========================================================================
 * 弹窗聚焦：背景「模糊 + 压暗」→ 视觉焦点自然落在中间的弹窗上
 *
 * 参考的设计思路：**不为移动端单独做一套 UI**，而是靠「背景变暗、突出中间内容」
 * 让同一份 UI 在窄屏上也能用。这样维护一套代码就够了。
 *
 * 三件套（缺一不可）：
 *   ① blur(8px)        → 背后内容糊掉，只剩色块
 *   ② brightness(.55)   → 压暗（注意是**按比例**，浅色主题下是变灰不是变黑）
 *   ③ 半透明黑遮罩      → 补上 brightness 在浅色背景下不够暗的部分
 * ========================================================================== */
.modal-overlay {
  background: rgba(2, 8, 6, 0.55);
  backdrop-filter: blur(8px) brightness(0.55) saturate(120%);
  -webkit-backdrop-filter: blur(8px) brightness(0.55) saturate(120%);
}

/* Element Plus 的 el-dialog 遮罩（SettingsPanel / 各详情弹窗用的是它） */
.el-overlay,
.el-dialog__overlay {
  backdrop-filter: blur(8px) brightness(0.55) saturate(120%);
  -webkit-backdrop-filter: blur(8px) brightness(0.55) saturate(120%);
}

/* ==========================================================================
 * 窄屏（≤768px）：弹窗铺满宽度，配合上面的遮罩 = 「背景暗 + 中间突出」的聚焦效果
 * ========================================================================== */
@media (max-width: 768px) {
  /* ⚠️ 两个坑（实测 700px 窗口，打赏弹窗）：
   *
   * ① `margin: 12px auto` 会把弹窗**拉伸到整屏高**。
   *    Element Plus 的 `.el-overlay-dialog` 是 `display:flex`，`align-items` 默认
   *    `stretch`；只要上下 margin **不是 auto**，flex 拉伸就会生效 ——
   *    实测弹窗变成 1621px 高（屏高的 99%），打赏这种小弹窗被拉成一整屏。
   *    用 `margin: auto` 保持居中，同时避免被拉伸。
   *
   * ② `width: calc(100vw - 24px)` 在 body 有 zoom 时是错的。
   *    `vw` 按**真实视口**算，不随 zoom 缩放；700px 窗口下 100vw-24 = 676 CSS px，
   *    而设计画布是 1280 CSS px —— 于是 320px 的打赏弹窗被撑到 676px（两倍多）。
   *    改用 `max-width: 92%`（相对 .el-overlay-dialog，它已经被 zoom 缩过），
   *    只做「不超出屏幕」的兜底，不强行改宽。
   */
  .el-dialog {
    max-width: 92% !important;
    margin: auto !important;
    max-height: calc(100% - 24px);
    overflow-y: auto;
  }
  .el-dialog__body {
    /* 同上：vh 不随 zoom 缩放，改成相对弹窗自身的百分比 */
    max-height: none;
    overflow-y: visible;
  }
  /* 设置面板在窄屏也留出边距。
     ⚠️ 原来写的是 `width: calc(100vw - 24px) !important` —— 没有 min() 上限，
     于是在 768px 断点附近会出现「窗口变窄、面板反而变宽」的跳变：
     641px 时面板 520px，640px 时突然变成 616px。这里补上 520px 上限。 */
  .settings-modal {
    width: min(520px, calc(100vw - 24px)) !important;
    max-width: min(520px, calc(100vw - 24px)) !important;
  }
}

/* 登录/注册按钮 —— 分场景给尺寸（CSS 判断不了 UA，靠 index.html 加的 .is-phone class 区分）：
 *
 * ① 电脑端（默认）：紧凑尺寸（28px 高 / 12.5px 字）。用户反馈 32px 那版仍偏大。
 * ② 窄屏缩放版（.is-phone）：viewport=1280 缩到 0.32× 后默认尺寸看不清，
 *    所以比电脑端大一档（34px 高 + 14px 字），缩放后仍有 ~11px 视觉高度，可看清可点。
 * 两者都用同一组「内边距 + 字号」推算宽度，保证「登录 / 注册」两个按钮**等宽等高**。
 */
html:root #guestLogin,
html:root #guestRegister {
  padding: 5px 13px !important;
  font-size: 12.5px !important;
  min-height: 28px !important;
  height: 28px !important;
  line-height: 1 !important;
  border-radius: 7px !important;
  /* 等宽：两个按钮文字都是 2 个字，锁死最小宽度避免因字体渲染差 1px */
  min-width: 58px !important;
  box-sizing: border-box !important;
}
html.is-phone #guestLogin,
html.is-phone #guestRegister {
  padding: 9px 18px !important;
  font-size: 14px !important;
  font-weight: 600 !important;
  min-height: 34px !important;
  height: 34px !important;
  line-height: 1 !important;
  border-radius: 8px !important;
  min-width: 74px !important;
  box-sizing: border-box !important;
}
/* 两个按钮之间的间距：默认 8px 在紧凑尺寸下显得散，收到 6px */
html:root .guest-btns,
html.is-phone .guest-btns {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* 登录/注册按钮悬停**不要变成白色**（2026-09-22 用户反馈）：
   EP 默认按钮 hover 会给近白底（--el-color-primary-light-9），盖过深色主题。
   这里改成与全站一致的「描边强调」悬停；!important + html:root 压过 EP 按需加载的默认样式。 */
html:root #guestLogin:hover,
html:root #guestRegister:hover,
html:root #guestLogin:focus-visible,
html:root #guestRegister:focus-visible {
  background: color-mix(in srgb, var(--accent) 10%, transparent) !important;
  border-color: color-mix(in srgb, var(--accent) 45%, transparent) !important;
  color: var(--accent) !important;
}

/* ==========================================================================
 * 窄屏缩放版（.is-phone）：整页按 1280 渲染后用 CSS zoom 缩到屏幕宽。
 * 比改 viewport meta 可靠（浏览器对动态 viewport 不重新应用），
 * 比 transform: scale 友好（不影响 position:fixed 元素的视口定位）。
 * 0.32 = 400/1280（典型手机屏宽 / 视口逻辑宽），用户拉宽窗口时仍合理显示。
 * ========================================================================== */
/* 缩放在 index.html 的 JS 里通过 body.style.zoom = window.innerWidth/1280 动态设（Chrome 不支持 zoom: calc()） */

/* ==========================================================================
 * 缩放版（.is-phone）：强制导航栏回到「左侧竖条」布局（跟桌面 100% 一致）
 *
 * 因为上面 `@media (max-width: 768px)` 会把 .side-nav 改成**顶部横条**
 * （width:100% / height:auto / border-bottom），而 CSS 媒体查询**只看 innerWidth**，
 * 不看 zoom —— 缩放版下 innerWidth 仍是 400/700（< 768）→ 那条规则照样触发，
 * 于是导航栏被压成顶部横条。
 * 这里用更高特异性 + !important 把它强制拉回桌面布局。
 * ========================================================================== */
/* 缩放版下：#app 是 position:fixed; inset:0 不受 body padding 影响，所以
   #viewRoot 也得自己加 padding-left:190 让位给 fixed nav。 */
/* 缩放版下：body 不再让位（避免与 viewRoot 双让位），只让 #viewRoot 让位给 nav。 */
/* 缩放版下：父级（body / #viewRoot）全部清零，避免多级让位叠加。
   只让 main.container 让出 190px（nav 的 CSS 宽），缩放后视觉 = 190 * zoom = nav 视觉宽。 */
html.is-phone body,
/* ⚠️ 只有「有侧边 nav 的页面」（home / about）才需要让位 ——
   privacy / admin 没有 nav，让位会白空出 190px。
   用 :has(.side-nav) 精确匹配（SideNav 渲染在 #viewRoot 内）。 */
html.is-phone:has(.side-nav) #viewRoot {
  padding-left: 190px !important;
  padding-right: 0 !important;
  box-sizing: border-box !important;
}
/* #viewRoot 本身是 position:fixed; left:190px（缩放后 119 视觉），
   与 main 的 margin-left:190 叠加 = 2 倍偏移。缩放版下把 viewRoot 的 left 清零。 */
html.is-phone #viewRoot {
  left: 0 !important;
}
html.is-phone .side-nav {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: auto !important;
  bottom: 0 !important;
  width: 190px !important;
  /* ⚠️ 不要写 height: 100vh —— body 上有 zoom(≈0.56)，100vh 缩放后视觉只有 56vh，
     nav 背景只铺到屏幕一半（用户截图那个问题）。用 top:0 + bottom:0 让 fixed 自己撑满。 */
  height: auto !important;
  max-height: none !important;
  flex-direction: column !important;
  align-items: stretch !important;
  overflow: visible !important;
  padding: 18px 14px !important;
  gap: 8px !important;
  border-right: 1px solid var(--border) !important;
  border-bottom: none !important;
  background: rgba(6, 20, 18, 0.82) !important;
  transform: none !important;
}
/* body 已有 padding-left: 190px（让出 nav），不需要再给 main 加 margin */
html.is-phone .side-nav .nav-header {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  margin-bottom: 8px !important;
}
html.is-phone .side-nav .nav-brand {
  margin-bottom: 0 !important;
  /* 只留横向内边距：宽度由 width:100% 撑满（与导航项对齐），高度由 44px 锁死 */
  padding: 0 8px !important;
  white-space: nowrap !important;
  flex-shrink: 0 !important;
  font-size: 0.95rem !important;
}
html.is-phone .side-nav .nav-items,
html.is-phone .side-nav .nav-group {
  display: flex !important;
  flex-direction: column !important;
  flex-wrap: nowrap !important;
  gap: 4px !important;
  max-height: none !important;
  overflow: visible !important;
  padding-top: 0 !important;
}
html[data-theme="light"] html.is-phone .side-nav,
html.is-phone .side-nav {
  background: var(--surface) !important;
}
html[data-theme="light"].is-phone .side-nav {
  background: rgba(214, 236, 222, 0.9) !important;
}

/* 缩放版（html.is-phone）：main.container 的让位全部由 #viewRoot 的
   padding-left:190px 统一负责，这里只需清掉 margin —— **padding 不能清**：
   基础规则的 padding:20px 40px 140px 左右各 40px 是「内容区居中」的对称留白，
   清掉 padding-left 会让内容左边缘贴死导航、右边却有 40px（视觉上整个内容区
   像左对齐，2026-09-21 用户截图反馈的问题）。 */
html.is-phone .container {
  margin-left: 0 !important;
  margin-right: 0 !important;
}
/* 缩放版下 body 不需要再让位（让 main 自己让），否则 190+190 叠加 = 380 */
/* 缩放版下 body 仍保留 padding-left: 190px（让位给 nav），
   main 用 margin:0 不叠加。 */
/* 之前删的 body padding:0 错误 —— 修了 */

/* ==========================================================================
 * P2-11 / P2-12：无障碍补充（2026-09-23）
 *
 * .sr-only —— 视觉隐藏但保留给屏幕阅读器（toast 播报容器用）。
 * :focus-visible 安全网 —— 全仓有 21 处 `outline:none`（多为输入框去掉浏览器
 *   默认描边、改用自己的 box-shadow 焦点环）。若某个元素恰好没有配套的焦点环，
 *   键盘聚焦时会「看不见焦点在哪」。这里给所有键盘聚焦元素补一个清晰的焦点环，
 *   且不破坏已有更高特异性的 :focus-visible 规则（如 .resource-card 等）。
 * ========================================================================== */
.sr-only {
  position: absolute !important;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  /* 现代等价写法（原 clip: rect(0,0,0,0) 已被 stylelint property-no-deprecated 判为废弃） */
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* ==========================================================================
 * P3-7：打印样式 —— 隐藏固定浮层（侧栏 / 运势 / 弹窗 / 提示 / 背景层），
 * 只保留 #viewRoot 的正文内容，并去掉左侧导航占位，让打印稿干净可读。
 * ========================================================================== */
@media print {
  body {
    padding-left: 0 !important;
    background: #fff !important;
    color: #000 !important;
    overflow: visible !important;
  }
  .side-nav,
  .fortune-float,
  .fortune-popup,
  .modal-overlay,
  .session-kick-modal,
  .conflict-modal,
  .toast,
  .bg-layer,
  .overlay,
  .star-field,
  #overlayRoot {
    display: none !important;
  }
  .container {
    max-width: 100% !important;
    padding: 0 !important;
  }
  #viewRoot {
    overflow: visible !important;
    height: auto !important;
  }
}
</style>