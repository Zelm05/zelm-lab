-- ============================================================
-- migration-add-pwd-params-and-moderation-log.sql
-- 合并迁移：P2-5（密码算法 / 迭代次数列） + P2-22（审核日志表 + 软删列）
--
-- 用法：
--   wrangler d1 execute auth-db --local  --file=./migrations/migration-add-pwd-params-and-moderation-log.sql
--   wrangler d1 execute auth-db --remote --file=./migrations/migration-add-pwd-params-and-moderation-log.sql
--
-- ⚠️ 一次性迁移，请勿重复执行（ALTER ADD COLUMN 在 SQLite 中不支持 IF NOT EXISTS，
--    重复执行会报 "duplicate column name"）。如需重跑，先执行回滚 SQL 删除列/表再跑。
--
-- 前置：本迁移必须在「部署新 worker」之前执行。worker/index.js 的登录逻辑会读取
--      pwd_algo/pwd_iter 两列并据此重算哈希；listMessages 等会过滤 messages.deleted_at。
--      若先部署 worker 再迁移，登录与留言列表会报 500，故必须先迁移后部署。
-- ============================================================

-- ---------------- P2-5：密码参数列 ----------------
-- 现行 worker/auth.js 固定使用 PBKDF2-SHA256 / 100000 轮；把算法与迭代次数列出来，
-- 未来若想上调迭代次数，登录成功后会自动用新参数重算并写回（见 worker/api.js login()）。
ALTER TABLE users ADD COLUMN pwd_algo TEXT    NOT NULL DEFAULT 'pbkdf2-sha256';
ALTER TABLE users ADD COLUMN pwd_iter INTEGER NOT NULL DEFAULT 100000;

-- ---------------- P2-22：审核日志表 ----------------
-- 记录所有管理动作（删留言 / 删反馈 / 删回复 / 回复反馈 / 踢下线 / 冻结 / 重置密码），
-- 便于事后审计与责任追溯。写入失败被调用方捕获，绝不阻断主流程。
CREATE TABLE IF NOT EXISTS moderation_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id        INTEGER NOT NULL,                 -- 操作者用户 id（admin / owner）
  actor_username  TEXT    NOT NULL,                 -- 操作者用户名（冗余，展示用）
  action          TEXT    NOT NULL,                 -- 动作：delete_message / delete_feedback / delete_reply / reply_feedback / kick_user / suspend_user / reset_password
  target_type     TEXT    NOT NULL,                 -- 对象类型：message / feedback / reply / user
  target_id       INTEGER,                          -- 对象 id（用户类动作为被操作者 id）
  note            TEXT,                             -- 备注（可选）
  created_at      INTEGER NOT NULL                  -- 操作时间戳（毫秒）
);
CREATE INDEX IF NOT EXISTS idx_moderation_actor    ON moderation_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_moderation_created  ON moderation_log(created_at);

-- ---------------- P2-22：软删列（messages / feedbacks） ----------------
-- 删除改「置位」而非物理删除：保留记录便于审计，前端列表过滤 deleted_at IS NULL 不展示。
-- 子表（message_likes / message_replies）在父记录软删时一并物理删除（父已不可见，子无独立意义）。
ALTER TABLE messages  ADD COLUMN deleted_at INTEGER DEFAULT NULL;
ALTER TABLE feedbacks ADD COLUMN deleted_at INTEGER DEFAULT NULL;
