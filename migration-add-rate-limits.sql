-- ============================================================
-- migration-add-rate-limits.sql — 添加请求频率限制表和性能优化索引
-- 用法：
--   wrangler d1 execute auth-db --local  --file=./migration-add-rate-limits.sql
--   wrangler d1 execute auth-db --remote --file=./migration-add-rate-limits.sql
-- ============================================================

-- 请求频率限制表
CREATE TABLE IF NOT EXISTS rate_limits (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  key        TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_key_time ON rate_limits(key, created_at);

-- 性能优化索引
CREATE INDEX IF NOT EXISTS idx_sessions_last_seen ON sessions(last_seen);
CREATE INDEX IF NOT EXISTS idx_feedbacks_kind ON feedbacks(kind);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_suspended ON users(suspended);
CREATE INDEX IF NOT EXISTS idx_message_likes_user ON message_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_message_replies_user ON message_replies(user_id);
