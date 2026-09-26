<script setup>
/* ==========================================================================
 * ContentPanel.vue —— 后台「内容管理」面板（2026-09-26 多语言内容）
 *
 * 覆盖 6 个模块：关于我 / 博客 / 证书 / 项目作品 / 日志 / 动态
 *   · 列表：每条显示标题 + **各语言是否已填**的小徽章
 *   · 编辑：顶部语言切换器（四语），切语言即切表单字段；
 *           未填的语言标「未翻译」，填了标「已填写」
 *   · 删除：走全站统一的确认弹窗（zelmConfirm）
 *   · 文件：复用已有 Supabase 上传通道（photos / moments 桶 + 目录前缀）
 *
 * ⚠️ 接口约定：adminSave/adminList 返回的是 { ok, ... } 包装对象，
 *    写操作**必须检查 ok**，否则失败会被当成成功（本项目踩过这个坑）。
 * ========================================================================== */
import { ref, computed, onMounted, watch } from 'vue';
import { LANGS, useI18n } from '@/core/i18n';
import { adminList, adminSave, adminRemove } from '@/api/content';
import { postJSON } from '@/api/http';
import { zelmConfirm } from '@/modules/confirm';
import { uploadToBucket, makePath, resolveAssetUrl, storeAssetRef, splitAssetRef, deleteObject, listObjects } from '@/core/supabase';
import { compressImage } from '@/core/image';
import { useContentStore } from '@/stores/content';
import { useDialog } from '@/composables/useDialog';
import { MODULES, FIELDS, TITLE_FIELD, STORE_BUCKETS, toForm, fromForm } from './content-fields';
import SocialLinksEditor from './SocialLinksEditor.vue';
import ProjectImagesEditor from './ProjectImagesEditor.vue';

const { t } = useI18n('admin');
const { t: tc } = useI18n('common');
const content = useContentStore();

/* 初始模块来自 store：前台页面的「管理」按钮会先 openAdmin('photos') 再跳过来，
   这样**只有这一套管理界面**，前台按钮只是入口。
   lockModule（可选）：前台就地弹层传入 —— 锁定单个模块、隐藏 tab 栏，
   点「管理照片」就只看到照片的编辑界面（每个区块自己的管理窗口）。 */
const props = defineProps({
  /** 非空时锁定到该模块：不显示模块切换 tab，标题显示模块名 */
  lockModule: { type: String, default: '' },
});
const activeMod = ref(props.lockModule || content.adminModule || 'about');
const items = ref([]);
const loading = ref(false);
const loadErr = ref('');
const busy = ref(false);
const msg = ref('');

/* 编辑器状态：null = 关闭；{ id, main:{}, tr:{ lang: {field:value} } } */
const editor = ref(null);
const editLang = ref('zh-CN');
const pendingField = ref(null);   /* 当前等待选文件的字段 */
const fileEl = ref(null);
const panelEl = ref(null);

useDialog(() => !!editor.value, { onClose: () => closeEditor(), panelRef: panelEl });

const currentModule = computed(() => MODULES.filter((m) => m.key === activeMod.value)[0]);
const currentFields = computed(() => FIELDS[activeMod.value] || { main: [], tr: [] });

/* ---------------- 存储文件（桶内容浏览） ----------------
 * 让站长直接看到本模块对应 Supabase 桶里实际有哪些文件（大小/时间），
 * 并可删除 —— 典型用途：清理换图/删记录后残留的孤儿文件。
 * ⚠️ 删文件不会动数据库行；行里若还引用着它，前台会裂图。 */
const storeBuckets = computed(() => STORE_BUCKETS[activeMod.value] || []);
const storeOpen = ref(false);
const storeBusy = ref(false);
const storeFiles = ref([]);   /* [{ bucket, name, size, updated }] */

watch(activeMod, () => { storeOpen.value = false; storeFiles.value = []; });

async function toggleStore() {
  storeOpen.value = !storeOpen.value;
  if (storeOpen.value) await loadStore();
}
async function loadStore() {
  if (!storeBuckets.value.length) return;
  storeBusy.value = true;
  const out = [];
  for (const b of storeBuckets.value) {
    for (const it of await listObjects(b)) out.push({ bucket: b, name: it.name, size: it.size, updated: it.updated });
  }
  out.sort((a, x) => a.name < x.name ? -1 : 1);
  storeFiles.value = out;
  storeBusy.value = false;
}
async function delFile(bucket, name) {
  const ok = await zelmConfirm(t('cfStoreDelConfirm') + '\n' + bucket + ' / ' + name);
  if (!ok) return;
  storeBusy.value = true;
  await deleteObject(bucket, name);
  await loadStore();
}
/** 字节数 → 可读大小 */
function fmtSize(n) {
  if (!n) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}
/** 列表行缩略图：模块第一个 image/images 字段有值就显示 */
function thumbOf(it) {
  const f = (currentFields.value.main || []).find((x) => x.type === 'image' || x.type === 'images');
  if (!f || !it[f.key]) return '';
  const v = it[f.key];
  if (f.type === 'images') {
    try { const a = JSON.parse(v); return a.length ? resolveAssetUrl(a[0], f.bucket) : ''; } catch (e) { return ''; }
  }
  return resolveAssetUrl(v, f.bucket);
}

/* ---------------- 列表 ---------------- */
async function load() {
  loading.value = true;
  loadErr.value = '';
  const d = await adminList(activeMod.value);
  items.value = d.items || [];
  loading.value = false;
  /* 接口失败时 adminList 返回空数组 —— 用一条提示避免「看着像没内容」 */
  if (!items.value.length && !d.langs.length) loadErr.value = t('edLoadFail');
}

function switchMod(k) {
  activeMod.value = k;
  load();
}

/** 列表标题：优先当前后台语言，其次默认语言，再退到任意一种 */
function titleOf(it) {
  const f = TITLE_FIELD[activeMod.value];
  const tr = it.translations || {};
  const pick = tr[editLang.value] || tr['zh-CN'] || Object.values(tr)[0] || {};
  const v = pick[f];
  if (v) return String(v).slice(0, 60);
  return '#' + it.id;
}

/* ---------------- 编辑器 ---------------- */
function blankTr() {
  const o = {};
  for (const lang of LANGS) {
    o[lang.code] = {};
    for (const f of currentFields.value.tr) o[lang.code][f.key] = '';
  }
  return o;
}

function openNew() {
  const main = {};
  for (const f of currentFields.value.main) main[f.key] = f.type === 'select' ? f.options[0][0] : '';
  editor.value = { id: null, main, tr: blankTr() };
  editLang.value = LANGS[0].code;
  msg.value = '';
}

function openEdit(it) {
  if (!it) { openNew(); return; }
  const main = {};
  for (const f of currentFields.value.main) {
    main[f.key] = toForm(f, it[f.key]);
    /* 日志/动态的日期来自 updated_at / created_at，接口用 `date` 接收 */
    /* 日期字段回填：不同模块的「发布时间」存在不同列 ——
       日志是 updated_at（历史原因，它当年既是修改时间也是发布时间）、
       博客是 published_at、动态是 created_at。
       ⚠️ 不能一律用 created_at：日志的 created_at 根本不存在，字段会永远空白。 */
    if (f.type === 'date' && !main[f.key]) {
      const from = currentFields.value.dateFrom || 'created_at';
      const ts = it[from] || it.created_at || it.updated_at;
      if (ts) main[f.key] = msToDate(ts);
    }
  }
  const tr = blankTr();
  const src = it.translations || {};
  for (const lang of Object.keys(src)) {
    if (!tr[lang]) continue;
    for (const f of currentFields.value.tr) {
      tr[lang][f.key] = toForm(f, src[lang][f.key]);
    }
  }
  /* 存一份原始 main：保存时用它对比出「被替换掉的旧文件」，删掉免得留孤儿 */
  editor.value = { id: it.id, main, tr, orig: Object.assign({}, it) };
  editLang.value = LANGS[0].code;
  msg.value = '';
}

function closeEditor() {
  editor.value = null;
  msg.value = '';
}

function msToDate(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '';
  const d = new Date(n);
  const p = (x) => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/** 该语言是否填了任何内容（用于「未翻译」标记） */
function langFilled(code) {
  if (!editor.value) return false;
  const o = editor.value.tr[code] || {};
  return currentFields.value.tr.some((f) => String(o[f.key] || '').trim() !== '');
}

/** 翻译完整度：已填语言数 / 总语言数 */
function completeness(it) {
  const tr = it.translations || {};
  const n = LANGS.filter((l) => {
    const o = tr[l.code] || {};
    return currentFields.value.tr.some((f) => String(o[f.key] || '').trim() !== '');
  }).length;
  return n + '/' + LANGS.length;
}

/* ---------------- 文件上传 ---------------- */
function pickFile(field) {
  pendingField.value = field;
  const el = fileEl.value;
  if (!el) return;
  el.accept = field.type === 'file' ? 'application/pdf' : 'image/*';
  el.value = '';
  el.click();
}

async function onFileChange(e) {
  const field = pendingField.value;
  const raw = (e.target && e.target.files && e.target.files[0]) || null;
  pendingField.value = null;
  if (!field || !raw || !editor.value) return;
  busy.value = true;
  msg.value = tc('cUploading');
  try {
    let f = raw;
    /* 图片先压缩，避免几 MB 的原图直传（与照片墙同一策略） */
    if (field.type !== 'file') f = await compressImage(raw, 400 * 1024);
    /* 路径规范 `<前缀>/<记录 id>/<文件名>`；新建时还没 id，用 new-<时间戳> 占位
       （路径一旦写进库就不再变，所以占位也不会影响后续读取） */
    const folder = editor.value.id ? String(editor.value.id) : 'new-' + Date.now();
    const path = makePath(field.prefix + '/' + folder, f);
    await uploadToBucket(field.bucket, path, f);
    /* 存「桶前缀引用」（bucket/path）：2026-09-26 起博客/证书改用专用桶，
       而老记录存的是裸路径。带上桶名后新旧共存，渲染时 resolveAssetUrl 自己判断。 */
    const ref = storeAssetRef(field.bucket, path);
    if (field.type === 'images') {
      const cur = editor.value.main[field.key];
      const arr = cur ? JSON.parse(cur) : [];
      arr.push(ref);
      editor.value.main[field.key] = JSON.stringify(arr);
    } else {
      editor.value.main[field.key] = ref;
    }
    msg.value = tc('cSaved');
  } catch (err) {
    msg.value = tc('cUploadFail') + '：' + (err && err.message ? err.message : err);
  } finally {
    busy.value = false;
  }
}

function imgPreview(field) {
  const v = editor.value && editor.value.main[field.key];
  if (!v) return '';
  if (field.type === 'images') {
    try { const a = JSON.parse(v); return a.length ? resolveAssetUrl(a[0], field.bucket) : ''; } catch (e) { return ''; }
  }
  return resolveAssetUrl(v, field.bucket);
}

/* ---------------- 机器翻译 ----------------
 * 以**默认语言**（zh-CN）为源，翻到当前正在编辑的语言，只填进表单 —— **不落库**。
 * 站长看到的是「机翻草稿，待校对」，改完再走正常保存流程。
 * 密钥只在 Worker 侧（wrangler secret），前端拿不到也传不了。 */
const translating = ref(false);
const draftLang = ref('');   /* 哪个语言的当前内容是机翻草稿（仅用于提示） */

async function machineTranslate() {
  if (!editor.value) return;
  const source = LANGS[0].code;
  const target = editLang.value;
  if (target === source) { msg.value = t('cfTranslate') + '：' + t('cfNeedTitle'); return; }

  /* 只送非空字段，省配额 */
  const texts = {};
  for (const f of currentFields.value.tr) {
    const v = String((editor.value.tr[source] || {})[f.key] || '').trim();
    if (v) texts[f.key] = v;
  }
  if (!Object.keys(texts).length) { msg.value = t('cfNeedTitle'); return; }

  translating.value = true;
  msg.value = t('cfTranslating');
  try {
    const r = await postJSON('/api/admin/translate', { texts, sourceLang: source, targetLang: target });
    if (!r.ok) {
      const d = r.data || {};
      msg.value = (d.error || ('HTTP ' + r.status)) + (d.hint ? '（' + d.hint + '）' : '');
      return;
    }
    const out = (r.data && r.data.translations) || {};
    if (!editor.value.tr[target]) editor.value.tr[target] = {};
    for (const k of Object.keys(out)) editor.value.tr[target][k] = out[k];
    draftLang.value = target;
    msg.value = t('cfTranslateDraft');
  } catch (e) {
    msg.value = String(e && e.message ? e.message : e);
  } finally {
    translating.value = false;
  }
}

/* ---------------- 保存 / 删除 ---------------- */
async function save() {
  if (!editor.value) return;
  /* 至少有一种语言填了内容，否则存下来在列表里没法辨认。
     ⚠️ tr 为空的模块（简历）没有语言概念，跳过这个校验 —— 否则永远存不下去。 */
  const hasTrFields = currentFields.value.tr.length > 0;
  const anyTr = !hasTrFields || LANGS.some((l) => langFilled(l.code));
  if (!anyTr) { msg.value = t('cfNeedTitle'); return; }

  busy.value = true;
  msg.value = '';
  const payload = {};
  for (const f of currentFields.value.main) {
    payload[f.key] = fromForm(f, editor.value.main[f.key]);
  }
  /* 只提交真正填了内容的语言，避免写入一堆空行把「未翻译」变成「已翻译」 */
  payload.translations = {};
  for (const l of LANGS) {
    if (langFilled(l.code)) payload.translations[l.code] = editor.value.tr[l.code];
  }

  const r = editor.value.id
    ? await adminSave(activeMod.value, payload, editor.value.id)
    : await adminSave(activeMod.value, payload);
  busy.value = false;
  if (!r.ok) { msg.value = tc('cSaveFail') + '：' + (r.error || ''); return; }

  /* 换了文件就把**旧的**删掉（换简历 PDF、换封面/头像都属于这种）。
     ⚠️ 必须放在保存成功之后：否则上传成功但写库失败时，会把还在用的文件删掉。 */
  await purgeReplacedFiles(activeMod.value, editor.value.orig, payload);

  msg.value = t('cfSaved');
  await load();
  /* 同步刷新前台内容（语言不变时也会重取一次，保证前台立刻看到） */
  await content.reload(activeMod.value);
  closeEditor();
}

/**
 * 删记录时**顺手清掉 Storage 里的文件**。
 *
 * 为什么必须做：`adminRemove` 只删 D1 的行（主表 + 翻译表），
 *   文件仍留在 Supabase —— 不清理的话，每删一条内容就多几个永久孤儿文件。
 *   （之前全项目**没有任何地方调用过 deleteObject**，等于只删记录不删文件。）
 * ⚠️ 先删库再删文件：万一大文件删除失败，也只会留个孤儿文件，
 *   不会出现「文件没了但记录还在」的坏数据。
 */
async function purgeFiles(mod, row) {
  if (!row) return;
  const fields = (FIELDS[mod] && FIELDS[mod].main) || [];
  for (const f of fields) {
    if (f.type !== 'image' && f.type !== 'file' && f.type !== 'images') continue;
    const raw = row[f.key];
    if (!raw) continue;
    let list = [raw];
    if (f.type === 'images') {
      try { const a = JSON.parse(raw); list = Array.isArray(a) ? a : []; } catch (e) { list = []; }
    }
    for (const v of list) {
      const { bucket, path: inner } = splitAssetRef(v, f.bucket);
      if (bucket && inner) {
        try { await deleteObject(bucket, inner); } catch (e) { /* 单个失败不影响整体 */ }
      }
    }
  }
}

/**
 * 保存时清理「被替换掉的旧文件」。
 *
 * 场景：站长重新上传简历 PDF / 换项目封面 / 换头像 —— 库里指向新文件了，
 *   旧文件却还留在 Supabase，越攒越多。
 * 只处理 image / file 这类**单值**字段；images（多图数组）由各自的编辑器管，
 *   这里不碰（避免把仍在用的图删掉）。
 * 只在「旧值非空 且 确实换了」时删 —— 值没动、或改成空，都不动文件。
 */
async function purgeReplacedFiles(mod, orig, payload) {
  if (!orig) return;
  const fields = (FIELDS[mod] && FIELDS[mod].main) || [];
  for (const f of fields) {
    if (f.type !== 'image' && f.type !== 'file') continue;
    const before = orig[f.key];
    const after = payload[f.key];
    if (!before || !after || before === after) continue;
    const { bucket, path: inner } = splitAssetRef(before, f.bucket);
    if (bucket && inner) {
      try { await deleteObject(bucket, inner); } catch (e) { /* 失败只留个孤儿，不影响业务 */ }
    }
  }
}

async function removeItem(it) {
  const name = titleOf(it);
  const ok = await zelmConfirm(t('cfDelConfirm') + '\n' + name);
  if (!ok) return;
  busy.value = true;
  const r = await adminRemove(activeMod.value, it.id);
  if (!r.ok) {
    busy.value = false;
    loadErr.value = tc('cSaveFail') + '：' + (r.error || '');
    return;
  }
  /* 记录删成功后再清文件（后端把被删的那行原样回传了，字段都在） */
  await purgeFiles(activeMod.value, r.removed);
  busy.value = false;
  await load();
  await content.reload(activeMod.value);
}

onMounted(load);
</script>

<template>
  <section class="cf-panel">
    <h3 class="cf-heading">{{ lockModule && currentModule ? t(currentModule.labelKey) : t('cfTitle') }}</h3>

    <!-- 模块切换（锁定单模块时隐藏 —— 前台弹层是各区块专属的管理窗口） -->
    <div v-if="!lockModule" class="cf-tabs">
      <button
        v-for="m in MODULES" :key="m.key" type="button"
        class="cf-tab" :class="{ on: activeMod === m.key }"
        @click="switchMod(m.key)"
      >{{ t(m.labelKey) }}</button>
    </div>

    <p v-if="loadErr" class="cf-msg cf-msg--err">{{ loadErr }}</p>

    <!-- 关于我：单条，直接编辑 -->
    <div v-if="currentModule && currentModule.single" class="cf-single">
      <p v-if="currentFields.tr.length" class="cf-hint">
        {{ t('cfCompleteness') }}：{{ items.length ? completeness(items[0]) : '0/' + LANGS.length }}
      </p>
      <el-button size="small" :disabled="busy" @click="openEdit(items[0] || null)">{{ t('cfEdit') }}</el-button>
    </div>

    <!-- 其余模块：列表 + 新建 -->
    <template v-else>
      <div class="cf-bar">
        <el-button size="small" :disabled="busy" @click="openNew()">{{ t('cfNew') }}</el-button>
        <span class="cf-hint">{{ items.length }}</span>
      </div>
      <p v-if="!items.length && !loading" class="cf-msg">{{ t('cfNoData') }}</p>
      <ul v-else class="cf-list">
        <li v-for="it in items" :key="it.id" class="cf-row">
          <img v-if="thumbOf(it)" class="cf-row-thumb" :src="thumbOf(it)" alt="" loading="lazy" width="36" height="36" />
          <span class="cf-row-title">{{ titleOf(it) }}</span>
          <span class="cf-badges">
            <span
              v-for="l in LANGS" :key="l.code"
              class="cf-badge" :class="{ on: (it.langs || []).indexOf(l.code) !== -1 }"
              :title="l.name"
            >{{ l.code }}</span>
          </span>
          <span class="cf-actions">
            <el-button size="small" :disabled="busy" @click="openEdit(it)">{{ t('cfEdit') }}</el-button>
            <el-button size="small" type="danger" :disabled="busy" @click="removeItem(it)">{{ tc('cDelete') }}</el-button>
          </span>
        </li>
      </ul>
    </template>

    <!-- 存储文件：本模块对应桶里的实际文件（可删除；删文件不动数据库行，
         行里若还引用着它前台会裂图 —— 确认框里已提示） -->
    <div v-if="storeBuckets.length" class="cf-store">
      <div class="cf-store-head">
        <span class="cf-hint">{{ t('cfStoreFiles') }} · {{ storeBuckets.join(' / ') }}</span>
        <el-button size="small" :disabled="storeBusy" @click="toggleStore">
          {{ storeOpen ? tc('cClose') : t('cfStoreView') }}
        </el-button>
      </div>
      <template v-if="storeOpen">
        <p v-if="!storeFiles.length && !storeBusy" class="cf-msg">{{ t('cfStoreEmpty') }}</p>
        <ul v-else class="cf-list">
          <li v-for="f in storeFiles" :key="f.bucket + '/' + f.name" class="cf-row">
            <span class="cf-row-title cf-ellipsis" :title="f.name">{{ f.name }}</span>
            <span class="cf-badges"><span class="cf-badge">{{ fmtSize(f.size) }}</span></span>
            <span class="cf-actions">
              <el-button size="small" type="danger" :disabled="storeBusy" @click="delFile(f.bucket, f.name)">{{ tc('cDelete') }}</el-button>
            </span>
          </li>
        </ul>
      </template>
    </div>

    <!-- 隐藏的文件选择器（所有上传共用一个） -->
    <input ref="fileEl" type="file" class="cf-file" @change="onFileChange" />

    <!-- 编辑器 -->
    <Teleport to="#overlayRoot">
      <div class="cf-overlay" :hidden="!editor" @click.self="closeEditor()">
        <div ref="panelEl" class="cf-modal" role="dialog" aria-modal="true" aria-labelledby="cfModalTitle">
          <el-button class="cf-close" size="small" circle :aria-label="tc('cClose')" @click="closeEditor()">✕</el-button>
          <h3 id="cfModalTitle" class="cf-modal-title">
            {{ currentModule ? t(currentModule.labelKey) : '' }} · {{ editor && editor.id ? t('cfEdit') : t('cfNew') }}
          </h3>

          <!-- 与语言无关的字段：只填一次 -->
          <div v-if="currentFields.main.length" class="cf-block">
            <div v-for="f in currentFields.main" :key="f.key" class="cf-field">
              <label class="cf-label">{{ t(f.labelKey) }}</label>
              <select v-if="f.type === 'select'" v-model="editor.main[f.key]" class="cf-input">
                <!-- 选项可指定命名空间（第三元素）；不指定就按 admin 取 -->
                <option v-for="o in f.options" :key="o[0]" :value="o[0]">{{ o[2] === 'common' ? tc(o[1]) : t(o[1]) }}</option>
              </select>
              <input v-else-if="f.type === 'date'" v-model="editor.main[f.key]" type="date" class="cf-input" />
              <template v-else-if="f.type === 'image' || f.type === 'images' || f.type === 'file'">
                <div class="cf-upload-row">
                  <el-button size="small" :disabled="busy" @click="pickFile(f)">{{ tc('cUpload') }}</el-button>
                  <span class="cf-hint cf-ellipsis">{{ editor.main[f.key] || tc('cEmpty') }}</span>
                </div>
                <img v-if="imgPreview(f)" class="cf-thumb" :src="imgPreview(f)" alt="" loading="lazy" width="72" height="72" />
              </template>
              <input
                v-else-if="f.type === 'switch'"
                v-model="editor.main[f.key]"
                type="checkbox" class="cf-check"
              />
              <input
                v-else-if="f.type === 'number'"
                v-model.number="editor.main[f.key]"
                type="number" class="cf-input cf-input--num"
              />
              <input v-else v-model="editor.main[f.key]" class="cf-input" />
            </div>
          </div>

          <!-- 子集合：社交链接挂在「关于我」下，图集挂在「项目作品」下 -->
          <SocialLinksEditor v-if="activeMod === 'about'" :lang="editLang" />
          <ProjectImagesEditor v-if="activeMod === 'projects'" :project-id="editor.id" />

          <!-- 语言切换器（仅后台编辑用，不影响前台语言）。
               tr 为空的模块（简历）没有翻译概念，整块隐藏。 -->
          <div v-if="currentFields.tr.length" class="cf-langs">
            <button
              v-for="l in LANGS" :key="l.code" type="button"
              class="cf-lang" :class="{ on: editLang === l.code }"
              @click="editLang = l.code"
            >
              <span class="cf-lang-name">{{ l.name }}</span>
              <em class="cf-lang-state" :class="{ filled: langFilled(l.code) }">
                {{ langFilled(l.code) ? t('cfTranslated') : t('cfUntranslated') }}
              </em>
            </button>
          </div>

          <!-- 机器翻译：以默认语言为源，翻到当前编辑语言；结果只填表单、不落库 -->
          <div v-if="currentFields.tr.length" class="cf-translate-row">
            <el-button
              size="small" :loading="translating"
              :disabled="editLang === LANGS[0].code"
              @click="machineTranslate()"
            >{{ t('cfTranslate') }}</el-button>
            <span v-if="draftLang === editLang" class="cf-draft">{{ t('cfTranslateDraft') }}</span>
          </div>

          <div v-if="currentFields.tr.length" class="cf-block">
            <div v-for="f in currentFields.tr" :key="f.key" class="cf-field">
              <label class="cf-label">{{ t(f.labelKey) }}</label>
              <textarea
                v-if="f.type === 'textarea' || f.type === 'csv' || f.type === 'exp'"
                v-model="editor.tr[editLang][f.key]"
                class="cf-input cf-textarea" :rows="f.rows || 3"
              ></textarea>
              <input v-else v-model="editor.tr[editLang][f.key]" class="cf-input" />
            </div>
          </div>

          <p v-if="msg" class="cf-msg">{{ msg }}</p>
          <div class="cf-modal-actions">
            <el-button size="small" @click="closeEditor()">{{ tc('cCancel') }}</el-button>
            <el-button size="small" type="primary" :loading="busy" @click="save()">{{ tc('cSave') }}</el-button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.cf-panel { display: grid; gap: 12px; }
.cf-heading { margin: 0; font-size: 1rem; }
.cf-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
.cf-tab {
  padding: 5px 12px; border-radius: 999px; cursor: pointer; font-family: inherit; font-size: 0.8125rem;
  border: 1px solid rgba(255, 255, 255, 0.14); background: none; color: inherit; opacity: 0.75;
}
.cf-tab.on { border-color: var(--accent); color: var(--accent); opacity: 1; }
.cf-bar { display: flex; align-items: center; gap: 10px; }
.cf-hint { font-size: 0.75rem; opacity: 0.55; }
.cf-msg { margin: 0; font-size: 0.8125rem; opacity: 0.8; }
.cf-msg--err { color: #f87171; }
.cf-single { display: flex; align-items: center; gap: 12px; }
.cf-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.cf-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px dashed rgba(255, 255, 255, 0.08); }
.cf-row-thumb { width: 36px; height: 36px; object-fit: cover; border-radius: 6px; flex: none; border: 1px solid rgba(255, 255, 255, 0.12); }
.cf-store { display: grid; gap: 6px; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.08); }
.cf-store-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.cf-row-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.875rem; }
.cf-badges { display: flex; gap: 4px; }
.cf-badge {
  padding: 1px 6px; border-radius: 999px; font-size: 0.625rem;
  border: 1px solid rgba(255, 255, 255, 0.16); opacity: 0.4;
}
.cf-badge.on { border-color: var(--accent); color: var(--accent); opacity: 1; }
.cf-actions { display: flex; gap: 6px; }
.cf-file { display: none; }
/* 开关（可见 / 置顶）：库里存 0/1，表单里是布尔 */
.cf-check { width: 18px; height: 18px; accent-color: var(--accent); cursor: pointer; }
.cf-input--num { max-width: 120px; }
.cf-overlay {
  position: fixed; inset: 0; z-index: 1000; padding: 20px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(2, 8, 6, 0.55); backdrop-filter: blur(8px);
}
.cf-overlay[hidden] { display: none; }
.cf-modal {
  position: relative; width: min(620px, 94vw); max-height: 88%; overflow: auto;
  padding: 20px; border-radius: 18px;
  background: var(--surface, #0a1c1a); border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
.cf-close { position: absolute; top: 12px; right: 12px; }
.cf-modal-title { margin: 0 0 14px; padding-right: 32px; font-size: 1.05rem; }
.cf-block { display: grid; gap: 10px; margin-bottom: 14px; }
.cf-field { display: grid; gap: 4px; }
.cf-label { font-size: 0.75rem; opacity: 0.7; }
.cf-input {
  width: 100%; box-sizing: border-box; padding: 8px 11px; border-radius: 10px; font-size: 0.875rem;
  border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.06); color: inherit; font-family: inherit;
}
.cf-textarea { resize: vertical; line-height: 1.6; }
.cf-upload-row { display: flex; align-items: center; gap: 8px; }
.cf-ellipsis { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cf-thumb { width: 72px; height: 72px; object-fit: cover; border-radius: 10px; }
.cf-langs { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 12px; }
.cf-translate-row { display: flex; align-items: center; gap: 10px; margin: 0 0 10px; }
.cf-draft { font-size: 0.6875rem; color: #ffb236; }
.cf-lang {
  display: grid; gap: 1px; padding: 5px 12px; border-radius: 10px; cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.14); background: none; color: inherit; font-family: inherit;
}
.cf-lang.on { border-color: var(--accent); color: var(--accent); }
.cf-lang-name { font-size: 0.8125rem; }
.cf-lang-state { font-size: 0.625rem; font-style: normal; opacity: 0.45; }
.cf-lang-state.filled { opacity: 0.8; }
.cf-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
</style>
