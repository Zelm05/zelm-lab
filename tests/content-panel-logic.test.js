/* ==========================================================================
 * content-panel-logic.test.js —— 后台内容面板「纯函数层」单测（P1-4）
 *
 * 覆盖的是从 ContentPanel.vue 抽出来的、**踩过坑**的那几条规则：
 *   · 列表标题的三级回落（当前语言 → zh-CN → 任意语言 → #id）
 *   · 翻译完整度 / 「未翻译」标记的判定（空白串不算已填）
 *   · 日期字段的**分模块**回填来源（日志走 updated_at，博客走 published_at）
 *   · 多文件字段三种历史形态的解析
 *   · 删记录 / 换文件时「哪些 Storage 文件该删」的挑选规则
 *
 * ⚠️ 本目录的用例**不要** import vitest（globals 由 worker 注入，
 *    显式 import 会拿到另一份 vitest 实例导致整个文件收集失败，见 vite.config.js）。
 * ========================================================================== */
import {
  fmtSize, msToDate, pickTitle, completenessOf, langFilledIn,
  parseFilesList, imageUrlOfRaw, imageUrlOf, thumbUrlOf,
  blankTr, newMainForm, mainFormFrom, trFormFrom,
  assetRefsOfRow, replacedAssetRefs,
} from '@/components/admin/content-panel-logic';
import { FIELDS, TITLE_FIELD } from '@/components/admin/content-fields';

const LANGS = [
  { code: 'zh-CN', name: '简体中文' },
  { code: 'zh-TW', name: '繁體中文' },
  { code: 'en', name: 'English' },
  { code: 'ja', name: '日本語' },
];
const CODES = LANGS.map((l) => l.code);

/* 用「本地时间构造」保证断言与运行环境的时区无关 */
const ts = (y, m, d) => new Date(y, m - 1, d).getTime();

describe('fmtSize', () => {
  it('空值显示破折号', () => {
    expect(fmtSize(0)).toBe('—');
    expect(fmtSize(null)).toBe('—');
    expect(fmtSize(undefined)).toBe('—');
  });
  it('按 B / KB / MB 分档', () => {
    expect(fmtSize(512)).toBe('512 B');
    expect(fmtSize(1023)).toBe('1023 B');
    expect(fmtSize(1024)).toBe('1.0 KB');
    expect(fmtSize(1536)).toBe('1.5 KB');
    expect(fmtSize(1024 * 1024)).toBe('1.0 MB');
    expect(fmtSize(1024 * 1024 * 2.5)).toBe('2.5 MB');
  });
});

describe('msToDate', () => {
  it('非法 / 非正数返回空串', () => {
    expect(msToDate(0)).toBe('');
    expect(msToDate(-1)).toBe('');
    expect(msToDate('abc')).toBe('');
    expect(msToDate(null)).toBe('');
    expect(msToDate(Infinity)).toBe('');
  });
  it('输出 YYYY-MM-DD 并补零', () => {
    expect(msToDate(ts(2026, 9, 30))).toBe('2026-09-30');
    expect(msToDate(ts(2026, 1, 5))).toBe('2026-01-05');
  });
});

describe('pickTitle', () => {
  const it1 = { id: 7, translations: { 'zh-CN': { title: '中文标题' }, en: { title: 'English' } } };
  it('优先当前语言', () => {
    expect(pickTitle('title', 'en', it1)).toBe('English');
  });
  it('当前语言缺失 → 回落 zh-CN', () => {
    expect(pickTitle('title', 'ja', it1)).toBe('中文标题');
  });
  it('当前语言与 zh-CN 都缺失 → 取任意一种', () => {
    const row = { id: 3, translations: { ja: { title: '日本語' } } };
    expect(pickTitle('title', 'en', row)).toBe('日本語');
  });
  it('都没有 → 退到 #id', () => {
    expect(pickTitle('title', 'en', { id: 42, translations: {} })).toBe('#42');
    expect(pickTitle('title', 'en', { id: 42 })).toBe('#42');
  });
  it('超长标题截断到 60 字符', () => {
    const long = 'x'.repeat(100);
    const row = { id: 1, translations: { 'zh-CN': { title: long } } };
    expect(pickTitle('title', 'zh-CN', row)).toBe('x'.repeat(60));
  });
  it('空串标题视为未填 → 退到 #id（不是显示空标题）', () => {
    const row = { id: 9, translations: { 'zh-CN': { title: '' } } };
    expect(pickTitle('title', 'zh-CN', row)).toBe('#9');
  });
  it('对每个模块都能取到 TITLE_FIELD 里登记的字段', () => {
    for (const mod of Object.keys(TITLE_FIELD)) {
      const f = TITLE_FIELD[mod];
      const row = { id: 5, translations: { 'zh-CN': { [f]: 'ok' } } };
      expect(pickTitle(f, 'zh-CN', row)).toBe('ok');
    }
  });
});

describe('completenessOf / langFilledIn', () => {
  const trFields = FIELDS.blogs.tr;   /* title / summary / content */
  it('未填任何语言 → 0/4', () => {
    expect(completenessOf(trFields, LANGS, {})).toBe('0/4');
  });
  it('部分语言已填 → 计数正确', () => {
    const tr = {
      'zh-CN': { title: 'a' },
      en: { content: 'b' },
    };
    expect(completenessOf(trFields, LANGS, tr)).toBe('2/4');
  });
  it('纯空白不算已填', () => {
    const tr = { 'zh-CN': { title: '   ', content: '\n\t' } };
    expect(completenessOf(trFields, LANGS, tr)).toBe('0/4');
    expect(langFilledIn(trFields, tr, 'zh-CN')).toBe(false);
  });
  it('全部语言已填 → 4/4', () => {
    const tr = {};
    for (const c of CODES) tr[c] = { title: 't' };
    expect(completenessOf(trFields, LANGS, tr)).toBe('4/4');
  });
  it('tr 为空的模块（简历）→ 0/4，且不会误判为已填', () => {
    expect(completenessOf(FIELDS.resume.tr, LANGS, { 'zh-CN': { anything: 'x' } })).toBe('0/4');
    expect(langFilledIn(FIELDS.resume.tr, { 'zh-CN': { anything: 'x' } }, 'zh-CN')).toBe(false);
  });
  it('缺失的 tr 对象不抛异常', () => {
    expect(completenessOf(trFields, LANGS, undefined)).toBe('0/4');
    expect(langFilledIn(trFields, undefined, 'en')).toBe(false);
    expect(langFilledIn(trFields, {}, 'en')).toBe(false);
  });
});

describe('parseFilesList', () => {
  it('空值 → 空数组', () => {
    expect(parseFilesList('')).toEqual([]);
    expect(parseFilesList(null)).toEqual([]);
    expect(parseFilesList(undefined)).toEqual([]);
  });
  it('JSON 数组 → [{ref,name}]，name 取路径末段', () => {
    const raw = JSON.stringify(['project-assets/proj/1/a.apk', 'project-assets/proj/1/b.exe']);
    expect(parseFilesList(raw)).toEqual([
      { ref: 'project-assets/proj/1/a.apk', name: 'a.apk' },
      { ref: 'project-assets/proj/1/b.exe', name: 'b.exe' },
    ]);
  });
  it('数组里的空值被过滤', () => {
    expect(parseFilesList(JSON.stringify(['x/y.pdf', '', null]))).toEqual([
      { ref: 'x/y.pdf', name: 'y.pdf' },
    ]);
  });
  it('单个引用字符串（非 JSON）→ 单项', () => {
    expect(parseFilesList('resume/cv/1/old.pdf')).toEqual([
      { ref: 'resume/cv/1/old.pdf', name: 'old.pdf' },
    ]);
  });
  it('JSON 但不是数组 → 退化成单引用（不丢文件）', () => {
    /* 注意：这里刻意锁住**原实现的既有行为** —— 非数组的 JSON 会连同引号一起
       当成裸引用字符串回显（`name` 取 `split('/').pop()`）。它不美观，但改了就是行为变更。 */
    expect(parseFilesList('"a/b.pdf"')).toEqual([{ ref: '"a/b.pdf"', name: 'b.pdf"' }]);
    expect(parseFilesList('{"a":1}')).toEqual([{ ref: '{"a":1}', name: '{"a":1}' }]);
  });
});

describe('imageUrlOfRaw / imageUrlOf / thumbUrlOf', () => {
  const SUPABASE = 'https://wrguksjsbdvoqfedsdow.supabase.co';
  const imgField = { key: 'cover_path', type: 'image', bucket: 'blog-assets' };
  const imgsField = { key: 'images', type: 'images', bucket: 'moments' };

  it('image：桶前缀引用 → 该桶的公开 URL', () => {
    expect(imageUrlOfRaw(imgField, 'blog-assets/blog/1/x.webp')).toBe(
      SUPABASE + '/storage/v1/object/public/blog-assets/' + encodeURIComponent('blog/1/x.webp'),
    );
  });
  it('image：旧格式裸路径 → 回落字段桶', () => {
    expect(imageUrlOfRaw(imgField, 'photo-01.webp')).toBe(
      SUPABASE + '/storage/v1/object/public/blog-assets/photo-01.webp',
    );
  });
  it('image：空值 → 空串', () => {
    expect(imageUrlOfRaw(imgField, '')).toBe('');
    expect(imageUrlOfRaw(imgField, null)).toBe('');
  });
  it('images：取数组第一项', () => {
    const raw = JSON.stringify(['moments/mm/1/a.jpg', 'moments/mm/1/b.jpg']);
    expect(imageUrlOfRaw(imgsField, raw)).toBe(
      SUPABASE + '/storage/v1/object/public/moments/' + encodeURIComponent('mm/1/a.jpg'),
    );
  });
  it('images：空数组 / 非法 JSON → 空串（不抛）', () => {
    expect(imageUrlOfRaw(imgsField, '[]')).toBe('');
    expect(imageUrlOfRaw(imgsField, '{bad json')).toBe('');
  });
  it('imageUrlOf 从 editor 里取值；editor 为 null 时安全返回空串', () => {
    expect(imageUrlOf({ main: { cover_path: 'blog-assets/blog/1/x.webp' } }, imgField)).toBe(
      SUPABASE + '/storage/v1/object/public/blog-assets/' + encodeURIComponent('blog/1/x.webp'),
    );
    expect(imageUrlOf(null, imgField)).toBe('');
    expect(imageUrlOf({}, imgField)).toBe('');
  });
  it('thumbUrlOf：取第一个 image/images 字段', () => {
    const fields = FIELDS.moments.main;   /* 第一个图片字段是 images */
    const row = { images: JSON.stringify(['moments/mm/2/p.jpg']) };
    expect(thumbUrlOf(fields, row)).toBe(
      SUPABASE + '/storage/v1/object/public/moments/' + encodeURIComponent('mm/2/p.jpg'),
    );
  });
  it('thumbUrlOf：没有图片字段 / 行内无值 → 空串', () => {
    expect(thumbUrlOf(FIELDS.logs.main, { title: 'x' })).toBe('');
    expect(thumbUrlOf(FIELDS.moments.main, {})).toBe('');
    expect(thumbUrlOf(FIELDS.moments.main, null)).toBe('');
    expect(thumbUrlOf(undefined, { a: 1 })).toBe('');
  });
});

describe('blankTr / newMainForm', () => {
  it('blankTr：每种语言 × 每个可翻译字段都置空串', () => {
    const tr = blankTr(LANGS, FIELDS.blogs.tr);
    expect(Object.keys(tr).sort()).toEqual([...CODES].sort());
    for (const c of CODES) expect(tr[c]).toEqual({ title: '', summary: '', content: '' });
  });
  it('blankTr：tr 为空（简历）→ 只有语言键、无字段', () => {
    const tr = blankTr(LANGS, FIELDS.resume.tr);
    for (const c of CODES) expect(tr[c]).toEqual({});
  });
  it('newMainForm：select 取第一个选项，其余置空', () => {
    const main = newMainForm(FIELDS.blogs.main);
    expect(main.status).toBe('draft');        /* options[0][0] */
    expect(main.cover_path).toBe('');
    expect(main.pinned).toBe('');
    expect(main.sort_order).toBe('');
  });
  it('newMainForm：日志的 kind 取第一个选项（update）', () => {
    expect(newMainForm(FIELDS.logs.main).kind).toBe('update');
  });
});

describe('mainFormFrom —— 日期字段的分模块回填', () => {
  it('日志：从 updated_at 回填（不是 created_at）', () => {
    const row = { id: 1, updated_at: ts(2026, 3, 4), created_at: ts(2020, 1, 1) };
    const main = mainFormFrom(FIELDS.logs.main, row, FIELDS.logs.dateFrom);
    expect(main.date).toBe('2026-03-04');
  });
  it('博客：从 published_at 回填', () => {
    const row = { id: 1, published_at: ts(2026, 5, 6) };
    const main = mainFormFrom(FIELDS.blogs.main, row, FIELDS.blogs.dateFrom);
    expect(main.date).toBe('2026-05-06');
  });
  it('动态：dateFrom=created_at，从 created_at 回填', () => {
    const row = { id: 1, created_at: ts(2026, 7, 8) };
    const main = mainFormFrom(FIELDS.moments.main, row, FIELDS.moments.dateFrom);
    expect(main.date).toBe('2026-07-08');
  });
  it('库里已有 date 值 → 原样保留，不被时间戳覆盖', () => {
    const row = { id: 1, date: '2026-02-02', updated_at: ts(2026, 3, 4) };
    const main = mainFormFrom(FIELDS.logs.main, row, FIELDS.logs.dateFrom);
    expect(main.date).toBe('2026-02-02');
  });
  it('没有可用的时间戳 → 日期留空（不抛异常）', () => {
    const main = mainFormFrom(FIELDS.logs.main, { id: 1 }, FIELDS.logs.dateFrom);
    expect(main.date).toBe('');
  });
  it('dateFrom 缺失时退化为 created_at', () => {
    const row = { id: 1, created_at: ts(2026, 9, 9), updated_at: ts(2026, 1, 1) };
    expect(mainFormFrom(FIELDS.logs.main, row, undefined).date).toBe('2026-09-09');
  });
  it('switch 字段：NULL 视为开（true），0/1 转布尔', () => {
    expect(mainFormFrom(FIELDS.projects.main, { visible: null }).visible).toBe(true);
    expect(mainFormFrom(FIELDS.projects.main, { visible: 0 }).visible).toBe(false);
    expect(mainFormFrom(FIELDS.projects.main, { visible: 1 }).visible).toBe(true);
  });
  it('number 字段：NULL → 0，字符串数字 → Number', () => {
    expect(mainFormFrom(FIELDS.projects.main, {}).sort_order).toBe(0);
    expect(mainFormFrom(FIELDS.projects.main, { sort_order: '12' }).sort_order).toBe(12);
  });
  it('csv 字段：JSON 数组 → 逗号文本', () => {
    const row = { tech_stack: JSON.stringify(['Vue', 'Vite']) };
    expect(mainFormFrom(FIELDS.projects.main, row).tech_stack).toBe('Vue, Vite');
  });
  it('csv 字段：历史纯文本（非 JSON）原样回显（不显示空白）', () => {
    const row = { tech_stack: 'Excel,机器学习' };
    expect(mainFormFrom(FIELDS.projects.main, row).tech_stack).toBe('Excel,机器学习');
  });
});

describe('trFormFrom', () => {
  it('以空表为底，只覆盖接口返回了的语言', () => {
    const src = { 'zh-CN': { title: '标题' }, en: { title: 'Title' } };
    const tr = trFormFrom(FIELDS.blogs.tr, src, LANGS);
    expect(tr['zh-CN'].title).toBe('标题');
    expect(tr.en.title).toBe('Title');
    expect(tr['zh-TW']).toEqual({ title: '', summary: '', content: '' });
    expect(tr.ja).toEqual({ title: '', summary: '', content: '' });
  });
  it('接口返回了未知语言 → 忽略（不新增键）', () => {
    const tr = trFormFrom(FIELDS.blogs.tr, { ko: { title: 'x' } }, LANGS);
    expect(tr.ko).toBeUndefined();
    expect(Object.keys(tr).sort()).toEqual([...CODES].sort());
  });
  it('源为 undefined → 全空表', () => {
    const tr = trFormFrom(FIELDS.blogs.tr, undefined, LANGS);
    for (const c of CODES) expect(tr[c]).toEqual({ title: '', summary: '', content: '' });
  });
  it('csv 字段在翻译表里同样被还原成逗号文本', () => {
    const src = { 'zh-CN': { skills: JSON.stringify(['a', 'b']) } };
    const tr = trFormFrom(FIELDS.about.tr, src, LANGS);
    expect(tr['zh-CN'].skills).toBe('a, b');
  });
});

describe('assetRefsOfRow —— 删记录时该清哪些 Storage 文件', () => {
  it('单值 image / file 字段各算一个', () => {
    const row = {
      cover_path: 'blog-assets/blog/1/c.webp',
      attach_path: 'blog-assets/blog/1/d.pdf',
    };
    expect(assetRefsOfRow(FIELDS.blogs.main, row)).toEqual([
      { bucket: 'blog-assets', path: 'blog/1/c.webp' },
      { bucket: 'blog-assets', path: 'blog/1/d.pdf' },
    ]);
  });
  it('images 数组展开成多项', () => {
    const row = { images: JSON.stringify(['moments/mm/1/a.jpg', 'moments/mm/1/b.jpg']) };
    expect(assetRefsOfRow(FIELDS.moments.main, row)).toEqual([
      { bucket: 'moments', path: 'mm/1/a.jpg' },
      { bucket: 'moments', path: 'mm/1/b.jpg' },
    ]);
  });
  it('images 非法 JSON → 不产生引用（不误删）', () => {
    expect(assetRefsOfRow(FIELDS.moments.main, { images: '{bad' })).toEqual([]);
    expect(assetRefsOfRow(FIELDS.moments.main, { images: '{"a":1}' })).toEqual([]);
  });
  it('旧格式裸路径 → 用字段桶兜底', () => {
    expect(assetRefsOfRow(FIELDS.photos.main, { storage_path: 'old.jpg' })).toEqual([
      { bucket: 'photos', path: 'old.jpg' },
    ]);
  });
  it('空行 / 空值字段不产生引用', () => {
    expect(assetRefsOfRow(FIELDS.blogs.main, null)).toEqual([]);
    expect(assetRefsOfRow(FIELDS.blogs.main, {})).toEqual([]);
    expect(assetRefsOfRow(FIELDS.blogs.main, { cover_path: '' })).toEqual([]);
    expect(assetRefsOfRow(undefined, { cover_path: 'x/y.webp' })).toEqual([]);
  });
  it('非文件类字段（text/number/switch/select）被忽略', () => {
    const row = { status: 'draft', tags: 'a,b', pinned: 1, sort_order: 3, slug: 's' };
    expect(assetRefsOfRow(FIELDS.blogs.main, row)).toEqual([]);
  });
});

describe('replacedAssetRefs —— 换文件时该删的旧文件', () => {
  const fields = FIELDS.blogs.main;
  it('换了封面 → 返回旧引用', () => {
    const orig = { cover_path: 'blog-assets/blog/1/old.webp' };
    const payload = { cover_path: 'blog-assets/blog/1/new.webp' };
    expect(replacedAssetRefs(fields, orig, payload)).toEqual([
      { bucket: 'blog-assets', path: 'blog/1/old.webp' },
    ]);
  });
  it('值没变 → 不删', () => {
    const v = 'blog-assets/blog/1/same.webp';
    expect(replacedAssetRefs(fields, { cover_path: v }, { cover_path: v })).toEqual([]);
  });
  it('改成空 → 不删（保守，宁可留孤儿也不误删）', () => {
    expect(replacedAssetRefs(fields, { cover_path: 'a/b.webp' }, { cover_path: '' })).toEqual([]);
  });
  it('原本为空 → 不删', () => {
    expect(replacedAssetRefs(fields, { cover_path: '' }, { cover_path: 'a/b.webp' })).toEqual([]);
  });
  it('images 多图字段不在此处处理（交给各自的编辑器）', () => {
    const orig = { images: JSON.stringify(['moments/mm/1/a.jpg']) };
    const payload = { images: JSON.stringify(['moments/mm/1/b.jpg']) };
    expect(replacedAssetRefs(FIELDS.moments.main, orig, payload)).toEqual([]);
  });
  it('orig 为空 → 返回空数组', () => {
    expect(replacedAssetRefs(fields, null, { cover_path: 'a/b.webp' })).toEqual([]);
    expect(replacedAssetRefs(undefined, {}, {})).toEqual([]);
  });
  it('旧格式裸路径 → 用字段桶兜底', () => {
    const orig = { cover_path: 'old-cover.webp' };
    const payload = { cover_path: 'blog-assets/blog/1/new.webp' };
    expect(replacedAssetRefs(fields, orig, payload)).toEqual([
      { bucket: 'blog-assets', path: 'old-cover.webp' },
    ]);
  });
});
