<script setup>
/* MomentsPanel.vue —— 朋友圈管理（仅 owner）。文字存 D1，图片存 Supabase moments 桶 */
import { ref, onMounted } from 'vue';
import { getJSON, postJSON, putJSON, delJSON } from '@/api/http';
import { uploadToBucket, makePath, publicUrl } from '@/core/supabase';
import { useI18n } from '@/core/i18n';
import { fmtTime } from '@/core/format';

const { t } = useI18n('admin');
const items = ref([]);
const content = ref('');
const location = ref('');
const picked = ref([]);      // 待发布的本地文件
const msg = ref('');
const busy = ref(false);
const editing = ref(0);

async function load() {
  try { const r = await getJSON('/api/moments'); items.value = (r && r.items) || []; }
  catch (e) { msg.value = t('edLoadFail'); }
}
onMounted(load);

function imgsOf(it) { try { return JSON.parse(it.images || '[]'); } catch (e) { return []; } }

function onPick(e) { picked.value = Array.from((e.target && e.target.files) || []); }

async function publish() {
  if (!content.value.trim()) return;
  busy.value = true; msg.value = t('edUploading');
  try {
    const paths = [];
    for (const f of picked.value) {
      const path = makePath('mm', f);
      await uploadToBucket('moments', path, f);
      paths.push(path);
    }
    await postJSON('/api/moments', { content: content.value.trim(), images: paths, location: location.value });
    content.value = ''; location.value = ''; picked.value = []; msg.value = t('edSaved'); await load();
  } catch (err) { msg.value = t('edUploadFail') + ': ' + err.message; }
  busy.value = false;
}
async function saveOne(it) {
  try { await putJSON('/api/moments/' + it.id, { content: it.content, location: it.location }); msg.value = t('edSaved'); editing.value = 0; }
  catch (e) { msg.value = t('edSaveFail'); }
}
async function remove(it) {
  if (!window.confirm(t('edDeleteConfirm'))) return;
  try { await delJSON('/api/moments/' + it.id); await load(); msg.value = t('edSaved'); }
  catch (e) { msg.value = t('edSaveFail'); }
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2 class="panel-title">{{ t('edMoments') }}</h2>
      <span class="panel-title-note">{{ t('edMomentsSub') }}</span>
    </div>
    <div class="ed-form">
      <textarea v-model="content" class="ed-area" rows="3" :placeholder="t('edMomentContent')"></textarea>
      <input v-model="location" class="ed-input ed-w160" :placeholder="t('edMomentLocation')" />
      <input type="file" accept="image/*" multiple :disabled="busy" @change="onPick" />
      <button type="button" class="ed-btn ed-primary" :disabled="busy" @click="publish">{{ t('edPublish') }}</button>
      <span class="ed-msg">{{ msg }}</span>
    </div>
    <p v-if="!items.length" class="ed-empty">{{ t('edEmpty') }}</p>
    <ul class="ed-list">
      <li v-for="it in items" :key="it.id" class="ed-row ed-col">
        <textarea v-if="editing === it.id" v-model="it.content" class="ed-area" rows="3"></textarea>
        <p v-else class="ed-preview">{{ it.content }}</p>
        <div v-if="imgsOf(it).length" class="ed-imgs">
          <img v-for="(p, i) in imgsOf(it)" :key="i" class="ed-thumb" :src="publicUrl('moments', p)" alt="" loading="lazy" />
        </div>
        <div class="ed-ops">
          <span class="ed-msg">{{ fmtTime(it.created_at) }}<template v-if="it.location"> · {{ it.location }}</template></span>
          <button v-if="editing !== it.id" type="button" class="ed-btn" @click="editing = it.id">{{ t('edEdit') }}</button>
          <button v-else type="button" class="ed-btn ed-primary" @click="saveOne(it)">{{ t('edSave') }}</button>
          <button type="button" class="ed-btn ed-danger" @click="remove(it)">{{ t('edDel') }}</button>
        </div>
      </li>
    </ul>
  </section>
</template>
