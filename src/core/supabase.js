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

export const SUPABASE_URL = 'https://wrguksjsbdvoqfedsdow.supabase.co';

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
  const res = await fetch('/api/editor/sign-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ bucket: bucket, path: path }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('签名失败: ' + res.status + ' ' + t.slice(0, 120));
  }
  const data = await res.json();
  const put = await fetch(data.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' },
    body: file,
  });
  if (!put.ok) throw new Error('上传失败: ' + put.status + ' ' + (await put.text()).slice(0, 120));
  return publicUrl(bucket, path);
}

/** 生成不易冲突的桶内路径 */
export function makePath(prefix, file) {
  const ext = ((file && file.name) || '').split('.').pop() || 'bin';
  const rnd = Math.random().toString(36).slice(2, 8);
  return prefix + '/' + Date.now() + '-' + rnd + '.' + ext.toLowerCase();
}
