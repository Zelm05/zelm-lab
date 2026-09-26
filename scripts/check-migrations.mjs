/* ==========================================================================
 * check-migrations.mjs —— 全新库「按文件名顺序执行迁移」的冒烟测试
 *
 * 为什么需要：迁移链有**顺序依赖** —— `003-add-content-i18n` 要 ALTER 的
 *   ebook_chapters / moments / photos 是 `001-add-editor-tables` 建的。
 *   一旦有人加文件时没注意命名，全新环境就会在建库阶段失败，
 *   而**线上因为表早就在了，完全不会暴露** —— 这种问题最容易拖到下次换库才炸。
 *
 * 做法：node:sqlite 建内存库 → 按文件名顺序跑 schema.sql + 全部 migration-*.sql
 *      → 逐条报错。ALREADY EXISTS 类的重复定义视为「幂等可忽略」，其余一律算失败。
 *
 * 运行：node --experimental-sqlite scripts/check-migrations.mjs
 * ========================================================================== */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'migrations');

/* 幂等/可忽略的错误：重复列、重复索引、重复表 —— 这些在「重跑」时才出现 */
const IGNORABLE = /duplicate column name|already exists|no such table/i;

function statements(sql) {
  /* 先抹掉整行注释（保留换行），再按 ; 切 —— 直接切会把「带前导注释的语句」整条丢掉 */
  const clean = sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
  return clean.split(';').map((s) => s.trim()).filter(Boolean);
}

const files = ['schema.sql', ...fs.readdirSync(DIR).filter((f) => /^migration-.*\.sql$/.test(f)).sort()];

const db = new DatabaseSync(':memory:');
let total = 0;
let failed = 0;
const problems = [];

console.log('按文件名顺序执行 ' + files.length + ' 个文件：\n');
for (const f of files) {
  const sql = fs.readFileSync(path.join(DIR, f), 'utf8');
  const stmts = statements(sql);
  let ok = 0;
  let skipped = 0;
  for (const s of stmts) {
    try { db.exec(s + ';'); ok++; total++; }
    catch (e) {
      if (IGNORABLE.test(e.message)) { skipped++; continue; }
      failed++;
      problems.push({ file: f, stmt: s.replace(/\s+/g, ' ').slice(0, 110), err: e.message });
    }
  }
  const flag = problems.some((p) => p.file === f) ? '❌' : '✅';
  console.log(flag + ' ' + f.padEnd(52) + ok + ' 条成功' + (skipped ? '，' + skipped + ' 条幂等跳过' : ''));
}

if (problems.length) {
  console.log('\n❌ 有 ' + problems.length + ' 条语句失败：');
  for (const p of problems) console.log('  [' + p.file + '] ' + p.err + '\n      ' + p.stmt);
} else {
  console.log('\n✅ 全部通过：共 ' + total + ' 条语句，0 失败');
}

/* 顺带确认关键表都在（少一个就说明顺序/内容有问题） */
const REQUIRED = [
  'users', 'sessions', 'messages', 'feedbacks', 'site_settings', 'site_secrets',
  'photos', 'resume', 'ebook_chapters', 'moments',
  'about_profile', 'about_translations', 'blogs', 'blog_translations',
  'certificates', 'certificate_translations', 'projects', 'project_translations',
  'ebook_translations', 'moment_translations', 'photo_translations',
  'about_social_links', 'about_social_link_translations', 'project_images',
];
const have = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name));
const gone = REQUIRED.filter((t) => !have.has(t));
console.log(gone.length ? '\n❌ 缺表: ' + gone.join(', ') : '\n✅ 关键表齐全（' + REQUIRED.length + ' 张）');

process.exit(failed || gone.length ? 1 : 0);
