<script setup>
/* ResumePanel.vue —— 简历 PDF 管理（仅 owner）。文件存 Supabase resume 桶，元数据 D1 /api/resume */
import { ref, onMounted } from 'vue';
import { getJSON, postJSON } from '@/api/http';
import { uploadToBucket, makePath, publicUrl } from '@/core/supabase';
import { useI18n } from '@/core/i18n';

const { t } = useI18n('admin');
const cur = ref(null);
const ver = ref('');
const busy = ref(false);
const msg = ref('');
const fileEl = ref(null);

async function load() {
  try { const r = await getJSON('/api/resume'); cur.value = (r && r.item) || null; }
  catch (e) { msg.value = t('edLoadFail'); }
}
onMounted(load);

async function onPick(e) {
  const f = (e.target && e.target.files && e.target.files[0]);
  if (!f) return;
  if (f.type !== 'application/pdf') { msg.value = t('edPdfOnly'); return; }
  busy.value = true; msg.value = t('edUploading');
  try {
    const path = makePath('cv', f);
    await uploadToBucket('resume', path, f);
    await postJSON('/api/resume', { storage_path: path, version: ver.value || '', size_bytes: f.size });
    msg.value = t('edSaved'); await load();
  } catch (err) { msg.value = t('edUploadFail') + ': ' + err.message; }
  busy.value = false;
  if (fileEl.value) fileEl.value.value = '';
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2 class="panel-title">{{ t('edResume') }}</h2>
      <span class="panel-title-note">{{ t('edResumeSub') }}</span>
    </div>
    <div v-if="cur" class="ed-bar">
      <span class="ed-msg">{{ t('edResumeCurrent') }}：{{ cur.storage_path }} · {{ cur.version || '-' }}</span>
      <a class="ed-btn" :href="publicUrl('resume', cur.storage_path)" target="_blank" rel="noopener">{{ t('edResumeDownload') }}</a>
    </div>
    <p v-else class="ed-empty">{{ t('edEmpty') }}</p>
    <div class="ed-bar">
      <input v-model="ver" class="ed-input ed-w160" :placeholder="t('edResumeVersion')" />
      <input ref="fileEl" type="file" accept="application/pdf" :disabled="busy" @change="onPick" />
      <span class="ed-msg">{{ msg }}</span>
    </div>
  </section>
</template>
