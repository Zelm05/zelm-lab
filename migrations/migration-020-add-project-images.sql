-- ==========================================================================
-- 项目作品图集（多图上传）—— 2026-09-26
--
-- 背景：projects 表只有 `cover_path` 一张封面（列表缩略图用）。
--   规格要求项目支持「图片上传」，详情页要能看图集。
--
-- 设计：图片单独一张表（不在 projects 上存 JSON 数组）——
--   · 便于排序 / 单张删除 / 未来加「图片说明（多语言）」；
--   · JSON 数组在 SQLite 里改单张要整串重写，容易并发丢更新。
--
-- 与语言无关（图片没有语言），所以**没有**翻译表。
--
-- 幂等：IF NOT EXISTS，可重复执行。
-- 执行：wrangler d1 execute auth-db --remote --file=./migrations/migration-020-add-project-images.sql
-- ==========================================================================

CREATE TABLE IF NOT EXISTS project_images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL,             -- 对应 projects.id（未加外键约束，与全站风格一致）
  image_path  TEXT NOT NULL,                -- Supabase 桶内相对路径
  sort_order  INTEGER NOT NULL DEFAULT 0,   -- 小的在前
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_proj_img ON project_images(project_id, sort_order, id);
