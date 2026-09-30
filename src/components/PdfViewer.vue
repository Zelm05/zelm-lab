<script setup>
/**
 * PdfViewer.vue —— 移动端 PDF 预览组件（Vue3 + Vite + Composition API）
 *
 * 特性：
 *  1. 全屏深色模态框，z-index 9999，覆盖底部悬浮按钮。
 *  2. pdf.js（pdfjs-dist v4）通过 Canvas 渲染，宽度自适应（无横向滚动）。
 *  3. 多页纵向滚动 + 懒加载（进入视口才渲染，避免一次性渲染全部页导致内存暴涨）。
 *  4. 顶部固定「关闭 / 页码 / 总页数 / Loading」。
 *  5. 双指缩放（Pinch to Zoom），缩放后重新渲染以保证清晰（非 CSS 模糊放大）。
 *  6. 打开时锁定底层页面滚动（防滚动穿透）。
 *  7. 关闭时销毁 pdfDoc、取消进行中的渲染任务、释放内存。
 *
 * 依赖安装（推荐，Vite 下最省心）：
 *   npm i pdfjs-dist@4
 * （CDN 方案见文件底部「CDN 备选」注释，不推荐在 Vite 工程里混用）
 */

import { ref, shallowRef, onMounted, onBeforeUnmount, watch } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
// Vite 专用：把 worker 文件当作静态资源引入，自动得到带 hash 的 URL，
// 规避「workerSrc 路径不对 / 跨域」这类最常见报错。
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// 告诉 pdf.js 用哪个 worker 文件。必须在 getDocument 之前设置一次。
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// ===== Props / Emits =====
const props = defineProps({
  // PDF 地址：同源路径（如 /files/resume.pdf）最稳；跨域需服务端开 CORS（见文末说明）
  src: { type: String, required: true },
  // 是否可见，支持 v-model:visible
  visible: { type: Boolean, default: false },
  // 顶部标题（可选）
  title: { type: String, default: 'PDF 预览' },
  // Teleport 目标：站点有 transform 包含块，全屏弹窗必须 Teleport 到 #overlayRoot（或 body）才真全屏
  teleportTo: { type: String, default: '#overlayRoot' },
})
const emit = defineEmits(['update:visible'])

// ===== 响应式状态 =====
const loading = ref(true)
const currentPage = ref(0)      // 当前可见页（用于「x / y」显示）
const totalPages = ref(0)
const pageZoom = ref(1)         // 用户双指缩放倍数（1 = 适配宽度）
const liveZoom = ref(1)         // 捏合过程中实时倍数（仅用于提示，松手后才真正重渲染）

// DOM 引用
const scrollEl = ref(null)      // 滚动容器
const pagesWrap = ref(null)     // 页面列表容器（用于 ResizeObserver 重算宽度）

// pdf.js 核心对象（用 shallowRef，避免 Vue 深度代理巨型对象）
const pdfDoc = shallowRef(null)
const renderTasks = new Map()   // pageNumber -> RenderTask，便于取消
const rendered = new Map()      // pageNumber -> boolean，已渲染过的页不再重复渲染
let observer = null             // IntersectionObserver 懒加载

// 每个页面的「占位 + canvas」由模板 v-for 生成，这里只存容器 ref
const pageEls = ref([])         // 与总页数等长的数组，存放每页的 <div class="pdf-page">

// ============================================================
// 打开 / 关闭
// ============================================================
function close() {
  cleanup()                     // 释放资源
  emit('update:visible', false)
}

// 关闭时彻底释放：取消渲染任务、销毁文档、断开观察器、恢复底层滚动
function cleanup() {
  renderTasks.forEach((t) => { try { t.cancel() } catch { /* 忽略取消异常 */ } })
  renderTasks.clear()
  rendered.clear()
  if (observer) { observer.disconnect(); observer = null }
  if (pdfDoc.value) { pdfDoc.value.destroy().catch(() => {}); pdfDoc.value = null }
  document.body.style.overflow = ''   // 恢复底层页面滚动
  loading.value = true
  currentPage.value = 0
  totalPages.value = 0
  pageZoom.value = 1
  liveZoom.value = 1
}

// ============================================================
// 加载文档
// ============================================================
async function loadPdf() {
  cleanup()                     // 先清掉上一次的状态
  loading.value = true
  document.body.style.overflow = 'hidden'  // 锁底层滚动，防穿透

  try {
    // withCredentials: 若 PDF 需要登录态 cookie，设 true；否则保持 false 减少 CORS 复杂度
    pdfDoc.value = await pdfjsLib.getDocument({ url: props.src, withCredentials: false }).promise
    totalPages.value = pdfDoc.value.numPages

    // 生成与页数等长、用于挂载 canvas 的占位数组
    pageEls.value = Array.from({ length: totalPages.value }, () => null)

    // 等 DOM 渲染出占位后，启动懒加载观察器
    await nextTickSafe()
    setupLazyLoader()
    loading.value = false
  } catch (err) {
    console.error('[PdfViewer] 加载失败：', err)
    loading.value = false
    // 常见失败：CORS / 404 / worker 路径错误。详见文末「CORS 排查」。
    alert('PDF 加载失败，请检查地址或跨域设置（详见控制台）。')
    close()
  }
}

// 极简 nextTick（不依赖 Vue 调度，确保占位 div 已进 DOM）
function nextTickSafe() {
  return new Promise((r) => requestAnimationFrame(() => r()))
}

// ============================================================
// 懒加载：页面进入视口才渲染
// ============================================================
function setupLazyLoader() {
  observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const num = Number(entry.target.dataset.page)
        renderPage(num)            // 进入视口 → 渲染
        // 用「当前滚动中心附近」的页更新页码显示
        const rect = entry.target.getBoundingClientRect()
        if (rect.top < window.innerHeight / 2 && rect.bottom > 0) currentPage.value = num
      }
    })
  }, { root: scrollEl.value, rootMargin: '200px 0px' })  // 提前 200px 预渲染，滑动更顺

  pageEls.value.forEach((el) => {
    if (el) observer.observe(el)
  })
}

// ============================================================
// 渲染单页
// ============================================================
async function renderPage(num) {
  if (!pdfDoc.value || rendered.get(num)) return
  const el = pageEls.value[num - 1]
  if (!el) return

  const canvas = el.querySelector('canvas')
  const ctx = canvas.getContext('2d')

  // 取消该页已有渲染任务（防止快速滚动时叠加）
  if (renderTasks.get(num)) { try { renderTasks.get(num).cancel() } catch { /* 忽略取消异常 */ } }

  try {
    const page = await pdfDoc.value.getPage(num)
    const base = page.getViewport({ scale: 1 })              // scale=1 时的原始尺寸
    const containerW = pagesWrap.value?.clientWidth || window.innerWidth
    const dpr = window.devicePixelRatio || 1
    // 适配宽度：CSS 显示宽度 = 容器宽；Canvas 按 dpr 放大保证高清
    const fitScale = containerW / base.width
    const finalScale = fitScale * pageZoom.value            // 叠加用户缩放
    const viewport = page.getViewport({ scale: finalScale * dpr })

    canvas.width = viewport.width
    canvas.height = viewport.height
    canvas.style.width = base.width * finalScale + 'px'      // 视觉宽度 = 适配宽度 × 缩放
    canvas.style.height = base.height * finalScale + 'px'

    const task = page.render({ canvasContext: ctx, viewport })
    renderTasks.set(num, task)
    await task.promise
    rendered.set(num, true)
    renderTasks.delete(num)
  } catch (err) {
    if (err?.name !== 'RenderingCancelledException') console.error('[PdfViewer] 渲染失败：', err)
  }
}

// 窗口 / 容器尺寸变化时，按新宽度重渲染已渲染过的页（保持自适应）
function refitAll() {
  rendered.forEach((_, num) => {
    rendered.delete(num)
    renderPage(num)
  })
}

// ============================================================
// 双指缩放（Pinch to Zoom）
// 思路：捏合过程中只更新 liveZoom 提示；松手后才把 pageZoom 写回并重新渲染，
//       避免每帧重渲染 canvas 造成卡顿。重渲染后依旧清晰（非 CSS 模糊）。
// ============================================================
let pinchStartDist = 0
let pinchStartZoom = 1

function getDist(touch1, touch2) {
  return Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY)
}

function onTouchStart(e) {
  if (e.touches.length === 2) {
    pinchStartDist = getDist(e.touches[0], e.touches[1])
    pinchStartZoom = pageZoom.value
    liveZoom.value = pageZoom.value
  }
}
function onTouchMove(e) {
  if (e.touches.length === 2) {
    e.preventDefault()  // 阻止浏览器默认双指缩放整页
    const dist = getDist(e.touches[0], e.touches[1])
    const ratio = dist / (pinchStartDist || dist)
    liveZoom.value = Math.min(3, Math.max(1, +(pinchStartZoom * ratio).toFixed(2)))
  }
}
function onTouchEnd(e) {
  if (e.touches.length < 2 && liveZoom.value !== pageZoom.value) {
    pageZoom.value = liveZoom.value
    refitAll()          // 真正重渲染，应用新缩放
  }
}

// ============================================================
// 生命周期 & 监听
// ============================================================
// 容器宽度变化（旋转屏幕 / 缩放窗口）时重算
let resizeObs = null
onMounted(() => {
  if (pagesWrap.value) {
    resizeObs = new ResizeObserver(() => refitAll())
    resizeObs.observe(pagesWrap.value)
  }
})
onBeforeUnmount(() => {
  cleanup()
  if (resizeObs) resizeObs.disconnect()
})

// visible 变 true 时加载；变 false 时清理
watch(() => props.visible, (v) => {
  if (v) loadPdf()
  else cleanup()
}, { immediate: false })
</script>

<template>
  <!-- Teleport 到站点全局遮罩层：脱离祖先 transform 包含块，确保 position:fixed 真正全屏 -->
  <Teleport :to="teleportTo">
    <!-- 全屏遮罩：固定定位 + 9999，深色背景，覆盖底部悬浮按钮 -->
    <div
      v-if="visible"
      class="pdf-mask"
      @click.self="close"
    >
    <!-- 顶部固定工具条 -->
    <div class="pdf-bar">
      <button class="pdf-close" aria-label="关闭" @click="close">✕</button>
      <div class="pdf-title">{{ title }}</div>
      <div class="pdf-count">
        <template v-if="totalPages">{{ currentPage || 1 }} / {{ totalPages }}</template>
        <span v-if="liveZoom !== 1" class="pdf-zoom-tag">{{ liveZoom }}×</span>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="pdf-loading">
      <div class="pdf-spinner"></div>
      <span>加载中…</span>
    </div>

    <!-- 滚动区：touch-action: pan-y 让单指纵向滚动原生生效，双指交给我们处理 -->
    <div
      ref="scrollEl"
      class="pdf-scroll"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
    >
      <div ref="pagesWrap" class="pdf-pages">
        <!-- 每页一个占位：懒加载观察器挂载在这里 -->
        <div
          v-for="(el, i) in pageEls"
          :key="i"
          :ref="(node) => { pageEls[i] = node }"
          class="pdf-page"
          :data-page="i + 1"
        >
          <canvas></canvas>
        </div>
      </div>
    </div>
  </div>
  </Teleport>
</template>

<style scoped>
/* 全屏遮罩：足够高的 z-index，覆盖底部 FAB */
.pdf-mask {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: #0d1b17;            /* 深色背景（深绿黑），可按主题改 */
  display: flex;
  flex-direction: column;
  /* 防滚动穿透：遮罩自身接管滚动 */
  overscroll-behavior: contain;
}

/* 顶部固定条 */
.pdf-bar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: rgba(13, 27, 23, 0.92);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid rgba(45, 212, 191, 0.25); /* 青绿点缀 */
  color: #e6fffb;
}
.pdf-close {
  width: 36px; height: 36px;
  border: none; border-radius: 50%;
  background: rgba(45, 212, 191, 0.15);
  color: #2dd4bf;                /* 青绿色主色调 */
  font-size: 18px; cursor: pointer;
  display: grid; place-items: center;
}
.pdf-close:active { background: rgba(45, 212, 191, 0.3); }
.pdf-title { flex: 1 1 auto; font-size: 15px; font-weight: 600; }
.pdf-count { font-size: 13px; color: #9fb8b2; display: flex; align-items: center; gap: 8px; }
.pdf-zoom-tag {
  padding: 2px 6px; border-radius: 6px;
  background: rgba(45, 212, 191, 0.2); color: #2dd4bf;
}

/* Loading */
.pdf-loading {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px; color: #9fb8b2; font-size: 14px;
}
.pdf-spinner {
  width: 34px; height: 34px;
  border: 3px solid rgba(45, 212, 191, 0.25);
  border-top-color: #2dd4bf;
  border-radius: 50%;
  animation: pdf-spin 0.8s linear infinite;
}
@keyframes pdf-spin { to { transform: rotate(360deg); } }

/* 滚动区：单指纵向滚动原生生效（pan-y），双指交给 JS */
.pdf-scroll {
  flex: 1 1 auto;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
}
.pdf-pages {
  padding: 12px 0 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
/* 每页「卡片」悬浮感：白底 + 阴影，深色背景衬托 */
.pdf-page {
  background: #fff;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
  border-radius: 4px;
  overflow: hidden;
  line-height: 0;                /* 去掉 canvas 底部空隙 */
}
.pdf-page canvas { display: block; }
</style>

<!--
============================================================
CDN 备选（不推荐在 Vite 工程里用，仅供纯 HTML / 非构建场景参考）
============================================================
若你不用 npm，可改用 PDF.js v3 的 UMD 版本（脚本标签最简单）：
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"></script>
  然后：pdfjsLib.GlobalWorkerOptions.workerSrc = '.../pdf.worker.min.js'
注意：v4 起官方主推 ESM（.mjs），UMD 只到 v3.x；本组件用的是 v4 + Vite ?url 方式，
是最稳的组合，强烈建议走 npm 安装而不是 CDN。
-->
