/* ==========================================================================
 * content.js —— 内容多语言 API（About / 博客 / 证书 / 项目 / 日志 / 动态 / 照片）
 *
 * 数据模型：**翻译表**
 *   主表（blogs / certificates / projects / about_profile …）只存与语言无关的字段：
 *     文件路径、日期、状态、排序、可见性、置顶
 *   翻译表（<x>_translations）按 (fk, lang) 存所有可编辑文本
 *
 * 读接口（公开）：
 *   GET /api/content/<模块>[/<id>]?lang=zh-CN
 *   · lang 可来自 ?lang= 或 Accept-Language，最终归一到 LANGS 之一
 *   · 该语言缺失 → 回退 DEFAULT_LANG，并在该条上标 `is_fallback: true`
 *   · 响应同时带 `langs`（这条内容实际有哪些语言），供后台显示翻译完整度
 *
 * 写接口（仅站长）：
 *   POST /api/admin/<模块>            新建
 *   PUT  /api/admin/<模块>/<id>       改（可只改部分字段）
 *   DELETE /api/admin/<模块>/<id>     删
 *   入参：主表字段平铺 + `translations: { "zh-CN": {...}, "en": {...} }`
 *
 * ⚠️ 兼容性（重要）：
 *   ebook_chapters / moments / photos 三张**旧表保持原样**（旧列还在，没有删数据），
 *   但**旧的 CRUD 接口已下线** —— 2026-09-26 统一改造后，内容的读写只有这一条路：
 *     公开读 /api/content/<模块>?lang=  ·  后台写 /api/admin/<模块>
 *   保留两套写路径会让「翻译表到底有没有被写」变成薛定谔状态。
 *
 * 安全：
 *   · 列名全部来自本文件的白名单（SPECS），**不接受前端传来的列名**，杜绝 SQL 注入
 *   · 写操作一律 verifySession() + role === 'owner'（复用 editor.js 的 requireOwner）
 * ========================================================================== */
import { json, verifySession } from './auth.js';

/* 语言：与前端 src/core/i18n.js 的 LANGS 保持一致 —— 改这里时两边一起改 */
export const LANGS = ['zh-CN', 'zh-TW', 'en', 'ja'];
export const DEFAULT_LANG = 'zh-CN';

const now = () => Date.now();

/* ---------------- 语言归一 ---------------- */
function normalizeLang(raw) {
  const s = String(raw || '').toLowerCase().replace(/_/g, '-');
  if (!s) return null;
  if (s.indexOf('zh') === 0) {
    /* zh / zh-cn / zh-hans / zh-hans-cn → zh-CN；zh-tw / zh-hk / zh-hant → zh-TW */
    if (s.indexOf('tw') !== -1 || s.indexOf('hk') !== -1 || s.indexOf('hant') !== -1) return 'zh-TW';
    return 'zh-CN';
  }
  if (s.indexOf('en') === 0) return 'en';
  if (s.indexOf('ja') === 0 || s.indexOf('jp') === 0) return 'ja';
  return null;
}

/** ?lang= → Accept-Language → 默认语言 */
function pickLang(request) {
  let q = null;
  try { q = new URL(request.url).searchParams.get('lang'); } catch (e) { /* ignore */ }
  const fromQuery = normalizeLang(q);
  if (fromQuery) return fromQuery;

  const al = request.headers.get('Accept-Language') || '';
  /* 按 q 值排好序再逐个试（这里简化：按逗号顺序取第一个能识别的） */
  for (const part of al.split(',')) {
    const code = normalizeLang(part.split(';')[0]);
    if (code) return code;
  }
  return DEFAULT_LANG;
}

/* ---------------- 模块定义（SQL 白名单，改列只能改这里） ---------------- */
const SPECS = {
  about: {
    table: 'about_profile', pk: 'id', single: true,
    main: ['avatar_path', 'updated_at'], order: 'id',
    trTable: 'about_translations', fk: 'about_id',
    tr: ['name', 'headline', 'content', 'skills', 'experiences'],
    writable: ['avatar_path'],
  },
  blogs: {
    table: 'blogs', pk: 'id',
    main: ['cover_path', 'attach_path', 'status', 'pinned', 'sort_order', 'tags', 'published_at', 'created_at', 'updated_at'],
    order: 'pinned DESC, sort_order, id DESC',
    trTable: 'blog_translations', fk: 'blog_id',
    tr: ['title', 'summary', 'content'],
    writable: ['cover_path', 'attach_path', 'status', 'pinned', 'sort_order', 'tags', 'published_at'],
    onCreate: (b, ts) => ({
      status: (b.status === 'published' ? 'published' : 'draft'),
      created_at: ts,
      updated_at: ts,
      /* 建的时候就是「已发布」→ 顺手记下发布时间；草稿留空，等真正发布时由 PUT 补上。
         （之前压根没写过 published_at，前台博客永远不显示日期。） */
      published_at: b.status === 'published' ? ts : null,
    }),
    dateField: 'published_at',
  },
  certificates: {
    table: 'certificates', pk: 'id',
    main: ['image_path', 'pdf_path', 'issue_date', 'sort_order', 'created_at'],
    order: 'sort_order, id DESC',
    trTable: 'certificate_translations', fk: 'cert_id',
    tr: ['name', 'description', 'issuer'],
    writable: ['image_path', 'pdf_path', 'issue_date', 'sort_order'],
    onCreate: (b, ts) => ({ created_at: ts }),
  },
  projects: {
    table: 'projects', pk: 'id',
    main: ['slug', 'cover_path', 'link', 'tech_stack', 'visible', 'sort_order', 'created_at'],
    order: 'sort_order, id',
    trTable: 'project_translations', fk: 'project_id',
    tr: ['title', 'summary', 'detail'],
    writable: ['slug', 'cover_path', 'link', 'tech_stack', 'visible', 'sort_order'],
    onCreate: (b, ts) => ({ created_at: ts }),
  },
  logs: {
    table: 'ebook_chapters', pk: 'id',
    main: ['sort_order', 'updated_at', 'kind', 'visible', 'pinned'],
    order: 'pinned DESC, updated_at DESC, id DESC',
    trTable: 'ebook_translations', fk: 'chapter_id',
    tr: ['title', 'content'],
    writable: ['sort_order', 'kind', 'visible', 'pinned'],
    /* 旧表用 updated_at 当发布时间；允许站长自选日期（YYYY-MM-DD 或毫秒） */
    onCreate: (b, ts) => ({ kind: (b.kind === 'personal' ? 'personal' : 'update'), updated_at: ts }),
    dateField: 'updated_at',
    /* ⚠️ ebook_chapters 的 title / content 是 **NOT NULL**，而本接口只写翻译表 →
       新建时会直接撞 `NOT NULL constraint failed: ebook_chapters.title`（站长根本建不了日志）。
       所以写完翻译后把「最佳可用文本」回填旧列，**只为了满足约束**；读取一律走翻译表。 */
    legacy: { table: 'ebook_chapters', map: { title: 'title', content: 'content' } },
  },
  moments: {
    table: 'moments', pk: 'id',
    main: ['images', 'created_at', 'updated_at', 'visible', 'pinned'],
    order: 'pinned DESC, created_at DESC',
    trTable: 'moment_translations', fk: 'moment_id',
    tr: ['content', 'location'],
    writable: ['images', 'visible', 'pinned'],
    onCreate: (b, ts) => ({ created_at: ts, updated_at: ts }),
    dateField: 'created_at',
    legacy: { table: 'moments', map: { content: 'content', location: 'location' } },
  },
  photos: {
    table: 'photos', pk: 'id',
    main: ['storage_path', 'width', 'height', 'sort_order', 'created_at'],
    order: 'sort_order, id',
    trTable: 'photo_translations', fk: 'photo_id',
    tr: ['title', 'description'],
    writable: ['storage_path', 'width', 'height', 'sort_order'],
    onCreate: (b, ts) => ({ created_at: ts }),
  },
  /* 社交链接：挂在 about 下的子集合。
     公开读时会被内嵌进 `/api/content/about` 的 item.links（见 attachChildren）。 */
  'social-links': {
    table: 'about_social_links', pk: 'id',
    /* ⚠️ about_id 必须在 main 里：attachChildren 靠它把子项挂到父项上，
       漏了的话内嵌结果永远是空数组（踩过）。 */
    main: ['about_id', 'platform', 'url', 'icon', 'sort_order', 'visible', 'created_at', 'updated_at'],
    order: 'sort_order, id',
    trTable: 'about_social_link_translations', fk: 'link_id',
    tr: ['label'],
    writable: ['platform', 'url', 'icon', 'sort_order', 'visible'],
    onCreate: (b, ts) => ({ created_at: ts, updated_at: ts }),
  },
  /* 项目图集：projects 的子集合，与语言无关（图片没有语言）→ 无翻译表 */
  'project-images': {
    table: 'project_images', pk: 'id',
    main: ['project_id', 'image_path', 'sort_order', 'created_at'],
    order: 'project_id, sort_order, id',
    trTable: '', fk: '',
    tr: [], noTranslate: true,
    writable: ['project_id', 'image_path', 'sort_order'],
    onCreate: (b, ts) => ({ created_at: ts }),
  },
  /* 简历：单行表（id=1），一个 PDF，**与语言无关** → 没有翻译表。
     tr 为空数组时 queryList 会跳过翻译查询，is_fallback 恒为 false。 */
  resume: {
    table: 'resume', pk: 'id', single: true, noTranslate: true,
    main: ['storage_path', 'version', 'size_bytes', 'updated_at'], order: 'id',
    trTable: '', fk: '',
    tr: [],
    writable: ['storage_path', 'version', 'size_bytes'],
  },
};

/**
 * 后端支持的模块名（就是 SPECS 的键）。
 * 导出是为了让**前端面板与后端实现做一致性校验** ——
 * 曾出现过「前台「管理」按钮跳 photos、但面板没注册 photos」的空面板 bug，
 * 也见过反向的（面板注册了后端没有的模块）。测试脚本两边都查。
 */
export const CONTENT_MODULES = Object.keys(SPECS);

/* ---------------- 读取：主表 + 按 lang 合并翻译 ---------------- */
async function queryList(db, spec, lang, whereSql, whereParams) {
  const rows = await db
    .prepare(`SELECT ${spec.pk} AS _pk, ${spec.main.join(', ')} FROM ${spec.table} ${whereSql || ''} ORDER BY ${spec.order}`)
    .bind(...(whereParams || []))
    .all();
  const list = rows.results || [];
  if (!list.length) return [];

  /* 一次性把所有语言的翻译都取回来：既能做回退，也能给后台算翻译完整度。
     无翻译表的模块（resume）直接跳过 —— 它的内容与语言无关。 */
  const byId = new Map();
  if (!spec.noTranslate && spec.tr.length) {
    const placeholders = list.map(() => '?').join(',');
    const trRes = await db
      .prepare(`SELECT ${spec.fk} AS _fk, lang, ${spec.tr.join(', ')} FROM ${spec.trTable} WHERE ${spec.fk} IN (${placeholders})`)
      .bind(...list.map((r) => r._pk))
      .all();
    for (const t of (trRes.results || [])) {
      if (!byId.has(t._fk)) byId.set(t._fk, {});
      byId.get(t._fk)[t.lang] = t;
    }
  }

  return list.map((r) => {
    const all = byId.get(r._pk) || {};
    /* 无翻译字段的模块：没有「翻译」概念，直接返回主表字段 */
    if (spec.noTranslate || !spec.tr.length) {
      const plain = { id: r._pk };
      for (const k of spec.main) plain[k] = r[k] ?? null;
      plain.is_fallback = false;
      plain.langs = [];
      return plain;
    }
    /* 「缺翻译」的判定：整条没有，或**所有文本字段都空** —— 允许只填了标题没填正文。
       ⚠️ is_fallback 的语义是「当前语言没拿到内容」，不是「最终有没有内容」：
          即使四种语言一行都没有，也标 true —— 前端据此决定显示
          「暂无 XX 版本」提示，或回落到自己的静态兜底文案。 */
    const empty = (o) => !o || spec.tr.every((k) => o[k] == null || String(o[k]).trim() === '');
    let pick = all[lang];
    let fallback = false;
    if (empty(pick)) { pick = all[DEFAULT_LANG] || {}; fallback = true; }
    if (empty(pick)) { pick = Object.values(all)[0] || {}; fallback = true; }

    const out = {};
    for (const k of spec.main) out[k] = r[k] ?? null;
    out.id = r._pk;
    for (const k of spec.tr) out[k] = pick[k] ?? null;
    out.is_fallback = fallback;   /* ← 前端据此显示「暂无 English 版本」 */
    out.langs = Object.keys(all);  /* ← 后台据此算翻译完整度 */
    return out;
  });
}

/** 后台用：返回完整的多语言对象（不做回退） */
async function queryAdminList(db, spec) {
  const rows = await db
    .prepare(`SELECT ${spec.pk} AS _pk, ${spec.main.join(', ')} FROM ${spec.table} ORDER BY ${spec.order}`)
    .all();
  const list = rows.results || [];
  if (!list.length) return [];
  const byId = new Map();
  if (!spec.noTranslate && spec.tr.length) {
    const ph = list.map(() => '?').join(',');
    const trRes = await db
      .prepare(`SELECT ${spec.fk} AS _fk, lang, ${spec.tr.join(', ')} FROM ${spec.trTable} WHERE ${spec.fk} IN (${ph})`)
      .bind(...list.map((r) => r._pk))
      .all();
    for (const t of (trRes.results || [])) {
      if (!byId.has(t._fk)) byId.set(t._fk, {});
      byId.get(t._fk)[t.lang] = t;
    }
  }
  return list.map((r) => {
    const out = {};
    for (const k of spec.main) out[k] = r[k] ?? null;
    out.id = r._pk;
    out.translations = byId.get(r._pk) || {};
    out.langs = Object.keys(byId.get(r._pk) || {});
    return out;
  });
}

/* ---------------- 子集合内嵌 ----------------
 * 社交链接挂在 about 下、图集挂在 projects 下。
 * 规格要求「GET /api/about 中一并返回社交链接」，所以公开读时把它们嵌进父项，
 * 前端一次请求就能拿到完整数据（少一次往返）。
 * ⚠️ 只做**公开读**的内嵌；后台仍走各自的 /api/admin/<模块> 独立列表。 */
const CHILDREN = {
  about: { mod: 'social-links', as: 'links', fk: 'about_id', onlyVisible: true },
  projects: { mod: 'project-images', as: 'images', fk: 'project_id', onlyVisible: false },
};

async function attachChildren(db, kind, lang, items) {
  const cfg = CHILDREN[kind];
  if (!cfg || !items || !items.length) return items;
  const child = SPECS[cfg.mod];
  if (!child) return items;
  /* 前台只展示 visible=1 的社交链接；后台 /api/admin 能看到全部 */
  const where = (cfg.onlyVisible && child.main.indexOf('visible') !== -1)
    ? 'WHERE COALESCE(visible, 1) = 1' : '';
  const all = await queryList(db, child, lang, where, []);
  const byParent = new Map();
  for (const c of all) {
    const k = c[cfg.fk];
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(c);
  }
  for (const it of items) it[cfg.as] = byParent.get(it.id) || [];
  return items;
}

/* ---------------- 写入：翻译 upsert ---------------- */
async function upsertTranslation(db, spec, id, lang, obj) {
  const cols = Object.keys(obj).filter((k) => spec.tr.indexOf(k) !== -1);
  if (!cols.length) return;
  const ph = cols.map(() => '?').join(',');
  const setSql = cols.map((c) => `${c} = excluded.${c}`).join(', ');
  await db
    .prepare(
      `INSERT INTO ${spec.trTable} (${spec.fk}, lang, ${cols.join(', ')}, updated_at) VALUES (?, ?, ${ph}, ?) ` +
      `ON CONFLICT(${spec.fk}, lang) DO UPDATE SET ${setSql}, updated_at = excluded.updated_at`
    )
    .bind(id, lang, ...cols.map((c) => obj[c]), now())
    .run();

  /* 兼容性：写 zh-CN 时同步回写旧表的旧列（旧后台 / 旧接口仍在用那些列） */
  if (lang === DEFAULT_LANG && spec.legacy) {
    const pairs = Object.keys(spec.legacy.map).filter((k) => obj[k] !== undefined);
    if (pairs.length) {
      await db
        .prepare(`UPDATE ${spec.legacy.table} SET ${pairs.map((k) => `${spec.legacy.map[k]} = ?`).join(', ')} WHERE id = ?`)
        .bind(...pairs.map((k) => obj[k]), id)
        .run();
    }
  }
}

/**
 * 把「最佳可用文本」回填到旧表的旧列。
 *
 * 为什么必须做：`ebook_chapters.title/content` 和 `moments.content` 都是 **NOT NULL**
 *   （建表时的历史约束，SQLite 改不掉），而本接口只往翻译表写 ——
 *   不回填的话，站长在后台**新建**日志/动态会直接 `NOT NULL constraint failed`。
 * 回填值取默认语言 → 任意语言 → 空串（空串满足 NOT NULL）。
 * ⚠️ 这是**单向兼容**：只写不读。所有读取一律走翻译表。
 */
async function syncLegacy(db, spec, id, trs) {
  if (!spec.legacy || !id) return;
  const pick = trs[DEFAULT_LANG] || Object.values(trs)[0] || {};
  const cols = [];
  const vals = [];
  for (const k of Object.keys(spec.legacy.map)) {
    const v = pick[k];
    cols.push(`${spec.legacy.map[k]} = ?`);
    vals.push(v == null ? '' : String(v));
  }
  if (!cols.length) return;
  await db.prepare(`UPDATE ${spec.legacy.table} SET ${cols.join(', ')} WHERE id = ?`)
    .bind(...vals, id).run();
}

/* ---------------- 鉴权 ---------------- */
async function requireOwner(request, env) {
  const user = await verifySession(request, env);
  if (!user) return { err: json({ error: '请先登录' }, 401) };
  if (user.role !== 'owner') return { err: json({ error: '仅站长可操作' }, 403) };
  return { user };
}

async function readBody(request) {
  try { return await request.json(); } catch (e) { return null; }
}

/* ---------------- 各模块的读写处理 ---------------- */
async function handleRead(request, env, kind, id) {
  const spec = SPECS[kind];
  const db = env.DB;
  const lang = pickLang(request);

  /* 单行表（about / resume）：固定取 id = 1 */
  if (spec.single) {
    const rows = await queryList(db, spec, lang, 'WHERE id = 1', []);
    await attachChildren(db, kind, lang, rows);
    return json({ item: rows[0] || null, lang, default_lang: DEFAULT_LANG, langs: LANGS });
  }

  /* 日志支持 ?kind=personal|update 过滤 */
  let whereSql = '';
  const params = [];
  if (kind === 'logs') {
    let k = null;
    try { k = new URL(request.url).searchParams.get('kind'); } catch (e) { k = null; }
    if (k === 'personal' || k === 'update') { whereSql = "WHERE COALESCE(kind, 'update') = ?"; params.push(k); }
  }
  /* 只读可见的（后台走 /api/admin/* 拿全量） */
  if (spec.main.indexOf('visible') !== -1) {
    whereSql += whereSql ? ' AND ' : 'WHERE ';
    whereSql += 'COALESCE(visible, 1) = 1';
  }
  /* 草稿不能出现在公开接口里 —— 这是唯一一处「状态过滤」，别漏 */
  if (kind === 'blogs') {
    whereSql += whereSql ? ' AND ' : 'WHERE ';
    whereSql += "COALESCE(status, 'draft') = 'published'";
  }

  if (id) {
    const w = `${whereSql ? whereSql + ' AND ' : 'WHERE '}${spec.pk} = ?`;
    const rows = await queryList(db, spec, lang, w, [...params, Number(id)]);
    if (!rows.length) return json({ error: '未找到' }, 404);
    return json({ item: rows[0], lang, default_lang: DEFAULT_LANG, langs: LANGS });
  }
  const items = await queryList(db, spec, lang, whereSql, params);
  await attachChildren(db, kind, lang, items);
  return json({ items, lang, default_lang: DEFAULT_LANG, langs: LANGS });
}

async function handleAdmin(request, env, kind, id) {
  const spec = SPECS[kind];
  const db = env.DB;

  /* ⚠️ **所有方法都要鉴权**，包括 GET。
     后台列表不只是「多返回几种语言」—— 它**包含草稿**（blogs 里 status=draft 的
     正文）和 visible=0 的隐藏条目。若 GET 不设防，未登录者直接请求
     /api/admin/blogs 就能读到未发布内容。公开读取一律走 /api/content/*。 */
  const guard = await requireOwner(request, env);
  if (guard.err) return guard.err;

  if (request.method === 'GET') {
    const items = await queryAdminList(db, spec);
    return json({ items, langs: LANGS, default_lang: DEFAULT_LANG });
  }

  if (request.method === 'POST') {
    const b = await readBody(request);
    if (!b) return json({ error: '请求体不是合法 JSON' }, 400);

    /* 单行表（about / resume）：固定 id = 1。
       ⚠️ 不能用 `INSERT ... ON CONFLICT(id) DO UPDATE`：SQLite 会**先校验 NOT NULL
          再处理冲突**，所以「行已存在 + 只传部分字段」时（例如只改 resume.version）
          会因为 storage_path 没有值而直接报 NOT NULL constraint failed。
          正确做法是先查存在性，存在就 UPDATE 只传的列。 */
    if (spec.single) {
      const cols = spec.writable.filter((k) => b[k] !== undefined);
      const existing = await db.prepare(`SELECT ${spec.pk} FROM ${spec.table} WHERE id = 1`).first();
      if (existing) {
        if (cols.length) {
          await db.prepare(
            `UPDATE ${spec.table} SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = 1`
          ).bind(...cols.map((k) => b[k]), now()).run();
        }
      } else {
        const all = ['id', ...cols, 'updated_at'];
        const vals = [1, ...cols.map((k) => b[k]), now()];
        await db.prepare(
          `INSERT INTO ${spec.table} (${all.join(', ')}) VALUES (${all.map(() => '?').join(', ')})`
        ).bind(...vals).run();
      }
      const trs = b.translations || {};
      for (const lang of Object.keys(trs)) {
        if (LANGS.indexOf(lang) === -1) continue;
        await upsertTranslation(db, spec, 1, lang, trs[lang]);
      }
      return json({ ok: true, id: 1 });
    }

    /* 解析站长自选日期（YYYY-MM-DD 或毫秒时间戳） */
    let ts = now();
    if (b.date) {
      const d = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date)) ? Date.parse(String(b.date) + 'T12:00:00Z') : Number(b.date);
      if (Number.isFinite(d) && d > 0) ts = d;
    }
    const extra = spec.onCreate ? spec.onCreate(b, ts) : {};
    const cols = [];
    const vals = [];
    for (const k of spec.writable) {
      if (b[k] === undefined) continue;
      cols.push(k);
      vals.push(k === 'tags' && Array.isArray(b[k]) ? JSON.stringify(b[k]) : b[k]);
    }
    for (const k of Object.keys(extra)) { cols.push(k); vals.push(extra[k]); }
    /* ⚠️ 旧表的 NOT NULL 旧列**必须在 INSERT 时就给值** ——
       只靠插入后再回填（syncLegacy）来不及，INSERT 当场就会撞约束。
       这里先塞空串占位，插完再用真实文本覆盖。 */
    if (spec.legacy) {
      for (const k of Object.keys(spec.legacy.map)) {
        const col = spec.legacy.map[k];
        if (cols.indexOf(col) === -1) { cols.push(col); vals.push(''); }
      }
    }
    if (!cols.length) return json({ error: '没有可写入的字段' }, 400);

    const r = await db
      .prepare(`INSERT INTO ${spec.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
      .bind(...vals)
      .run();
    const newId = r.meta && r.meta.last_row_id;

    const trs = b.translations || {};
    for (const lang of Object.keys(trs)) {
      if (LANGS.indexOf(lang) === -1) continue;
      await upsertTranslation(db, spec, newId, lang, trs[lang]);
    }
    /* 没带 translations 但带了平铺字段（旧写法）→ 当作默认语言补一条 */
    const flat = {};
    for (const k of spec.tr) if (b[k] !== undefined) flat[k] = b[k];
    if (!Object.keys(trs).length && Object.keys(flat).length) {
      await upsertTranslation(db, spec, newId, DEFAULT_LANG, flat);
    }
    /* 回填旧列：ebook_chapters.title/content、moments.content 是 NOT NULL，
       不回填的话新建会直接撞约束（详见 syncLegacy 的注释） */
    await syncLegacy(db, spec, newId, Object.keys(trs).length ? trs : { [DEFAULT_LANG]: flat });
    return json({ ok: true, id: newId });
  }

  if (request.method === 'PUT') {
    if (!id && !spec.single) return json({ error: '缺少 id' }, 400);
    const b = await readBody(request) || {};
    const target = spec.single ? 1 : Number(id);

    if (spec.single) {
      const cols = spec.writable.filter((k) => b[k] !== undefined);
      if (cols.length) {
        await db.prepare(
          `UPDATE ${spec.table} SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = 1`
        ).bind(...cols.map((k) => b[k]), now()).run();
      }
    } else {
      const cols = [];
      const vals = [];
      for (const k of spec.writable) {
        if (b[k] === undefined) continue;
        cols.push(k);
        vals.push(k === 'tags' && Array.isArray(b[k]) ? JSON.stringify(b[k]) : b[k]);
      }
      if (b.date && spec.dateField) {
        const d = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date)) ? Date.parse(String(b.date) + 'T12:00:00Z') : Number(b.date);
        if (Number.isFinite(d) && d > 0) { cols.push(spec.dateField); vals.push(d); }
      } else if (spec.dateField) {
        /* 站长没显式给日期时，**只在当前为空**的情况下补一个 ——
           典型场景：博客先存草稿、后来改成「已发布」，此时 published_at 还是 NULL，
           不补的话前台永远不显示发布日期。已有值绝不覆盖（否则每次改状态都会刷新日期）。 */
        const cur = await db.prepare(`SELECT ${spec.dateField} AS d FROM ${spec.table} WHERE ${spec.pk} = ?`)
          .bind(target).first();
        if (cur && !cur.d) { cols.push(spec.dateField); vals.push(now()); }
      }
      if (cols.length) {
        await db.prepare(`UPDATE ${spec.table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE ${spec.pk} = ?`)
          .bind(...vals, target).run();
      }
    }

    const trs = b.translations || {};
    for (const lang of Object.keys(trs)) {
      if (LANGS.indexOf(lang) === -1) continue;
      await upsertTranslation(db, spec, target, lang, trs[lang]);
    }
    /* 只有确实改了文本时才回填旧列 —— 否则「只改排序」的 PUT 会把旧列清成空串 */
    if (Object.keys(trs).length) await syncLegacy(db, spec, target, trs);
    return json({ ok: true, id: target });
  }

  if (request.method === 'DELETE') {
    if (!id || spec.single) return json({ error: '该模块不支持删除' }, 400);
    /* 先取文件路径，删完由前端决定是否调 /api/editor/delete-object 清 Storage */
    const row = await db.prepare(`SELECT * FROM ${spec.table} WHERE ${spec.pk} = ?`).bind(Number(id)).first();
    /* 无翻译表的模块（project-images / resume）trTable 是空串 ——
       不加这个判断会拼出 `DELETE FROM  WHERE  = ?` 直接语法错误。 */
    if (spec.trTable && spec.fk) {
      await db.prepare(`DELETE FROM ${spec.trTable} WHERE ${spec.fk} = ?`).bind(Number(id)).run();
    }
    await db.prepare(`DELETE FROM ${spec.table} WHERE ${spec.pk} = ?`).bind(Number(id)).run();
    return json({ ok: true, removed: row || null });
  }

  return json({ error: '方法不支持' }, 405);
}

/* ---------------- 分派 ---------------- */
export function handleContentApi(request, env) {
  let p;
  try { p = new URL(request.url).pathname; } catch (e) { return null; }

  /* 模块名正则**由 SPECS 推导**，避免「加了模块忘了改路由」这种低级错 */
  const mods = Object.keys(SPECS).join('|');

  /* 公开读：/api/content/<模块>[/<id>] */
  let m = p.match(new RegExp(`^/api/content/(${mods})(?:/(\\d+))?$`));
  if (m) {
    if (request.method !== 'GET') return json({ error: '方法不支持' }, 405);
    return handleRead(request, env, m[1], m[2] ? Number(m[2]) : null);
  }

  /* 后台写：/api/admin/<模块>[/<id>] */
  m = p.match(new RegExp(`^/api/admin/(${mods})(?:/(\\d+))?$`));
  if (m) return handleAdmin(request, env, m[1], m[2] || null);

  return null;
}
