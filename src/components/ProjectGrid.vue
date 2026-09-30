<script setup>
/* ==========================================================================
 * ProjectGrid.vue —— 项目作品卡片网格（首页与关于页共用）
 *
 * 为什么抽成组件：首页和关于页都要展示项目作品。原先两边各写一份，已经漂移 ——
 * 关于页少一个项目（shin）、外链硬编码、没有详情弹窗。
 * 现在两页共用本组件 + @/data/projects.js 的唯一数据源，不会再各写各的。
 *
 * ⚠️ 详情弹窗必须 Teleport 到 #overlayRoot，不能直接渲染在本组件模板里。
 *    首页把本组件放在 <main class="container"> 内部，而 .container 带
 *    containerEnter 动画（transform）→ 会成为 position:fixed 的**包含块**，
 *    弹窗会相对容器定位、而不是相对视口。
 *    实测：不 Teleport 时弹窗落在 y=678、高 262 → 底边 940 超出 900 视口，直接看不见。
 *    #overlayRoot 是 App.vue 里 #viewRoot 内的静态宿主，在 .container 之外；
 *    本项目其它弹窗（Games / QuickLinks / Resources）也走它。
 *    千万别图省事改成 Teleport 到 #viewRoot —— 那会让整站白屏（见 REWRITE_PLAN）。
 * ========================================================================== */
import { ref, computed } from 'vue';
import ProjectModal from '@/components/home/ProjectModal.vue';
import { buildProjects } from '@/data/projects';
import { useI18n } from '@/i18n';
import { useContentStore } from '@/stores/content';
import { resolveAssetUrl } from '@/lib/supabase';

defineProps({
  /** 是否在卡片下方渲染「打赏支持」提示。
   *  首页要（donate），关于页不要 —— 用户明确要求 about 页不同步打赏。 */
  donate: { type: Boolean, default: false },
});
const emit = defineEmits(['donate']);

const { t, tList } = useI18n('home');
/* ⚠️ 必须 computed，不能一次性求值（2026-09-25）：
 * 非中文语种的文案来自 src/lang/*.json，setup 顶层同步执行时可能还没就绪，
 * 直接 buildProjects(t) 会拿到 key 字符串（卡片显示 techML 之类），
 * 表现为「首次进关于页项目是乱码/半截，刷新一次才对」。
 * 改成 computed 后随 i18n 就绪/切换自动重算。 */
const staticProjects = computed(() => buildProjects(t));

/* ---------- 动态项目（2026-09-26）：DB 优先、静态兜底 ----------
 * 站长在后台录入多语言项目后（/api/content/projects），这里优先用 DB 的；
 * 数据库为空时仍用 @/data/projects.js 的 3 个静态项目 —— 迁移不会造成内容空窗。
 * 语言切换由 content store 内部处理（watch i18n locale → 重新带 lang 请求）。 */
const content = useContentStore();
content.ensure('projects');

const projects = computed(() => {
  const dbList = content.projects || [];
  if (!dbList.length) return staticProjects.value;
  /* DB 字段：title / summary / detail / slug / link / cover_path；is_fallback 表示回退了语言 */
  return dbList.map((p) => ({
    id: p.slug || String(p.id),
    title: p.title || '',
    summary: p.summary || '',
    full: p.detail || p.summary || '',
    /* 封面与图集都要**解析成公开 URL**：库里存的是「桶前缀引用」(bucket/path)，
       老记录是裸路径 → resolveAssetUrl 自己判断该去哪个桶取。 */
    img: p.cover_path ? resolveAssetUrl(p.cover_path, 'photos') : '',
    images: (p.images || []).map((im) => resolveAssetUrl(im.image_path, 'photos')).filter(Boolean),
    /* 链接：① 外链（GitHub 等，存于 link 字段）；
       ② 下载文件（存于 download_path，桶前缀引用 → 走 project-assets 桶）。
       下载文件与语言无关，DB 优先路径由后台上传到桶后回填；
       静态兜底不再硬编码本地 assets/downloads/（见 src/data/projects.js）。
       按钮文案（2026-09-27 用户要求）：不显示原始网址 / 文件名，
       外链显示「GitHub 项目」、下载按扩展名映射「Windows / Android」。 */
    links: (() => {
      const out = [];
      if (p.link) out.push({ label: linkLabel(p.link), href: p.link, external: true });
      /* 下载文件：download_path 兼容两种形态 ——
         ① JSON 数组（2026-09-27 起，'files' 字段多文件，如 campus 的 APK+EXE）
         ② 单个「桶前缀引用」字符串（早期单文件格式） */
      let refs = [];
      const raw = p.download_path;
      if (raw) {
        try {
          const a = JSON.parse(raw);
          if (Array.isArray(a)) refs = a.filter(Boolean).map(String);
        } catch (e) { /* 非 JSON → 单引用 */ }
        if (!refs.length) refs = [String(raw)];
      }
      /* 先按扩展名生成平台标签，同一平台出现多个文件时再附上文件名区分 */
      const items = refs.map((ref) => {
        const name = ref.split('/').pop();
        return { ref, name, label: downloadLabel(name) };
      });
      const seen = {};
      for (const it of items) seen[it.label] = (seen[it.label] || 0) + 1;
      for (const it of items) {
        out.push({
          label: seen[it.label] > 1 ? it.label + ' · ' + it.name : it.label,
          href: resolveAssetUrl(it.ref, 'project-assets'),
          download: it.name,
        });
      }
      return out;
    })(),
    isFallback: !!p.is_fallback,
  }));
});

/* 外链按钮文案：GitHub 仓库统一显示「GitHub 项目」（长网址铺在按钮上很难看，
   用户 2026-09-27 截图反馈）；其它域名退回显示主机名，未来放非 GitHub 链接也不会整条 URL。 */
function linkLabel(url) {
  try {
    const u = new URL(url);
    if (/(^|\.)github\.com$/i.test(u.hostname)) return t('projectGithub');
    return u.hostname;
  } catch (e) { return t('projectGithub'); }
}
/* 下载按钮文案：按扩展名映射平台 —— apk→Android、exe→Windows、
   其余（bin 表盘 / zip / pdf…）用统一「下载」文案。 */
function downloadLabel(name) {
  const ext = (String(name).split('.').pop() || '').toLowerCase();
  if (ext === 'apk') return t('projectAndroid');
  if (ext === 'exe') return t('projectWindows');
  return t('projectDownload');
}

/* 打赏短语：随机取一条完整句子。
 * ⚠️ 必须用 tList —— t() 对数组型文案只返回键路径字符串，
 *    那样 `arr[随机下标]` 会变成随机单个字符（"o"/"D"/"m"…）。 */
const donateHints = tList('projectsDonateHints');
/* 随机短语固定一次即可（不要每次渲染重摇，否则文案会跳），但仍需在 i18n 就绪后取 */
const donatePhrase = computed(() => (donateHints.length
  ? donateHints[Math.floor(Math.random() * donateHints.length)]
  : ''));

const projectOpen = ref(false);
const activeProject = ref(null);
function openProject(p) {
  activeProject.value = p;
  projectOpen.value = true;
}
</script>

<template>
  <div class="project-grid">
    <!-- 项目卡片：只显示摘要，点击打开详情弹窗 -->
    <div
      v-for="p in projects"
      :key="p.id"
      class="project-card project-card--clickable"
      role="button"
      tabindex="0"
      @click="openProject(p)"
      @keydown.enter.prevent="openProject(p)"
      @keydown.space.prevent="openProject(p)"
    >
      <h3>{{ p.title }}</h3>
      <p>{{ p.summary }}</p>
      <span class="project-card-more">{{ t('visit') }} →</span>
    </div>
  </div>

  <!-- 打赏提示：只在 donate 为真时渲染（关于页不渲染） -->
  <el-button
v-if="donate && donatePhrase" size="small"
    type="text"
    class="projects-donate-hint"
    @click="emit('donate')">{{ donatePhrase }}</el-button>

  <!-- Teleport 到 #overlayRoot：本组件被放在带 transform 的 .container 里，
       不 Teleport 的话 fixed 弹窗会以容器为包含块而跑到视口外（见文件头说明） -->
  <Teleport to="#overlayRoot">
    <ProjectModal :open="projectOpen" :project="activeProject" @close="projectOpen = false" />
  </Teleport>
</template>
