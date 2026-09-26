/* vitest API 走 globals（describe/it/expect 由 worker bootstrap 注入）。
   ⚠️ 不要改回 `import ... from 'vitest'` —— 详见 vite.config.js 的 test.globals 注释。 */
import zhTW from '@/lang/zh-TW.json';
import en from '@/lang/en.json';
import ja from '@/lang/ja.json';
import home from '@/i18n/packs/home';
import about from '@/i18n/packs/about';
import privacy from '@/i18n/packs/privacy';
import adminPack from '@/i18n/packs/admin';
import community from '@/i18n/packs/community';
import auth from '@/i18n/packs/auth';
import settings from '@/i18n/packs/settings';
import gate from '@/i18n/packs/gate';
import common from '@/i18n/packs/common';

/* 与 src/core/i18n.js 的 messages 组装保持同构（改 i18n.js 时同步这里）
 * ⚠️ 新增命名空间时必须同步这张表：漏加会让该命名空间的 key 在三个 JSON 里
 *    被判成「孤儿 key」（JSON 有、zh-CN 没有），测试会直接失败。 */
const zhCN = {
  home: home.zh, about: about.zh, privacy: privacy.zh, admin: adminPack.zh,
  community: community.zh, auth: auth.zh, settings: settings.zh, gate: gate.zh,
  common: common.zh,
};
const LOCALES = [['zh-TW', zhTW], ['en', en], ['ja', ja]];

/** 展开成「key 路径 → 值」扁平表（数组视为叶子） */
function flatten(obj, prefix = '', acc = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, p, acc);
    else acc[p] = v;
  }
  return acc;
}
const zhFlat = flatten(zhCN);
const placeholders = (s) =>
  typeof s === 'string' ? [...new Set(s.match(/\{[a-zA-Z_]\w*\}/g) || []).values()].map((x) => x.slice(1, -1)).sort() : null;

describe('i18n 结构完整性', () => {
  // 命名空间个数写成动态的，新增（如 P1-4 加的 common）不用改断言文字
  it(`${Object.keys(zhCN).length} 个命名空间在 zh-CN 包全部就位`, () => {
    for (const ns of Object.keys(zhCN)) {
      expect(zhCN[ns], `命名空间 ${ns}`).toBeTypeOf('object');
      expect(Object.keys(zhCN[ns]).length, `命名空间 ${ns} 的 key 数`).toBeGreaterThan(0);
    }
  });

  for (const [name, tree] of LOCALES) {
    it(`${name}: 没有孤儿 key（JSON 里的每个 key 都必须在 zh-CN 包中存在）`, () => {
      const orphans = Object.keys(flatten(tree)).filter((p) => !(p in zhFlat));
      expect(orphans, `${name} 存在 zh-CN 侧已删/改名的死 key`).toEqual([]);
    });
  }

  /* 反向检查（2026-09-22 新增，补上原测试的盲区）：
   * 原测试只查「JSON 有、zh-CN 没有」的孤儿 key，**不查**「zh-CN 有、JSON 没有」的
   * 缺失 key。而缺失 key 在运行时会静默回退成中文 —— 界面照样能跑，只是某几句
   * 中英日混排，肉眼很难发现。实测就有 auth.avatarLabel / auth.avatarHint 三语全缺
   * 却一直没被测出来。 */
  it('四种语言没有缺失 key（zh-CN 有的 key，三语都必须有）', () => {
    const missing = [];
    for (const [name, tree] of LOCALES) {
      const flat = flatten(tree);
      for (const p of Object.keys(zhFlat)) {
        if (!(p in flat)) missing.push(`${name}:${p}`);
      }
    }
    expect(missing, '缺失 key（运行时会静默回退中文）').toEqual([]);
  });

  it('同一 key 的 {占位符} 在四种语言里集合一致（防翻译漂移吞变量）', () => {
    const problems = [];
    for (const [name, tree] of LOCALES) {
      for (const [p, locVal] of Object.entries(flatten(tree))) {
        const zhVal = zhFlat[p];
        if (typeof zhVal !== 'string' || typeof locVal !== 'string') continue;
        const a = placeholders(zhVal);
        const b = placeholders(locVal);
        if (a.join(',') !== b.join(',')) problems.push(`${name}:${p} zh=[${a}] ${name}=[${b}]`);
      }
    }
    expect(problems, '占位符不一致的 key').toEqual([]);
  });
});
