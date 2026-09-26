-- 存量库升级：users 表新增 nickname（显示名/昵称，可汉字、唯一）
-- 新装库直接使用 schema.sql（已含 nickname 列），本文件仅用于存量库升级

ALTER TABLE users ADD COLUMN nickname TEXT;

-- 存量用户：昵称默认等于用户名（保证非空且唯一）
UPDATE users SET nickname = username WHERE nickname IS NULL OR nickname = '';

-- 昵称唯一索引（改名接口靠它做唯一校验）
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nickname ON users(nickname);
