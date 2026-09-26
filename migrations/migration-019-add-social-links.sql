-- ==========================================================================
-- 社交链接（可编辑）—— 关于我（2026-09-26）
--
-- 背景：原先社交链接写死在 `src/data/contacts.js`（QQ / 邮箱 / GitHub / Discord / 抖音），
--   站长改一次要动代码 + 重新部署。本迁移把它们搬进数据库，后台可增删改查 / 排序 / 显隐。
--
-- 设计沿用全站既定的「翻译表」方案：
--   主表只存与语言无关的（平台标识、链接、图标、排序、可见性）
--   翻译表按 (link_id, lang) 存显示名（「GitHub」「邮箱」这类词各语言不同）
--
-- 幂等：全部 IF NOT EXISTS，可重复执行。
-- 执行：wrangler d1 execute auth-db --remote --file=./migrations/migration-019-add-social-links.sql
-- ==========================================================================

CREATE TABLE IF NOT EXISTS about_social_links (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  about_id    INTEGER NOT NULL DEFAULT 1,   -- 挂在 about_profile.id=1 下（当前只有一条）
  platform    TEXT NOT NULL,                -- 平台标识：github / twitter / email / qq / discord / douyin …
  url         TEXT NOT NULL,                -- 跳转地址（mailto: 也算）
  icon        TEXT,                         -- 图标：emoji 或图标名（前端按需渲染，不强制）
  sort_order  INTEGER NOT NULL DEFAULT 0,   -- 小的在前
  visible     INTEGER NOT NULL DEFAULT 1,   -- 0 = 前台不显示
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_social_sort ON about_social_links(sort_order, id);

CREATE TABLE IF NOT EXISTS about_social_link_translations (
  link_id     INTEGER NOT NULL,
  lang        TEXT NOT NULL,
  label       TEXT,                         -- 显示名（如「GitHub」「邮箱」）
  updated_at  INTEGER,
  PRIMARY KEY (link_id, lang)
);
CREATE INDEX IF NOT EXISTS idx_social_tr_lang ON about_social_link_translations(lang);


-- ============================ 初始化种子 ============================
-- 把原来写死在 src/data/contacts.js 的 5 条链接灌进来，
-- 站长进后台就能直接编辑，不会出现「上线后社交链接全空」的空窗。
--
-- ⚠️ URL 必须与 `src/data/contacts.js` 的 ABOUT_CONTACTS **逐字一致** ——
--    这是「DB 优先、静态兜底」的兜底数据，两边不一致就等于换了一组链接。
--    脚本 `scripts/check-content-i18n.mjs` 里有一条断言专门盯这件事。
--
-- ⚠️ 用 INSERT ... SELECT WHERE NOT EXISTS 保证**只在缺失时**补，重复执行不会覆盖站长后来改的内容。
INSERT INTO about_social_links (about_id, platform, url, icon, sort_order, visible, created_at)
SELECT 1, 'qq', 'https://im.qq.com', '💬', 10, 1, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM about_social_links WHERE platform = 'qq');
INSERT INTO about_social_links (about_id, platform, url, icon, sort_order, visible, created_at)
SELECT 1, 'email', 'mailto:yz050930@gmail.com', '✉️', 20, 1, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM about_social_links WHERE platform = 'email');
INSERT INTO about_social_links (about_id, platform, url, icon, sort_order, visible, created_at)
SELECT 1, 'github', 'https://github.com/Zelm05', '🐙', 30, 1, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM about_social_links WHERE platform = 'github');
INSERT INTO about_social_links (about_id, platform, url, icon, sort_order, visible, created_at)
SELECT 1, 'discord', 'https://discord.com/users/zelm_05', '🎮', 40, 1, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM about_social_links WHERE platform = 'discord');
INSERT INTO about_social_links (about_id, platform, url, icon, sort_order, visible, created_at)
SELECT 1, 'douyin', 'https://www.douyin.com/search/Darling_Yu_02', '🎵', 50, 1, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM about_social_links WHERE platform = 'douyin');

-- 显示名（label）也一起灌：不灌的话前台 tooltip 会显示平台标识（"qq" / "email"），
-- 比原来静态版本（"QQ 官网" / 邮箱地址）还差。
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
-- 只有 QQ 那条是真需要翻译的（其余是账号/句柄，各语言一样）
INSERT OR IGNORE INTO about_social_link_translations (link_id, lang, label, updated_at)
  SELECT id, 'en', 'QQ Official Site', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM about_social_links WHERE platform = 'qq';
