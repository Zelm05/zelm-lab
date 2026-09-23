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
import { ref } from 'vue';
import ProjectModal from '@/components/home/ProjectModal.vue';
import { buildProjects } from '@/data/projects';
import { useI18n } from '@/core/i18n';

defineProps({
  /** 是否在卡片下方渲染「打赏支持」提示。
   *  首页要（donate），关于页不要 —— 用户明确要求 about 页不同步打赏。 */
  donate: { type: Boolean, default: false },
});
const emit = defineEmits(['donate']);

const { t, tList } = useI18n('home');
const projects = buildProjects(t);

/* 打赏短语：随机取一条完整句子。
 * ⚠️ 必须用 tList —— t() 对数组型文案只返回键路径字符串，
 *    那样 `arr[随机下标]` 会变成随机单个字符（"o"/"D"/"m"…）。 */
const donateHints = tList('projectsDonateHints');
const donatePhrase = donateHints.length
  ? donateHints[Math.floor(Math.random() * donateHints.length)]
  : '';

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
