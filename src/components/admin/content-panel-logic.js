/* ==========================================================================
 * content-panel-logic.js —— 后台内容面板的**纯函数**层（无 Vue、无 IO）
 *
 * 拆出来的原因：ContentPanel.vue 的 `<script setup>` 里混了三类东西 ——
 *   ① 纯计算（大小格式化、日期格式化、标题挑选、翻译完整度、文件列表解析…）
 *   ② 响应式状态（editor / items / storeFiles…）
 *   ③ IO（adminList / adminSave / 上传 / 删对象）
 * ① 是唯一能在 node 环境直接单测的部分（本项目没有 jsdom / @vue/test-utils），
 * 所以先把它抽出来：既缩小了组件，也让「日期回填」「翻译完整度」「文件引用解析」
 * 这些**踩过坑的分支**有了回归网。
 *
 * ⚠️ 这里的函数全部是**纯函数**：只依赖入参，不改外部状态、不发请求。
 *    外部依赖只有三个同样无副作用的模块：src/lib/supabase.js 的两个纯字符串
 *    工具（splitAssetRef / resolveAssetUrl，不碰网络）与 content-fields.js 的 toForm。
 * ========================================================================== */
import { resolveAssetUrl, splitAssetRef } from '@/lib/supabase';
/* 值 ↔ 表单文本的转换只有一份实现（content-fields.js 是「唯一数据源」），
   这里直接复用它的 toForm —— 它同样是纯函数，node 下可直接跑。 */
import { toForm } from './content-fields';

/* ---------------- 格式化 ---------------- */

/** 字节数 → 可读大小（存储文件区用） */
export function fmtSize(n) {
  if (!n) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

/** 毫秒时间戳 → `YYYY-MM-DD`（`<input type="date">` 要求的格式） */
export function msToDate(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '';
  const d = new Date(n);
  const p = (x) => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* ---------------- 列表展示 ---------------- */

/**
 * 列表标题：优先**当前后台语言**，其次默认语言，再退到任意一种；都没有则退到 `#id`。
 * @param {string} field  该模块的标题字段名（TITLE_FIELD[module]）
 * @param {string} editLang 当前语言
 * @param {object} it     后台列表行（含 translations）
 */
export function pickTitle(field, editLang, it) {
  const tr = (it && it.translations) || {};
  const pick = tr[editLang] || tr['zh-CN'] || Object.values(tr)[0] || {};
  const v = pick[field];
  if (v) return String(v).slice(0, 60);
  return '#' + (it ? it.id : '');
}

/** 翻译完整度：已填语言数 / 总语言数 */
export function completenessOf(trFields, langs, translations) {
  const tr = translations || {};
  const n = langs.filter((l) => {
    const o = tr[l.code] || {};
    return trFields.some((f) => String(o[f.key] || '').trim() !== '');
  }).length;
  return n + '/' + langs.length;
}

/** 该语言是否填了任何内容（用于「未翻译」标记） */
export function langFilledIn(trFields, trObj, code) {
  const o = (trObj || {})[code] || {};
  return trFields.some((f) => String(o[f.key] || '').trim() !== '');
}

/* ---------------- 文件引用解析 ---------------- */

/** 取字段的原始值（`editor` 可能为 null） */
function rawOf(editor, field) {
  return editor && editor.main ? editor.main[field.key] : undefined;
}

/**
 * 'files' 多文件字段：库里存 JSON 数组（引用字符串），解析成 `[{ref, name}]` 供列表展示。
 * 兼容三种历史形态：JSON 数组 / 单个引用字符串 / 空。
 */
export function parseFilesList(raw) {
  if (!raw) return [];
  const toName = (r) => String(r).split('/').pop();
  try {
    const a = JSON.parse(raw);
    if (Array.isArray(a)) return a.filter(Boolean).map((r) => ({ ref: r, name: toName(r) }));
  } catch (e) { /* 非 JSON → 单引用 */ }
  return [{ ref: raw, name: toName(raw) }];
}

/** 表单里某字段的图片预览 URL（image / images 两种形态） */
export function imageUrlOfRaw(field, raw) {
  if (!raw) return '';
  if (field.type === 'images') {
    try {
      const a = JSON.parse(raw);
      return a.length ? resolveAssetUrl(a[0], field.bucket) : '';
    } catch (e) { return ''; }
  }
  return resolveAssetUrl(raw, field.bucket);
}

/** 同上，但从 `editor` 里按字段名取值 */
export function imageUrlOf(editor, field) {
  return imageUrlOfRaw(field, rawOf(editor, field));
}

/** 列表行缩略图：模块第一个 image/images 字段有值就显示 */
export function thumbUrlOf(mainFields, row) {
  const f = (mainFields || []).find((x) => x.type === 'image' || x.type === 'images');
  if (!f || !row || !row[f.key]) return '';
  return imageUrlOfRaw(f, row[f.key]);
}

/* ---------------- 表单初始化 ---------------- */

/** 新建时的空翻译表：每种语言 × 每个可翻译字段都置空串 */
export function blankTr(langs, trFields) {
  const o = {};
  for (const lang of langs) {
    o[lang.code] = {};
    for (const f of trFields) o[lang.code][f.key] = '';
  }
  return o;
}

/** 新建时的 main 表单：select 取第一个选项，其余置空 */
export function newMainForm(fields) {
  const main = {};
  for (const f of fields) main[f.key] = f.type === 'select' ? f.options[0][0] : '';
  return main;
}

/**
 * 编辑时的 main 表单回填。
 *
 * ⚠️ 日期字段的回填来源**因模块而异**（dateFrom）：
 *   日志是 updated_at（历史原因，它当年既是修改时间也是发布时间）、
 *   博客是 published_at、动态是 created_at。
 *   不能一律用 created_at：日志的 created_at 根本不存在，字段会永远空白。
 */
export function mainFormFrom(fields, row, dateFrom) {
  const main = {};
  for (const f of fields) {
    main[f.key] = toForm(f, row[f.key]);
    if (f.type === 'date' && !main[f.key]) {
      const from = dateFrom || 'created_at';
      const ts = row[from] || row.created_at || row.updated_at;
      if (ts) main[f.key] = msToDate(ts);
    }
  }
  return main;
}

/** 编辑时的翻译表回填：以空表为底，只覆盖接口返回了的语言 */
export function trFormFrom(trFields, src, langs) {
  const tr = blankTr(langs, trFields);
  const s = src || {};
  for (const lang of Object.keys(s)) {
    if (!tr[lang]) continue;
    for (const f of trFields) tr[lang][f.key] = toForm(f, s[lang][f.key]);
  }
  return tr;
}

/* ---------------- 孤儿文件清理：挑出「该删的引用」 ----------------
 * 真正的删除（deleteObject）留在组件里做 IO；这里只做**纯选择**，
 * 这样「哪些文件该删」这条容易出错的规则可以被单测覆盖。 */

/** 删记录时要一并清掉的文件引用（image / file / images 三种字段） */
export function assetRefsOfRow(fields, row) {
  const out = [];
  if (!row) return out;
  for (const f of (fields || [])) {
    if (f.type !== 'image' && f.type !== 'file' && f.type !== 'images') continue;
    const raw = row[f.key];
    if (!raw) continue;
    let list = [raw];
    if (f.type === 'images') {
      try {
        const a = JSON.parse(raw);
        list = Array.isArray(a) ? a : [];
      } catch (e) { list = []; }
    }
    for (const v of list) {
      const r = splitAssetRef(v, f.bucket);
      if (r.bucket && r.path) out.push(r);
    }
  }
  return out;
}

/**
 * 保存时「被替换掉的旧文件」引用。
 * 只处理 image / file 这类**单值**字段；images（多图数组）由各自的编辑器管，
 * 这里不碰（避免把仍在用的图删掉）。
 * 只在「旧值非空 且 确实换了」时才算 —— 值没动、或改成空，都不动文件。
 */
export function replacedAssetRefs(fields, orig, payload) {
  const out = [];
  if (!orig) return out;
  for (const f of (fields || [])) {
    if (f.type !== 'image' && f.type !== 'file') continue;
    const before = orig[f.key];
    const after = payload[f.key];
    if (!before || !after || before === after) continue;
    const r = splitAssetRef(before, f.bucket);
    if (r.bucket && r.path) out.push(r);
  }
  return out;
}
