-- 迁移：新增「音乐播放器显隐」站点开关（KV 表，无需改结构）
-- 用法：wrangler d1 execute auth-db --remote --file=./migrations/migration-add-music-player.sql
INSERT OR IGNORE INTO site_settings (key, value) VALUES ('music_player_enabled', '1');
