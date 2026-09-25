import { createRouter, createWebHashHistory } from 'vue-router';



/* ==========================================================================

 * 路由

 *

 * 与原站的伪 SPA 路径**完全一致**，所以页面脚本里硬编码的 `#/home`、`#/about`、

 * `#/admin` 无需改写即可继续工作；Worker 侧仍把旧的干净 URL（/home、/about …）

 * 302 到对应的 hash 地址，老链接不会失效。

 *

 *   #/            欢迎页 gate

 *   #/home        主站首页

 *   #/about       关于我

 *   #/admin       管理控制台

 *   #/privacy     隐私政策与服务条款

 *   #/privacy/t   服务条款锚点（原 /privacy.html#terms）

 *

 * 每条路由现在指向**真实的视图组件**（原先是同一个 LegacyPage 外壳 + 挂载引擎）。

 * 视图按需加载，各页的 CSS 随各自的分包一起到达，首屏不必下载其它页的样式。

 *

 * ⚠️ `meta.page` —— 页面样式作用域，**勿删**

 *   各页的 CSS（src/styles/pages/*.css）原本是**独立 HTML 文档**的样式，改成 SPA 后由视图

 *   import，就变成了「懒加载的全局样式表」。而站内跳转是 same-document 导航，样式表

 *   **加载后永不卸载** —— 于是 privacy/admin/gate/about 里的 `:root`、`html[data-theme]`、

 *   `body{…}` 会一直盖在主站上。实测：访问过 #/privacy 再回 #/home，首页 **99.42% 像素不同**

 *   （字体、行高、强调色、body padding 全被改掉）。

 *   解决办法：这些 CSS 的每条选择器都加了 `html[data-page="xxx"]` 前缀，只在对应页面

 *   活跃期间生效。`meta.page` 就是这个前缀的取值，由下面的 afterEach 写到 `<html>` 上；

 *   离开该页（或进入没有 meta.page 的路由）时属性被删除，样式随之失效。

 *   新增页面若带独立 CSS，记得一并加 `meta.page`，否则那页样式会完全不生效。

 *

 * 模式仍用 hash：Workers 静态托管下零配置，深链接由 index.html 兜底，

 * 也不会与 Assets 的干净 URL 重定向打架。

 * ========================================================================== */

/** @type {import('vue-router').RouteRecordRaw[]} */

const routes = [

  { path: '/', name: 'gate', component: () => import('@/views/GateView.vue'), meta: { page: 'gate' } },

  // 原站脚本里有用 `#/gate` 显式跳欢迎页的（admin.body2.js 权限不足时

  // topNav('#/gate')）。hash 路由不经过 Worker 的旧地址 302，

  // 所以这里必须自己兜住，否则会落到最下面的通配规则被送进主站。

  { path: '/gate', redirect: '/' },

  { path: '/home', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { page: 'home' } },

  { path: '/about', name: 'about', component: () => import('@/views/AboutView.vue'), meta: { page: 'about' } },

  { path: '/admin', name: 'admin', component: () => import('@/views/AdminView.vue'), meta: { page: 'admin' } },
  { path: '/ebook', name: 'ebook', component: () => import('@/views/EbookView.vue'), meta: { page: 'home' } },

  { path: '/privacy', name: 'privacy', component: () => import('@/views/PrivacyView.vue'), meta: { page: 'privacy' } },

  {

    path: '/privacy/t',

    name: 'privacy-terms',

    component: () => import('@/views/PrivacyView.vue'),

    // 与 #/privacy 同一个组件、同一份 CSS，所以 page 也必须是 privacy

    meta: { scrollTo: 'terms', page: 'privacy' },

  },

  { path: '/:pathMatch(.*)*', redirect: '/home' },

];



const router = createRouter({

  history: createWebHashHistory(),

  routes,

  // 滚动归零由 App.vue 负责（真正的滚动容器是 #viewRoot，不是 window，

  // 路由自带的 scrollBehavior 只管 window，在这里用不上）

  scrollBehavior: () => undefined,

});



/* ==========================================================================

 * 页面样式作用域：把 meta.page 写到 <html data-page="…">

 *

 * 见文件头 `meta.page` 的说明。放在 afterEach（而不是各视图的 onMounted）有两个好处：

 *   1) 时序确定 —— afterEach 在路由确认后、视图渲染前同步执行，不会出现

 *      「新页已挂载、旧页 onUnmounted 还没跑」导致属性被误删的竞态；

 *   2) 集中管理 —— 没有 meta.page 的路由（如通配重定向）会**主动清除**属性，

 *      不会残留上一页的作用域。

 * ========================================================================== */

router.afterEach((to) => {

  const page = /** @type {string|undefined} */ (to.meta && to.meta.page);

  if (page) document.documentElement.dataset.page = page;

  else delete document.documentElement.dataset.page;



  /* 切页后重算缩放 / is-phone。

     index.html 里的 hashchange 监听虽然也会跑，但 Vue 组件是**懒加载**的，

     只靠 hashchange 的 rAF 时机可能早于组件渲染 → 出现「切页后布局错、刷新才正常」。

     这里在 afterEach 主动补一次（afterEach 在路由确认后同步执行，时序确定）。 */

  if (typeof window !== 'undefined' && typeof window.__zelmApplyZoom === 'function') {

    window.__zelmApplyZoom();

  }

});



/* 路由切换进度条（第四批）：懒加载 chunk 在线上首次进入某路由时要下载，

 * 期间没有任何提示会让用户以为「点了没反应」。守卫派发事件给 App.vue 顶部的进度条。 */

const __rp = (show) => window.dispatchEvent(new CustomEvent('route-progress', { detail: !!show }));

router.beforeEach(() => __rp(true));

router.afterEach(() => { setTimeout(() => __rp(false), 120); });

router.onError(() => __rp(false));



export default router;

