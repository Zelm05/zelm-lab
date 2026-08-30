-- ============================================================
-- migration-add-sessions.sql — 单端登录会话表 + 播放进度持久化表
-- 用法：
--   wrangler d1 execute auth-db --local  --file=./migrations/migration-add-sessions.sql
--   wrangler d1 execute auth-db --remote --file=./migrations/migration-add-sessions.sql
-- ============================================================

-- 登录会话：每个「设备端」一行，用于实现「一个账号只能一端在线」
-- id 为服务端生成的随机会话标识，写入 JWT 的 sid 字段
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT    PRIMARY KEY,                 -- 随机会话 id（JWT 中 sid）
  user_id    INTEGER NOT NULL,                    -- 关联用户
  device     TEXT,                               -- 设备/来源描述
  created_at INTEGER NOT NULL,                    -- 登录时间戳（毫秒）
  last_seen  INTEGER NOT NULL                    -- 最近一次心跳（毫秒）
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- 播放进度：按账号持久化（曲目索引 / 播放位置 / 播放模式）
CREATE TABLE IF NOT EXISTS playback_state (
  user_id     INTEGER PRIMARY KEY,               -- 关联用户
  track_index INTEGER NOT NULL DEFAULT 0,        -- 当前曲目索引
  position    REAL    NOT NULL DEFAULT 0,         -- 播放位置（秒）
  mode        TEXT    NOT NULL DEFAULT 'order',  -- order=顺序 / shuffle=随机 / loop=列表循环
  updated_at  INTEGER NOT NULL                   -- 最后更新时间戳（毫秒）
);
