# 自定义域名绑定记录（已绑定 luminae.dpdns.org）

## 现状（已完成）

- 站点已绑定自定义域名：**`https://luminae.dpdns.org/gate`**（统一欢迎页入口）
- 国内可**直连访问，无需代理/VPN**（`*.workers.dev` 兜底地址仍可用，两者不冲突）
- 部署后的验证地址：`https://luminae.dpdns.org/api/me`（未登录应返回 401）

> 旧地址 `https://zelm.yz050930.workers.dev` 仅作兜底；`*.workers.dev` 子域在大陆网络可能被干扰，以自定义域名为准。

---

## 背景（为什么会绑定域名）

`*.workers.dev` 是 Cloudflare 免费子域，部分大陆网络会干扰该子域，出现「关 VPN 就 TCP 超时」。
这是 CF 免费子域的共性限制，与代码/部署无关。绑定自定义域名（走 CF 普通 CDN 节点）即可根治。

---

## 绑定步骤（换域名时参考）

1. 注册一个域名，并把它的 **Nameserver(NS) 托管到 Cloudflare**（免费）。
2. 在 `wrangler.toml` 末尾加 routes：

```toml
routes = [
  { pattern = "luminae.dpdns.org", custom_domain = true }
]
```

3. 重新部署：

```bash
wrangler deploy
```

CF 会自动申请 SSL 证书（几秒到几分钟）。

4. 验证：关闭代理，浏览器访问 `https://luminae.dpdns.org/gate`，能打开即绑定成功。
