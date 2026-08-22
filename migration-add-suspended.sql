-- 为用户表添加 suspended（冻结）字段
ALTER TABLE users ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0;
