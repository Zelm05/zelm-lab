<script setup>
/* ==========================================================================
 * AboutPwModal.vue —— 主站「查看完整关于我」入口 + 访问密码弹窗
 *
 * 原状：src/modules/pages/home.js 里 aboutEnterBtn 的点击判定 + openAboutPw /
 *   closeAboutPw / aboutPwVerify + 一段「登录回来后继续弹窗」的 checkPendingAbout。
 * 现在：判定与校验收进组件，父组件只需在按钮上调用 open()（通过 ref 暴露）。
 *
 * 判定顺序**逐步照搬原站**（与关于页自己的门控不同，不要顺手统一）：
 *   ① 未登录 且 站长要求登录 → 记下待进入意图，弹登录框
 *   ② 站长关掉了访问密码 → 直接进关于页
 *   ③ 否则 → 弹访问密码窗
 * 注意原站这里**没有**「站长本人免密」这一条（关于页有），故主站入口对站长
 *   同样会弹密码窗 —— 保留原行为。
 * ========================================================================== */
import { ref, onMounted } from 'vue';
import { useI18n } from '@/core/i18n';
import { useSiteCfgStore } from '@/stores/site-cfg';
import { useUserStore } from '@/stores/user';
import { useAuthStore } from '@/stores/auth';
import { postJSON } from '@/api/http';
import { shell } from '@/core/shell';

const { t } = useI18n('home');
const cfg = useSiteCfgStore();
const user = useUserStore();
const auth = useAuthStore();

const open = ref(false);
const pw = ref('');
const msg = ref('');
const busy = ref(false);
const inputEl = ref(null);

function showPw() {
  open.value = true;
  msg.value = '';
  pw.value = '';
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';
  setTimeout(() => { if (inputEl.value) inputEl.value.focus(); }, 60);
}
function close() {
  open.value = false;
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
}
function goAbout() { shell.goPage('about'); }

/** 按钮入口（父组件通过 ref 调用） */
async function enter() {
  const [d] = await Promise.all([user.load(), cfg.load()]);
  // ① 未登录 + 站点要求登录 → 先登录，登录回到主站后再继续
  if (!d && cfg.aboutLoginRequired) {
    try { sessionStorage.setItem('zelm_pending_about', '1'); } catch (e) { /* 忽略 */ }
    auth.open('login');
    return;
  }
  // ② 无需密码 → 直接进
  if (!cfg.aboutPasswordEnabled) { goAbout(); return; }
  // ③ 需要密码
  showPw();
}

async function verify() {
  if (!pw.value) { msg.value = t('aboutPwEmpty'); return; }
  busy.value = true;
  let res;
  try {
    res = await postJSON('/api/about/auth', { password: pw.value });
  } catch (e) {
    busy.value = false;
    msg.value = t('aboutPwNet');
    return;
  }
  busy.value = false;
  if (res.ok && res.data && res.data.ok) {
    try { sessionStorage.setItem('zelm_about_ok', '1'); } catch (e) { /* 忽略 */ }
    close();              // 先关窗，避免切到关于页时弹窗还挂着
    goAbout();
  } else {
    msg.value = t('aboutPwWrong');
    pw.value = '';
    if (inputEl.value) inputEl.value.focus();
  }
}

/* 登录成功后回到主站：若有待进入意图则继续走一遍判定（原站 checkPendingAbout） */
function checkPending() {
  let pending = false;
  try {
    pending = sessionStorage.getItem('zelm_pending_about') === '1';
    sessionStorage.removeItem('zelm_pending_about');
  } catch (e) { /* 忽略 */ }
  if (!pending) return;
  Promise.all([user.load(), cfg.load()]).then(([d]) => {
    if (!d) return;                                        // 仍未登录：作罢
    if (!cfg.aboutPasswordEnabled) { goAbout(); return; }  // 站长已取消密码
    showPw();
  });
}

onMounted(checkPending);

defineExpose({ enter });
</script>

<template>
  <!-- 关于页访问密码弹窗（原 .about-pw-overlay → el-dialog）
       el-dialog 自带 Teleport（挂到 body，不受 .container 的 transform 影响）、
       遮罩、Esc 关闭、滚动锁定 —— 这些都是原版手写的，现在由组件库接管。
       脚本逻辑（判定顺序 / 校验 / 待进入意图）一行没动，只是换了呈现层。 -->
  <el-dialog
    id="aboutPwModal"
    v-model="open"
    :title="t('aboutPwTitle')"
    width="360px"
    align-center
  >
    <p class="about-pw-sub">{{ t('aboutPwSub') }}</p>
    <el-input
      id="aboutPwInput"
      ref="inputEl"
      v-model="pw"
      type="password"
      maxlength="32"
      autocomplete="off"
      placeholder="••••"
      :aria-label="t('aboutPwAria')"
      @keydown.enter.prevent="verify"
    />
    <div id="aboutPwMsg" class="about-pw-msg">{{ msg }}</div>

    <template #footer>
      <el-button id="aboutPwBtn" type="primary" size="small" :loading="busy" @click="verify">
        {{ t('aboutPwEnter') }}
      </el-button>
    </template>
  </el-dialog>
</template>
