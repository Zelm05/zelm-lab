<script setup>
/* ==========================================================================
 * ParticleBg.vue —— 简约粒子背景（设置面板里的「背景效果 → ✨ 粒子」）
 *
 * 原状：src/modules/pages/home.js 的 startParticles / setBackgroundFx，
 *   canvas 与 rAF 都挂在页面级 __tear 上，靠整页卸载回收。
 * 现在：canvas 是组件的一部分，rAF 与 resize 在组件卸载时收掉；
 *   开 / 关由设置 store 的 backgroundFx 直接驱动（不再有 setBackgroundFx 这层）。
 *
 * 绘制逻辑逐行照搬：42 个点、0.35 的上限速度、边界环绕、0.5 不透明度的点、
 *   0.08 不透明度的连线（距离平方 < 10000 才连）。强调色只在启动时取一次。
 * ========================================================================== */
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { prefersReducedMotion, onReducedMotionChange } from '@/core/motion';

const st = useSettingsStore();
const canvasEl = ref(null);

const N = 42;
let rafId = null;
let W = 0;
let H = 0;
let dots = [];
let ctx = null;

function resize() {
  if (!canvasEl.value) return;
  W = canvasEl.value.width = window.innerWidth;
  H = canvasEl.value.height = window.innerHeight;
}
function init() {
  resize();
  dots = [];
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4ff0d0';
  for (let i = 0; i < N; i++) {
    dots.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 2 + 0.6,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      c: accent,
    });
  }
}
/* 只负责「把当前 dots 画出来」，**不推进位置** —— 这样减少动态效果时可以直接复用，
   画一帧静态画面即可。 */
function paint() {
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  ctx.globalAlpha = 0.5;
  for (const d of dots) {
    ctx.fillStyle = d.c;
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = dots[0].c;
  ctx.lineWidth = 1;
  for (let i = 0; i < dots.length; i++) {
    for (let j = i + 1; j < dots.length; j++) {
      const dx = dots[i].x - dots[j].x;
      const dy = dots[i].y - dots[j].y;
      if (dx * dx + dy * dy < 10000) {
        ctx.beginPath(); ctx.moveTo(dots[i].x, dots[i].y); ctx.lineTo(dots[j].x, dots[j].y); ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
}

function frame() {
  if (!ctx) return;
  for (const d of dots) {
    d.x += d.vx; d.y += d.vy;
    if (d.x < 0) d.x = W;
    if (d.x > W) d.x = 0;
    if (d.y < 0) d.y = H;
    if (d.y > H) d.y = 0;
  }
  paint();
  rafId = requestAnimationFrame(frame);
}

function start() {
  if (!canvasEl.value || rafId) return;
  ctx = canvasEl.value.getContext('2d');
  if (!ctx) return;
  resize();
  init();
  /* 无障碍（WCAG 2.3.3）：偏好「减少动态效果」时**不启动 rAF 循环**，只画一帧静态画面
     —— 粒子照旧铺满，只是不再漂移。CSS 那条全局兜底管不到 canvas 里的循环。 */
  if (prefersReducedMotion()) { paint(); return; }
  rafId = requestAnimationFrame(frame);
}
function stop() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
}
function sync(on) {
  if (on) start();
  else stop();
}

/* resize 时若处于「静态帧」模式（没有 rAF 循环在跑），得手动补画一次，
   否则画布被重置后是空白的。 */
function onResize() {
  resize();
  if (!rafId && ctx) paint();
}
/* 系统偏好实时变化 → 重启一次：开 = 停循环画静帧，关 = 恢复循环 */
let offMotionWatch = null;

watch(() => st.s.backgroundFx, sync);
onMounted(() => {
  window.addEventListener('resize', onResize);
  sync(!!st.s.backgroundFx);
  offMotionWatch = onReducedMotionChange(() => { stop(); if (st.s.backgroundFx) start(); });
});
onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  if (offMotionWatch) { offMotionWatch(); offMotionWatch = null; }
  stop();
});
</script>

<template>
  <canvas id="particleCanvas" ref="canvasEl" :hidden="!st.s.backgroundFx" aria-hidden="true"></canvas>
</template>
