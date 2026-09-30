/* ==========================================================================
 * moment-attachments.js —— 动态附件分类（2026-09-28）
 *
 * 动态（moments）的附件存在 `images` 字段里（JSON 数组，桶引用或裸路径）。
 * 展示层不再贴缩略图，改为正文下方的文字按钮，按钮文案按类型区分：
 *   PDF  → 「查看 PDF」（走同源代理 iframe 预览）
 *   图片 → 「查看图片」（走大图查看器）
 *   其他 → 「查看文件」（新窗口打开，同源代理）
 * 纯函数集中在这里，方便单测（tests/moment-attachments.test.js）。
 * ========================================================================== */

/** 图片扩展名（与上传侧接受的类型一致） */
const IMG_RE = /\.(webp|jpg|jpeg|png|gif)$/i;

/** @param {string} p 附件路径/桶引用 */
export function isImg(p) {
  return IMG_RE.test(String(p || ''));
}

/** @param {string} p 附件路径/桶引用 */
export function isPdf(p) {
  return /\.pdf$/i.test(String(p || ''));
}

/**
 * 附件类型：'pdf' | 'img' | 'file'
 * @param {string} p 附件路径/桶引用
 */
export function fileKind(p) {
  if (isPdf(p)) return 'pdf';
  if (isImg(p)) return 'img';
  return 'file';
}

/** 类型 → i18n key（home 命名空间）：momentsViewPdf / momentsViewImg / momentsViewFile */
export function kindI18nKey(kind) {
  return 'momentsView' + { pdf: 'Pdf', img: 'Img', file: 'File' }[kind];
}

/**
 * PDF → 长图引用（2026-09-30）：发布时把 PDF 渲染成「适合手机竖屏阅读」的一张长 WebP，
 * 命名约定为「同目录同名、扩展名改为 .long.webp」（如 `moments/x.pdf` → `moments/x.long.webp`）。
 * 前端据此直接内嵌长图；若尚未生成（文件名约定不存在），调用方用 @error 隐藏 <img> 回退到下载按钮。
 * @param {string} p 附件桶引用
 * @returns {string} 长图桶引用；非 PDF 返回 ''
 */
export function longImageRef(p) {
  const s = String(p || '');
  return isPdf(s) ? s.replace(/\.pdf$/i, '.long.webp') : '';
}

/**
 * 解析一条动态的附件列表（容错：库里可能存了坏 JSON）
 * @param {{images?: string}} it 动态行
 * @returns {string[]} 附件路径数组
 */
export function attachmentsOf(it) {
  try {
    const arr = JSON.parse((it && it.images) || '[]');
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch (e) {
    return [];
  }
}

/** 取路径末段作为文件名（提示用） */
export function fileNameOf(p) {
  return String(p || '').split('/').pop();
}

/** 按扩展名给一个 emoji 图标（按钮前置装饰） */
export function fileIconOf(p) {
  const ext = String(p || '').split('.').pop().toLowerCase();
  if (ext === 'pdf') return '📕';
  if (['zip', 'rar', '7z'].indexOf(ext) >= 0) return '🗜';
  if (['doc', 'docx'].indexOf(ext) >= 0) return '📘';
  if (['xls', 'xlsx', 'csv'].indexOf(ext) >= 0) return '📗';
  if (['ppt', 'pptx'].indexOf(ext) >= 0) return '📙';
  if (['txt', 'md'].indexOf(ext) >= 0) return '📄';
  if (IMG_RE.test('.' + ext)) return '🖼';
  return '📎';
}
