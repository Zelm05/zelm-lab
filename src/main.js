import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import router from './router';
import { SUPABASE_URL } from '@/core/supabase';

/* 外壳级副作用：跨标签页主题同步（原拆在 boot.js 与各页 head 内联脚本里，现在只留一处） */
import '@/core/boot';

/* 文案库：vue-i18n 实例（中文源 + 多语言 JSON），支持实时切换 / localStorage 记忆。 */
import { installI18n, initI18nHtmlLang, i18n } from '@/i18n';

/* 全局样式：原站单张 style.css（5409 行）已按分节拆到 styles/site/，
   由 styles/index.css 按原书写顺序统一 @import（顺序敏感，勿调整）。

   ⚠️ 这里**不再**引入 src/styles/music-player.css —— 2026-09-19 已删除。
   那份文件是当年「admin.html 只引它、不引全量 style.css」的产物，
   为此把主站的规则整份复制了一遍（127 条）。SPA 化后两个文件总是一起加载，
   副本在层叠里靠后 → **真正生效的一直是副本**，主站那份改了不生效。
   现已把差异逐条并回主站（生效值不变），127 条全部验证为逐字符重复后整份移除。
   文件留在 .workbuddy-ai/backup/ 备查。 */

/* ==========================================================================
 * 应用入口
 *
 * 关于 UI 组件库（Element Plus）与图表库（ECharts）：
 *   不做全量注册。实测 Element Plus 全量引入 = 940KB（302KB gzip）**直接进首屏**，
 *   是相对原零依赖站最大的首屏回退。页面 UI 全部沿用原站手写样式，
 *   组件库只留待新功能按需引入：
 *     - Element Plus：unplugin-vue-components + ElementPlusResolver
 *     - ECharts：动态 import('echarts')，仅在打开图表页时下载
 * ========================================================================== */
const app = createApp(App);

/* P2-23：前端错误上报。Vue 渲染/逻辑错误 + 未捕获 Promise rejection 统一打到
   /api/client-error（后端仅 console.error，不落库，避免 D1 写入放大）。
   不阻塞原有错误展示：仍走 console.error，上报失败也不影响业务。 */
function reportClientError(payload) {
  try {
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch (e) { /* 上报失败不影响业务 */ }
}

app.config.errorHandler = (err, instance, info) => {
  console.error('[vue-error]', err, info);
  reportClientError({
    message: err && err.message ? err.message : String(err),
    stack: err && err.stack ? String(err.stack) : '',
    url: location.href,
    info: info || '',
  });
};

window.addEventListener('unhandledrejection', (e) => {
  const reason = e && e.reason ? e.reason : null;
  console.error('[unhandledrejection]', reason);
  reportClientError({
    message: reason && reason.message ? reason.message : String(reason),
    stack: reason && reason.stack ? String(reason.stack) : '',
    url: location.href,
    info: 'unhandledrejection',
  });
});

/* 性能（2026-09-25）：提前与 Supabase 建连（DNS + TCP + TLS）。
   照片墙 / 动态的图片都来自 SUPABASE_URL，而它们是等 `/api/content/photos`、`/api/content/moments`
   这些接口返回后才发起请求的 —— 提前握手能给首张图省掉一个 RTT。
   ⚠️ 用**运行时注入**而不是写死在 index.html：URL 可被 VITE_SUPABASE_URL 覆盖，
      写死的话一旦换了环境，hint 指向的域名和实际取图的域名不一致，白搭一次连接。 */
function preconnectSupabase() {
  try {
    const pc = document.createElement('link');
    pc.rel = 'preconnect';
    pc.href = new URL(SUPABASE_URL).origin;
    pc.crossOrigin = '';
    document.head.appendChild(pc);
  } catch (e) { /* URL 异常或环境不支持 → 跳过，不影响业务 */ }
}
preconnectSupabase();

installI18n();
initI18nHtmlLang();

app.use(i18n);
app.use(createPinia());
app.use(router);

app.mount('#app');
