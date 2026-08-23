<div align="center">

**🌐 Language / 语言：** [English](README.en.md) · [简体中文](README.md)

</div>

# zelm — Single Worker Full-Stack (Portfolio + D1 Auth Backend + Admin System)

> Repo: [github.com/Zelm05/zelm-lab](https://github.com/Zelm05/zelm-lab)

A zero-third-party-dependency Cloudflare Workers project that merges your **"Zelm Info Resource Library"** portfolio with an account system:

- **Frontend**: Portfolio static site (resource library main site / unified welcome page), served via Workers Assets
- **Backend**: D1 for users, Web Crypto PBKDF2 salted hashing, native HMAC-SHA256 JWT + HttpOnly Cookie, path-level auth middleware
- **Admin system**: Built-in owner `zelm` (owner role, unique across the site, higher privilege than admin), `users.role` system (`user` / `admin` / `owner`) + admin console + admin API
- **Community**: Message board (visible to all; logged-in users can post/like; only admins can delete) + feedback & suggestions (submitted by regular users only; admins receive and reply)

> Core experience: **guests can enter the main site directly**; after login the top-right shows your account and "Log out", otherwise "Log in / Sign up" buttons.
> Login, signup and admin login are **merged into a single modal component** (`auth-panel.js`, glassmorphism style, shared by the welcome page and the main site).
> Accounts live in D1; **passwords are never stored in plain text**.

## Directory Structure
```
zelm/
├── wrangler.toml      # Deploy config (database_id filled in, run_worker_first enabled)
├── schema.sql         # D1 schema (users + community tables, for fresh installs)
├── migration-add-role.sql       # Upgrade existing DB: add role column
├── migration-add-community.sql  # Upgrade existing DB: add community tables
├── src/
│   ├── worker.js      # Single Worker entry: /api/* goes to backend, only /admin* is auth-guarded, rest are static pages
│   ├── auth.js        # Password hashing / JWT / Cookie / auth middleware
│   ├── api.js         # Register/Login/Logout/me + built-in owner seed + admin API + routing
│   └── community.js   # Community API: message board / likes / feedback & suggestions
└── public/
    ├── index.html     # Resource library main site (guests allowed; top-right shows Login/Signup or username+Logout; includes message board / feedback)
    ├── gate.html      # Welcome page (public): "Enter as guest" goes straight to the main site
    ├── auth-panel.js  # Auth modal component (Login / Signup / Admin Login views, injects its own styles)
    ├── community.js   # Frontend rendering for message board + feedback & suggestions
    ├── gate.js / script.js / style.css / particle-text.js / warp-text.js
    ├── admin.html     # Admin console (admin only)
    ├── assets/        # Avatar, backgrounds, QR code, music, etc.
    ├── login.html     # Legacy entry: auto-redirects to /gate.html
    └── register.html  # Legacy entry: auto-redirects to /gate.html
```

## Page Routing & Auth
| Path | Login required | Description |
|------|----------------|-------------|
| `/`, `/index.html` | ❌ Guests allowed | Resource library main site; top-right shows Login/Signup (guest) or username+Admin+Logout (logged in) |
| `/gate.html`, `/gate` | ❌ Public | Welcome page; "Enter site" goes straight to the main site; "Login/Signup" opens the auth modal |
| `/admin.html`, `/admin` | ✅ admin only | Admin console; 302 → `/gate.html` when not logged in, 403 for non-admins |
| `/login.html`, `/register.html` | ❌ Public | Legacy links, auto-redirect to `/gate.html` |
| `/api/*` | See API table | Backend endpoints |

> Note: Workers Assets 307-redirects `/admin.html` to extension-less `/admin`; both paths are guarded for admins.

Login state is kept via **HttpOnly Cookie (JWT)**; the main site JS calls `/api/me` to decide whether to show "Login/Signup" or "Logout".

## Auth Modal (auth-panel.js)
- The "Login" / "Signup" buttons on the main site open the auth modal (the welcome page uses "Enter as guest" directly).
- Three views: **Login** / **Signup** / **Admin Login**; a "⚙ Admin Login" entry at the bottom of the login view switches to it.
- Admin login reuses `/api/login`, but only accounts with `role === 'admin'` (or `owner`) are allowed, then redirects to `/admin.html`.
- Signup usernames must be **unique** (409 check on the backend); after a successful signup it switches back to login with the username pre-filled.
- Adapts to light/dark theme and zh/en language (shares `zelm_settings` with the gate and main site).

## Community Features (Message Board / Feedback & Suggestions)
The main site's left nav includes "Message Board" and "Feedback & Suggestions" sections:

| Feature | Guest | Regular user | Admin |
|---------|-------|--------------|-------|
| Browse messages | ✅ | ✅ | ✅ |
| Post messages | ❌ (prompts login) | ✅ | ✅ |
| Like messages | ❌ | ✅ (once per user per message, can undo) | ✅ |
| Delete messages | ❌ | ❌ | ✅ |
| Submit feedback/suggestion | ❌ | ✅ | ❌ (403) |
| View own records (incl. replies) | ❌ | ✅ | — |
| View all feedback/suggestions + reply/delete | ❌ | ❌ | ✅ |

- Message/feedback content is XSS-escaped and length-limited (messages 500 chars, feedback 1000 chars).
- Feedback & suggestions are split into `feedback` and `suggestion` kinds; admins can filter by kind, reply (update replies) and delete.

## Admin System
- **Built-in owner**: `zelm` (owner, unique across the site, higher privilege than admin). Every `/api` request runs an idempotent `INSERT OR IGNORE` seed, so the account is **auto-recreated even if deleted**; the initial password lives in `SEED_ADMIN` in the source — **change it right after deployment**.
- **Roles**: `users.role ∈ { 'user', 'admin', 'owner' }`, carried in the JWT and double-checked by both the admin API and the `/admin` page. The owner is the site owner's exclusive role; only the owner can modify other admins (change role / freeze / delete), and admins cannot revoke each other's admin status.
- **Signups**: every new user is a regular user (no more "first user becomes admin" flow); admins can only be granted via the built-in `zelm` or the admin console.
- **Upgrading an existing DB** (no role column / no community tables):
  ```bash
  wrangler d1 execute auth-db --local  --file=./migration-add-role.sql
  wrangler d1 execute auth-db --remote --file=./migration-add-role.sql
  wrangler d1 execute auth-db --local  --file=./migration-add-community.sql
  wrangler d1 execute auth-db --remote --file=./migration-add-community.sql
  # Optionally keep an old admin account by promoting it manually:
  wrangler d1 execute auth-db --remote --command "UPDATE users SET role='admin' WHERE username='YOUR_USERNAME';"
  ```
- **Admin console**: "Admin" in the main site's top-right (visible to admins) → `/admin.html`; view stats, change roles, reset passwords, delete users.
- **Security rules**: cannot modify/delete your own account; cannot revoke/delete the last admin; password reset requires ≥ 8 chars.
- **Note**: after a role change, the affected user must **log in again** for it to take effect (the role lives in the JWT).

## Local Deployment (requires your Cloudflare account)
Steps 1–3 are only needed on first deploy; if you've already created D1 and JWT_SECRET, **jump straight to step 4 `wrangler deploy`**.

```bash
# 0. Prereqs (first time): install and log in to wrangler
npm install -g wrangler
wrangler login

# 1. Create D1 (first time): copy the printed database_id into wrangler.toml
wrangler d1 create auth-db

# 2. Create tables (first time): run both local and remote
wrangler d1 execute auth-db --local  --file=./schema.sql
wrangler d1 execute auth-db --remote --file=./schema.sql
#    (for an existing DB use ./migration-add-role.sql instead)

# 3. Set the JWT secret (first time; use a secret, never write it into the toml)
openssl rand -hex 32
wrangler secret put JWT_SECRET   # paste the random string above

# 4. Deploy (run after every change)
wrangler deploy
```

After a successful deploy you get `https://zelm.<YOUR_SUBDOMAIN>.workers.dev`.

## Verification
```bash
# API layer: /api/me without login should return 401
curl https://<subdomain>.workers.dev/api/me

# Page layer: guests can access / directly (no forced redirect)
curl -I https://<subdomain>.workers.dev/
```

## Local Development
```bash
# Local JWT secret: first create a .dev.vars file with JWT_SECRET=<random string> (never commit it)
wrangler dev   # open http://localhost:8787
```

## API Reference
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/register` | Sign up (unique username, password ≥ 8 chars; always creates a regular user) |
| POST | `/api/login` | Log in (issues JWT, sets HttpOnly Cookie) |
| POST | `/api/logout` | Log out (clears the Cookie) |
| GET  | `/api/me` | Current logged-in user (401 when not logged in, includes role) |
| GET  | `/api/admin/users` | User list + stats (admin only) |
| PATCH | `/api/admin/users/:id` | Change role `{role:'user'|'admin'}` (admin only) |
| POST | `/api/admin/users/:id/password` | Reset password `{password}` (admin only) |
| DELETE | `/api/admin/users/:id` | Delete user (admin only) |
| GET  | `/api/messages` | Message list (public, with like/permission flags) |
| POST | `/api/messages` | Post a message `{content}` (login required) |
| POST | `/api/messages/:id/like` | Like / unlike (login required) |
| DELETE | `/api/messages/:id` | Delete a message (admin only) |
| POST | `/api/feedbacks` | Submit feedback/suggestion `{kind:'feedback'|'suggestion', content}` (regular users only) |
| GET  | `/api/feedbacks/my` | My feedback/suggestion records (login required, includes admin replies) |
| GET  | `/api/admin/feedbacks` | All feedback/suggestions + stats (admin only, filterable via `?kind=`) |
| POST | `/api/admin/feedbacks/:id/reply` | Reply to feedback/suggestion `{reply}` (admin only) |
| DELETE | `/api/admin/feedbacks/:id` | Delete feedback/suggestion (admin only) |
| GET  | `/api/hello` | Protected sample endpoint (demonstrates the auth middleware) |

## Notes
- `*.workers.dev` may need a VPN on some networks (not a deployment issue; bind a custom domain to fix it — see `DOMAIN_BINDING.md`).
- The main site is open to guests (`PROTECTED_PATHS` removed); to re-enable "login required", add the `/`, `/index.html` auth guard back in `src/worker.js`'s `fetch`. Admin pages are controlled by `ADMIN_PATHS`.
