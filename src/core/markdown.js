/* ==========================================================================
 * src/core/markdown.js —— 轻量 Markdown 渲染（转义优先，防 XSS）
 *
 * 从 src/components/AiChatModal.vue 原样搬出来（P1-4f）。这两个都是**纯函数**：
 *   一段文本进，一段 HTML 字符串出；不碰 DOM、不碰 i18n、不碰 store。
 *   和 core/format.js 同一个理由 —— 纯函数放 core，可随处引用、可单测。
 *   （此前它们埋在组件里，**一条单测都没有**，而这里恰好是唯一的安全闸门。）
 *
 * ⚠️ 安全模型（改这里之前务必先读完）：
 *   核心是「**先转义、再套标记**」。escHtml 把 & < > " 全部实体化，之后所有
 *   替换规则都只在「已经没有裸 < >」的串上工作，所以模型输出里的 HTML 不可能
 *   穿透。有意放行的 HTML 只有本文件自己拼出来的那几个标签
 *   （pre / code / strong / em / a），其中 <a> 的 href 被正则限定为 https?://
 *   —— 因此不会出现 javascript: 之类的协议注入。
 *   **顺序不可调整**：先套标记再转义会把标记本身也转义掉；而漏掉开头的
 *   escHtml，模型输出就能直接注入 HTML。这两条都有 tests/markdown.test.js 兜着。
 *
 * ⚠️ 代码块先摘出来占位、**最后**才还原：占位符必须等所有行内规则跑完再换回，
 *   否则块内文本（`code`、**bold** 之类）会被行内规则误伤。占位符用 Unicode
 *   私用区字符 \uE000 包住序号 —— 模型输出里不可能出现，不会被撞上。
 * ========================================================================== */

/** HTML 转义：& < > " → 实体。它是整个渲染流程的第一道、也是唯一必需的闸门。 */
export function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 把一段（可能是模型输出的）文本渲染成受限 HTML 字符串。
 *  @param {string|null|undefined} raw 原始文本；null/undefined 视为空串
 *  @returns {string} HTML 字符串，可直接交给 v-html
 */
export function renderMarkdown(raw) {
  const src = escHtml(raw == null ? '' : raw);
  /* 代码块先摘出来占位，避免块内文本被后续规则误伤 */
  const blocks = [];
  let txt = src.replace(/```([\s\S]*?)```/g, (_, code) => {
    blocks.push('<pre class="ai-code"><code>' + code.replace(/^\w*\n/, '') + '</code></pre>');
    return '\uE000' + (blocks.length - 1) + '\uE000';
  });
  /* 行内形态：`code` → **bold** → *italic* → [text](http链接) */
  txt = txt
    .replace(/`([^`\n]+)`/g, '<code class="ai-inline-code">$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  /* 换行 → <br>；代码块占位还原 */
  txt = txt.replace(/\n/g, '<br>').replace(/\uE000(\d+)\uE000/g, (_, i) => blocks[Number(i)] || '');
  return txt;
}
