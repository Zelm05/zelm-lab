<div align="center">

**🌐 Language / 语言：** [English](README.en.md) · [简体中文](README.md)

</div>

# zelm — Single Worker Full-Stack

> 🌐 Repo: https://github.com/Zelm05/zelm-lab

A zero-third-party-dependency Cloudflare Workers project: a portfolio static site on the frontend, with a D1 account system and community features on the backend, all in one.

- **Frontend**: Static site served via Workers Assets (welcome page + main site)
- **Backend**: D1 for users, Web Crypto PBKDF2 salted hashing, native HMAC-SHA256 JWT + HttpOnly Cookie
- **Admin system**: Built-in owner `zelm` (unique across the site), `users.role` (user / admin / owner) roles
- **Community**: Message board (post/like when logged in, admins-only delete) + feedback & suggestions (by regular users, replied by admins)

## Directory Structure

```
zelm/
├── wrangler.toml      # Deploy config
├── migrations/        # D1 schema & upgrade scripts
├── src/               # Worker entry and backend (auth / api / community / settings ...)
└── public/            # Frontend: SPA shell + views (gate/home/about) + admin + assets
```

## Page Routing & Auth

| Path | Login required | Description |
|------|----------------|-------------|
| `/`, `/index.html` | ❌ | Main site (guests allowed; login state drives the top-right UI) |
| `/gate.html`, `/gate` | ❌ | Welcome page; guests enter directly or open login/signup |
| `/admin.html`, `/admin` | ✅ admin only | Admin console; 302 when logged out, 403 for non-admins |
| `/api/*` | See API | Backend endpoints |

Login state is kept via **HttpOnly Cookie (JWT)**; the frontend calls `/api/me` to determine the login state.

## Auth Modal

Login / Signup / Admin Login are merged into a single modal component (`auth-panel.js`), shared by the welcome page and the main site, adapting to light/dark theme and zh/en.

## Community Features

The main site has "Message Board" and "Feedback & Suggestions" sections: messages are browsable by guests, postable/likeable when logged in, deletable by admins only; feedback is submitted by regular users and viewed/replied by admins.

## Admin System

Built-in owner `zelm` (higher privilege than admin), idempotently recreated on every `/api` request — change its password right after deployment. `users.role ∈ {user, admin, owner}` is carried in the JWT and double-checked by the API and `/admin`. The admin console shows stats, changes roles, resets/deletes users, and includes "Site Settings" switches (about-page password, landing page, login requirements, section visibility, music player, etc.) that apply immediately.

## Disclaimer

All content and resources on this site are collected from the internet. We do not provide resource storage, nor participate in recording or uploading.

## License

Released under the [MIT License](LICENSE).
