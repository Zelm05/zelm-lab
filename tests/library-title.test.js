/* vitest API 走 globals（describe/it/expect/beforeAll 由 worker bootstrap 注入）。
   ⚠️ 不要改回 `import ... from 'vitest'` —— 详见 vite.config.js 的 test.globals 注释。 */
import { itemTitle, itemName, itemDesc } from '@/stores/library';
import { i18n } from '@/core/i18n';

/* 覆盖 P3-11 的标题兼容：itemTitle/itemName/itemDesc 既接受纯字符串（老用户 /
 * localStorage 数据），也接受四语言 bucket（种子数据），缺失时回落 zh-CN。 */
describe('library 标题兼容字符串与 bucket（P3-11）', () => {
  beforeAll(() => {
    i18n.global.locale.value = 'zh-CN';
  });

  it('纯字符串 title 直接返回原串', () => {
    expect(itemTitle({ title: 'Clash Verge Rev' })).toBe('Clash Verge Rev');
  });

  it('四语言 bucket 返回当前 locale，缺失时回落 zh-CN', () => {
    const b = { title: { 'zh-CN': '测试', 'zh-TW': '測試', en: 'Test', ja: 'テスト' } };
    expect(itemTitle(b)).toBe('测试');
    i18n.global.locale.value = 'en';
    expect(itemTitle(b)).toBe('Test');
    i18n.global.locale.value = 'zh-CN';
  });

  it('缺失 title / 空对象 / null / undefined 不抛错，返回空串', () => {
    expect(itemTitle({})).toBe('');
    expect(itemTitle(null)).toBe('');
    expect(itemTitle(undefined)).toBe('');
    expect(itemTitle({ title: null })).toBe('');
  });

  it('name / desc 同样兼容字符串与 bucket', () => {
    expect(itemName({ name: 'X' })).toBe('X');
    expect(itemDesc({ desc: { 'zh-CN': '中文描述', en: 'EN desc' } })).toBe('中文描述');
  });
});
