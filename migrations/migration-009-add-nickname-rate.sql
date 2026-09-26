-- 存量库升级：users 表新增 nickname_updated_at（上次改名时间戳，用于"每天限改一次"）
-- 新装库直接使用 schema.sql（已含该列）；本文件仅用于已执行过 migration-add-nickname.sql 的库

ALTER TABLE users ADD COLUMN nickname_updated_at INTEGER;
