/* ==========================================================================
 * Stylelint flat config (v17) —— 对齐标准 Vue3 工程化
 *
 * 设计取舍：
 *   - 项目 CSS 几乎全部位于 .vue 的 <style> 块（App.vue 单文件约 5500 行 + 各组件），
 *     独立 .css 文件为 0。扫 .vue 必须用 postcss-html 作为 customSyntax，
 *     否则会把 <script> 内容当 CSS 解析直接报 CssSyntaxError。
 *   - **不自动修复**这 5500 行级联样式（项目非 git 仓库，格式化会制造海量 diff 且
 *     「层叠位置就是语义」——shorthand 覆盖 longhand、同声明重复等常是刻意的）。
 *     Stylelint 在这里的定位是：给**今后的新增/修改**兜底（语法错误、未知属性、
 *     无效值等真问题）。
 *   - ⚠️ Stylelint 17 已**移除全部纯格式规则**（indentation/string-quotes/
 *     declaration-colon-* 等迁去 @stylistic/stylelint-plugin）——这里不能 null 它们，
 *     否则报 Unknown rule。格式统一交给 Prettier。
 *   - 遗留 CSS 的刻意写法（rgba 旧记法、驼峰 id/keframes 名、vendor 前缀、
 *     单行多声明紧凑块）逐条放宽，避免「假错误淹没真问题」。
 *
 * 跑法：npm run stylelint（查错）。
 * ========================================================================== */
import stylelintConfigStandard from 'stylelint-config-standard';

/** @type {import('stylelint').Config} */
export default {
  extends: [stylelintConfigStandard],
  ignoreFiles: [
    'dist/**',
    'node_modules/**',
    'public/**',
    '.workbuddy-ai/**',
    'local-test/**',
    '.wrangler/**',
    'reference/**',
    '**/*.min.css',
  ],
  overrides: [
    {
      /* .vue 的 <style> 块：postcss-html 负责抽出 <style>，<script>/<template> 不会误解析 */
      files: ['**/*.vue'],
      customSyntax: 'postcss-html',
      rules: {
        /* Vue SFC 特有伪类/伪元素放行（:deep / ::v-deep 等） */
        'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['deep', 'global'] }],
        'selector-pseudo-element-no-unknown': [true, { ignorePseudoElements: ['v-deep', 'v-global', 'v-slotted'] }],

        /* ---- 遗留级联样式的刻意写法（项目记忆：层叠位置就是语义） ---- */
        'selector-class-pattern': null,        /* 命名由层叠顺序赋予语义 */
        'selector-id-pattern': null,           /* #viewRoot/#guestLogin 等被 JS 按名引用，勿改 */
        'keyframes-name-pattern': null,        /* @keyframes spin 等刻意保留 */
        'no-duplicate-selectors': null,
        'no-descending-specificity': null,
        'property-no-vendor-prefix': null,     /* -webkit- 前缀是兼容写法 */
        'value-no-vendor-prefix': null,
        'declaration-block-no-shorthand-property-overrides': null,  /* shorthand 盖 longhand 是手法 */
        'declaration-block-no-duplicate-properties': [true, { ignore: ['consecutive-duplicates-with-different-values'] }],
        'declaration-block-no-redundant-longhand-properties': null, /* 手写四边展开可读性更好 */
        'declaration-block-single-line-max-declarations': null,     /* 紧凑单行块是既有节奏 */

        /* ---- 数值/颜色旧记法不强推现代写法 ---- */
        'color-function-alias-notation': null, /* rgba() 不强制改 rgb() */
        'alpha-value-notation': null,
        'color-function-notation': null,
        'hue-degree-notation': null,
        'media-feature-range-notation': null,  /* max-width 旧记法 */
        'selector-not-notation': null,         /* :not(a):not(b) 旧记法 */
        'declaration-property-value-keyword-no-deprecated': null,
        /* 字体名大小写/引号两条规则互相打架（'Consolas' 报大小写、Consolas 报引号），全关 */
        'value-keyword-case': null,
        'font-family-name-quotes': null,
        'shorthand-property-no-redundant-values': null,
        'length-zero-no-unit': null,
        'import-notation': null,

        /* ---- 空行节奏不卡（新增代码想保持整洁靠自觉/Prettier） ---- */
        'at-rule-empty-line-before': null,
        'comment-empty-line-before': null,
        'declaration-empty-line-before': null,
        'rule-empty-line-before': null,
      },
    },
    {
      /* 独立 .css（当前为 0，留着以防未来添加） */
      files: ['**/*.css'],
      rules: {
        'selector-class-pattern': null,
        'selector-id-pattern': null,
        'keyframes-name-pattern': null,
        'no-descending-specificity': null,
        'custom-property-pattern': null,
        'property-no-vendor-prefix': null,
        'value-no-vendor-prefix': null,
        'color-named': 'never',
        'import-notation': null,
        'at-rule-empty-line-before': null,
        'comment-empty-line-before': null,
        'declaration-empty-line-before': null,
        'rule-empty-line-before': null,
      },
    },
  ],
};