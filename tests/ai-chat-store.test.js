/* vitest API 走 globals（describe/it/expect 由 worker bootstrap 注入）。
   覆盖 AI 聊天 v2 多会话纯逻辑：v1 迁移 / 置顶排序 / 自动命名 / 容量淘汰 / 删除切换。 */
import {
  newId, createSession, loadState, saveState, sanitizeSessions, trimSessions,
  sortSessions, autoTitle, groupSessions, nextActiveAfterRemove,
  STORE_KEY, LEGACY_KEY, MAX_SESSIONS,
} from '@/core/ai-chat-store';

/** 极简 sessionStorage 桩（Map 实现，覆盖用到的 4 个方法） */
function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _m: m,
  };
}

describe('AI 聊天 v2 多会话（ai-chat-store）', () => {
  it('v1 → v2 迁移：旧消息数组包成第一个会话并删除 v1 key', () => {
    const s = fakeStorage();
    s.setItem(LEGACY_KEY, JSON.stringify([
      { role: 'user', content: 'SQL 窗口函数怎么写' },
      { role: 'assistant', content: '这样写…' },
    ]));
    const st = loadState(s);
    expect(st.sessions.length).toBe(1);
    expect(st.sessions[0].messages.length).toBe(2);
    expect(st.activeId).toBe(st.sessions[0].id);
    expect(st.sessions[0].title).toBe('SQL 窗口函数怎么写');
    expect(s.getItem(LEGACY_KEY)).toBeNull();           /* v1 已删 */
    expect(s.getItem(STORE_KEY)).toContain('"version":2');
  });

  it('v1 迁移会过滤坏消息并截尾 40 条', () => {
    const s = fakeStorage();
    const msgs = [];
    for (let i = 0; i < 50; i++) msgs.push({ role: 'user', content: 'm' + i });
    msgs.push({ role: 'hack', content: 'x' });          /* 非法 role */
    s.setItem(LEGACY_KEY, JSON.stringify(msgs));
    const st = loadState(s);
    expect(st.sessions[0].messages.length).toBe(40);
    expect(st.sessions[0].messages.every((m) => m.role === 'user')).toBe(true);
  });

  it('无任何存储 → 空状态；坏 JSON → 空状态（不抛错）', () => {
    expect(loadState(fakeStorage())).toEqual({ activeId: '', sessions: [] });
    const s = fakeStorage();
    s.setItem(STORE_KEY, '{bad json');
    expect(loadState(s)).toEqual({ activeId: '', sessions: [] });
  });

  it('saveState：activeId 失效时回落到第一个会话', () => {
    const s = fakeStorage();
    const a = createSession(1000), b = createSession(2000);
    s.setItem(STORE_KEY, JSON.stringify({ version: 2, activeId: 'ghost', sessions: [a, b] }));
    const st = loadState(s);
    expect(st.activeId).toBe(a.id);                     /* updatedAt 大的在前 */
  });

  it('sanitizeSessions：剔除坏行、补默认值、messages 截尾', () => {
    const out = sanitizeSessions([
      null,
      { id: 'a', messages: 'bad' },
      { id: 'b', pinned: 1, messages: [{ role: 'user', content: 'hi' }, { nope: 1 }] },
    ]);
    expect(out.length).toBe(2);
    expect(out[1].pinned).toBe(true);
    expect(out[1].messages.length).toBe(1);
  });

  it('trimSessions：超上限淘汰最旧未置顶，置顶保留', () => {
    const list = [];
    for (let i = 0; i < MAX_SESSIONS + 3; i++) {
      const ses = createSession(1000 + i);
      ses.updatedAt = 1000 + i;
      if (i === 0) ses.pinned = true;                   /* 最旧的会话被置顶 */
      list.push(ses);
    }
    const out = trimSessions(list);
    expect(out.length).toBe(MAX_SESSIONS);
    expect(out.some((x) => x.id === list[0].id)).toBe(true);   /* 置顶的没被删 */
    expect(out.some((x) => x.id === list[1].id)).toBe(false);  /* 次旧的未置顶被删 */
  });

  it('sortSessions：置顶在前，组内 updatedAt 降序', () => {
    const a = { id: 'a', title: '', pinned: false, createdAt: 0, updatedAt: 100, messages: [] };
    const b = { id: 'b', title: '', pinned: true, createdAt: 0, updatedAt: 10, messages: [] };
    const c = { id: 'c', title: '', pinned: false, createdAt: 0, updatedAt: 300, messages: [] };
    expect(sortSessions([a, b, c]).map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('autoTitle：首条用户消息截 20 字加省略号；无用户消息为空串', () => {
    const long = '一二三四五六七八九十一二三四五六七八九十一二三四';
    expect(autoTitle([{ role: 'user', content: long }]).length).toBe(21);   /* 20 字 + … */
    expect(autoTitle([{ role: 'assistant', content: 'hi' }])).toBe('');
    expect(autoTitle([])).toBe('');
    expect(autoTitle([{ role: 'user', content: '  多  空白 \n 收敛 ' }])).toBe('多 空白 收敛');
  });

  it('groupSessions：置顶 / 今天 / 更早 三组', () => {
    const now = new Date('2026-09-28T20:00:00');
    const mk = (id, pinned, updatedAt) => ({ id, title: '', pinned, createdAt: 0, updatedAt, messages: [] });
    const g = groupSessions([
      mk('p1', true, 1), mk('t1', false, new Date('2026-09-28T09:00:00').getTime()), mk('e1', false, 1),
    ], now.getTime());
    expect(g.pinned.map((x) => x.id)).toEqual(['p1']);
    expect(g.today.map((x) => x.id)).toEqual(['t1']);
    expect(g.earlier.map((x) => x.id)).toEqual(['e1']);
  });

  it('nextActiveAfterRemove：优先右邻，否则左邻，否则空', () => {
    const mk = (id, updatedAt) => ({ id, title: '', pinned: false, createdAt: 0, updatedAt, messages: [] });
    const list = [mk('a', 100), mk('b', 200), mk('c', 300)];
    expect(nextActiveAfterRemove(list, 'b')).toBe('a');   /* b 右邻是 updatedAt 更小的 a（降序列表的下一个） */
    expect(nextActiveAfterRemove(list, 'c')).toBe('b');   /* c 是最前，取左邻 b */
    expect(nextActiveAfterRemove(list, 'zzz')).toBe('c');
    expect(nextActiveAfterRemove([], 'a')).toBe('');
  });

  it('saveState：写回时做容量淘汰，activeId 被淘汰则回落第一个', () => {
    const s = fakeStorage();
    const list = [];
    for (let i = 0; i < MAX_SESSIONS + 1; i++) {
      const ses = createSession(1000 + i);
      ses.updatedAt = 1000 + i;
      list.push(ses);
    }
    /* 故意把 activeId 指向最旧的（会被淘汰）会话 */
    const r = saveState(s, { activeId: list[0].id, sessions: list });
    expect(r.sessions.length).toBe(MAX_SESSIONS);
    expect(r.sessions.some((x) => x.id === list[0].id)).toBe(false);
    expect(r.activeId).not.toBe(list[0].id);
    /* 回读一致 */
    expect(loadState(s).sessions.length).toBe(MAX_SESSIONS);
  });

  it('newId：唯一且带 s_ 前缀', () => {
    const set = new Set(Array.from({ length: 200 }, () => newId()));
    expect(set.size).toBe(200);
    expect([...set][0].startsWith('s_')).toBe(true);
  });
});
