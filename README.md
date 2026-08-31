<div align="center">

**🌐 语言 / Language：** [简体中文](README.md) · [English](README.en.md)

</div>

# zelm — 单 Worker 全栈

> 🌐 仓库：[Zelm05/zelm-lab](https://github.com/Zelm05/zelm-lab) · 🚀 演示：https://luminae.dpdns.org

零第三方依赖的 Cloudflare Workers 项目：一个 Worker 同时承载作品集前端、D1 账号系统、社区功能与管理后台。

## 技术栈

`Cloudflare Workers` · `Workers Assets` · `D1 (SQLite)` · `Web Crypto`（PBKDF2 / HMAC-SHA256）· 原生 JavaScript（无框架、零依赖）

## 快速开始

```bash
git clone https://github.com/Zelm05/zelm-lab.git
cd zelm-lab

# 1. 创建 D1 数据库，把输出的 database_id 填入 wrangler.toml
wrangler d1 create auth-db

# 2. 建表（本地 --local；生产部署用 --remote）
wrangler d1 execute auth-db --local --file migrations/schema.sql

# 3. 设置 JWT 密钥
wrangler secret put JWT_SECRET

# 4. 运行 / 部署
wrangler dev --local
wrangler deploy
```

## 目录结构

```
zelm-lab/
├── wrangler.toml      # 部署配置（D1 绑定、Assets 目录）
├── migrations/        # D1 建表与升级脚本
├── src/               # Worker 后端：worker(入口) / auth / api / community / settings / about
└── public/            # 前端：SPA 外壳 + gate/home/about 视图 + 管理台 + 资源
```

## 功能一览

- **前端**：欢迎页 → 主站伪 SPA（切页音乐不中断、深浅主题、中英双语、照片墙、留言板、反馈建议）
- **账号**：注册 / 登录 / 改名 / 改密，PBKDF2 加盐哈希，HttpOnly Cookie（JWT），单端登录与账号冻结
- **社区**：留言板（游客浏览、登录发表/点赞、仅管理员删除）+ 反馈建议（用户提交、管理员回复）
- **管理台**（`/admin`）：用户统计、改角色、重置/删除/冻结/踢下线；「站点设置」开关（落地页、登录要求、板块显隐、音乐播放器等）即时生效
- **安全**：CSP + 全站安全响应头、登录/注册限速、关于页服务端登录兜底

## 账号与角色

三级角色 `user < admin < owner`，内置站长 `zelm`（唯一 owner）。角色存于 JWT，变更后需重新登录。**部署后请立即修改站长密码与关于页访问密码**（二者均有默认值）。

## 部署注意

- `JWT_SECRET` 必须通过 `wrangler secret put` 设置，**不要**写入 `wrangler.toml` 或任何提交到仓库的文件
- 关于页访问密码、站长账号密码均有公开默认值，**上线后第一时间修改**
- 静态资源缓存与安全响应头由 `src/worker.js` 统一管理：字体长缓存、图片 1 小时+版本号失效、音频 1 天、CSS/JS 不缓存

## 免责声明

本网站的任何内容资源均采集于互联网，并不提供资源存储，也不参与录制、上传。

## License

基于 [MIT License](LICENSE) 开源。
