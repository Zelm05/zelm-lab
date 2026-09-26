-- 迁移：为留言板新增「回复」表（幂等：已存在则跳过）
-- 用法：wrangler d1 execute auth-db --remote --file=./migrations/migration-add-replies.sql
CREATE TABLE IF NOT EXISTS message_replies (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id      INTEGER NOT NULL,                 -- 所属留言 id
  user_id         INTEGER NOT NULL,                 -- 回复者用户 id
  username        TEXT    NOT NULL,                 -- 回复者用户名（冗余，展示用）
  content         TEXT    NOT NULL,                 -- 回复内容（≤500 字）
  parent_reply_id INTEGER,                          -- 回复的上级回复 id（可选）
  created_at      INTEGER NOT NULL                  -- 回复时间戳（毫秒）
);
CREATE INDEX IF NOT EXISTS idx_message_replies_mid ON message_replies(message_id);
