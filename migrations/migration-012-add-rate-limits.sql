-- ============================================================
-- migration-add-rate-limits.sql — 添加请求频率限制表和性能优化索引
-- 用法：
--   wrangler d1 execute auth-db --local  --file=./migrations/migration-add-rate-limits.sql
--   wrangler d1 execute auth-db --remote --file=./migrations/migration-add-rate-limits.sql
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
/* ⚠️ 这里**不再**建 idx_users_role / idx_users_suspended：
   role 由 migration-014 才加、suspended 由 migration-017 才加，本文件（012）执行时
   这两列还不存在 → SQLite 报 "no such column" 并回滚整个文件
   （2026-09-26 实测：全新库上 012 因此失败）。
   两个索引已分别挪到 migration-014 / migration-017（列加完再建）。 */
CREATE INDEX IF NOT EXISTS idx_message_likes_user ON message_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_message_replies_user ON message_replies(user_id);
