-- ===================================================================
-- seed-owner.sql — 本地测试专用：写入站长账号 + 一个演示账号
-- ⚠️ 只对 `--local` 的本地 D1 执行；千万不要对远程库跑（会覆盖线上站长密码）
--
-- ⚠️ 安全：本文件不再包含任何明文密码或真实盐/哈希。
--    salt / password_hash 用占位符 <...> 代替，必须由下方「生成方式」重新生成后
--    才能对本地库执行（否则账号无法用已知密码登录）。
--
-- 生成方式（与 worker/auth.js 完全一致参数）：
--   PBKDF2-SHA256 / 100000 轮 / 16 字节随机盐 / 256 bit 输出 / Base64URL
--   可在 worker 侧用 hashPassword() 生成，或写一段等价 Node 脚本：
--     const salt = crypto.randomBytes(16).toString('base64url');
--     const hash = crypto.pbkdf2Sync(pwd, salt, 100000, 32, 'sha256').toString('base64url');
--   建议密码（仅本地测试，勿与线上同款）：
--     zelm → 本地站长密码（自行设定）
--     demo → 本地演示密码（自行设定）
-- 账号角色：zelm=owner（站长，唯一）/ demo=user（测管理台用户列表 / 权限拦截）
-- ===================================================================

-- 站长（最高管理员）：ON CONFLICT 覆盖，保证密码一定是已知值
INSERT INTO users (username, salt, password_hash, role, suspended, created_at)
VALUES (
  'zelm',
  '<SALT_PLACEHOLDER_GENERATE_WITH_hasPassword>',
  '<HASH_PLACEHOLDER_GENERATE_WITH_hasPassword>',
  'owner', 0,
  CAST(strftime('%s','now') AS INTEGER) * 1000
)
ON CONFLICT(username) DO UPDATE SET
  salt          = excluded.salt,
  password_hash = excluded.password_hash,
  role          = 'owner',
  suspended     = 0;

-- 演示普通用户（已被站长建过就不覆盖密码）
INSERT OR IGNORE INTO users (username, salt, password_hash, role, suspended, created_at)
VALUES (
  'demo',
  '<SALT_PLACEHOLDER_GENERATE_WITH_hasPassword>',
  '<HASH_PLACEHOLDER_GENERATE_WITH_hasPassword>',
  'user', 0,
  CAST(strftime('%s','now') AS INTEGER) * 1000
);

-- 本地联调方便：默认关闭「关于页密码门」，免得每次进关于页都要输密码
UPDATE site_settings SET value = '0' WHERE key = 'about_password_enabled';
