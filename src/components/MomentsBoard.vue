<script setup>
/* ==========================================================================
 * MomentsBoard.vue —— 动态板块（前台，关于页；数据来自 /api/content/moments，支持多语言）
 * 站长在前台点「＋ 发布」就地添加；站长也可删除（含 Supabase 附件）。
 * ========================================================================== */
import { ref, computed, onMounted } from 'vue';
import { useManageDialog } from '@/composables/useManageDialog';
import { useUserStore } from '@/stores/user';
import { resolveAssetUrl } from '@/core/supabase';
import { useContentStore } from '@/stores/content';
import { useI18n } from '@/core/i18n';
import { fmtTime } from '@/core/format';

const { t } = useI18n('home');
const user = useUserStore();
const loading = ref(true);
/* 站长的「管理」按钮：在当前页就地弹出内容管理面板（不跳转 /admin） */
const { openManage } = useManageDialog();
function goManage(mod) { openManage(mod); }

function imgsOf(it) {
  try { return JSON.parse(it.images || '[]'); } catch (e) { return []; }
}
/* 图片与文件分开：图片内联预览，文件（PDF 等）给「查看 / 下载」链接 */
const isImg = (p) => /\.(webp|jpg|jpeg|png|gif)$/i.test(p || '');
function picsOf(it) { return imgsOf(it).filter(isImg); }
function docsOf(it) { return imgsOf(it).filter((p) => !isImg(p)); }
function fileName(p) { return String(p).split('/').pop(); }
/* 按扩展名给一个文件类型图标（文件贴图用） */
function fileIcon(p) {
  const ext = String(p).split('.').pop().toLowerCase();
  if (ext === 'pdf') return '📕';
  if (['zip', 'rar', '7z'].indexOf(ext) >= 0) return '🗜';
  if (['doc', 'docx'].indexOf(ext) >= 0) return '📘';
  if (['xls', 'xlsx', 'csv'].indexOf(ext) >= 0) return '📗';
  if (['ppt', 'pptx'].indexOf(ext) >= 0) return '📙';
  if (['txt', 'md'].indexOf(ext) >= 0) return '📄';
  return '📎';
}

/* 数据来自内容 store（多语言：/api/content/moments?lang=xx）。
   ⚠️ 语言切换不用在这里处理 —— store 内部 watch 了 i18n locale，
      会清缓存并重取已订阅的模块，items 作为 computed 自动跟着变。 */
const content = useContentStore();
const items = computed(() => content.moments);

/* 当前语言没翻译、回退了默认语言时的轻量提示（取第一条即可） */
const fallbackTip = computed(() => {
  const first = items.value[0];
  return first ? content.fallbackNotice(first) : '';
});

onMounted(async () => { await content.ensure('moments'); loading.value = false; });

</script>

<template>
  <section id="moments" class="about-section">
    <h2>
      {{ t('momentsTitle') }}
      <button v-if="user.isOwner" type="button" class="owner-add" @click="goManage('moments')">{{ t('momentsManage') }}</button>
    </h2>
    <p class="section-sub">{{ t('momentsSub') }}</p>

    <p v-if="fallbackTip" class="content-fallback-tip">{{ fallbackTip }}</p>
    <p v-if="loading" class="block-empty">…</p>
    <p v-else-if="!items.length" class="block-empty">{{ t('momentsEmpty') }}</p>

    <ul v-else class="moments-list">
      <li v-for="m in items" :key="m.id" class="moment-item">
        <p class="moment-content">{{ m.content }}<a
            v-for="(p, i) in docsOf(m)" :key="i"
            class="moment-file-inline" :href="resolveAssetUrl(p, 'moments')"
            target="_blank" rel="noopener noreferrer" :download="fileName(p)"
            :title="fileName(p)"
          >{{ fileIcon(p) }}</a></p>
        <div v-if="picsOf(m).length" class="moment-imgs">
          <img
            v-for="(p, i) in picsOf(m)" :key="i"
            :src="resolveAssetUrl(p, 'moments')" alt="" loading="lazy"
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
