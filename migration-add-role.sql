-- ============================================================
-- migration-add-role.sql — 存量数据库升级脚本（v1 → v2 管理员系统）
-- 适用：已经用旧版 schema.sql 建过表、现在要升级加入管理员系统的库
-- 用法：
--   wrangler d1 execute auth-db --local  --file=./migration-add-role.sql
--   wrangler d1 execute auth-db --remote --file=./migration-add-role.sql
-- ============================================================

-- 1) 给 users 表增加角色列（存量用户默认全部为普通用户）
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';

-- 2) 把自己的账号提升为管理员（把下面的 你的用户名 换成你的账号）
--    UPDATE users SET role = 'admin' WHERE username = '你的用户名';

-- 3) 也可以选择把"最早注册的账号"提升为管理员
--    UPDATE users SET role = 'admin' WHERE id = (SELECT MIN(id) FROM users);
