# zelm-auth-worker — 单 Worker 全栈（作品集 + D1 账号后端）

零第三方依赖的 Cloudflare Workers 项目，把你「Zelm 的信息资源库」作品集与账号系统合二为一：
- **前端**：作品集静态站（资源库主站 / 欢迎页 / 登录 / 注册），由 Workers Assets 托管
- **后端**：D1 存用户、Web Crypto PBKDF2 加盐哈希、原生 HMAC-SHA256 JWT + HttpOnly Cookie、路径级鉴权中间件

> 核心效果：访问资源库主站**必须先登录**；账号落在 D1 数据库，**绝不明文存密码**。

## 目录结构
```
zelm-auth-worker/
├── wrangler.toml      # 部署配置（已填 database_id，并开启 run_worker_first）
├── schema.sql         # D1 建表
├── src/
│   ├── worker.js      # 单 Worker 入口：/api/ 走后端，受保护路径做 302 鉴权，其余走静态页
│   ├── auth.js        # 密码哈希 / JWT / Cookie / 鉴权中间件
│   └── api.js         # 注册/登录/登出/me 接口 + 路由分发
└── public/
    ├── index.html     # 资源库主站（受保护：未登录跳 /login.html）
    ├── gate.html      # 欢迎页（公开，点「进入网站」进主站）
    ├── gate.js / script.js / style.css / particle-text.js / warp-text.js
    ├── assets/        # 头像、背景、二维码、音乐等
    ├── login.html     # 登录页（公开）
    └── register.html  # 注册页（公开）
```

## 页面路由与鉴权
| 路径 | 是否需登录 | 说明 |
|------|-----------|------|
| `/`、`/index.html` | ✅ 需登录 | 资源库主站；未登录自动 302 → `/login.html` |
| `/login.html` | ❌ 公开 | 登录页，成功跳 `/` |
| `/register.html` | ❌ 公开 | 注册页，成功跳 `/login.html` |
| `/gate.html` | ❌ 公开 | 欢迎动画页，点「进入网站」进主站 |
| `/api/*` | 见接口表 | 后端接口 |

登录态通过 **HttpOnly Cookie（JWT）** 保持；主站 JS 调 `/api/me` 显示用户名与「登出」按钮。

## 本机部署（需你的 Cloudflare 账号）
首次部署才需要 1–3 步；你已创建过 D1 与 JWT_SECRET，所以**直接跳到第 4 步 `wrangler deploy`** 即可。

```bash
# 0. 前置（首次）：安装并登录 wrangler
npm install -g wrangler
wrangler login

# 1. 创建 D1（首次）：复制输出的 database_id 填进 wrangler.toml
wrangler d1 create auth-db

# 2. 建表（首次）：本地 + 线上都要执行
wrangler d1 execute auth-db --local  --file=./schema.sql
wrangler d1 execute auth-db --remote --file=./schema.sql

# 3. 设置 JWT 密钥（首次，走 secret 勿写 toml）
openssl rand -hex 32
wrangler secret put JWT_SECRET   # 粘贴上面的随机串

# 4. 部署（每次改动后执行）
wrangler deploy
```

部署成功获得 `https://zelm-auth-worker.<你的子域>.workers.dev`。

## 验证
```bash
# 接口层：未登录访问 /api/me 应返回 401
curl https://<子域>.workers.dev/api/me

# 页面层：未登录直接访问 / 会被 302 跳到 /login.html
curl -I https://<子域>.workers.dev/
```

## 本地开发
```bash
wrangler dev   # 打开 http://localhost:8787
```

## 接口清单
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/register` | 注册（校验用户名唯一、密码≥8位） |
| POST | `/api/login` | 登录（签发 JWT，HttpOnly Cookie 下发） |
| POST | `/api/logout` | 登出（清除 Cookie） |
| GET  | `/api/me` | 获取当前登录用户（401 未登录） |
| GET  | `/api/hello` | 受保护接口示例（演示鉴权中间件用法） |

## 注意
- `*.workers.dev` 在部分网络下需开启 VPN 才能访问（非部署问题，可绑定自定义域名根治，见 `DOMAIN_BINDING.md`）。
- 想让更多页面需要登录，在 `src/worker.js` 的 `PROTECTED_PATHS` 数组里加路径即可。
