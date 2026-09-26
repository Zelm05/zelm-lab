/* ==========================================================================
 * ESLint flat config (ESLint 9+) —— 对齐标准 Vue3 工程化
 *
 * 设计取舍：
 *   - 不加 eslint-plugin-import：项目用 `@/` 别名但没有 tsconfig/jsconfig，
 *     import resolver 无从配；不加 import 插件就不触发 no-unresolved，
 *     `@/core/foo` 之类的路径不会被误报。
 *   - 用 vue.configs['flat/recommended'] + js.configs.recommended 作底，
 *     在 overrides 里对已知有意的写法放宽（v-html / 单字组件名 / console）。
 *   - eslint-config-prettier 必须放最后，关闭与 Prettier 冲突的格式规则。
 *   - 暂不加 @typescript-eslint：项目当前全 JS，TS 迁移是独立大工程。
 *   - lint 只报不修（不挂 husky/lint-staged），先让人看到全貌再决定要不要卡提交。
 *
 * 跑法：npm run lint（查错）/ npm run lint:fix（修能自动修的）。
 * ========================================================================== */
import js from '@eslint/js';
import vue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  /* ---- 忽略项 ---- */
  {
    ignores: [
      'dist/**',
      /* ⚠️ `dist/**` **不匹配** `dist.stale-<时间戳>/` —— 构建前把旧 dist 改名让开时
         留下的目录会被当成源码扫描（实测 0 错 → 3800+ 错）。必须单独忽略这一族。 */
      'dist.stale-*/**',
      'node_modules/**',
      'public/**',
      '.workbuddy-ai/**',
      'local-test/**',
      '.wrangler/**',
      'migrations/**',
      'reference/**',
      'src/vendor/**',
      '*.min.js',
    ],
  },

  /* ---- JS 基线 ---- */
  js.configs.recommended,

  /* ---- Vue 3 基线 ---- */
  ...vue.configs['flat/recommended'],

  /* ---- .vue 文件：vue-eslint-parser + 模板检查 ---- */
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: { ...globals.browser },
    },
  },

  /* ---- 纯 JS：浏览器 + Node（config / scripts 用了 process）---- */
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
  },

  /* ---- 项目定制：把已知有意的写法从 error 降为 warn 或关闭 ---- */
  {
    rules: {
      /* 全站故意用 v-html 渲染隐私/条款里的 <strong>、<a>（isHtml 包提供） */
      'vue/no-v-html': 'off',
      /* 单字组件名（Gate / Home / About / Admin）改起来要动路由，保持现状 */
      'vue/multi-word-component-names': 'off',
      /* dev 工具与 wrangler 脚本里 console 必要；src 里仅允许告警/报错日志
         （WebGL 降级、teardown 失败），worker 的服务端日志单独放行 */
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      /* 暂不卡死，先让人看到全貌；想收紧时改为 'error' */
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_', varsIgnorePattern: '^_',
        caughtErrors: 'none',  /* 项目惯用 catch 静默吞错（注释在旁），不报 */
      }],
      'vue/no-unused-vars': 'warn',
      /* Element Plus 体积大，自定义 resolver 已按需直连，关掉这条避免误报 */
      'vue/require-default-prop': 'off',
    },
  },

  /* ---- Worker（Cloudflare 服务端）：日志走 console 是正常做法 ---- */
  {
    files: ['worker/**/*.js'],
    rules: { 'no-console': 'off' },
  },

  /* ---- 本地脚本（scripts/）：CLI 工具，console.log 就是它的输出手段 ----
     上面 no-console 只放行 warn/error，是为了约束 src（浏览器端日志噪音）；
     而 scripts/csp-hash.mjs 这类脚本的全部价值就是把结果打到 stdout，
     因此与 worker 同样整体放行。 */
  {
    files: ['scripts/**/*.{js,mjs,cjs}'],
    rules: { 'no-console': 'off' },
  },

  /* ---- 单测（tests/）：vitest globals ----
     见 vite.config.js 的 `test.globals` 说明：本环境下测试文件若
     `import { describe } from 'vitest'` 会取到另一份模块实例、导致收集阶段整体失败，
     因此统一从全局取 vitest API。ESLint 需要显式声明这些全局，否则 no-undef 报一片。 */
  {
    files: ['tests/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        suite: 'readonly',
        beforeAll: 'readonly',
        beforeEach: 'readonly',
        afterAll: 'readonly',
        afterEach: 'readonly',
      },
    },
  },

  /* ---- Prettier 兼容：最后挂，关掉冲突的格式规则 ---- */
  prettier,
];