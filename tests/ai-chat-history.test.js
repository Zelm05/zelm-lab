/* ==========================================================================
 * tests/ai-chat-history.test.js —— /api/ai/sessions*（AI 聊天记录落库）单测
 *
 * 重点覆盖**用户隔离**（本次改造的核心）：
 *   · 未登录 / 被踢下线 → 401
 *   · 列表、消息、增删改全部只返回「自己的」
 *   · A 改/删/读 B 的会话与消息 → 404（不泄露存在性，不返回 403）
 *   · 删会话 → 消息级联清理
 *   · 一次性 import 的幂等保护（已有会话则跳过）
 *
 * 桩说明（与 tests/ai-chat.test.js 同风格，零运行时依赖）：
 *   · env.DB 是**带状态**的内存 D1 桩 —— 因为要验证「写进去再读出来」和
 *     级联删除，纯返回值桩（prepare→bind→first）做不到；
 *   · 会话删除时按 ON DELETE CASCADE 的语义同步删掉其消息（模拟真实 D1）；
 *   · JWT 用 auth.js 自己的 signJWT 签真令牌，走真实 verifySession。
 * ========================================================================== */
/* ⚠️ 不要 `import { describe } from 'vitest'` —— 见 vite.config.js test.globals 的
 *   根因说明：本环境下会解析到另一份 vitest 实例，导致整个文件 0 test 收集失败。
 *   describe / it / expect 由 globals 注入（ESLint 侧已在 eslint.config.js 声明）。 */
import { handleAiHistoryApi } from '../worker/ai-chat-history.js';
import { signJWT } from '../worker/auth.js';

const SECRET = 'test-jwt-secret';
const U1 = 7;   /* Alice */
const U2 = 8;   /* Bob */

/* -------------------------------------------------------------------------
 * 带状态的内存 D1 桩
 * ---------------------------------------------------------------------- */
function fakeDb(opts = {}) {
  const sessions = [];
  const messages = [];
  let rowid = 0;

  const sortSessions = () => sessions.slice().sort((a, b) =>
    (Number(b.pinned) - Number(a.pinned))
    || (String(b.updated_at).localeCompare(String(a.updated_at))));

  function first(sql, args) {
    /* auth.js verifySession：SELECT id FROM sessions WHERE id = ? AND user_id = ? */
    if (/FROM sessions WHERE id = \? AND user_id = \?/i.test(sql)) {
      return opts.kick ? null : { id: 1 };
    }
    if (/FROM ai_chat_sessions WHERE id = \? AND user_id = \?/i.test(sql)) {
      return sessions.find((s) => s.id === args[0] && s.user_id === args[1]) || null;
    }
    return null;
  }

  function all(sql, args) {
    if (/FROM ai_chat_sessions WHERE user_id = \?/i.test(sql)) {
      return sortSessions().filter((s) => s.user_id === args[0]);
    }
    if (/FROM ai_chat_messages WHERE session_id = \? AND user_id = \?/i.test(sql)) {
      return messages
        .filter((m) => m.session_id === args[0] && m.user_id === args[1])
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.rowid - b.rowid);
    }
    return [];
  }

  function run(sql, args) {
    if (/INSERT INTO ai_chat_sessions/i.test(sql)) {
      sessions.push({
        id: args[0], user_id: args[1], title: args[2],
        pinned: args[3], created_at: args[4], updated_at: args[5],
      });
      return;
    }
    if (/INSERT INTO ai_chat_messages/i.test(sql)) {
      messages.push({
        id: args[0], session_id: args[1], user_id: args[2],
        role: args[3], content: args[4], created_at: args[5], rowid: ++rowid,
      });
      return;
    }
    if (/UPDATE ai_chat_sessions SET/i.test(sql)) {
      const id = args[args.length - 2];
      const uid = args[args.length - 1];
      const s = sessions.find((x) => x.id === id && x.user_id === uid);
      if (!s) return;
      /* 只认本模块实际拼出来的两种 SET：title / pinned / updated_at */
      const m = sql.match(/SET (.+?) WHERE/i);
      const cols = m ? m[1].split(',').map((x) => x.trim()) : [];
      let i = 0;
      for (const c of cols) {
        if (/^title = \?$/.test(c)) s.title = args[i++];
        else if (/^pinned = \?$/.test(c)) s.pinned = args[i++];
        else if (/^updated_at = \?$/.test(c)) s.updated_at = args[i++];
        else i++;
      }
      return;
    }
    if (/DELETE FROM ai_chat_sessions WHERE id = \? AND user_id = \?/i.test(sql)) {
      const idx = sessions.findIndex((s) => s.id === args[0] && s.user_id === args[1]);
      if (idx < 0) return;
      sessions.splice(idx, 1);
      /* 模拟真实 D1 的 ON DELETE CASCADE */
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].session_id === args[0]) messages.splice(i, 1);
      }
    }
  }

  const db = {
    sessions,
    messages,
    prepare(sql) {
      const stmt = {
        bind(...args) {
          stmt._args = args;
          return stmt;
        },
        async first() { return first(sql, stmt._args || []); },
        async all() { return { results: all(sql, stmt._args || []) }; },
        async run() { run(sql, stmt._args || []); return { meta: {} }; },
      };
      return stmt;
    },
    async batch(stmts) {
      for (const s of stmts) await s.run();
      return [];
    },
  };
  return db;
}

async function req(path, uid, init = {}) {
  const jwt = await signJWT({ sub: uid, sid: 'sid' + uid, username: 'u' + uid, role: 'user' }, SECRET);
  return new Request('https://luminae.dpdns.org' + path, {
    method: init.method || 'GET',
    headers: Object.assign(
      { 'Content-Type': 'application/json', Cookie: 'token=' + jwt },
      init.headers || {},
    ),
    body: init.body,
  });
}
const anonReq = (path, method = 'GET') => new Request('https://luminae.dpdns.org' + path, { method });

/** 建一个会话（走真实接口），返回会话对象 */
async function mkSession(env, uid, body) {
  const res = await handleAiHistoryApi(
    await req('/api/ai/sessions', uid, { method: 'POST', body: JSON.stringify(body || {}) }),
    env,
  );
  return { res, session: (await res.json()).session };
}

describe('AI 聊天记录 —— 登录门槛', () => {
  it('401：未登录访问会话列表', async () => {
    const env = { DB: fakeDb(), JWT_SECRET: SECRET };
    const res = await handleAiHistoryApi(anonReq('/api/ai/sessions'), env);
    expect(res.status).toBe(401);
  });

  it('401：被踢下线（会话令牌已失效）访问消息接口', async () => {
    const env = { DB: fakeDb({ kick: true }), JWT_SECRET: SECRET };
    const res = await handleAiHistoryApi(await req('/api/ai/sessions', U1), env);
    expect(res.status).toBe(401);
  });

  it('401：未登录时所有写接口一律拒绝（新建/改/删/追加消息/导入）', async () => {
    const env = { DB: fakeDb(), JWT_SECRET: SECRET };
    const paths = [
      ['/api/ai/sessions', 'POST'],
      ['/api/ai/sessions/import', 'POST'],
      ['/api/ai/sessions/s_1', 'PATCH'],
      ['/api/ai/sessions/s_1', 'DELETE'],
      ['/api/ai/sessions/s_1/messages', 'POST'],
      ['/api/ai/sessions/s_1/messages', 'GET'],
    ];
    for (const [p, m] of paths) {
      const res = await handleAiHistoryApi(anonReq(p, m), env);
      expect(res.status, p + ' ' + m).toBe(401);
    }
    expect(env.DB.sessions).toHaveLength(0);
    expect(env.DB.messages).toHaveLength(0);
  });

  it('非本模块路径返回 null（不抢 /api/ai/chat 等路由）', async () => {
    const env = { DB: fakeDb(), JWT_SECRET: SECRET };
    expect(await handleAiHistoryApi(anonReq('/api/ai/chat'), env)).toBe(null);
    expect(await handleAiHistoryApi(anonReq('/api/ai/usage'), env)).toBe(null);
  });
});

describe('AI 聊天记录 —— 会话 CRUD', () => {
  it('POST 新建 → 201，再 GET 只看到自己的', async () => {
    const env = { DB: fakeDb(), JWT_SECRET: SECRET };
    const { res, session } = await mkSession(env, U1, { id: 's_aaa111', title: 'A的会话' });
    expect(res.status).toBe(201);
    expect(session.id).toBe('s_aaa111');
    await mkSession(env, U2, { id: 's_bbb222', title: 'B的会话' });

    const listA = await (await handleAiHistoryApi(await req('/api/ai/sessions', U1), env)).json();
    expect(listA.sessions.map((s) => s.id)).toEqual(['s_aaa111']);
    const listB = await (await handleAiHistoryApi(await req('/api/ai/sessions', U2), env)).json();
    expect(listB.sessions.map((s) => s.id)).toEqual(['s_bbb222']);
  });

  it('客户端传非法 id 时服务端兜底生成（不盲信前端输入）', async () => {
    const env = { DB: fakeDb(), JWT_SECRET: SECRET };
    const { session } = await mkSession(env, U1, { id: '../../etc/passwd' });
    expect(session.id).toMatch(/^s_[0-9a-z]{6,32}$/);
  });

  it('PATCH 重命名 + 置顶生效，并刷新 updated_at', async () => {
    const env = { DB: fakeDb(), JWT_SECRET: SECRET };
    const { session } = await mkSession(env, U1, { id: 's_aaa111', title: '旧标题' });
    const res = await handleAiHistoryApi(
      await req('/api/ai/sessions/s_aaa111', U1, { method: 'PATCH', body: JSON.stringify({ title: '新标题', pinned: true }) }),
      env,
    );
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.session.title).toBe('新标题');
    expect(j.session.pinned).toBe(true);
    expect(j.session.updatedAt >= session.updatedAt).toBe(true);
  });

  it('PATCH 不带任何可更新字段 → 400', async () => {
    const env = { DB: fakeDb(), JWT_SECRET: SECRET };
    await mkSession(env, U1, { id: 's_aaa111' });
    const res = await handleAiHistoryApi(
      await req('/api/ai/sessions/s_aaa111', U1, { method: 'PATCH', body: '{}' }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it('方法不支持 → 405', async () => {
    const env = { DB: fakeDb(), JWT_SECRET: SECRET };
    expect((await handleAiHistoryApi(await req('/api/ai/sessions', U1, { method: 'PUT' }), env)).status).toBe(405);
    expect((await handleAiHistoryApi(await req('/api/ai/sessions/s_aaa111', U1, { method: 'POST' }), env)).status).toBe(405);
  });
});

describe('AI 聊天记录 —— 用户隔离（越权一律 404）', () => {
  it('A 不能改 B 的会话（404，且 B 的标题原封不动）', async () => {
    const env = { DB: fakeDb(), JWT_SECRET: SECRET };
    await mkSession(env, U1, { id: 's_aaa111', title: 'A' });
    await mkSession(env, U2, { id: 's_bbb222', title: 'B原标题' });
    const res = await handleAiHistoryApi(
      await req('/api/ai/sessions/s_bbb222', U1, { method: 'PATCH', body: JSON.stringify({ title: '被篡改' }) }),
      env,
    );
    expect(res.status).toBe(404);
    expect(env.DB.sessions.find((s) => s.id === 's_bbb222').title).toBe('B原标题');
  });

  it('A 不能删 B 的会话（404，B 的会话仍在）', async () => {
    const env = { DB: fakeDb(), JWT_SECRET: SECRET };
    await mkSession(env, U2, { id: 's_bbb222' });
    const res = await handleAiHistoryApi(
      await req('/api/ai/sessions/s_bbb222', U1, { method: 'DELETE' }),
      env,
    );
    expect(res.status).toBe(404);
    expect(env.DB.sessions).toHaveLength(1);
  });

  it('A 不能读 B 的消息（404）', async () => {
    const env = { DB: fakeDb(), JWT_SECRET: SECRET };
    await mkSession(env, U2, { id: 's_bbb222' });
    await handleAiHistoryApi(
      await req('/api/ai/sessions/s_bbb222/messages', U2, { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'B的秘密' }] }) }),
      env,
    );
    const res = await handleAiHistoryApi(await req('/api/ai/sessions/s_bbb222/messages', U1), env);
    expect(res.status).toBe(404);
  });

  it('A 不能往 B 的会话里写消息（404，且 B 的消息数不变）', async () => {
    const env = { DB: fakeDb(), JWT_SECRET: SECRET };
    await mkSession(env, U2, { id: 's_bbb222' });
    await handleAiHistoryApi(
      await req('/api/ai/sessions/s_bbb222/messages', U2, { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'B问' }] }) }),
      env,
    );
    const before = env.DB.messages.length;
    const res = await handleAiHistoryApi(
      await req('/api/ai/sessions/s_bbb222/messages', U1, { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: '注入' }] }) }),
      env,
    );
    expect(res.status).toBe(404);
    expect(env.DB.messages).toHaveLength(before);
    expect(env.DB.messages.some((m) => m.content === '注入')).toBe(false);
  });

  it('不存在的会话 id 同样是 404（与越权返回一致，不泄露存在性）', async () => {
    const env = { DB: fakeDb(), JWT_SECRET: SECRET };
    const res = await handleAiHistoryApi(await req('/api/ai/sessions/s_zzz999', U1), env);
    expect(res.status).toBe(405);   /* /:id 只支持 PATCH/DELETE，GET 走 405 */
    const r2 = await handleAiHistoryApi(await req('/api/ai/sessions/s_zzz999', U1, { method: 'DELETE' }), env);
    expect(r2.status).toBe(404);
  });
});

describe('AI 聊天记录 —— 消息读写与级联删除', () => {
  it('追加消息后可读回（按时间正序），并顺带刷新会话 updated_at', async () => {
    const env = { DB: fakeDb(), JWT_SECRET: SECRET };
    const { session } = await mkSession(env, U1, { id: 's_aaa111', title: 'A' });
    const post = await handleAiHistoryApi(
      await req('/api/ai/sessions/s_aaa111/messages', U1, {
        method: 'POST',
        body: JSON.stringify({
          title: '自动命名',
          messages: [
            { role: 'user', content: '你好', createdAt: '2026-09-28T10:00:00.000Z' },
            { role: 'assistant', content: '嗨', createdAt: '2026-09-28T10:00:01.000Z' },
          ],
        }),
      }),
      env,
    );
    expect(post.status).toBe(200);
    expect((await post.json()).count).toBe(2);

    const got = await (await handleAiHistoryApi(await req('/api/ai/sessions/s_aaa111/messages', U1), env)).json();
    expect(got.messages.map((m) => m.content)).toEqual(['你好', '嗨']);
    expect(got.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    /* title 随消息一起更新了（自动命名走的就是这条路径） */
    expect(env.DB.sessions[0].title).toBe('自动命名');
    expect(env.DB.sessions[0].updated_at >= session.updatedAt).toBe(true);
  });

  it('非法 role / 空内容会被跳过；全部非法 → 400', async () => {
    const env = { DB: fakeDb(), JWT_SECRET: SECRET };
    await mkSession(env, U1, { id: 's_aaa111' });
    const ok = await handleAiHistoryApi(
      await req('/api/ai/sessions/s_aaa111/messages', U1, {
        method: 'POST',
        body: JSON.stringify({ messages: [{ role: 'system', content: '越权角色' }, { role: 'user', content: '' }, { role: 'user', content: '有效' }] }),
      }),
      env,
    );
    expect((await ok.json()).count).toBe(1);
    expect(env.DB.messages.map((m) => m.content)).toEqual(['有效']);

    const bad = await handleAiHistoryApi(
      await req('/api/ai/sessions/s_aaa111/messages', U1, { method: 'POST', body: JSON.stringify({ messages: [{ role: 'root', content: 'x' }] }) }),
      env,
    );
    expect(bad.status).toBe(400);
  });

  it('messages 不是数组 / 超过批量上限 → 400', async () => {
    const env = { DB: fakeDb(), JWT_SECRET: SECRET };
    await mkSession(env, U1, { id: 's_aaa111' });
    const a = await handleAiHistoryApi(
      await req('/api/ai/sessions/s_aaa111/messages', U1, { method: 'POST', body: JSON.stringify({ messages: 'nope' }) }), env);
    expect(a.status).toBe(400);
    const many = Array.from({ length: 61 }, () => ({ role: 'user', content: 'x' }));
    const b = await handleAiHistoryApi(
      await req('/api/ai/sessions/s_aaa111/messages', U1, { method: 'POST', body: JSON.stringify({ messages: many }) }), env);
    expect(b.status).toBe(400);
  });

  it('删自己的会话 → 消息被级联清理（模拟 ON DELETE CASCADE）', async () => {
    const env = { DB: fakeDb(), JWT_SECRET: SECRET };
    await mkSession(env, U1, { id: 's_aaa111' });
    await handleAiHistoryApi(
      await req('/api/ai/sessions/s_aaa111/messages', U1, { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a' }] }) }),
      env,
    );
    expect(env.DB.messages).toHaveLength(2);
    const res = await handleAiHistoryApi(await req('/api/ai/sessions/s_aaa111', U1, { method: 'DELETE' }), env);
    expect(res.status).toBe(200);
    expect(env.DB.sessions).toHaveLength(0);
    expect(env.DB.messages).toHaveLength(0);
  });
});

describe('AI 聊天记录 —— 一次性 import（旧 sessionStorage 搬迁）', () => {
  const payload = {
    sessions: [
      {
        id: 's_legacy1', title: '旧会话', pinned: false,
        createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-20T10:05:00.000Z',
        messages: [
          { role: 'user', content: '旧问题', createdAt: '2026-09-20T10:00:00.000Z' },
          { role: 'assistant', content: '旧回答', createdAt: '2026-09-20T10:00:05.000Z' },
        ],
      },
    ],
  };

  it('首次导入成功：会话 + 消息都落库，且归属导入者', async () => {
    const env = { DB: fakeDb(), JWT_SECRET: SECRET };
    const res = await handleAiHistoryApi(
      await req('/api/ai/sessions/import', U1, { method: 'POST', body: JSON.stringify(payload) }),
      env,
    );
    const j = await res.json();
    expect(j.imported).toBe(1);
    expect(j.messages).toBe(2);
    expect(env.DB.sessions[0].user_id).toBe(U1);
    expect(env.DB.messages.every((m) => m.user_id === U1)).toBe(true);
    /* 导入的数据归 U1，U2 的列表必须为空 */
    const listB = await (await handleAiHistoryApi(await req('/api/ai/sessions', U2), env)).json();
    expect(listB.sessions).toHaveLength(0);
  });

  it('幂等：已有会话时跳过，不重复导入', async () => {
    const env = { DB: fakeDb(), JWT_SECRET: SECRET };
    await mkSession(env, U1, { id: 's_exist01' });
    const res = await handleAiHistoryApi(
      await req('/api/ai/sessions/import', U1, { method: 'POST', body: JSON.stringify(payload) }),
      env,
    );
    const j = await res.json();
    expect(j.skipped).toBe(true);
    expect(j.imported).toBe(0);
    expect(env.DB.sessions).toHaveLength(1);
  });

  it('sessions 不是数组 / 超过 30 个 → 400', async () => {
    const env = { DB: fakeDb(), JWT_SECRET: SECRET };
    const a = await handleAiHistoryApi(
      await req('/api/ai/sessions/import', U1, { method: 'POST', body: JSON.stringify({ sessions: [] }) }), env);
    expect(a.status).toBe(400);
    const tooMany = { sessions: Array.from({ length: 31 }, (_, i) => ({ id: 's_many' + i, title: 'x' })) };
    const b = await handleAiHistoryApi(
      await req('/api/ai/sessions/import', U1, { method: 'POST', body: JSON.stringify(tooMany) }), env);
    expect(b.status).toBe(400);
  });
});
