-- 给用户表加 avatar 列（注册时可选头像；NULL = 用默认头像）
ALTER TABLE users ADD COLUMN avatar TEXT;
