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
import ContentManageDialog from '@/components/ContentManageDialog.vue';


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





/* 路由切换进度条（第四批）：由 router/index.js 守卫派发的 route-progress 事件驱动 */

onMounted(() => {

  const el = document.getElementById('routeProgress');

  if (!el) return;

  window.addEventListener('route-progress', (e) => el.classList.toggle('active', !!(e && e.detail)));

});

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
  <!-- 无障碍：键盘用户第一个 Tab 就能跳到主内容（WCAG 2.4.1） -->
  <a href="#viewRoot" class="skip-link">跳到主内容</a>


  <!-- 内容区：各页由路由组件渲染；切页时这里被替换，音乐不中断 -->


  <!-- 路由切换进度条（第四批）：懒加载 chunk 下载期间无提示，会让用户以为「点了没反应」 -->


  <div id="routeProgress" class="route-progress" aria-hidden="true"></div>


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

  <!-- 常驻：前台「管理」按钮的就地内容管理弹层（不再跳转 /admin） -->
  <ContentManageDialog />





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


@import './styles/shell.css';


@import './styles/footer.css';


@import './styles/settings.css';


@import './styles/gate.css';


@import './styles/home.css';


@import './styles/games.css';


@import './styles/portfolio.css';


@import './styles/fallback.css';


@import './styles/mobile.css';


@import './styles/overrides.css';


@import './styles/element-override.css';


@import './styles/late-overrides.css';


</style>