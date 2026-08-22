-- ============================================================
-- schema.sql — Cloudflare D1（原生 SQLite）建表脚本
-- 用法：wrangler d1 execute auth-db --local  --file=./schema.sql
--       wrangler d1 execute auth-db --remote --file=./schema.sql
-- ============================================================

-- 用户信息表
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,               -- 用户名（唯一，作为登录标识）
  salt          TEXT    NOT NULL,                     -- 随机盐（Base64URL 字符串）
  password_hash TEXT    NOT NULL,                     -- PBKDF2 哈希（Base64URL 字符串）
  created_at    INTEGER NOT NULL                     -- 注册时间戳（毫秒）
);

-- 为用户名查询建立索引，加速登录校验与注册唯一性检查
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
