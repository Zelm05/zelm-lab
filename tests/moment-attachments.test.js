/* vitest API 走 globals（describe/it/expect 由 worker bootstrap 注入）。
   覆盖 2026-09-28 动态附件改造：缩略图 → 类型化文字按钮的分类逻辑。 */
import {
  isImg, isPdf, fileKind, kindI18nKey, attachmentsOf, fileNameOf, fileIconOf,
} from '@/core/moment-attachments';

describe('动态附件分类（moment-attachments）', () => {
  it('isImg：常见图片扩展名命中，大小写不敏感，目录里的 .pdf 不误判', () => {
    expect(isImg('moments/a.webp')).toBe(true);
    expect(isImg('moments/b.JPG')).toBe(true);
    expect(isImg('moments/c.jpeg')).toBe(true);
    expect(isImg('moments/d.png')).toBe(true);
    expect(isImg('moments/e.gif')).toBe(true);
    expect(isImg('moments/report.pdf')).toBe(false);
    expect(isImg('')).toBe(false);
    expect(isImg(null)).toBe(false);
  });

  it('isPdf：.pdf 命中（大小写不敏感）', () => {
    expect(isPdf('moments/cv-2026.pdf')).toBe(true);
    expect(isPdf('moments/CV.PDF')).toBe(true);
    expect(isPdf('moments/photo.jpg')).toBe(false);
  });

  it('fileKind：pdf / img / file 三分类', () => {
    expect(fileKind('moments/a.pdf')).toBe('pdf');
    expect(fileKind('moments/a.png')).toBe('img');
    expect(fileKind('moments/a.zip')).toBe('file');
    expect(fileKind('moments/a.docx')).toBe('file');
  });

  it('kindI18nKey：类型 → home 命名空间的 i18n key', () => {
    expect(kindI18nKey('pdf')).toBe('momentsViewPdf');
    expect(kindI18nKey('img')).toBe('momentsViewImg');
    expect(kindI18nKey('file')).toBe('momentsViewFile');
  });

  it('attachmentsOf：正常 JSON / 坏 JSON / 空值都安全返回数组', () => {
    expect(attachmentsOf({ images: '["moments/a.pdf","moments/b.webp"]' }))
      .toEqual(['moments/a.pdf', 'moments/b.webp']);
    expect(attachmentsOf({ images: '{bad json' })).toEqual([]);
    expect(attachmentsOf({})).toEqual([]);
    expect(attachmentsOf(null)).toEqual([]);
    expect(attachmentsOf({ images: '"just-a-string"' })).toEqual([]);
  });

  it('fileNameOf：取路径末段', () => {
    expect(fileNameOf('moments/2026/报告.pdf')).toBe('报告.pdf');
    expect(fileNameOf('a.pdf')).toBe('a.pdf');
    expect(fileNameOf('')).toBe('');
  });

  it('fileIconOf：按扩展名给图标，未知类型兜底 📎', () => {
    expect(fileIconOf('moments/a.pdf')).toBe('📕');
    expect(fileIconOf('moments/a.png')).toBe('🖼');
    expect(fileIconOf('moments/a.docx')).toBe('📘');
    expect(fileIconOf('moments/a.bin')).toBe('📎');
  });
});
