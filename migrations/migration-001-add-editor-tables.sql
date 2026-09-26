-- ==========================================================================
-- 站长编辑功能：照片墙 / 简历 / 电子书 / 朋友圈（2026-09-25）
--
-- 设计：**文本数据在 D1**（与现有架构一致，复用 Hono + 自建 JWT 鉴权）；
--       **二进制文件在 Supabase Storage**（photos / resume / moments 三个公开桶），
--       本表只存 storage_path（相对路径），公开 URL 由前端拼。
--
-- 幂等：全部 IF NOT EXISTS，可重复执行。
-- 执行：wrangler d1 execute auth-db --remote --file=./migrations/migration-add-editor-tables.sql
-- ==========================================================================

-- ---------- 照片墙元数据 ----------
CREATE TABLE IF NOT EXISTS photos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT,
  description   TEXT,
  storage_path  TEXT NOT NULL,             -- Supabase photos 桶内的路径
  width         INTEGER,
  height        INTEGER,
  sort_order    INTEGER DEFAULT 0,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_sort ON photos(sort_order, id);

-- ---------- 简历元数据（只保留最新一条，用 id=1 固定行） ----------
CREATE TABLE IF NOT EXISTS resume (
  id            INTEGER PRIMARY KEY,       -- 固定 1
  storage_path  TEXT NOT NULL,
  version       TEXT,
  size_bytes    INTEGER,
  updated_at    INTEGER NOT NULL
);

-- ---------- 电子书章节 ----------
CREATE TABLE IF NOT EXISTS ebook_chapters (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,
  sort_order    INTEGER DEFAULT 0,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ebook_sort ON ebook_chapters(sort_order, id);

-- ---------- 朋友圈动态 ----------
CREATE TABLE IF NOT EXISTS moments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  content       TEXT NOT NULL,
  images        TEXT,                      -- JSON 数组字符串（SQLite 无数组类型），存 moments 桶路径
  location      TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_moments_time ON moments(created_at DESC);
