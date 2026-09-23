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
const BLESSINGS = [
  '如果这里的内容曾照亮过你，欢迎请我喝一杯咖啡 ☕',
  '愿这些收藏对你有所帮助，一杯奶茶就足够温暖 🧋',
  '喜欢这里的话，可以请我吃根冰棍，祝你好运常伴 🍦',
  '你的支持是我更新的最大动力，谢谢你读完这里 🌟',
  '路过的星光会记住你的善意，谢谢你点亮这一页 ✨',
];

const blessing = ref(BLESSINGS[0]);

watch(() => props.open, (v) => {
  if (v) {
    blessing.value = BLESSINGS[Math.floor(Math.random() * BLESSINGS.length)];
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
  <el-dialog id="donateModal" v-model="openModel" :title="t('donateTitle')" width="320px" align-center>
    <div class="donate-body">
      <img class="donate-qr" src="assets/donate-qrcode.webp" alt="微信打赏二维码" loading="lazy" width="200" height="200">
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
