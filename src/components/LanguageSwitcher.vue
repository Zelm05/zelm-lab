<script setup>
/* ==========================================================================
 * LanguageSwitcher.vue —— 语言切换下拉（简/繁/英/日）
 *
 * 复用 LANGS（@/core/i18n 内登记）与 setLocale（实时切换 + localStorage 记忆）。
 * 纯原生 <select> 外观，移动端 / PC 端都原生适配，无额外依赖。
 *
 * 样式在 src/styles/lang-switcher.css（由本文件 import，交给 Vite 打包）——
 * 与 AuthPanel.vue → auth-panel.css 同一约定。
 * ⚠️ 不要改回组件内联的 scoped 样式块：那样写时深色主题的规则会被 Vue 的
 *    `:global()` 处理吃掉后代选择器，且项目主题用的是 `data-theme` 属性而非 class，
 *    结果是深色下近白字配近白底、文字完全看不见。原因详见那个 CSS 文件顶部。
 * ========================================================================== */
import { computed } from 'vue';
import { i18n, LANGS, setLocale } from '@/core/i18n';

const current = computed({
  get: () => i18n.global.locale.value,
  set: (v) => setLocale(v),
});

/* 原生 <select>：@change 给的是原生事件对象，取 e.target.value。
 * ⚠️ 曾经改回 el-select，那时 @change 给的是**新值**（string）不是事件对象，
 *    写法是 onChange(v) 直接收字符串。现在改回原生，别把这两种写法搞混。 */
function onChange(e) {
  setLocale(e.target.value);
}
</script>

<template>
  <div class="lang-switcher">
    <label class="lang-switcher__label" for="langSelect">🌐</label>
    <select id="langSelect" class="lang-switcher__select" :value="current" @change="onChange">
      <option v-for="l in LANGS" :key="l.code" :value="l.code">{{ l.name }}</option>
    </select>
  </div>
</template>

<!-- 样式原在 src/styles/lang-switcher.css，已合并进本组件 -->
<style>
/* 来自 lang-switcher.css（合并进组件，未加 scoped —— 保持与原来一致的全局作用域） */
/* ============================================================================
 * lang-switcher.css —— 语言切换下拉（LanguageSwitcher.vue）
 *
 * 为什么独立成文件，而不是写在组件的 \3c style scoped> 里
 *   本组件原本是全项目**唯一**用 `\3c style scoped>` 的地方，而 scoped 在这里踩了两个坑：
 *
 *   1) **`:global()` 会吃掉后代选择器**。原文写的是
 *        :global(html.dark) .lang-switcher__select { … }
 *      编译后只剩
 *        html.dark { … }
 *      —— `.lang-switcher__select` 整个消失，规则变成给 `<html>` 本身设背景色。
 *      （实测：从 dev server 取该组件的样式模块，编译产物里就只有 `html.dark { … }`。）
 *
 *   2) **主题机制写错了**。本项目主题不是 class，而是 `<html data-theme="dark|light">`
 *      （见 src/core/boot.js）。`html.dark` 这个 class 全站从未出现过
 *      （实测 `<html>` 的 class 只有 `toc-on` / `site-open`），所以即便选择器没被吃掉也永远不命中。
 *
 *   两者叠加：深色主题下下拉框吃基础规则的浅色兜底 `var(--surface-2, #f3f6f8)`，
 *   而 `color` 取到 `--text`（≈#e8fbf7）—— 近白字 + 近白底，对比度约 **1.03:1**，
 *   **文字完全看不见**（有截图为证）。
 *
 * ⚠️ 为什么每条规则都带 `.lang-switcher` 祖先前缀 —— 不是啰嗦，是在补特异性
 *   scoped 会给选择器加一个属性，把 `.lang-switcher__select` 抬到 (0,2,0)。
 *   去掉 scoped 后只剩 (0,1,0)，就**输给**设置面板里的 `.settings-group select` (0,1,1) ——
 *   实测：设置面板中的语言下拉被当成普通设置项渲染，丢了圆角、内边距和下拉箭头。
 *   加上 `.lang-switcher` 祖先后每条都回到 (0,2,0)/(0,3,0)，与 scoped 时期**完全等价**。
 *   改动这里时请保持前缀，别"顺手简化"掉。
 *
 * 主题适配：直接用站点变量即可，它们本身随 `<html data-theme>` 变化，
 *   不再需要写"深色覆盖"。
 * ========================================================================== */

.lang-switcher {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.lang-switcher .lang-switcher__label {
  font-size: 15px;
  line-height: 1;
  opacity: 0.85;
  user-select: none;
}

.lang-switcher .lang-switcher__select {
  appearance: none;
  -webkit-appearance: none;
  /* 用站点变量，深浅主题自动跟随。
     原来写的是 `var(--surface-2, #f3f6f8)` —— `--surface-2` 全站从未定义，
     等于永远吃兜底值，深色下就成了近白底配近白字。 */
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 6px 28px 6px 10px;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238aa' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.lang-switcher .lang-switcher__select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(79, 240, 208, 0.18);
}

/* 展开后的选项列表由系统渲染。设置面板里 `.settings-group select option` 会给出
   深色底，这里统一按当前主题给一次，避免出现深底深字。 */
.lang-switcher .lang-switcher__select option {
  background: var(--bg);
  color: var(--text);
}

/* ==========================================================================
 * 统一胶囊外观（欢迎页 + 设置面板两处通用）
 *
 * 历史：模板曾在「原生 <select>」与「el-select」之间来回改过。
 *   走 el-select 时这里堆了一批 `.el-select__wrapper` 之类的内部类覆盖，
 *   因为 el-select 渲染成 div 结构，上面给原生控件写的 `appearance: none`
 *   / `background-image` / `option` 规则对它**完全无效**。
 *   现在统一回到原生 <select>：一套规则就够，不再需要任何 `.el-*` 覆盖。
 * ========================================================================== */
html:root .lang-switcher {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
  box-sizing: border-box;
}
html[data-theme="light"] .lang-switcher {
  background: rgba(255, 255, 255, 0.7);
  border-color: rgba(45, 122, 90, 0.2);
}
html:root .lang-switcher .lang-switcher__select {
  border: none;
  background: transparent;
  box-shadow: none;
  height: 100%;
  min-height: 0;
  padding: 0 22px 0 0;
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text);
  /* 背景里的下拉箭头（原生 select 的 appearance 已被上面那条基础规则去掉） */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238aa' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 4px center;
}

/* 设置面板里：撑满控件列宽（与其他控件右边缘对齐） */
html:root .settings-group .lang-switcher {
  display: flex;
  width: 100%;
  justify-content: flex-start;
}
html:root .settings-group .lang-switcher .lang-switcher__select {
  width: 100%;
}

</style>
