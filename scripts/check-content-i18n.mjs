/* 一次性验证：对 worker/content.js 做真实 SQL 跑测。
   做法：
   ① 用 node:sqlite 建内存库并执行真实迁移文件（验证建表 + 种子）；
   ② 把 DatabaseSync 包成 D1 风格的 prepare().bind().all()/run()/first()；
   ③ 把 content.js 的 `import { json, verifySession } from './auth.js'` 换成桩，
      这样能测到**写路径**（否则写接口会被 401 挡住，测不到 SQL）。
   运行：node --experimental-sqlite scripts/check-content-i18n.mjs
   （需要 Node 22+；node:sqlite 仍是实验特性，故要带 --experimental-sqlite）
*/
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* 所有文件路径都以**项目根目录**为基准 —— 这样从任意 cwd 调用都不会找不到文件 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (rel) => path.join(ROOT, rel);

/* ---------- ① 内存库 + 真实迁移 ----------
   顺序刻意还原真实场景：
     a) schema.sql + 前两个迁移（建 users 与 editor 四表）
     b) 灌「迁移前就存在的旧数据」
     c) 其余迁移按文件名顺序跑 —— 003 会把旧数据灌成 zh-CN 翻译行，正是要测的行为
   这样既覆盖「全新库按序初始化」，又保留了对种子数据回填的断言。 */
const db = new DatabaseSync(':memory:');
const migDir = P('migrations');

function runSqlFile(file) {
  const clean = fs.readFileSync(path.join(migDir, file), 'utf8')
    .split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
  for (const s of clean.split(';').map((x) => x.trim()).filter(Boolean)) {
    try { db.exec(s + ';'); }
    catch (e) {
      /* 重复列 / 重复表属于「幂等可忽略」，其余一律抛出去（别把真错误吞掉） */
      if (!/duplicate column|already exists/i.test(e.message)) {
        console.error('❌ 迁移 ' + file + ' 失败: ' + e.message);
        throw e;
      }
    }
  }
}

const BASE = ['schema.sql', 'migration-001-add-editor-tables.sql', 'migration-002-add-log-kind.sql'];
for (const f of BASE) runSqlFile(f);

db.exec(`
INSERT INTO ebook_chapters (title, content, updated_at) VALUES ('旧日志标题','旧日志正文',1700000000000);
INSERT INTO moments (content, location, created_at) VALUES ('旧动态内容','杭州',1700000001000);
INSERT INTO photos (title, description, storage_path, created_at) VALUES ('旧照片','旧描述','p1.webp',1700000002000);
INSERT INTO resume (id, storage_path, version, updated_at) VALUES (1,'cv/old.pdf','v0',1700000003000);
`);

const migFiles = fs.readdirSync(migDir)
  .filter((f) => /^migration-.*\.sql$/.test(f)).sort()
  .filter((f) => BASE.indexOf(f) === -1);
for (const f of migFiles) runSqlFile(f);

/* ---------- ② D1 风格适配器 ---------- */
const DB = {
  prepare(sql) {
    const st = db.prepare(sql);
    let args = [];
    const api = {
      bind(...a) { args = a; return api; },
      async all() { return { results: st.all(...args) }; },
      async run() {
        const r = st.run(...args);
        return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
      },
      async first() { const r = st.get(...args); return r === undefined ? null : r; },
    };
    return api;
  },
};

/* ---------- ③ 生成带桩的 content.js ---------- */
const src = fs.readFileSync(P('worker/content.js'), 'utf8');
const stubbed = src.replace(
  /import \{ json, verifySession \} from '\.\/auth\.js';/,
  [
    "export function json(obj, status = 200) {",
    "  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });",
    "}",
    "export async function verifySession(req, env) { return env.__user || null; }",
  ].join('\n')
);
if (stubbed === src) { console.error('❌ 桩替换失败：content.js 的 import 行没匹配上'); process.exit(1); }
const tmp = path.join(ROOT, '.workbuddy-ai/tmp/content-stubbed.mjs');
fs.writeFileSync(tmp, stubbed);
const { handleContentApi, CONTENT_MODULES } = await import('file:///' + tmp.replace(/\\/g, '/'));

/* ---------- ④ 测试工具 ---------- */
function env(user) { return { DB, __user: user }; }
const OWNER = { id: 1, role: 'owner' };
async function call(url, opts = {}, user = null) {
  const req = new Request('https://x.dev' + url, opts);
  const res = await handleContentApi(req, env(user));
  if (!res) return { __null: true };
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}
const J = (o) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) });

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + JSON.stringify(extra) : '')); }
}

console.log('\n=== A. 关于我（about） ===');
let r = await call('/api/content/about?lang=en');
check('GET about（无翻译）返回 200', r.status === 200, r);
check('无翻译时 is_fallback = true', r.body.item && r.body.item.is_fallback === true, r.body.item);

r = await call('/api/admin/about', J({
  avatar_path: 'avatar.jpg',
  translations: {
    'zh-CN': { name: 'Zelm', headline: '全栈', content: '中文自我介绍', skills: '["Vue","Vite"]', experiences: '[]' },
    en: { name: 'Zelm', headline: 'Full-stack', content: 'English intro', skills: '["Vue","Vite"]', experiences: '[]' },
  },
}), OWNER);
check('站长写 about 成功', r.status === 200 && r.body.ok, r);

r = await call('/api/content/about?lang=en');
check('读 en 拿到英文正文', r.body.item.content === 'English intro', r.body.item);
check('读 en 时 is_fallback = false', r.body.item.is_fallback === false, r.body.item);
r = await call('/api/content/about?lang=ja');
check('读 ja 回退到 zh-CN', r.body.item.content === '中文自我介绍', r.body.item);
check('回退时 is_fallback = true', r.body.item.is_fallback === true, r.body.item);
check('langs 列出已有语言', JSON.stringify(r.body.item.langs.sort()) === '["en","zh-CN"]', r.body.item.langs);
r = await call('/api/content/about?lang=zh-TW');
check('zh-TW 也回退 zh-CN', r.body.item.content === '中文自我介绍', r.body.item);
r = await call('/api/admin/about', {}, null);
check('未登录写 about → 401', r.status === 401, r);

console.log('\n=== B. 博客（blogs：草稿不公开） ===');
r = await call('/api/admin/blogs', J({
  cover_path: 'c.webp', status: 'draft',
  translations: { 'zh-CN': { title: '草稿标题', summary: '摘要', content: '正文' } },
}), OWNER);
check('新建草稿成功', r.status === 200 && r.body.ok, r);
const draftId = r.body.id;
r = await call('/api/content/blogs?lang=zh-CN');
check('草稿不出现在公开列表', (r.body.items || []).length === 0, r.body.items);
r = await call('/api/admin/blogs/' + draftId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'published' }) }, OWNER);
check('发布成功', r.status === 200 && r.body.ok, r);
r = await call('/api/content/blogs?lang=zh-CN');
check('发布后公开可见', (r.body.items || []).length === 1, r.body.items);

r = await call('/api/admin/blogs', J({
  status: 'published', tags: ['Vue', 'Vite'],
  translations: {
    'zh-CN': { title: '博客一', summary: '中文摘要', content: '中文正文' },
    en: { title: 'Post One', summary: 'EN summary', content: 'EN body' },
  },
}), OWNER);
check('再建一篇已发布博客', r.status === 200 && r.body.ok, r);
r = await call('/api/content/blogs?lang=en');
const enItems = r.body.items || [];
check('en 列表优先英文', enItems.some((x) => x.title === 'Post One'), enItems.map((x) => x.title));
check('缺 en 的那篇标记 is_fallback', enItems.some((x) => x.is_fallback === true), enItems);

r = await call('/api/admin/blogs', {}, OWNER);
check('后台列表带完整 translations', r.body.items && Object.keys(r.body.items[0].translations || {}).length > 0, r.body.items && r.body.items[0]);
r = await call('/api/admin/blogs', {}, null);
check('未登录读后台列表 → 401（草稿不能泄露）', r.status === 401, r);
r = await call('/api/admin/blogs/' + draftId, { method: 'DELETE' }, OWNER);
check('删除博客成功', r.status === 200 && r.body.ok, r);

console.log('\n=== C. 证书 / 项目 ===');
r = await call('/api/admin/certificates', J({
  image_path: 'cert.png', issue_date: '2025-06-01',
  translations: { 'zh-CN': { name: '软考中级', issuer: '工信部', description: '中文描述' } },
}), OWNER);
check('新建证书成功', r.status === 200 && r.body.ok, r);
r = await call('/api/content/certificates?lang=en');
check('证书缺 en → 回退中文', (r.body.items[0] || {}).name === '软考中级', r.body.items);
check('issue_date 与语言无关，保留', (r.body.items[0] || {}).issue_date === '2025-06-01', r.body.items);

r = await call('/api/admin/projects', J({
  slug: 'zelm', link: 'https://github.com/Zelm05/zelm-lab', tech_stack: '["Vue3","Vite"]',
  translations: { 'zh-CN': { title: 'Zelm 实验室', summary: '中文摘要', detail: '中文详情' }, en: { title: 'Zelm Lab', summary: 'EN summary', detail: 'EN detail' } },
}), OWNER);
check('新建项目成功', r.status === 200 && r.body.ok, r);
r = await call('/api/content/projects?lang=en');
check('项目读 en', (r.body.items[0] || {}).title === 'Zelm Lab', r.body.items);
check('项目 tech_stack 保留', (r.body.items[0] || {}).tech_stack === '["Vue3","Vite"]', r.body.items);

console.log('\n=== D. 日志 / 动态（旧数据 + 兼容回写） ===');
r = await call('/api/content/logs?lang=zh-CN');
check('种子日志能读到', (r.body.items || []).length === 1 && r.body.items[0].title === '旧日志标题', r.body.items);
r = await call('/api/content/logs?lang=en');
check('日志缺 en → 回退中文', r.body.items[0].content === '旧日志正文', r.body.items[0]);
check('日志回退标记正确', r.body.items[0].is_fallback === true, r.body.items[0]);

const logId = r.body.items[0].id;
r = await call('/api/admin/logs/' + logId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ translations: { 'zh-CN': { title: '改过的标题', content: '改过的正文' } } }) }, OWNER);
check('改日志 zh-CN 成功', r.status === 200 && r.body.ok, r);
const legacy = db.prepare('SELECT title, content FROM ebook_chapters WHERE id = ?').get(logId);
check('兼容：旧列被同步回写', legacy.title === '改过的标题' && legacy.content === '改过的正文', legacy);

r = await call('/api/content/moments?lang=zh-CN');
check('种子动态能读到', (r.body.items[0] || {}).content === '旧动态内容', r.body.items);
r = await call('/api/content/moments?lang=ja');
check('动态缺 ja → 回退中文', r.body.items[0].content === '旧动态内容', r.body.items[0]);

console.log('\n=== E. 语言归一与边界 ===');
for (const [q, want] of [['zh', 'zh-CN'], ['zh-Hans-CN', 'zh-CN'], ['zh-TW', 'zh-TW'], ['zh-Hant-HK', 'zh-TW'], ['en-US', 'en'], ['ja', 'ja'], ['jp', 'ja'], ['fr', 'zh-CN']]) {
  const rr = await call('/api/content/about?lang=' + q);
  check('lang=' + q + ' → ' + want, rr.body.lang === want, rr.body.lang);
}
const alReq = new Request('https://x.dev/api/content/about', { headers: { 'Accept-Language': 'ja,en;q=0.8' } });
const alRes = await handleContentApi(alReq, env(null));
const alBody = await alRes.json();
check('Accept-Language: ja 生效', alBody.lang === 'ja', alBody.lang);
r = await call('/api/content/unknown');
check('未知模块不被接管（返回 null，交给静态资源）', r.__null === true, r);
r = await call('/api/admin/users', {}, OWNER);
check('/api/admin/users 不被内容模块抢走', r.__null === true, r);

console.log('\n=== F. 单行表（resume）：与语言无关，不需要 translations ===');
r = await call('/api/content/resume?lang=zh-CN');
check('resume 读接口 200', r.status === 200, r);
check('resume 读到预置的那条（单行表 id=1）',
  r.body.item && r.body.item.storage_path === 'cv/old.pdf', r.body.item);

r = await call('/api/admin/resume', J({ storage_path: 'cv/resume.pdf', version: 'v1.0' }), OWNER);
check('写 resume 成功（不传 translations）', r.status === 200 && r.body.ok, r);
r = await call('/api/content/resume?lang=en');
check('任何语言都返回同一条（与语言无关）', r.body.item && r.body.item.storage_path === 'cv/resume.pdf', r.body.item);
check('resume 不标 is_fallback', r.body.item.is_fallback === false, r.body.item);

r = await call('/api/admin/resume', J({ version: 'v1.1' }), OWNER);
check('resume 部分更新成功', r.status === 200 && r.body.ok, r);
r = await call('/api/content/resume?lang=zh-CN');
check('部分更新未清空 storage_path', r.body.item.storage_path === 'cv/resume.pdf', r.body.item);
check('版本号已更新', r.body.item.version === 'v1.1', r.body.item);
r = await call('/api/admin/resume', {}, null);
check('未登录读后台 resume → 401', r.status === 401, r);

console.log('\n=== G. 旧 CRUD 已下线（统一到 /api/content + /api/admin 一条路） ===');
const editorSrc = fs.readFileSync(P('worker/editor.js'), 'utf8');
const editorStub = editorSrc.replace(
  /import \{ verifySession, json \} from '\.\/auth\.js';/,
  [
    "export function json(obj, status = 200) {",
    "  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });",
    "}",
    "export async function verifySession(req, env) { return env.__user || null; }",
  ].join('\n')
);
if (editorStub === editorSrc) { console.error('❌ editor.js 的 import 行没匹配上，桩替换失败'); process.exit(1); }
const editorTmp = path.join(ROOT, '.workbuddy-ai/tmp/editor-stubbed.mjs');
fs.writeFileSync(editorTmp, editorStub);
const { handleEditorApi } = await import('file:///' + editorTmp.replace(/\\/g, '/'));

for (const legacy of ['/api/ebook', '/api/photos', '/api/moments', '/api/resume']) {
  const res = await handleEditorApi(new Request('https://x.dev' + legacy), env(OWNER));
  check('旧接口 ' + legacy + ' 已不再被 editor 模块接管', res === null, res && res.status);
}
const up = await handleEditorApi(
  new Request('https://x.dev/api/editor/sign-upload', { method: 'POST', body: '{}' }),
  env(OWNER)
);
check('文件通道 /api/editor/sign-upload 仍在线', up !== null, up);
fs.unlinkSync(editorTmp);

console.log('\n=== I. 可见性 / 置顶 / 排序 往返 ===');
r = await call('/api/admin/logs', J({
  kind: 'personal', visible: 0, pinned: 1,
  translations: { 'zh-CN': { title: '隐藏且置顶', content: '正文' } },
}), OWNER);
check('建日志（visible=0, pinned=1）', r.status === 200 && r.body.ok, r);
const hiddenId = r.body.id;

r = await call('/api/content/logs?lang=zh-CN');
check('visible=0 不出现在公开列表', !(r.body.items || []).some((x) => x.id === hiddenId), (r.body.items || []).map((x) => x.id));

r = await call('/api/admin/logs', {}, OWNER);
const hiddenRow = (r.body.items || []).filter((x) => x.id === hiddenId)[0];
check('后台仍能看到隐藏项', !!hiddenRow, null);
check('visible 落库为 0', hiddenRow && Number(hiddenRow.visible) === 0, hiddenRow && hiddenRow.visible);
check('pinned 落库为 1', hiddenRow && Number(hiddenRow.pinned) === 1, hiddenRow && hiddenRow.pinned);
const legacyRow = db.prepare('SELECT title, content FROM ebook_chapters WHERE id = ?').get(hiddenId);
check('旧列被回填为真实文本（不是 INSERT 时的空串占位）',
  legacyRow && legacyRow.title === '隐藏且置顶' && legacyRow.content === '正文', legacyRow);

r = await call('/api/admin/projects', J({
  slug: 'sort-test', visible: 1, sort_order: 5,
  translations: { 'zh-CN': { title: 'P', summary: 's', detail: 'd' } },
}), OWNER);
check('建项目（sort_order=5）', r.status === 200 && r.body.ok, r);
r = await call('/api/admin/projects', {}, OWNER);
const sorted = (r.body.items || []).filter((x) => x.slug === 'sort-test')[0];
check('sort_order 落库为 5', sorted && Number(sorted.sort_order) === 5, sorted && sorted.sort_order);

r = await call('/api/admin/blogs', J({
  status: 'published', pinned: 1,
  translations: { 'zh-CN': { title: '置顶博客', summary: '', content: '' } },
}), OWNER);
check('建置顶博客', r.status === 200 && r.body.ok, r);
r = await call('/api/content/blogs?lang=zh-CN');
check('置顶博客排在公开列表第一条', ((r.body.items || [])[0] || {}).title === '置顶博客', (r.body.items || []).map((x) => x.title));

console.log('\n=== J. 社交链接（about 的子集合） ===');
r = await call('/api/content/about?lang=zh-CN');
check('about 内嵌 links 字段', Array.isArray(r.body.item.links), r.body.item && typeof r.body.item.links);

r = await call('/api/admin/social-links', J({
  platform: 'github', url: 'https://github.com/x', icon: '🐙', visible: 1, sort_order: 10,
  translations: { 'zh-CN': { label: 'GitHub' }, en: { label: 'GitHub' } },
}), OWNER);
check('新建社交链接', r.status === 200 && r.body.ok, r);
const linkId = r.body.id;

r = await call('/api/admin/social-links', J({
  platform: 'hide-me', url: 'https://hidden.example', visible: 0, sort_order: 20,
  translations: { 'zh-CN': { label: '隐藏项' } },
}), OWNER);
check('新建隐藏社交链接', r.status === 200 && r.body.ok, r);
const hiddenLinkId = r.body.id;

r = await call('/api/content/about?lang=zh-CN');
const links = r.body.item.links || [];
check('公开读只返回 visible=1 的链接', links.some((x) => x.id === linkId) && !links.some((x) => x.id === hiddenLinkId), links.map((x) => x.platform));
check('链接按 sort_order 排序', links.length >= 2 && Number(links[0].sort_order) <= Number(links[1].sort_order), links.map((x) => x.sort_order));
check('链接的 label 走翻译表（zh-CN）', (links.filter((x) => x.id === linkId)[0] || {}).label === 'GitHub', links);

r = await call('/api/content/about?lang=en');
check('链接 label 也能读英文', (r.body.item.links || []).some((x) => x.label === 'GitHub'), r.body.item.links);

r = await call('/api/admin/social-links/' + linkId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort_order: 5 }) }, OWNER);
check('改社交链接排序', r.status === 200 && r.body.ok, r);
r = await call('/api/admin/social-links/' + hiddenLinkId, { method: 'DELETE' }, OWNER);
check('删社交链接', r.status === 200 && r.body.ok, r);
r = await call('/api/admin/social-links', {}, null);
check('未登录读后台社交链接 → 401', r.status === 401, r);

/* 种子数据必须与静态兜底 src/data/contacts.js **逐字一致** ——
   两者不一致就等于「DB 优先」生效后换了一组链接。
   这条断言是因为踩过坑才加的：019 首次发布时 4/5 的 URL 是凭印象写的占位值，
   直到线上跑完迁移核对才发现。 */
console.log('\n=== J2. 社交链接种子 vs 静态兜底（防漂移） ===');
const { ABOUT_CONTACTS } = await import('file:///' + P('src/data/contacts.js').replace(/\\/g, '/'));
const PLATFORMS = ['qq', 'email', 'github', 'discord', 'douyin'];
check('静态兜底恰好 5 条', ABOUT_CONTACTS.length === 5, ABOUT_CONTACTS.length);
PLATFORMS.forEach((plat, i) => {
  const row = db.prepare('SELECT id, url FROM about_social_links WHERE platform = ?').get(plat);
  const want = ABOUT_CONTACTS[i];
  check('种子 ' + plat + ' 的 URL 与 contacts.js 一致',
    row && row.url === want.url, { db: row && row.url, static: want.url });
  if (row) {
    const tr = db.prepare("SELECT label FROM about_social_link_translations WHERE link_id = ? AND lang = 'zh-CN'").get(row.id);
    check('种子 ' + plat + ' 有 zh-CN label（不能空，否则前台显示平台标识）',
      !!(tr && tr.label), tr);
  }
});

console.log('\n=== K. 项目图集（projects 的子集合） ===');
r = await call('/api/admin/projects', J({
  slug: 'gallery', visible: 1, sort_order: 1,
  translations: { 'zh-CN': { title: '有图集的项目', summary: 's', detail: 'd' } },
}), OWNER);
const projId = r.body.id;
check('建项目（准备挂图）', r.status === 200 && r.body.ok, r);

for (const p of ['photos/proj/1/a.webp', 'photos/proj/1/b.webp']) {
  r = await call('/api/admin/project-images', J({ project_id: projId, image_path: p, sort_order: 10 }), OWNER);
  check('上传图片记录 ' + p, r.status === 200 && r.body.ok, r);
}
r = await call('/api/content/projects?lang=zh-CN');
const g = (r.body.items || []).filter((x) => x.slug === 'gallery')[0];
check('公开读 projects 内嵌 images', Array.isArray(g.images) && g.images.length === 2, g && g.images);

r = await call('/api/admin/project-images', {}, OWNER);
const imgs = (r.body.items || []).filter((x) => String(x.project_id) === String(projId));
check('后台能列出该项目的图', imgs.length === 2, imgs.length);
r = await call('/api/admin/project-images/' + imgs[0].id, { method: 'DELETE' }, OWNER);
check('删除单张图', r.status === 200 && r.body.ok, r);
r = await call('/api/content/projects?lang=zh-CN');
check('删后图集只剩 1 张', ((r.body.items || []).filter((x) => x.slug === 'gallery')[0] || {}).images.length === 1, null);

console.log('\n=== L. 机器翻译接口 ===');
/* 用桩替换 auth 导入，才能测到鉴权之后的分支 */
const trSrc = fs.readFileSync(P('worker/translate.js'), 'utf8');
const trStub = trSrc.replace(
  /import \{ json, verifySession \} from '\.\/auth\.js';/,
  [
    "export function json(obj, status = 200) {",
    "  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });",
    "}",
    "export async function verifySession(req, env) { return env.__user || null; }",
  ].join('\n')
);
if (trStub === trSrc) { console.error('❌ translate.js 的 import 行没匹配上'); process.exit(1); }
const trTmp = path.join(ROOT, '.workbuddy-ai/tmp/translate-stubbed.mjs');
fs.writeFileSync(trTmp, trStub);
const { handleTranslateApi } = await import('file:///' + trTmp.replace(/\\/g, '/'));

async function callTr(body, envObj) {
  const req = new Request('https://x.dev/api/admin/translate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const res = await handleTranslateApi(req, envObj);
  if (!res) return { __null: true };
  return { status: res.status, body: await res.json() };
}

r = await callTr({ texts: { title: '标题' }, sourceLang: 'zh-CN', targetLang: 'en' }, { __user: null });
check('未登录 → 401', r.status === 401, r);
r = await callTr({ texts: { title: '标题' }, sourceLang: 'zh-CN', targetLang: 'en' }, { __user: OWNER });
check('没配密钥 → 501 且带 hint', r.status === 501 && !!r.body.hint, r);
r = await callTr({ texts: { title: '标题' }, sourceLang: 'zh-CN', targetLang: '' }, { __user: OWNER, DEEPL_API_KEY: 'k' });
check('缺 targetLang → 400', r.status === 400, r);
r = await callTr({ texts: { title: '标题' }, sourceLang: 'en', targetLang: 'en' }, { __user: OWNER, DEEPL_API_KEY: 'k' });
check('源=目标 → 400', r.status === 400, r);
r = await callTr({ texts: { title: '' } }, { __user: OWNER, DEEPL_API_KEY: 'k' });
check('全空内容 → 400', r.status === 400, r);
r = await callTr({ texts: { c: 'x'.repeat(6000) }, sourceLang: 'zh-CN', targetLang: 'en' }, { __user: OWNER, DEEPL_API_KEY: 'k' });
check('超字符上限 → 413', r.status === 413, r);

/* 用假 fetch 模拟 DeepL 成功响应（不真的出网） */
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (String(url).indexOf('deepl') === -1) throw new Error('不该请求 ' + url);
  return new Response(JSON.stringify({ translations: [{ text: 'Title' }, { text: 'Body' }] }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
r = await callTr({
  texts: { title: '标题', content: '正文' }, sourceLang: 'zh-CN', targetLang: 'en',
}, { __user: OWNER, DEEPL_API_KEY: 'k' });
check('批量翻译成功（假 fetch）', r.status === 200 && r.body.ok, r);
check('返回按字段名对应', r.body.translations.title === 'Title' && r.body.translations.content === 'Body', r.body.translations);
check('回传供应商名', r.body.provider === 'deepl', r.body.provider);

/* 空字段不送翻译，但要保持下标对应（否则会把结果错位填到别的字段） */
r = await callTr({
  texts: { a: '', b: '正文' }, sourceLang: 'zh-CN', targetLang: 'en',
}, { __user: OWNER, DEEPL_API_KEY: 'k' });
check('空字段不翻译但不错位', r.body.translations.a === '' && r.body.translations.b === 'Title', r.body.translations);

/* 供应商报错 → 友好提示 */
globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Quota exceeded' }), { status: 456 });
r = await callTr({ texts: { title: '标题' }, sourceLang: 'zh-CN', targetLang: 'en' }, { __user: OWNER, DEEPL_API_KEY: 'k' });
check('配额不足 → 429 + 人话提示', r.status === 429 && /配额|限流/.test(r.body.error), r);
globalThis.fetch = realFetch;

/* ---- Cloudflare Workers AI（零密钥路径）：用假的 env.AI.run 模拟 ---- */
const fakeAI = (payload) => ({ AI: { run: async (model, opts) => { fakeAI.lastModel = model; fakeAI.lastOpts = opts; return payload; } } });

r = await callTr({ texts: { title: '标题', content: '正文' }, sourceLang: 'zh-CN', targetLang: 'en' },
  Object.assign({ __user: OWNER }, fakeAI({ response: '["Title","Body"]' })));
check('Workers AI 批量翻译成功', r.status === 200 && r.body.ok && r.body.provider === 'cloudflare', r);
check('译文按字段名对应', r.body.translations.title === 'Title' && r.body.translations.content === 'Body', r.body.translations);
check('默认走 llama-3.2-3b-instruct', fakeAI.lastModel === '@cf/meta/llama-3.2-3b-instruct', fakeAI.lastModel);
check('提示词里带上了源/目标语言全称',
  /Simplified Chinese/.test(fakeAI.lastOpts.messages[0].content) && /English/.test(fakeAI.lastOpts.messages[0].content), null);

r = await callTr({ texts: { title: '标题' }, sourceLang: 'zh-CN', targetLang: 'zh-TW' },
  Object.assign({ __user: OWNER }, fakeAI({ response: '["標題"]' })));
check('简→繁 也能翻（m2m100 做不到这点）', r.status === 200 && r.body.translations.title === '標題', r);

r = await callTr({ texts: { title: '标题' }, sourceLang: 'zh-CN', targetLang: 'en' },
  Object.assign({ __user: OWNER, CF_TRANSLATE_MODEL: '@cf/meta/m2m100-1.2b' }, fakeAI({ response: '["T"]' })));
check('CF_TRANSLATE_MODEL 可覆盖模型', fakeAI.lastModel === '@cf/meta/m2m100-1.2b', fakeAI.lastModel);

r = await callTr({ texts: { title: '标题' }, sourceLang: 'zh-CN', targetLang: 'en' },
  Object.assign({ __user: OWNER }, fakeAI({ response: '抱歉，我无法翻译' })));
check('模型返回非 JSON → 502 友好提示', r.status === 502 && /JSON/.test(r.body.error), r);

r = await callTr({ texts: { a: '一', b: '二' }, sourceLang: 'zh-CN', targetLang: 'en' },
  Object.assign({ __user: OWNER }, fakeAI({ response: '["only one"]' })));
check('条数对不上 → 报错而不是错位填充', r.status === 502 && /条数/.test(r.body.error), r);

/* 供应商优先级（2026-09-27 改）：
   Workers AI > 第三方密钥；显式 TRANSLATE_PROVIDER 优先于一切。
   ⚠️ 这一组要**同时**把 fetch 也打桩 —— 否则走 DeepL 分支时会真的出网请求。 */
const fakeDeepL = async () => new Response(
  JSON.stringify({ translations: [{ text: 'X' }] }),
  { status: 200, headers: { 'Content-Type': 'application/json' } }
);
globalThis.fetch = fakeDeepL;
r = await callTr({ texts: { title: '标题' }, sourceLang: 'zh-CN', targetLang: 'en' },
  Object.assign({ __user: OWNER, DEEPL_API_KEY: 'k' }, fakeAI({ response: '["x"]' })));
check('有 Workers AI 时优先用它（即使同时配了 DeepL 密钥）', r.body.provider === 'cloudflare', r.body.provider);

/* 没有 [ai] binding 时才回落到第三方密钥 */
r = await callTr({ texts: { title: '标题' }, sourceLang: 'zh-CN', targetLang: 'en' },
  { __user: OWNER, DEEPL_API_KEY: 'k' });
check('无 AI binding 时回落到 DeepL', r.body.provider === 'deepl', r.body.provider);

globalThis.fetch = realFetch;

/* Workers AI 自身出错：超时/中断 → 504（env.AI.run 无超时参数，由 withTimeout 兜底，
   抛出的错误含 abort 字样才会被映射成 504） */
r = await callTr({ texts: { title: '标题' }, sourceLang: 'zh-CN', targetLang: 'en' },
  Object.assign({ __user: OWNER }, { AI: { run: async () => { throw new Error('The operation was aborted'); } } }));
check('Workers AI 超时/中断 → 504', r.status === 504 && /超时|稍后/.test(r.body.error), r);

/* 既无 [ai] binding 又无任何密钥 → 501（零配置时的明确指引） */
r = await callTr({ texts: { title: '标题' }, sourceLang: 'zh-CN', targetLang: 'en' }, { __user: OWNER });
check('无 AI 且无密钥 → 501 + hint', r.status === 501 && typeof r.body.hint === 'string', r);

r = await callTr({ texts: { title: '标题' }, sourceLang: 'zh-CN', targetLang: 'en' },
  Object.assign({ __user: OWNER, TRANSLATE_PROVIDER: 'cloudflare', DEEPL_API_KEY: 'k' }, fakeAI({ response: '["x"]' })));
check('显式 TRANSLATE_PROVIDER 覆盖自动选择', r.body.provider === 'cloudflare', r.body.provider);

fs.unlinkSync(trTmp);

console.log('\n=== M. 静态守卫：渲染「库里的路径」必须走 resolveAssetUrl ===');
/* 后台现在存的是**桶前缀引用**（`photos/wall/1/x.webp`）。
   若前端仍用 `publicUrl('photos', path)` 直接拼，会拼成 `photos/photos/wall/...` → 必然 404。
   这个坑真踩过：博客附件 / 证书图片 / 证书 PDF / 简历 / 照片墙 / 动态 共 7 处漏改。
   —— 所以这里做**静态扫描**：src 里除了 core/supabase.js 自己，不该再出现 publicUrl()。 */
function walkSrc(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkSrc(p, out);
    else if (/\.(vue|js)$/.test(e.name)) out.push(p);
  }
  return out;
}
const offenders = [];
for (const f of walkSrc(P('src'))) {
  if (f.endsWith(path.join('core', 'supabase.js'))) continue;
  fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((l, i) => {
    if (/publicUrl\s*\(/.test(l)) offenders.push(path.relative(ROOT, f).replace(/\\/g, '/') + ':' + (i + 1));
  });
}
check('src 里没有裸 publicUrl 调用（应一律走 resolveAssetUrl）', offenders.length === 0, offenders);

/* 有 date 字段的模块必须声明 dateFrom —— 否则编辑页的日期永远空白
   （踩过：日志的发布时间在 updated_at，代码却只看 created_at） */
const { MODULES: CFG_MODULES, FIELDS: CFG_FIELDS } = await import('file:///' + P('src/components/admin/content-fields.js').replace(/\\/g, '/'));
const noDateFrom = [];
for (const m of CFG_MODULES) {
  const f = CFG_FIELDS[m.key] || { main: [] };
  /* 只盯「合成日期字段」：key 恰好是 `date` 的那些 ——
     它们不是数据库列，值要从 dateFrom 指定的列回填。
     certificates 的 issue_date 本身就是列，不需要（也不该）配 dateFrom。 */
  const synthetic = (f.main || []).some((x) => x.type === 'date' && x.key === 'date');
  if (synthetic && !f.dateFrom) noDateFrom.push(m.key);
}
check('有合成 date 字段的模块都声明了 dateFrom', noDateFrom.length === 0, noDateFrom);

/* 前台「管理」按钮跳转的模块，必须在后台面板里**注册过** ——
   否则点进去是个空面板（真踩过：photos 没注册，照片墙完全没法管理）。 */
const registered = CFG_MODULES.map((m) => m.key);
const jumpTargets = new Set();
for (const rel of ['src/views/AboutView.vue', 'src/views/LogsView.vue', 'src/components/MomentsBoard.vue']) {
  const src = fs.readFileSync(P(rel), 'utf8');
  for (const mm of src.matchAll(/goManage\('([^']+)'\)/g)) jumpTargets.add(mm[1]);
}
const unregistered = [...jumpTargets].filter((x) => !registered.includes(x));
check('前台 goManage 的目标模块都已注册进后台面板', unregistered.length === 0, unregistered);
/* 反向也查一遍：注册了但没有对应 SPECS 的话，面板一打开就报错 */
const backendMods = CONTENT_MODULES;
const noBackend = registered.filter((x) => !backendMods.includes(x));
check('后台面板注册的模块后端都有对应实现', noBackend.length === 0, noBackend);

console.log('\n=== N. 发布时间语义（published_at） ===');
/* 之前 blogs.published_at **从来没被写过** → 前台博客永远不显示发布日期。
   现在：建时已发布就记下；草稿转发布时补；已有值绝不被覆盖。 */
r = await call('/api/admin/blogs', J({
  status: 'published', translations: { 'zh-CN': { title: '已发布博客', summary: '', content: '' } },
}), OWNER);
const pubId = r.body.id;
r = await call('/api/admin/blogs', {}, OWNER);
const pubRow = (r.body.items || []).filter((x) => x.id === pubId)[0];
check('建时已发布 → published_at 有值', !!(pubRow && pubRow.published_at), pubRow && pubRow.published_at);

r = await call('/api/admin/blogs', J({
  status: 'draft', translations: { 'zh-CN': { title: '草稿博客', summary: '', content: '' } },
}), OWNER);
const draftBlogId = r.body.id;
r = await call('/api/admin/blogs', {}, OWNER);
const draftRow = (r.body.items || []).filter((x) => x.id === draftBlogId)[0];
check('建时是草稿 → published_at 为空', draftRow && !draftRow.published_at, draftRow && draftRow.published_at);

/* 草稿转发布：不带 date → 自动补发布时间 */
await call('/api/admin/blogs/' + draftBlogId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'published' }) }, OWNER);
r = await call('/api/admin/blogs', {}, OWNER);
const afterPub = (r.body.items || []).filter((x) => x.id === draftBlogId)[0];
check('草稿转发布 → 自动补上发布时间', !!(afterPub && afterPub.published_at), afterPub && afterPub.published_at);

/* 再 PUT 一次（仍是已发布）：已有发布时间**不能被刷新** */
const firstPubAt = afterPub.published_at;
await call('/api/admin/blogs/' + draftBlogId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'published', sort_order: 3 }) }, OWNER);
r = await call('/api/admin/blogs', {}, OWNER);
const again = (r.body.items || []).filter((x) => x.id === draftBlogId)[0];
check('已有发布时间不被后续 PUT 覆盖', again && Number(again.published_at) === Number(firstPubAt), { before: firstPubAt, after: again && again.published_at });

/* 日志的 dateField 是 updated_at（NOT NULL）→ 不能被自动补逻辑改掉 */
r = await call('/api/admin/logs', J({
  kind: 'update', translations: { 'zh-CN': { title: '日期语义日志', content: 'x' } },
}), OWNER);
const logDateId = r.body.id;
r = await call('/api/admin/logs', {}, OWNER);
const logBefore = (r.body.items || []).filter((x) => x.id === logDateId)[0].updated_at;
await call('/api/admin/logs/' + logDateId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ translations: { 'zh-CN': { title: '改了标题', content: 'x' } } }) }, OWNER);
r = await call('/api/admin/logs', {}, OWNER);
const logAfter = (r.body.items || []).filter((x) => x.id === logDateId)[0].updated_at;
check('日志改内容不会刷新发布时间（updated_at 是发布日不是修改时间）',
  Number(logAfter) === Number(logBefore), { before: logBefore, after: logAfter });

console.log('\n=== O. 后台文案 key 必须存在于对应命名空间 ===');
/* 踩过的坑：日志分类下拉框的 cLogUpdate/cLogPersonal 在 **common** 包里，
   而模板用 admin 命名空间的 t() 去取 → 下拉框直接显示原始键名。
   这里把「配置里引用的每个 key」都对着真实的 zh 文案包核一遍。 */
const adminPack = (await import('file:///' + P('src/i18n/packs/admin.js').replace(/\\/g, '/'))).default.zh;
const commonPack = (await import('file:///' + P('src/i18n/packs/common.js').replace(/\\/g, '/'))).default.zh;
const NAMESPACES = { admin: adminPack, common: commonPack };

const missingKeys = [];
const checkKey = (key, ns, where) => {
  const pack = NAMESPACES[ns];
  if (!pack) { missingKeys.push(where + ' → 未知命名空间 ' + ns); return; }
  if (!(key in pack)) missingKeys.push(where + ' → ' + ns + '.' + key);
};

for (const m of CFG_MODULES) {
  checkKey(m.labelKey, 'admin', 'MODULES.' + m.key + '.labelKey');
  const f = CFG_FIELDS[m.key] || { main: [], tr: [] };
  for (const fld of [...(f.main || []), ...(f.tr || [])]) {
    if (fld.labelKey) checkKey(fld.labelKey, 'admin', m.key + '.' + fld.key + '.labelKey');
    for (const o of (fld.options || [])) checkKey(o[1], o[2] || 'admin', m.key + '.' + fld.key + '.options');
  }
}
check('后台配置里引用的 i18n key 全部存在', missingKeys.length === 0, missingKeys);

/* 组件里的**字面量** key 也一起核：约定是 `t` → admin、`tc` → common。
   缺 key 时 vue-i18n 会把键名原样渲染出来（用户看到 "cfTitle" 这种），很难自查。 */
const ADMIN_UI = fs.readdirSync(P('src/components/admin'))
  .filter((f) => f.endsWith('.vue')).map((f) => 'src/components/admin/' + f)
  .concat(['src/views/AdminView.vue']);
const missingLiteral = [];
for (const rel of ADMIN_UI) {
  const src = fs.readFileSync(P(rel), 'utf8');
  for (const mm of src.matchAll(/\b(tc|t)\('([A-Za-z0-9_]+)'\)/g)) {
    const ns = mm[1] === 'tc' ? 'common' : 'admin';
    if (!(mm[2] in NAMESPACES[ns])) missingLiteral.push(rel.split('/').pop() + ' → ' + ns + '.' + mm[2]);
  }
}
check('后台组件里的字面量 i18n key 全部存在', missingLiteral.length === 0, [...new Set(missingLiteral)]);

console.log('\n=== 结果 ===');
console.log('通过 ' + pass + ' / 失败 ' + fail);
fs.unlinkSync(tmp);
process.exit(fail ? 1 : 0);
