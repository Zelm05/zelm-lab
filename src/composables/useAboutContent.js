/* ==========================================================================
 * useAboutContent.js —— 「关于我」页的动态内容派生层
 *
 * 从 AboutView.vue 抽出来（原第 72–154 行）。这些全是**只读派生**：
 *   内容 store 的数据 → 模板要显示的值。不含任何 DOM / 交互 / 生命周期。
 *
 * 统一的兜底规则（与拆分前逐条一致，注释里的历史包袱一并保留）：
 *   **DB 有就用 DB，没有就用 i18n 静态文案** ——
 *   站长没录入任何内容时页面照常显示，不会出现空白区块。
 *
 * 关于 store 的 ensure()：三个模块都在这里发起，调用顺序与拆分前一致
 *   （about → blogs → certificates）。它们互相独立，但保持一致可以避免
 *   「谁先谁后」变成以后排查请求顺序时的悬案。
 * ========================================================================== */
import { computed } from 'vue';
import { useContentStore } from '@/stores/content';
import { useI18n } from '@/i18n';
import { fmtTime } from '@/core/format';
import { ABOUT_CONTACTS, CONTACT_ICONS } from '@/data/contacts';

/* --------------------------------------------------------------------------
 * 两个**纯函数**（P1-4e）：不碰 store、不碰 i18n，只是「一行数据 → 展示值」。
 * 提到模块作用域并具名导出，好让板块子组件（AboutBlogSection）直接引用，
 * 而不是靠 props 传函数或再抄一份实现。原先是 useAboutContent() 内部的局部
 * 函数，提到模块作用域对行为零影响（两者都没有闭包依赖）。
 *
 * ⚠️ 注意与 src/core/format.js 的同名 fmtDate **语义不同**，不要合并：
 *     core/format.js  fmtDate(dateStr)  → 入参是 'YYYY-MM-DD' 字符串，空值返回 '—'
 *     本文件          fmtDate(ts)       → 入参是毫秒时间戳，空值返回 ''
 *   博客的 published_at 是毫秒时间戳，所以走的是下面这个。
 * -------------------------------------------------------------------------- */

/** 博客标签存的是 JSON 数组字符串 */
export function blogTags(b) {
  try {
    const a = JSON.parse(b.tags || '[]');
    return Array.isArray(a) ? a : [];
  } catch (e) { return []; }
}

/** 毫秒时间戳 → YYYY-MM-DD（与日志页一致，走 core/format 的 Intl 实现） */
export function fmtDate(ts) {
  if (!ts) return '';
  try { return fmtTime(ts).slice(0, 10); } catch (e) { return ''; }
}

export function useAboutContent() {
  const { t } = useI18n('about');
  const content = useContentStore();

  /* ---------- 关于我：动态内容（后台可编辑） + i18n 兜底 ---------- */
  content.ensure('about');   /* 幂等；语言切换时 store 内部会自动重取 */

  /** 兜底技能标签：与原来模板里写死的一致（部分走 i18n） */
  const FALLBACK_SKILLS = computed(() => [
    'Excel', t('techML'), 'Power BI', 'Python', t('techRLang'), 'SPSS', 'SQL',
    t('techDataAnalysis'), t('techDataViz'),
  ]);

  const aboutBioText = computed(() => ((content.about && content.about.content) ? content.about.content : t('aboutBio')));
  /* 教育背景：后台「关于我」可编辑（about_translations.education），没录入时回落 i18n 静态文案 */
  const aboutEducationText = computed(() =>
    (content.about && content.about.education) ? content.about.education : t('aboutEdu'));

  const aboutSkills = computed(() => {
    const raw = content.about && content.about.skills;
    if (!raw) return FALLBACK_SKILLS.value;
    try {
      const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(arr) && arr.length) return arr;
    } catch (e) { /* 不是 JSON → 走下面的纯文本兼容 */ }
    /* 兼容历史数据：migration-026 种入的 skills 是纯逗号分隔文本（非 JSON 数组），
       JSON.parse 必失败 → 此前直接回落兜底文案，后台改了前台也"看不到"。
       按逗号（半角/全角——中文输入法常见，线上实测过 'Excel，python'）拆成数组显示；
       后台保存一次后库里即为 JSON 数组，走上面的分支。 */
    if (typeof raw === 'string') {
      const list = raw.split(/[，,]/).map((s) => s.trim()).filter(Boolean);
      if (list.length) return list;
    }
    return FALLBACK_SKILLS.value;
  });

  /** 该语言没翻译、回退了默认语言时的提示 */
  const contentNotice = computed(() => content.fallbackNotice(content.about));

  /* ---------- 社交链接：后台可编辑（内嵌在 /api/content/about 的 item.links） ----------
     DB 为空时回落到原来的静态清单 —— 站长还没录入时页脚不会空掉。 */
  const socialContacts = computed(() => {
    const links = (content.about && content.about.links) || [];
    if (!links.length) return ABOUT_CONTACTS;
    return links.map((l) => ({
      /* 已知平台用统一的手写 SVG 图标；站长自定义的平台回落 emoji */
      path: CONTACT_ICONS[l.platform] || '',
      icon: l.icon || '🔗',
      url: l.url,
      /* label 是多语言的（about_social_link_translations），缺失时用平台标识兜底 */
      title: l.label || l.platform,
    }));
  });

  /* ---------- 博客 / 证书：同样是「DB 有就显示，没有就保留占位」 ---------- */
  content.ensure('blogs');
  content.ensure('certificates');

  const blogTip = computed(() => (content.blogs.length ? content.fallbackNotice(content.blogs[0]) : ''));
  const certTip = computed(() => (content.certificates.length ? content.fallbackNotice(content.certificates[0]) : ''));

  /** 证书排序（2026-09-28）：图片证书在前、仅 PDF 的在后；组内保持原顺序
   *  （Array.prototype.sort 现代引擎均为稳定排序，不动原次序）。前端排序对
   *  数据/API 零侵入，后台想自定义顺序时以后台的 sort 字段为准再调。 */
  const certsSorted = computed(() => {
    const rank = (c) => (c.image_path ? 0 : 1);
    return content.certificates.slice().sort((a, b) => rank(a) - rank(b));
  });

  /** 博客标签存的是 JSON 数组字符串 */
  function blogTags(b) {
    try {
      const a = JSON.parse(b.tags || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }

  /** 毫秒时间戳 → YYYY-MM-DD（与日志页一致，走 core/format 的 Intl 实现） */
  function fmtDate(ts) {
    if (!ts) return '';
    try { return fmtTime(ts).slice(0, 10); } catch (e) { return ''; }
  }

  return {
    content,
    aboutBioText, aboutEducationText, aboutSkills, contentNotice, socialContacts,
    blogTip, certTip, certsSorted, blogTags, fmtDate,
  };
}
