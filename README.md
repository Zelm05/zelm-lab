<div align="center">

**🌐 语言 / Language：** [简体中文](README.md) · [English](README.en.md)

</div>

# zelm — 单 Worker 全栈（作品集 + D1 账号后端 + 管理员系统）

> 仓库：[github.com/Zelm05/zelm-lab](https://github.com/Zelm05/zelm-lab)

零第三方依赖的 Cloudflare Workers 项目，把你「Zelm 的信息资源库」作品集与账号系统合二为一：
- **前端**：作品集静态站（资源库主站 / 统一欢迎页），由 Workers Assets 托管
- **后端**：D1 存用户、Web Crypto PBKDF2 加盐哈希、原生 HMAC-SHA256 JWT + HttpOnly Cookie、路径级鉴权中间件
- **管理员系统**：内置站长 `zelm`（owner 身份，全站唯一，权限高于 admin），`users.role` 角色体系（user / admin / owner）+ 管理控制台 + 管理接口
- **社区功能**：留言板（所有人可见、登录可发表/点赞、仅管理员可删除）+ 反馈建议（仅普通用户可提交、管理员接收并回复）

> 核心体验：**游客可直接进入**资源库主站；登录后右上角显示账号与「登出」，未登录则显示「登录 / 注册」按钮。
> 登录、注册、管理员登录已**合并进一个弹窗组件**（`auth-panel.js`，gate 玻璃拟态风格），欢迎页与主站共用。
> 账号落在 D1 数据库，**绝不明文存密码**。

## 目录结构
```
zelm/
├── wrangler.toml      # 部署配置（已填 database_id，并开启 run_worker_first）
├── schema.sql         # D1 建表（用户 + 社区表，新装用）
├── migration-add-role.sql       # 存量库升级：加 role 列
├── migration-add-community.sql  # 存量库升级：追加社区功能表
├── src/
│   ├── worker.js      # 单 Worker 入口：/api/ 走后端，仅 /admin* 做鉴权，其余走静态页
│   ├── auth.js        # 密码哈希 / JWT / Cookie / 鉴权中间件
│   ├── api.js         # 注册/登录/登出/me + 内置管理员 seed + 管理接口 + 路由分发
│   └── community.js   # 社区接口：留言板 / 点赞 / 反馈建议
└── public/
    ├── index.html     # 资源库主站（游客可进；右上角按登录态显示 登录/注册 或 用户名+登出；含留言板/反馈建议）
    ├── gate.html      # 欢迎页（公开）：「游客登陆」直达主站
    ├── auth-panel.js  # 认证弹窗组件（登录/注册/管理员登录 三视图，自动注入样式）
    ├── community.js   # 留言板 + 反馈建议 前端渲染
    ├── gate.js / script.js / style.css / particle-text.js / warp-text.js
    ├── admin.html     # 管理控制台（仅 admin 可访问）
    ├── assets/        # 头像、背景、二维码、音乐等
    ├── login.html     # 兼容入口：自动跳转 /gate.html（原登录页）
    └── register.html  # 兼容入口：自动跳转 /gate.html（原注册页）
```

## 页面路由与鉴权
| 路径 | 是否需登录 | 说明 |
|------|-----------|------|
| `/`、`/index.html` | ❌ 游客可进 | 资源库主站；右上角未登录显示「登录/注册」，已登录显示「用户名+管理后台(admin)+登出」 |
| `/gate.html`、`/gate` | ❌ 公开 | 欢迎页；「进入网站」游客直达主站；「登录/注册」按钮弹出认证窗口 |
| `/admin.html`、`/admin` | ✅ 仅 admin | 管理控制台；未登录 302 → `/gate.html`，非管理员 403 |
| `/login.html`、`/register.html` | ❌ 公开 | 兼容旧链接，自动跳转 `/gate.html` |
| `/api/*` | 见接口表 | 后端接口 |

> 注意：Workers Assets 会把 `/admin.html` 这类路径 307 到无扩展名的 `/admin`，两处都已做管理员拦截。

登录态通过 **HttpOnly Cookie（JWT）** 保持；主站 JS 调 `/api/me` 决定右上角显示「登录/注册」还是「登出」。

## 认证弹窗（auth-panel.js）
- 主站右上角「登录」「注册」按钮弹出认证窗口（欢迎页已改为「游客登陆」直达）。
- 三个视图：**登录** / **注册** / **管理员登录**；登录窗口底部有「⚙ 管理员登录」入口，点击切换。
- 管理员登录复用 `/api/login`，但仅 `role === 'admin'` 的账号放行，成功后跳 `/admin.html`。
- 注册用户名**不可重复**（后端 409 校验）；注册成功自动切回登录并预填用户名。
- 自适应深浅主题与中英语言（与 gate / 主站共用 `zelm_settings`）。

## 社区功能（留言板 / 反馈建议）
主站左侧导航新增「留言板」「反馈建议」两个区块：

| 功能 | 游客 | 普通用户 | 管理员 |
|------|------|---------|--------|
| 浏览留言 | ✅ | ✅ | ✅ |
| 发表留言 | ❌（提示登录） | ✅ | ✅ |
| 留言点赞 | ❌ | ✅（每人每条一次，可取消） | ✅ |
| 删除留言 | ❌ | ❌ | ✅ |
| 提交反馈/建议 | ❌ | ✅ | ❌（403） |
| 查看自己的记录（含回复） | ❌ | ✅ | — |
| 查看全部反馈/建议 + 回复/删除 | ❌ | ❌ | ✅ |

- 留言/反馈内容均做 XSS 转义与长度限制（留言 500 字、反馈 1000 字）。
- 反馈建议分 `feedback`（反馈）与 `suggestion`（建议）两类，管理员按类筛选、可回复（更新回复）与删除。

## 管理员系统
- **内置站长**：`zelm`（owner，全站唯一，权限高于 admin）。每次 `/api` 请求自动 `INSERT OR IGNORE`（幂等），
  即使账号被删除，下一次请求也会**自动重建**；初始密码请查看源码 `SEED_ADMIN`，**部署后请立即修改**。
- **角色**：`users.role ∈ { 'user', 'admin', 'owner' }`，JWT 中携带，管理员接口与 `/admin` 页面双重校验；
  owner 为站长专属身份，仅 owner 可操作其他管理员（改角色/冻结/删除），admin 之间不能相互取消管理员身份。
- **注册用户**：一律为普通用户（不再有"首个用户自动 admin"引导），管理员只能靠内置 zelm 或后台提升。
- **存量库升级**（旧库无 role 列 / 无社区表）：
  ```bash
  wrangler d1 execute auth-db --local  --file=./migration-add-role.sql
  wrangler d1 execute auth-db --remote --file=./migration-add-role.sql
  wrangler d1 execute auth-db --local  --file=./migration-add-community.sql
  wrangler d1 execute auth-db --remote --file=./migration-add-community.sql
  # 如需旧管理员账号保留，手动提升：
  wrangler d1 execute auth-db --remote --command "UPDATE users SET role='admin' WHERE username='你的用户名';"
  ```
- **管理控制台**：主站右上角（管理员可见）「管理后台」→ `/admin.html`，可查看统计、改角色、重置密码、删除用户。
- **安全规则**：不能修改/删除自己的账号；不能撤销/删除最后一位管理员；密码重置 ≥ 8 位。
- **注意**：角色变更后，对方**需重新登录**才能生效（角色存在 JWT 里）。

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
#    （存量库请改用 ./migration-add-role.sql）

# 3. 设置 JWT 密钥（首次，走 secret 勿写 toml）
openssl rand -hex 32
wrangler secret put JWT_SECRET   # 粘贴上面的随机串

# 4. 部署（每次改动后执行）
wrangler deploy
```

部署成功获得 `https://zelm.<你的子域>.workers.dev`。

## 验证
```bash
# 接口层：未登录访问 /api/me 应返回 401
curl https://<子域>.workers.dev/api/me

# 页面层：游客可直接访问 / （不再强制跳转）
curl -I https://<子域>.workers.dev/
```

## 本地开发
```bash
# 本地 JWT 密钥：先创建 .dev.vars 文件，内容为 JWT_SECRET=<随机串>（勿提交到版本库）
wrangler dev   # 打开 http://localhost:8787
```

## 接口清单
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/register` | 注册（校验用户名唯一不可重复、密码≥8位；一律为普通用户） |
| POST | `/api/login` | 登录（签发 JWT，HttpOnly Cookie 下发） |
| POST | `/api/logout` | 登出（清除 Cookie） |
| GET  | `/api/me` | 获取当前登录用户（401 未登录，含 role） |
| GET  | `/api/admin/users` | 用户列表 + 统计（仅 admin） |
| PATCH | `/api/admin/users/:id` | 修改角色 `{role:'user'|'admin'}`（仅 admin） |
| POST | `/api/admin/users/:id/password` | 重置密码 `{password}`（仅 admin） |
| DELETE | `/api/admin/users/:id` | 删除用户（仅 admin） |
| GET  | `/api/messages` | 留言列表（公开，含点赞/权限标记） |
| POST | `/api/messages` | 发表留言 `{content}`（需登录） |
| POST | `/api/messages/:id/like` | 点赞/取消点赞（需登录） |
| DELETE | `/api/messages/:id` | 删除留言（仅 admin） |
| POST | `/api/feedbacks` | 提交反馈/建议 `{kind:'feedback'|'suggestion', content}`（仅普通用户） |
| GET  | `/api/feedbacks/my` | 我的反馈/建议记录（需登录，含管理员回复） |
| GET  | `/api/admin/feedbacks` | 全部反馈/建议 + 统计（仅 admin，可 `?kind=` 过滤） |
| POST | `/api/admin/feedbacks/:id/reply` | 回复反馈/建议 `{reply}`（仅 admin） |
| DELETE | `/api/admin/feedbacks/:id` | 删除反馈/建议（仅 admin） |
| GET  | `/api/hello` | 受保护接口示例（演示鉴权中间件用法） |

## 注意
- `*.workers.dev` 在部分网络下需开启 VPN 才能访问（非部署问题，可绑定自定义域名根治，见 `DOMAIN_BINDING.md`）。
- 主站已对游客开放（`PROTECTED_PATHS` 已移除）；若以后想恢复"必须登录才能进站"，在 `src/worker.js` 的 `fetch` 里加回对 `/`、`/index.html` 的鉴权拦截即可。管理员页面由 `ADMIN_PATHS` 控制。
