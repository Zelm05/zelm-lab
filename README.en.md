<div align="center">

**🌐 Language / 语言：** [English](README.en.md) · [简体中文](README.md)

</div>

# zelm — Single Worker Full-Stack (Portfolio + D1 Auth Backend + Admin System)

> 🌐 Repo: https://github.com/Zelm05/zelm-lab

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
├── migrations/        # D1 schema & upgrade scripts
│   ├── schema.sql         # D1 schema (users + community tables, for fresh installs)
│   ├── migration-add-role.sql       # Upgrade existing DB: add role column
│   ├── migration-add-community.sql  # Upgrade existing DB: add community tables
│   └── migration-add-site-settings.sql  # Upgrade existing DB: site settings table (owner switches)
├── src/
│   ├── worker.js      # Single Worker entry: /api/* goes to backend, only /admin* is auth-guarded, rest are static pages
│   ├── auth.js        # Password hashing / JWT / Cookie / auth middleware
│   ├── api.js         # Register/Login/Logout/me + built-in owner seed + admin API + routing
│   ├── community.js   # Community API: message board / likes / feedback & suggestions
│   ├── about.js       # About page password: set / reset / remove / verify
│   └── settings.js    # Site settings (owner only, applies site-wide)
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
  wrangler d1 execute auth-db --local  --file=./migrations/migration-add-role.sql
  wrangler d1 execute auth-db --remote --file=./migrations/migration-add-role.sql
  wrangler d1 execute auth-db --local  --file=./migrations/migration-add-community.sql
  wrangler d1 execute auth-db --remote --file=./migrations/migration-add-community.sql
  # Optionally keep an old admin account by promoting it manually:
  wrangler d1 execute auth-db --remote --command "UPDATE users SET role='admin' WHERE username='YOUR_USERNAME';"
  # Site settings (owner switches: about password / landing page / login requirements / section visibility)
  # — already included in schema.sql for fresh installs; run this for existing databases:
  wrangler d1 execute auth-db --local  --file=./migrations/migration-add-site-settings.sql
  wrangler d1 execute auth-db --remote --file=./migrations/migration-add-site-settings.sql
  ```
- **Admin console**: "Admin" in the main site's top-right (visible to admins) → `/admin.html`; view stats, change roles, reset passwords, delete users.
- **Site settings (editable by the owner, read-only for admins)**: the "Site Settings" panel at the bottom of the admin console. All six switches take effect immediately (section visibility is applied synchronously via the `zelm_site_cfg` cookie sent with each page, so there is no flicker):
  | Setting | Values | Effect |
  |---------|--------|--------|
  | About page password | Set 4-32 chars / Reset to 1234 / Remove | Once removed, anyone can open "About Me" without a password |
  | Landing page after the gate | Library home / About Me | Which page opens when visitors click "Enter Site" |
  | Login required to post messages | On / Off | When off, guests can post without signing in (rate limited to 5/min per IP) |
  | Login required for About page | On / Off | When off, guests can open "About Me" without signing in; the About page only shows a "Log out" button when this is off |
  | Show the photo wall | On / Off | When off, the photo wall section and its nav item are hidden |
  | Show "About Me" on the home site | On / Off | When off, the home site's About Me section and its nav item are hidden |
- **Security rules**: cannot modify/delete your own account; cannot revoke/delete the last admin; password reset requires ≥ 8 chars.
- **Note**: after a role change, the affected user must **log in again** for it to take effect (the role lives in the JWT).
