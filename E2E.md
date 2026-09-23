# E2E 测试指南（Playwright）

> 本套件**只在本地跑，CI 不跑**。它在本机 `wrangler dev` 上真实走一遍
> 注册 → 登录 → 发留言 → 四语言切换，并把一条测试用户/留言写进**本地** D1。

- 配置：`playwright.config.js`（`testDir: ./tests/e2e`，单 worker，chromium 桌面视口）
- 用例：`tests/e2e/smoke.spec.js`（1 个 test，覆盖 4 条链路）

---

## 一、前置准备（首次）

```powershell
cd D:\Desktop\zelm-vue

# 1) 安装浏览器（一次性）
#    当前 @playwright/test 1.63 对应 chromium revision 1243，约 170 MiB。
#    装到 %LOCALAPPDATA%\ms-playwright\chromium-1243\
npx playwright install chromium

# 2) 准备本地 D1 —— ⚠️ 必须是「schema + 全部迁移」，缺一不可
npm run db:init
npx wrangler d1 execute auth-db --local --file=./migrations/migration-add-avatar.sql
npx wrangler d1 execute auth-db --local --file=./migrations/migration-add-pwd-params-and-moderation-log.sql
```

> ⚠️ **只跑 `npm run db:init` 是不够的**：`migrations/schema.sql` 缺
> `users.avatar`、`pwd_algo/pwd_iter`、`messages/feedbacks.deleted_at` 与
> `moderation_log`，全新库不补迁移的话，E2E 的**注册一步就会 500**。

---

## 二、运行

Playwright 会**自动**执行 `npm run dev:full`（= `vite build && wrangler dev --local`）
并等 `http://127.0.0.1:8787/` 就绪，跑完自动关闭。所以通常只需：

```powershell
npx playwright test        # 或 npm run test:e2e
```

如果你想**自己先起服务**（例如想同时手动开浏览器看），先开一个终端：

```powershell
npm run dev:full           # 起在 8787；保持这个窗口开着
```

再在另一个终端跑 `npx playwright test` —— 配置里 `reuseExistingServer: true`
（非 CI 环境）会**直接复用**已在 8787 上的服务，不会重复起、也不会抢占端口。

常用参数：

| 目的 | 命令 |
|---|---|
| 看真实浏览器过程 | `npx playwright test --headed` |
| 出 trace（失败可回放） | `npx playwright test --trace on` |
| 只跑某条用例 | `npx playwright test -g "核心链路"` |
| 打别的实例 | `$env:E2E_BASE_URL="http://127.0.0.1:9000"; npx playwright test` |
| 看 HTML 报告 | `npx playwright show-report` |

> 首跑会先 `vite build`，因此**别在 dev server 占用 dist 时跑**（会 emptyDir 失败）。

### 预期输出

```text
Running 1 test using 1 worker

  ✓  1 …\tests\e2e\smoke.spec.js:20:3 › 冒烟：登录 → 留言 → 语言切换 → 看板渲染 (…s)

  1 passed (…s)
```

**1 passed 即为通过**（只有 1 个 test，内部含 4 条链路）。

---

## 三、这个用例实际断言了什么

| # | 链路 | 具体断言 |
|---|---|---|
| 1 | 注册 + 登录 | 页面内 `fetch('/api/register')` → 201 或 409（可重复运行）；`/api/login` → 200；`/api/me` → 200 |
| 2 | 发留言 | `POST /api/messages` → 200/201；`GET /api/messages?limit=100` 的返回里能查到刚发的内容 |
| 3 | 首屏渲染 | 重载后 `document.title` 含 `Zelm`；`#app` 与 `#viewRoot` 均非空 |
| 4 | 四语言切换 | 逐个切 `zh-CN / zh-TW / en / ja`，断言 `html[lang]` 正确，**并断言页脚 QQ 图标 `title` 随语言变化**（`QQ 官网` → `QQ 官網` → `QQ official site` → `QQ 公式サイト`，即 P3-6 的回归位） |

设计取舍：登录/留言走**页面内 fetch** 而不是 `APIRequestContext`，因为前者会自动带
`Origin` 头，正好覆盖 worker 的 P2-8 来源校验（直连 API 不会带 Origin）。

### 未覆盖（明确列出，别误以为跑绿了就全站无虞）

- **删除留言**、举报、回复 —— 未覆盖
- **管理台**（`#/admin` 的 StatsBoard / 用户表 / 站点设置）—— 未覆盖，需要 owner 登录
- **权限拦截**（未登录访问受限页、被顶号）—— 未覆盖
- **真实表单交互** —— 登录/留言是 fetch 驱动，不是点 DOM
- **移动端视口 / 微信内核 / 真机** —— 未覆盖（只有 Desktop Chrome 一个 project）
- **WebGL 特效**（warp-text / particle-text）—— 未覆盖

---

## 四、本地浏览器缓存（Chromium）说明

`npx playwright install` 把浏览器装在用户目录，**不在仓库里**，也不进 git：

```
%LOCALAPPDATA%\ms-playwright\
  chromium-1243\               ← 当前 @playwright/test 1.63 需要的版本
  chromium_headless_shell-1243\
  chromium-1228\               ← 旧版本残留（416 MiB，可删）
  chromium_headless_shell-1228\ ← 旧版本残留（270 MiB，可删）
  chromium-1200\               ← ⚠️ 残缺壳：只有 INSTALLATION_COMPLETE 标记、没有浏览器本体
  ffmpeg-1011\  winldd-1007\
  .links\  __dirlock\
```

- 判断某版本是否可用：该目录下要有 `chrome-win64\` 子目录，而不是只有
  `INSTALLATION_COMPLETE` / `DEPENDENCIES_VALIDATED` 两个 0 字节标记文件。
- 版本对不上时 `npx playwright test` 会报
  `Executable doesn't exist at ...\chromium-<rev>\chrome-win64\chrome.exe`，
  重跑 `npx playwright install chromium` 即可。
- 这些残留**可以删**（删掉只是下次要重新下载），但本仓库的脚本/文档都不去动它们。

---

## 五、数据与清理

- 测试用户名与留言都带随机后缀（`e2e_<随机>`），**可重复运行**，不会撞历史数据。
- 数据只写**本地**库（`.wrangler/state/v3/d1`），不碰线上。
- 想清空本地库：删掉 `.wrangler/state/v3/d1` 后重跑「一、前置准备」第 2 步。
- 失败排查顺序：① 第 2 步迁移是否跑全（注册 500 是最典型症状）→ ② 8787 是否被旧进程占用
  → ③ chromium 版本是否匹配。
- CI 不跑 E2E（`.github/workflows/ci.yml` 只做 lint / stylelint / test / build）。
