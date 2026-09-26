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
/* 桶白名单。2026-09-26 起：
   - blog-assets / certificate-assets：博客与证书专用桶
   - about-assets / project-assets：「关于我」与「项目作品」专用桶（与 photos 解耦）
   ⚠️ 所有专用桶都需要在 Supabase 控制台**手工创建**（见 README「Supabase 存储桶」一节），
      代码无法自动建桶。未创建时上传会失败，但读取旧文件不受影响。 */
/* 导出供单测回归（与 src/core/supabase.js 的 KNOWN_BUCKETS、
 *     src/components/admin/content-fields.js 的 STORE_BUCKETS 三处必须对齐）。 */
export const BUCKETS = ['photos', 'resume', 'moments', 'blog-assets', 'certificate-assets', 'about-assets', 'project-assets'];

/* 桶规则：扩展名白名单 + 单文件大小上限（前端直传不经 Worker，这里是最靠前的服务端校验；
   真正的兜底请在 Supabase 桶设置里配 File size limit / Allowed MIME types）。 */
const RULES = {
  photos:  { ext: ['webp', 'jpg', 'jpeg', 'png', 'gif'], maxBytes: 8 * 1024 * 1024 },
  resume:  { ext: ['pdf'], maxBytes: 16 * 1024 * 1024 },
  moments: { ext: ['webp', 'jpg', 'jpeg', 'png', 'gif', 'pdf'], maxBytes: 16 * 1024 * 1024 },
  /* 博客要同时放封面图与 PDF 附件，所以图片和 pdf 都允许 */
  'blog-assets': { ext: ['webp', 'jpg', 'jpeg', 'png', 'gif', 'pdf'], maxBytes: 16 * 1024 * 1024 },
  'certificate-assets': { ext: ['webp', 'jpg', 'jpeg', 'png', 'gif', 'pdf'], maxBytes: 16 * 1024 * 1024 },
  /* 关于我 / 项目作品：仅图片（不需要 PDF） */
  'about-assets': { ext: ['webp', 'jpg', 'jpeg', 'png', 'gif'], maxBytes: 8 * 1024 * 1024 },
  'project-assets': { ext: ['webp', 'jpg', 'jpeg', 'png', 'gif'], maxBytes: 8 * 1024 * 1024 },
};
/* 路径按「段」编码：整体 encodeURIComponent 会把 '/' 变成 %2F，
   而 Supabase 需要真实的 '/' 来识别目录（否则上传/删除都失败）。 */
function encodePath(p) {
  return String(p).split('/').map(encodeURIComponent).join('/');
}

/* 路径安全校验（纵深防御）：拒绝绝对路径、反斜杠、以及 `..` / `.` 段，
   避免前端传入 `../../secret` 之类越出预期目录（即便已是 owner-only）。
   导出供单测回归（路径穿越防护一旦失效，整站文件可被任意读写）。 */
export function safePath(p) {
  if (typeof p !== 'string' || !p) return null;
  let decoded;
  try { decoded = decodeURIComponent(p); } catch (e) { decoded = p; }
  if (decoded.startsWith('/') || decoded.includes('\\')) return null;
  const segs = decoded.split('/');
  for (const s of segs) {
    if (s === '..' || s === '.') return null;
  }
  return decoded;
}

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
  const path = safePath(b.path);
  if (!path) return json({ error: '非法路径（不允许 ./ 或 ../）' }, 400);

  /* 扩展名白名单（服务端校验，前端校验可被绕过） */
  const rule = RULES[b.bucket];
  const ext = String(path).split('.').pop().toLowerCase();
  if (rule && rule.ext.indexOf(ext) === -1) {
    return json({ error: '该桶不允许 .' + ext + ' 文件（允许：' + rule.ext.join('/') + '）' }, 400);
  }

  const res = await fetch(sbUrl(env) + '/storage/v1/object/upload/sign/' + b.bucket + '/' + encodePath(path), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 600 }),
  });
  const text = await res.text();
  if (!res.ok) return json({ error: 'Supabase 签发失败', detail: text.slice(0, 200) }, 502);
  let data = {};
  try { data = JSON.parse(text); } catch (e) { /* ignore */ }
  return json({ uploadUrl: sbUrl(env) + '/storage/v1' + (data.url || ''), path: path, bucket: b.bucket });
}

/* ---------------- 上传中转（service_role，仅 owner） ----------------
 * 为什么需要它：部分网络（如国内）**直连 *.supabase.co 会被 RST**（ERR_CONNECTION_RESET），
 * 浏览器无法直传。而 Worker 在 Cloudflare 侧、出网正常 → 让文件先传到本站再转发给 Supabase。
 * 请求头：X-Bucket / X-Path；body 为文件原始字节。
 * ---------------- */
async function uploadProxy(request, env) {
  const guard = await requireOwner(request, env);
  if (guard.err) return guard.err;
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/^["']+/, '').replace(/["']+$/, '').trim();
  if (!key) return json({ error: '未配置 SUPABASE_SERVICE_ROLE_KEY' }, 501);

  const bucket = request.headers.get('X-Bucket') || '';
  const rawPath = request.headers.get('X-Path') || '';
  const ctype = request.headers.get('Content-Type') || 'application/octet-stream';
  if (!bucket || !rawPath) return json({ error: '缺少 X-Bucket / X-Path' }, 400);
  if (BUCKETS.indexOf(bucket) === -1) return json({ error: '未知 bucket' }, 400);
  const path = safePath(rawPath);
  if (!path) return json({ error: '非法路径（不允许 ./ 或 ../）' }, 400);

  const rule = RULES[bucket];
  const ext = String(path).split('.').pop().toLowerCase();
  if (rule && rule.ext.indexOf(ext) === -1) return json({ error: '该桶不允许 .' + ext }, 400);

  const buf = await request.arrayBuffer();
  if (rule && buf.byteLength > rule.maxBytes) return json({ error: '文件超过上限' }, 400);

  const res = await fetch(sbUrl(env) + '/storage/v1/object/' + bucket + '/' + encodePath(path), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': ctype, 'x-upsert': 'true' },
    body: buf,
  });
  if (!res.ok) return json({ error: '上传失败', detail: (await res.text()).slice(0, 200) }, 502);
  return json({ ok: true, bucket: bucket, path: path });
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
  const path = safePath(b.path);
  if (!path) return json({ error: '非法路径（不允许 ./ 或 ../）' }, 400);

  const res = await fetch(sbUrl(env) + '/storage/v1/object/' + b.bucket + '/' + encodePath(path), {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + key },
  });
  if (!res.ok && res.status !== 404) {
    return json({ error: 'Storage 删除失败', detail: (await res.text()).slice(0, 160) }, 502);
  }
  return json({ ok: true });
}

/* ---------------- 列出 Storage 桶内对象（service_role，仅 owner） ----------------
 * 给后台管理窗口的「存储文件」区用：站长能看到每个桶里实际有哪些文件
 * （名字 / 大小 / 更新时间），配合删除按钮清理孤儿文件。 */
async function listObjects(request, env) {
  const guard = await requireOwner(request, env);
  if (guard.err) return guard.err;
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/^["']+/, '').replace(/["']+$/, '').trim();
  if (!key) return json({ error: '未配置 SUPABASE_SERVICE_ROLE_KEY' }, 501);

  let bucket = '';
  try { bucket = new URL(request.url).searchParams.get('bucket') || ''; } catch (e) { /* fallthrough */ }
  if (BUCKETS.indexOf(bucket) === -1) return json({ error: '未知 bucket' }, 400);

  const res = await fetch(sbUrl(env) + '/storage/v1/object/list/' + bucket, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: '', limit: 1000, sortBy: { column: 'name', order: 'asc' } }),
  });
  if (!res.ok) return json({ error: '列出失败', detail: (await res.text()).slice(0, 160) }, 502);
  const arr = await res.json();
  const items = (Array.isArray(arr) ? arr : []).map((o) => ({
    name: o.name || '',
    size: (o.metadata && o.metadata.size) || 0,
    updated: o.updated_at || '',
  }));
  return json({ items });
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
  if (p === '/api/editor/upload') {
    if (request.method !== 'POST') return json({ error: '方法不支持' }, 405);
    return await uploadProxy(request, env);
  }
  if (p === '/api/editor/delete-object') {
    if (request.method !== 'POST') return json({ error: '方法不支持' }, 405);
    return await deleteObject(request, env);
  }
  if (p === '/api/editor/list-objects') {
    if (request.method !== 'GET') return json({ error: '方法不支持' }, 405);
    return await listObjects(request, env);
  }

  /* 本文件**只负责文件通道**（签发上传 URL / 中转上传 / 删除对象）。
     内容的增删改查已全部收敛到 worker/content.js：
       · 公开读  /api/content/<模块>?lang=xx
       · 后台写  /api/admin/<模块>[/<id>]
     ⚠️ 原先这里还有 /api/photos、/api/resume、/api/ebook、/api/moments 四组 CRUD，
        2026-09-26 统一时**已删除** —— 保留两套写路径会让「翻译表有没有被写」变成薛定谔状态。 */
  return null;
}
