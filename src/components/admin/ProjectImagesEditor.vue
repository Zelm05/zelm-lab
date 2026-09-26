<script setup>
/* ==========================================================================
 * ProjectImagesEditor.vue —— 后台「项目作品」里的多图上传与排序
 *
 * 数据模型：project_images（project_id / image_path / sort_order / created_at），
 *   与语言无关（图片没有语言），所以没有翻译表。
 *
 * 交互取舍：排序用上下箭头而不是拖拽（触屏可用、无需引入拖拽库），理由同 SocialLinksEditor。
 *
 * ⚠️ 图集挂在项目 id 下 —— **新建的项目必须先保存拿到 id**，才能加图。
 *    未保存时这里只显示一句提示，不误导站长。
 * ========================================================================== */
import { ref, watch, onMounted } from 'vue';
import { adminList, adminSave, adminRemove } from '@/api/content';
import { uploadToBucket, makePath, resolveAssetUrl, storeAssetRef, splitAssetRef, deleteObject } from '@/core/supabase';
import { compressImage } from '@/core/image';
import { useI18n } from '@/core/i18n';
import { useDragSort } from '@/core/useDragSort';

const props = defineProps({
  /** 当前编辑的项目 id；新建未保存时为 null */
  projectId: { type: [Number, String], default: null },
});

const { t } = useI18n('admin');
const { t: tc } = useI18n('common');

const rows = ref([]);
const busy = ref(false);
const msg = ref('');
const fileEl = ref(null);
const listEl = ref(null);

const BUCKET = 'project-assets';   /* 2026-09-26 起：项目图用 project-assets 桶（与封面同桶） */

/* 拖拽排序（鼠标 + 触屏 + 键盘箭头兜底） */
const { dragging, setContainer, move, onPointerDown } = useDragSort(rows, 'sort_order');
onMounted(() => setContainer(listEl.value));

async function load() {
  rows.value = [];
  if (!props.projectId) return;
  const d = await adminList('project-images');
  rows.value = (d.items || [])
    .filter((it) => String(it.project_id) === String(props.projectId))
    .map((it) => ({
      id: it.id,
      image_path: it.image_path,
      sort_order: Number(it.sort_order) || 0,
      _deleted: false,
    }));
}

watch(() => props.projectId, load, { immediate: true });

function pick() {
  const el = fileEl.value;
  if (!el) return;
  el.value = '';
  el.click();
}

/** 一次可选多张；逐张压缩后直传，再批量写库 */
async function onFiles(e) {
  const files = Array.from((e.target && e.target.files) || []);
  if (!files.length) return;
  busy.value = true;
  msg.value = tc('cUploading');
  let ok = 0;
  let fail = 0;
  let maxSort = rows.value.reduce((m, r) => Math.max(m, r.sort_order || 0), 0);
  for (const raw of files) {
    try {
      const f = await compressImage(raw, 400 * 1024);
      const path = makePath('proj/' + props.projectId, f);
      await uploadToBucket(BUCKET, path, f);
      maxSort += 10;
      const res = await adminSave('project-images', {
        project_id: Number(props.projectId),
        /* 存「桶前缀引用」：渲染时能自解析该去哪个桶取（旧记录没有前缀 → 走兜底桶） */
        image_path: storeAssetRef(BUCKET, path),
        sort_order: maxSort,
      });
      if (res.ok) ok++; else fail++;
    } catch (err) {
      fail++;
      msg.value = tc('cUploadFail') + '：' + (err && err.message ? err.message : err);
    }
  }
  await load();
  busy.value = false;
  if (!fail) msg.value = t('cfSaved') + '（' + ok + '）';
}

function removeRow(i) {
  const r = rows.value[i];
  if (r.id) r._deleted = true;
  else rows.value.splice(i, 1);
}

/** 提交排序与删除（图片内容本身在上传时就落库了） */
async function save() {
  busy.value = true;
  msg.value = '';
  let fail = 0;
  for (const r of rows.value) {
    if (r._deleted) {
      if (r.id) {
        const res = await adminRemove('project-images', r.id);
        if (!res.ok) { fail++; continue; }
        /* 记录删掉后**顺手清 Storage 里的图** —— 否则每删一张就多一个永久孤儿文件 */
        const { bucket, path: inner } = splitAssetRef(r.image_path, BUCKET);
        if (bucket && inner) {
          try { await deleteObject(bucket, inner); } catch (e) { /* 单张失败不影响整体 */ }
        }
      }
      continue;
    }
    if (r.id) {
      const res = await adminSave('project-images', { sort_order: r.sort_order }, r.id);
      if (!res.ok) fail++;
    }
  }
  await load();
  busy.value = false;
  msg.value = fail ? (tc('cSaveFail') + '：' + fail) : t('cfSaved');
}

function preview(r) {
  return resolveAssetUrl(r.image_path, BUCKET);
}
</script>

<template>
  <div class="pi-block">
    <div class="pi-head">
      <span class="pi-title">{{ t('cfProjectImages') }}</span>
      <span class="pi-hint">{{ t('cfProjectImagesHint') }}</span>
    </div>

    <!-- 新建的项目还没 id，加不了图（图集要挂在 project_id 上） -->
    <p v-if="!projectId" class="pi-hint pi-warn">{{ t('cfSaveFirst') }}</p>

    <template v-else>
      <div v-if="rows.length" ref="listEl" class="pi-grid">
        <div
          v-for="(r, i) in rows" :key="r.id" data-drag-item
          class="pi-item" :class="{ dragging: dragging === i }"
        >
          <img class="pi-img" :src="preview(r)" alt="" loading="lazy" decoding="async" width="88" height="88" />
          <span class="pi-ops">
            <button
              type="button" class="pi-btn pi-handle" aria-label="拖拽排序"
              @pointerdown="onPointerDown($event, i)"
            >⠿</button>
            <button type="button" class="pi-btn" :disabled="i === 0" @click="move(i, i - 1)">↑</button>
            <button type="button" class="pi-btn" :disabled="i === rows.length - 1" @click="move(i, i + 1)">↓</button>
            <button type="button" class="pi-btn pi-del" @click="removeRow(i)">✕</button>
          </span>
        </div>
      </div>
      <p v-else class="pi-hint">{{ t('cfNoData') }}</p>

      <input ref="fileEl" type="file" accept="image/*" multiple class="pi-file" @change="onFiles" />
      <p v-if="msg" class="pi-hint">{{ msg }}</p>
      <div class="pi-actions">
        <el-button size="small" :disabled="busy" @click="pick()">{{ t('cfUploadImages') }}</el-button>
        <el-button size="small" type="primary" :loading="busy" @click="save()">{{ tc('cSave') }}</el-button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.pi-block { display: grid; gap: 8px; margin: 4px 0 16px; padding: 12px; border-radius: 12px;
  border: 1px dashed rgba(255, 255, 255, 0.16); }
.pi-head { display: flex; align-items: baseline; gap: 10px; }
.pi-title { font-size: 0.875rem; font-weight: 600; }
.pi-hint { margin: 0; font-size: 0.75rem; opacity: 0.55; }
.pi-warn { color: #ffb236; opacity: 0.9; }
.pi-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.pi-item { position: relative; display: grid; gap: 2px; }
.pi-img { width: 88px; height: 88px; object-fit: cover; border-radius: 10px; display: block; }
.pi-ops { display: flex; gap: 3px; justify-content: center; }
.pi-btn {
  width: 22px; height: 22px; border-radius: 6px; cursor: pointer; font-family: inherit; line-height: 1;
  border: 1px solid rgba(255, 255, 255, 0.16); background: none; color: inherit;
}
/* 拖拽手柄：触屏拖拽必须关掉浏览器默认滚动（否则 pointermove 会被页面滚动吞掉） */
.pi-handle { cursor: grab; touch-action: none; }
.pi-handle:active { cursor: grabbing; }
.pi-item.dragging { outline: 2px solid var(--accent, #4f9cf9); border-radius: 10px; opacity: 0.85; }
.pi-btn:disabled { opacity: 0.3; cursor: default; }
.pi-del { border-color: rgba(248, 113, 113, 0.4); color: #f87171; }
.pi-file { display: none; }
.pi-actions { display: flex; gap: 8px; }
</style>
