import { describe, it, expect } from 'vitest';
import { migrateSettings, DEFAULT_SETTINGS, SETTINGS_VERSION } from '@/stores/settings';

/* 覆盖 P3-1 的 __v 版本化迁移逻辑：老数据（无 __v）/ 同版本数据 / 非法 theme /
 * 缺失字段，都应得到「只含 schema 认识的键 + 默认补全 + 主题归一到 dark」的结果。 */
describe('settings __v 迁移（P3-1）', () => {
  it('无 __v 的老数据：只保留 schema 认识的键，丢弃历史残留字段', () => {
    const old = { theme: 'light', fontSize: 'large', junkField: 'x', games: { memory: false } };
    const m = migrateSettings(old);
    expect(m.junkField).toBeUndefined();
    expect(m.theme).toBe('light');
    expect(m.fontSize).toBe('large');
    expect(m.games).toEqual({ memory: false, snake: true, tetris: true, minesweeper: true, runner: true });
    expect(m.__v).toBe(SETTINGS_VERSION);
  });

  it('缺失的新键自动补默认', () => {
    const m = migrateSettings({ theme: 'dark' });
    expect(m.visitorCount).toBe(DEFAULT_SETTINGS.visitorCount);
    expect(m.externalBlank).toBe(DEFAULT_SETTINGS.externalBlank);
  });

  it('非法 theme（如已取消的 system）归一到 dark，合法值保留', () => {
    expect(migrateSettings({ theme: 'system' }).theme).toBe('dark');
    expect(migrateSettings({ theme: 'light' }).theme).toBe('light');
    expect(migrateSettings({ theme: 'dark' }).theme).toBe('dark');
    expect(migrateSettings({}).theme).toBe('dark');
  });

  it('同版本数据：直接合并并保留全部键', () => {
    const cur = { ...DEFAULT_SETTINGS, __v: SETTINGS_VERSION, customKey: 1 };
    const m = migrateSettings(cur);
    expect(m.customKey).toBe(1);
    expect(m.__v).toBe(SETTINGS_VERSION);
  });

  it('games 缺失时回退默认游戏开关', () => {
    expect(migrateSettings({ theme: 'dark' }).games).toEqual(DEFAULT_SETTINGS.games);
  });
});
