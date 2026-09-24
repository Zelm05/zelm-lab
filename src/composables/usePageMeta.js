/* ==========================================================================
 * src/composables/usePageMeta.js —— 视图级文档头（标题 / class / SEO meta）
 *
 * 取代原站伪 SPA 在挂载时的那段 head 操作（src/shell/legacy.js applyHead）：
 *   document.title = ...、document.documentElement.className = htmlClass、
 *   把该页的 meta 标签塞进 head。
 *
 * 四处有意改进：
 *   1) 只切换页面级 class（site-open），不再整体覆盖 className ——
 *      原实现会把 index.html 引导脚本加的 is-legacy / is-mobile / no-webgl2
 *      一并抹掉，导致旧内核浏览器丢掉降级样式。
 *   2) meta 节点随组件卸载移除，不需要外部定时清理。
 *   3) （P1-10，2026-09-23）写入前先摘掉 index.html 的「外壳默认 meta」，
 *      否则同一份 head 里并存两套 description / og:* / canonical（详见下方注释）。
 *   4) （2026-09-23）标题/描述改为**多语言**：PAGE_META 的文本字段是多语言桶，
 *      这里按当前 locale 取值生成；并 watch 语言切换，切语言时**实时重绘**
 *      title 与 meta（此前切语言后标签页标题仍是中文）。
 * ========================================================================== */
import { onUnmounted, watch } from 'vue';
import { PAGE_META } from '@/core/page-meta';
import { i18n } from '@/core/i18n';

/** HTML 属性转义（文本字段可能含 & 或引号） */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/** 取多语言桶在当前 locale 下的值，缺失回落 zh-CN */
function pick(bucket, loc) {
  if (!bucket) return '';
  return bucket[loc] || bucket['zh-CN'] || '';
}

/**
 * 由 PAGE_META[page] + 当前 locale 生成 meta/link 的 HTML 串数组。
 * 顺序与原静态定义保持一致（description → og:* → twitter:* → canonical）。
 */
function buildMetas(meta, loc) {
  const out = [];
  const desc = pick(meta.desc, loc);
  if (desc) out.push(`<meta name="description" content="${esc(desc)}">`);
  if (meta.og) {
    out.push('<meta property="og:type" content="website">');
    out.push(`<meta property="og:site_name" content="${esc(pick(meta.siteName, loc))}">`);
    out.push(`<meta property="og:title" content="${esc(pick(meta.ogTitle, loc))}">`);
    out.push(`<meta property="og:description" content="${esc(desc)}">`);
    out.push(`<meta property="og:url" content="${esc(meta.url)}">`);
    out.push(`<meta property="og:image" content="${esc(meta.image)}">`);
    const alt = pick(meta.imageAlt, loc);
    if (alt) out.push(`<meta property="og:image:alt" content="${esc(alt)}">`);
    out.push('<meta name="twitter:card" content="summary_large_image">');
    out.push(`<meta name="twitter:title" content="${esc(pick(meta.ogTitle, loc))}">`);
    out.push(`<meta name="twitter:description" content="${esc(desc)}">`);
    out.push(`<meta name="twitter:image" content="${esc(meta.image)}">`);
  }
  if (meta.canonical) out.push(`<link rel="canonical" href="${esc(meta.canonical)}">`);
  return out;
}

export function usePageMeta(page) {
  const meta = PAGE_META[page] || {};
  const nodes = [];

  function apply() {
    const loc = i18n.global.locale.value;

    const title = pick(meta.title, loc);
    if (title) document.title = title;

    // 页面级 class：home / about 需要 site-open（左侧导航占位）
    document.documentElement.classList.toggle('site-open', meta.htmlClass === 'site-open');
    document.body.setAttribute('data-view', page);

    // 清掉本页上一轮注入的节点（语言切换时重绘）
    nodes.splice(0).forEach((n) => n.remove());

    const list = buildMetas(meta, loc);

    // P1-10：进来先把 index.html 里的「外壳默认 meta」摘掉。
    //   原先只追加不移除 → head 里同时存在两套 description / og:* / canonical，
    //   搜索引擎与分享卡片取**先出现**的那套（外壳的泛化值），本页声明等于白写。
    //   外壳那组在 index.html 里标了 data-page-meta="shell"（社交爬虫不执行 JS，
    //   原始 HTML 仍需它们作兜底，所以不能从 index.html 删）。
    //
    //   只在「本页确实有自己的 meta」时才摘：admin 视图没有任何本页 meta，
    //   无条件摘会让管理台 head 里一条 description 都不剩 —— 保留外壳兜底更合理。
    if (list.length) {
      document.head.querySelectorAll('[data-page-meta="shell"]').forEach((n) => n.remove());
    }

    for (const html of list) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const node = doc.head.firstElementChild;
      if (!node) continue;
      node.setAttribute('data-page-meta', page);
      document.head.appendChild(node);
      nodes.push(node);
    }
  }

  apply();

  // 语言切换：实时重绘 title / meta
  const stop = watch(() => i18n.global.locale.value, apply);

  onUnmounted(() => {
    stop();
    nodes.splice(0).forEach((n) => n.remove());
  });
}
