/* ==========================================================================
 * about-content.test.js —— useAboutContent 单测（P1-4d）
 *
 * 为什么用单测而不是组件测试：本项目没有 jsdom / @vue/test-utils，
 *   而这一层是**纯派生**（computed + 两个纯函数），在 node 里直接跑即可。
 *
 * 这里锁的是「拆分前 AboutView.vue 里那 80 行派生逻辑的历史行为」，尤其是
 * 三处容易在重构中被"顺手修正"、但其实是线上真实数据兼容逻辑的地方：
 *   ① skills 既可能是 JSON 数组字符串，也可能是 migration-026 种入的
 *      逗号分隔纯文本（含中文全角逗号）
 *   ② 证书要「图片在前、纯 PDF 在后」，且组内保持原顺序
 *   ③ 社交链接的已知平台走手写 SVG，未知平台回落 emoji
 *
 * ⚠️ 本目录的用例**不要** import vitest（globals 由 worker 注入）。
 *    `vi` 是可用的全局（vi.mock / vi.fn 均可）。
 * ========================================================================== */
const FX = vi.hoisted(() => ({ data: {} }));
vi.mock('@/api/content', () => ({
  fetchContent: async (mod) => FX.data[mod] || { items: [], item: null, lang: 'zh-CN' },
  contentUrl: () => '/api/content/_',
  CONTENT_MODULES: [],
}));

import { createPinia, setActivePinia } from 'pinia';
import { useContentStore } from '@/stores/content';
import { useAboutContent } from '@/composables/useAboutContent';
import { fmtTime } from '@/core/format';
import { ABOUT_CONTACTS } from '@/data/contacts';

beforeEach(() => { setActivePinia(createPinia()); });

/**
 * 把 fixture 同时喂给「store 直写」与「fetchContent mock」两条路 ——
 * useAboutContent 里的 ensure() 是 fire-and-forget，会和断言抢微任务；
 * 两条路收敛到同一份数据后，谁先谁后都不影响结果。
 */
function mount({ about = null, blogs = [], certs = [] } = {}) {
  const c = useContentStore();
  FX.data = {
    about: { item: about, items: [] },
    blogs: { item: null, items: blogs },
    certificates: { item: null, items: certs },
  };
  c.about = about;
  c.blogs = blogs;
  c.certificates = certs;
  return { c, ...useAboutContent() };
}

/* ---------------------------------------------------------------------- */
describe('aboutSkills：三种数据形态 + 兜底', () => {
  it('DB 是 JSON 数组字符串 → 直接用数组', () => {
    const { aboutSkills } = mount({ about: { skills: '["Excel","Python"]' } });
    expect(aboutSkills.value).toEqual(['Excel', 'Python']);
  });

  it('历史数据是半角逗号纯文本 → 拆成数组（不能回落兜底文案）', () => {
    const { aboutSkills } = mount({ about: { skills: 'Excel,python,SQL' } });
    expect(aboutSkills.value).toEqual(['Excel', 'python', 'SQL']);
  });

  it('历史数据用中文全角逗号 → 同样拆开（线上实测过 "Excel，python"）', () => {
    const { aboutSkills } = mount({ about: { skills: 'Excel，python，SQL' } });
    expect(aboutSkills.value).toEqual(['Excel', 'python', 'SQL']);
  });

  it('混用半角/全角逗号 + 多余空白 → 逐个 trim 并滤掉空项', () => {
    const { aboutSkills } = mount({ about: { skills: ' Excel ，python,,SQL ' } });
    expect(aboutSkills.value).toEqual(['Excel', 'python', 'SQL']);
  });

  it('没录入（null / 空串 / undefined）→ 回落 9 个兜底标签', () => {
    for (const skills of [null, '', undefined]) {
      const { aboutSkills } = mount({ about: { skills } });
      expect(aboutSkills.value).toHaveLength(9);
      expect(aboutSkills.value.slice(0, 3)).toEqual(['Excel', aboutSkills.value[1], 'Power BI']);
      expect(aboutSkills.value).toContain('SQL');
    }
  });

  it('⚠️ 锁定既有怪癖：JSON 解析成空数组时不回落兜底，而是走逗号分支', () => {
    /* JSON.parse('[]') 得到 []，因 length 为 0 而落到下面的逗号兼容分支，
       再按逗号切一次 → ['[]']。拆分前就是这个行为，这里刻意锁住，
       避免以后"顺手修"成回落兜底而改变线上显示。 */
    const { aboutSkills } = mount({ about: { skills: '[]' } });
    expect(aboutSkills.value).toEqual(['[]']);
  });

  it('⚠️ 锁定既有怪癖：skills 是对象（非字符串非数组）→ 回落兜底', () => {
    const { aboutSkills } = mount({ about: { skills: { a: 1 } } });
    expect(aboutSkills.value).toHaveLength(9);
  });

  it('skills 本身就是数组（后台已解析过）→ 原样使用', () => {
    const { aboutSkills } = mount({ about: { skills: ['A', 'B'] } });
    expect(aboutSkills.value).toEqual(['A', 'B']);
  });
});

/* ---------------------------------------------------------------------- */
describe('aboutBioText / aboutEducationText：DB 优先、i18n 兜底', () => {
  it('DB 有内容 → 用 DB', () => {
    const { aboutBioText, aboutEducationText } = mount({ about: { content: 'DB-BIO', education: 'DB-EDU' } });
    expect(aboutBioText.value).toBe('DB-BIO');
    expect(aboutEducationText.value).toBe('DB-EDU');
  });

  it('DB 为空 → 回落 i18n 静态文案（非空，页面不会出现空白区块）', () => {
    const { aboutBioText, aboutEducationText } = mount({ about: null });
    expect(typeof aboutBioText.value).toBe('string');
    expect(aboutBioText.value.length).toBeGreaterThan(0);
    expect(typeof aboutEducationText.value).toBe('string');
    expect(aboutEducationText.value.length).toBeGreaterThan(0);
  });

  it('DB 只有 content 没有 education → 两者各自独立兜底', () => {
    const { aboutBioText, aboutEducationText } = mount({ about: { content: 'ONLY-BIO' } });
    expect(aboutBioText.value).toBe('ONLY-BIO');
    expect(aboutEducationText.value.length).toBeGreaterThan(0);
  });
});

/* ---------------------------------------------------------------------- */
describe('socialContacts：DB 优先、静态清单兜底、未知平台回落 emoji', () => {
  it('DB 没有 links → 用内置静态清单（GitHub 指向个人主页那一版）', () => {
    const { socialContacts } = mount({ about: null });
    expect(socialContacts.value).toBe(ABOUT_CONTACTS);
    expect(socialContacts.value).toHaveLength(5);
  });

  it('links 是空数组 → 同样回落静态清单', () => {
    const { socialContacts } = mount({ about: { links: [] } });
    expect(socialContacts.value).toBe(ABOUT_CONTACTS);
  });

  it('已知平台 → 用手写 SVG 图标 path；label 作为 title', () => {
    const { socialContacts } = mount({
      about: { links: [{ platform: 'github', url: 'https://gh.example/u', label: '我的仓库' }] },
    });
    const [c] = socialContacts.value;
    expect(c.path.length).toBeGreaterThan(0);
    expect(c.url).toBe('https://gh.example/u');
    expect(c.title).toBe('我的仓库');
  });

  it('未知平台 + 没给 icon → path 为空串、icon 回落 🔗、title 回落平台标识', () => {
    const { socialContacts } = mount({ about: { links: [{ platform: 'myspace', url: 'https://ms.example' }] } });
    const [c] = socialContacts.value;
    expect(c.path).toBe('');
    expect(c.icon).toBe('🔗');
    expect(c.title).toBe('myspace');
  });

  it('后台填了自定义 icon → 用自定义 icon（优先于 🔗）', () => {
    const { socialContacts } = mount({ about: { links: [{ platform: 'x', url: 'u', icon: '🎮' }] } });
    expect(socialContacts.value[0].icon).toBe('🎮');
  });
});

/* ---------------------------------------------------------------------- */
describe('certsSorted：图片证书在前、纯 PDF 在后，组内保持原顺序', () => {
  const img = (id) => ({ id, name: `img-${id}`, image_path: `c/${id}.png` });
  const pdf = (id) => ({ id, name: `pdf-${id}`, pdf_path: `c/${id}.pdf` });

  it('混合列表：图片在前、PDF 在后，各自保持原有相对顺序', () => {
    const { certsSorted } = mount({ certs: [pdf(1), img(2), pdf(3), img(4)] });
    expect(certsSorted.value.map((c) => c.id)).toEqual([2, 4, 1, 3]);
  });

  it('全图片 / 全 PDF → 顺序不变', () => {
    expect(mount({ certs: [img(1), img(2)] }).certsSorted.value.map((c) => c.id)).toEqual([1, 2]);
    expect(mount({ certs: [pdf(1), pdf(2)] }).certsSorted.value.map((c) => c.id)).toEqual([1, 2]);
  });

  it('既有图片又有 PDF 的证书算「图片证书」（rank 只看 image_path）', () => {
    const both = { id: 9, name: 'both', image_path: 'c/9.png', pdf_path: 'c/9.pdf' };
    const { certsSorted } = mount({ certs: [pdf(1), both] });
    expect(certsSorted.value.map((c) => c.id)).toEqual([9, 1]);
  });

  it('空列表 → 空数组（不抛）', () => {
    expect(mount({ certs: [] }).certsSorted.value).toEqual([]);
  });

  it('⚠️ 排序不就地修改 store 里的原数组（slice 后再排）', () => {
    const src = [pdf(1), img(2)];
    const { c, certsSorted } = mount({ certs: src });
    expect(certsSorted.value.map((x) => x.id)).toEqual([2, 1]);
    expect(c.certificates.map((x) => x.id)).toEqual([1, 2]);
  });
});

/* ---------------------------------------------------------------------- */
describe('blogTags：JSON 数组字符串，坏数据不抛', () => {
  it('正常 JSON 数组 → 数组', () => {
    const { blogTags } = mount();
    expect(blogTags({ tags: '["a","b"]' })).toEqual(['a', 'b']);
  });
  it('非数组 JSON（对象/字符串/数字）→ []', () => {
    const { blogTags } = mount();
    expect(blogTags({ tags: '{"a":1}' })).toEqual([]);
    expect(blogTags({ tags: '"x"' })).toEqual([]);
    expect(blogTags({ tags: '1' })).toEqual([]);
  });
  it('坏 JSON / 缺字段 → []', () => {
    const { blogTags } = mount();
    expect(blogTags({ tags: 'not-json' })).toEqual([]);
    expect(blogTags({})).toEqual([]);
    expect(blogTags({ tags: null })).toEqual([]);
  });
});

/* ---------------------------------------------------------------------- */
describe('fmtDate：毫秒时间戳 → 纯日期（走 core/format 的 Intl 实现）', () => {
  it('结果 = fmtTime(ts).slice(0,10) —— 与日志页同一实现、同一口径', () => {
    /* ⚠️ 不要断言成 /^\d{4}-\d{2}-\d{2}$/：fmtTime 走 Intl 且**跟随站点语言**，
       zh-CN 下分隔符是 `/`（2023/11/15），且具体日期随运行环境时区变化。
       这里断言的是真正的契约 —— 「就是 fmtTime 的前 10 个字符」。 */
    const { fmtDate } = mount();
    for (const ts of [1700000000000, 0, 1]) {
      if (!ts) continue;
      expect(fmtDate(ts)).toBe(fmtTime(ts).slice(0, 10));
      expect(fmtDate(ts)).toHaveLength(10);
    }
  });

  it('0 / null / undefined → 空串（不渲染日期节点）', () => {
    const { fmtDate } = mount();
    expect(fmtDate(0)).toBe('');
    expect(fmtDate(null)).toBe('');
    expect(fmtDate(undefined)).toBe('');
  });

  it('⚠️ 注意与 fmtTime 的差别：fmtTime 对 0 返回 "—"，而 fmtDate 先判空返回 ""', () => {
    const { fmtDate } = mount();
    expect(fmtDate(0)).toBe('');
    expect(fmtTime(0)).toBe('—');
  });
});

/* ---------------------------------------------------------------------- */
describe('回退提示：只有后端标了 is_fallback 才提示', () => {
  it('about 是回退内容 → contentNotice 非空', () => {
    const { contentNotice } = mount({ about: { is_fallback: true } });
    expect(contentNotice.value.length).toBeGreaterThan(0);
  });
  it('about 是本地语言 → contentNotice 为空串', () => {
    const { contentNotice } = mount({ about: { is_fallback: false } });
    expect(contentNotice.value).toBe('');
  });
  it('about 为空 → 空串（不提示）', () => {
    const { contentNotice } = mount({ about: null });
    expect(contentNotice.value).toBe('');
  });
  it('博客/证书提示取列表首条：首条 is_fallback → 非空', () => {
    const { blogTip, certTip } = mount({
      blogs: [{ id: 1, is_fallback: true }],
      certs: [{ id: 1, is_fallback: true }],
    });
    expect(blogTip.value.length).toBeGreaterThan(0);
    expect(certTip.value.length).toBeGreaterThan(0);
  });
  it('列表为空 → 空串（不提示）', () => {
    const { blogTip, certTip } = mount({ blogs: [], certs: [] });
    expect(blogTip.value).toBe('');
    expect(certTip.value).toBe('');
  });
});
