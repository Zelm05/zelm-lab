-- ==========================================================================
-- migration-023-seed-projects.sql — 把 3 个静态项目（src/data/projects.js）种进 DB
--
-- 背景：前台 ProjectGrid 是「DB 优先、静态兜底」——DB 为空时显示静态 3 项，
--       但管理「项目作品」列表读 DB，看不到已有项目（用户 2026-09-27 提出：
--       已有的项目也应可在管理中修改）。本迁移把静态项目灌进 DB，双方对齐。
-- 幂等：主表按 slug WHERE NOT EXISTS（不覆盖站长已改内容）；
--       翻译表 INSERT OR IGNORE（PK project_id+lang，已存在的语言不覆盖）。
-- 文案来源：src/i18n/packs/home.js（zh-CN）与 src/lang/{en,ja,zh-TW}.json，逐字一致。
-- ⚠️ link 只能存单条主链接（DB 形状如此，前台渲染 1 个外链按钮）；
--    campus 的 apk/exe 下载与 shin 的表盘下载仍是静态兜底专属，不入库。
-- ==========================================================================

-- ===== zelm =====
INSERT INTO projects (slug, cover_path, link, tech_stack, visible, sort_order, created_at)
SELECT 'zelm', NULL, 'https://github.com/Zelm05/zelm-lab', NULL, 1, 10, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM projects WHERE slug = 'zelm');

INSERT OR IGNORE INTO project_translations (project_id, lang, title, summary, detail, updated_at)
  SELECT id, 'zh-CN', 'Zelm 的信息资源库', '全栈作品集：Cloudflare Workers + D1，含账号系统、留言板与管理后台。', '个人信息资源库与作品集，前后端独立完成。后端基于 Cloudflare Workers + D1（SQLite）实现账号体系、留言板、反馈建议与管理后台；前端为 Vue 3 + Vite，按路由分包、静态资源交由 Workers Assets 托管。', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM projects WHERE slug = 'zelm';
INSERT OR IGNORE INTO project_translations (project_id, lang, title, summary, detail, updated_at)
  SELECT id, 'zh-TW', 'Zelm 的資訊資源庫', '全棧作品集：Cloudflare Workers + D1，含帳號系統、留言板與管理後臺。', '個人資訊資源庫，從前端到後端獨立完成的作品集專案。後端基於 Cloudflare Workers + D1（SQLite）實現帳號體系、留言板、反饋建議與管理後臺；前端為 Vue 3 + Vite，按路由分包、靜態資源交由 Workers Assets 託管。', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM projects WHERE slug = 'zelm';
INSERT OR IGNORE INTO project_translations (project_id, lang, title, summary, detail, updated_at)
  SELECT id, 'en', 'Zelm''s Resource Hub', 'Full-stack portfolio: Cloudflare Workers + D1, with accounts, guestbook and admin.', 'A personal resource library — a portfolio built end-to-end by me. The backend uses Cloudflare Workers + D1 (SQLite) for accounts, guestbook, feedback and admin; the frontend is Vue 3 + Vite with per-route code splitting, and static assets are served by Workers Assets.', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM projects WHERE slug = 'zelm';
INSERT OR IGNORE INTO project_translations (project_id, lang, title, summary, detail, updated_at)
  SELECT id, 'ja', 'Zelm の情報リソース庫', 'フルスタック作品集：Cloudflare Workers + D1。アカウント・ゲストブック・管理画面付き。', '個人の情報リソース庫。フロントエンドからバックエンドまで一人で作ったポートフォリオです。バックエンドは Cloudflare Workers + D1（SQLite）でアカウント・ゲストブック・フィードバック・管理画面を実現；フロントエンドは Vue 3 + Vite で、ルート単位の分割と静的資産の配信は Workers Assets で行います。', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM projects WHERE slug = 'zelm';

-- ===== campus =====
INSERT INTO projects (slug, cover_path, link, tech_stack, visible, sort_order, created_at)
SELECT 'campus', NULL, 'https://github.com/Zelm05/campus-autologin', NULL, 1, 20, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM projects WHERE slug = 'campus');

INSERT OR IGNORE INTO project_translations (project_id, lang, title, summary, detail, updated_at)
  SELECT id, 'zh-CN', '校园网自动登录（CQUST）', 'CQUST 校园网自动登录：开机自启、断线自动重连，桌面端与移动端齐备。', '面向 CQUST 校园网的自动登录工具：开机自启、断线自动重连、后台保活，免去每次手动认证 portal 的麻烦。同时提供 Windows 桌面端与 Android 移动端，移动端 UI 针对小屏重新设计，桌面端常驻托盘，适合宿舍/机房环境长期在线使用，持续更新中。', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM projects WHERE slug = 'campus';
INSERT OR IGNORE INTO project_translations (project_id, lang, title, summary, detail, updated_at)
  SELECT id, 'zh-TW', '校園網自動登入（CQUST）', 'CQUST 校園網自動登入：開機自啟、斷線自動重連，桌面端與移動端齊備。', '面向CQUST校園網的自動登入工具：開機自啟、斷線自動重連、後臺保活，免去每次手動認證 portal 的麻煩。同時提供 Windows 桌面端與 Android 移動端，移動端 UI 針對小屏重新設計，桌面端常駐托盤，適合宿舍/機房環境長期線上使用，持續更新中。', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM projects WHERE slug = 'campus';
INSERT OR IGNORE INTO project_translations (project_id, lang, title, summary, detail, updated_at)
  SELECT id, 'en', 'Campus Auto-Login (CQUST)', 'CQUST campus auto-login: auto-start, auto-reconnect, desktop + mobile.', 'Auto-login tool for the CQUST campus network: auto-start, auto-reconnect on drop, keep-alive in background — no more manual portal auth. Ships a Windows desktop client and an Android app; the mobile UI is redesigned for small screens, the desktop client sits in the tray — great for dorms/labs kept online. Continuously updated.', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM projects WHERE slug = 'campus';
INSERT OR IGNORE INTO project_translations (project_id, lang, title, summary, detail, updated_at)
  SELECT id, 'ja', 'キャンパス自動ログイン（CQUST）', 'CQUSTキャンパス自動ログイン：起動時自動接続・切れれば自動再接続。デスクトップとモバイル両対応。', 'CQUSTキャンパスネットワーク向けの自動ログインツール：起動時自動接続、切れたら自動再接続、バックグラウンド維持で、毎回portal認証を手動で行う手間を解消。Windowsデスクトップ版とAndroidモバイル版を提供。モバイルUIは小画面に最適化され、デスクトップ版はトレイに常駐。寮・実験室などの常時オンライン環境に最適。継続更新中。', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM projects WHERE slug = 'campus';

-- ===== shin =====
INSERT INTO projects (slug, cover_path, link, tech_stack, visible, sort_order, created_at)
SELECT 'shin', 'assets/projects/shinchan-watchface.webp', NULL, NULL, 1, 30, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM projects WHERE slug = 'shin');

INSERT OR IGNORE INTO project_translations (project_id, lang, title, summary, detail, updated_at)
  SELECT id, 'zh-CN', '小米手环表盘 · 蜡笔小新', '小米手环 10/11（含 NFC 版）蜡笔小新表盘，下载后用表盘自定义工具导入。', '小米手环表盘文件（蜡笔小新主题），适用于小米手环 10 / 11，含 NFC 版。下载后需配合「表盘自定义工具」导入使用。多功能组件表盘（参考手机界面功能），支持八个常用软件跳转：天气、日历、音乐、睡眠、闹钟、运动情况、微信支付、支付宝；界面还同步显示时间、日期、电量和步数。', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM projects WHERE slug = 'shin';
INSERT OR IGNORE INTO project_translations (project_id, lang, title, summary, detail, updated_at)
  SELECT id, 'zh-TW', '小米手環錶盤 · 蠟筆小新', '小米手環 10/11（含 NFC 版）蠟筆小新錶盤，下載後用錶盤自定義工具匯入。', '小米手環錶盤檔案（蠟筆小新主題），適用於小米手環 10 / 11，含 NFC 版。下載後需配合「錶盤自定義工具」匯入使用。多功能元件錶盤（參考手機介面功能），支援八個常用軟體跳轉：天氣、日曆、音樂、睡眠、鬧鐘、運動情況、微信支付、支付寶；介面還同步顯示時間、日期、電量和步數。', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM projects WHERE slug = 'shin';
INSERT OR IGNORE INTO project_translations (project_id, lang, title, summary, detail, updated_at)
  SELECT id, 'en', 'Mi Band Watch Face · Shin-chan', 'Mi Band 10/11 (incl. NFC) Shin-chan face; import with the custom tool after download.', 'Mi Band watch-face file (Shin-chan theme) for Mi Band 10 / 11, including the NFC edition. Import it with the ''watch-face custom tool'' after download. A multi-function component face (phone-like UI) that jumps to eight common apps: Weather, Calendar, Music, Sleep, Alarm, Activity, WeChat Pay, Alipay; it also shows time, date, battery and steps.', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM projects WHERE slug = 'shin';
INSERT OR IGNORE INTO project_translations (project_id, lang, title, summary, detail, updated_at)
  SELECT id, 'ja', 'Mi バンド文字盤 · クレヨンしんちゃん', 'Mi バンド 10/11（NFC版含む）クレヨンしんちゃん文字盤。ダウンロード後、カスタマイズツールでインポート。', 'Mi バンド用文字盤ファイル（クレヨンしんちゃんテーマ）。Mi バンド 10 / 11 対応、NFC版含む。ダウンロード後、「文字盤カスタマイズツール」でインポートして使います。多機能コンポーネント文字盤（スマホ風UI）で、天気・カレンダー・音楽・睡眠・アラーム・活動量・WeChat Pay・Alipayの8つのよく使うアプリにジャンプ可能。時間・日付・バッテリー・歩数も同期表示されます。', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM projects WHERE slug = 'shin';
