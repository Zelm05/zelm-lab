-- ============================================================
-- migration-merge-username.sql — 合并 nickname → username
-- 效果：用户名成为唯一登录标识 + 显示名；改名 = 改 username，登录名同步变更。
-- 用法（远程）：npx wrangler d1 execute auth-db --remote --file=./migration-merge-username.sql
-- 注意：本迁移只跑一次；已合并过的库再次执行会因列已不存在而报错，属正常。
-- ============================================================

-- ① 合并存量数据：把 nickname 覆盖到 username。
--    条件：nickname 存在、与 username 不同、且该 nickname 未被其它用户的
--    username 占用（若冲突则保留原 username，避免违反唯一约束）。
UPDATE users SET username = nickname
WHERE nickname IS NOT NULL
  AND nickname <> username
  AND NOT EXISTS (
    SELECT 1 FROM users u2
    WHERE u2.username = users.nickname AND u2.id <> users.id
  );

-- ② 删除昵称唯一索引（username 列级 UNIQUE 约束继续生效）
DROP INDEX IF EXISTS idx_users_nickname;

-- ③ 改名时间戳列改名：nickname_updated_at → username_updated_at
ALTER TABLE users RENAME COLUMN nickname_updated_at TO username_updated_at;

-- ④ 删除 nickname 列（合并后不再使用）
ALTER TABLE users DROP COLUMN nickname;
