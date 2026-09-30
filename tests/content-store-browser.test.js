/* ==========================================================================
 * content-store-browser.test.js —— useContentStoreBrowser 单测（P1-4c）
 *
 * 为什么用单测而不是组件测试：本项目没有 jsdom / @vue/test-utils，
 *   而 composable 是纯 JS（只用 ref / watch），在 node 里就能直接跑。
 *   把「列桶 → 排序 → 删除 → 重载」这条链路锁住，比渲染断言更直接。
 *
 * ⚠️ 本目录的用例**不要** import vitest（globals 由 worker 注入）。
 *    `vi` 是可用的全局（vi.mock / vi.fn 均可）。
 * ========================================================================== */
vi.mock('@/lib/supabase', () => ({
  listObjects: vi.fn(),
  deleteObject: vi.fn(),
}));
vi.mock('@/modules/confirm', () => ({
  zelmConfirm: vi.fn(),
}));

import { ref, nextTick } from 'vue';
import { listObjects, deleteObject } from '@/lib/supabase';
import { zelmConfirm } from '@/modules/confirm';
import { useContentStoreBrowser } from '@/composables/useContentStoreBrowser';

const t = (k) => k;

beforeEach(() => {
  listObjects.mockReset();
  deleteObject.mockReset();
  zelmConfirm.mockReset();
  listObjects.mockResolvedValue([]);
  deleteObject.mockResolvedValue(true);
  zelmConfirm.mockResolvedValue(true);
});

describe('初始状态', () => {
  it('默认收起、不忙、无文件', () => {
    const b = useContentStoreBrowser(() => ['photos'], { t });
    expect(b.storeOpen.value).toBe(false);
    expect(b.storeBusy.value).toBe(false);
    expect(b.storeFiles.value).toEqual([]);
    expect(listObjects).not.toHaveBeenCalled();
  });
});

describe('toggleStore / loadStore', () => {
  it('展开时拉取桶内容，并按文件名排序', async () => {
    listObjects.mockImplementation(async (bucket) => (
      bucket === 'photos'
        ? [{ name: 'z.jpg', size: 10, updated: '2026-01-01' }, { name: 'a.jpg', size: 20, updated: '2026-01-02' }]
        : [{ name: 'm.pdf', size: 30, updated: '2026-01-03' }]
    ));
    const b = useContentStoreBrowser(() => ['photos', 'resume'], { t });
    await b.toggleStore();
    expect(b.storeOpen.value).toBe(true);
    expect(b.storeBusy.value).toBe(false);
    /* 跨桶合并后按 name 升序 */
    expect(b.storeFiles.value.map((f) => f.name)).toEqual(['a.jpg', 'm.pdf', 'z.jpg']);
    /* 桶名要带上 —— 删除时要用 */
    expect(b.storeFiles.value.find((f) => f.name === 'm.pdf').bucket).toBe('resume');
    expect(listObjects).toHaveBeenCalledWith('photos');
    expect(listObjects).toHaveBeenCalledWith('resume');
  });

  it('再次点击收起，且不重复请求', async () => {
    const b = useContentStoreBrowser(() => ['photos'], { t });
    await b.toggleStore();
    const calls = listObjects.mock.calls.length;
    await b.toggleStore();
    expect(b.storeOpen.value).toBe(false);
    expect(listObjects.mock.calls.length).toBe(calls);
  });

  it('桶列表为空时不发请求、不卡在 busy', async () => {
    const b = useContentStoreBrowser(() => [], { t });
    await b.toggleStore();
    expect(listObjects).not.toHaveBeenCalled();
    expect(b.storeBusy.value).toBe(false);
    expect(b.storeFiles.value).toEqual([]);
  });
});

describe('delFile', () => {
  it('确认后删除并重新拉取列表', async () => {
    listObjects.mockResolvedValue([{ name: 'a.jpg', size: 1, updated: '' }]);
    const b = useContentStoreBrowser(() => ['photos'], { t });
    await b.delFile('photos', 'a.jpg');
    expect(zelmConfirm).toHaveBeenCalledTimes(1);
    /* 确认文案里要带桶名和文件名，避免站长删错 */
    expect(zelmConfirm.mock.calls[0][0]).toContain('photos');
    expect(zelmConfirm.mock.calls[0][0]).toContain('a.jpg');
    expect(deleteObject).toHaveBeenCalledWith('photos', 'a.jpg');
    expect(listObjects).toHaveBeenCalled();
    expect(b.storeBusy.value).toBe(false);
  });

  it('取消确认时什么都不做', async () => {
    zelmConfirm.mockResolvedValue(false);
    const b = useContentStoreBrowser(() => ['photos'], { t });
    await b.delFile('photos', 'a.jpg');
    expect(deleteObject).not.toHaveBeenCalled();
    expect(listObjects).not.toHaveBeenCalled();
  });
});

describe('切换模块时重置', () => {
  it('buckets 变化 → 收起并清空（避免看到上一个模块的文件）', async () => {
    const mod = ref('about');
    const MAP = { about: ['about-assets'], logs: [] };
    const b = useContentStoreBrowser(() => MAP[mod.value], { t });
    listObjects.mockResolvedValue([{ name: 'x.jpg', size: 1, updated: '' }]);
    await b.toggleStore();
    expect(b.storeFiles.value.length).toBe(1);

    mod.value = 'logs';
    await nextTick();
    expect(b.storeOpen.value).toBe(false);
    expect(b.storeFiles.value).toEqual([]);
  });
});
