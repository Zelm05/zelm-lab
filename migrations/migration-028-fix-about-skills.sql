-- ==========================================================================
-- migration-028-fix-about-skills.sql — 修复「擅长技术栈」未迁移/被清空的数据
--
-- 背景（2026-09-27 线上实测）：
--   026 种入的是**纯逗号文本**；站长在后台测试编辑后，zh-CN 变成测试残留
--   'Excel，python'（全角逗号），zh-TW / en / ja 的 skills 在保存时被空值覆盖为 ''。
--   → 原技术栈清单在库内实际已丢失，前台全部回落静态兜底。
--
-- 本迁移：把四语 skills 统一升级为 **JSON 数组**（content-fields.csvToArr 的
--   落库格式），文案与 026/i18n 包逐字一致。
--
-- 幂等 / 安全（绝不覆盖站长后续真实编辑）：
--   · 仅当 skills 为 NULL / 空串 / 已知历史形态（026 纯文本、'Excel，python' 测试值）时才写。
--   · 其它任何值（站长已录的真实内容）一律不动。
--   · 本迁移可重复执行，第二次运行命中不到 WHERE 即 0 行变化。
-- ==========================================================================

-- ============================ zh-CN ============================
UPDATE about_translations SET
  skills = '["Excel","机器学习","Power BI","Python","R语言","SPSS","SQL","数据分析","数据可视化"]',
  updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE about_id = 1 AND lang = 'zh-CN'
  AND (skills IS NULL OR TRIM(skills) = ''
       OR skills = 'Excel，python'
       OR skills = 'Excel,机器学习,Power BI,Python,R语言,SPSS,SQL,数据分析,数据可视化');

-- ============================ zh-TW ============================
UPDATE about_translations SET
  skills = '["Excel","機器學習","Power BI","Python","R語言","SPSS","SQL","資料分析","資料視覺化"]',
  updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE about_id = 1 AND lang = 'zh-TW'
  AND (skills IS NULL OR TRIM(skills) = ''
       OR skills = 'Excel,機器學習,Power BI,Python,R語言,SPSS,SQL,資料分析,資料視覺化');

-- ============================ en ============================
UPDATE about_translations SET
  skills = '["Excel","Machine Learning","Power BI","Python","R","SPSS","SQL","Data Analysis","Data Visualization"]',
  updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE about_id = 1 AND lang = 'en'
  AND (skills IS NULL OR TRIM(skills) = ''
       OR skills = 'Excel,Machine Learning,Power BI,Python,R,SPSS,SQL,Data Analysis,Data Visualization');

-- ============================ ja ============================
UPDATE about_translations SET
  skills = '["Excel","機械学習","Power BI","Python","R言語","SPSS","SQL","データ分析","データ可視化"]',
  updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE about_id = 1 AND lang = 'ja'
  AND (skills IS NULL OR TRIM(skills) = ''
       OR skills = 'Excel,機械学習,Power BI,Python,R言語,SPSS,SQL,データ分析,データ可視化');
