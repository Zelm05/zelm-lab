<div align="center">

**🌐 语言 / Language：** [简体中文](README.md) · [English](README.en.md)

</div>

# zelm — 单 Worker 全栈

> 🌐 项目仓库：https://github.com/Zelm05/zelm-lab

零第三方依赖的 Cloudflare Workers 项目，前端为作品集静态站，后端为 D1 账号系统与社区功能，全部合二为一。

- **前端**：Workers Assets 托管的静态站（欢迎页 + 主站）
- **后端**：D1 存用户，Web Crypto PBKDF2 加盐哈希、原生 HMAC-SHA256 JWT + HttpOnly Cookie
- **管理员系统**：内置站长 `zelm`（owner，全站唯一），`users.role`（user / admin / owner）角色体系
- **社区功能**：留言板（登录可发表/点赞、仅管理员可删）+ 反馈建议（普通用户提交、管理员回复）

## 目录结构

```
zelm/
├── wrangler.toml      # 部署配置
├── migrations/        # D1 建表与升级脚本
├── src/               # Worker 入口与后端（auth / api / community / settings ...）
└── public/            # 前端：SPA 外壳 + 视图(gate/home/about) + 管理台 + 资源
```

## 页面路由与鉴权

| 路径 | 需登录 | 说明 |
|------|--------|------|
| `/`、`/index.html` | ❌ | 主站（游客可进，登录态决定右上角显示） |
| `/gate.html`、`/gate` | ❌ | 欢迎页，游客直达主站或弹出登录/注册 |
| `/admin.html`、`/admin` | ✅ 仅 admin | 管理控制台，未登录 302、非管理员 403 |
| `/api/*` | 见接口 | 后端接口 |

登录态通过 **HttpOnly Cookie（JWT）** 保持，前端调 `/api/me` 判断登录态。

## 认证弹窗

登录 / 注册 / 管理员登录合并为一个弹窗组件（`auth-panel.js`），欢迎页与主站共用，自适应深浅主题与中英语言。

## 社区功能

主站含「留言板」「反馈建议」两区块：留言游客可浏览、登录可发表/点赞、仅管理员可删；反馈仅普通用户可提交，管理员可查看并回复。

## 管理员系统

内置站长 `zelm`（owner，权限高于 admin），每次 `/api` 请求幂等重建，部署后立即改密。`users.role ∈ {user, admin, owner}` 由 JWT 携带、接口与 `/admin` 双重校验。管理控制台可查看统计、改角色、重置/删除用户，并含「站点设置」开关（关于页密码、落地页、登录要求、板块显隐、音乐播放器等）即时生效。

## 免责声明

本网站的任何内容资源均采集于互联网，并不提供资源存储，也不参与录制、上传。

## License

基于 [MIT License](LICENSE) 开源。
