-- ==========================================================================
-- 内容多语言化：About / 博客 / 证书 / 项目作品 / 日志 / 动态 / 照片（2026-09-26）
--
-- 方案：**翻译表**（主表存与语言无关的字段，翻译表按 lang 存文本）
--   主表：id、文件路径、日期、状态、排序、可见性、置顶
--   翻译表：<主键>_id + lang 复合主键，存所有可编辑文本
--
-- 为什么用翻译表而不是多语言字段（title_zh / title_en）：
--   本项目语言是 **4 种**（zh-CN / zh-TW / en / ja，见 src/core/i18n.js 的 LANGS），
--   多语言字段会让每加一种语言就要 ALTER TABLE 一次，且列数随语言线性膨胀。
--
-- 兼容性：
--   · 已有的 ebook_chapters / moments / photos **保持原样不动**（旧列继续读写），
--     只**额外**建翻译表，并把现有单语内容灌成 zh-CN —— 这样迁移是**纯加法**，
--     即使新代码有问题，旧接口和旧数据依然可用。
--   · 全部 CREATE 用 IF NOT EXISTS，可重复执行。
--   · ALTER TABLE ADD COLUMN 在 SQLite 里**不支持** IF NOT EXISTS，
--     已存在时会报错（属正常，手工跳过即可 —— 与 migration-add-log-kind.sql 一致）。
--
-- 执行：
--   wrangler d1 execute auth-db --remote --file=./migrations/migration-add-content-i18n.sql
--   wrangler d1 execute auth-db --local  --file=./migrations/migration-add-content-i18n.sql
-- ==========================================================================


-- ============================ 一、关于我 ============================
-- 单行表（id 固定 1）：头像等与语言无关的信息
CREATE TABLE IF NOT EXISTS about_profile (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  avatar_path  TEXT,                    -- Supabase photos 桶内的路径（与语言无关）
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS about_translations (
  about_id     INTEGER NOT NULL DEFAULT 1,
  lang         TEXT NOT NULL,           -- zh-CN / zh-TW / en / ja
  name         TEXT,                    -- 姓名 / 称呼
  headline     TEXT,                    -- 一句话简介
  content      TEXT,                    -- 正文（支持多行）
  skills       TEXT,                    -- JSON 数组字符串：["Vue", "Vite", ...]
  experiences  TEXT,                    -- JSON 数组：[{ period, role, org, desc }]
  updated_at   INTEGER,
  PRIMARY KEY (about_id, lang)
);


-- ============================ 二、博客 ============================
CREATE TABLE IF NOT EXISTS blogs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  cover_path   TEXT,                    -- 封面（Supabase blogs 桶）
  attach_path  TEXT,                    -- 附件（PDF 等）
  status       TEXT NOT NULL DEFAULT 'draft',   -- draft | published
  pinned       INTEGER NOT NULL DEFAULT 0,      -- 置顶
  sort_order   INTEGER NOT NULL DEFAULT 0,
  tags         TEXT,                    -- JSON 数组字符串
  published_at INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_blogs_list ON blogs(status, pinned DESC, sort_order, id DESC);

CREATE TABLE IF NOT EXISTS blog_translations (
  blog_id      INTEGER NOT NULL,
  lang         TEXT NOT NULL,
  title        TEXT,
  summary      TEXT,
  content      TEXT,
  updated_at   INTEGER,
  PRIMARY KEY (blog_id, lang)
);
CREATE INDEX IF NOT EXISTS idx_blog_tr_lang ON blog_translations(lang);


-- ============================ 三、证书 ============================
CREATE TABLE IF NOT EXISTS certificates (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  image_path   TEXT,                    -- 证书图片
  pdf_path     TEXT,                    -- 证书 PDF（可选）
  issue_date   TEXT,                    -- YYYY-MM-DD（与语言无关）
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cert_sort ON certificates(sort_order, id DESC);

CREATE TABLE IF NOT EXISTS certificate_translations (
  cert_id      INTEGER NOT NULL,
  lang         TEXT NOT NULL,
  name         TEXT,                    -- 证书名称
  description  TEXT,                    -- 描述
  issuer       TEXT,                    -- 颁发机构
  updated_at   INTEGER,
  PRIMARY KEY (cert_id, lang)
);
CREATE INDEX IF NOT EXISTS idx_cert_tr_lang ON certificate_translations(lang);


-- ============================ 四、项目作品 ============================
-- ⚠️ 迁移策略：这里**不预置数据**。前端 ProjectGrid 改成「DB 优先、静态兜底」——
--    数据库为空时仍走 src/data/projects.js（现有 3 个项目），站长在后台录入
--    对应 slug 的多语言内容后自动切换到 DB。这样迁移不会造成内容空窗。
CREATE TABLE IF NOT EXISTS projects (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT UNIQUE,             -- 与静态数据的 id 对应：zelm / campus / shin
  cover_path   TEXT,
  link         TEXT,                    -- 项目外链（GitHub 等，与语言无关）
  tech_stack   TEXT,                    -- JSON 数组：["Vue3", "Vite"]
  visible      INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_sort ON projects(sort_order, id);

CREATE TABLE IF NOT EXISTS project_translations (
  project_id   INTEGER NOT NULL,
  lang         TEXT NOT NULL,
  title        TEXT,
  summary      TEXT,
  detail       TEXT,                    -- 详情弹窗正文
  updated_at   INTEGER,
  PRIMARY KEY (project_id, lang)
);
CREATE INDEX IF NOT EXISTS idx_project_tr_lang ON project_translations(lang);


-- ============================ 五、日志（已有表，加翻译表） ============================
-- 主表 ebook_chapters 已存在，这里只补「可见性 / 置顶」两列（与语言无关）
ALTER TABLE ebook_chapters ADD COLUMN visible INTEGER NOT NULL DEFAULT 1;
ALTER TABLE ebook_chapters ADD COLUMN pinned  INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS ebook_translations (
  chapter_id   INTEGER NOT NULL,
  lang         TEXT NOT NULL,
  title        TEXT,
  content      TEXT,
  updated_at   INTEGER,
  PRIMARY KEY (chapter_id, lang)
);
CREATE INDEX IF NOT EXISTS idx_ebook_tr_lang ON ebook_translations(lang);

-- 灌种子：把现有单语内容原样记为 zh-CN（OR IGNORE → 重复执行不覆盖已有翻译）
INSERT OR IGNORE INTO ebook_translations (chapter_id, lang, title, content, updated_at)
  SELECT id, 'zh-CN', title, content, updated_at FROM ebook_chapters;


-- ============================ 六、动态（已有表，加翻译表） ============================
ALTER TABLE moments ADD COLUMN visible INTEGER NOT NULL DEFAULT 1;
ALTER TABLE moments ADD COLUMN pinned  INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS moment_translations (
  moment_id    INTEGER NOT NULL,
  lang         TEXT NOT NULL,
  content      TEXT,
  location     TEXT,
  updated_at   INTEGER,
  PRIMARY KEY (moment_id, lang)
);
CREATE INDEX IF NOT EXISTS idx_moment_tr_lang ON moment_translations(lang);

INSERT OR IGNORE INTO moment_translations (moment_id, lang, content, location, updated_at)
  SELECT id, 'zh-CN', content, location, updated_at FROM moments;


-- ============================ 七、照片墙（已有表，加翻译表） ============================
CREATE TABLE IF NOT EXISTS photo_translations (
  photo_id     INTEGER NOT NULL,
  lang         TEXT NOT NULL,
  title        TEXT,
  description  TEXT,
  updated_at   INTEGER,
  PRIMARY KEY (photo_id, lang)
);
CREATE INDEX IF NOT EXISTS idx_photo_tr_lang ON photo_translations(lang);

INSERT OR IGNORE INTO photo_translations (photo_id, lang, title, description, updated_at)
  SELECT id, 'zh-CN', title, description, created_at FROM photos;


-- ============================ 八、关于我：初始化单行 ============================
-- ⚠️ avatar_path 必须留 **NULL**，不能填 'avatar.jpg'：
--    `avatar_path` 存的是 **Supabase 桶内路径**，而 `avatar.jpg` 是 Worker Assets 里的
--    静态文件、Supabase 桶里并没有这个对象 —— 填了会让全站头像 404。
--    留空时前端会回落到内置的 `assets/avatar.jpg`（见 content store 的 avatarUrl）。
-- 这里只保证主表有行可 UPDATE。
INSERT OR IGNORE INTO about_profile (id, avatar_path, updated_at)
  VALUES (1, NULL, 0);
