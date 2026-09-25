/* ==========================================================================
 * editor.js —— 站长编辑功能 API（照片墙 / 简历 / 电子书 / 朋友圈）
 *
 * 分工：
 *   · 文本数据 → D1（本文件，复用 verifySession + 自建 JWT）
 *   · 二进制文件 → Supabase Storage（本文件只签发**一次性上传 URL**，
 *     文件由前端直传 Supabase，不经 Worker —— 避开 Worker 请求体上限）
 *
 * 鉴权：
 *   · 读接口：公开（GET）
 *   · 写接口：verifySession() + role === 'owner'（比 isPrivileged 更严，仅站长）
 *
 * 密钥：
 *   · SUPABASE_SERVICE_ROLE_KEY 走 wrangler secret，**绝不进前端**；
 *     未配置时 sign-upload 返回 501（其余接口不受影响）。
 * ========================================================================== */
import { verifySession, json } from './auth.js';

/* SUPABASE_URL 可配置：优先 env.SUPABASE_URL（wrangler.toml 的 [vars]），
   否则用兜底常量。URL 是公开信息，不需要走 secret。 */
const DEFAULT_URL = 'https://wrguksjsbdvoqfedsdow.supabase.co';
const BUCKETS = ['photos', 'resume', 'moments'];

/* 桶规则：扩展名白名单 + 单文件大小上限（前端直传不经 Worker，这里是最靠前的服务端校验；
   真正的兜底请在 Supabase 桶设置里配 File size limit / Allowed MIME types）。 */
const RULES = {
  photos:  { ext: ['webp', 'jpg', 'jpeg', 'png', 'gif'], maxBytes: 8 * 1024 * 1024 },
  resume:  { ext: ['pdf'], maxBytes: 16 * 1024 * 1024 },
  moments: { ext: ['webp', 'jpg', 'jpeg', 'png', 'gif', 'pdf'], maxBytes: 16 * 1024 * 1024 },
};
function sbUrl(env) {
  return String((env && env.SUPABASE_URL) || '').trim().replace(/\/+$/, '') || DEFAULT_URL;
}

/** 写接口守卫：必须登录且 role === 'owner' */
async function requireOwner(request, env) {
  const user = await verifySession(request, env);
  if (!user) return { err: json({ error: '请先登录' }, 401) };
  if (user.role !== 'owner') return { err: json({ error: '仅站长可操作' }, 403) };
  return { user: user };
}

async function readBody(request) {
  try { return await request.json(); } catch (e) { return null; }
}

const now = () => Date.now();

/* ---------------- 照片墙 ---------------- */
async function photos(request, env, id) {
  const db = env.DB;
  if (request.method === 'GET') {
    const rows = await db.prepare(
      'SELECT id, title, description, storage_path, width, height, sort_order, created_at FROM photos ORDER BY sort_order, id'
    ).all();
    return json({ items: rows.results || [] });
  }
  const guard = await requireOwner(request, env);
  if (guard.err) return guard.err;

  if (request.method === 'POST') {
    const b = await readBody(request);
    if (!b || !b.storage_path) return json({ error: '缺少 storage_path' }, 400);
    if (b.size_bytes && Number(b.size_bytes) > RULES.photos.maxBytes) return json({ error: '图片超过 8MB 上限' }, 400);
    const r = await db.prepare(
      'INSERT INTO photos (title, description, storage_path, width, height, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(b.title || '', b.description || '', String(b.storage_path), b.width || null, b.height || null, b.sort_order || 0, now()).run();
    return json({ ok: true, id: r.meta && r.meta.last_row_id });
  }
  if (request.method === 'PUT' && id) {
    const b = await readBody(request) || {};
    await db.prepare(
      'UPDATE photos SET title = COALESCE(?, title), description = COALESCE(?, description), sort_order = COALESCE(?, sort_order) WHERE id = ?'
    ).bind(b.title ?? null, b.description ?? null, b.sort_order ?? null, id).run();
    return json({ ok: true });
  }
  if (request.method === 'DELETE' && id) {
    const row = await db.prepare('SELECT storage_path FROM photos WHERE id = ?').bind(id).first();
    await db.prepare('DELETE FROM photos WHERE id = ?').bind(id).run();
    /* Storage 里的文件由前端在删元数据后调 /api/editor/delete-object 清理（或留着不管） */
    return json({ ok: true, storage_path: row ? row.storage_path : null });
  }
  return json({ error: '方法不支持' }, 405);
}

/* ---------------- 简历（固定单行 id=1） ---------------- */
async function resume(request, env) {
  const db = env.DB;
  if (request.method === 'GET') {
    const row = await db.prepare('SELECT id, storage_path, version, size_bytes, updated_at FROM resume WHERE id = 1').first();
    return json({ item: row || null });
  }
  const guard = await requireOwner(request, env);
  if (guard.err) return guard.err;
  if (request.method === 'POST') {
    const b = await readBody(request);
    if (!b || !b.storage_path) return json({ error: '缺少 storage_path' }, 400);
    if (String(b.storage_path).split('.').pop().toLowerCase() !== 'pdf') return json({ error: '简历只接受 PDF' }, 400);
    if (b.size_bytes && Number(b.size_bytes) > RULES.resume.maxBytes) return json({ error: 'PDF 超过 16MB 上限' }, 400);
    await db.prepare(
      'INSERT INTO resume (id, storage_path, version, size_bytes, updated_at) VALUES (1, ?, ?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET storage_path = excluded.storage_path, version = excluded.version, size_bytes = excluded.size_bytes, updated_at = excluded.updated_at'
    ).bind(String(b.storage_path), b.version || '', b.size_bytes || null, now()).run();
    return json({ ok: true });
  }
  return json({ error: '方法不支持' }, 405);
}

/* ---------------- 电子书章节 ---------------- */
async function ebook(request, env, id) {
  const db = env.DB;
  if (request.method === 'GET') {
    const rows = await db.prepare('SELECT id, title, content, sort_order, updated_at FROM ebook_chapters ORDER BY sort_order, id').all();
    return json({ items: rows.results || [] });
  }
  const guard = await requireOwner(request, env);
  if (guard.err) return guard.err;
  if (request.method === 'POST') {
    const b = await readBody(request);
    if (!b || !b.title || typeof b.content !== 'string') return json({ error: '缺少 title / content' }, 400);
    const r = await db.prepare('INSERT INTO ebook_chapters (title, content, sort_order, updated_at) VALUES (?, ?, ?, ?)')
      .bind(String(b.title), String(b.content), b.sort_order || 0, now()).run();
    return json({ ok: true, id: r.meta && r.meta.last_row_id });
  }
  if (request.method === 'PUT' && id) {
    const b = await readBody(request) || {};
    await db.prepare(
      'UPDATE ebook_chapters SET title = COALESCE(?, title), content = COALESCE(?, content), sort_order = COALESCE(?, sort_order), updated_at = ? WHERE id = ?'
    ).bind(b.title ?? null, b.content ?? null, b.sort_order ?? null, now(), id).run();
    return json({ ok: true });
  }
  if (request.method === 'DELETE' && id) {
    await db.prepare('DELETE FROM ebook_chapters WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  return json({ error: '方法不支持' }, 405);
}

/* ---------------- 朋友圈 ---------------- */
async function moments(request, env, id) {
  const db = env.DB;
  if (request.method === 'GET') {
    const rows = await db.prepare('SELECT id, content, images, location, created_at, updated_at FROM moments ORDER BY created_at DESC').all();
    return json({ items: rows.results || [] });
  }
  const guard = await requireOwner(request, env);
  if (guard.err) return guard.err;
  if (request.method === 'POST') {
    const b = await readBody(request);
    if (!b || !b.content) return json({ error: '缺少 content' }, 400);
    const imgs = Array.isArray(b.images) ? JSON.stringify(b.images) : (b.images || '[]');
    const r = await db.prepare('INSERT INTO moments (content, images, location, created_at) VALUES (?, ?, ?, ?)')
      .bind(String(b.content), imgs, b.location || '', now()).run();
    return json({ ok: true, id: r.meta && r.meta.last_row_id });
  }
  if (request.method === 'PUT' && id) {
    const b = await readBody(request) || {};
    const imgs = b.images === undefined ? null : (Array.isArray(b.images) ? JSON.stringify(b.images) : String(b.images));
    await db.prepare(
      'UPDATE moments SET content = COALESCE(?, content), images = COALESCE(?, images), location = COALESCE(?, location), updated_at = ? WHERE id = ?'
    ).bind(b.content ?? null, imgs, b.location ?? null, now(), id).run();
    return json({ ok: true });
  }
  if (request.method === 'DELETE' && id) {
    await db.prepare('DELETE FROM moments WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  return json({ error: '方法不支持' }, 405);
}

/* ---------------- 签发一次性上传 URL（避免文件过 Worker） ---------------- */
async function signUpload(request, env) {
  const guard = await requireOwner(request, env);
  if (guard.err) return guard.err;
  /* 容错：secret 若被粘贴成 'eyJ...'（带引号）或行尾带空格，
     Supabase 的严格 JWT 解码会报「Failed to base64url decode the signature」。
     这里统一去掉包裹的引号与首尾空白。 */
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/^["']+/, '').replace(/["']+$/, '').trim();
  if (!key) return json({ error: '未配置 SUPABASE_SERVICE_ROLE_KEY' }, 501);
  const b = await readBody(request);
  if (!b || !b.bucket || !b.path) return json({ error: '缺少 bucket / path' }, 400);
  if (BUCKETS.indexOf(b.bucket) === -1) return json({ error: '未知 bucket' }, 400);

  /* 扩展名白名单（服务端校验，前端校验可被绕过） */
  const rule = RULES[b.bucket];
  const ext = String(b.path).split('.').pop().toLowerCase();
  if (rule && rule.ext.indexOf(ext) === -1) {
    return json({ error: '该桶不允许 .' + ext + ' 文件（允许：' + rule.ext.join('/') + '）' }, 400);
  }

  const res = await fetch(sbUrl(env) + '/storage/v1/object/upload/sign/' + b.bucket + '/' + encodeURIComponent(b.path), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 600 }),
  });
  const text = await res.text();
  if (!res.ok) return json({ error: 'Supabase 签发失败', detail: text.slice(0, 200) }, 502);
  let data = {};
  try { data = JSON.parse(text); } catch (e) { /* ignore */ }
  return json({ uploadUrl: sbUrl(env) + '/storage/v1' + (data.url || ''), path: b.path, bucket: b.bucket });
}

/* ---------------- 删除 Storage 对象（service_role，仅 owner） ---------------- */
async function deleteObject(request, env) {
  const guard = await requireOwner(request, env);
  if (guard.err) return guard.err;
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/^["']+/, '').replace(/["']+$/, '').trim();
  if (!key) return json({ error: '未配置 SUPABASE_SERVICE_ROLE_KEY' }, 501);
  const b = await readBody(request);
  if (!b || !b.bucket || !b.path) return json({ error: '缺少 bucket / path' }, 400);
  if (BUCKETS.indexOf(b.bucket) === -1) return json({ error: '未知 bucket' }, 400);

  const res = await fetch(sbUrl(env) + '/storage/v1/object/' + b.bucket + '/' + encodeURIComponent(b.path), {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + key },
  });
  if (!res.ok && res.status !== 404) {
    return json({ error: 'Storage 删除失败', detail: (await res.text()).slice(0, 160) }, 502);
  }
  return json({ ok: true });
}

/* ---------------- 分派 ---------------- */
export async function handleEditorApi(request, env) {
  let p;
  try { p = new URL(request.url).pathname; } catch (e) { return null; }
  if (p.indexOf('/api/') !== 0) return null;

  if (p === '/api/editor/sign-upload') {
    if (request.method !== 'POST') return json({ error: '方法不支持' }, 405);
    return await signUpload(request, env);
  }
  if (p === '/api/editor/delete-object') {
    if (request.method !== 'POST') return json({ error: '方法不支持' }, 405);
    return await deleteObject(request, env);
  }

  const m = p.match(/^\/api\/(photos|resume|ebook|moments)(?:\/(\d+))?$/);
  if (!m) return null;
  const kind = m[1];
  const id = m[2] ? Number(m[2]) : null;

  if (kind === 'photos') return await photos(request, env, id);
  if (kind === 'resume') return await resume(request, env);
  if (kind === 'ebook') return await ebook(request, env, id);
  if (kind === 'moments') return await moments(request, env, id);
  return null;
}
