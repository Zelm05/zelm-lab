-- 迁移：站点设置表（站长可控的全站开关），幂等
-- 用法：wrangler d1 execute auth-db --remote --file=./migrations/migration-add-site-settings.sql
CREATE TABLE IF NOT EXISTS site_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- 关于页访问密码开关（1=需要密码 0=免密进入）
INSERT OR IGNORE INTO site_settings (key, value) VALUES ('about_password_enabled', '1');
-- 欢迎页「进入网站」的落地页：index=资源库主页 / about=关于我
INSERT OR IGNORE INTO site_settings (key, value) VALUES ('entry_page', 'index');
-- 发表留言是否要求先登录（1=需要 0=游客可发）
INSERT OR IGNORE INTO site_settings (key, value) VALUES ('message_login_required', '1');
-- 进入关于页是否要求先登录（1=需要 0=游客可进）
INSERT OR IGNORE INTO site_settings (key, value) VALUES ('about_login_required', '1');
-- 关于页「照片墙」板块是否显示（1=显示 0=板块与导航项同时隐藏）
INSERT OR IGNORE INTO site_settings (key, value) VALUES ('photo_wall_enabled', '1');
-- 主站是否显示「关于我」板块（1=显示 0=板块与导航项同时隐藏）
INSERT OR IGNORE INTO site_settings (key, value) VALUES ('home_about_enabled', '1');
