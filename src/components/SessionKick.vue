<script setup>
/* ==========================================================================
 * SessionKick.vue —— 顶号通知弹窗（单端登录守护）
 *
 * 原寄生在 MusicPlayer.vue（播放器是常驻组件，弹窗搭车渲染）。
 * 播放器移除后独立成常驻组件；样式 .session-kick-* 在 App.vue，与
 * .conflict-* 共用一组选择器，保持不动。状态来自 core/session-guard.js。
 * ========================================================================== */
import { ref, watch } from 'vue';
import { kicked, dismissKick } from '@/core/session-guard';
import { useI18n } from '@/core/i18n';
import { useDialog } from '@/composables/useDialog';

const { t } = useI18n('auth');
const kickTitle = t('kickTitle');
const kickDesc = t('kickDesc');
const kickOk = t('kickOk');

// 弹窗出现时锁滚动（与原站一致）
watch(kicked, (v) => { document.body.style.overflow = v ? 'hidden' : ''; });

/* 无障碍（WCAG 2.1.2 / 2.4.3）：这个弹窗只有「知道了」一个出口，
   所以 Esc 也走 dismissKick；焦点陷阱保证 Tab 不会跑到背后已失效的页面上。 */
const panelEl = ref(null);
useDialog(() => kicked.value, { onClose: () => dismissKick(), panelRef: panelEl });
</script>

<template>
  <!-- 顶号通知弹窗（单端登录守护） -->
  <div id="sessionKickModal" class="modal-overlay" :hidden="!kicked">
    <div ref="panelEl" class="modal session-kick-modal" role="dialog" aria-modal="true" aria-labelledby="sessionKickTitle">
      <div class="session-kick-icon"><svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M12 2 1 21h22L12 2zm1 14h-2v2h2v-2zm0-8h-2v6h2V8z"/></svg></div>
      <h3 id="sessionKickTitle" class="session-kick-title">{{ kickTitle }}</h3>
      <p class="session-kick-desc">{{ kickDesc }}</p>
      <button id="sessionKickOk" type="button" class="session-kick-ok" @click="dismissKick()">{{ kickOk }}</button>
    </div>
  </div>
</template>
