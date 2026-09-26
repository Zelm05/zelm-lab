/* ==========================================================================
 * audit-about-console.test.js —— About 页 / 后台管理 专项审计单测（F-6 补齐）
 *
 * 覆盖「原集成脚本没单测」的纯逻辑回归点：
 *   1) useDragSort —— 鼠标/触屏/键盘三端共用的排序核心（move 重排 + 归一化）
 *   2) 存储桶三处一致性 —— editor.js BUCKETS / supabase.js KNOWN_BUCKETS /
 *                          content-fields.js STORE_BUCKETS 必须对齐
 *   3) editor.js safePath —— 路径穿越纵深防御（安全回归）
 *   4) 迁移文件顺序 —— editor-tables 必须最先、文件名序即执行序、rollback 不混入
 *
 * 跑法：npm test（vitest 收集 tests/ 下全部用例，已排除 tests/e2e）
 * ========================================================================== */
/* vitest API 走 globals（describe/it/expect 由 worker bootstrap 注入）。
   ⚠️ 不要改回 `import ... from 'vitest'` —— 详见 vite.config.js 的 test.globals 注释。 */
import { ref } from 'vue';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { useDragSort } from '@/core/useDragSort';
import { STORE_BUCKETS, MODULES, FIELDS } from '@/components/admin/content-fields';
import { KNOWN_BUCKETS } from '@/core/supabase';
import { BUCKETS, safePath } from '../worker/editor.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---------------------------------------------------------------------- */
/* 1) useDragSort：键盘/箭头按钮兜底的 move 重排 + normalize                */
/* ---------------------------------------------------------------------- */
describe('useDragSort：move 重排与 sort_order 归一化（F-1）', () => {
  it('move(0, 2) 把首行移到末尾，并重排 sort_order = (i+1)*10', () => {
    const rows = ref([{ sort_order: 10 }, { sort_order: 20 }, { sort_order: 30 }]);
    const { move } = useDragSort(rows);
    const first = rows.value[0];
    move(0, 2);
    // 位置：原先的第一行现在在最后
    expect(rows.value[2]).toBe(first);
    // 归一化后顺序连续、步长 10
    expect(rows.value.map((r) => r.sort_order)).toEqual([10, 20, 30]);
  });

  it('move(2, 0) 把末行移到开头', () => {
    const rows = ref([{ sort_order: 10 }, { sort_order: 20 }, { sort_order: 30 }]);
    const { move } = useDragSort(rows);
    const last = rows.value[2];
    move(2, 0);
    expect(rows.value[0]).toBe(last);
    expect(rows.value.map((r) => r.sort_order)).toEqual([10, 20, 30]);
  });

  it('相邻 move(0, 1) 交换前两项位置', () => {
    const rows = ref([{ sort_order: 10 }, { sort_order: 20 }]);
    const { move } = useDragSort(rows);
    const a = rows.value[0];
    const b = rows.value[1];
    move(0, 1);
    expect(rows.value[0]).toBe(b);
    expect(rows.value[1]).toBe(a);
    expect(rows.value.map((r) => r.sort_order)).toEqual([10, 20]);
  });

  it('越界 / 原地 move 是 no-op（不会抛、也不会改顺序）', () => {
    const rows = ref([{ sort_order: 10 }, { sort_order: 20 }, { sort_order: 30 }]);
    const { move } = useDragSort(rows);
    const before = rows.value.map((r) => r.sort_order);
    move(0, -1);   // to < 0
    move(0, 99);   // to >= length
    move(1, 1);    // from === to
    expect(rows.value.map((r) => r.sort_order)).toEqual(before);
  });

  it('setContainer(null) 后 items() 返回空数组（不报错）', () => {
    const rows = ref([]);
    const { setContainer, move } = useDragSort(rows);
    setContainer(null);
    // 没容器也能安全调用 move（虽然这里没数据）
    expect(() => move(0, 1)).not.toThrow();
  });
});

/* ---------------------------------------------------------------------- */
/* 2) 存储桶三处一致性                                                     */
/* ---------------------------------------------------------------------- */
describe('存储桶三处一致性（F-5 回归）', () => {
  it('editor.js BUCKETS 与 supabase.js KNOWN_BUCKETS 集合完全一致', () => {
    const a = [...BUCKETS].sort();
    const b = [...KNOWN_BUCKETS].sort();
    expect(a).toEqual(b);
    // 与 README 一致的 7 个桶：3 历史 + 4 专用
    expect(BUCKETS).toHaveLength(7);
    for (const x of ['photos', 'resume', 'moments', 'blog-assets', 'certificate-assets', 'about-assets', 'project-assets']) {
      expect(BUCKETS).toContain(x);
    }
  });

  it('STORE_BUCKETS 里用到的每个桶都在 KNOWN_BUCKETS 内（不能引用未知桶）', () => {
    const used = new Set();
    for (const arr of Object.values(STORE_BUCKETS)) for (const b of arr) used.add(b);
    for (const b of used) expect(KNOWN_BUCKETS).toContain(b);
  });

  it('STORE_BUCKETS 覆盖所有「含文件字段」的模块，且无文件的模块为 []', () => {
    const registered = new Set(MODULES.map((m) => m.key));
    for (const m of MODULES) {
      const f = FIELDS[m.key] || { main: [] };
      const hasFileField = (f.main || []).some((x) => x.bucket);
      if (hasFileField) {
        expect(STORE_BUCKETS[m.key], `模块 ${m.key} 有文件字段却未在 STORE_BUCKETS 配置桶`).toBeDefined();
        expect(STORE_BUCKETS[m.key].length).toBeGreaterThan(0);
      } else {
        // 纯文本模块（logs / resume 单文件除外）应为空数组或已配置
        if (m.key === 'logs') expect(STORE_BUCKETS.logs).toEqual([]);
      }
      expect(registered.has(m.key)).toBe(true);
    }
  });

  it('projects 走 project-assets 专用桶（不是历史 photos 桶）', () => {
    expect(STORE_BUCKETS.projects).toEqual(['project-assets']);
  });
});

/* ---------------------------------------------------------------------- */
/* 3) editor.js safePath：路径穿越防御                                     */
/* ---------------------------------------------------------------------- */
describe('editor.js safePath：路径穿越纵深防御（F-3 回归）', () => {
  it('正常相对路径原样返回（含编码）', () => {
    expect(safePath('blog/blog/12/x.webp')).toBe('blog/blog/12/x.webp');
    expect(safePath('a%20b/c.webp')).toBe('a b/c.webp'); // 解码空格正常放行
  });

  it('拒绝绝对路径（前导 /）', () => {
    expect(safePath('/etc/passwd')).toBeNull();
    expect(safePath('/')).toBeNull();
  });

  it('拒绝反斜杠（Windows 风格分隔）', () => {
    expect(safePath('a\\b')).toBeNull();
    expect(safePath('..\\..\\secret')).toBeNull();
  });

  it('拒绝 .. 段（目录上跳）', () => {
    expect(safePath('../secret')).toBeNull();
    expect(safePath('a/../../b')).toBeNull();
    expect(safePath('..')).toBeNull();
  });

  it('拒绝 . 段', () => {
    expect(safePath('./x')).toBeNull();
    expect(safePath('a/./b')).toBeNull();
  });

  it('拒绝空值 / 非字符串 / 编码后的穿越', () => {
    expect(safePath('')).toBeNull();
    expect(safePath(null)).toBeNull();
    expect(safePath(undefined)).toBeNull();
    expect(safePath(123)).toBeNull();
    expect(safePath('%2e%2e/x')).toBeNull();   // %2e%2e 解码成 .. → 拦截
    expect(safePath('..%2f..')).toBeNull();     // ../.. 解码后拦截
  });
});

/* ---------------------------------------------------------------------- */
/* 4) 迁移文件顺序                                                         */
/* ---------------------------------------------------------------------- */
describe('迁移文件顺序（migration-order 回归）', () => {
  const dir = path.join(ROOT, 'migrations');
  const files = fs.readdirSync(dir);

  it('schema.sql 存在且是初始化起点', () => {
    expect(files).toContain('schema.sql');
  });

  it('migration-001 是 editor-tables 且排在全部迁移最前', () => {
    const mig = files.filter((f) => /^migration-\d+-.*\.sql$/.test(f)).sort();
    expect(mig[0]).toBe('migration-001-add-editor-tables.sql');
  });

  it('所有 migration-NNN 按文件名序即执行序（000 补零，字典序 == 数值序）', () => {
    const mig = files.filter((f) => /^migration-\d+-.*\.sql$/.test(f));
    const sorted = [...mig].sort();
    expect(mig).toEqual(sorted);
    // 编号连续（无跳号、无重复）
    const nums = mig.map((f) => parseInt(f.match(/migration-(\d+)-/)[1], 10)).sort((a, b) => a - b);
    for (let i = 0; i < nums.length; i++) expect(nums[i]).toBe(i + 1);
  });

  it('rollback 脚本不混入迁移执行序', () => {
    /* 注意正则：文件名是 `migration-022-clear-bogus-avatar.sql`（编号后还有后缀），
       用 `^migration-\d+\.sql$` 会匹配不到任何文件 → runList 为空 → 断言空转成假阳性。 */
    const runList = files.filter((f) => /^migration-\d+-.*\.sql$/.test(f));
    expect(runList.length).toBeGreaterThan(0); // 防止再次写成空集合导致假阳性
    expect(runList.some((f) => f.includes('rollback'))).toBe(false);
    expect(files.some((f) => f.startsWith('rollback-'))).toBe(true); // 回滚脚本存在但被排除
  });

  it('最新迁移 migration-022 收尾', () => {
    const mig = files.filter((f) => /^migration-\d+-.*\.sql$/.test(f)).sort();
    expect(mig[mig.length - 1]).toBe('migration-022-clear-bogus-avatar.sql');
  });
});
