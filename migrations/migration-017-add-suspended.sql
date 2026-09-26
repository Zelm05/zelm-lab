-- 为用户表添加 suspended（冻结）字段
ALTER TABLE users ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0;

-- 冻结状态筛选索引。⚠️ 同 migration-014：原本写在 schema.sql，但那时 suspended 列还不存在，
--    建索引会回滚整个 schema.sql。2026-09-26 挪到这里（列加完再建索引）。
CREATE INDEX IF NOT EXISTS idx_users_suspended ON users(suspended);
