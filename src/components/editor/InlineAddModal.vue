<script setup>
/* ==========================================================================
 * InlineAddModal.vue —— 就地编辑弹窗（照片 / 简历 / 动态 / 更新日志 共用）
 *
 * 用法：<InlineAddModal kind="photo" :open="x" @close="x=false" @saved="reload" />
 * 站长在前台对应位置点「＋」→ 本弹窗 → 填表/选文件 → 保存后 emit('saved')
 *
 * 上传链路：文件先向 /api/editor/sign-upload 要签名 URL，再直传 Supabase；
 * 元数据 POST 到对应 /api/<kind>。
 * ========================================================================== */
import { ref, watch, computed } from 'vue';
import { postJSON } from '@/api/http';
import { uploadToBucket, makePath } from '@/core/supabase';
import { compressImage } from '@/core/image';
import { useI18n } from '@/core/i18n';

const props = defineProps({
  kind: { type: String, required: true },   // photo | resume | moment | log
  open: { type: Boolean, default: false },
});
const emit = defineEmits(['close', 'saved']);
const { t: tc } = useI18n('common');

const busy = ref(false);
const msg = ref('');
const title = ref('');
const desc = ref('');
const content = ref('');
const version = ref('');
const files = ref([]);

const isLog = computed(() => props.kind === 'log');
const isResume = computed(() => props.kind === 'resume');
const isMoment = computed(() => props.kind === 'moment');
const isPhoto = computed(() => props.kind === 'photo');

const accept = computed(() => {
  if (isResume.value) return 'application/pdf';
  if (isMoment.value) return 'image/*,application/pdf';
  return 'image/*';
});
const multiple = computed(() => isPhoto.value || isMoment.value);

watch(() => props.open, (v) => {
  if (!v) return;
  busy.value = false; msg.value = ''; title.value = ''; desc.value = '';
  content.value = ''; version.value = ''; files.value = [];
});

function pick(e) { files.value = Array.from((e.target && e.target.files) || []); }

async function save() {
  busy.value = true; msg.value = tc('cUploading');
  try {
    /* ---- 更新日志：纯文本，直接 POST ---- */
    if (isLog.value) {
      if (!title.value.trim() || !content.value.trim()) { msg.value = tc('cNeedTitleContent'); busy.value = false; return; }
      await postJSON('/api/ebook', { title: title.value.trim(), content: content.value });
      msg.value = tc('cSaved'); emit('saved'); emit('close');
      busy.value = false; return;
    }
    /* ---- 简历：单个 PDF ---- */
    if (isResume.value) {
      const f = files.value[0];
      if (!f) { msg.value = tc('cPickFile'); busy.value = false; return; }
      if (f.type !== 'application/pdf') { msg.value = tc('cPdfOnly'); busy.value = false; return; }
      const path = makePath('cv', f);
      await uploadToBucket('resume', path, f);
      await postJSON('/api/resume', { storage_path: path, version: version.value || '', size_bytes: f.size });
      msg.value = tc('cSaved'); emit('saved'); emit('close');
      busy.value = false; return;
    }
    /* ---- 照片 / 动态：多文件上传 ---- */
    if (!files.value.length) { msg.value = tc('cPickFile'); busy.value = false; return; }
    if (isMoment.value && !content.value.trim()) { msg.value = tc('cNeedContent'); busy.value = false; return; }
    const bucket = isPhoto.value ? 'photos' : 'moments';
    const paths = [];
    const kept = [];
    for (const raw of files.value) {
      /* 图片先压到 ≤300KB 再传（PDF 等非图片原样） */
      const f = await compressImage(raw, 300 * 1024);
      const path = makePath(isPhoto.value ? 'wall' : 'mm', f);
      await uploadToBucket(bucket, path, f);
      paths.push(path); kept.push(f);
    }
    if (isPhoto.value) {
      for (let i = 0; i < paths.length; i++) {
        await postJSON('/api/photos', {
          title: title.value.trim() || (kept[i].name || '').replace(/\.[^.]+$/, ''),
          description: desc.value || '', storage_path: paths[i], sort_order: 999,
        });
      }
    } else {
      await postJSON('/api/moments', { content: content.value.trim(), images: paths, location: '' });
    }
    msg.value = tc('cSaved'); emit('saved'); emit('close');
  } catch (err) {
    msg.value = tc('cUploadFail') + ': ' + (err && err.message ? err.message : err);
  }
  busy.value = false;
}
</script>

<template>
  <Teleport to="#overlayRoot">
    <div class="inline-edit-overlay" :hidden="!open" @click.self="emit('close')">
      <div class="inline-edit-modal" role="dialog">
        <el-button class="inline-edit-close" size="small" circle @click="emit('close')">✕</el-button>
        <h3 class="inline-edit-title">
          {{ isPhoto ? tc('cAddPhoto') : isResume ? tc('cAddResume') : isMoment ? tc('cAddMoment') : tc('cAddLog') }}
        </h3>

        <div class="inline-edit-body">
          <input v-if="isLog || isPhoto" v-model="title" class="inline-edit-input" :placeholder="isLog ? tc('cTitlePh') : tc('cPhotoTitlePh')" />
          <textarea v-if="isLog || isMoment" v-model="content" class="inline-edit-area" rows="5" :placeholder="isLog ? tc('cContentPh') : tc('cMomentPh')"></textarea>
          <input v-if="isPhoto" v-model="desc" class="inline-edit-input" :placeholder="tc('cDescPh')" />
          <input v-if="isResume" v-model="version" class="inline-edit-input" :placeholder="tc('cVersionPh')" />
          <input type="file" :accept="accept" :multiple="multiple" :disabled="busy" @change="pick" />
          <p v-if="msg" class="inline-edit-msg">{{ msg }}</p>
        </div>

        <div class="inline-edit-actions">
          <el-button size="small" @click="emit('close')">{{ tc('cCancel') }}</el-button>
          <el-button size="small" type="primary" :disabled="busy" @click="save">{{ tc('cSave') }}</el-button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
