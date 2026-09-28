<script setup>
/* ==========================================================================
 * PdfThumb.vue —— PDF 首页缩略图（2026-09-28）
 *
 * 用途：证书只上传了 PDF（没有封面图）时，在卡片里直接渲染 PDF 第一页当缩略图，
 *   观感与图片证书一致；点击卡片仍走原有的详情弹窗（弹窗内 iframe 看完整 PDF）。
 *
 * 为什么用 pdf.js 而不是浏览器插件式预览：
 *   - Chrome 拒绝在 <iframe> 里展示带 X-Frame-Options 的跨域 PDF（已复现「已阻止」），
 *     即使走同源代理，iframe 方案在部分移动浏览器上也不稳定；
 *   - pdf.js 在自己的 canvas 里逐页绘制，完全不依赖浏览器内置查看器。
 *
 * 性能与缓存（对应需求里的三条硬性要求）：
 *   1) 模块级 Map 缓存：同一份 PDF 只渲染一次，之后直接复用 dataURL；
 *   2) IntersectionObserver 懒加载：卡片进入视口（提前 200px 预取）才开始渲染；
 *   3) scale 自适应：按容器宽度反推缩放比，并封顶，避免大 PDF 内存溢出；
 *      渲染任务持引用，组件卸载即 cancel。
 * ========================================================================== */
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { proxyFileUrl } from '@/core/supabase';
import { useI18n } from '@/core/i18n';

/* pdf.js **按需动态导入**（2026-09-28）：静态 import 会把 ~400KB 的 pdfjs 打进
   AboutView 分包，而 99% 的访问可能一张 PDF 证书都没有。改成首次真正要渲染
   缩略图时才加载（Vite 自动切成独立 chunk），About 页常规加载零开销。 */
let pdfjsMod = null;
async function loadPdfjs() {
  if (pdfjsMod) return pdfjsMod;
  /* ?url 导入让 Vite 把 worker 文件作为带 hash 的资产打包（data URL 内联会太大） */
  const [lib, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  lib.GlobalWorkerOptions.workerSrc = worker.default;
  pdfjsMod = lib;
  return lib;
}

const props = defineProps({
  /** 桶前缀引用（如 `certificate-assets/certs/1/x.pdf`）或旧格式裸路径 */
  asset: { type: String, default: '' },
  /** 旧格式裸路径时的桶（AboutView 传 certificate-assets） */
  bucket: { type: String, default: 'certificate-assets' },
  alt: { type: String, default: '' },
});

const { t } = useI18n('common');
const canvasEl = ref(null);
const state = ref('idle'); /* idle | loading | ok | fail */

/* ---------------- 模块级缓存：key = 桶引用 ---------------- */
const thumbCache = globalThis.__zelmPdfThumbCache instanceof Map
  ? globalThis.__zelmPdfThumbCache
  : (globalThis.__zelmPdfThumbCache = new Map());

let observer = null;
let renderTask = null;
let cancelled = false;

/* 目标位图宽：缩略图场景 300px 足够清晰，也控制内存（A4 300px 宽 ≈ 0.3MP） */
const TARGET_W = 300;
const MAX_SCALE = 2;

async function render() {
  if (state.value === 'ok' || !props.asset || !canvasEl.value) return;
  const url = proxyFileUrl(props.asset, props.bucket);   /* 同源代理 → 无 CORS 问题 */
  if (!url) { state.value = 'fail'; return; }
  const cached = thumbCache.get(props.asset);
  if (cached) { paint(cached); return; }

  state.value = 'loading';
  try {
    const pdfjsLib = await loadPdfjs();
    const doc = await pdfjsLib.getDocument({ url, isEvalSupported: false }).promise;
    if (cancelled) { doc.destroy(); return; }
    const page = await doc.getPage(1);
    if (cancelled) { doc.destroy(); return; }
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(TARGET_W / base.width, MAX_SCALE);
    const viewport = page.getViewport({ scale });
    const canvas = canvasEl.value;
    const ctx = canvas.getContext('2d');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    renderTask = page.render({ canvasContext: ctx, viewport });
    await renderTask.promise;
    renderTask = null;
    /* dataURL 进缓存：下次同卡片（如切语言重挂载）零请求直接贴图 */
    thumbCache.set(props.asset, canvas.toDataURL('image/webp', 0.85));
    doc.destroy();
    state.value = 'ok';
  } catch (e) {
    renderTask = null;
    if (!cancelled) state.value = 'fail';
  }
}

/** 缓存命中时直接把 dataURL 画上去（canvas 尺寸随图片自适应） */
function paint(dataUrl) {
  const img = new Image();
  img.onload = () => {
    const canvas = canvasEl.value;
    if (!canvas) return;
    const scale = Math.min(1, TARGET_W / img.width);
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    state.value = 'ok';
  };
  img.onerror = () => { state.value = 'fail'; };
  img.src = dataUrl;
}

onMounted(() => {
  /* 懒加载：进入视口前 200px 才渲染；不支持 IO 的老浏览器直接渲染 */
  if (typeof IntersectionObserver === 'undefined') { render(); return; }
  observer = new IntersectionObserver((entries) => {
    if (entries.some((en) => en.isIntersecting)) {
      observer.disconnect();
      observer = null;
      render();
    }
  }, { rootMargin: '200px' });
  observer.observe(canvasEl.value);
});

onBeforeUnmount(() => {
  cancelled = true;
  if (observer) observer.disconnect();
  if (renderTask) { try { renderTask.cancel(); } catch (e) { /* 已结束 */ } }
});
</script>

<template>
  <!-- canvas 始终在 DOM（IntersectionObserver 需要观测目标），状态只控制兜底图标 -->
  <span class="pdf-thumb" :data-state="state">
    <canvas ref="canvasEl" class="pdf-thumb-canvas" role="img" :aria-label="alt || t('pdfThumbAria')"></canvas>
    <span v-if="state === 'loading' || state === 'idle'" class="pdf-thumb-badge" aria-hidden="true">📄</span>
    <span v-else-if="state === 'fail'" class="pdf-thumb-badge pdf-thumb-badge--fail" :title="t('pdfThumbFail')" aria-hidden="true">📄</span>
  </span>
</template>

<style>
/* 跟随主题变量；尺寸与 .cert-img 对齐（AboutView 里会再套 cert-img 类统一布局） */
.pdf-thumb { position: relative; display: inline-flex; align-items: center; justify-content: center; overflow: hidden; }
/* 2026-09-28：容器（.cert-img）是 4:3 contain 盒，canvas 双向 max 约束 + auto
   保持原始比例完整落在盒内（竖版 PDF 也不会被裁/溢出） */
.pdf-thumb-canvas { max-width: 100%; max-height: 100%; width: auto; height: auto; display: block; }
.pdf-thumb-badge {
  position: absolute; inset: 0; display: grid; place-items: center;
  font-size: 2rem; color: var(--text-muted, #888);
  background: color-mix(in srgb, var(--surface, #888) 55%, transparent);
}
.pdf-thumb-badge--fail { background: none; }
</style>
