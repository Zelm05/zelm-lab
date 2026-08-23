# 绑定自定义域名（根治「必须开 VPN 才能访问」）

## 背景
站点已成功部署在 `https://zelm.yz050930.workers.dev`（旧地址 `zelm-auth-worker.yz050930.workers.dev` 可能仍短暂有效），
但 `*.workers.dev` 子域在大陆网络被干扰，**关 VPN 就 TCP 超时**。
这是 Cloudflare 免费子域的共性限制，与代码/部署无关。

**唯一根治办法：绑定你自己的自定义域名**（走 Cloudflare 普通 CDN 节点，大陆直连比 workers.dev 稳得多）。

绑定前提：你有一个域名，且它的 **Nameserver(NS) 托管在 Cloudflare**（免费）。

---

## 步骤 1：注册一个域名（你还没有，需要先做）

推荐注册商（都支持「修改 Nameserver」，可转到 Cloudflare）：

| 注册商 | 优点 | 支付方式 |
|--------|------|----------|
| **Cloudflare Registrar** | 注册后 NS 自动在 CF，最省事；续费按成本价 | 信用卡 |
| **NameSilo** | 支持支付宝/微信；隐私保护免费 | 支付宝/微信/卡 |
| **Porkbun** | 价格低；支持支付宝 | 支付宝/卡 |
| **腾讯云 / 阿里云** | 国内充值方便 | 国内支付 |

> 建议选常见后缀：`yourname.top` / `.com` / `.cn` / `.me`，一年几十元。

---

## 步骤 2：把域名的 NS 转到 Cloudflare

1. 打开 https://dash.cloudflare.com → **Add a site** → 输入你的域名（如 `zelm.top`）。
2. 选 **Free** 计划，CF 会给你 **两个 NS 地址**（形如 `xxx.ns.cloudflare.com` / `yyy.ns.cloudflare.com`）。
3. 登录你的域名注册商后台，把域名的 **Nameserver 改为这两个 CF 的 NS**（删掉原来的，换成 CF 的）。
4. 回到 CF 后台等待 **Active**（通常几分钟到 48 小时，多数 10 分钟内）。

> 如果你用 **Cloudflare Registrar** 直接注册的域名，这步自动完成，跳过。

---

## 步骤 3：在 `wrangler.toml` 里加 routes

打开项目里的 `wrangler.toml`，在末尾加（把占位符换成你的真实子域）：

```toml
routes = [
  { pattern = "auth.你的域名.com", custom_domain = true }
]
```

示例（假设你注册了 `zelm.top`）：
```toml
routes = [
  { pattern = "auth.zelm.top", custom_domain = true }
]
```

---

## 步骤 4：重新部署

在 `D:\Desktop\zelm` 目录下执行：
```bash
wrangler deploy
```
CF 会在后台自动为自定义域名申请 SSL 证书（几秒到几分钟）。

---

## 步骤 5：验证（关键）

**关闭 VPN**，浏览器访问 `https://auth.你的域名.com/`（你的真实子域）：
- 能打开 → 根治成功，以后不用 VPN。
- 仍超时 → 检查 NS 是否已生效、路由 pattern 是否写对，把结果发我。

---

## 我（WorkBuddy）能帮你做的
你完成「注册域名 + NS 转 CF」后，把 **真实子域**（如 `auth.zelm.top`）发给我，
我直接帮你把 `routes` 写进 `wrangler.toml` 并准备好部署，你只需跑一条 `wrangler deploy`。

> 注意：绑定自定义域名后，`*.workers.dev` 的地址依然可用，两者不冲突。
