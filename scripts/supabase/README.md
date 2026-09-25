# Supabase 使用说明（zelm-lab）

- **不引入 Supabase Auth**：沿用站点自建 JWT（HttpOnly Cookie，PBKDF2）。
- **读**：公开（`storage.objects` 的 SELECT 策略，`public` 桶）。
- **写**：只由 Cloudflare Worker 用 `service_role` 完成（绕过 RLS），
  或由 Worker 调 `createSignedUploadUrl` 签发一次性 URL 后前端直传（推荐，避免 Worker 请求体限制）。
- **密钥**：
  - `VITE_SUPABASE_ANON_KEY` → 前端（可公开），写在 `.env.local`
  - `SUPABASE_SERVICE_ROLE_KEY` → `wrangler secret put SUPABASE_SERVICE_ROLE_KEY`（**绝不能进前端**）
- **桶**：`photos` / `resume` / `moments`（见 `setup-storage.sql`）
- **公开 URL**：`https://wrguksjsbdvoqfedsdow.supabase.co/storage/v1/object/public/<bucket>/<path>`
