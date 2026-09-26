-- ==========================================================================
-- 纠正 019 的社交链接种子数据（2026-09-26）
--
-- 背景：`migration-019-add-social-links.sql` 第一次发布时，种子里的 URL 有 4/5 是
--   **凭印象写的占位值**，与 `src/data/contacts.js` 的真实值不符：
--     qq      → 写成了 wpa.qq.com/msgrd?...uin=3463648864（真实是 https://im.qq.com，QQ 号 1763222713）
--     email   → 写成了 mailto:zelm050930@gmail.com（真实是 mailto:yz050930@gmail.com）
--     discord → 写成了 discord.com/users/zelm（真实是 /users/zelm_05）
--     douyin  → 写成了 douyin.com/user/zelm（真实是 /search/Darling_Yu_02）
--   019 已经上线执行过，所以要**用一条新迁移把库里已有的错值改回来**。
--   （同时 019 文件本身也已修正，保证全新库从一开始就是对的。）
--
-- 另外补上 label：019 只灌了主表，翻译表是空的 →
--   前台 tooltip 会显示平台标识（"qq" / "email"），比改动前的静态版本还差。
--
-- ⚠️ 只改**仍是占位值**的行：WHERE 里带上原值判断，
--    万一站长已经在后台改过，这里不会把他的修改冲掉。
--
-- 幂等：UPDATE 的条件不匹配时就是 no-op；INSERT OR IGNORE 保证不重复插。
-- 执行：wrangler d1 execute auth-db --remote --file=./migrations/migration-021-fix-social-link-seed.sql
-- ==========================================================================

-- ---------- 1. 修正 URL（带原值判断，不覆盖站长的手改） ----------
UPDATE about_social_links SET url = 'https://im.qq.com', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE platform = 'qq' AND url LIKE 'https://wpa.qq.com/%';

UPDATE about_social_links SET url = 'mailto:yz050930@gmail.com', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE platform = 'email' AND url = 'mailto:zelm050930@gmail.com';

UPDATE about_social_links SET url = 'https://discord.com/users/zelm_05', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE platform = 'discord' AND url = 'https://discord.com/users/zelm';

UPDATE about_social_links SET url = 'https://www.douyin.com/search/Darling_Yu_02', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
  WHERE platform = 'douyin' AND url = 'https://www.douyin.com/user/zelm';

-- ---------- 2. 补 label（019 漏灌了翻译表） ----------
INSERT OR IGNORE INTO about_social_link_translations (link_id, lang, label, updated_at)
  SELECT id, 'zh-CN', 'QQ 官网', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM about_social_links WHERE platform = 'qq';
INSERT OR IGNORE INTO about_social_link_translations (link_id, lang, label, updated_at)
  SELECT id, 'zh-CN', 'yz050930@gmail.com', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM about_social_links WHERE platform = 'email';
INSERT OR IGNORE INTO about_social_link_translations (link_id, lang, label, updated_at)
  SELECT id, 'zh-CN', 'GitHub · Zelm05', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM about_social_links WHERE platform = 'github';
INSERT OR IGNORE INTO about_social_link_translations (link_id, lang, label, updated_at)
  SELECT id, 'zh-CN', 'zelm_05', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM about_social_links WHERE platform = 'discord';
INSERT OR IGNORE INTO about_social_link_translations (link_id, lang, label, updated_at)
  SELECT id, 'zh-CN', 'Darling_Yu_02', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM about_social_links WHERE platform = 'douyin';
INSERT OR IGNORE INTO about_social_link_translations (link_id, lang, label, updated_at)
  SELECT id, 'en', 'QQ Official Site', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM about_social_links WHERE platform = 'qq';
