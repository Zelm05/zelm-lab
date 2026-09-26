<script setup>
/* ==========================================================================
 * SocialLinksEditor.vue —— 后台「关于我」里的社交链接管理
 *
 * 数据模型：about_social_links（主表，与语言无关）+ about_social_link_translations（label 多语言）。
 *
 * 交互取舍：
 *   · 用**上下箭头**排序而不是 HTML5 拖拽 —— 拖拽在触屏上不可用，且需要自己处理
 *     dragenter/dragover/drop 的一堆边界；箭头两个按钮就能覆盖同样的能力，且手机可用。
 *   · 「保存」一次性提交：新增的 POST、改过的 PUT、标删的 DELETE，减少来回点击。
 *   · label 跟随父级编辑器的**当前语言** —— 切到 English 就是在编辑英文显示名。
 * ========================================================================== */
import { ref, onMounted } from 'vue';
import { adminList, adminSave, adminRemove } from '@/api/content';
import { useI18n } from '@/core/i18n';

const props = defineProps({
  /** 当前编辑语言：决定 label 读写哪个语言的翻译 */
  lang: { type: String, default: 'zh-CN' },
});

const { t } = useI18n('admin');
const { t: tc } = useI18n('common');

const rows = ref([]);
const busy = ref(false);
const msg = ref('');
const loaded = ref(false);

/** 拉取全量（含隐藏项与所有语言） */
async function load() {
  const d = await adminList('social-links');
  rows.value = (d.items || []).map((it) => ({
    id: it.id,
    platform: it.platform || '',
    url: it.url || '',
    icon: it.icon || '',
    visible: it.visible == null ? true : !!Number(it.visible),
    sort_order: Number(it.sort_order) || 0,
    /* 各语言的 label 都留着，保存时只回写当前语言，不覆盖其它语言 */
    tr: it.translations || {},
    _deleted: false,
  }));
  loaded.value = true;
}

function labelOf(row) {
  const o = row.tr[props.lang] || {};
  return o.label == null ? '' : o.label;
}
function setLabel(row, v) {
  if (!row.tr[props.lang]) row.tr[props.lang] = {};
  row.tr[props.lang].label = v;
}

function addRow() {
  const maxSort = rows.value.reduce((m, r) => Math.max(m, r.sort_order || 0), 0);
  rows.value.push({
    id: null, platform: '', url: '', icon: '', visible: true,
    sort_order: maxSort + 10, tr: {}, _deleted: false,
  });
}
function removeRow(i) {
  const r = rows.value[i];
  if (r.id) r._deleted = true;      /* 已有记录标删，保存时真正删除 */
  else rows.value.splice(i, 1);      /* 还没入库的直接移除 */
}
/** 上移/下移：直接交换 sort_order，保存时落库 */
function move(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= rows.value.length) return;
  const a = rows.value[i];
  const b = rows.value[j];
  const tmp = a.sort_order;
  a.sort_order = b.sort_order;
  b.sort_order = tmp;
  rows.value[i] = b;
  rows.value[j] = a;
}

async function save() {
  busy.value = true;
  msg.value = '';
  let ok = 0;
  let fail = 0;
  for (const r of rows.value) {
    if (r._deleted) {
      if (r.id) { const res = await adminRemove('social-links', r.id); res.ok ? ok++ : fail++; }
      continue;
    }
    if (!r.platform.trim() || !r.url.trim()) continue;   /* 空行跳过，不报错 */
    const payload = {
      platform: r.platform.trim(),
      url: r.url.trim(),
      icon: r.icon,
      visible: r.visible ? 1 : 0,
      sort_order: r.sort_order,
      /* 只提交当前语言；空 label 不提交，避免把已有翻译覆盖成空 */
      translations: labelOf(r).trim() ? { [props.lang]: { label: labelOf(r) } } : {},
    };
    const res = r.id ? await adminSave('social-links', payload, r.id)
      : await adminSave('social-links', payload);
    if (res.ok) {
      ok++;
      if (!r.id && res.id) r.id = res.id;   /* 记住新 id，重复保存不会重复插入 */
    } else { fail++; msg.value = res.error || ''; }
  }
  await load();
  busy.value = false;
  msg.value = fail ? (tc('cSaveFail') + '：' + msg.value) : (t('cfSaved') + '（' + ok + '）');
}

onMounted(load);
</script>

<template>
  <div class="sl-block">
    <div class="sl-head">
      <span class="sl-title">{{ t('cfSocialLinks') }}</span>
      <span class="sl-hint">{{ t('cfSocialHint') }}</span>
    </div>

    <p v-if="!loaded" class="sl-hint">…</p>
    <p v-else-if="!rows.length" class="sl-hint">{{ t('cfNoData') }}</p>

    <ul v-else class="sl-list">
      <li v-for="(r, i) in rows" :key="r.id || 'new' + i" class="sl-row">
        <input v-model="r.icon" class="sl-input sl-icon" maxlength="4" :aria-label="t('cfSocialIcon')" />
        <input v-model="r.platform" class="sl-input sl-plat" :placeholder="t('cfSocialPlatform')" />
        <input v-model="r.url" class="sl-input sl-url" placeholder="https://…" />
        <input
          :value="labelOf(r)" class="sl-input sl-label"
          :placeholder="t('cfSocialLabel') + ' · ' + lang"
          @input="setLabel(r, $event.target.value)"
        />
        <label class="sl-vis" :title="t('cfVisible')">
          <input v-model="r.visible" type="checkbox" />
        </label>
        <span class="sl-ops">
          <button type="button" class="sl-btn" :disabled="i === 0" @click="move(i, -1)">↑</button>
          <button type="button" class="sl-btn" :disabled="i === rows.length - 1" @click="move(i, 1)">↓</button>
          <button type="button" class="sl-btn sl-del" @click="removeRow(i)">✕</button>
        </span>
      </li>
    </ul>

    <p v-if="msg" class="sl-hint">{{ msg }}</p>
    <div class="sl-actions">
      <el-button size="small" :disabled="busy" @click="addRow()">{{ t('cfNew') }}</el-button>
      <el-button size="small" type="primary" :loading="busy" @click="save()">{{ tc('cSave') }}</el-button>
    </div>
  </div>
</template>

<style scoped>
.sl-block { display: grid; gap: 8px; margin: 4px 0 16px; padding: 12px; border-radius: 12px;
  border: 1px dashed rgba(255, 255, 255, 0.16); }
.sl-head { display: flex; align-items: baseline; gap: 10px; }
.sl-title { font-size: 0.875rem; font-weight: 600; }
.sl-hint { margin: 0; font-size: 0.75rem; opacity: 0.55; }
.sl-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.sl-row { display: flex; align-items: center; gap: 6px; }
.sl-input {
  padding: 6px 8px; border-radius: 8px; font-size: 0.8125rem; font-family: inherit;
  border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.06); color: inherit;
  min-width: 0;
}
.sl-icon { width: 46px; flex: 0 0 auto; text-align: center; }
.sl-plat { width: 92px; flex: 0 0 auto; }
.sl-url { flex: 2 1 140px; }
.sl-label { flex: 1 1 90px; }
.sl-vis { flex: 0 0 auto; display: flex; align-items: center; }
.sl-vis input { width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; }
.sl-ops { flex: 0 0 auto; display: flex; gap: 3px; }
.sl-btn {
  width: 24px; height: 24px; border-radius: 6px; cursor: pointer; font-family: inherit;
  border: 1px solid rgba(255, 255, 255, 0.16); background: none; color: inherit; line-height: 1;
}
.sl-btn:disabled { opacity: 0.3; cursor: default; }
.sl-del { border-color: rgba(248, 113, 113, 0.4); color: #f87171; }
.sl-actions { display: flex; gap: 8px; }
</style>
