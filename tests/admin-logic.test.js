/* vitest API 走 globals（describe/it/expect 由 worker bootstrap 注入）。
   ⚠️ 不要改回 `import ... from 'vitest'` —— 详见 vite.config.js 的 test.globals 注释。

   覆盖 P1-3 从 stores/admin.js 抽出的纯逻辑。这些函数原先闭包在 defineStore 内，
   而 store 会经 @/core/shell 拉进 @/router（createWebHashHistory 需要 location），
   在 node 环境下无法实例化；抽成显式传参的纯函数后即可直接单测。
   重点是**权限矩阵**：它是这份 store 相对原 972 行命令式脚本的核心收益，
   也是最容易在重构中被悄悄改坏的部分。 */
import {
  pagerOf,
  badgesFor,
  statusFor,
  actionsFor,
  statusText,
  fbKindLabel,
  siteCfgFromApi,
  statsFromApi,
} from '@/stores/admin/logic';

/* 取词函数直接用 key 回显，断言即可读（真实 t 会带 i18n 前缀与插值） */
const t = (k) => k;

/* 造一个用户行，只写关心的字段 */
const U = (over = {}) => ({ id: 1, username: 'u1', role: 'user', suspended: false, online: false, ...over });
const ME_OWNER = { id: 99, username: 'boss', role: 'owner' };
const ME_ADMIN = { id: 98, username: 'adm', role: 'admin' };

describe('pagerOf —— 分页窗口', () => {
  it('总数为 0 时也有 1 页，页码数组为 [1]', () => {
    expect(pagerOf(0, 1, 8)).toEqual({ pages: 1, start: 1, end: 1, nums: [1] });
  });

  it('页数 ≤ 5 时全部展开，不滑动', () => {
    expect(pagerOf(40, 1, 8).nums).toEqual([1, 2, 3, 4, 5]);
    expect(pagerOf(40, 3, 8).nums).toEqual([1, 2, 3, 4, 5]);
    expect(pagerOf(40, 5, 8).nums).toEqual([1, 2, 3, 4, 5]);
  });

  it('页数 > 5 时当前页居中，窗口恒为 5 个', () => {
    const p = pagerOf(100, 6, 8);            // 13 页
    expect(p.pages).toBe(13);
    expect(p.nums).toEqual([4, 5, 6, 7, 8]);
    expect(p.nums.length).toBe(5);
  });

  it('靠前 / 靠后时窗口贴边不越界', () => {
    expect(pagerOf(100, 1, 8).nums).toEqual([1, 2, 3, 4, 5]);
    expect(pagerOf(100, 2, 8).nums).toEqual([1, 2, 3, 4, 5]);
    expect(pagerOf(100, 13, 8).nums).toEqual([9, 10, 11, 12, 13]);
    expect(pagerOf(100, 12, 8).nums).toEqual([9, 10, 11, 12, 13]);
  });

  it('窗口始终不越界：start>=1、end<=pages、nums 与 [start,end] 一致', () => {
    for (const page of [1, 2, 3, 7, 12, 13]) {
      const p = pagerOf(100, page, 8);
      expect(p.start).toBeGreaterThanOrEqual(1);
      expect(p.end).toBeLessThanOrEqual(p.pages);
      expect(p.nums).toEqual(
        Array.from({ length: p.end - p.start + 1 }, (_, i) => p.start + i),
      );
    }
  });

  it('只有贴到尾部时 end 才等于 pages（靠前时窗口不跟到末页）', () => {
    expect(pagerOf(100, 1, 8).end).toBe(5);        // 靠前：贴左边
    expect(pagerOf(100, 13, 8).end).toBe(13);      // 末页：贴右边
    expect(pagerOf(100, 11, 8).end).toBe(13);      // pages-2 起开始贴右边
  });
});

describe('badgesFor —— 角色徽章', () => {
  it('本人优先显示「当前账号」，且 id 用字符串比较（数字/字符串混用不误判）', () => {
    expect(badgesFor(U({ id: 5, role: 'admin' }), { id: '5', role: 'owner' }, t)).toEqual([{ cls: 'me', text: 'badgeMe' }]);
  });

  it('站长 / 管理员 / 普通用户各自成档', () => {
    expect(badgesFor(U({ role: 'owner' }), ME_ADMIN, t)[0]).toEqual({ cls: 'owner', text: 'badgeOwner' });
    expect(badgesFor(U({ role: 'admin' }), ME_OWNER, t)[0]).toEqual({ cls: 'admin', text: 'badgeAdmin' });
    expect(badgesFor(U({ role: 'user' }), ME_OWNER, t)[0]).toEqual({ cls: 'user', text: 'badgeUser' });
  });

  it('冻结徽章叠加在角色徽章之后', () => {
    const b = badgesFor(U({ role: 'user', suspended: true }), ME_OWNER, t);
    expect(b).toEqual([
      { cls: 'user', text: 'badgeUser' },
      { cls: 'danger', text: 'badgeFrozen' },
    ]);
  });

  it('me 为 null 时不把任何人当本人', () => {
    expect(badgesFor(U({ role: 'user' }), null, t)[0]).toEqual({ cls: 'user', text: 'badgeUser' });
  });
});

describe('statusFor —— 在线状态', () => {
  it('本人一律显示在线并附「本机」，即使 online=false', () => {
    expect(statusFor(U({ id: 5, online: false }), { id: '5' }, t)).toEqual({ online: true, text: 'online', note: 'thisDevice' });
  });

  it('他人按 online 字段，note 为空', () => {
    expect(statusFor(U({ online: true }), ME_OWNER, t)).toEqual({ online: true, text: 'online', note: '' });
    expect(statusFor(U({ online: false }), ME_OWNER, t)).toEqual({ online: false, text: 'offline', note: '' });
  });
});

describe('actionsFor —— 权限矩阵（核心回归保护）', () => {
  const acts = (u, me, isOwner) => actionsFor(u, me, isOwner, t).map((x) => x.act || x.text);

  it('本人 → 只给一个「—」，没有任何操作', () => {
    expect(actionsFor(U({ id: 7 }), { id: 7 }, true, t)).toEqual([{ text: '—' }]);
  });

  it('站长的行 → 任何人（含站长自己）都不可操作', () => {
    expect(actionsFor(U({ role: 'owner' }), ME_ADMIN, false, t)).toEqual([{ text: 'noModify' }]);
    expect(actionsFor(U({ role: 'owner' }), ME_OWNER, true, t)).toEqual([{ text: 'noModify' }]);
  });

  it('普通用户行 · 站长视角 → 提升 / 重置密码 / 冻结 / 删除（未在线则无踢下线）', () => {
    expect(acts(U({ role: 'user', online: false }), ME_OWNER, true)).toEqual(['promote', 'resetpw', 'freeze', 'del']);
  });

  it('普通用户行 · 站长视角 + 在线 → 多一个 kick，且排在冻结之前', () => {
    expect(acts(U({ role: 'user', online: true }), ME_OWNER, true)).toEqual(['promote', 'resetpw', 'kick', 'freeze', 'del']);
  });

  it('普通用户行 · 管理员视角 → 提升是纯文本（仅站长可授权），可重置密码与冻结，不可删除', () => {
    const out = actionsFor(U({ role: 'user', online: true }), ME_ADMIN, false, t);
    expect(out.map((x) => x.act || x.text)).toEqual(['badgeUser', 'resetpw', 'freeze']);
    expect(out[0].title).toBe('ownerOnlyGrant');   // 悬浮说明保留
    expect(out.some((x) => x.act === 'del')).toBe(false);
    expect(out.some((x) => x.act === 'kick')).toBe(false);
  });

  it('管理员行 · 站长视角 → 可取消管理员 / 重置密码 / 冻结 / 删除', () => {
    expect(acts(U({ role: 'admin', online: false }), ME_OWNER, true)).toEqual(['demote', 'resetpw', 'freeze', 'del']);
  });

  it('管理员行 · 管理员视角 → 管理员之间不能互相操作：只留纯文本，且重置密码也是「—」', () => {
    const out = actionsFor(U({ role: 'admin' }), ME_ADMIN, false, t);
    expect(out.map((x) => x.act || x.text)).toEqual(['badgeAdmin', '—']);
    expect(out[0].title).toBe('ownerOnlyModifyAdmin');
    expect(out[1].title).toBe('ownerOnlyModifyAdmin');
  });

  it('已冻结的用户 → 冻结按钮换成解冻，位置不变', () => {
    expect(acts(U({ role: 'user', suspended: true }), ME_OWNER, true)).toEqual(['promote', 'resetpw', 'unfreeze', 'del']);
  });

  it('「查看密码」按钮已删除：任何视角下都不再出现 reveal 动作', () => {
    const all = [
      ...actionsFor(U({ role: 'user' }), ME_OWNER, true, t),
      ...actionsFor(U({ role: 'admin' }), ME_OWNER, true, t),
      ...actionsFor(U({ role: 'user' }), ME_ADMIN, false, t),
    ];
    expect(all.some((x) => x.act === 'reveal')).toBe(false);
  });
});

describe('statusText / fbKindLabel —— 文案映射', () => {
  it('statusText 按 mode 分流', () => {
    expect(statusText(true, 'pw', t)).toBe('cfgPwOn');
    expect(statusText(false, 'pw', t)).toBe('cfgPwOff');
    expect(statusText(true, 'login', t)).toBe('loginReqOn');
    expect(statusText(false, 'login', t)).toBe('loginReqOff');
    expect(statusText(true, 'show', t)).toBe('showOn');
    expect(statusText(false, 'show', t)).toBe('showOff');
  });

  it('fbKindLabel 认识 feedback / suggestion，其它原样返回', () => {
    expect(fbKindLabel('feedback', t)).toBe('kindFeedback');
    expect(fbKindLabel('suggestion', t)).toBe('kindSuggestion');
    expect(fbKindLabel('other', t)).toBe('other');
  });
});

describe('siteCfgFromApi —— 缺字段一律按「开」', () => {
  it('空对象 → 全部为真 + entry_page=index', () => {
    expect(siteCfgFromApi({})).toEqual({
      about_password_enabled: true,
      entry_page: 'index',
      message_login_required: true,
      like_login_required: true,
      about_login_required: true,
      photo_wall_enabled: true,
      certificates_enabled: true,
      home_about_enabled: true,
    });
  });

  it('显式 false 才关；entry_page 只认 about，其它值归一到 index', () => {
    const c = siteCfgFromApi({ photo_wall_enabled: false, entry_page: 'about' });
    expect(c.photo_wall_enabled).toBe(false);
    expect(c.entry_page).toBe('about');
    expect(siteCfgFromApi({ entry_page: 'whatever' }).entry_page).toBe('index');
    // 注意：0 / '' 不是 false，仍按「开」（与原站 `!== false` 语义一致）
    expect(siteCfgFromApi({ photo_wall_enabled: 0 }).photo_wall_enabled).toBe(true);
  });
});

describe('statsFromApi —— 统计卡兜底', () => {
  const users = [
    { role: 'owner', suspended: false, online: true },
    { role: 'admin', suspended: true, online: false },
    { role: 'user', suspended: false, online: true },
  ];

  it('后端给了 stats 就原样用（不随筛选变化）', () => {
    expect(statsFromApi({ total: 100, admins: 9, suspended: 3, online: 7 }, users))
      .toEqual({ total: 100, admins: 9, suspended: 3, online: 7 });
  });

  it('后端没给 stats 时用当前页现算；admins 把 owner 也算进去', () => {
    expect(statsFromApi({}, users)).toEqual({ total: 3, admins: 2, suspended: 1, online: 2 });
  });

  it('stats 里 total=0 视为有效值，不被 users.length 覆盖', () => {
    expect(statsFromApi({ total: 0 }, users).total).toBe(0);
  });
});
