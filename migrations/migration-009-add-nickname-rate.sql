-- users 表新增 nickname_updated_at（上次改名时间戳，用于"每天限改一次"）
--
-- ⚠️ 注释修正（2026-09-26）：旧注释写「新装库直接使用 schema.sql（已含该列）」是**错的** ——
--    schema.sql 并不含该列（实测新装库执行本文件才把它加上）。
--    本文件对新装库与存量库**都要执行**；存量库若已含该列会报 duplicate column，属预期。
--    后续 migration-018 会把本列改名为 username_updated_at。

ALTER TABLE users ADD COLUMN nickname_updated_at INTEGER;
