/* ==========================================================================
 * useCertDetail.js —— 「关于我」页证书详情弹窗
 *
 * 从 AboutView.vue 抽出来（原第 249–273 行）。
 *
 * 保留的原有行为：
 *   · 点击证书卡查看大图 + 全部字段；图片点击在「适应窗口 / 放大原始尺寸」间
 *     切换（移动端友好：放大会出横向滚动）。
 *   · PDF 证书（2026-09-28）：详情弹窗内直接 iframe 内嵌完整 PDF（同源代理），
 *     不再只给一个外链 —— 原生查看器可缩放/翻页；另给下载按钮。
 *   · 手机端 + 纯 PDF 证书（无图片）：点卡片直接新开单独 PDF 网页，不弹详情弹窗；
 *     图片证书仍走弹窗（移动端看图体验正常）。桌面端一律保持详情弹窗不变。
 *
 * certOvEl 由调用方传入：`ref="certOvEl"` 写在视图模板里，模板 ref 只在
 *   持有该模板的组件里被填充（原因见 useAboutPhotoWall.js 头部）。
 * ========================================================================== */
import { ref, computed } from 'vue';
import { useDialog } from '@/composables/useDialog';
import { resolveAssetUrl, proxyFileUrl } from '@/lib/supabase';
import { isMobileViewport } from '@/core/viewport';

/**
 * @param {import('vue').Ref<HTMLElement|null>} certOvEl 弹窗面板（模板 ref）
 */
export function useCertDetail(certOvEl) {
  const certDetail = ref(null);          /* 当前查看的证书行 */
  const certZoomed = ref(false);

  function openCert(c) {
    /* 手机端 + 纯 PDF 证书（无图片）：点卡片直接新开单独 PDF 网页，不弹详情弹窗；
       图片证书仍走弹窗（移动端看图体验正常）。桌面端一律保持详情弹窗不变。 */
    if (isMobileViewport() && c.pdf_path && !c.image_path) {
      window.open(proxyFileUrl(c.pdf_path, 'certificate-assets'), '_blank', 'noopener');
      return;
    }
    certDetail.value = c; certZoomed.value = false;
  }
  function closeCert() { certDetail.value = null; certZoomed.value = false; }

  const certDetailImgUrl = computed(() => ((certDetail.value && certDetail.value.image_path)
    ? resolveAssetUrl(certDetail.value.image_path, 'certificate-assets') : ''));
  /* 证书 PDF 的同源内嵌 / 下载地址（无 pdf_path 时为空串） */
  const certPdfUrl = computed(() => ((certDetail.value && certDetail.value.pdf_path)
    ? proxyFileUrl(certDetail.value.pdf_path, 'certificate-assets') : ''));
  const certPdfDlUrl = computed(() => ((certDetail.value && certDetail.value.pdf_path)
    ? proxyFileUrl(certDetail.value.pdf_path, 'certificate-assets', { download: true }) : ''));

  /* Esc 关闭 + 焦点归还 */
  useDialog(() => !!certDetail.value, { onClose: closeCert, panelRef: certOvEl });

  return { certDetail, certZoomed, openCert, closeCert, certDetailImgUrl, certPdfUrl, certPdfDlUrl };
}
