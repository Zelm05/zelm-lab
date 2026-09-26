<script setup>
/* ==========================================================================
 * ContentManageDialog.vue —— 前台「管理XX」的就地内容管理弹层
 *
 * 为什么存在：站长点前台页面的「管理」按钮后，不再跳转 /admin 控制台，
 * 而是在当前页弹出后台内容面板。仍然复用唯一的 ContentPanel
 * （「只有一套编辑器」的架构原则不变，只是换了个呈现位置）。
 *
 * 挂载点：App.vue 常驻（与 AuthPanel / ConfirmDialog 同级）；
 * 内部 Teleport 到 #overlayRoot（⛔ 不能用 #viewRoot，会白屏）。
 *
 * ⚠️ z-index 900 必须低于 zconfirm-overlay 的 1000：
 *    面板里的删除确认（zelmConfirm）要压在本弹层之上。
 * ========================================================================== */
import { ref, watch } from 'vue';
import ContentPanel from './admin/ContentPanel.vue';
import { useI18n } from '@/core/i18n';
import { useContentStore } from '@/stores/content';
import { useDialog } from '@/composables/useDialog';
import { useManageDialog } from '@/composables/useManageDialog';

const { state, closeManage } = useManageDialog();
const content = useContentStore();
const { t } = useI18n('admin');
const { t: tc } = useI18n('common');

const panelEl = ref(null);
useDialog(() => state.open, { onClose: closeManage, panelRef: panelEl });

/* 打开时把 store 的 adminModule 指到目标模块 —— ContentPanel 在 setup 里
 * 读取它（activeMod = ref(content.adminModule)）作为初始 tab。
 * Vue 的 watcher 默认在渲染前执行，保证挂载时读到的是本次点击的模块。 */
watch(() => state.open, (open) => {
  if (open) content.openAdmin(state.mod);
});
</script>

<template>
  <Teleport to="#overlayRoot">
    <div v-if="state.open" class="cm-overlay" @click.self="closeManage()">
      <div ref="panelEl" class="cm-panel" role="dialog" aria-modal="true" :aria-label="t('cfTitle')">
        <button type="button" class="cm-close" :aria-label="tc('cClose')" @click="closeManage()">✕</button>
        <!-- lock-module：点「管理照片」就只看到照片的编辑界面（各区块专属管理窗口） -->
        <ContentPanel :lock-module="state.mod" />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 视觉沿用站点弹窗语言（AuthPanel / apw-overlay 的深色玻璃面板） */
.cm-overlay {
  position: fixed; inset: 0; z-index: 900;
  overflow-y: auto; padding: 4vh 16px;
  background: rgba(2, 8, 6, .55);
  backdrop-filter: blur(8px) brightness(.55) saturate(120%); -webkit-backdrop-filter: blur(8px) brightness(.55) saturate(120%);
  animation: cmFade .22s ease;
}
.cm-panel {
  position: relative; width: min(960px, 94vw); margin: 0 auto;
  padding: 20px; border-radius: 20px; color: #e9edf6;
  background: rgba(13, 24, 19, .95);
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  box-shadow: 0 20px 60px rgba(0, 0, 0, .5);
  animation: cmPop .28s cubic-bezier(.34, 1.56, .64, 1);
}
.cm-close {
  position: absolute; top: 12px; right: 12px; z-index: 1;
  width: 30px; height: 30px; border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  background: rgba(255, 255, 255, .04); color: #9fe8d8;
  font-size: 1rem; line-height: 1; cursor: pointer;
  display: grid; place-items: center; transition: all .2s;
}
.cm-close:hover { background: rgba(255, 255, 255, .12); }
@keyframes cmFade { from { opacity: 0; } }
@keyframes cmPop { from { opacity: 0; transform: translateY(14px) scale(.97); } }
@media (prefers-reduced-motion: reduce) {
  .cm-overlay, .cm-panel { animation: none; }
}
</style>
