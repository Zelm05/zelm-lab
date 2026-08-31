<div align="center">

**🌐 Language / 语言：** [English](README.en.md) · [简体中文](README.md)

</div>

# zelm — Single Worker Full-Stack

> 🌐 Repo: [Zelm05/zelm-lab](https://github.com/Zelm05/zelm-lab) · 🚀 Demo: https://luminae.dpdns.org

A zero-third-party-dependency Cloudflare Workers project: one Worker serving a portfolio frontend, a D1 account system, community features, and an admin console.

## Tech Stack

`Cloudflare Workers` · `Workers Assets` · `D1 (SQLite)` · `Web Crypto` (PBKDF2 / HMAC-SHA256) · Vanilla JavaScript (no framework, zero deps)

## Quick Start

```bash
git clone https://github.com/Zelm05/zelm-lab.git
cd zelm-lab

# 1. Create the D1 database and paste the printed database_id into wrangler.toml
wrangler d1 create auth-db

# 2. Apply the schema (use --local for dev, --remote for production)
wrangler d1 execute auth-db --local --file migrations/schema.sql

# 3. Set the JWT secret
wrangler secret put JWT_SECRET

# 4. Run / deploy
wrangler dev --local
wrangler deploy
```

## Directory Structure

```
zelm-lab/
├── wrangler.toml      # Deploy config (D1 binding, Assets directory)
├── migrations/        # D1 schema & upgrade scripts
├── src/               # Worker backend: worker(entry) / auth / api / community / settings / about
└── public/            # Frontend: SPA shell + gate/home/about views + admin + assets
```

## Features

- **Frontend**: Welcome page → pseudo-SPA main site (music keeps playing across views, light/dark themes, zh/en, photo wall, message board, feedback)
- **Accounts**: Register / login / rename / change password, PBKDF2 salted hashing, HttpOnly Cookie (JWT), single-session login & account suspension
- **Community**: Message board (guests browse, logged-in users post/like, admins delete only) + feedback & suggestions (submitted by users, replied by admins)
- **Admin console** (`/admin`): user stats, role changes, reset/delete/suspend/kick; "Site Settings" switches (landing page, login requirements, section visibility, music player, etc.) apply immediately
- **Security**: CSP + global security headers, login/register rate limits, server-side login gate for the about page

## Accounts & Roles

Three roles `user < admin < owner`, with built-in owner `zelm` (the only owner). Roles live in the JWT — users must log in again after a role change. **Change the owner password and the about-page access password right after deployment** (both ship with known defaults).

## Deployment Notes

- `JWT_SECRET` must be set via `wrangler secret put` — **never** put it in `wrangler.toml` or any file committed to the repo
- The about-page access password and the owner account password have public defaults — **change them immediately after going live**
- Static asset caching and security headers are managed centrally in `src/worker.js`: fonts long-cached, images 1h + version-busted, audio 1d, CSS/JS uncached

## Disclaimer

All content and resources on this site are collected from the internet. We do not provide resource storage, nor participate in recording or uploading.

## License

Released under the [MIT License](LICENSE).
