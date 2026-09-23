/* ==========================================================================
 * src/stores/settings.js —— 用户偏好设置（Pinia）
 *
 * 原状：主站与关于页各写了一套 DEFAULT_SETTINGS + loadSettings + saveSettings
 * + applySettings + updateSegs（两页共约 300 行几乎相同的代码），
 * 主题还额外散在 boot.js、index.html 内联脚本、gate/admin 的 head 脚本里。
 * 现在：设置只有这一份，持久化只有这一处，落到 <html> 上的标记也只有这一处。
 *
 * 键名与原站 localStorage('zelm_settings') 完全一致 —— 老用户的设置不会丢。
 * 面板 UI 在 components/SettingsPanel.vue，两页共用。
 * ========================================================================== */
import { defineStore } from 'pinia';
import { reactive, watch, ref } from 'vue';

export const SETTINGS_KEY = 'zelm_settings';
export const SETTINGS_VERSION = 4;

/** 默认偏好（合并了原站主站 / 关于页两份 DEFAULT_SETTINGS） */
export const DEFAULT_SETTINGS = {
  fontSize: 'medium',
  overlay: 55,
  stars: true,
  games: { memory: true, snake: true, tetris: true, minesweeper: true, runner: true },
  theme: 'dark',            // light | dark
  scheme: 'default',        // default | morandi | eye | sunset | ocean | violet | sakura | aurora
  font: 'sans',             // sans | mono
  animations: true,
  backgroundFx: false,      // 简约粒子背景
  navMode: 'fixed',         // fixed | hide
  toc: true,                // 侧边目录
  smoothScroll: true,
  visitorCount: true,       // 访客统计
  externalBlank: true,      // 外链新开标签页
};

const FONT_MAP = { small: '90%', medium: '100%', large: '112%' };

/**
 * 版本化迁移（P3-1）：无 __v（老用户）或 __v 落后于当前版本的，只保留当前 schema
 * 认识的键，丢弃历史残留字段（防旧字段累积导致 UI 异常），再与默认值合并
 * （缺失的新键自动补默认）；同版本数据直接合并即可。主题非法值（如已取消的
 * 'system'）一律归一到 dark。返回对象始终带 __v = SETTINGS_VERSION。
 */
export function migrateSettings(saved) {
  let m;
  if (saved.__v !== SETTINGS_VERSION) {
    const migrated = {};
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (saved[k] !== undefined) migrated[k] = saved[k];
    }
    migrated.games = { ...DEFAULT_SETTINGS.games, ...(saved.games || {}) };
    m = { ...DEFAULT_SETTINGS, ...migrated };
  } else {
    m = { ...DEFAULT_SETTINGS, ...saved };
    m.games = { ...DEFAULT_SETTINGS.games, ...(saved.games || {}) };
  }
  m.theme = m.theme === 'light' ? 'light' : 'dark';
  m.__v = SETTINGS_VERSION;
  return m;
}

function readSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (!saved) return { ...DEFAULT_SETTINGS };
    return migrateSettings(saved);
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const s = reactive(readSaved());

  /* 面板开关状态（弹窗本身，不是持久化偏好） */
  const panelOpen = ref(false);
  function openPanel() { panelOpen.value = true; document.body.style.overflow = 'hidden'; }
  function closePanel() { panelOpen.value = false; document.body.style.overflow = ''; }

  /** 把偏好落到 <html>：主题 / 配色 / 字体 / 动画 / 平滑滚动 / 导航模式 / 侧边目录 */
  function apply() {
    const root = document.documentElement;
    root.style.fontSize = FONT_MAP[s.fontSize] || '100%';
    root.dataset.theme = s.theme === 'light' ? 'light' : 'dark';
    root.dataset.scheme = s.scheme || 'default';
    root.dataset.font = s.font || 'sans';
    root.classList.toggle('no-anim', !s.animations);
    root.style.scrollBehavior = s.smoothScroll ? 'smooth' : 'auto';
    // 「滚动隐藏」的类是挂在 <body> 上的 —— 选择器写的是 body.nav-hide-mode
    // .side-nav.nav-hidden，原站也是 document.body.classList.toggle(...)。
    // 之前这里误挂在 <html> 上，选择器永远匹配不到。
    document.body.classList.toggle('nav-hide-mode', s.navMode === 'hide');
    root.classList.toggle('toc-on', !!s.toc);
  }

  function persist() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...s, __v: SETTINGS_VERSION })); } catch (e) { /* 忽略 */ }
  }

  /** 改一项偏好：写入 + 落 DOM + 持久化（组件里直接 set('theme','light')） */
  function set(key, value) {
    s[key] = value;
    apply();
    persist();
  }
  /** 小游戏开关（嵌套对象，单独处理） */
  function setGame(key, on) {
    s.games[key] = on;
    persist();
  }
  /** 重置为默认：清掉本地记录并刷新（与原站行为一致） */
  function reset() {
    try { localStorage.removeItem(SETTINGS_KEY); } catch (e) { /* 忽略 */ }
    window.location.reload();
  }

  // 首次创建即应用一次（含直接进主站 / 关于页的场景）
  apply();

  // 跨标签页同步：另一个标签改了设置，本页跟随
  window.addEventListener('storage', (e) => {
    if (e.key !== SETTINGS_KEY || !e.newValue) return;
    try {
      const saved = JSON.parse(e.newValue);
      Object.keys(DEFAULT_SETTINGS).forEach((k) => {
        if (k === 'games') Object.assign(s.games, DEFAULT_SETTINGS.games, saved.games || {});
        else if (saved[k] !== undefined) s[k] = saved[k];
      });
      apply();
    } catch (err) { /* 忽略损坏数据 */ }
  });

  // 任何一项变化都重新落 DOM（面板里直接改 s.theme 也能生效）
  watch(s, apply, { deep: true });

  return { s, panelOpen, openPanel, closePanel, apply, set, setGame, reset };
});
