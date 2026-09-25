<script setup>
/* ==========================================================================
 * MomentsBoard.vue —— 动态板块（前台，关于页；数据来自 D1 /api/moments）
 * 站长在前台点「＋ 发布」就地添加；站长也可删除（含 Supabase 附件）。
 * ========================================================================== */
import { ref, onMounted } from 'vue';
import { getJSON, delJSON } from '@/api/http';
import InlineAddModal from '@/components/editor/InlineAddModal.vue';
import { useUserStore } from '@/stores/user';
import { publicUrl, deleteObject } from '@/core/supabase';
import { useI18n } from '@/core/i18n';
import { fmtTime } from '@/core/format';

const { t } = useI18n('home');
const { t: tc } = useI18n('common');
const user = useUserStore();
const addOpen = ref(false);
const items = ref([]);
const loading = ref(true);

function imgsOf(it) {
  try { return JSON.parse(it.images || '[]'); } catch (e) { return []; }
}

async function reload() {
  try {
    const r = await getJSON('/api/moments');
    items.value = (r && r.ok && r.data && r.data.items) || [];
  } catch (e) { /* 空态 */ }
  loading.value = false;
}
onMounted(reload);

/* 站长删除：先删元数据，再清 Storage 附件 */
async function remove(m) {
  if (!window.confirm(tc('cConfirmDelete'))) return;
  try {
    await delJSON('/api/moments/' + m.id);
    for (const path of imgsOf(m)) await deleteObject('moments', path);
    await reload();
  } catch (e) { /* 忽略 */ }
}
</script>

<template>
  <section id="moments" class="about-section">
    <h2>
      {{ t('momentsTitle') }}
      <button v-if="user.isOwner" type="button" class="owner-add" @click="addOpen = true">+ {{ t('momentsAdd') }}</button>
    </h2>
    <p class="section-sub">{{ t('momentsSub') }}</p>

    <p v-if="loading" class="block-empty">…</p>
    <p v-else-if="!items.length" class="block-empty">{{ t('momentsEmpty') }}</p>

    <ul v-else class="moments-list">
      <li v-for="m in items" :key="m.id" class="moment-item">
        <button v-if="user.isOwner" type="button" class="owner-del" :title="tc('cDelete')" @click="remove(m)">✕</button>
        <p class="moment-content">{{ m.content }}</p>
        <div v-if="imgsOf(m).length" class="moment-imgs">
          <img
            v-for="(p, i) in imgsOf(m)" :key="i"
            :src="publicUrl('moments', p)" alt="" loading="lazy"
            class="moment-img"
          />
        </div>
        <p class="moment-meta">
          {{ fmtTime(m.created_at) }}<template v-if="m.location"> · {{ m.location }}</template>
        </p>
      </li>
    </ul>

    <InlineAddModal kind="moment" :open="addOpen" @close="addOpen = false" @saved="reload" />
  </section>
</template>
