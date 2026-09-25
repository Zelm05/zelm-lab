/* ==========================================================================
 * image.js —— 上传前的图片压缩（站长上传体验）
 *
 * 目标：把照片压到 **≤300KB**（必要时更小），避免原图几 MB 直传。
 * 做法：createImageBitmap 解码 → canvas 等比缩放（长边 ≤1600）→
 *      逐档降低 webp/jpeg 质量，直到体积达标或到下限。
 * 非图片文件（如 PDF）原样返回。
 * ========================================================================== */

const MAX_EDGE = 1600;          /* 长边上限 */
const QUALITIES = [0.82, 0.72, 0.62, 0.52, 0.42, 0.34];

function toBlob(canvas, type, q) {
  return new Promise((res) => canvas.toBlob(res, type, q));
}

/**
 * @param {File} file 原始文件
 * @param {number} maxBytes 目标体积上限（默认 300KB）
 * @returns {Promise<File>} 压缩后的 File（失败则原样返回）
 */
export async function compressImage(file, maxBytes = 300 * 1024) {
  if (!file || !file.type || file.type.indexOf('image/') !== 0) return file;
  if (file.size <= maxBytes) return file;
  try {
    const bmp = await createImageBitmap(file);
    let w = bmp.width, h = bmp.height;
    const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();

    /* 优先 webp（体积小），退化 jpeg */
    for (const type of ['image/webp', 'image/jpeg']) {
      for (const q of QUALITIES) {
        const blob = await toBlob(cv, type, q);
        if (!blob) continue;
        if (blob.size <= maxBytes || q === QUALITIES[QUALITIES.length - 1]) {
          if (blob.size <= maxBytes) {
            const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + (type === 'image/webp' ? '.webp' : '.jpg');
            return new File([blob], name, { type });
          }
        }
      }
    }
    return file;
  } catch (e) {
    return file;   /* 压缩失败就传原图，不阻断流程 */
  }
}
