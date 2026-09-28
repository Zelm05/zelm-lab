-- ==========================================================================
-- migration-030-ai-chat-history.sql — AI 聊天记录落库（2026-09-28）
--
-- 背景：AI 多会话历史原先只存在浏览器 sessionStorage（`zelm_ai_chat_v2`），
--   换设备 / 换浏览器 / 清缓存即丢失，且无法跨端续聊。本次改为落到 D1，
--   并**按登录用户严格隔离**：每个用户只能读写自己的会话与消息。
--
-- 设计要点：
--   1) 两张表：会话 `ai_chat_sessions` + 消息 `ai_chat_messages`；
--      先建父表再建子表（子表 FK 引用父表，顺序反了会 "no such table"）。
--   2) 会话 id 沿用前端既有算法 `s_<base36(时间戳)><4位随机>`（不引入 UUID，
--      与 core/ai-chat-store.js 的 newId() 保持一致，迁移期可原样搬旧数据）。
--   3) 隔离靠两层：
--        · 会话表 user_id —— 所有 SQL 必带 `WHERE user_id = ?`；
--        · 消息表冗余一份 user_id —— 单表即可判定归属，不必每次 JOIN 会话表，
--          同时消息接口先校验「会话属于我」再动消息，越权一律 404（不暴露存在性）。
--   4) 删除级联：会话删 → 消息跟着删；用户删（users 行被删）→ 其会话、消息全清。
--   5) 时间统一 ISO 8601 文本（`new Date().toISOString()`，毫秒精度），
--      字典序即时间序，排序直接用 ORDER BY，无需额外索引列。
--   6) 消息表**不记 token / usage** —— Neuron 记账已在站点级 ai_usage 表
--      （migration-029）完成，不重复建列。

CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  id         TEXT PRIMARY KEY,           -- 's_' + base36(ms时间戳) + 4 位随机（沿用前端 newId）
  user_id    INTEGER NOT NULL,           -- 关联 users.id —— 用户隔离关键列
  title      TEXT NOT NULL DEFAULT '新对话',
  pinned     INTEGER NOT NULL DEFAULT 0, -- 0 普通 / 1 置顶
  created_at TEXT NOT NULL,              -- ISO 8601
  updated_at TEXT NOT NULL,              -- ISO 8601（发消息 / 重命名 / 置顶都会刷新）
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 列表查询主路径：某用户的会话，置顶优先、其余按最近活跃倒序
CREATE INDEX IF NOT EXISTS idx_ai_sessions_user
  ON ai_chat_sessions(user_id, pinned DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id         TEXT PRIMARY KEY,           -- 'm_' + base36(ms时间戳) + 4 位随机
  session_id TEXT NOT NULL,              -- 所属会话
  user_id    INTEGER NOT NULL,           -- 冗余归属列：消息接口可单表鉴权
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL,              -- ISO 8601
  FOREIGN KEY (session_id) REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 打开会话时按时间正序拉全部消息（rowid 兜底同毫秒的插入次序）
CREATE INDEX IF NOT EXISTS idx_ai_messages_session
  ON ai_chat_messages(session_id, created_at);

-- 兜底：直接按用户清理 / 统计某用户全部消息
CREATE INDEX IF NOT EXISTS idx_ai_messages_user
  ON ai_chat_messages(user_id);
