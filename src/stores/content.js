/* ==========================================================================
 * content.js —— 动态内容 store（多语言）
 *
 * 职责：
 *   1) 存各模块的动态内容（about / blogs / certificates / projects / logs / moments / photos）
 *   2) **监听界面语言变化 → 自动重新请求**（这就是「语言切换跟随全局设置」的落地：
 *      用户改设置或 gate 切换 → setLocale() → 这里的 watch 触发 → 重新带 lang 请求 → 重渲染）
 *   3) 暴露回退信息（is_fallback），供页面显示「暂无 XX 版本」提示
 *
 * 设计要点：
 *   · **按需加载**：只有页面真的用到某个模块才会请求（ensure()），
 *     不在 store 初始化时把 7 个模块全拉一遍。
 *   · **语言变化只重取「已用到的」模块**，不浪费请求。
 *   · **接口失败不抛异常**：内容保持空，页面走自己的静态兜底，绝不白屏。
 * ========================================================================== */
import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { i18n, getLocale, LANGS, useI18n } from '@/core/i18n';
import { fetchContent } from '@/api/content';

/* 模块 → { ref, key }：about 是单条（item），其余是列表（items） */
const SPEC = {
  about: { ref: null, key: 'item' },
  blogs: { ref: null, key: 'items' },
  certificates: { ref: null, key: 'items' },
  projects: { ref: null, key: 'items' },
  logs: { ref: null, key: 'items' },
  moments: { ref: null, key: 'items' },
  photos: { ref: null, key: 'items' },
  /* 简历：单行（item），与语言无关（只有一个 PDF） */
  resume: { ref: null, key: 'item' },
};

export const useContentStore = defineStore('content', () => {
  const { t: tc } = useI18n('common');

  const lang = ref(getLocale());
  const about = ref(null);
  const blogs = ref([]);
  const certificates = ref([]);
  const projects = ref([]);
  const logs = ref([]);
  const moments = ref([]);
  const photos = ref([]);
  const resume = ref(null);

  /* 后台内容管理的当前模块。前台页面的「管理」按钮通过 openAdmin() 设置它，
     跳转到 /admin 后 ContentPanel 直接打开对应模块 —— 这样**只有一套管理界面**，
     前台按钮退化成入口而不是另一份编辑器。 */
  const adminModule = ref('about');
  function openAdmin(mod) { if (mod) adminModule.value = mod; }

  /* 每个模块「已按哪种语言加载过」—— 用于避免重复请求 */
  const loadedFor = ref({});
  /* 页面实际用到过的模块（语言切换时只重取这些） */
  const subscribed = new Set();

  SPEC.about.ref = about;
  SPEC.blogs.ref = blogs;
  SPEC.certificates.ref = certificates;
  SPEC.projects.ref = projects;
  SPEC.logs.ref = logs;
  SPEC.moments.ref = moments;
  SPEC.photos.ref = photos;
  SPEC.resume.ref = resume;

  async function fetchModule(mod) {
    const s = SPEC[mod];
    if (!s || !s.ref) return;
    const d = await fetchContent(mod);
    s.ref.value = s.key === 'item' ? (d.item || null) : (d.items || []);
    loadedFor.value = { ...loadedFor.value, [mod]: lang.value };
  }

  /**
   * 确保某模块已按当前语言加载。页面在 setup / watch 里调用即可。
   * 幂等：同语言下重复调用不会重复发请求。
   */
  async function ensure(mod) {
    if (!SPEC[mod]) return;
    subscribed.add(mod);
    if (loadedFor.value[mod] === lang.value) return;
    await fetchModule(mod);
  }

  /** 强制重取（后台保存后调用） */
  async function reload(mod) {
    loadedFor.value = { ...loadedFor.value, [mod]: null };
    await fetchModule(mod);
  }

  /* ---------- 语言联动 ----------
     i18n.global.locale 是 ref，改设置 / gate 切换 → setLocale() → 这里触发。 */
  watch(
    () => i18n.global.locale.value,
    (v) => {
      if (!v || v === lang.value) return;
      lang.value = v;
      /* 清空缓存 → 已订阅的模块按新语言重取 */
      loadedFor.value = {};
      Array.from(subscribed).forEach((m) => { fetchModule(m); });
    },
  );

  /* ---------- 回退提示 ---------- */
  function langName(code) {
    const hit = LANGS.filter((l) => l.code === code)[0];
    return hit ? hit.name : code;
  }

  /**
   * 某条内容若回退了默认语言，返回提示文案；否则返回空串。
   * 页面用 v-if 渲染成一行浅色小字即可。
   */
  function fallbackNotice(item) {
    if (!item || !item.is_fallback) return '';
    return tc('cNoTranslation', { lang: langName(lang.value) });
  }

  /* ---------- 便捷派生 ---------- */
  const hasAbout = computed(() => !!(about.value && (about.value.content || about.value.name)));
  const logsUpdate = computed(() => logs.value.filter((x) => (x.kind || 'update') === 'update'));
  const logsPersonal = computed(() => logs.value.filter((x) => x.kind === 'personal'));

  return {
    lang,
    about, blogs, certificates, projects, logs, moments, photos, resume,
    ensure, reload, fallbackNotice, langName,
    hasAbout, logsUpdate, logsPersonal,
    adminModule, openAdmin,
  };
});
