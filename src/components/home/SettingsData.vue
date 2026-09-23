<script setup>
/* ==========================================================================
 * SettingsData.vue —— 设置面板里的「数据管理」+「数据统计」分组（主站专属）
 *
 * 原状：src/modules/pages/home.js 的 updateLocalStats + resetQuickBtn /
 *   exportCfgBtn / importCfgBtn 三段监听 + 一个临时 toast 函数。
 * 现在：统计是响应式的（条目数直接读 store），存储占用在面板打开时重算；
 *   提示复用共享的 showToast（原站那份 showCfgToast 与它逐行同款）。
 *
 * 存储占用口径照旧：zelm_settings / zelm_quicklinks / zelm_resources 三个键的
 * 字符数 × 2（UTF-16 估算），超过 1KB 用 KB 显示。
 * ========================================================================== */
import { ref, watch } from 'vue';
import { useI18n } from '@/core/i18n';
import { useLibraryStore, LS_QUICK, LS_RES } from '@/stores/library';
import { useSettingsStore, SETTINGS_KEY, DEFAULT_SETTINGS } from '@/stores/settings';
import { zelmConfirm } from '@/modules/confirm';
import { showToast } from '@/modules/toast';

const { t } = useI18n('home');
const lib = useLibraryStore();
const st = useSettingsStore();

/* ---------------- 数据统计 ---------------- */
const storageText = ref('0 B');
function updateStats() {
  let total = 0;
  try {
    [SETTINGS_KEY, LS_QUICK, LS_RES].forEach((k) => {
      const v = localStorage.getItem(k);
      if (v) total += v.length * 2;   // UTF-16 双字节估算
    });
  } catch (e) { /* 忽略 */ }
  storageText.value = total > 1024 ? (total / 1024).toFixed(1) + ' KB' : total + ' B';
}
/* 原站是打开设置面板时算一次 */
watch(() => st.panelOpen, (v) => { if (v) updateStats(); }, { immediate: true });

/* ---------------- 数据管理 ---------------- */
async function resetQuick() {
  if (!(await zelmConfirm(t('resetQuickConfirm')))) return;
  lib.quickReset();
}

function exportCfg() {
  const cfg = { settings: { ...st.s }, quickLinks: lib.quick, resources: lib.resources };
  const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  a.href = URL.createObjectURL(blob);
  a.download = 'zelm-config-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.json';
  a.click();
  /* P3-10：导出后延迟 1s 再回收 Blob URL。部分浏览器在 a.click() 后仍需短暂
     持有该 URL 才能完成下载，立即 revoke 会导致下载失败/文件为空。 */
  setTimeout(() => { try { URL.revokeObjectURL(a.href); } catch (e) { /* 忽略 */ } }, 1000);
  showToast(t('cfgExported'));
}

/* ---------------- 配置导入净化（P2-1） ----------------
 * 导入的 JSON 来自用户本地文件，不可信。这里做三件事：
 *   ① 字段类型/长度收敛，避免异常大值或畸形对象拖垮渲染；
 *   ② URL 仅放行 http/https/mailto，拦掉 javascript: 等危险协议
 *      （否则导入的 item.url 经 :href 渲染后点击即执行脚本）；
 *   ③ icon/name/desc 等文本截断，渲染端已统一改用 v-text，这里再兜一层。
 * 注意：真正的 XSS 出口（QuickLinks/Resources 的图标渲染）已改成 v-text，
 *       此处净化是纵深防御 + 阻断 javascript: URL 这一独立攻击面。 */
function safeText(v, max) {
  return typeof v === 'string' ? v.slice(0, max || 200) : '';
}
function safeUrl(u) {
  if (typeof u !== 'string') return '';
  const s = u.trim();
  return /^(https?:|mailto:)/i.test(s) ? s.slice(0, 2000) : '';
}
function sanitizeList(arr, mapFn) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((it) => it && typeof it === 'object')
    .map(mapFn)
    .filter((it) => it && (it.name || it.title) && it.url);
}
function sanitizeQuick(arr) {
  return sanitizeList(arr, (q) => ({
    id: safeText(q.id, 64),
    name: safeText(q.name, 120),
    url: safeUrl(q.url),
    icon: safeText(q.icon, 16),
    desc: safeText(q.desc, 400),
    group: safeText(q.group, 32),
    pinned: !!q.pinned,
  }));
}
function sanitizeRes(arr) {
  return sanitizeList(arr, (r) => ({
    id: safeText(r.id, 64),
    title: safeText(r.title, 120),
    url: safeUrl(r.url),
    icon: safeText(r.icon, 16),
    desc: safeText(r.desc, 400),
    cat: safeText(r.cat, 32),
    tags: Array.isArray(r.tags)
      ? r.tags.filter((t) => typeof t === 'string').map((t) => safeText(t, 40)).slice(0, 8)
      : [],
  }));
}

const fileEl = ref(null);

/** 原生 <input type="file"> 的 change：e.target.files[0] 就是 File */
function onImportFile(e) {
  const file = e && e.target && e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const cfg = JSON.parse(reader.result);
      /* 直接写回三个存储键再刷新 —— 与原站一致（原站也是 saveSettings 后 reload），
       * 避免导入过程中与当前内存里的 store 状态互相打架。 */
      if (cfg.settings) {
        const merged = { ...DEFAULT_SETTINGS, ...cfg.settings };
        merged.games = { ...DEFAULT_SETTINGS.games, ...((cfg.settings && cfg.settings.games) || {}) };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
      }
      if (Array.isArray(cfg.quickLinks)) localStorage.setItem(LS_QUICK, JSON.stringify(sanitizeQuick(cfg.quickLinks)));
      if (Array.isArray(cfg.resources)) localStorage.setItem(LS_RES, JSON.stringify(sanitizeRes(cfg.resources)));
      showToast(t('cfgImported'));
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      showToast(t('cfgBad'));
    }
  };
  reader.readAsText(file);
  /* 清空 value，否则连续选同一个文件不会再触发 change */
  if (fileEl.value) fileEl.value.value = '';
}
</script>

<template>
  <section class="settings-group">
    <h3>{{ t('groupData') }}</h3>
    <div class="data-actions data-grid">
      <button id="exportCfgBtn" type="button" class="settings-btn" @click="exportCfg">{{ t('exportCfg') }}</button>
      <!-- 原生 file input 藏在 label 后面：点 label 等于点 input，不需要 el-upload -->
      <label id="importCfgBtn" class="settings-btn" for="importCfgFile">
        {{ t('importCfg') }}
        <input
id="importCfgFile" ref="fileEl" type="file" accept="application/json"
          hidden @change="onImportFile" />
      </label>
      <button id="resetQuickBtn" type="button" class="settings-btn" @click="resetQuick">{{ t('resetQuick') }}</button>
    </div>
  </section>

  <section class="settings-group">
    <h3>{{ t('groupStats') }}</h3>
    <div class="stats-rows">
      <div class="stat-line"><span>{{ t('statQuickCount') }}</span><b id="statQuickCount">{{ lib.quick.length }}</b></div>
      <div class="stat-line"><span>{{ t('statResCount') }}</span><b id="statResCount">{{ lib.resources.length }}</b></div>
      <div class="stat-line"><span>{{ t('statStorage') }}</span><b id="statStorage">{{ storageText }}</b></div>
    </div>
    <p class="visitor-line">{{ t('statsTip') }}</p>
  </section>
</template>
