/* ==========================================================================
 * content-fields.js —— 后台内容管理的「模块 → 字段」配置（唯一数据源）
 *
 * 拆出来的原因：ContentPanel.vue 里既有列表、又有编辑表单、还有上传，
 * 字段定义再内联进去会到 700+ 行。这里只放**声明**，组件只负责渲染。
 *
 * 字段分两类：
 *   main —— 与语言无关（文件、日期、状态、排序、可见性、置顶）→ 只填一次
 *   tr   —— 需要翻译（标题、正文…）→ 每种语言各填一份
 *
 * type 说明（决定渲染成什么控件）：
 *   text      单行输入
 *   textarea  多行输入（rows 可调）
 *   date      <input type="date">（值一律 YYYY-MM-DD）
 *   select    下拉（options: [[值, i18nKey, 命名空间?], …]，命名空间默认 'admin'）
 *   csv       逗号分隔 ↔ JSON 数组（skills / tech_stack / tags）
 *   exp       每行 `时间 | 角色 | 机构 | 说明` ↔ JSON 数组（about.experiences）
 *   image     图片上传（走 photos 桶，带前缀目录）
 *   file      附件上传（PDF 走 moments 桶 —— 见下方说明）
 *   images    多图上传（JSON 数组）
 *
 * ⚠️ 上传桶的现状（重要）：
 *   线上 Supabase 共有 7 个桶，按用途隔离：
 *     photos / resume / moments（历史三桶）
 *     blog-assets / certificate-assets（博客与证书专用，需手工建）
 *     about-assets / project-assets（关于我与项目作品专用，需手工建）
 *   这里**每个模块绑定自己的桶 + 目录前缀**（专用桶与旧 photos 桶解耦，
 *   避免「一个桶塞全站文件」带来的权限/配额耦合）。
 *   目录前缀：about/ 、blog/ 、cert/ 、proj/ 、wall/ 、mm/ 、cv/ 、doc/
 *   新增桶时：worker/editor.js 的 BUCKETS、本文件的字段 bucket、以及
 *   前端 src/core/supabase.js 的 KNOWN_BUCKETS 三处要保持一致。
 * ========================================================================== */

export const MODULES = [
  { key: 'about', labelKey: 'cfAbout', single: true },
  { key: 'blogs', labelKey: 'cfBlogs' },
  { key: 'certificates', labelKey: 'cfCerts' },
  { key: 'projects', labelKey: 'cfProjects' },
  { key: 'logs', labelKey: 'cfLogs' },
  { key: 'moments', labelKey: 'cfMoments' },
  { key: 'photos', labelKey: 'cfPhotos' },
  { key: 'resume', labelKey: 'cfResume', single: true },
];

const IMG = { bucket: 'photos', prefix: 'about' };

export const FIELDS = {
  about: {
    main: [
      { key: 'avatar_path', type: 'image', labelKey: 'cfFieldCover', bucket: 'photos', prefix: 'about' },
    ],
    tr: [
      { key: 'name', type: 'text', labelKey: 'cfFieldName' },
      { key: 'headline', type: 'text', labelKey: 'cfFieldHeadline' },
      { key: 'content', type: 'textarea', labelKey: 'cfFieldContent', rows: 6 },
      { key: 'skills', type: 'csv', labelKey: 'cfFieldSkills' },
      { key: 'experiences', type: 'exp', labelKey: 'cfFieldExp' },
    ],
  },
  blogs: {
    /* 「发布时间」存在 published_at 列（与 created_at 不同：草稿转发布时才写） */
    dateFrom: 'published_at',
    main: [
      {
        key: 'status', type: 'select', labelKey: 'cfStatus',
        options: [['draft', 'cfDraft'], ['published', 'cfPublished']],
      },
      { key: 'cover_path', type: 'image', labelKey: 'cfFieldCover', bucket: 'blog-assets', prefix: 'blog' },
      { key: 'attach_path', type: 'file', labelKey: 'cfFieldAttach', bucket: 'blog-assets', prefix: 'blog' },
      { key: 'tags', type: 'csv', labelKey: 'cfFieldTags' },
      { key: 'pinned', type: 'switch', labelKey: 'cfPinned' },
      { key: 'sort_order', type: 'number', labelKey: 'cfSort' },
      { key: 'date', type: 'date', labelKey: 'cfFieldDate' },
    ],
    tr: [
      { key: 'title', type: 'text', labelKey: 'cfFieldTitle' },
      { key: 'summary', type: 'textarea', labelKey: 'cfFieldSummary', rows: 2 },
      { key: 'content', type: 'textarea', labelKey: 'cfFieldContent', rows: 10 },
    ],
  },
  certificates: {
    main: [
      { key: 'image_path', type: 'image', labelKey: 'cfFieldImage', bucket: 'certificate-assets', prefix: 'certificate' },
      { key: 'pdf_path', type: 'file', labelKey: 'cfFieldPdf', bucket: 'certificate-assets', prefix: 'certificate' },
      { key: 'sort_order', type: 'number', labelKey: 'cfSort' },
      { key: 'issue_date', type: 'date', labelKey: 'cfFieldDate' },
    ],
    tr: [
      { key: 'name', type: 'text', labelKey: 'cfFieldName' },
      { key: 'issuer', type: 'text', labelKey: 'cfFieldIssuer' },
      { key: 'description', type: 'textarea', labelKey: 'cfFieldDesc', rows: 3 },
    ],
  },
  projects: {
    main: [
      { key: 'slug', type: 'text', labelKey: 'cfFieldSlug' },
      { key: 'link', type: 'text', labelKey: 'cfFieldLink' },
      { key: 'cover_path', type: 'image', labelKey: 'cfFieldCover', bucket: 'project-assets', prefix: 'proj' },
      { key: 'tech_stack', type: 'csv', labelKey: 'cfFieldTech' },
      { key: 'visible', type: 'switch', labelKey: 'cfVisible' },
      { key: 'sort_order', type: 'number', labelKey: 'cfSort' },
    ],
    tr: [
      { key: 'title', type: 'text', labelKey: 'cfFieldTitle' },
      { key: 'summary', type: 'textarea', labelKey: 'cfFieldSummary', rows: 2 },
      { key: 'detail', type: 'textarea', labelKey: 'cfFieldContent', rows: 6 },
    ],
  },
  logs: {
    /* 日志的「发布时间」存在 updated_at（历史原因：它当年既是修改时间也是发布时间） */
    dateFrom: 'updated_at',
    main: [
      {
        key: 'kind', type: 'select', labelKey: 'cfStatus',
        /* ⚠️ 第三个元素是**命名空间**：cLogUpdate/cLogPersonal 在 common 包里，
           不加的话模板会用 admin 命名空间去取 → 下拉框显示原始键名 "cLogUpdate"。 */
        options: [['update', 'cLogUpdate', 'common'], ['personal', 'cLogPersonal', 'common']],
      },
      { key: 'visible', type: 'switch', labelKey: 'cfVisible' },
      { key: 'pinned', type: 'switch', labelKey: 'cfPinned' },
      { key: 'date', type: 'date', labelKey: 'cfFieldDate' },
    ],
    tr: [
      { key: 'title', type: 'text', labelKey: 'cfFieldTitle' },
      { key: 'content', type: 'textarea', labelKey: 'cfFieldContent', rows: 8 },
    ],
  },
  moments: {
    dateFrom: 'created_at',
    main: [
      { key: 'images', type: 'images', labelKey: 'cfFieldImage', bucket: 'moments', prefix: 'mm' },
      { key: 'date', type: 'date', labelKey: 'cfFieldDate' },
      { key: 'visible', type: 'switch', labelKey: 'cfVisible' },
      { key: 'pinned', type: 'switch', labelKey: 'cfPinned' },
    ],
    tr: [
      { key: 'content', type: 'textarea', labelKey: 'cfFieldContent', rows: 5 },
      { key: 'location', type: 'text', labelKey: 'cfFieldLocation' },
    ],
  },
  /* 照片墙：图片 + 多语言标题/描述。
     前缀沿用历史值 'wall' —— 老文件都在 photos 桶的 wall/ 目录下，改了会读不到。 */
  photos: {
    main: [
      { key: 'storage_path', type: 'image', labelKey: 'cfFieldImage', bucket: 'photos', prefix: 'wall' },
      { key: 'sort_order', type: 'number', labelKey: 'cfSort' },
    ],
    tr: [
      { key: 'title', type: 'text', labelKey: 'cfFieldTitle' },
      { key: 'description', type: 'textarea', labelKey: 'cfFieldDesc', rows: 2 },
    ],
  },
  /* 简历：单行、只有一个 PDF，**与语言无关** → tr 为空。
     空 tr 时 ContentPanel 会跳过「至少填一种语言」的校验（否则永远存不下去）。 */
  resume: {
    main: [
      { key: 'storage_path', type: 'file', labelKey: 'cfFieldPdf', bucket: 'resume', prefix: 'cv' },
      { key: 'version', type: 'text', labelKey: 'cfFieldVersion' },
    ],
    tr: [],
  },
};

/** 列表里用来当「标题」显示的字段（按优先级找） */
export const TITLE_FIELD = {
  about: 'name',
  blogs: 'title',
  certificates: 'name',
  projects: 'title',
  logs: 'title',
  moments: 'content',
  photos: 'title',
  resume: 'version',
};

/**
 * 各模块对应的 Supabase 存储桶（管理窗口的「存储文件」区按它列出桶内容）。
 * 日志是纯文本、没有文件 → 空数组（面板里隐藏该区）。
 * 项目图沿用 photos 桶（与 ProjectImagesEditor 一致）。
 */
export const STORE_BUCKETS = {
  about: ['photos'],
  blogs: ['blog-assets'],
  certificates: ['certificate-assets'],
  projects: ['project-assets'],
  logs: [],
  moments: ['moments'],
  photos: ['photos'],
  resume: ['resume'],
};

/* ---------------- 值 ↔ 表单文本 的互转 ---------------- */
function parseJson(raw) {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw;
  try {
    const v = JSON.parse(String(raw));
    return Array.isArray(v) ? v : null;
  } catch (e) { return null; }
}

/** JSON 数组 → "a, b, c" */
export function arrToCsv(raw) {
  const a = parseJson(raw);
  return a ? a.join(', ') : '';
}
/** "a, b" → JSON 数组字符串（空则返回空串，表示不写入） */
export function csvToArr(text) {
  const a = String(text || '').split(',').map((s) => s.trim()).filter(Boolean);
  return a.length ? JSON.stringify(a) : '';
}

/** JSON 数组 → 多行 "时间 | 角色 | 机构 | 说明" */
export function arrToExpLines(raw) {
  const a = parseJson(raw);
  if (!a) return '';
  return a.map((e) => [e.period, e.role, e.org, e.desc].map((x) => x || '').join(' | ')).join('\n');
}
export function expLinesToArr(text) {
  const rows = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const a = rows.map((l) => {
    const p = l.split('|').map((s) => s.trim());
    return { period: p[0] || '', role: p[1] || '', org: p[2] || '', desc: p[3] || '' };
  });
  return a.length ? JSON.stringify(a) : '';
}

/** 把接口返回的原始值转成表单里显示的值 */
export function toForm(field, raw) {
  if (field.type === 'csv') return arrToCsv(raw);
  if (field.type === 'exp') return arrToExpLines(raw);
  /* visible / pinned 在库里是 INTEGER 0/1（且可能为 NULL，NULL 按「可见/不置顶」处理） */
  if (field.type === 'switch') return raw == null ? true : !!Number(raw);
  if (field.type === 'number') return raw == null ? 0 : Number(raw);
  return raw == null ? '' : raw;
}

/** 把表单里的值转成要提交给接口的值 */
export function fromForm(field, val) {
  if (field.type === 'csv') return csvToArr(val);
  if (field.type === 'exp') return expLinesToArr(val);
  if (field.type === 'switch') return val ? 1 : 0;
  if (field.type === 'number') return Number(val) || 0;
  return val;
}

/* 导出给外部复用的桶常量（如需新增专用桶只改这里） */
export { IMG };
