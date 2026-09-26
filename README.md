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
├─ .github/workflows/      # ci.yml（检查）+ deploy.yml（push main 自动构建并部署）
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
| `SUPABASE_SERVICE_ROLE_KEY` | 否 | Supabase 上传/删除用的 service_role 密钥；缺失时上传接口返回 501 |
| `SUPABASE_URL` | 否 | Supabase 项目 URL；不设则用代码内兜底常量（URL 是公开信息） |
| `TRANSLATE_PROVIDER` | 否 | 机器翻译供应商：`deepl` / `google` / `openai` / `cloudflare`；不设则按优先级自动挑 |
| `CF_TRANSLATE_MODEL` | 否 | Workers AI 用的模型，默认 `@cf/meta/llama-3.2-3b-instruct` |
| `DEEPL_API_KEY` | 否 | DeepL 密钥（免费版用 `api-free.deepl.com`） |
| `GOOGLE_TRANSLATE_API_KEY` | 否 | Google Cloud Translation 密钥 |
| `OPENAI_API_KEY` | 否 | OpenAI 密钥（用 `gpt-4o-mini`，按 JSON 数组批量翻） |

> Workers AI **不需要环境变量** —— 它是 `wrangler.toml` 的 `[ai]` 绑定，见下文「机器翻译怎么开」。

- 本地：写入 `.dev.vars`（已 gitignore，**不会**入版本库）。
- 生产：`wrangler secret put JWT_SECRET`（不要写进 `wrangler.toml`，那会进版本库）。

### 机器翻译怎么开

后台编辑页的「机器翻译」按钮调用 `POST /api/admin/translate`，**密钥只在 Worker 侧**（前端拿不到也传不了）。

有三种开法，**按推荐顺序**：

**① Cloudflare Workers AI（推荐：零密钥、不用注册第三方）**

`wrangler.toml` 里已经写好 `[ai]` 绑定，**开箱即用**，不用配任何 secret：

```toml
[ai]
binding = "AI"
remote = true
```

- 默认模型 `@cf/meta/llama-3.2-3b-instruct`（$0.0509/M 输入、$0.335/M 输出 tokens）。
- 想换模型：`wrangler secret put CF_TRANSLATE_MODEL`。
- ⚠️ **不要**换成 `@cf/meta/m2m100-1.2b`：它只有 `zh` 一个中文码，**分不出简繁** ——
  本项目的 zh-CN / zh-TW 会被当成同一种语言，翻出来等于没翻。LLM 才能做简→繁转换。
- ⚠️ **`remote = true` 是必须的**：AI 绑定没有本地模拟（不加时 `wrangler dev` 会显示
  `Mode: not supported`）。代价是**本地开发也会真的调云端模型**（可能产生费用，与线上一致）。
- 计费按 Neurons，每天有免费配额；超出后按模型单价计。不用的话把 `[ai]` 整段注释掉即可。

**② 第三方 API（配了就会优先于 Workers AI）**

```bash
wrangler secret put DEEPL_API_KEY          # 或
wrangler secret put GOOGLE_TRANSLATE_API_KEY
wrangler secret put OPENAI_API_KEY
wrangler secret put TRANSLATE_PROVIDER     # 可选：显式指定 deepl/google/openai/cloudflare
```

**③ 都不用** → 接口返回 501，后台提示"未配置机器翻译"。

**优先级**：`TRANSLATE_PROVIDER` 显式指定 > DeepL > Google > OpenAI > Workers AI。
（外部密钥优先，Workers AI 作零配置兜底。）

**共同行为**：
- 机翻结果**只填进表单、不落库**，站长确认/修改后走正常保存；界面标「机翻草稿，待校对」。
- 单次上限 5000 字符（防手滑烧配额）；超时 20s；配额不足 / 密钥无效 / 返回格式异常都给人话提示。
- 空字段不送翻译，但**保持下标对应**，不会把译文错位填到别的字段。

---

## Supabase 存储桶 / Storage Buckets

文件（图片、PDF）存在 Supabase Storage，**文本在 D1**，库里只存路径。

| 桶 | 用途 | 允许类型 |
|---|---|---|
| `photos` | 照片墙、关于我头像、项目封面与图集 | webp/jpg/jpeg/png/gif |
| `resume` | 简历 PDF | pdf |
| `moments` | 动态配图与附件 | webp/jpg/jpeg/png/gif/pdf |
| `blog-assets` | 博客封面与附件 | webp/jpg/jpeg/png/gif/pdf |
| `certificate-assets` | 证书图片与 PDF | webp/jpg/jpeg/png/gif/pdf |

> ⚠️ **`blog-assets` 与 `certificate-assets` 需要在 Supabase 控制台手工创建** —— 代码无法自动建桶。
> 未创建时：博客/证书的**上传**会失败（读取旧文件不受影响）。

创建步骤（Supabase 控制台 → Storage → New bucket）：

1. 名称分别填 `blog-assets`、`certificate-assets`；
2. **勾选 Public bucket**（前台要直接 `<img src>` 读，不勾则图片 403）；
3. 建议同时设置 File size limit（16MB）与 Allowed MIME types（image/*, application/pdf）。

路径规范：`<桶>/<业务前缀>/<记录 id>/<时间戳-随机>.<ext>`，例如
`blog-assets/blog/12/1758900000000-a1b2c3.webp`。

> **旧文件兼容**：库里存的是**带桶前缀的引用**（`blog-assets/blog/12/…`），
> 而 2026-09-26 之前的老记录存的是裸路径（如 `photo-01.webp`）。
> 渲染时 `resolveAssetUrl()` 会自动判断该去哪个桶取，**不需要迁移老数据**。

---

## 数据库 / Database (D1)

- 绑定名 `DB`，库名 `auth-db`（见 `wrangler.toml` 的 `[[d1_databases]]`）。
- `migrations/schema.sql` 是**基线**；`migrations/migration-NNN-*.sql` 是后续演进，
  **必须按文件名顺序依次执行**（数字前缀就是执行顺序）。

```bash
# 本地：基线 + 全部迁移，按顺序跑
npx wrangler d1 execute auth-db --local --file=./migrations/schema.sql
for f in migrations/migration-*.sql; do
  npx wrangler d1 execute auth-db --local --file="./$f"
done

# 生产（务必先备份）
npm run db:backup
npx wrangler d1 execute auth-db --remote --file=./migrations/migration-NNN-xxx.sql
```

> ⚠️ `npm run db:init` 只执行 `schema.sql`，**不含**后续迁移。全新库若只跑它，注册等接口会因缺列而 500 —— 必须把 `migrations/migration-*.sql` 补齐。

**顺序为什么重要**：`003-add-content-i18n` 要 `ALTER` 的 `ebook_chapters` / `moments` / `photos`
正是 `001-add-editor-tables` 建的。顺序错了，**全新库建表阶段就会失败，而线上因为表早就在了完全不会暴露** ——
这种问题最容易拖到下次换库才炸。所以有一条专门的冒烟测试：

```bash
node --experimental-sqlite scripts/check-migrations.mjs   # 内存库按序跑全部迁移
```

**当前迁移链**（19 个，按执行顺序）：

```
001 add-editor-tables  002 add-log-kind  003 add-content-i18n  004 seed-photos
005 add-about-pass  006 add-avatar  007 add-community  008 add-music-player
009 add-nickname-rate  010 add-nickname  011 add-pwd-params-and-moderation-log
012 add-rate-limits  013 add-replies  014 add-role  015 add-sessions
016 add-site-settings  017 add-suspended  018 merge-username
019 add-social-links  020 add-project-images
```

> 回滚脚本：`migrations/rollback-011-pwd-params-and-moderation-log.sql`（编号与被回滚的迁移对应）。

---

## 部署 / Deploy

```bash
npm run deploy     # = vite build && wrangler deploy
```

> **部署目标由 `wrangler.toml` 的 `name` 决定，生产上是 `zelm`**（该 worker 持有自定义域名 `luminae.dpdns.org`）。改成别的名字只会另建一个 worker，域名不会跟过去。

推荐顺序（涉及线上数据时）：

1. **备份**：`npm run db:backup`
2. **迁移**：`npx wrangler d1 execute auth-db --remote --file=./migrations/<新的>.sql`
3. **部署**：`npm run deploy`

> 若本次改动涉及**新存储桶**（如 `blog-assets` / `certificate-assets`），
> 记得先在 Supabase 控制台建好桶再部署 —— 否则新上传会失败（见上文「Supabase 存储桶」）。
> 若涉及**新密钥**（如翻译服务），部署前先 `wrangler secret put`。

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

另外有两个**不依赖网络**的冒烟脚本（都需要 Node 22+，因为用了实验性的 `node:sqlite`）：

```bash
# 内存库按文件名顺序跑 schema + 全部迁移，验证「全新库能建起来」+ 关键表齐全
node --experimental-sqlite scripts/check-migrations.mjs

# 内容多语言 API 的集成回归（96 项断言）：四语读写、回退、草稿不泄露、
# 可见性/置顶/排序、社交链接、项目图集、机器翻译（含失败分支）
node --experimental-sqlite scripts/check-content-i18n.mjs
```

> 两个脚本的用法：把 `worker/*.js` 的 `import { json, verifySession } from './auth.js'`
> 临时替换成桩再动态 import —— 这样才能测到**鉴权之后**的写路径（否则全被 401 挡住）。

CI 有两个 workflow：

- `ci.yml` —— push 到 `main` 及任意 PR 时执行 `lint → stylelint → test → build`。
- `deploy.yml` —— push 到 `main` 时先 `npm ci` + `npm run build`（生成 `dist/`），再 `wrangler deploy` 部署到 worker `zelm`；也可在 GitHub 网页用 `workflow_dispatch` 手动触发。需要仓库 Secrets：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`。

> ⚠️ 若同时在 Cloudflare 后台开了 Workers 的 Git 集成构建，会出现**重复部署**——两处只保留一个，并关掉另一个。

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
