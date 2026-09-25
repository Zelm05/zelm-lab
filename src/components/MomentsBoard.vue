<script setup>
/* ==========================================================================
 * MomentsBoard.vue —— 朋友圈前台板块（内容来自 D1 /api/moments）
 * 站长在管理台发布；图片存 Supabase moments 桶。
 * ========================================================================== */
import { ref, onMounted } from 'vue';
import { getJSON } from '@/api/http';
import { publicUrl } from '@/core/supabase';
import { useI18n } from '@/core/i18n';
import { fmtTime } from '@/core/format';

const { t } = useI18n('home');
const items = ref([]);
const loading = ref(true);

function imgsOf(it) { try { return JSON.parse(it.images || '[]'); } catch (e) { return []; } }

onMounted(async () => {
  try {
    const r = await getJSON('/api/moments');
    items.value = (r && r.items) || [];
  } catch (e) { /* 空态 */ }
  loading.value = false;
});
</script>

<template>
  <section id="moments" class="glass section-block">
    <div class="section-head">
      <h2>{{ t('momentsTitle') }}</h2>
    </div>
    <p class="section-sub">{{ t('momentsSub') }}</p>

    <p v-if="loading" class="block-empty">…</p>
    <p v-else-if="!items.length" class="block-empty">{{ t('momentsEmpty') }}</p>

    <ul v-else class="moments-list">
      <li v-for="m in items" :key="m.id" class="moment-item">
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
  </section>
</template>
