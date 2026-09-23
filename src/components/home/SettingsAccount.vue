<script setup>
/* ==========================================================================
 * SettingsAccount.vue —— 设置面板里的「账号安全」分组（主站专属，走 SettingsPanel 插槽）
 *
 * 原状：src/modules/pages/home.js 里 updateAccountSecurityVisibility +
 *   fillRenameInput + 改名 / 改密码两段 fetch，共约 100 行，全部靠读写 DOM。
 * 现在：登录态取自 user store（v-show 直接绑定），表单值 / 提示都在组件里；
 *   改名成功后同步 store 里的用户名，右上角显示随之更新（原站是手改 #userName）。
 * ========================================================================== */
import { ref, watch } from 'vue';
import { useI18n } from '@/core/i18n';
import { useUserStore } from '@/stores/user';
import { useSettingsStore } from '@/stores/settings';

const { t } = useI18n('home');
const user = useUserStore();
const st = useSettingsStore();

/* ---------------- 改名 ---------------- */
const renameVal = ref('');
const renameMsg = ref('');
const renameType = ref('');   // '' | 'err' | 'ok'
const renameBusy = ref(false);

/* 原站是「打开设置面板 / 登录登出时」回填 —— 这里跟随面板开合 */
watch(() => st.panelOpen, (v) => {
  if (!v) return;
  renameMsg.value = '';
  renameType.value = '';
  if (user.isLoggedIn) renameVal.value = user.name;
});

async function saveName() {
  renameMsg.value = '';
  renameType.value = '';
  const username = renameVal.value.trim();
  if (!username) { renameMsg.value = t('renameEmpty'); renameType.value = 'err'; return; }
  if (username.length > 20) { renameMsg.value = t('renameTooLong'); renameType.value = 'err'; return; }
  if (!/^[\u4e00-\u9fa5A-Za-z0-9_\- ]+$/.test(username)) {
    renameMsg.value = t('renameChars'); renameType.value = 'err';
    return;
  }
  renameBusy.value = true;
  try {
    const res = await fetch('/api/me/username', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (res.ok) {
      // 用户名即登录标识也是显示名，改完同步到 store（右上角跟着变）
      if (user.user) user.user.username = username;
      renameMsg.value = t('renameOk');
      renameType.value = 'ok';
    } else {
      renameMsg.value = data.error || t('renameFail');
      renameType.value = 'err';
    }
  } catch (e) {
    renameMsg.value = t('netErr');
    renameType.value = 'err';
  } finally {
    renameBusy.value = false;
  }
}

/* ---------------- 改密码 ---------------- */
const pwOld = ref('');
const pwNew = ref('');
const pwConfirm = ref('');
const pwMsg = ref('');
const pwType = ref('');

async function changePass() {
  pwMsg.value = '';
  pwType.value = '';
  const o = pwOld.value;
  const n = pwNew.value;
  const c = pwConfirm.value;
  if (!o || !n || !c) { pwMsg.value = t('changePassEmpty'); pwType.value = 'err'; return; }
  if (n !== c) { pwMsg.value = t('changePassMismatch'); pwType.value = 'err'; return; }
  if (n.length < 8) { pwMsg.value = t('changePassShort'); pwType.value = 'err'; return; }
  try {
    const res = await fetch('/api/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ oldPassword: o, newPassword: n }),
    });
    const data = await res.json();
    if (res.ok) {
      pwMsg.value = t('changePassOk');
      pwType.value = 'ok';
      pwOld.value = '';
      pwNew.value = '';
      pwConfirm.value = '';
    } else {
      pwMsg.value = data.error || t('netErr');
      pwType.value = 'err';
    }
  } catch (e) {
    pwMsg.value = t('netErr');
    pwType.value = 'err';
  }
}
</script>

<template>
  <section v-show="user.isLoggedIn" id="accountSecurityGroup" class="settings-group">
    <h3>{{ t('groupAccount') }}</h3>
    <!-- 修改名字（每天限一次，登录后可用） -->
    <div class="auth-field">
      <label for="renameInput">{{ t('renameLabel') }}</label>
      <input id="renameInput" v-model="renameVal" type="text" class="settings-input" maxlength="20" autocomplete="off" />
    </div>
    <div class="settings-row settings-row--action">
      <button id="renameSaveBtn" type="button" class="settings-btn" :disabled="renameBusy" @click="saveName">
        {{ renameBusy ? t('renameSaving') : t('renameSave') }}
      </button>
    </div>
    <div id="renameMsg" class="auth-msg" :class="{ err: renameType === 'err', ok: renameType === 'ok' }">{{ renameMsg }}</div>
    <!-- 修改密码 -->
    <div class="auth-field">
      <label for="chgOldPass">{{ t('oldPassword') }}</label>
      <input id="chgOldPass" v-model="pwOld" type="password" class="settings-input" autocomplete="current-password" />
    </div>
    <div class="auth-field">
      <label for="chgNewPass">{{ t('newPassword') }}</label>
      <input id="chgNewPass" v-model="pwNew" type="password" class="settings-input" autocomplete="new-password" />
    </div>
    <div class="auth-field">
      <label for="chgConfirmPass">{{ t('confirmPassword') }}</label>
      <input id="chgConfirmPass" v-model="pwConfirm" type="password" class="settings-input" autocomplete="new-password" />
    </div>
    <div class="settings-row settings-row--action">
      <button id="changePassBtn" type="button" class="settings-btn" @click="changePass">{{ t('changePassBtn') }}</button>
    </div>
    <div id="changePassMsg" class="auth-msg" :class="{ err: pwType === 'err', ok: pwType === 'ok' }">{{ pwMsg }}</div>
  </section>
</template>
