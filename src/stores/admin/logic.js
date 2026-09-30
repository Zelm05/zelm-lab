/* ==========================================================================
 * src/stores/admin/logic.js —— 管理控制台的纯逻辑（零依赖）
 *
 * 为什么单独一个文件：这里的函数是原 stores/admin.js 里最容易出错、也最值得
 * 回归保护的部分（权限矩阵 / 徽章 / 分页窗口），但它们原先闭包在 defineStore
 * 内部，只有实例化 store 才能测 —— 而 store 会经 @/core/shell 拉进
 * @/router（createWebHashHistory 需要 location），在 vitest 的 node 环境下
 * 直接 ReferenceError: location is not defined，根本无法实例化。
 *
 * 因此这里把它们改造成**显式传参的纯函数**：不 import 任何东西、不碰
 * window/document、不读全局状态。store 侧再包一层把 me / t 绑上去，
 * 对外 API 与拆分前完全一致（tests/admin-logic.test.js 在 node 下直接覆盖）。
 *
 * 与仓库既有惯例一致：stores/library.js 导出 itemTitle/itemName/itemDesc、
 * stores/settings.js 导出 migrateSettings/DEFAULT_SETTINGS，都是同一种做法。
 * ========================================================================== */

/**
 * 分页器数据（用户列表与反馈列表共用同一个组件）。
 * 最多显示 5 个页码，并把当前页尽量保持在窗口中间。
 * @param {number} total 总条数
 * @param {number} page 当前页（1 基）
 * @param {number} pageSize 每页条数
 * @returns {{pages:number,start:number,end:number,nums:number[]}}
 */
export function pagerOf(total, page, pageSize) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = pages <= 5 ? 1 : Math.min(Math.max(1, page - 2), pages - 4);
  const end = Math.min(pages, start + 4);
  const nums = [];
  for (let p = start; p <= end; p += 1) nums.push(p);
  return { pages, start, end, nums };
}

/**
 * 一行用户的徽章（角色 + 冻结），把原来的嵌套三元收敛成有序列表。
 * 规则：本人优先显示「当前账号」；站长其次；再是管理员 / 普通用户；最后叠加冻结。
 * @param u 用户行
 * @param me 当前登录者
 * @param {Function} t i18n 取词函数
 * @returns {Array<{cls:string,text:string}>}
 */
export function badgesFor(u, me, t) {
  const out = [];
  const isMe = me && String(u.id) === String(me.id);
  if (isMe) out.push({ cls: 'me', text: t('badgeMe') });
  else if (u.role === 'owner') out.push({ cls: 'owner', text: t('badgeOwner') });
  else if (u.role === 'admin') out.push({ cls: 'admin', text: t('badgeAdmin') });
  else out.push({ cls: 'user', text: t('badgeUser') });
  if (u.suspended) out.push({ cls: 'danger', text: t('badgeFrozen') });
  return out;
}

/**
 * 在线状态：本人一律显示「● 在线」并附「本机」。
 * @returns {{online:boolean,text:string,note:string}}
 */
export function statusFor(u, me, t) {
  const isMe = me && String(u.id) === String(me.id);
  if (isMe) return { online: true, text: t('online'), note: t('thisDevice') };
  return u.online
    ? { online: true, text: t('online'), note: '' }
    : { online: false, text: t('offline'), note: '' };
}

/**
 * 一行用户可执行的操作。返回 [{ act, label, cls, title }] 或 [{ text }]。
 *
 * 权限矩阵（与原站逐条一致，改动前请先看 tests/admin-logic.test.js）：
 *   本人        → 不可操作
 *   站长的行    → 任何人不可操作
 *   管理员行    → 仅站长可改角色 / 冻结 / 重置密码
 *   普通用户行  → 提升为管理员仅站长可做；重置密码管理员可以做
 *   删除用户、踢下线 → 仅站长
 *
 * @param u 目标用户行
 * @param me 当前登录者
 * @param {boolean} isOwner 当前登录者是否站长
 * @param {Function} t i18n 取词函数
 */
export function actionsFor(u, me, isOwner, t) {
  const isMe = me && String(u.id) === String(me.id);
  if (isMe) return [{ text: '—' }];
  if (u.role === 'owner') return [{ text: t('noModify') }];

  const isAdminTarget = u.role === 'admin';
  const iAmOwner = isOwner;
  const canManageAdmin = iAmOwner;   // 管理员之间不能互相操作
  const out = [];

  // ① 角色：提升 / 取消管理员
  if (isAdminTarget) {
    out.push(canManageAdmin
      ? { act: 'demote', label: t('demoteBtn'), title: '' }
      : { text: t('badgeAdmin'), title: t('ownerOnlyModifyAdmin') });
  } else {
    out.push(iAmOwner
      ? { act: 'promote', label: t('promoteBtn'), title: '' }
      : { text: t('badgeUser'), title: t('ownerOnlyGrant') });
  }

  // ② 重置密码：管理员行只有站长能动
  if (isAdminTarget && !iAmOwner) {
    out.push({ text: '—', title: t('ownerOnlyModifyAdmin') });
  } else {
    out.push({ act: 'resetpw', label: t('resetPwBtn'), cls: 'warn', title: '' });
  }

  // ③ 「查看密码」按钮已删除：它做的事和 ② 完全一样（都是重置并显示一次性明文），
  //    留着会让站长在同一行看到两个作用相同的按钮。

  // ④ 踢下线：仅站长，且只对在线用户
  if (iAmOwner && u.online) out.push({ act: 'kick', label: t('kickBtn'), cls: 'warn', title: t('kickTitle') });

  // ⑤ 冻结 / 解冻
  if (!isAdminTarget || canManageAdmin) {
    out.push(u.suspended
      ? { act: 'unfreeze', label: t('unfreezeBtn'), cls: 'warn', title: '' }
      : { act: 'freeze', label: t('freezeBtn'), cls: 'warn', title: '' });
  }

  // ⑥ 删除账号：仅站长
  if (iAmOwner) out.push({ act: 'del', label: t('fbDel'), cls: 'danger', title: '' });

  return out;
}

/** 开关状态文案：mode='pw' 用「需要密码/免密进入」，'login' 用「需要登录/无需登录」，其余用「显示/隐藏」 */
export function statusText(on, mode, t) {
  if (mode === 'pw') return on ? t('cfgPwOn') : t('cfgPwOff');
  if (mode === 'login') return on ? t('loginReqOn') : t('loginReqOff');
  return on ? t('showOn') : t('showOff');
}

/** 反馈条目的类型徽章文案 */
export function fbKindLabel(kind, t) {
  return kind === 'feedback' ? t('kindFeedback') : kind === 'suggestion' ? t('kindSuggestion') : kind;
}

/** 站点设置接口响应 → 视图用的布尔/枚举值（缺字段一律按「开」处理，与原站一致） */
export function siteCfgFromApi(d) {
  return {
    about_password_enabled: d.about_password_enabled !== false,
    entry_page: d.entry_page === 'about' ? 'about' : 'index',
    message_login_required: d.message_login_required !== false,
    like_login_required: d.like_login_required !== false,
    about_login_required: d.about_login_required !== false,
    photo_wall_enabled: d.photo_wall_enabled !== false,
    certificates_enabled: d.certificates_enabled !== false,
    home_about_enabled: d.home_about_enabled !== false,
  };
}

/** 用户列表接口的统计卡兜底：后端没给 stats 时，用当前页数据现算 */
export function statsFromApi(st, users) {
  return {
    total: st.total != null ? st.total : users.length,
    admins: st.admins != null
      ? st.admins
      : users.filter((u) => u.role === 'admin' || u.role === 'owner').length,
    suspended: st.suspended != null ? st.suspended : users.filter((u) => u.suspended).length,
    online: st.online != null ? st.online : users.filter((u) => u.online).length,
  };
}
