<script setup>
/* ==========================================================================
 * PhotosPanel.vue —— 照片墙管理（仅 owner）
 * 文件存 Supabase photos 桶（走签名 URL 直传），元数据存 D1 /api/photos
 * ========================================================================== */
import { ref, onMounted } from 'vue';
import { getJSON, postJSON, putJSON, delJSON } from '@/api/http';
import { uploadToBucket, makePath, publicUrl } from '@/core/supabase';
import { useI18n } from '@/core/i18n';

const { t } = useI18n('admin');
const items = ref([]);
const busy = ref(false);
const msg = ref('');
const fileEl = ref(null);

async function load() {
  try {
    const r = await getJSON('/api/photos');
    items.value = (r && r.items) || [];
  } catch (e) { msg.value = t('edLoadFail'); }
}
onMounted(load);

async function onPick(e) {
  const files = Array.from((e.target && e.target.files) || []);
  if (!files.length) return;
  busy.value = true; msg.value = t('edUploading');
  try {
    for (const f of files) {
      const path = makePath('wall', f);
      await uploadToBucket('photos', path, f);
      await postJSON('/api/photos', { title: f.name.replace(/\.[^.]+$/, ''), storage_path: path, sort_order: items.value.length });
    }
    msg.value = t('edSaved');
    await load();
  } catch (err) { msg.value = t('edUploadFail') + ': ' + err.message; }
  busy.value = false;
  if (fileEl.value) fileEl.value.value = '';
}

async function saveOne(it) {
  try { await putJSON('/api/photos/' + it.id, { title: it.title, description: it.description, sort_order: it.sort_order }); msg.value = t('edSaved'); }
  catch (e) { msg.value = t('edSaveFail'); }
}
async function move(it, d) {
  it.sort_order = (it.sort_order || 0) + d;
  await saveOne(it); await load();
}
async function remove(it) {
  if (!window.confirm(t('edDeleteConfirm'))) return;
  try { await delJSON('/api/photos/' + it.id); await load(); msg.value = t('edSaved'); }
  catch (e) { msg.value = t('edSaveFail'); }
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2 class="panel-title">{{ t('edPhotos') }}</h2>
      <span class="panel-title-note">{{ t('edPhotosSub') }}</span>
    </div>
    <div class="ed-bar">
      <input ref="fileEl" type="file" accept="image/*" multiple :disabled="busy" @change="onPick" />
      <span class="ed-msg">{{ msg }}</span>
    </div>
    <p v-if="!items.length" class="ed-empty">{{ t('edEmpty') }}</p>
    <ul class="ed-list">
      <li v-for="it in items" :key="it.id" class="ed-row">
        <img class="ed-thumb" :src="publicUrl('photos', it.storage_path)" :alt="it.title" loading="lazy" />
        <div class="ed-fields">
          <input v-model="it.title" class="ed-input" :placeholder="t('edTitlePh')" @change="saveOne(it)" />
          <input v-model="it.description" class="ed-input" :placeholder="t('edDescPh')" @change="saveOne(it)" />
        </div>
        <div class="ed-ops">
          <button type="button" class="ed-btn" @click="move(it, -1)">↑</button>
          <button type="button" class="ed-btn" @click="move(it, 1)">↓</button>
          <button type="button" class="ed-btn ed-danger" @click="remove(it)">{{ t('edDel') }}</button>
        </div>
      </li>
    </ul>
  </section>
</template>
