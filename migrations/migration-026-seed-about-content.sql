-- ==========================================================================
-- migration-026-seed-about-content.sql — 把「关于我」原始文案灌入 about_translations
--
-- 背景：migration-024 只给 about_translations 加了 education 列，但**从未写入数据**。
--       原「个人简介 / 教育背景 / 擅长技术栈」一直只存在于 i18n 静态包（about.js 的
--       aboutBio/aboutEdu + AboutView 的 FALLBACK_SKILLS），前台靠回落显示。
--       这导致后台「管理关于」打开是空的、无法在库内直接编辑原文。
--       本迁移把原文种进 DB，使「原文迁移到数据库」真正落地，后台即可见可改。
--
-- 文案来源（逐字一致）：
--   zh-CN : src/i18n/packs/about.js 的 aboutBio / aboutEdu + AboutView.FALLBACK_SKILLS
--   zh-TW : src/lang/zh-TW.json  (aboutBio / aboutEdu)
--   en    : src/lang/en.json     (aboutBio / aboutEdu)
--   ja    : src/lang/ja.json     (aboutBio / aboutEdu)
--
-- 安全 / 幂等：
--   · zh-CN：先 INSERT OR IGNORE 保证有行；再 UPDATE 用 COALESCE(NULLIF) 只填空列、
--            用 CASE 替换已知脏数据 '哈哈哈'，绝不覆盖站长后续的真实编辑。
--   · zh-TW / en / ja：INSERT OR IGNORE（缺才插、已存在不覆盖）。
--   · education 列由 migration-024 提供，本迁移序号在其之后，执行时列已存在。
-- ==========================================================================

-- ============================ zh-CN ============================
INSERT OR IGNORE INTO about_translations (about_id, lang, name, headline, content, education, skills, updated_at)
VALUES (1, 'zh-CN', 'Zelm', '应用统计学专业 · 数据分析方向 · 持续沉淀与分享',
  '应用统计学专业本科，正在系统性学习 SQL / Python / 数据可视化与 BI 工具，用数据把业务故事讲清楚。',
  '重庆科技大学 · 应用统计学（本科）。',
  'Excel,机器学习,Power BI,Python,R语言,SPSS,SQL,数据分析,数据可视化',
  CAST(strftime('%s','now') AS INTEGER) * 1000);

UPDATE about_translations SET
  name      = COALESCE(NULLIF(name, ''), 'Zelm'),
  headline  = COALESCE(NULLIF(headline, ''), '应用统计学专业 · 数据分析方向 · 持续沉淀与分享'),
  content   = COALESCE(NULLIF(content, ''), '应用统计学专业本科，正在系统性学习 SQL / Python / 数据可视化与 BI 工具，用数据把业务故事讲清楚。'),
  education = COALESCE(NULLIF(education, ''), '重庆科技大学 · 应用统计学（本科）。'),
  skills    = CASE
                WHEN skills IS NULL OR TRIM(skills) = '' OR skills = '哈哈哈'
                THEN 'Excel,机器学习,Power BI,Python,R语言,SPSS,SQL,数据分析,数据可视化'
                ELSE skills
              END,
  updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE about_id = 1 AND lang = 'zh-CN';

-- ============================ zh-TW ============================
INSERT OR IGNORE INTO about_translations (about_id, lang, name, headline, content, education, skills, updated_at)
VALUES (1, 'zh-TW', 'Zelm', '應用統計學專業 · 資料分析方向 · 持續沉澱與分享',
  '應用統計學專業本科，正在系統性學習 SQL / Python / 資料視覺化與 BI 工具，用資料把業務故事講清楚。',
  '重慶科技大學 · 應用統計學（本科）。',
  'Excel,機器學習,Power BI,Python,R語言,SPSS,SQL,資料分析,資料視覺化',
  CAST(strftime('%s','now') AS INTEGER) * 1000);

-- ============================ en ============================
INSERT OR IGNORE INTO about_translations (about_id, lang, name, headline, content, education, skills, updated_at)
VALUES (1, 'en', 'Zelm', 'Applied Statistics · Data Analytics · Continuous learning & sharing',
  'Undergraduate in Applied Statistics, systematically learning SQL / Python / data visualization and BI tools, telling business stories with data.',
  'Chongqing University of Science and Technology · Applied Statistics (B.Sc.).',
  'Excel,Machine Learning,Power BI,Python,R,SPSS,SQL,Data Analysis,Data Visualization',
  CAST(strftime('%s','now') AS INTEGER) * 1000);

-- ============================ ja ============================
INSERT OR IGNORE INTO about_translations (about_id, lang, name, headline, content, education, skills, updated_at)
VALUES (1, 'ja', 'Zelm', '応用統計学専攻 · データ分析 · 継続的な学習と共有',
  '応用統計学専攻の学部生。SQL / Python / データビジュアライゼーション / BIツールを体系的に学び、データでビジネスの物語を分かりやすく伝えています。',
  '重慶科技大学（Chongqing University of Science and Technology） · 応用統計学（学士）。',
  'Excel,機械学習,Power BI,Python,R言語,SPSS,SQL,データ分析,データ可視化',
  CAST(strftime('%s','now') AS INTEGER) * 1000);
