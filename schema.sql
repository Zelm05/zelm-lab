-- ============================================================
-- schema.sql — Cloudflare D1（原生 SQLite）建表脚本
-- 用法：wrangler d1 execute auth-db --local  --file=./schema.sql
--       wrangler d1 execute auth-db --remote --file=./schema.sql
-- ============================================================

-- 用户信息表（用户名即登录标识与显示名，唯一；改名会同步更新登录名）
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,               -- 用户名（唯一，既是登录标识也是显示名；可汉字，改名后登录名同步变更）
  username_updated_at INTEGER,                         -- 上次改名时间戳（毫秒；NULL=未改过名，用于每天限改一次）
  salt          TEXT    NOT NULL,                     -- 随机盐（Base64URL 字符串）
  password_hash TEXT    NOT NULL,                     -- PBKDF2 哈希（Base64URL 字符串）
  role          TEXT    NOT NULL DEFAULT 'user',      -- 角色：user（普通用户）/ admin（管理员）/ owner（站长）
  suspended     INTEGER NOT NULL DEFAULT 0,           -- 0=正常 1=冻结
  created_at    INTEGER NOT NULL                     -- 注册时间戳（毫秒）
);

-- 为用户名查询建立索引，加速登录校验与注册唯一性检查
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- ============================================================
-- 社区功能表（留言 / 点赞 / 反馈建议）
-- ============================================================

-- 留言板：所有人可见；仅管理员可删除
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,                          -- 发表者用户 id
  username   TEXT    NOT NULL,                          -- 发表者用户名（冗余，展示用）
  content    TEXT    NOT NULL,                          -- 留言内容（≤500 字）
  likes      INTEGER NOT NULL DEFAULT 0,                -- 点赞数（冗余计数）
  created_at INTEGER NOT NULL                           -- 发表时间戳（毫秒）
);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(id DESC);

-- 留言点赞记录：同一用户对同一条留言只能点一次（防重复）
CREATE TABLE IF NOT EXISTS message_likes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  user_id    INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(message_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_message_likes_mid ON message_likes(message_id);

-- 留言回复：用户可回复留言；parent_reply_id 支持对已有回复的再回复（一楼回复为 NULL）
CREATE TABLE IF NOT EXISTS message_replies (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id      INTEGER NOT NULL,                 -- 所属留言 id
  user_id         INTEGER NOT NULL,                 -- 回复者用户 id
  username        TEXT    NOT NULL,                 -- 回复者用户名（冗余，展示用）
  content         TEXT    NOT NULL,                 -- 回复内容（≤500 字）
  parent_reply_id INTEGER,                          -- 回复的上级回复 id（可选）
  created_at      INTEGER NOT NULL                  -- 回复时间戳（毫秒）
);
CREATE INDEX IF NOT EXISTS idx_message_replies_mid ON message_replies(message_id);

-- 反馈 / 建议：仅普通用户可提交；管理员可查看并回复
CREATE TABLE IF NOT EXISTS feedbacks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,                          -- 提交者用户 id
  username   TEXT    NOT NULL,                          -- 提交者用户名（冗余，展示用）
  kind       TEXT    NOT NULL,                          -- 'feedback' 反馈 / 'suggestion' 建议
  content    TEXT    NOT NULL,                          -- 内容（≤1000 字）
  reply      TEXT,                                      -- 管理员回复
  replied_at INTEGER,                                   -- 回复时间戳（毫秒）
  created_at INTEGER NOT NULL                           -- 提交时间戳（毫秒）
);
CREATE INDEX IF NOT EXISTS idx_feedbacks_created ON feedbacks(id DESC);

-- ============================================================
-- 站点密钥（关于页密码等，key-value）
-- ============================================================
CREATE TABLE IF NOT EXISTS site_secrets (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- 关于页密码：默认 1234（SHA-256 十六进制）
INSERT OR IGNORE INTO site_secrets (key, value)
VALUES ('about_password', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4');

-- 单端登录会话表：每个「设备端」一行，用于实现「一个账号只能一端在线」
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT    PRIMARY KEY,                 -- 随机会话 id（JWT 中 sid）
  user_id    INTEGER NOT NULL,                    -- 关联用户
  device     TEXT,                               -- 设备/来源描述
  created_at INTEGER NOT NULL,                    -- 登录时间戳（毫秒）
  last_seen  INTEGER NOT NULL                    -- 最近一次心跳（毫秒）
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- 播放进度持久化表：按账号保存曲目索引 / 播放位置 / 播放模式
CREATE TABLE IF NOT EXISTS playback_state (
  user_id     INTEGER PRIMARY KEY,               -- 关联用户
  track_index INTEGER NOT NULL DEFAULT 0,        -- 当前曲目索引
  position    REAL    NOT NULL DEFAULT 0,         -- 播放位置（秒）
  mode        TEXT    NOT NULL DEFAULT 'order',  -- order=顺序 / shuffle=随机 / loop=列表循环
  updated_at  INTEGER NOT NULL                   -- 最后更新时间戳（毫秒）
);

-- ============================================================
-- 请求频率限制表（Rate Limiting）
-- ============================================================
CREATE TABLE IF NOT EXISTS rate_limits (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  key        TEXT    NOT NULL,                   -- 限制键（如 IP + 接口名）
  created_at INTEGER NOT NULL                    -- 请求时间戳（毫秒）
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_key_time ON rate_limits(key, created_at);

-- ============================================================
-- 性能优化索引
-- ============================================================

-- 会话查询优化：按用户和最后活动时间查询
CREATE INDEX IF NOT EXISTS idx_sessions_last_seen ON sessions(last_seen);

-- 反馈查询优化：按类型筛选
CREATE INDEX IF NOT EXISTS idx_feedbacks_kind ON feedbacks(kind);

-- 用户查询优化：按角色和冻结状态筛选
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_suspended ON users(suspended);

-- 留言点赞查询优化
CREATE INDEX IF NOT EXISTS idx_message_likes_user ON message_likes(user_id);

-- 留言回复查询优化
CREATE INDEX IF NOT EXISTS idx_message_replies_user ON message_replies(user_id);
