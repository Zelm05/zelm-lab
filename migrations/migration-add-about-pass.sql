-- 迁移：站点密钥表（关于页密码），幂等
-- 用法：wrangler d1 execute auth-db --remote --file=./migrations/migration-add-about-pass.sql
CREATE TABLE IF NOT EXISTS site_secrets (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- 关于页密码：默认 1234（SHA-256 十六进制），已存在则不覆盖
INSERT OR IGNORE INTO site_secrets (key, value)
VALUES ('about_password', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4');
