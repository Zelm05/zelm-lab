# zelm-vue 项目对比诊断报告（Vue 3 最佳实践体检）

> 审计对象：`D:\Documents\GitHub\zelm-lab`（package name: `zelm-vue`）
> 审计日期：2026-09-30
> 审计方法：静态扫描 + 关键文件通读 + 量化指标。**所有结论附证据（文件路径 / 行号 / 命令实测）**，不靠推断。

---

## 0. 前提澄清（重要）

用户原始需求模板是「原生 HTML/CSS/JS → Vue 3 重构对比」。但**实测工作区项目已经是标准 Vue 3 工程**，因此本报告不是「要不要上 Vue」，而是「已是 Vue 3，内部是否仍符合最佳实践」的**架构体检**。

证据（已将项目实际状态与「标准 Vue 3 目标态」逐项比对）：
- 依赖已是 npm/Vite 管理：`vue` `vue-router` `pinia` `vue-i18n` `element-plus` `echarts` `pdfjs-dist`（devDeps 含 `vite` `vitest` `eslint` `stylelint` `prettier` `typescript` `husky` `playwright` `wrangler`）。
- 目录已是标准结构：`src/components`(含 `admin/` `home/` 子模块)、`src/views`、`src/composables`、`src/stores`(Pinia)、`src/router`、`src/i18n`+`src/lang`、`src/core`、`src/data`、`src/styles`、`src/types`。
- 40 个 `.vue` 文件 **100% 使用 `<script setup>`**，零 Options API / mixins（实测）。
- `index.html` 无外部 CDN `<script>`（实测全文），库全部走打包。

结论：**本项目无需「重构上 Vue」，真正的技术债集中在「样式层」与「状态/副作用边界」**。

---

## 1. 总体健康度评分

| 维度 | 权重 | 得分(0-10) | 一句话判定 |
|---|---|---|---|
| 1 目录结构 | 10 | 8 | 标准但 `core/`、`modules/` 是 catch-all，职责混杂 |
| 2 组件化程度 | 15 | 7 | 拆分合理，但有 4 个 600+ 行 god-component，重复 UI 模式未全抽象 |
| 3 数据与状态管理 | 15 | 7 | Pinia 规范，但 3 个 store 混入数据获取副作用 + 导航抽象泄漏 |
| 4 路由管理 | 10 | 8 | Vue Router 规范，但伪 SPA 残留 + CSS 作用域靠 hack |
| 5 样式管理 | 15 | **4** | **最弱项**：6435 行全局 CSS 永不卸载、203 个 `!important`、三层终裁层、顺序敏感 |
| 6 构建与工程化 | 15 | 9 | 优秀：按需引入、错误上报、a11y、完整工具链；仅 94 处硬编码 URL |
| 7 代码复用与逻辑抽离 | 10 | 6 | composables 已用，但命令式 DOM/Canvas 副作用散落、未 composable 化 |
| **加权总分** | **100** | **≈ 7.0** | **架构基本规范，样式层与状态边界是主要技术债** |

---

## 2. 七维度详细诊断

### 2.1 目录结构

| 项 | 内容 |
|---|---|
| **现状（已达标）** | 标准 Vue 工程目录：`components / views / composables / stores / router / i18n / data / types` 齐全 |
| **痛点 / 反模式（证据）** | ① `src/core/` 是 catch-all：22 个文件混装基础设施(`i18n.js` `boot.js` `session.js`)、数据访问(`supabase.js`)、UI 副作用(`motion.js` `page-meta.js`)、业务(`site-cfg.js` `ai-chat-store.js`)；② `src/modules/` 同时放纯逻辑接口(`auth-panel.js` `confirm.js`)与命令式 DOM/Canvas 副作用(`effects/*` `photo-wall.js` `games/index.js` `toast.js`)；③ `src/main.js:14-22` 注释写「拆到 `styles/site/`」但实际是 `src/styles/`（文档漂移，误导） |
| **最佳实践** | 按职责分层：`infra/`(i18n,boot,session,http)、`data/`(supabase,content-api)、`utils/`(format,image,motion)、`components/`(按 feature 分子目录) |
| **改进难度** | 中（纯目录重组，不影响运行，但需调整全局 import 路径） |
| **改进建议** | 渐进式：先拆 `core/` 为 `infra/ data/ utils/`；把 `modules/effects/*` 迁入 `composables/` 或 `utils/dom/`；修正 `main.js` 注释 |

### 2.2 组件化程度

| 项 | 内容 |
|---|---|
| **现状（已达标）** | 40 个 `.vue`，拆分粒度整体合理（admin/、home/ 子目录，PdfViewer 等可复用组件已抽） |
| **痛点 / 反模式（证据）** | ① God components（实测行数）：`AboutView.vue` 846、`AiChatModal.vue` 807、`ContentPanel.vue` 718、`AdminView.vue` 623 —— 单文件过大，难维护/难单测；② 重复 UI 模式（`.vue` 内语义类出现次数实测）：`.panel` ×21、`.modal` ×7、`.btn` ×7、`.card` ×4，提示卡片/弹窗/按钮仍有重复手写，未完全抽象成基础组件 |
| **最佳实践** | 基础组件 `BaseModal` / `BaseButton` / `BaseCard` 收敛通用 UI；大视图按区块拆子组件 |
| **改进难度** | 中 |
| **改进建议** | 渐进式：抽 `BaseModal/BaseButton/BaseCard`；把 `AiChatModal` 的消息列表/输入框/额度条、`AboutView` 的证书/简历/照片墙区块拆为子组件 |

### 2.3 数据与状态管理

| 项 | 内容 |
|---|---|
| **现状（已达标）** | Pinia 8 个 store，响应式系统使用正确；`about/admin/site-cfg/settings/auth` 相对干净 |
| **痛点 / 反模式（证据）** | ① **状态与数据获取边界模糊（重要）**：8 个 store 中 `content.js` `library.js` `user.js` 直接在 store 内调 `fetch`/`supabase`/`.from()`（实测标 `[副作用][async]`），违反「store 管状态、service 管请求」；② **导航抽象泄漏**：全站 10 处用 `shell.goPage('#/about')`（伪 SPA 残留适配器），仅 5 处用 `router.push` —— 两套导航并存，路由守卫/进度条/scroll 逻辑可能漏覆盖（`core/shell.js` 仍被 `AboutPwModal/HomeView/GateView/admin.js` import）；③ 持久化散落：`theme` 存 `localStorage('zelm_settings')`，`ai-chat` 有 legacy 迁移，`session` 守护在 `App.vue:157` 直接启动 |
| **最佳实践** | Store 只持有 state + actions（调用 service）；数据访问统一进 `src/api/*` 或 `src/services/*`；导航统一走 `router.push` |
| **改进难度** | 中 |
| **改进建议** | **必须重写数据层**：抽 `services/` 承载 fetch/supabase，store 改为调用 service 并提交结果；渐进式把 `shell.goPage` 替换为 `router.push`（保留 `goPage` 作兼容薄壳） |

### 2.4 路由管理

| 项 | 内容 |
|---|---|
| **现状（已达标）** | `createWebHashHistory`，路由表清晰、懒加载、`meta.page` 作用域、进度条(`route-progress`)、`#viewRoot` scroll 处理（`router/index.js`） |
| **痛点 / 反模式（证据）** | ① 仍用 hash 模式（Worker 静态托管零配置下的可接受妥协，非硬伤）；② 伪 SPA 残留：`shell.goPage` 适配器仍在用（见 2.3）；③ **CSS 作用域靠 `<html data-page>` hack**：因懒加载的全局页面 CSS 永不卸载，必须用 `html[data-page="x"]` 前缀隔离，否则页面间样式互相污染——`router/index.js` 注释实测记载「访问过 #/privacy 再回 #/home，首页 99.42% 像素不同」。这是「全局 CSS 不卸载」的 workaround，根因在 2.5 |
| **最佳实践** | 页面样式优先 `scoped`；全局样式按需显式卸载或用 CSS Modules；新页面不必依赖 `data-page` 前缀 |
| **改进难度** | 低-中 |
| **改进建议** | 渐进式：新页面一律 scoped；把仍用全局 page-CSS 的视图样式迁进组件 scoped；长期目标消除 `data-page` 前缀 hack |

### 2.5 样式管理【最弱维度 · 重点】

| 项 | 内容 |
|---|---|
| **现状（已达标）** | 已拆 12 个 CSS 切片；组件侧 15 个 `scoped` vs 11 个全局 `<style>` |
| **痛点 / 反模式（证据）** | ① **6435 行全局 CSS 永不卸载**：路由懒加载的页面 CSS 是「全局样式表」，same-document 导航后不卸载 → 被迫用 `data-page` 前缀隔离 + 注释警告「新增页面必须加 `meta.page` 否则样式不生效」（`router/index.js:39-58`），高维护负担、易踩坑；② **203 个 `!important`**（实测 `styles/` 全量统计），`late-overrides.css` / `overrides.css` / `element-override.css` **三层「终裁层」**靠加载顺序 + `!important` 压特异性，本质是特异性战争；③ **顺序敏感**：`App.vue:327-341` 注释明言「文件内先后顺序必须保持原样，调换顺序会造成样式回归」，并曾做三重字节校验才敢拆——说明层叠已脆弱到无法自由调整；④ 11 个组件仍用非 scoped 全局 `<style>`，引入全局污染风险 |
| **最佳实践** | 新样式一律 scoped；用特异性/CSS 变量而非 `!important`；设计令牌统一管理颜色/间距/阴影；全局 CSS 仅放 reset + 设计变量 |
| **改进难度** | **高**（技术债最深处，任何大改需全站视觉回归） |
| **改进建议** | 短期(必须)：**冻结新增 `!important`** + 新样式强制 scoped；中期：11 个全局 `<style>` 组件迁 scoped、page-CSS 移入对应视图 scoped、逐步去掉 `data-page` 前缀；长期：引入设计令牌（CSS 变量），评估 UnoCSS/Tailwind 收敛原子类 |

### 2.6 构建与工程化

| 项 | 内容 |
|---|---|
| **现状（已达标）** | Vite 构建、依赖 npm 管理、**`index.html` 零 CDN 脚本**（实测全文）；Element Plus 按需(`unplugin-vue-components`) + ECharts 动态 `import()`，首屏不堆砌；错误上报(`main.js:50-69` 的 `errorHandler`+`unhandledrejection`→`/api/client-error`)、`preconnect` 优化(`main.js:76-85`)、首屏同步主题引导防闪烁(`index.html:108-159`)、a11y(`skip-link`/`sr-only`/`aria`)；工具链完整 ESLint+Stylelint+Prettier+TS+Husky+Vitest+Playwright |
| **痛点 / 反模式（证据）** | ① **94 处硬编码 URL**（域名/ip 写死，实测），仅 **1 处**用 `import.meta.env` —— 环境切换(dev/prod/预览)不灵活；② `main.js:14` 注释引用 `styles/site/` 实际不存在（文档漂移）；③ `index.html` 内联两段引导脚本(theme/zoom)——必要但属「必须同步执行」的遗留 |
| **最佳实践** | 集中配置：`src/config/env.js` 统一管理域名/端点；`import.meta.env` 注入环境差异；文档与代码一致 |
| **改进难度** | 低 |
| **改进建议** | 抽 `src/config/env.js` 集中管理端点；把硬编码 URL 改为配置引用；修正 `main.js` 注释 |

### 2.7 代码复用与逻辑抽离

| 项 | 内容 |
|---|---|
| **现状（已达标）** | composables 已存在且被用：`useDialog` `useManageDialog` `usePageMeta` `useSwipePagination` `useDragSort`；`AboutView` 已抽 `PdfViewer` 等 |
| **痛点 / 反模式（证据）** | ① 命令式 DOM/Canvas 副作用散落 `modules/effects/*`（`particle-text.js` `specular-button.js` `warp-text.js`）、`photo-wall.js` `games/index.js` `toast.js` `confirm.js`——实测标 `[DOM操作]`，这些「逻辑模块」强耦合 DOM，未做成 composable（无生命周期自动管理，需手动 init/destroy）；② `shell.js` 适配器(`goPage`/`onUnmount`)是伪 SPA 残留，组件仍依赖其生命周期钩子；③ `AiChatModal` 的翻译额度记账逻辑与组件强耦合，未抽 composable |
| **最佳实践** | 副作用逻辑封装为 composable（用 `onMounted/onUnmounted` 自动管理 canvas/DOM 生命周期）；业务逻辑与视图解耦 |
| **改进难度** | 中 |
| **改进建议** | 渐进式把 `effects/*` 改造为 composable（自动管理 canvas 生命周期）；把 AiChat 的额度/会话逻辑抽 `useAiChat` composable |

---

## 3. 已达标项（正面清单，无需动）

- ✅ 全量 `<script setup>` Composition API，零 Options API / mixins（40/40 实测）
- ✅ Pinia 状态管理规范（8 store）
- ✅ Vue Router 懒加载 + 进度条 + scroll 处理
- ✅ 重型库按需引入（Element Plus 按需 + ECharts 动态 import），首屏优化到位
- ✅ 错误上报 + a11y 基础（skip-link、sr-only、aria）
- ✅ 完整工程化工具链 + 118 单测（实测 `vitest` 118 passed）
- ✅ 深色主题 + 多主题 + i18n 四语

---

## 4. 优先行动清单（按杠杆排序）

**P0 —— 必须先做，防止技术债继续累积**
1. **冻结新增 `!important`** + 新样式强制 `scoped`（防样式层继续恶化）
2. **抽 `services/` 数据层**，把 `content.js`/`library.js`/`user.js` 内的 `fetch`/`supabase` 移出 store（解耦状态与副作用）

**P1 —— 中期**
3. 11 个全局 `<style>` 组件迁 scoped；page-CSS 移入 scoped，去 `data-page` 前缀
4. `shell.goPage` → `router.push` 渐进替换（保留 `goPage` 兼容壳）
5. 抽 `BaseModal/BaseButton/BaseCard`；拆分 4 个 god-component

**P2 —— 长期**
6. 设计令牌化 + 评估原子 CSS（UnoCSS/Tailwind）
7. 配置集中化（`env.js`），消除 94 处硬编码 URL
8. `core/` `modules/` 目录重组

---

## 5. 改进难度总表

| 改动项 | 难度 | 风险 | 建议策略 |
|---|---|---|---|
| 冻结 `!important` / 强制 scoped | 低 | 低 | 立即执行（约定 + lint 规则） |
| 抽 services 数据层 | 中 | 中（需保 118 测试不破） | 渐进，按 store 逐个迁移 |
| 全局 `<style>` 迁 scoped | 中 | 中（视觉回归） | 配 Playwright 截图对比 |
| `shell.goPage`→`router.push` | 低 | 低 | 渐进替换 |
| 拆分 god-component | 中 | 低 | 按区块拆子组件 |
| `data-page` 前缀去化 | 高 | 高（全站样式） | 长期，随页面重写自然消除 |
| 设计令牌 / 原子 CSS | 高 | 中 | 长期，新建页面先采用 |
| 配置集中化 | 低 | 低 | 立即，消除硬编码 |

---

## 6. 重构风险与阻塞

- **样式层重构风险最高**：`data-page` hack + 顺序敏感 + 203 `!important`，任何大改必须全站视觉回归（建议用现有 Playwright 做截图 baseline 对比）。
- **store 抽 service** 需保证现有 118 单测不破，建议先补 service 层测试再迁移。
- **不建议一次性重写**：采用「先冻结新增、再渐进替换」策略，避免引入回归。
- **无需 VPN / 无需远程操作**：本报告全部为本地代码静态分析，未涉及部署、D1、线上验证。

---

## 附：本次审计使用的实测命令与输出（可追溯）

- 组件规模/`<script setup>`/scoped/!important：`node` 遍历 `src` 统计 → 40 `.vue`、`<script setup>` 40/40、`<style scoped>` 15 vs 全局 11、`styles/` 内 `!important` 共 **203** 处。
- stores 副作用：实测 `content.js`/`library.js`/`user.js` 标 `[副作用][async]`。
- 导航调用：实测 `shell.goPage` 10 处、`router.push/useRouter` 5 处。
- 硬编码 URL：实测 **94** 处，`import.meta.env` 仅 **1** 处。
- 全局 CSS：`styles/` 12 文件，合计约 **6435** 行。
- 单测基线：本会话实测 `vitest` **118 passed (11 files)**。
