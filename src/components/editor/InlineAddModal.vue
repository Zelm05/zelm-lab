<script setup>
/* ==========================================================================
 * InlineAddModal.vue —— 「管理」弹窗（照片 / 简历 / 动态 / 日志 共用）
 *
 * 交互统一：前台每个内容区只有一个「管理」按钮（仅站长可见）→ 打开本弹窗，
 *          弹窗里**上半部分是现有列表（可删除）、下半部分是新增表单**。
 *          页面上不再有零散的「＋」按钮和 hover 删除。
 *
 * ⚠️ 项目封装 getJSON/postJSON 返回 { ok, status, data } —— 必须用 .data，且写请求要检查 ok。
 * ========================================================================== */
import { ref, watch, computed } from 'vue';
import { getJSON, postJSON, delJSON } from '@/api/http';
import { uploadToBucket, makePath, publicUrl, deleteObject } from '@/core/supabase';
import { compressImage } from '@/core/image';
import { useI18n } from '@/core/i18n';
import { useDialog } from '@/composables/useDialog';

const props = defineProps({
  kind: { type: String, required: true },   // photo | resume | moment | log
  open: { type: Boolean, default: false },
});
const emit = defineEmits(['close', 'saved']);
const { t: tc } = useI18n('common');
const { t: th } = useI18n('home');

const busy = ref(false);
const msg = ref('');
const title = ref('');
const desc = ref('');
const content = ref('');
const version = ref('');
const files = ref([]);
const logKind = ref('update');
const logDate = ref('');
const list = ref([]);

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
const titleText = computed(() => {
  if (isPhoto.value) return th('photoWallManage');
  if (isResume.value) return th('resumeUpload');
  if (isMoment.value) return th('momentsManage');
  return th('logsManage');
});

/* ---------- 列表（现有内容 + 删除） ---------- */
async function loadList() {
  try {
    if (isResume.value) {
      const r = await getJSON('/api/resume');
      list.value = (r && r.ok && r.data && r.data.item) ? [r.data.item] : [];
    } else {
      const url = isPhoto.value ? '/api/photos' : isMoment.value ? '/api/moments' : '/api/ebook';
      const r = await getJSON(url);
      list.value = (r && r.ok && r.data && r.data.items) || [];
    }
  } catch (e) { list.value = []; }
}

function filesOf(it) {
  try { return JSON.parse(it.images || '[]'); } catch (e) { return []; }
}

async function removeItem(it) {
  if (!window.confirm(tc('cConfirmDelete'))) return;
  msg.value = '';
  try {
    let d;
    if (isPhoto.value) {
      d = await delJSON('/api/photos/' + it.id);
      if (d.ok) await deleteObject('photos', it.storage_path);
    } else if (isMoment.value) {
      d = await delJSON('/api/moments/' + it.id);
      if (d.ok) for (const p of filesOf(it)) await deleteObject('moments', p);
    } else if (isLog.value) {
      d = await delJSON('/api/ebook/' + it.id);
    } else {
      return;   /* 简历只有一份，用「上传」覆盖即可 */
    }
    if (!d.ok) throw new Error((d.data && d.data.error) || ('HTTP ' + d.status));
    await loadList();
    emit('saved');
  } catch (e) { msg.value = tc('cSaveFail') + ': ' + (e.message || e); }
}

/* ---------- 新增 ---------- */
watch(() => props.open, (v) => {
  if (!v) return;
  busy.value = false; msg.value = ''; title.value = ''; desc.value = '';
  content.value = ''; version.value = ''; files.value = []; logKind.value = 'update'; logDate.value = '';
  loadList();
});

/* 无障碍（WCAG 2.1.2 / 2.4.3）：Esc 关闭 + Tab 在弹窗内循环 + 关闭后焦点归位。
   与 AuthPanel / ConfirmDialog 用的是同一套行为，已抽到 composables/useDialog。 */
const panelEl = ref(null);
useDialog(() => props.open, { onClose: () => emit('close'), panelRef: panelEl });

function pick(e) { files.value = Array.from((e.target && e.target.files) || []); }

async function mustPost(url, body) {
  const r = await postJSON(url, body);
  if (!r.ok) throw new Error((r.data && r.data.error) || ('HTTP ' + r.status));
  return r.data;
}

async function save() {
  busy.value = true; msg.value = tc('cUploading');
  try {
    if (isLog.value) {
      if (!title.value.trim() || !content.value.trim()) { msg.value = tc('cNeedTitleContent'); busy.value = false; return; }
      await mustPost('/api/ebook', { title: title.value.trim(), content: content.value, kind: logKind.value, date: logDate.value });
    } else if (isResume.value) {
      const f = files.value[0];
      if (!f) { msg.value = tc('cPickFile'); busy.value = false; return; }
      if (f.type !== 'application/pdf') { msg.value = tc('cPdfOnly'); busy.value = false; return; }
      const path = makePath('cv', f);
      await uploadToBucket('resume', path, f);
      await mustPost('/api/resume', { storage_path: path, version: version.value || '', size_bytes: f.size });
    } else {
      if (!files.value.length) { msg.value = tc('cPickFile'); busy.value = false; return; }
      if (isMoment.value && !content.value.trim()) { msg.value = tc('cNeedContent'); busy.value = false; return; }
      const bucket = isPhoto.value ? 'photos' : 'moments';
      const paths = []; const kept = [];
      for (const raw of files.value) {
        const f = await compressImage(raw, 300 * 1024);
        const path = makePath(isPhoto.value ? 'wall' : 'mm', f);
        await uploadToBucket(bucket, path, f);
        paths.push(path); kept.push(f);
      }
      if (isPhoto.value) {
        for (let i = 0; i < paths.length; i++) {
          await mustPost('/api/photos', {
            title: title.value.trim() || (kept[i].name || '').replace(/\.[^.]+$/, ''),
            description: desc.value || '', storage_path: paths[i], sort_order: 999,
          });
        }
      } else {
        await mustPost('/api/moments', { content: content.value.trim(), images: paths, location: '' });
      }
    }
    msg.value = tc('cSaved');
    await loadList();
    emit('saved');
  } catch (err) {
    msg.value = tc('cUploadFail') + ': ' + (err && err.message ? err.message : err);
  }
  busy.value = false;
}
</script>

<template>
  <Teleport to="#overlayRoot">
    <div class="inline-edit-overlay" :hidden="!open" @click.self="emit('close')">
      <div
        ref="panelEl"
        class="inline-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inlineEditTitle"
      >
        <el-button class="inline-edit-close" size="small" circle :aria-label="tc('cClose')" @click="emit('close')">✕</el-button>
        <h3 id="inlineEditTitle" class="inline-edit-title">{{ titleText }}</h3>

        <!-- 现有内容（可删除） -->
        <p v-if="!list.length" class="inline-edit-msg">{{ tc('cEmpty') }}</p>
        <ul v-else class="inline-edit-list">
          <li v-for="it in list" :key="it.id" class="inline-edit-row">
            <img
              v-if="isPhoto || isMoment"
              class="inline-edit-thumb"
              :src="publicUrl(isPhoto ? 'photos' : 'moments', isPhoto ? it.storage_path : filesOf(it)[0])"
              alt="" loading="lazy" decoding="async" width="52" height="52"
            />
            <span v-else class="inline-edit-name">{{ isResume ? (it.storage_path || '') : it.title }}</span>
            <button
              v-if="!isResume"
              type="button" class="inline-edit-btn inline-edit-danger"
              @click="removeItem(it)"
            >{{ tc('cDelete') }}</button>
          </li>
        </ul>

        <hr class="inline-edit-sep" />

        <!-- 新增 -->
        <div class="inline-edit-body">
          <div v-if="isLog" class="inline-edit-kinds">
            <button type="button" class="inline-edit-kind" :class="{ on: logKind === 'update' }" @click="logKind = 'update'">{{ tc('cLogUpdate') }}</button>
            <button type="button" class="inline-edit-kind" :class="{ on: logKind === 'personal' }" @click="logKind = 'personal'">{{ tc('cLogPersonal') }}</button>
          </div>
          <input v-if="isLog" v-model="logDate" type="date" class="inline-edit-input" />
          <input v-if="isLog || isPhoto" v-model="title" class="inline-edit-input" :placeholder="isLog ? tc('cTitlePh') : tc('cPhotoTitlePh')" />
          <textarea v-if="isLog || isMoment" v-model="content" class="inline-edit-area" rows="4" :placeholder="isLog ? tc('cContentPh') : tc('cMomentPh')"></textarea>
          <input v-if="isPhoto" v-model="desc" class="inline-edit-input" :placeholder="tc('cDescPh')" />
          <input v-if="isResume" v-model="version" class="inline-edit-input" :placeholder="tc('cVersionPh')" />
          <input type="file" :accept="accept" :multiple="multiple" :disabled="busy" @change="pick" />
          <p v-if="msg" class="inline-edit-msg">{{ msg }}</p>
        </div>

        <div class="inline-edit-actions">
          <el-button size="small" @click="emit('close')">{{ tc('cCancel') }}</el-button>
          <el-button size="small" type="primary" :disabled="busy" @click="save">{{ isResume ? tc('cUpload') : tc('cAdd') }}</el-button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
