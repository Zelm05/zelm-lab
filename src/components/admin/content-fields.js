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
 *   select    下拉（options: [[值, i18nKey], …]）
 *   csv       逗号分隔 ↔ JSON 数组（skills / tech_stack / tags）
 *   exp       每行 `时间 | 角色 | 机构 | 说明` ↔ JSON 数组（about.experiences）
 *   image     图片上传（走 photos 桶，带前缀目录）
 *   file      附件上传（PDF 走 moments 桶 —— 见下方说明）
 *   images    多图上传（JSON 数组）
 *
 * ⚠️ 上传桶的现状（重要）：
 *   线上 Supabase 只有 3 个桶：photos / resume / moments。
 *   为避免「必须先让用户去 Supabase 手动建桶才能用」，
 *   这里**复用现有桶 + 目录前缀**：
 *     · 图片 → photos 桶（photos/ 与 moments/ 都允许 webp/jpg/png/gif）
 *     · PDF  → moments 桶（它是唯一允许 pdf 的通用桶）
 *   目录前缀：about/ 、blog/ 、cert/ 、doc/
 *   后续若新建了 blogs / certificates 专用桶，只需改这里的 bucket 字段。
 * ========================================================================== */

export const MODULES = [
  { key: 'about', labelKey: 'cfAbout', single: true },
  { key: 'blogs', labelKey: 'cfBlogs' },
  { key: 'certificates', labelKey: 'cfCerts' },
  { key: 'projects', labelKey: 'cfProjects' },
  { key: 'logs', labelKey: 'cfLogs' },
  { key: 'moments', labelKey: 'cfMoments' },
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
      { key: 'cover_path', type: 'image', labelKey: 'cfFieldCover', bucket: 'photos', prefix: 'proj' },
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
    main: [
      {
        key: 'kind', type: 'select', labelKey: 'cfStatus',
        options: [['update', 'cLogUpdate'], ['personal', 'cLogPersonal']],
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
  resume: 'version',
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
