<script setup>
/* ==========================================================================
 * PhotoManageModal.vue —— 照片墙管理弹窗（仅站长）
 * 列出全部照片 → 改标题 / 删除（同时删 Supabase 文件）
 * 照片墙本体是漂移动画（非独立 DOM 卡片），所以管理集中在这个弹窗里做。
 * ========================================================================== */
import { ref, watch } from 'vue';
import { getJSON, putJSON, delJSON } from '@/api/http';
import { publicUrl, deleteObject } from '@/core/supabase';
import { useI18n } from '@/core/i18n';

const props = defineProps({ open: { type: Boolean, default: false } });
const emit = defineEmits(['close', 'saved']);
const { t: tc } = useI18n('common');
const { t } = useI18n('home');

const items = ref([]);
const msg = ref('');

async function load() {
  try {
    const r = await getJSON('/api/photos');
    items.value = (r && r.items) || [];
  } catch (e) { msg.value = tc('cLoadFail'); }
}
watch(() => props.open, (v) => { if (v) load(); });

async function saveTitle(it) {
  try { await putJSON('/api/photos/' + it.id, { title: it.title }); msg.value = tc('cSaved'); }
  catch (e) { msg.value = tc('cSaveFail'); }
}
async function remove(it) {
  if (!window.confirm(tc('cConfirmDelete'))) return;
  try {
    await delJSON('/api/photos/' + it.id);
    await deleteObject('photos', it.storage_path);
    await load();
    emit('saved');
    msg.value = tc('cSaved');
  } catch (e) { msg.value = tc('cSaveFail'); }
}
</script>

<template>
  <Teleport to="#overlayRoot">
    <div class="inline-edit-overlay" :hidden="!open" @click.self="emit('close')">
      <div class="inline-edit-modal" role="dialog">
        <el-button class="inline-edit-close" size="small" circle @click="emit('close')">✕</el-button>
        <h3 class="inline-edit-title">{{ t('photoWallManage') }}</h3>
        <p class="inline-edit-msg">{{ msg }}</p>
        <ul class="inline-edit-list">
          <li v-for="it in items" :key="it.id" class="inline-edit-row">
            <img class="inline-edit-thumb" :src="publicUrl('photos', it.storage_path)" :alt="it.title" loading="lazy" />
            <input v-model="it.title" class="inline-edit-input" :placeholder="tc('cTitlePh')" @change="saveTitle(it)" />
            <button type="button" class="inline-edit-btn inline-edit-danger" @click="remove(it)">{{ tc('cDelete') }}</button>
          </li>
        </ul>
        <div class="inline-edit-actions">
          <el-button size="small" @click="emit('close')">{{ tc('cCancel') }}</el-button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
