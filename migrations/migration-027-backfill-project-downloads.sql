-- ==========================================================================
-- migration-027 —— 回填项目作品的下载文件引用（2026-09-27）
--
-- 背景：站长已把 3 个下载文件**手工上传到 project-assets 桶根目录**（Supabase 控制台）：
--         Autologin-v1.0.3_release.apk        → campus（安卓）
--         Autologin_v1.2.1_x64_setup.exe      → campus（Windows）
--         Shin-chan_1.0.bin                   → shin（手环表盘）
--       本迁移把「桶前缀引用」回填进 projects.download_path（JSON 数组格式，
--       与 2026-09-27 的 'files' 多文件字段约定一致），前台下载按钮即刻走桶 URL。
--
-- ⚠️ 文件名必须与桶里的对象名**逐字符一致**（exe 在控制台列表里会被截断显示，
--    执行前请核对；如不一致改下面的字符串再跑）。
--
-- 安全性：WHERE download_path IS NULL —— 只填空值，绝不覆盖后台已编辑的引用；
--         重复执行无副作用（幂等）。
-- ==========================================================================

UPDATE projects SET download_path =
  '["project-assets/Autologin-v1.0.3_release.apk","project-assets/Autologin_v1.2.1_x64_setup.exe"]'
WHERE slug = 'campus' AND download_path IS NULL;

UPDATE projects SET download_path =
  '["project-assets/Shin-chan_1.0.bin"]'
WHERE slug = 'shin' AND download_path IS NULL;

-- zelm 项目无下载文件，不处理。
