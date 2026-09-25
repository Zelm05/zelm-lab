<script setup>
/* LogsPanel.vue —— 更新日志管理（批量管理；前台也可就地添加）（仅 owner）。纯文本存 D1 /api/ebook */
import { ref, onMounted } from 'vue';
import { getJSON, postJSON, putJSON, delJSON } from '@/api/http';
import { useI18n } from '@/core/i18n';

const { t } = useI18n('admin');
const items = ref([]);
const draftTitle = ref('');
const draftContent = ref('');
const msg = ref('');
const editing = ref(0);

async function load() {
  try { const r = await getJSON('/api/ebook'); items.value = (r && r.items) || []; }
  catch (e) { msg.value = t('edLoadFail'); }
}
onMounted(load);

async function add() {
  if (!draftTitle.value.trim()) return;
  try {
    await postJSON('/api/ebook', { title: draftTitle.value.trim(), content: draftContent.value, sort_order: items.value.length });
    draftTitle.value = ''; draftContent.value = ''; msg.value = t('edSaved'); await load();
  } catch (e) { msg.value = t('edSaveFail'); }
}
async function saveOne(it) {
  try { await putJSON('/api/ebook/' + it.id, { title: it.title, content: it.content, sort_order: it.sort_order }); msg.value = t('edSaved'); editing.value = 0; }
  catch (e) { msg.value = t('edSaveFail'); }
}
async function remove(it) {
  if (!window.confirm(t('edDeleteConfirm'))) return;
  try { await delJSON('/api/ebook/' + it.id); await load(); msg.value = t('edSaved'); }
  catch (e) { msg.value = t('edSaveFail'); }
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2 class="panel-title">{{ t('edEbook') }}</h2>
      <span class="panel-title-note">{{ t('edEbookSub') }}</span>
    </div>
    <div class="ed-form">
      <input v-model="draftTitle" class="ed-input" :placeholder="t('edChapterTitle')" />
      <textarea v-model="draftContent" class="ed-area" rows="4" :placeholder="t('edChapterContent')"></textarea>
      <button type="button" class="ed-btn ed-primary" @click="add">{{ t('edAddChapter') }}</button>
      <span class="ed-msg">{{ msg }}</span>
    </div>
    <p v-if="!items.length" class="ed-empty">{{ t('edEmpty') }}</p>
    <ul class="ed-list">
      <li v-for="it in items" :key="it.id" class="ed-row ed-col">
        <input v-if="editing === it.id" v-model="it.title" class="ed-input" />
        <strong v-else class="ed-chapter">{{ it.title }}</strong>
        <textarea v-if="editing === it.id" v-model="it.content" class="ed-area" rows="5"></textarea>
        <p v-else class="ed-preview">{{ it.content }}</p>
        <div class="ed-ops">
          <button v-if="editing !== it.id" type="button" class="ed-btn" @click="editing = it.id">{{ t('edEdit') }}</button>
          <button v-else type="button" class="ed-btn ed-primary" @click="saveOne(it)">{{ t('edSave') }}</button>
          <button type="button" class="ed-btn ed-danger" @click="remove(it)">{{ t('edDel') }}</button>
        </div>
      </li>
    </ul>
  </section>
</template>
