-- ==========================================================================
-- 清掉 about_profile 里那个不存在的头像路径（2026-09-26）
--
-- 背景：`migration-003-add-content-i18n.sql` 初始化时把 avatar_path 写成了 'avatar.jpg'，
--   但 `avatar_path` 存的是 **Supabase 桶内路径**，而 avatar.jpg 是 Worker Assets 里的
--   静态文件 —— Supabase 的 photos 桶里**没有这个对象**。
--   结果：全站头像会拼成 `.../photos/avatar.jpg` → **404，头像全裂**。
--
-- 修法：清成 NULL。前端 `content store` 的 avatarUrl 在为空时会回落到内置的
--   `assets/avatar.jpg`（随 Worker Assets 发布，一定存在），头像照常显示。
--   站长在后台重新上传头像后，才会用 DB 里那个。
--
-- ⚠️ 只清这一个已知的错值：万一站长已经上传过真头像（路径形如 `photos/about/1/xxx.webp`），
--    这里不会碰。
--
-- 幂等：条件不匹配时就是 no-op。
-- 执行：wrangler d1 execute auth-db --remote --file=./migrations/migration-022-clear-bogus-avatar.sql
-- ==========================================================================

UPDATE about_profile
  SET avatar_path = NULL, updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE avatar_path = 'avatar.jpg';
