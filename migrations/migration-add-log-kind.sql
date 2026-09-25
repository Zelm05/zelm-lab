-- ==========================================================================
-- 更新日志分类（2026-09-25）：个人日志 / 更新日志
-- kind ∈ { 'personal', 'update' }，默认 'update'（旧数据视为更新日志）
-- 幂等：ALTER TABLE ... ADD COLUMN 重复执行会报错，属正常（已存在即跳过）
-- 执行：wrangler d1 execute auth-db --remote --file=./migrations/migration-add-log-kind.sql
-- ==========================================================================
ALTER TABLE ebook_chapters ADD COLUMN kind TEXT DEFAULT 'update';
CREATE INDEX IF NOT EXISTS idx_ebook_kind ON ebook_chapters(kind, sort_order);
