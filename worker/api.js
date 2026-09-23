// ===================================================================
// api.js — 认证接口 & 管理员系统（单 Worker 架构不变）
// 角色体系：users.role ∈ { 'user', 'admin', 'owner' }
//   - owner（最高管理员/站长）：全站唯一，账号 zelm，比 admin 权限更高，
//     可管理所有账号（含提升/降级/冻结/删除其他管理员）；不可被修改。
//   - admin：拥有 /api/admin/* 管理接口权限；不能互相修改身份、不能冻结/删除其他管理员。
//   - 内置账号 zelm 首次 /api 请求时自动 seed（role = owner，幂等自愈）。
// ===================================================================

import {
  makePasswordRecord,
  verifyPassword,
  signJWT,
  buildAuthCookie,
  authenticate,
  verifySession,
  json,
  checkRateLimit,
  getClientIP,
  cleanupRateLimits,
  PBKDF2_ITERATIONS,
} from './auth.js';
import { logModeration } from './moderation.js';

// Token 有效期（秒）：7 天
const TOKEN_TTL = 60 * 60 * 24 * 7;

// 会话「在线」判定：超过该时长（毫秒）无心跳即视为离线（前端每 15 秒心跳一次）
// 防止「没点登出就关闭页面」的残留记录永久占用登录名额
const SESSION_STALE_MS = 5 * 60 * 1000; // 5 分钟

// 合法角色（API 可赋值的角色；owner 为固定最高身份，不可通过接口授予）
const ROLES = ['user', 'admin'];

// 是否为管理员级身份（admin / owner）
function isPrivileged(role) { return role === 'admin' || role === 'owner'; }

// ===================================================================
// 内置最高管理员（seed）：zelm，role = owner（全站唯一）
//
// ⚠️ 凭据**不再**硬编码在源码里（旧版明文写着 salt + password_hash，而本文件
//    已被 git 跟踪 —— 任何人拿到仓库即可离线爆破站长密码）。
//    现在改从 Worker 的环境变量读，用 wrangler secret 注入，不进版本库：
//
//      npx wrangler secret put SEED_OWNER_SALT
//      npx wrangler secret put SEED_OWNER_HASH
//
//    取值必须是 PBKDF2-SHA256 / 100000 轮 / 16 字节随机盐 / 256bit / Base64URL，
//    与 auth.js 的 makePasswordRecord() 完全一致。生成命令（在本机跑，别上传）：
//
//      node -e "const c=require('crypto');const s=c.randomBytes(16);\
//        const h=c.pbkdf2Sync('你要设的密码',s,100000,32,'sha256');\
//        console.log('SALT='+s.toString('base64url'));\
//        console.log('HASH='+h.toString('base64url'))"
//
// 降级行为：两个变量只要缺一个，就**完全跳过 seed**（只在控制台 warn 一次），
//   不会创建任何账号，也不会报错阻塞业务。此时站长账号需手动建：
//     npx wrangler d1 execute auth-db --remote --command \
//       "UPDATE users SET role='owner' WHERE username='你的账号'"
// ===================================================================
const SEED_OWNER_USERNAME = 'zelm';

/** seed 是否已在本 isolate 内跑过。
 *  每个 Worker isolate 只跑一次（isolate 被回收后最多再跑一次），
 *  避免原来的「每请求 3 条写语句」D1 浪费。 */
let __seedDone = false;

/** 从环境变量取站长凭据；缺失返回 null（不猜、不兜默认密码） */
function readSeedCredential(env) {
  const salt = env && env.SEED_OWNER_SALT;
  const hash = env && env.SEED_OWNER_HASH;
  if (!salt || !hash) return null;
  return { salt: String(salt), hash: String(hash) };
}

/** 保证内置管理员 zelm 存在且是唯一 owner（幂等；凭据来自 wrangler secret） */
async function ensureSeed(env) {
  if (__seedDone) return;
  const cred = readSeedCredential(env);
  if (!cred) {
    // 只 warn 一次（下一行置位后本 isolate 内不再进入这里），避免刷爆日志
    console.warn('[seed] SEED_OWNER_SALT / SEED_OWNER_HASH 未配置，跳过站长账号自动创建');
    __seedDone = true;
    return;
  }

  try {
    await env.DB
      .prepare('INSERT OR IGNORE INTO users (username, salt, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(SEED_OWNER_USERNAME, cred.salt, cred.hash, 'owner', Date.now())
      .run();
    // 自愈：zelm 必须是 owner，且 owner 全站唯一（其余 owner 降回 admin）
    await env.DB
      .prepare("UPDATE users SET role = 'owner' WHERE username = ? AND role <> 'owner'")
      .bind(SEED_OWNER_USERNAME)
      .run();
    await env.DB
      .prepare("UPDATE users SET role = 'admin' WHERE role = 'owner' AND username <> ?")
      .bind(SEED_OWNER_USERNAME)
      .run();
    __seedDone = true;
  } catch (e) {
    // 失败不置位，下个请求还能重试；也不阻塞认证流程
    console.error('[seed] 站长账号创建失败：', e && e.message);
  }
}

// ---------------- 注册 ----------------
export async function register(request, env) {
  // 频率限制：每 IP 每分钟最多 5 次注册请求
  const ip = getClientIP(request);
  const rateKey = `register:${ip}`;
  const rateCheck = await checkRateLimit(env, rateKey, 5, 60000);
  if (!rateCheck.allowed) {
    return json({ 
      error: `注册请求过于频繁，请 ${rateCheck.retryAfter} 秒后再试`,
      retryAfter: rateCheck.retryAfter 
    }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }
  const username = (body.username || '').trim();
  const password = body.password || '';
  // 头像（可选）：注册时从预设头像里选一个，客户端传标识（'av1'..'av6'）
  // 未传或非法 → NULL，展示时回退到默认头像
  const avatarRaw = typeof body.avatar === 'string' ? body.avatar.trim() : '';
  const avatar = /^av[1-6]$/.test(avatarRaw) ? avatarRaw : null;

  // 入参校验
  if (!username || !password) {
    return json({ error: '用户名和密码不能为空' }, 400);
  }
  if (username.length < 2 || username.length > 32) {
    return json({ error: '用户名长度需为 2-32 个字符' }, 400);
  }
  // 允许汉字、字母、数字、下划线（注册即可直接使用中文名字）
  if (!/^[\u4e00-\u9fa5A-Za-z0-9_]+$/.test(username)) {
    return json({ error: '用户名仅支持汉字、字母、数字和下划线' }, 400);
  }
  if (password.length < 8) {
    return json({ error: '密码长度至少 8 位' }, 400);
  }

  // 校验用户名唯一性
  const exists = await env.DB
    .prepare('SELECT id FROM users WHERE username = ?')
    .bind(username)
    .first();
  if (exists) {
    return json({ error: '该用户名已被注册' }, 409);
  }

  // 普通注册用户固定为 user 角色；管理员仅内置 zelm 或由管理员提升
  const role = 'user';

  // 生成盐与哈希（绝不存明文）
  const { salt, hash } = await makePasswordRecord(password);

  // 写入用户表（用户名即显示名，后续可改名，改名后登录名同步变更）
  await env.DB
    .prepare(
      'INSERT INTO users (username, salt, password_hash, role, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .bind(username, salt, hash, role, avatar, Date.now())
    .run();

  return json({ message: '注册成功', role }, 201);
}

// ---------------- 登录 ----------------
export async function login(request, env) {
  // 频率限制：每 IP 每分钟最多 10 次登录请求
  const ip = getClientIP(request);
  const rateKey = `login:${ip}`;
  const rateCheck = await checkRateLimit(env, rateKey, 10, 60000);
  if (!rateCheck.allowed) {
    return json({ 
      error: `登录请求过于频繁，请 ${rateCheck.retryAfter} 秒后再试`,
      retryAfter: rateCheck.retryAfter 
    }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }
  const username = (body.username || '').trim();
  const password = body.password || '';

  if (!username || !password) {
    return json({ error: '用户名和密码不能为空' }, 400);
  }

  // 查询用户（含角色、冻结状态）：用户名即登录标识（改名会同步更新 username，旧名不可再登录）
  // P2-5：一并读取 pwd_algo / pwd_iter，用于「参数落后自动重算」（见下文）。
  //   这要求 P2-5 迁移（users 加两列）已执行；若尚未迁移，下方 try/catch 退回不含新列的查询，
  //   登录照常工作、仅跳过重算，避免「先部署 worker 后迁移」期间的登录 500。
  let user;
  try {
    user = await env.DB
      .prepare('SELECT id, username, salt, password_hash, role, suspended, pwd_algo, pwd_iter FROM users WHERE username = ?')
      .bind(username)
      .first();
  } catch (e) {
    user = await env.DB
      .prepare('SELECT id, username, salt, password_hash, role, suspended FROM users WHERE username = ?')
      .bind(username)
      .first();
    if (user) { user.pwd_algo = 'pbkdf2-sha256'; user.pwd_iter = PBKDF2_ITERATIONS; }
  }

  // 用户不存在或密码错误（统一返回 401，避免泄露用户名是否存在）
  if (!user) {
    return json({ error: '用户名或密码错误' }, 401);
  }
  const ok = await verifyPassword(password, user.salt, user.password_hash);
  if (!ok) {
    return json({ error: '用户名或密码错误' }, 401);
  }

  // P2-5：密码参数升级 —— 若库中算法/迭代次数落后于当前 auth.js 设定，
  //   趁明文密码已在手的这次登录用新参数重算哈希并写回。现有账号的哈希本就是
  //   pbkdf2-sha256/100000，故当前不会触发；仅当未来上调迭代次数后才会对老用户生效。
  const curAlgo = user.pwd_algo || 'pbkdf2-sha256';
  const curIter = Number(user.pwd_iter) || PBKDF2_ITERATIONS;
  if (curAlgo !== 'pbkdf2-sha256' || curIter < PBKDF2_ITERATIONS) {
    try {
      const rec = await makePasswordRecord(password); // 重新随机盐 + 当前参数哈希
      await env.DB
        .prepare('UPDATE users SET salt = ?, password_hash = ?, pwd_algo = ?, pwd_iter = ? WHERE id = ?')
        .bind(rec.salt, rec.hash, 'pbkdf2-sha256', PBKDF2_ITERATIONS, user.id)
        .run();
    } catch (e) {
      // 重算失败不阻断本次登录（下次登录再试），仅记录
      console.error('[login] password rehash failed:', e && (e.message || e));
    }
  }

  // 账号被冻结
  if (user.suspended) {
    return json({ error: '账号已被冻结，请联系管理员' }, 403);
  }

  // 单端登录：检测是否已有活跃会话（未强制顶号时）
  const force = !!body.force;
  try {
    if (!force) {
      // 先清理「长时间无心跳」的陈旧会话（用户没点登出就关了页面会残留记录，
      // 视为已离线，自动释放登录名额，避免任何账号都被误判为“已在别处登录”）
      await env.DB
        .prepare('DELETE FROM sessions WHERE user_id = ? AND last_seen < ?')
        .bind(user.id, Date.now() - SESSION_STALE_MS)
        .run();
      const existing = await env.DB
        .prepare('SELECT id FROM sessions WHERE user_id = ? LIMIT 1')
        .bind(user.id)
        .first();
      if (existing) {
        return json({ conflict: true, message: '该账号已在其他设备登录' }, 409);
      }
    }
  } catch (e) {
    // sessions 表缺失（未迁移）等数据库错误：给出可操作的提示，避免被统一 500 吞掉
    return json(
      { error: '数据库未初始化：请先执行 wrangler d1 execute auth-db --remote --file=./migrations/migration-add-sessions.sql' },
      500
    );
  }

  // 先生成会话 id 并签发 JWT：失败则直接返回、不写任何会话记录，
  // 避免「签名失败但 session 已插入」导致下次登录被误判为已在别处登录
  const sid = crypto.randomUUID();
  let token;
  try {
    token = await signJWT(
      { sub: user.id, username: user.username, role: user.role, sid },
      env.JWT_SECRET,
      TOKEN_TTL
    );
  } catch (e) {
    console.error('login signJWT error:', e);
    return json({ error: '服务端配置错误：JWT_SECRET 未设置或无效，请运行 wrangler secret put JWT_SECRET' }, 500);
  }

  // 签名成功后：清理旧会话并写入本次会话（单端登录顶号）
  // P2-6：两步写合并为一次 db.batch，避免「删了旧会话却没插新会话」的中间态
  try {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
      env.DB.prepare('INSERT INTO sessions (id, user_id, device, created_at, last_seen) VALUES (?, ?, ?, ?, ?)')
        .bind(sid, user.id, body.device || 'web', Date.now(), Date.now()),
    ]);
  } catch (e) {
    // 会话写入失败不影响本次登录，但下次登录会重新建会话
    console.error('login session write error:', e);
  }

  return new Response(
    JSON.stringify({ message: '登录成功', username: user.username, role: user.role }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': buildAuthCookie(token, TOKEN_TTL, request),
      },
    }
  );
}

// ---------------- 登出 ----------------
export async function logout(request, env) {
  // 删除服务端会话记录，释放单端登录名额
  const payload = await authenticate(request, env);
  if (payload && payload.sid) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(payload.sid).run().catch(() => {});
  }
  // 将 Cookie 的 Max-Age 置 0，浏览器立即清除（本地 http 同样豁免 Secure）
  return new Response(JSON.stringify({ message: '已登出' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': buildAuthCookie('', 0, request),
    },
  });
}

// ---------------- 获取当前登录用户 ----------------
export async function me(request, env) {
  const user = await verifySession(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  if (user.kicked) return json({ kicked: true, message: '账号已在其他设备登录' }, 401);
  // 拉取最新 username（改名后 JWT 里仍是旧登录名，以库里最新值为准）
  let latestName = null;
  try {
    const row = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(Number(user.sub)).first();
    if (row && row.username) latestName = row.username;
  } catch (e) { /* 表异常时回退 JWT 里的用户名 */ }
  return json({
    id: user.sub,
    username: latestName || user.username,
    role: user.role || 'user',
  });
}

// ---------------- PATCH /api/me/username —— 当前登录用户修改用户名（即显示名） ----------------
// 三种角色（user / admin / owner）通用；用户名允许汉字、全站唯一、1-20 字符；
// 改名即改登录标识：改名后可用新名字登录，显示名（留言/列表等）同步变为新名字。
export async function changeUsername(request, env) {
  const user = await verifySession(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  if (user.kicked) return json({ kicked: true, message: '账号已在其他设备登录' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }
  const username = typeof body.username === 'string' ? body.username.trim() : '';

  if (!username) {
    return json({ error: '名字不能为空' }, 400);
  }
  if (username.length > 20) {
    return json({ error: '名字长度不能超过 20 个字符' }, 400);
  }
  // 允许汉字、字母、数字、下划线、连字符、空格（不能是纯空格）
  if (!/^[\u4e00-\u9fa5A-Za-z0-9_\- ]+$/.test(username)) {
    return json({ error: '名字仅支持汉字、字母、数字、下划线、连字符和空格' }, 400);
  }

  // 唯一性校验（排除自己）
  const dup = await env.DB
    .prepare('SELECT id FROM users WHERE username = ? AND id <> ?')
    .bind(username, Number(user.sub))
    .first();
  if (dup) return json({ error: '这个名字已被使用，请换一个' }, 409);

  // 每天限改一次：上次改名 24 小时内拒绝（新用户首次改名不受限，username_updated_at 为 NULL）
  const row = await env.DB
    .prepare('SELECT username_updated_at FROM users WHERE id = ?')
    .bind(Number(user.sub))
    .first();
  if (row && row.username_updated_at) {
    const elapsed = Date.now() - Number(row.username_updated_at);
    if (elapsed >= 0 && elapsed < 24 * 3600 * 1000) {
      const leftHours = Math.ceil((24 * 3600 * 1000 - elapsed) / 3600000);
      return json({ error: `名字每天只能修改一次，请 ${leftHours} 小时后再试` }, 429);
    }
  }

  try {
    await env.DB
      .prepare('UPDATE users SET username = ?, username_updated_at = ? WHERE id = ?')
      .bind(username, Date.now(), Number(user.sub))
      .run();
  } catch (e) {
    // 唯一索引兜底（并发场景）
    return json({ error: '这个名字已被使用，请换一个' }, 409);
  }
  return json({ message: '名字已更新', username });
}

// ---------------- POST /api/change-password —— 当前登录用户修改密码 ----------------
export async function changePassword(request, env) {
  const user = await verifySession(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  if (user.kicked) return json({ kicked: true, message: '账号已在其他设备登录' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }
  const oldPassword = body.oldPassword || '';
  const newPassword = body.newPassword || '';

  if (!oldPassword || !newPassword) {
    return json({ error: '旧密码和新密码不能为空' }, 400);
  }
  if (newPassword.length < 8) {
    return json({ error: '新密码长度至少 8 位' }, 400);
  }

  const row = await env.DB
    .prepare('SELECT salt, password_hash FROM users WHERE id = ?')
    .bind(Number(user.sub))
    .first();
  if (!row) return json({ error: '用户不存在' }, 404);

  const ok = await verifyPassword(oldPassword, row.salt, row.password_hash);
  if (!ok) return json({ error: '旧密码错误' }, 401);

  const { salt, hash } = await makePasswordRecord(newPassword);
  await env.DB
    .prepare('UPDATE users SET salt = ?, password_hash = ? WHERE id = ?')
    .bind(salt, hash, Number(user.sub))
    .run();

  // P0-3：改密必须让**其它**会话失效。
  // JWT 是无状态的，改哈希不影响旧令牌；只有删掉 sessions 行，verifySession()
  // 才会把它们判成 kicked —— 否则「被盗号后改密码」并不能把攻击者踢下线。
  //
  // 刻意**保留当前这一行**（id <> 自己的 sid）：单端登录模式下同一账号最多只有
  // 一行会话，能走到这里说明当前令牌就是本人；保留它可以让改密后仍保持登录，
  // 不会误弹「账号已在其他设备登录」。若确实存在别的行（异常残留 / 并发窗口），
  // 那些才是要清掉的。
  if (user.sid) {
    // 能识别自己这行 → 只清其它行，保持本机登录
    await env.DB
      .prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?')
      .bind(Number(user.sub), String(user.sid))
      .run()
      .catch(() => {});
  } else {
    // 老令牌没有 sid（verifySession 里 `if (!sid) return payload` 会放行），
    // 此时无法区分哪一行是自己 → 全部清掉，强制重新登录。
    // 这是刻意取舍：宁可让用户多登录一次，也不能放过攻击者那一行。
    await env.DB
      .prepare('DELETE FROM sessions WHERE user_id = ?')
      .bind(Number(user.sub))
      .run()
      .catch(() => {});
  }

  return json({ message: '密码已修改' });
}

// ===================================================================
// 管理员系统 —— 以下接口仅 role === 'admin' 可访问
// ===================================================================

// 管理员鉴权：返回 { user } / { code: 401 }（未登录或被顶号）/ { code: 403 }（非管理员）
//
// ⚠️ 这里必须用 verifySession() 而不是 authenticate()：
//    用 authenticate() 时，登出 / 被顶号只是删掉了 sessions 行，JWT 在 7 天内
//    依然有效 —— 旧令牌（比如公用电脑上没清干净的 Cookie）可以直连
//    /api/admin/users 拉全站账号、改角色、删号。换成 verifySession() 后，
//    会话行已删即返回 { kicked: true }，旧令牌立刻失效。
async function getAdminUser(request, env) {
  const user = await verifySession(request, env);
  if (!user) return { code: 401 };
  if (user.kicked) return { code: 401 };
  if (!isPrivileged(user.role)) return { code: 403 };
  return { user };
}

// owner 是否存在于系统中（用于"最后一位管理员"保护：有 owner 时允许清空 admin）
async function ownerExists(env) {
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner' AND suspended = 0").first();
  return (n || 0) > 0;
}

// 从 /api/admin/users/:id 中取出 :id，非法返回 null
// 兼容 4 段（/api/admin/users/:id）与 5 段（/api/admin/users/:id/password）路径
function parseUserId(url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api','admin','users',':id'（,'password'|'suspend']）
  if (parts.length < 4 || parts[0] !== 'api' || parts[1] !== 'admin' || parts[2] !== 'users') {
    return null;
  }
  if (parts.length === 5 && !['password', 'suspend'].includes(parts[4])) return null;
  const id = Number(parts[3]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// ---------------- GET /api/admin/users —— 用户列表 + 统计 ----------------
export async function adminListUsers(request, env) {
  const auth = await getAdminUser(request, env);
  if (auth.code) return json({ error: auth.code === 401 ? '请先登录' : '无权访问' }, auth.code);

  // 分页 + 搜索 + 筛选参数
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') || '8', 10) || 8));
  const search = (url.searchParams.get('search') || '').trim();
  const roleFilter = (url.searchParams.get('role') || '').trim();
  const suspendedFilter = (url.searchParams.get('suspended') || '').trim();
  const onlineFilter = (url.searchParams.get('online') || '').trim();
  const offset = (page - 1) * pageSize;

  const baseSelect = 'SELECT id, username, role, suspended, created_at FROM users';
  const countBase = 'SELECT COUNT(*) AS n FROM users';
  const onlineThreshold = Date.now() - SESSION_STALE_MS;

  // 动态 WHERE 条件
  const conds = [];
  const params = [];
  if (search) {
    conds.push('(username LIKE ?)');
    params.push('%' + search + '%');
  }
  if (roleFilter === 'admin') {
    conds.push("role IN ('admin','owner')");
  } else if (roleFilter === 'user') {
    conds.push("role = 'user'");
  }
  if (suspendedFilter === '1') {
    conds.push('suspended = 1');
  } else if (suspendedFilter === '0') {
    conds.push('suspended = 0');
  }
  if (onlineFilter === '1') {
    conds.push('EXISTS (SELECT 1 FROM sessions WHERE sessions.user_id = users.id AND sessions.last_seen >= ?)');
    params.push(onlineThreshold);
  } else if (onlineFilter === '0') {
    conds.push('NOT EXISTS (SELECT 1 FROM sessions WHERE sessions.user_id = users.id AND sessions.last_seen >= ?)');
    params.push(onlineThreshold);
  }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
  const orderLimit = ' ORDER BY id ASC LIMIT ? OFFSET ?';

  const listStmt = env.DB.prepare(baseSelect + where + orderLimit).bind(...params, pageSize, offset);
  const users = await listStmt.all();

  // 总数（带当前筛选条件）
  const countStmt = env.DB.prepare(countBase + where).bind(...params);
  const countRow = await countStmt.first();

  // 在线判定
  const onlineRows = await env.DB
    .prepare('SELECT DISTINCT user_id FROM sessions WHERE last_seen >= ?')
    .bind(onlineThreshold)
    .all();
  const onlineSet = new Set((onlineRows.results || []).map((r) => r.user_id));

  // 全局统计（始终反映全站总体情况，不受筛选/搜索影响）
  const stats = await env.DB
    .prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN role IN ('admin','owner') THEN 1 ELSE 0 END) AS admins, SUM(CASE WHEN suspended = 1 THEN 1 ELSE 0 END) AS suspended FROM users")
    .first();

  return json({
    users: (users.results || []).map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      suspended: !!u.suspended,
      online: onlineSet.has(u.id),
      created_at: u.created_at,
    })),
    total: countRow ? (countRow.n || 0) : 0,
    page: page,
    pageSize: pageSize,
    stats: {
      total: stats.total || 0,
      admins: stats.admins || 0,
      suspended: stats.suspended || 0,
      online: onlineSet.size,
    },
  });
}

// ---------------- POST /api/admin/users/:id/kick —— 站长踢下线（仅 owner） ----------------
export async function adminKickUser(request, env, id) {
  const auth = await getAdminUser(request, env);
  if (auth.code) return json({ error: auth.code === 401 ? '请先登录' : '无权访问' }, auth.code);
  if (auth.user.role !== 'owner') {
    return json({ error: '仅站长可踢用户下线' }, 403);
  }
  const uid = Number(id);
  if (!uid) return json({ error: '用户不存在' }, 404);
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(uid).run();
  // P2-22：审计日志
  await logModeration(env, auth.user.sub, auth.user.username, 'kick_user', 'user', uid);
  return json({ ok: true, message: '已将该账号踢下线' });
}

// ---------------- PATCH /api/admin/users/:id —— 修改角色 ----------------
export async function adminUpdateRole(request, env, id) {
  const auth = await getAdminUser(request, env);
  if (auth.code) return json({ error: auth.code === 401 ? '请先登录' : '无权访问' }, auth.code);
  const me = auth.user;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }
  const role = body.role;
  if (!ROLES.includes(role)) {
    return json({ error: '角色只能是 user 或 admin（最高管理员不可通过接口授予）' }, 400);
  }

  const target = await env.DB
    .prepare('SELECT id, username, role FROM users WHERE id = ?')
    .bind(id)
    .first();
  if (!target) return json({ error: '用户不存在' }, 404);

  // 不允许自己给自己改角色（防止把自己降级导致失去管理员）
  if (Number(me.sub) === id) {
    return json({ error: '不能修改自己的角色' }, 400);
  }

  // 最高管理员（owner）不可被任何账号修改
  if (target.role === 'owner') {
    return json({ error: '最高管理员不可被修改' }, 403);
  }

  // 普通管理员之间不能互相修改身份；提升/降级管理员仅站长（owner）可操作
  if (me.role !== 'owner' && (target.role === 'admin' || role === 'admin')) {
    return json({ error: '仅最高管理员可修改管理员身份' }, 403);
  }

  // 允许降级最后一位管理员的前提是系统中存在 owner（有站长兜底）
  if (target.role === 'admin' && role === 'user') {
    const { n } = await env.DB
      .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'")
      .first();
    const hasOwner = await ownerExists(env);
    if (n <= 1 && !hasOwner) return json({ error: '不能撤销最后一位管理员' }, 400);
  }

  await env.DB
    .prepare('UPDATE users SET role = ? WHERE id = ?')
    .bind(role, id)
    .run();

  return json({ message: '已更新角色', id, username: target.username, role });
}

// ---------------- POST /api/admin/users/:id/password —— 重置密码 ----------------
// body: { password?: string, reveal?: boolean }
//   - 普通重置（admin/owner）：传入 password 重置为该值（≥8 位），不返回明文
//   - 站长查看密码（owner only）：reveal:true 自动生成 12 位随机密码并返回明文 newPassword
export async function adminResetPassword(request, env, id) {
  const auth = await getAdminUser(request, env);
  if (auth.code) return json({ error: auth.code === 401 ? '请先登录' : '无权访问' }, auth.code);
  const me = auth.user;
  const isOwner = me.role === 'owner';

  // 不能重置自己的密码（避免锁死）
  if (Number(me.sub) === Number(id)) return json({ error: '不能重置自己的密码' }, 400);

  let body = {};
  try { body = await request.json(); } catch { /* 允许空 body（reveal 模式） */ }
  const reveal = body.reveal === true;
  const providedPassword = (body.password || '').trim();

  if (reveal && !isOwner) return json({ error: '只有站长可以查看/重置密码' }, 403);

  let password = providedPassword;
  if (reveal) {
    if (!password) password = generateRandomPassword(12);
  } else {
    if (password.length < 8) return json({ error: '新密码长度至少 8 位' }, 400);
  }

  const target = await env.DB
    .prepare('SELECT id, username, role FROM users WHERE id = ?')
    .bind(id)
    .first();
  if (!target) return json({ error: '用户不存在' }, 404);
  // 不能重置站长自己的密码（双重保护）
  if (target.role === 'owner') return json({ error: '不能重置最高管理员的密码' }, 403);
  // 管理员不能给管理员重置密码，重置密码仅站长可操作
  if (me.role !== 'owner' && target.role === 'admin') {
    return json({ error: '仅站长可重置管理员的密码' }, 403);
  }

  const { salt, hash } = await makePasswordRecord(password);
  await env.DB
    .prepare('UPDATE users SET salt = ?, password_hash = ? WHERE id = ?')
    .bind(salt, hash, id)
    .run();

  // P0-3：管理员重置密码同样要踢掉该账号的所有会话
  //（否则被重置的用户手上那张旧令牌还能继续用 7 天）
  await env.DB
    .prepare('DELETE FROM sessions WHERE user_id = ?')
    .bind(id)
    .run()
    .catch(() => {});

  // P2-22：审计日志
  await logModeration(env, auth.user.sub, auth.user.username, 'reset_password', 'user', id, reveal ? '站长生成新密码' : '管理员重置');

  return json({
    message: reveal ? '已生成新密码，仅显示一次' : '密码已重置',
    id,
    username: target.username,
    ...(reveal ? { newPassword: password } : {})
  });
}

// 生成 12 位随机密码（去掉易混字符 0/O/1/l/I），使用加密随机
function generateRandomPassword(len = 12) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  let pwd = '';
  for (let i = 0; i < len; i++) pwd += chars[arr[i] % chars.length];
  return pwd;
}

// ---------------- PATCH /api/admin/users/:id/suspend —— 冻结/解冻用户 ----------------
export async function adminToggleSuspend(request, env, id) {
  const auth = await getAdminUser(request, env);
  if (auth.code) return json({ error: auth.code === 401 ? '请先登录' : '无权访问' }, auth.code);
  const me = auth.user;

  if (Number(me.sub) === id) {
    return json({ error: '不能冻结自己的账号' }, 400);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }
  const suspended = body.suspended === true || body.suspended === 1 ? 1 : 0;

  const target = await env.DB
    .prepare('SELECT id, username, role, suspended FROM users WHERE id = ?')
    .bind(id)
    .first();
  if (!target) return json({ error: '用户不存在' }, 404);

  // 最高管理员不可被冻结
  if (target.role === 'owner') {
    return json({ error: '最高管理员不可被冻结' }, 403);
  }
  // 普通管理员不能冻结其他管理员
  if (me.role !== 'owner' && isPrivileged(target.role)) {
    return json({ error: '仅最高管理员可冻结管理员' }, 403);
  }

  // 不允许冻结最后一位活跃管理员（有 owner 时允许）
  if (target.role === 'admin' && suspended === 1) {
    const { n } = await env.DB
      .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND suspended = 0")
      .first();
    const hasOwner = await ownerExists(env);
    if (n <= 1 && !hasOwner) return json({ error: '不能冻结最后一位活跃管理员' }, 400);
  }

  await env.DB
    .prepare('UPDATE users SET suspended = ? WHERE id = ?')
    .bind(suspended, id)
    .run();

  // P2-22：审计日志
  await logModeration(env, auth.user.sub, auth.user.username, 'suspend_user', 'user', id, suspended ? '冻结' : '解冻');

  // P0-3：冻结必须立刻生效 —— 清掉会话，否则被冻结的用户在令牌过期前
  // 依旧能用（login 只在登录时检查 suspended，运行中的令牌不会复查）
  if (suspended === 1) {
    await env.DB
      .prepare('DELETE FROM sessions WHERE user_id = ?')
      .bind(id)
      .run()
      .catch(() => {});
  }

  return json({ message: suspended ? '账号已冻结' : '账号已解冻', id, username: target.username, suspended: !!suspended });
}

// ---------------- DELETE /api/admin/users/:id —— 删除用户 ----------------
export async function adminDeleteUser(request, env, id) {
  const auth = await getAdminUser(request, env);
  if (auth.code) return json({ error: auth.code === 401 ? '请先登录' : '无权访问' }, auth.code);
  const me = auth.user;

  const target = await env.DB
    .prepare('SELECT id, username, role FROM users WHERE id = ?')
    .bind(id)
    .first();
  if (!target) return json({ error: '用户不存在' }, 404);

  // 不允许删除自己
  if (Number(me.sub) === id) {
    return json({ error: '不能删除自己的账号' }, 400);
  }
  // 最高管理员不可被删除
  if (target.role === 'owner') {
    return json({ error: '最高管理员不可被删除' }, 403);
  }
  // 删除用户账号仅站长（owner）可操作，管理员不可删除任何账号
  if (me.role !== 'owner') {
    return json({ error: '仅站长可删除用户账号' }, 403);
  }
  // 不允许删除最后一位管理员（有 owner 时允许）
  if (target.role === 'admin') {
    const { n } = await env.DB
      .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'")
      .first();
    const hasOwner = await ownerExists(env);
    if (n <= 1 && !hasOwner) return json({ error: '不能删除最后一位管理员' }, 400);
  }

  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  // 清掉残留会话，避免 sessions 表留下指向已删用户的孤儿行
  //（在线用户数统计会因此虚高）
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run().catch(() => {});
  return json({ message: '用户已删除', id, username: target.username });
}

/* ---------------- 会话校验（单端登录） ----------------
 * verifySession() 已上移到 worker/auth.js —— 社区 / 站点设置 / 关于页密码三个模块
 * 也要用它，放在 auth.js 才能避免它们反向 import 本文件。本文件从 auth.js 引入，
 * 下面所有调用点无需改动。语义不变：
 *   签名无效 → null；已被登出/顶号 → { kicked: true }；正常 → payload 并刷新心跳。
 */

// 单端登录：当前设备会话是否仍有效
export async function sessionCheck(request, env) {
  const user = await verifySession(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  if (user.kicked) return json({ kicked: true, message: '账号已在其他设备登录' }, 401);
  let latestName = null;
  try {
    const row = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(Number(user.sub)).first();
    if (row && row.username) latestName = row.username;
  } catch (e) { /* 表异常时回退 JWT 里的用户名 */ }
  return json({ ok: true, id: user.sub, username: latestName || user.username, role: user.role || 'user' });
}

// ---------------- 播放进度持久化（按账号） ----------------
export async function getPlayback(request, env) {
  const user = await verifySession(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  if (user.kicked) return json({ kicked: true }, 401);
  const row = await env.DB
    .prepare('SELECT track_index, position, mode FROM playback_state WHERE user_id = ?')
    .bind(Number(user.sub))
    .first();
  if (!row) return json({ has: false });
  return json({ has: true, track_index: row.track_index, position: row.position, mode: row.mode });
}

export async function savePlayback(request, env) {
  const user = await verifySession(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  if (user.kicked) return json({ kicked: true }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: '请求体格式错误' }, 400); }
  const idx = Math.max(0, Math.min(999, Math.floor(Number(body.track_index) || 0)));
  const pos = Math.max(0, Number(body.position) || 0);
  const mode = ['order', 'shuffle', 'loop'].includes(body.mode) ? body.mode : 'order';
  await env.DB
    .prepare(`INSERT INTO playback_state (user_id, track_index, position, mode, updated_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET
                track_index = excluded.track_index,
                position = excluded.position,
                mode = excluded.mode,
                updated_at = excluded.updated_at`)
    .bind(Number(user.sub), idx, pos, mode, Date.now())
    .run();
  return json({ ok: true });
}

// ---------------- 路由分发（可插入现有 fetch） ----------------
// 返回 Response 表示命中认证/管理路由；返回 null 表示非本模块路由，交由现有路由继续处理。
export async function handleAuthApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  /* 定期清理过期会话（概率性执行，约每 100 次请求清理一次，减少数据库写入压力）。
   * 这段原先写在 ensureSeed() 里，但 seed 改成「每 isolate 只跑一次」后就再也
   * 执行不到了，所以提到这里独立执行。 */
  if (Math.random() < 0.01) {
    env.DB
      .prepare('DELETE FROM sessions WHERE last_seen < ?')
      .bind(Date.now() - SESSION_STALE_MS * 2)
      .run()
      .catch(() => {});
  }

  // 确保内置管理员 zelm 已存在（幂等；凭据来自 wrangler secret，缺失则跳过）
  try {
    await ensureSeed(env);
  } catch (_) {
    // seed 失败不阻塞认证流程（避免账号系统整体不可用）
  }

  try {
    // ---- 认证路由 ----
    if (path === '/api/register' && method === 'POST') return await register(request, env);
    if (path === '/api/login' && method === 'POST') return await login(request, env);
    if (path === '/api/logout' && method === 'POST') return await logout(request, env);
    if (path === '/api/me' && method === 'GET') return await me(request, env);
    if (path === '/api/session/check' && method === 'GET') return await sessionCheck(request, env);
    if (path === '/api/playback' && method === 'GET') return await getPlayback(request, env);
    if (path === '/api/playback' && method === 'POST') return await savePlayback(request, env);
    if (path === '/api/change-password' && method === 'POST') return await changePassword(request, env);
    if (path === '/api/me/username' && method === 'PATCH') return await changeUsername(request, env);

    // ---- 管理员路由 ----
    if (path === '/api/admin/users' && method === 'GET') return await adminListUsers(request, env);

    const id = parseUserId(url);
    if (id !== null) {
      if (path === `/api/admin/users/${id}` && method === 'PATCH') {
        return await adminUpdateRole(request, env, id);
      }
      if (path === `/api/admin/users/${id}` && method === 'DELETE') {
        return await adminDeleteUser(request, env, id);
      }
      if (path === `/api/admin/users/${id}/password` && method === 'POST') {
        return await adminResetPassword(request, env, id);
      }
      if (path === `/api/admin/users/${id}/suspend` && method === 'PATCH') {
        return await adminToggleSuspend(request, env, id);
      }
      if (path === `/api/admin/users/${id}/kick` && method === 'POST') {
        return await adminKickUser(request, env, id);
      }
    }
  } catch (err) {
    // 统一错误处理：避免敏感信息泄露，只返回通用信息
    console.error('Auth API Error:', err);
    return json({ error: '服务器内部错误' }, 500);
  }
  return null; // 不是本模块路由，交给现有路由
}

// ---------------- 受保护接口示例（鉴权中间件用法） ----------------
// 复制此模式即可为任意接口加登录校验
// ⚠️ 用 verifySession()：这是模板代码，写错会被复制到所有新接口上。
export async function exampleProtectedApi(request, env) {
  const user = await verifySession(request, env);
  if (!user) {
    return json({ error: '请先登录' }, 401);
  }
  if (user.kicked) return json({ kicked: true, message: '账号已在其他设备登录' }, 401);
  // user.sub / user.username 已可用
  return json({ message: `你好，${user.username}！这是受保护的数据。` });
}
