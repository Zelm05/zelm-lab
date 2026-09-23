# 本地部署测试环境（local-test）

给 zelm 重构版（Vue3 + Hono + D1）用的**纯本地测试环境**。整站跑在本机 `wrangler dev`，
数据落在本文件夹内的 `.data/`，**完全不会碰到线上 D1**。

---

## 一、站长账号（本地测试用）

| 账号 | 密码 | 角色 | 用途 |
|---|---|---|---|
| `zelm` | 自行设定（仅本地） | owner（站长） | 全站唯一最高权限：管理台、角色授予、踢下线、删号、站点设置 |
| `demo` | 自行设定（仅本地） | user（普通用户） | 用来验证权限拦截、留言、管理台用户列表 |

> ⚠️ **密码不写进仓库**。`seed-owner.sql` 里的盐/哈希是 `<...PLACEHOLDER>` 占位符，
> 需先按该文件头部的「生成方式」用 PBKDF2-SHA256 / 100000 轮自行生成盐与哈希后填入；
> 或直接在项目根目录的 `.dev.vars` 配置 `SEED_OWNER_SALT` / `SEED_OWNER_HASH`，由 Worker 自动创建站长账号。
> 本地密码与线上 zelm 账号**无关**，也不要复用线上口令。

管理台入口：`http://127.0.0.1:8787/#/admin`（用 zelm 登录后可见）。

---

## 二、怎么启动

### 方式 A：双击（推荐）

双击本文件夹里的 **`start.cmd`**，它会依次自动完成：

1. `vite build` 构建前端产物到 `../dist`
2. 给本地 D1 建表（`migrations/schema.sql`，30 条 DDL）
3. 写入站长 / 演示账号（`seed-owner.sql`）
4. 启动 `wrangler dev`，地址 **http://127.0.0.1:8787**

停止：在窗口里按 `Ctrl + C`。

### 方式 B：命令行

```bash
cd D:\Desktop\zelm-vue

# 一次性准备（首次或重置后执行）
npx wrangler d1 execute auth-db --local --persist-to ./local-test/.data --file=./migrations/schema.sql -y
npx wrangler d1 execute auth-db --local --persist-to ./local-test/.data --file=./local-test/seed-owner.sql -y

# 启动
npx wrangler dev --local --port 8787 --persist-to ./local-test/.data
```

---

## 三、重置本地数据

双击 **`reset.cmd`**（需输入 `YES` 确认），会删掉 `.data/` 再重新初始化。
测试期间把数据搞乱了、或想换个干净的库，用它。

想改站长密码：改 `seed-owner.sql` 里的哈希即可——但哈希不是明文算出来的，
需要用与 `worker/auth.js` 相同的参数（PBKDF2-SHA256 / 100000 轮 / 16 字节盐 / 256 bit / Base64URL）重新生成。

---

## 四、文件说明

| 文件 | 说明 |
|---|---|
| `start.cmd` | 一键启动（构建 + 建库 + 写账号 + 起服务） |
| `reset.cmd` | 清空本地数据（需确认） |
| `seed-owner.sql` | 站长 / 演示账号的 seed SQL |
| `.data/` | **本地** D1 数据库文件（SQLite，已 gitignore，可随时删） |

`.dev.vars` 在**项目根目录**（`../.dev.vars`），提供本地 `JWT_SECRET`——`wrangler dev` 会自动读取。
它已被 `.gitignore` 忽略，不会进版本库。

---

## 五、已知行为（不是 bug）

- **409「该账号已在其他设备登录」**：这是**单端登录**机制在生效。同一个账号第二个浏览器登录会先弹冲突确认，
  前端点「顶号」即带 `force: true` 重新登录。用接口直连测试时，需要手动带上：
  ```json
  { "username": "zelm", "password": "<你设定的本地密码>", "force": true }
  ```
- **关于页免密**：`seed-owner.sql` 把 `about_password_enabled` 设成了 `0`，本地联调不用每次输密码。
- **端口占用**：固定 `8787`。若提示被占用，说明上一次的 `wrangler dev` 还在跑，先关掉那个窗口。
- **本地库 vs 线上库**：`--local` + `--persist-to` 决定了用的是本文件夹的 SQLite 文件，
  和 `wrangler.toml` 里那个远程 `database_id` 没有关系，**测试期间不会污染线上数据**。

---

## 六、已验证通过（2026-09-19）

| 检查项 | 结果 |
|---|---|
| `GET /` | 200 |
| `POST /api/login`（zelm） | 200 `{"role":"owner"}`，下发 HttpOnly Cookie |
| `POST /api/login`（错误密码） | 401 |
| `GET /api/me` | 200 `{"username":"zelm","role":"owner"}` |
| `GET /api/admin/users` | 200，返回用户列表 + 统计（total/admins/online） |
| `GET /api/site/settings` | 200，站点开关全部可读 |
| `GET /api/messages` | 200，留言板接口连通 |
| 重复登录 | 409 单端登录冲突（符合预期） |
