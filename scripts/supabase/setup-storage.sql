/* ==========================================================================
 * Supabase Storage 初始化（在 Supabase Dashboard → SQL Editor 里执行）
 * 项目：wrgsksjsbdvoqfedsdow
 *
 * ⚠️ 重要前提：本站**不使用 Supabase Auth**（复用自建 JWT + HttpOnly Cookie）。
 *   因此 storage.objects 的 RLS **不能**写 `to authenticated` / `auth.jwt()`，
 *   —— 那样用 anon key 上传会全部 403（没有 Supabase 会话）。
 *   正确分工：
 *     · 读（SELECT）：公开，所有人可读（图片本来就是公开的）
 *     · 写（INSERT/UPDATE/DELETE）：**只由 Worker 用 service_role key 执行**
 *       （service_role 绕过 RLS），或由 Worker 签发一次性上传 URL 后前端直传。
 *   service_role key 只放 `wrangler secret put SUPABASE_SERVICE_ROLE_KEY`，
 *   **绝不进前端产物**。
 * ========================================================================== */

-- ---------- 1. 建桶（公开读） ----------
insert into storage.buckets (id, name, public)
values ('photos',  'photos',  true),
       ('resume',  'resume',  true),
       ('moments', 'moments', true)
on conflict (id) do update set public = true;

-- ---------- 2. 公开读策略（三个桶） ----------
drop policy if exists "public read photos"  on storage.objects;
drop policy if exists "public read resume"  on storage.objects;
drop policy if exists "public read moments" on storage.objects;

create policy "public read photos"
  on storage.objects for select using (bucket_id = 'photos');
create policy "public read resume"
  on storage.objects for select using (bucket_id = 'resume');
create policy "public read moments"
  on storage.objects for select using (bucket_id = 'moments');

/* ---------- 3. 写策略：不建（RLS 默认拒绝）。
 *    所有写操作走 Worker 的 service_role（绕过 RLS）。
 *    如果你坚持要用 anon key 直传，才需要放开下面的策略 —— 但那意味着
 *    **任何人都能往你的桶里写文件**，不建议：
 *
 * create policy "anon write photos" on storage.objects for insert to anon
 *   with check (bucket_id = 'photos');
 * ------------------------------------------------------------------ */
