/* ==========================================================================
 * src/composables/usePageMeta.js —— 视图级文档头（标题 / class / SEO meta）
 *
 * 取代原站伪 SPA 在挂载时的那段 head 操作（src/shell/legacy.js applyHead）：
 *   document.title = ...、document.documentElement.className = htmlClass、
 *   把该页的 meta 标签塞进 head。
 *
 * 两处有意改进：
 *   1) 只切换页面级 class（site-open），不再整体覆盖 className ——
 *      原实现会把 index.html 引导脚本加的 is-legacy / is-mobile / no-webgl2
 *      一并抹掉，导致旧内核浏览器丢掉降级样式。
 *   2) meta 节点随组件卸载移除，不需要外部定时清理。
 *
 * 第三处（P1-10，2026-09-23）：写入前先摘掉 index.html 的「外壳默认 meta」，
 *   否则同一份 head 里并存两套 description / og:* / canonical（详见下方注释）。
 * ========================================================================== */
import { onUnmounted } from 'vue';
import { PAGE_META } from '@/core/page-meta';

export function usePageMeta(page) {
  const meta = PAGE_META[page] || {};

  document.title = meta.title || document.title;

  // 页面级 class：home / about 需要 site-open（左侧导航占位）
  document.documentElement.classList.toggle('site-open', meta.htmlClass === 'site-open');
  document.body.setAttribute('data-view', page);

  // 视图级 SEO meta：避免所有视图共用外壳初始 meta 导致摘要与分享卡片错乱
  //
  // P1-10：进来先把 index.html 里的「外壳默认 meta」摘掉。
  //   原先只追加不移除 → head 里同时存在两套 description / og:* / canonical，
  //   搜索引擎与分享卡片取**先出现**的那套（外壳的泛化值），本页声明等于白写。
  //   外壳那组在 index.html 里标了 data-page-meta="shell"（社交爬虫不执行 JS，
  //   原始 HTML 仍需它们作兜底，所以不能从 index.html 删）。
  //
  //   只在「本页确实有自己的 meta」时才摘：admin 视图的 PAGE_META.metas 是空数组，
  //   无条件摘会让管理台 head 里一条 description 都不剩 —— 保留外壳兜底更合理。
  if ((meta.metas || []).length) {
    document.head.querySelectorAll('[data-page-meta="shell"]').forEach((n) => n.remove());
  }

  const nodes = [];
  for (const html of meta.metas || []) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const node = doc.head.firstElementChild;
    if (!node) continue;
    node.setAttribute('data-page-meta', page);
    document.head.appendChild(node);
    nodes.push(node);
  }

  onUnmounted(() => {
    nodes.forEach((n) => n.remove());
  });
}
