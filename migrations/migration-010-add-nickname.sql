-- users 表新增 nickname（显示名/昵称，可汉字、唯一）
--
-- ⚠️ 注释修正（2026-09-26）：旧注释写「新装库直接使用 schema.sql（已含 nickname 列）」是**错的** ——
--    schema.sql 并不含该列（实测新装库执行本文件才把它加上）。
--    本文件对新装库与存量库**都要执行**；后续 migration-018 会把 nickname 合并进 username 后删除该列。

ALTER TABLE users ADD COLUMN nickname TEXT;

-- 存量用户：昵称默认等于用户名（保证非空且唯一）
UPDATE users SET nickname = username WHERE nickname IS NULL OR nickname = '';

-- 昵称唯一索引（改名接口靠它做唯一校验）
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nickname ON users(nickname);
