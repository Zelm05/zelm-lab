<script setup>
/* ==========================================================================
 * GateView.vue —— 欢迎页（落地页）
 *
 * 原状：本文件只放标记，行为全在 src/modules/pages/gate.js（453 行命令式脚本）：
 *   自己读 localStorage 拿主题、自己 applyTheme、自己挂 storage 监听同步主题、
 *   自己写 location.href 跳落地页，外加 3 段 WebGL 特效。
 * 现在：主题只走 settings store（持久化 / 落 DOM / 跨标签页同步都已在那边做掉，
 *   原脚本那三套读写在这里整段消失）；落地页取自站点配置 store；
 *   WebGL 特效是纯视觉，留在 modules/effects 里（与照片墙同一处理）。
 *
 * 与原站逐条对齐：
 *   - 单次放行：点过「游客登陆」就不再重复跳转（verified 标记）
 *   - bfcache：从主站后退回欢迎页时重置放行标记，否则点按钮没反应（原站踩过的坑）
 *   - 落地页：Cookie 里已有配置就直接跳（不必等接口）；缺失才走接口，1.5s 兜底主页
 *   - 动画效果关闭时（<html class="no-anim">）特效照旧初始化，由 CSS 决定显隐 —— 同原站
 *
 * 两处清理（都不是内容）：
 *   ① 原脚本里那段「点头像看大图」（#avatarViewer / #avatarViewerClose）在本页从来没生效过 ——
 *      那三个 id 是主站的元素，#getElementById 恒为 null，整段是死代码，故不再搬。
 *   ② 原脚本给按钮额外挂的 keydown(Space/Enter) 是多余的：<button> 本来就会把
 *      Enter/Space 派发成 click，留着只会触发两次（靠 verified 标记兜住）。
 * ========================================================================== */
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { usePageMeta } from '@/composables/usePageMeta';
import { useSettingsStore } from '@/stores/settings';
import { useSiteCfgStore } from '@/stores/site-cfg';
import { useContentStore } from '@/stores/content';
import { i18n, useI18n } from '@/core/i18n';
import { ZelmSiteCfg } from '@/core/site-cfg';
import { shell } from '@/core/shell';
import { ParticleText } from '@/modules/effects/particle-text';
import { initSpecularButton } from '@/modules/effects/specular-button';
import LanguageSwitcher from '@/components/LanguageSwitcher.vue';

usePageMeta('gate');

const st = useSettingsStore();
const cfg = useSiteCfgStore();
/* 站点头像统一走内容 store（后台「关于我」可换）；未上传时回落到内置图。
   ⚠️ 这里**不**在顶层 ensure：WebGL 扭曲必须等头像就绪（否则拿到静态兜底图），
   所以只在下面 onMounted 里 `await content.ensure('about')` 取一次。
   两处都写的话会并发触发两次请求 —— `loadedFor` 是请求完成之后才置位的，拦不住并发。 */
const content = useContentStore();
const { t } = useI18n('gate');
/* P3-6：头像 alt 走 common 命名空间（跨页面共用文案） */
const { t: tc } = useI18n('common');

/** 主题按钮顺序与原站一致：深色在前 */
const THEMES = computed(() => [
  { v: 'dark', icon: '🌙', title: t('themeDark') },
  { v: 'light', icon: '☀️', title: t('themeLight') },
]);

const warpAvatarEl = ref(null);
const warpBrandEl = ref(null);
const particleEl = ref(null);
const enterBtnEl = ref(null);

/** 单次放行标记 */
const verified = ref(false);
/** 特效卸载器（Vue 卸载时一次性回收） */
const disposers = [];
/** 落地页判断用的一次性 Promise（Cookie 缺失时才用得上） */
let entryProbe = null;

/** 配色方案的 accent 色：让粒子 / 品牌字 / 描边跟随配色（原站行为） */
function accentColor() {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4ff0d0';
  } catch (e) {
    return '#4ff0d0';
  }
}

/** 粒子标题实例的卸载器（切语言时先回收旧的再重建） */
let particleDisposer = null;
/** 生成 / 重建粒子标题（文案随当前语言变化） */
function initParticle(accent) {
  if (!particleEl.value) return;
  if (particleDisposer) { try { particleDisposer(); } catch (e) { /* 忽略 */ } particleDisposer = null; }
  const fx = ParticleText(particleEl.value, {
    text: t('particleTitle'),
    particleSize: 2.5,
    density: 3,
    color: '#ffffff',
    highlightColor: accent,
    scatter: 180,
    gatherDuration: 1600,
    stagger: 420,
    pointerRepel: 40,
    repelRadius: 120,
    idleDrift: 0.7,
    trigger: 'mount',
    fontSize: 'clamp(4rem, 16vw, 6.8rem)',
    fontWeight: 800,
    fontFamily: 'inherit',
    glow: true,
  });
  if (fx && fx.destroy) particleDisposer = fx.destroy;
}

/** 切换语言时重建粒子标题（文案随之变化） */
watch(() => i18n.global.locale.value, () => {
  if (particleEl.value) initParticle(accentColor());
});

/** 从主站后退回来（bfcache）时重置放行标记，保证还能再点进去 */
function onPageShow(e) {
  if (e.persisted) verified.value = false;
}

/**
 * 落地页由站长在管理台「站点设置」里配置：主站（默认）或关于我。
 * Cookie 已下发就直接用（Worker 随 HTML 带给前端），省掉一次接口等待。
 */
function entryTarget() {
  if (ZelmSiteCfg.has()) return Promise.resolve(cfg.entryPage);
  if (!entryProbe) {
    entryProbe = Promise.race([
      cfg.load().then(() => cfg.entryPage),
      new Promise((resolve) => { setTimeout(() => resolve('home'), 1500); }), // 接口超时按默认主页进
    ]);
  }
  return entryProbe;
}

/** 进入站点（原站的 pass()：不再播离场动画，曾有用户反馈动画会卡住） */
async function enter() {
  if (verified.value) return;
  verified.value = true;
  shell.goPage(await entryTarget());
}

onMounted(async () => {
  /* gate 页不做 zoom 缩放 —— 统一由 index.html 的 applyZoom() 按路由判断
   * （gate 路由直接 return，不设 zoom）。这里不再重复处理，避免两处逻辑打架。 */
  window.addEventListener('pageshow', onPageShow);
  await nextTick();
  /* 等头像就绪再初始化 WebGL，否则拿到的是静态兜底图 */
  await content.ensure('about');

  const accent = accentColor();

  /* warp-text 内部**静态** import 了 ogl（128 KB，本项目最大的单个 JS）。
     改成动态加载后，欢迎页（落地页）chunk 不再包含这个 WebGL 库，首屏明显更快；
     加载失败也只是头像/品牌名没有扭曲特效，页面照常可用。 */
  let WarpText = null;
  let WarpImage = null;
  try {
    ({ WarpText, WarpImage } = await import('@/modules/effects/warp-text'));
  } catch (e) { /* 加载失败 → 降级为无扭曲特效 */ }

  /* 头像扭曲 */
  if (warpAvatarEl.value && WarpImage) {
    const fx = WarpImage(warpAvatarEl.value, {
      src: content.avatarUrl,
      fit: 'cover',
      warpStrength: 0.06,
      warpScale: 1.5,
      speed: 0.45,
      pointerInfluence: 0.5,
      pointerStrength: 0.45,
      refraction: 0.02,
      ripple: true,
    });
    if (fx && fx.destroy) disposers.push(fx.destroy);
  }

  /* 品牌名扭曲 */
  if (warpBrandEl.value && WarpText) {
    const fx = WarpText(warpBrandEl.value, {
      text: '◉ Zelm',
      color: accent,
      warpStrength: 0.05,
      warpScale: 1.4,
      speed: 0.4,
      pointerInfluence: 0.55,
      pointerStrength: 0.4,
      refraction: 0.015,
      ripple: true,
      fontSize: '18px',
      fontWeight: 700,
      fontFamily: 'inherit',
      letterSpacing: '1px',
      lineHeight: 1,
    });
    if (fx && fx.destroy) disposers.push(fx.destroy);
  }

  /* 粒子标题（随语言切换重新生成，文案来自 useI18n('gate')） */
  initParticle(accent);

  /* 按钮的 WebGL 高光描边（无 WebGL2 时自动降级，按钮照常可点） */
  /* enterBtnEl 是原生 <button> 元素（initSpecularButton 内部 btn.querySelector('.specular-fx')）。
     保留 $el 兜底写法以兼容历史上曾为 el-button 组件实例的时期。 */
  const specularEl = enterBtnEl.value && (enterBtnEl.value.$el || enterBtnEl.value);
  disposers.push(initSpecularButton(specularEl, { accent }));

  /* 站点配置兜底刷新：Cookie 缺失时补一次，供落地页判断用 */
  if (!ZelmSiteCfg.has()) cfg.load();
});

onUnmounted(() => {
  window.removeEventListener('pageshow', onPageShow);
  /* 离开 gate 页后由 index.html 的 hashchange 监听重算缩放（home 需要缩放版） */
  if (particleDisposer) { try { particleDisposer(); } catch (e) { /* 忽略 */ } particleDisposer = null; }
  disposers.splice(0).forEach((fn) => {
    try { fn(); } catch (e) { console.error('[gate] 特效回收失败', e); }
  });
});
</script>

<template>
  <!-- ===== 欢迎页（游客可直达主站；登录/注册为可选操作） ===== -->
  <div id="gate">
    <h1 class="visually-hidden">{{ t('title') }}</h1>
    <div class="gate-card">
      <div id="warpAvatar" ref="warpAvatarEl" class="gate-avatar warp-avatar">
        <img class="warp-original" :src="content.avatarUrl" :alt="tc('avatarAlt')" />
      </div>
      <div id="warpBrand" ref="warpBrandEl" class="warp-brand" role="img" aria-label="◉ Zelm">
        <span class="warp-original gate-brand-text">◉ Zelm</span>
      </div>
      <div id="particleTitle" ref="particleEl" class="particle-title" :aria-label="t('particleTitle')">
        <canvas class="particle-title__canvas" aria-hidden="true"></canvas>
      </div>
      <div class="gate-divider"></div>
      <div id="captcha" class="captcha">
        <button id="captchaTrack" ref="enterBtnEl" type="button" class="specular-btn" :aria-label="t('enterBtn')" @click="enter">
          <canvas class="specular-fx" aria-hidden="true"></canvas>
          <span class="specular-label">
            <span class="gate-btn-cn">{{ t('enterBtn') }}</span>
          </span>
        </button>
      </div>
      <p class="gate-hint">{{ t('hint') }}</p>
      <div class="gate-controls">
        <div id="gateThemeSeg" class="gate-theme-seg">
          <button
v-for="th in THEMES" :key="th.v" type="button"
            class="gate-theme-btn"
            :class="{ active: st.s.theme === th.v }"
            :data-theme="th.v"
            :title="th.title"
            @click="st.set('theme', th.v)">{{ th.icon }}</button>
        </div>
        <LanguageSwitcher />
      </div>
    </div>
  </div>

  <!-- 背景（欢迎页的星光是空的：原站本页不生成 .star-dot，只有星场底纹，故不套 StarField 组件） -->
  <div class="bg-layer"></div>
  <div class="overlay"></div>
  <div id="starField" class="star-field"></div>
</template>

<!-- 样式原在 src/styles/pages/gate.css，已合并进本组件 -->
<style>
/* 来自 gate.css（合并进组件，未加 scoped —— 保持与原来一致的全局作用域） */
/* 预加载背景色，避免页面跳转时白屏闪烁 */
    html:where([data-page="gate"]) { background-color: #061814; }
    html:where([data-page="gate"])[data-theme="light"] { background-color: #e6f2ea; }
    :where(html[data-page="gate"]) body { background-color: #061814; padding-left: 0; } /* 覆盖主站 style.css 的 190px 侧边占位：欢迎页全屏居中 */
    /* SEO 用 h1：对视觉隐藏，但保留给搜索引擎与读屏软件 */
    :where(html[data-page="gate"]) .visually-hidden {
      position: absolute;
      width: 1px; height: 1px;
      padding: 0; margin: -1px;
      overflow: hidden;
      clip-path: inset(50%);  /* 原 clip:rect(0,0,0,0) 已废弃；现代等价写法（sr-only 隐藏） */
      white-space: nowrap;
      border: 0;
    }

    /* 矮窗口压缩（2026-09-22：用户反馈「gate UI 太长」）。
       gate 豁免 body.zoom，媒体查询按真实视口生效 —— 高度不足时整体收紧，
       卡片由 #gate 的 flex 居中，不会溢出视口。 */
    @media (max-height: 760px) {
      :where(html[data-page="gate"]) .gate-card { padding: 12px 20px; }
      :where(html[data-page="gate"]) .warp-avatar { width: 72px; height: 72px; margin-bottom: 8px; }
      :where(html[data-page="gate"]) .warp-brand { height: 24px; margin-bottom: 8px; }
      :where(html[data-page="gate"]) .particle-title { height: 118px; margin-bottom: 14px; }
      :where(html[data-page="gate"]) .gate-divider { margin: 12px auto; }
      :where(html[data-page="gate"]) .gate-hint { margin-top: 8px; }
      :where(html[data-page="gate"]) .gate-controls { margin-top: 10px; }
      :where(html[data-page="gate"]) .specular-btn { min-height: 44px; }
    }
</style>
