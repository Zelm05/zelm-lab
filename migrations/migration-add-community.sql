-- ============================================================
-- migration-add-community.sql — 存量库升级脚本（追加社区功能表）
-- 适用：已经用旧版 schema.sql 建过库、现在要加入 留言/点赞/反馈建议 的库
-- 用法：
--   wrangler d1 execute auth-db --local  --file=./migrations/migration-add-community.sql
--   wrangler d1 execute auth-db --remote --file=./migrations/migration-add-community.sql
-- 幂等：重复执行不会报错。
-- ============================================================

-- 留言板
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  username   TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  likes      INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(id DESC);

-- 留言点赞记录
CREATE TABLE IF NOT EXISTS message_likes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  user_id    INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(message_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_message_likes_mid ON message_likes(message_id);

-- 反馈 / 建议
CREATE TABLE IF NOT EXISTS feedbacks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  username   TEXT    NOT NULL,
  kind       TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  reply      TEXT,
  replied_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedbacks_created ON feedbacks(id DESC);
