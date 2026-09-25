<script setup>
/* ==========================================================================
 * ProjectModal.vue —— 项目作品详情弹窗
 *
 * 卡片只展示「标题 + 摘要」；点击卡片打开本弹窗，里面显示完整介绍与
 * 下载 / 外链按钮。放在 HomeView 模板中 </main> 之后（与 DonateModal 同级），
 * 避免被 .container 的 containerEnter 动画 transform 当成 fixed 包含块。
 * ========================================================================== */
import { computed, watch, onBeforeUnmount } from 'vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  project: { type: Object, default: null },
});
const emit = defineEmits(['close']);

/* el-dialog 用 v-model，而本组件对外是 props.open + emit('close')。
 * 这个 computed 把两者桥接起来：读 props.open，写回 emit('close')。 */
const openModel = computed({
  get: () => props.open,
  set: (v) => { if (!v) emit('close'); },
});

function close() { emit('close'); }
function onKey(e) { if (e.key === 'Escape') close(); }

watch(() => props.open, (v) => {
  if (v) {
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
  } else {
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    window.removeEventListener('keydown', onKey);
  }
});
onBeforeUnmount(() => {
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
  window.removeEventListener('keydown', onKey);
});
</script>

<template>
  <!-- 项目详情弹窗（原 .project-modal-overlay → el-dialog） -->
  <el-dialog
    id="projectModal"
    v-model="openModel"
    :title="project?.title"
    width="min(760px, 92vw)"
    align-center
  >
    <div class="project-modal-layout">
      <div v-if="project?.img" class="project-modal-media">
        <img class="project-modal-img" :src="project.img" :alt="project.title" />
      </div>
      <div class="project-modal-main">
        <p class="project-modal-body">{{ project?.full }}</p>
        <div class="project-modal-links">
          <el-button
            v-for="l in (project?.links || [])"
            :key="l.label"
            tag="a"
            size="small"
            :type="l.ghost ? 'default' : 'primary'"
            :href="l.href"
            :download="l.download || null"
            :target="l.external ? '_blank' : null"
            rel="noopener noreferrer"
          >{{ l.label }}</el-button>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
/* 不换行：flex-wrap:wrap 会让右侧图片在空间不足时换行到下一行（看起来像堆叠） */
.project-modal-layout { display: block; }   /* 用 float 让文字绕排图片，避免文字列过窄 */
.project-modal-main { flex: 1 1 300px; }
.project-modal-body { white-space: pre-wrap; line-height: 1.75; color: var(--text); margin: 0 0 14px; }
.project-modal-links { display: flex; flex-wrap: wrap; gap: 8px; }
.project-modal-media { flex: 0 0 220px; }
.project-modal-img { width: 100%; border-radius: 10px; border: 1px solid var(--border); }
@media (max-width: 640px) {
  .project-modal-media { flex: 1 1 100%; }
}
</style>
