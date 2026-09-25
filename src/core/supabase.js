/* ==========================================================================
 * Supabase Storage 访问层（前端）
 *
 * 架构：**前端不持有任何 Supabase 密钥**（anon key 也不需要）
 *   · 读文件  → 公开 URL 纯字符串拼接（bucket 是 public）
 *   · 上传文件 → 先调本站 Worker `/api/editor/sign-upload` 拿**一次性签名 URL**
 *                （Worker 用 service_role 签发），再 fetch PUT 直传 Supabase。
 *                好处：文件不经 Worker（不受请求体上限约束），
 *                      且 service_role 永不离开 Worker。
 *   · 删文件  → 走 Worker（service_role）
 *
 * 因此这里**不依赖 @supabase/supabase-js**，只用 fetch。
 * ========================================================================== */

/* 优先读 VITE_SUPABASE_URL（.env.local），否则用兜底常量。URL 是公开信息。 */
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || 'https://wrguksjsbdvoqfedsdow.supabase.co').replace(/\/+$/, '');

/** 公开读 URL（bucket 必须为 public） */
export function publicUrl(bucket, path) {
  if (!bucket || !path) return '';
  return SUPABASE_URL + '/storage/v1/object/public/' + bucket + '/' + encodeURIComponent(path);
}

/**
 * 上传文件到指定桶：先向本站要签名 URL，再直传。
 * @param {string} bucket  photos | resume | moments
 * @param {string} path    桶内路径（建议 <时间戳>-<随机>.<ext>）
 * @param {File|Blob} file
 * @returns {Promise<string>} 上传成功后的公开 URL
 */
export async function uploadToBucket(bucket, path, file) {
  /* 优先走**本站 Worker 中转**：
     国内网络直连 *.supabase.co 常被 RST（ERR_CONNECTION_RESET），浏览器直传必失败；
     而 Worker 在 Cloudflare 侧、出网正常（sign-upload 已验证）。 */
  try {
    const res = await fetch('/api/editor/upload', {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-Bucket': bucket,
        'X-Path': path,
      },
      credentials: 'same-origin',
      body: file,
    });
    if (res.ok) return publicUrl(bucket, path);
    const detail = (await res.text()).slice(0, 200);
    /* 中转被拒（如体积超限）→ 退回签名直传 */
    console.warn('[upload] Worker 中转失败，改走直传:', res.status, detail);
  } catch (e) {
    console.warn('[upload] Worker 中转异常，改走直传:', e && e.message);
  }

  /* 兜底：签名 URL 直传（带重试，网络抖动时有用） */
  const r1 = await fetch('/api/editor/sign-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ bucket: bucket, path: path }),
  });
  if (!r1.ok) throw new Error('签名失败: ' + r1.status + ' ' + (await r1.text()).slice(0, 120));
  const data = await r1.json();
  let lastErr = '';
  for (let i = 0; i < 3; i++) {
    try {
      const put = await fetch(data.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (put.ok) return publicUrl(bucket, path);
      lastErr = 'HTTP ' + put.status + ' ' + (await put.text()).slice(0, 120);
      if (put.status < 500) break;
    } catch (e) { lastErr = (e && e.message) || String(e); }
    await new Promise((r) => setTimeout(r, 700 * (i + 1)));
  }
  throw new Error('上传失败：' + lastErr);
}

/** 生成不易冲突的桶内路径 */
export function makePath(prefix, file) {
  const ext = ((file && file.name) || '').split('.').pop() || 'bin';
  const rnd = Math.random().toString(36).slice(2, 8);
  return prefix + '/' + Date.now() + '-' + rnd + '.' + ext.toLowerCase();
}

/** 删除 Storage 里的对象（走 Worker，用 service_role；仅 owner 可调） */
export async function deleteObject(bucket, path) {
  if (!bucket || !path) return false;
  try {
    const r = await fetch('/api/editor/delete-object', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ bucket: bucket, path: path }),
    });
    return r.ok;
  } catch (e) { return false; }
}
