# zelm-vue

<div align="center">

**🌐 Language / 语言：** 简体中文 · [English](README.en.md)

</div>

个人作品集站点。前端 Vue 3 + Vite，后端 Hono，**单 Worker** 部署在 Cloudflare（Workers + D1 静态托管）。

A personal portfolio site. Vue 3 + Vite front end, Hono back end, deployed as a **single Cloudflare Worker** (Workers + D1, serving both the API and the built static assets).

---

## 技术栈 / Tech Stack

| 层 / Layer | 技术 / Technology |
|---|---|
| 前端框架 | Vue 3（`<script setup>`）+ Vite 7 |
| 路由 / 状态 | vue-router 4（hash 模式）· Pinia |
| 国际化 | vue-i18n 11 — 简体中文 / 繁體中文 / English / 日本語 |
| UI | Element Plus + Vant 4（按需引入）· ECharts 6 · ogl（WebGL 背景特效） |
| 后端 | Hono 4 on Cloudflare Workers |
| 数据库 | Cloudflare D1（SQLite） |
| 认证 | PBKDF2-SHA256 口令哈希 + JWT（HttpOnly Cookie），三级角色 `user < admin < owner` |
| 部署 | wrangler —— 一个 Worker 同时提供 `/api/*` 与 `dist/` 静态产物 |

---

## 目录结构 / Project Structure

```
zelm-vue/
├─ index.html               # Vite 入口（含两段内联脚本，其 sha256 供 CSP 使用）
├─ vite.config.js           # 构建 + vitest 配置
├─ wrangler.toml            # Worker / D1 / 静态产物绑定
├─ jsconfig.json            # 类型检查（checkJs，仅覆盖 worker/ 与 src/stores/）
├─ package.json
├─ .dev.vars.example        # 环境变量模板（复制为 .dev.vars 使用，本体不入库）
├─ README.md / README.en.md # 本文档（中文默认 / English）
├─ LICENSE                  # MIT
├─ DOMAIN_BINDING.md        # 自定义域名绑定记录
├─ .github/workflows/ci.yml # CI：lint → stylelint → test → build
├─ worker/                  # ★ 部署主体：Hono 应用
│  ├─ index.js              #   入口：安全响应头 / CSP / 静态兜底 / 路由分发
│  ├─ api.js                #   认证、用户、管理台接口
│  ├─ auth.js               #   PBKDF2、JWT、Cookie、限流
│  ├─ community.js          #   留言板、回复、反馈
│  ├─ settings.js           #   站点配置
│  ├─ about.js              #   关于页密码
│  ├─ moderation.js         #   审核日志（软删 + 审计）
│  └─ reports.js            #   CSP / 前端错误上报落点
├─ src/                     # Vue 前端源码
│  ├─ views/ components/ stores/ router/ core/ i18n/ modules/ lang/ …
├─ public/                  # 静态资源（照片、背景、下载包、robots/sitemap）
├─ migrations/              # D1 建表与演进 SQL（schema.sql + migration-*.sql）
├─ scripts/                 # csp-hash.mjs（重算内联脚本哈希）· d1-backup.ps1（导出备份）
├─ tests/                   # vitest 单测 + Playwright e2e
└─ local-test/              # 纯本地测试环境（start.cmd / reset.cmd / seed SQL）
```

---

## 快速开始 / Quick Start

**要求**：Node.js `>= 20.19`（见 `package.json` 的 `engines`）。

```bash
npm install

# 1) 本地环境变量（必须，否则登录接口 500）
cp .dev.vars.example .dev.vars      # Windows: Copy-Item .dev.vars.example .dev.vars
#   然后把 JWT_SECRET 换成一段随机串

# 2) 起开发服务
npm run dev        # 只跑 Vite 前端开发服务器（最快，但不含 Worker / API）
npm run dev:full   # 构建前端 + 起本地 Worker → http://127.0.0.1:8787（推荐，全栈联调）
```

本地集成测试环境（含一键脚本、账号初始化说明）见 [`local-test/README.md`](local-test/README.md)。

---

## 环境变量 / Environment Variables

| 变量 | 必填 | 说明 |
|---|---|---|
| `JWT_SECRET` | **是** | 登录 Cookie（JWT）签名密钥；未设置时登录接口返回 500 |
| `SEED_OWNER_SALT` | 否 | 站长账号预置盐；与 `SEED_OWNER_HASH` 任一缺失则跳过站长自动创建 |
| `SEED_OWNER_HASH` | 否 | 站长账号预置哈希（参数须与 `worker/auth.js` 一致） |

- 本地：写入 `.dev.vars`（已 gitignore，**不会**入版本库）。
- 生产：`wrangler secret put JWT_SECRET`（不要写进 `wrangler.toml`，那会进版本库）。

---

## 数据库 / Database (D1)

- 绑定名 `DB`，库名 `auth-db`（见 `wrangler.toml` 的 `[[d1_databases]]`）。
- `migrations/schema.sql` 是**基线**；`migrations/migration-*.sql` 是后续演进，**需按文件名顺序依次执行**。

```bash
# 本地
npx wrangler d1 execute auth-db --local  --file=./migrations/schema.sql
npx wrangler d1 execute auth-db --local  --file=./migrations/migration-add-avatar.sql
#   … 其余 migration-*.sql 逐个执行（顺序即文件名顺序）

# 生产（务必先备份）
npm run db:backup
npx wrangler d1 execute auth-db --remote --file=./migrations/migration-xxx.sql
```

> ⚠️ `npm run db:init` 只执行 `schema.sql`，**不含**后续迁移。全新库若只跑它，注册等接口会因缺列而 500 —— 必须把 `migrations/migration-*.sql` 补齐。
> 回滚脚本见 `migrations/rollback-pwd-params-and-moderation-log.sql`。

---

## 部署 / Deploy

```bash
npm run deploy     # = vite build && wrangler deploy
```

推荐顺序（涉及线上数据时）：

1. **备份**：`npm run db:backup`
2. **迁移**：`npx wrangler d1 execute auth-db --remote --file=./migrations/<新的>.sql`
3. **部署**：`npm run deploy`

说明：自定义域名（`luminae.dpdns.org`）在 `wrangler.toml` 的 `[[routes]]` 中**默认注释**，避免抢占既有线上流量；确认无误后再放开。完整绑定步骤见 [`DOMAIN_BINDING.md`](DOMAIN_BINDING.md)。

---

## 质量校验 / Quality

```bash
npm run lint        # ESLint
npm run stylelint   # Stylelint
npm run typecheck   # tsc --noEmit（jsconfig.json，jsconfig 只覆盖 worker/ 与 src/stores/）
npm test            # vitest 单测
npm run test:e2e    # Playwright（需先 npx playwright install chromium；本地跑，不进 CI）
npm run build       # 生产构建
```

CI（`.github/workflows/ci.yml`）在 push 到 `main` 及 PR 时执行：`lint → stylelint → test → build`。发布是手动动作，不进 CI。

---

## 安全约定 / Security Notes

- **所有密钥不入库**：只提交 `.dev.vars.example`；`.dev.vars` 与 `wrangler secret` 的值一律不写进仓库或文档。
- **响应头由 Worker 下发**：CSP / X-Frame-Options / X-Content-Type-Options / HSTS / Referrer-Policy / Permissions-Policy 见 `worker/index.js`。
- **CSP 当前为观察期**：`worker/index.js` 的 `CSP_ENFORCE = false`，即严格策略暂以 `Content-Security-Policy-Report-Only` 下发并把违规上报到 `/api/csp-report`；收集一段时间无异常后改为 `true` 切正式。
- **改动 `index.html` 的内联脚本后**必须重算哈希并更新 `worker/index.js` 中的常量：
  ```bash
  npm run build && node scripts/csp-hash.mjs
  ```

---

## 许可 / License

MIT © 2026 Zelm05 —— 见 [`LICENSE`](LICENSE)。
