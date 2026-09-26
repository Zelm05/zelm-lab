/* vitest API 走 globals（describe/it/expect/beforeEach 由 worker bootstrap 注入）。
   ⚠️ 不要改回 `import ... from 'vitest'` —— 详见 vite.config.js 的 test.globals 注释。 */
import { i18n } from '@/core/i18n';
import { itemName, itemTags, QUICK_SEED, DEFAULT_RESOURCES } from '@/stores/library';

/** 切当前 locale（locField 按它取值） */
const setLoc = (l) => { i18n.global.locale.value = l; };

describe('locField 回落链（library 种子数据本地化）', () => {
  beforeEach(() => setLoc('zh-CN'));

  it('纯字符串原样返回（用户自建条目 / 老版本 localStorage 数据）', () => {
    setLoc('en');
    expect(itemName({ name: '纯中文条目' })).toBe('纯中文条目');
  });

  it('当前 locale 优先', () => {
    setLoc('en');
    expect(itemName({ name: { 'zh-CN': '中文', en: 'English' } })).toBe('English');
  });

  it('当前 locale 缺失 → 回落 zh-CN', () => {
    setLoc('ja');
    expect(itemName({ name: { 'zh-CN': '中文', en: 'English' } })).toBe('中文');
  });

  it('再缺失 → 回落 zh 桶 → 最后取任意一个值', () => {
    setLoc('ja');
    expect(itemName({ name: { zh: '旧键中文' } })).toBe('旧键中文');
    expect(itemName({ name: { zhTW: '繁体' } })).toBe('繁体');
  });

  it('空桶 / 缺字段 / 空对象 → 空串（绝不 throw）', () => {
    expect(itemName(null)).toBe('');
    expect(itemName({})).toBe('');
    expect(itemName({ name: {} })).toBe('');
  });

  it('itemTags：数组原样返回', () => {
    setLoc('en');
    expect(itemTags({ tags: ['a', 'b'] })).toEqual(['a', 'b']);
  });

  it('itemTags：桶按 locale 取值，缺失回落 zh-CN', () => {
    setLoc('en');
    expect(itemTags({ tags: { 'zh-CN': ['标签'], en: ['tag'] } })).toEqual(['tag']);
    setLoc('ja');
    expect(itemTags({ tags: { 'zh-CN': ['标签'], en: ['tag'] } })).toEqual(['标签']);
    expect(itemTags(null)).toEqual([]);
  });

  it('种子数据完整性：凡用桶的字段必须有 zh-CN（回落链的锚点）', () => {
    const seeds = [...QUICK_SEED, ...DEFAULT_RESOURCES];
    expect(seeds.length, '种子条目数').toBeGreaterThan(0);
    const bad = [];
    seeds.forEach((item, i) => {
      for (const field of ['name', 'desc', 'group', 'full']) {
        const v = item[field];
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          if (!v['zh-CN'] && !v.zh) bad.push(`seeds[${i}].${field}`);
        }
      }
    });
    expect(bad, '缺 zh-CN 锚点的桶字段').toEqual([]);
  });
});
