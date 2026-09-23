-- ============================================================
-- rollback-pwd-params-and-moderation-log.sql
-- 回滚 migration-add-pwd-params-and-moderation-log.sql（P2-5 + P2-22）
--
-- ⚠️ 破坏性操作：会**删除列与整张 moderation_log 表**，已软删的留言/反馈会永久丢失
--    （记录行仍在，但 deleted_at 列被删；原 message/feedback 内容不受影响）。
--    执行前务必备份：
--      npx wrangler d1 export auth-db --remote --output=./backups/auth-db-pre-rollback-<日期>.sql
--
-- 用法：
--   wrangler d1 execute auth-db --local  --file=./migrations/rollback-pwd-params-and-moderation-log.sql
--   wrangler d1 execute auth-db --remote --file=./migrations/rollback-pwd-params-and-moderation-log.sql
--
-- 注意：worker 代码仍会读写这些列/表，回滚库结构后必须**同时回滚 worker**
--       （git 或快照还原 worker/{api,community,auth,moderation}.js、worker/reports.js 视情况），
--       否则登录（读 pwd_algo/pwd_iter）与留言列表（过滤 deleted_at）会报 500。
-- ============================================================

-- 审核日志表（整表删除）
DROP TABLE IF EXISTS moderation_log;

-- 软删列
ALTER TABLE messages  DROP COLUMN deleted_at;
ALTER TABLE feedbacks DROP COLUMN deleted_at;

-- 密码参数列
ALTER TABLE users     DROP COLUMN pwd_algo;
ALTER TABLE users     DROP COLUMN pwd_iter;
