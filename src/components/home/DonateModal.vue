<script setup>
/* ==========================================================================
 * DonateModal.vue —— 打赏弹窗（微信收款码）
 *
 * 原状：src/modules/pages/home.js 里 openDonate / closeDonate + 一段中英双语的
 *   祝福语数组（DONATE_BLESSINGS.zh / .en）。
 * 现在：文案只留中文 5 条；开合由父组件 v-model:open 驱动，锁滚动的收尾
 *   跟着开关走（原站是 open/close 各写一遍 body + documentElement 的 overflow）。
 * ========================================================================== */
import { computed, ref, watch } from 'vue';
import { useI18n } from '@/core/i18n';

const props = defineProps({ open: { type: Boolean, default: false } });
const emit = defineEmits(['update:open']);

/* el-dialog 用 v-model，本组件对外是 props.open + emit('update:open')，
 * 这个 computed 把两者桥接起来（父组件继续用 v-model 即可，不用改）。 */
const openModel = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
});
const { t } = useI18n('home');

/* 原站 5 条中文祝福语，逐条保留 */
/* P3-6：祝福语进 i18n（home.donateMsg1..5），这里只存 key，取值时再 t() */
const BLESSING_KEYS = ['donateMsg1', 'donateMsg2', 'donateMsg3', 'donateMsg4', 'donateMsg5'];

const blessing = ref(t('donateMsg1'));

watch(() => props.open, (v) => {
  if (v) {
    blessing.value = t(BLESSING_KEYS[Math.floor(Math.random() * BLESSING_KEYS.length)]);
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }
});
</script>

<template>
  <!-- 打赏弹窗（原 .donate-modal-overlay → el-dialog） -->
  <el-dialog id="donateModal" v-model="openModel" :title="t('donateTitle')" width="480px" align-center>
    <div class="donate-body">
      <img class="donate-qr" src="assets/donate-qrcode.webp" :alt="t('donateQrAlt')" loading="lazy" width="200" height="200">
      <p id="donateBlessing" class="donate-blessing">{{ blessing }}</p>
      <p class="donate-tip">{{ t('donateTip') }}</p>
    </div>
  </el-dialog>
</template>

<style scoped>
.donate-body { text-align: center; }
.donate-blessing { margin: 10px 0 4px; color: var(--text); line-height: 1.7; }
.donate-tip { margin: 0; font-size: .78rem; color: var(--muted); }
</style>
