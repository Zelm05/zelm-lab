# zelm-vue

<div align="center">

**🌐 Language / 语言：** English · [简体中文](README.md)

</div>

A personal portfolio site. Vue 3 + Vite front end, Hono back end, deployed as a **single Cloudflare Worker** (Workers + D1, serving both the API and the built static assets).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3 (`<script setup>`) + Vite 7 |
| Routing / State | vue-router 4 (hash mode) · Pinia |
| i18n | vue-i18n 11 — 简体中文 / 繁體中文 / English / 日本語 |
| UI | Element Plus + Vant 4 (on-demand) · ECharts 6 · ogl (WebGL background effects) |
| Backend | Hono 4 on Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) |
| Auth | PBKDF2-SHA256 password hashing + JWT (HttpOnly cookie), three roles `user < admin < owner` |
| Deployment | wrangler — a single Worker serves both `/api/*` and the built `dist/` assets |

---

## Project Structure

```
zelm-vue/
├─ index.html               # Vite entry (two inline scripts; their sha256 feeds the CSP)
├─ vite.config.js           # Build + vitest config
├─ wrangler.toml            # Worker / D1 / static assets bindings
├─ jsconfig.json            # Type checking (checkJs, scoped to worker/ and src/stores/)
├─ .dev.vars.example        # Env template (copy to .dev.vars; the real file is gitignored)
├─ .github/workflows/      # ci.yml (checks) + deploy.yml (auto build & deploy on main)
├─ worker/                  # ★ Deployment target: the Hono app
│  ├─ index.js              #   Entry: security headers / CSP / static fallback / routing
│  ├─ api.js                #   Auth, users, admin console APIs
│  ├─ auth.js               #   PBKDF2, JWT, cookies, rate limiting
│  ├─ community.js          #   Message board, replies, feedback
│  ├─ settings.js           #   Site settings
│  ├─ about.js              #   About-page password
│  ├─ moderation.js         #   Moderation log (soft delete + audit trail)
│  └─ reports.js            #   CSP / client-error report sinks
├─ src/                     # Vue front-end source
├─ public/                  # Static assets (photos, backgrounds, downloads, robots/sitemap)
├─ migrations/              # D1 schema and upgrade scripts
├─ scripts/                 # csp-hash.mjs (recompute inline-script hashes) · d1-backup.ps1
├─ tests/                   # vitest unit tests + Playwright e2e
└─ local-test/              # Local-only test environment (start.cmd / reset.cmd / seed SQL)
```

---

## Quick Start

**Requires** Node.js `>= 20.19` (see `engines` in `package.json`).

```bash
npm install

# 1) Local env vars (required, otherwise the login API returns 500)
cp .dev.vars.example .dev.vars      # Windows: Copy-Item .dev.vars.example .dev.vars
#   then replace JWT_SECRET with a random string

# 2) Start
npm run dev        # Vite dev server only (fastest; no Worker / API)
npm run dev:full   # build front end + run the Worker locally → http://127.0.0.1:8787
```

The local integration-test environment (one-click scripts, account setup) is documented in [`local-test/README.md`](local-test/README.md).

---

## Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `JWT_SECRET` | **Yes** | Signing key for the login JWT cookie; the login API returns 500 without it |
| `SEED_OWNER_SALT` | No | Seed salt for the site-owner account; if either this or the hash is missing, owner auto-creation is skipped |
| `SEED_OWNER_HASH` | No | Seed hash for the site-owner account (must use the same parameters as `worker/auth.js`) |

- Locally: put them in `.dev.vars` (gitignored — **never** committed).
- Production: `wrangler secret put JWT_SECRET` (do not put secrets in `wrangler.toml`, which is versioned).

---

## Database (D1)

- Binding `DB`, database name `auth-db` (see `[[d1_databases]]` in `wrangler.toml`).
- `migrations/schema.sql` is the **baseline**; `migrations/migration-*.sql` are incremental and **must be applied in filename order**.

```bash
# Local
npx wrangler d1 execute auth-db --local  --file=./migrations/schema.sql
npx wrangler d1 execute auth-db --local  --file=./migrations/migration-add-avatar.sql
#   … then the remaining migration-*.sql, in filename order

# Production (always back up first)
npm run db:backup
npx wrangler d1 execute auth-db --remote --file=./migrations/migration-xxx.sql
```

> ⚠️ `npm run db:init` only runs `schema.sql` and **excludes** the later migrations. A fresh database built that way returns 500 on registration (missing columns) — always apply the full `migrations/migration-*.sql` chain.
> Rollback script: `migrations/rollback-pwd-params-and-moderation-log.sql`.

---

## Deploy

```bash
npm run deploy     # = vite build && wrangler deploy
```

> **The deployment target is the `name` in `wrangler.toml`, which is `zelm` in production** (that worker holds the custom domain `luminae.dpdns.org`). Using a different name just creates a separate worker and the domain will not follow.

Recommended order when live data is involved:

1. **Back up**: `npm run db:backup`
2. **Migrate**: `npx wrangler d1 execute auth-db --remote --file=./migrations/<new>.sql`
3. **Deploy**: `npm run deploy`

Custom domain: the `[[routes]]` entry for `luminae.dpdns.org` is **commented out** in `wrangler.toml` by default to avoid hijacking existing production traffic. See [`DOMAIN_BINDING.md`](DOMAIN_BINDING.md) for the full binding procedure.

---

## Quality

```bash
npm run lint        # ESLint
npm run stylelint   # Stylelint
npm run typecheck   # tsc --noEmit (jsconfig.json, scoped to worker/ and src/stores/)
npm test            # vitest unit tests
npm run test:e2e    # Playwright (run `npx playwright install chromium` first; local only, not in CI)
npm run build       # production build
```

There are two workflows:

- `ci.yml` — runs `lint → stylelint → test → build` on pushes to `main` and on pull requests.
- `deploy.yml` — on push to `main`, runs `npm ci` + `npm run build` (producing `dist/`) and then `wrangler deploy` to the `zelm` worker; it can also be triggered manually via `workflow_dispatch`. Requires repository secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

> ⚠️ If Workers Git integration is also enabled in the Cloudflare dashboard you will get **duplicate deployments** — keep only one of the two and disable the other.

---

## Security Notes

- **No secrets in the repo**: only `.dev.vars.example` is committed; values in `.dev.vars` and wrangler secrets never appear in the repository or the docs.
- **Headers are set by the Worker**: CSP / X-Frame-Options / X-Content-Type-Options / HSTS / Referrer-Policy / Permissions-Policy — see `worker/index.js`.
- **CSP is currently in observation mode**: `CSP_ENFORCE = false` in `worker/index.js`, so the strict policy ships as `Content-Security-Policy-Report-Only` and reports violations to `/api/csp-report`. Flip it to `true` to enforce once reports are clean.
- **After editing the inline scripts in `index.html`** you must recompute the hashes and update the constants in `worker/index.js`:
  ```bash
  npm run build && node scripts/csp-hash.mjs
  ```

---

## License

MIT — see [LICENSE](LICENSE).
