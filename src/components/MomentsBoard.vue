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
/* 图片与文件分开：图片内联预览，文件（PDF 等）给「查看 / 下载」链接 */
const isImg = (p) => /\.(webp|jpg|jpeg|png|gif)$/i.test(p || '');
function picsOf(it) { return imgsOf(it).filter(isImg); }
function docsOf(it) { return imgsOf(it).filter((p) => !isImg(p)); }
function fileName(p) { return String(p).split('/').pop(); }

async function reload() {
  try {
    const r = await getJSON('/api/moments');
    items.value = (r && r.ok && r.data && r.data.items) || [];
  } catch (e) { /* 空态 */ }
  loading.value = false;
}
onMounted(reload);

</script>

<template>
  <section id="moments" class="about-section">
    <h2>
      {{ t('momentsTitle') }}
      <button v-if="user.isOwner" type="button" class="owner-add" @click="addOpen = true">{{ t('momentsManage') }}</button>
    </h2>
    <p class="section-sub">{{ t('momentsSub') }}</p>

    <p v-if="loading" class="block-empty">…</p>
    <p v-else-if="!items.length" class="block-empty">{{ t('momentsEmpty') }}</p>

    <ul v-else class="moments-list">
      <li v-for="m in items" :key="m.id" class="moment-item">
        <p class="moment-content">{{ m.content }}</p>
        <div v-if="picsOf(m).length" class="moment-imgs">
          <img
            v-for="(p, i) in picsOf(m)" :key="i"
            :src="publicUrl('moments', p)" alt="" loading="lazy"
            class="moment-img"
          />
        </div>
        <div v-if="docsOf(m).length" class="moment-files">
          <a
            v-for="(p, i) in docsOf(m)" :key="i"
            class="moment-file" :href="publicUrl('moments', p)"
            target="_blank" rel="noopener noreferrer" :download="fileName(p)"
          >📄 {{ fileName(p) }} · {{ tc('cView') }} / {{ tc('cDownload') }}</a>
        </div>
        <p class="moment-meta">
          {{ fmtTime(m.created_at) }}<template v-if="m.location"> · {{ m.location }}</template>
        </p>
      </li>
    </ul>

    <InlineAddModal kind="moment" :open="addOpen" @close="addOpen = false" @saved="reload" />
  </section>
</template>
