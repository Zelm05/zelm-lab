/* ==========================================================================
 * useResumePreview.js —— 「关于我」页简历在线预览
 *
 * 从 AboutView.vue 抽出来（原第 215–247 行）。
 *
 * 两个必须记住的坑（原注释完整保留）：
 *   ⚠️ iframe 的 src **必须走同源代理**（proxyFileUrl）——直接用 Supabase URL
 *      会被其 `X-Frame-Options: DENY` 拦成「已阻止此内容」，且跨域 <a download>
 *      属性失效（点下载变成打开新标签页）。代理响应为同源 + inline，浏览器
 *      原生查看器直接渲染。
 *   ⚠️ 手机端（≤640px）点「查看 PDF」不弹窗，直接新开一个单独的 PDF 网页 ——
 *      手机浏览器原生查看/下载，避免 iframe 白屏 + 二次点击；桌面端保持
 *      iframe 弹窗不变。
 *
 * resumeOvEl 由调用方传入：`ref="resumeOvEl"` 写在视图模板里，模板 ref 只在
 *   持有该模板的组件里被填充（原因见 useAboutPhotoWall.js 头部）。
 * ========================================================================== */
import { ref, computed } from 'vue';
import { useContentStore } from '@/stores/content';
import { useDialog } from '@/composables/useDialog';
import { proxyFileUrl } from '@/lib/supabase';
import { isMobileViewport } from '@/core/viewport';

/**
 * @param {import('vue').Ref<HTMLElement|null>} resumeOvEl 弹窗面板（模板 ref）
 */
export function useResumePreview(resumeOvEl) {
  const content = useContentStore();

  /* 简历：数据来自内容 store（/api/content/resume），文件在 Supabase */
  const resumeItem = ref(null);

  async function loadResume() {
    await content.ensure('resume');
    resumeItem.value = content.resume || null;
  }

  const resumeUrl = computed(() => (resumeItem.value ? proxyFileUrl(resumeItem.value.storage_path, 'resume') : ''));
  /* 下载：同源 + dl=1（响应带 attachment）+ download 属性双保险；文件名优先用后台填的版本名 */
  const resumeDlUrl = computed(() => (resumeItem.value
    ? proxyFileUrl(resumeItem.value.storage_path, 'resume', {
      download: true,
      name: ((resumeItem.value.version ? String(resumeItem.value.version) : '') || '').replace(/\.pdf$/i, '') || undefined,
    })
    : ''));

  const resumePreviewOpen = ref(false);

  function openResumePreview() {
    if (isMobileViewport() && resumeUrl.value) {
      window.open(resumeUrl.value, '_blank', 'noopener');
      return;
    }
    resumePreviewOpen.value = true;
  }
  function closeResumePreview() { resumePreviewOpen.value = false; }

  /* Esc 关闭 + 焦点归还（与本站其它弹层同一套无障碍行为） */
  useDialog(() => resumePreviewOpen.value, { onClose: closeResumePreview, panelRef: resumeOvEl });

  return {
    resumeItem, resumeUrl, resumeDlUrl,
    resumePreviewOpen, openResumePreview, closeResumePreview, loadResume,
  };
}
