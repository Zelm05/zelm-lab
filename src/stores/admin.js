/* ==========================================================================
 * src/stores/admin.js —— 管理控制台状态
 *
 * 原实现在 src/modules/pages/admin.js（972 行命令式脚本）里：
 *   - 用户表每次刷新都拼一整段 HTML 字符串塞进 tbody，操作列里嵌着 6 层嵌套三元
 *     表达式决定"这个按钮该不该出现"（角色 / 是否本人 / 是否站长 / 是否在线…）
 *   - 站点设置 8 个开关各自 addEventListener，然后靠 renderCfg() 反手把所有
 *     DOM 再刷一遍（值 + 状态文案 + 分段高亮 + 只读禁用，全在一个函数里）
 *   - 分页器用 document.createElement 手搓
 * 现在：数据在这里，权限判断收敛成 actionsFor()/badgesFor() 这类纯函数，
 * 视图只负责把结果渲染出来。站点开关用 v-model，只读态用 :disabled 派生。
 *
 * 保留的原站行为（逐条核对过）：
 *   - 站长（owner）账号不可被任何人修改；管理员之间不能互相操作，
 *     仅站长能授予 / 撤销管理员、删除用户、重置管理员密码、踢下线、查看密码
 *   - 统计卡片始终是全站总数，不随筛选 / 搜索 / 分页变化
 *   - 401 → 回欢迎页；403 → 显示 403 提示；其它错误 → 显示重试
 *   - 站点设置：非站长只读（可看不可改），改动立即回写 Cookie，
 *     音乐播放器开关即时作用于外壳
 * ========================================================================== */
import { defineStore } from 'pinia';
import { ref, reactive, computed } from 'vue';
import { getJSON, postJSON, putJSON, patchJSON, delJSON } from '@/api/http';
import { shell } from '@/core/shell';
import { ZelmSiteCfg } from '@/core/site-cfg';
import { zelmConfirm } from '@/modules/confirm';
import { useI18n } from '@/core/i18n';


export const useAdminStore = defineStore('admin', () => {
  const { t } = useI18n('admin');

  /* ---------------- 身份 ---------------- */
  const me = ref(null);
  const ready = ref(false);          // 权限校验完成
  const isOwner = computed(() => !!me.value && me.value.role === 'owner');
  const adminSub = computed(() =>
    me.value
      ? t('currentAccount') + me.value.username +
        (me.value.role === 'owner' ? t('roleOwnerSuffix') : t('roleAdminSuffix'))
      : '',
  );

  /* ---------------- 用户列表 ---------------- */
  const users = ref([]);
  const stats = reactive({ total: 0, admins: 0, suspended: 0, online: 0, pending: 0 });
  const statsReady = ref(false);     // 首次加载成功前，统计卡显示「—」（与原站一致）
  const userPage = ref(1);
  const userTotal = ref(0);
  const userSearch = ref('');
  const userFilter = ref('all');     // all | admin | user | frozen | online
  const usersLoading = ref(true);
  const usersError = ref('');        // '' | 'forbidden' | 'fail'
  const userPageSize = ref(
    window.matchMedia && matchMedia('(max-width: 768px)').matches ? 5 : 8,
  );

  /* ---------------- 反馈建议 ---------------- */
  const fbItems = ref([]);
  const fbPage = ref(1);
  const fbTotal = ref(0);
  const fbPending = ref(0);
  const fbLoading = ref(true);
  const fbDrafts = reactive({});     // id → 回复草稿
  const fbReplying = ref(0);         // 正在提交回复的反馈 id

  /* ---------------- 站点设置 ---------------- */
  const siteCfg = reactive({
    about_password_enabled: true,
    entry_page: 'index',
    message_login_required: true,
    like_login_required: true,
    about_login_required: true,
    photo_wall_enabled: true,
    home_about_enabled: true,
  });
  const cfgReadOnly = ref(true);
  const cfgVisible = ref(false);
  const apwMsg = ref('');

  /* ---------------- 弹窗 ---------------- */
  const apw = reactive({ visible: false, input: '', msg: '', busy: false });
  const reveal = reactive({ visible: false, name: '', password: '', msg: '' });

  /* ---------------- 提示 ---------------- */
  const toast = reactive({ text: '', err: false, show: false });

  let toastTimer = null;
  function showToast(text, isErr) {
    toast.text = text;
    toast.err = !!isErr;
    toast.show = true;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.show = false; }, 2600);
  }

  /* ---------------- 派生：统计卡与权限判断 ---------------- */
  const statUsers = computed(() => Math.max(0, stats.total - stats.admins));

  /**
   * 一行用户的徽章（角色 + 冻结），把原来的嵌套三元收敛成有序列表。
   * 规则：本人优先显示「当前账号」；站长其次；再是管理员 / 普通用户；最后叠加冻结。
   */
  function badgesFor(u) {
    const out = [];
    const isMe = me.value && String(u.id) === String(me.value.id);
    if (isMe) out.push({ cls: 'me', text: t('badgeMe') });
    else if (u.role === 'owner') out.push({ cls: 'owner', text: t('badgeOwner') });
    else if (u.role === 'admin') out.push({ cls: 'admin', text: t('badgeAdmin') });
    else out.push({ cls: 'user', text: t('badgeUser') });
    if (u.suspended) out.push({ cls: 'danger', text: t('badgeFrozen') });
    return out;
  }

  /** 在线状态：本人一律显示「● 在线」并附「本机」 */
  function statusFor(u) {
    const isMe = me.value && String(u.id) === String(me.value.id);
    if (isMe) return { online: true, text: t('online'), note: t('thisDevice') };
    return u.online
      ? { online: true, text: t('online'), note: '' }
      : { online: false, text: t('offline'), note: '' };
  }

  /**
   * 一行用户可执行的操作。返回 [{ act, label, cls, title }] 或 [{ text }]。
   * 权限矩阵（与原站逐条一致）：
   *   本人 → 不可操作
   *   站长的行 → 任何人不可操作
   *   管理员行 → 仅站长可改角色 / 冻结 / 重置密码
   *   普通用户行 → 提升为管理员仅站长可做；重置密码管理员可以做
   *   删除用户、查看密码、踢下线 → 仅站长
   */
  function actionsFor(u) {
    const isMe = me.value && String(u.id) === String(me.value.id);
    if (isMe) return [{ text: '—' }];
    if (u.role === 'owner') return [{ text: t('noModify') }];

    const isAdminTarget = u.role === 'admin';
    const iAmOwner = isOwner.value;
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

    // ③ 「查看密码」按钮已删除（P1-1）：它做的事和 ② 完全一样（都是重置并显示一次性明文），
    //    留着会让站长在同一行看到两个作用相同的按钮。相关文案 revealBtn / revealBtnTitle /
    //    confirmRevealPw 已从四个语言包移除。

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

  /* ---------------- 分页器数据（两处共用同一个组件） ---------------- */
  function pagerOf(total, page, pageSize) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const start = pages <= 5 ? 1 : Math.min(Math.max(1, page - 2), pages - 4);
    const end = Math.min(pages, start + 4);
    const nums = [];
    for (let p = start; p <= end; p += 1) nums.push(p);
    return { pages, start, end, nums };
  }
  const userPager = computed(() => pagerOf(userTotal.value, userPage.value, userPageSize.value));
  const fbPager = computed(() => pagerOf(fbTotal.value, fbPage.value, 3));
  const userPagerInfo = computed(() => t('pagerInfo', { total: userTotal.value, page: userPage.value, pages: userPager.value.pages }));
  const fbPagerInfo = computed(() => t('pagerInfo', { total: fbTotal.value, page: fbPage.value, pages: fbPager.value.pages }));
  /** 待回复统计卡上的悬浮说明 */
  const statPendingTitle = computed(() => t('statPendingTitle', { n: stats.pending }));
  /** 反馈面板标题右侧的「待回复 N 条」 */
  const fbNote = computed(() => (fbPending.value > 0 ? t('fbNoteTpl', { n: fbPending.value }) : '—'));

  /* ---------------- 用户列表加载 ---------------- */
  /* P1-7：请求竞态守卫。
   *   setSearch / setFilter / pickUserPage 都只调 loadUsers()，所以序号与
   *   AbortController 收敛在这里，三个入口自动共用同一条竞态线。
   *   修复的现象：连续改动搜索词或快速翻页时，先发的慢响应后到，会把后发的
   *   新结果覆盖掉 —— 表现为「搜索框里写着 A，表格里却是 B 的数据」，而且
   *   loading 会被过期响应提前置回 false。 */
  let userReqSeq = 0;
  let userReqAbort = null;

  async function loadUsers() {
    const seq = ++userReqSeq;
    /* 旧请求立刻掐断：省一次往返，也避免它回来改 usersLoading */
    if (userReqAbort) userReqAbort.abort();
    const ac = new AbortController();
    userReqAbort = ac;

    usersLoading.value = true;
    usersError.value = '';
    let qs = '/api/admin/users?page=' + userPage.value + '&pageSize=' + userPageSize.value
      + (userSearch.value ? '&search=' + encodeURIComponent(userSearch.value) : '');
    if (userFilter.value === 'admin') qs += '&role=admin';
    else if (userFilter.value === 'user') qs += '&role=user';
    else if (userFilter.value === 'frozen') qs += '&suspended=1';
    else if (userFilter.value === 'online') qs += '&online=1';

    const res = await getJSON(qs, { signal: ac.signal });
    /* 过期响应一律丢弃（含被 abort 的那次：abort 会走 error 分支返回 status 0） */
    if (seq !== userReqSeq) return;
    if (res.status === 401) { shell.goPage('gate'); return; }
    if (res.status === 403) { usersLoading.value = false; usersError.value = 'forbidden'; return; }
    if (!res.ok || !res.data || !res.data.users) { usersLoading.value = false; usersError.value = 'fail'; return; }

    const d = res.data;
    users.value = d.users;
    userTotal.value = d.total || d.users.length;
    // 统计卡永远取 API 的全站统计（不受筛选影响）
    const st = d.stats || {};
    stats.total = st.total != null ? st.total : d.users.length;
    stats.admins = st.admins != null
      ? st.admins
      : d.users.filter((u) => u.role === 'admin' || u.role === 'owner').length;
    stats.suspended = st.suspended != null ? st.suspended : d.users.filter((u) => u.suspended).length;
    stats.online = st.online != null ? st.online : d.users.filter((u) => u.online).length;
    statsReady.value = true;
    usersLoading.value = false;
  }

  function pickUserPage(p) { userPage.value = p; return loadUsers(); }
  function setFilter(f) {
    if (userFilter.value === f) return;
    userFilter.value = f;
    userPage.value = 1;
    return loadUsers();
  }
  let searchTimer = null;
  function setSearch(v) {
    userSearch.value = (v || '').trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { userPage.value = 1; loadUsers(); }, 250);
  }
  function refreshUsers() { userPage.value = 1; return loadUsers(); }

  /* ---------------- 反馈建议 ---------------- */
  async function loadFbStats() {
    const res = await getJSON('/api/admin/feedbacks?page=' + fbPage.value + '&pageSize=3');
    if (res.ok && res.data && res.data.stats) stats.pending = res.data.stats.pending || 0;
  }
  async function loadFeedbacks() {
    fbLoading.value = true;
    const res = await getJSON('/api/admin/feedbacks?pending=1&page=' + fbPage.value + '&pageSize=3');
    fbLoading.value = false;
    if (!res.ok || !res.data || !res.data.items) { fbItems.value = []; fbTotal.value = 0; return; }
    const d = res.data;
    fbItems.value = d.items;
    fbTotal.value = d.total || d.items.length;
    fbPending.value = (d.stats && d.stats.pending) || 0;
  }
  function pickFbPage(p) { fbPage.value = p; return loadFeedbacks(); }
  function refreshFb() { fbPage.value = 1; loadFeedbacks(); loadFbStats(); }
  /** 反馈条目的类型徽章文案 */
  function fbKindLabel(kind) {
    return kind === 'feedback' ? t('kindFeedback') : kind === 'suggestion' ? t('kindSuggestion') : kind;
  }

  async function deleteFb(f) {
    if (!(await zelmConfirm(t('confirmDelFb')))) return;
    const res = await delJSON('/api/admin/feedbacks/' + f.id);
    if (res.ok) { showToast(t('deleted')); loadFeedbacks(); loadFbStats(); }
    else showToast((res.data && res.data.error) || t('opFail'), true);
  }
  async function replyFb(f) {
    const text = (fbDrafts[f.id] || '').trim();
    if (!text) { showToast(t('replyEmpty'), true); return; }
    fbReplying.value = f.id;
    const res = await postJSON('/api/admin/feedbacks/' + f.id + '/reply', { reply: text });
    if (res.ok) { showToast(t('replied')); loadFeedbacks(); loadFbStats(); }
    else showToast((res.data && res.data.error) || t('opFail'), true);
    fbReplying.value = 0;
  }

  /* ---------------- 用户操作 ---------------- */
  async function userAct(u, act) {
    const name = u.username;
    if (act === 'promote' || act === 'demote') {
      const promote = act === 'promote';
      if (!(await zelmConfirm(t(promote ? 'confirmPromote' : 'confirmDemote', { name })))) return;
      const res = await patchJSON('/api/admin/users/' + u.id, { role: promote ? 'admin' : 'user' });
      if (res.ok) { showToast(t('roleUpdated', { name })); loadUsers(); }
      else showToast((res.data && res.data.error) || t('opFail'), true);
      return;
    }
    if (act === 'resetpw') {
      if (!(await zelmConfirm(t('confirmResetPw', { name })))) return;
      /* P1-1：不再把重置后的密码固定成一个写在源码里的常量
       * （旧实现传的是一组固定数字，且确认弹窗会把这串数字直接显示出来 ——
       *  等于任何被重置过的账号都暴露在同一个公开口令下）。
       * 改为 { reveal: true } —— 后端用 generateRandomPassword()
       * （worker/api.js:622-629，crypto.getRandomValues，12 位 54 字符集，约 69 bit 熵）
       * 生成随机密码，并把明文一次性放在响应的 newPassword 里返回。
       * 后端同时会清掉该账号的 sessions（P0-3），旧令牌立即失效。 */
      const res = await postJSON('/api/admin/users/' + u.id + '/password', { reveal: true });
      if (!res.ok) { showToast((res.data && res.data.error) || t('opFail'), true); return; }
      if (res.data && res.data.newPassword) {
        // 一次性明文弹窗（内含复制按钮，见 AdminView.vue #revealModal）；关闭后无法再次查看
        reveal.name = '（' + name + '）';
        reveal.password = res.data.newPassword;
        reveal.msg = t('revealResetMsg', { name });
        reveal.visible = true;
      } else {
        // 兜底：后端没回明文（理论上不会），至少告知已重置
        showToast(t('pwResetDone', { name }));
      }
      return;
    }
    if (act === 'freeze' || act === 'unfreeze') {
      const frozen = act === 'freeze';
      if (!(await zelmConfirm(t(frozen ? 'confirmFreeze' : 'confirmUnfreeze', { name })))) return;
      const res = await patchJSON('/api/admin/users/' + u.id + '/suspend', { suspended: frozen });
      if (res.ok) { showToast(t(frozen ? 'frozeUser' : 'unfrozeUser', { name })); loadUsers(); }
      else showToast((res.data && res.data.error) || t('opFail'), true);
      return;
    }
    if (act === 'kick') {
      if (!(await zelmConfirm(t('confirmKick', { name })))) return;
      const res = await postJSON('/api/admin/users/' + u.id + '/kick', {});
      if (res.ok) { showToast(t('kicked', { name })); loadUsers(); }
      else showToast((res.data && res.data.error) || t('opFail'), true);
      return;
    }
    if (act === 'del') {
      if (!(await zelmConfirm(t('confirmDelUser', { name })))) return;
      const res = await delJSON('/api/admin/users/' + u.id);
      if (res.ok) { showToast(t('userDeleted', { name })); loadUsers(); }
      else showToast((res.data && res.data.error) || t('opFail'), true);
    }
  }

  /* ---------------- 站点设置 ---------------- */
  function statusCfg() {
    // 每个开关对应的「状态文案 + on/off 类」由视图用 statusFor(key, mode) 取
    return siteCfg;
  }
  /** 开关状态文案：mode='pw' 用「需要密码/免密进入」，'login' 用「需要登录/无需登录」，'show' 用「显示/隐藏」 */
  function statusText(on, mode) {
    if (mode === 'pw') return on ? t('cfgPwOn') : t('cfgPwOff');
    if (mode === 'login') return on ? t('loginReqOn') : t('loginReqOff');
    return on ? t('showOn') : t('showOff');
  }

  async function loadSiteCfg() {
    const res = await getJSON('/api/site/settings');
    if (!res.ok || !res.data) { apwMsg.value = t('cfgLoadFail'); return; }
    const d = res.data;
    siteCfg.about_password_enabled = d.about_password_enabled !== false;
    siteCfg.message_login_required = d.message_login_required !== false;
    siteCfg.like_login_required = d.like_login_required !== false;
    siteCfg.about_login_required = d.about_login_required !== false;
    siteCfg.entry_page = d.entry_page === 'about' ? 'about' : 'index';
    siteCfg.photo_wall_enabled = d.photo_wall_enabled !== false;
    siteCfg.home_about_enabled = d.home_about_enabled !== false;
    // 回写 Cookie：主站 / 关于页下一屏无需等接口就能应用最新设置
    if (ZelmSiteCfg) ZelmSiteCfg.writeFromApi(d);
  }

  async function saveCfg(patch) {
    if (cfgReadOnly.value) { showToast(t('cfgReadOnlyToast'), true); return; }
    const res = await putJSON('/api/site/settings', patch);
    if (res.ok) {
      Object.keys(patch).forEach((k) => { siteCfg[k] = patch[k]; });
      // 回写 Cookie：站长切回主站时首屏即新配置，不会闪旧状态
      if (ZelmSiteCfg && res.data && res.data.settings) ZelmSiteCfg.writeFromApi(res.data.settings);
      showToast(t('cfgSaved'));
    } else {
      showToast((res.data && res.data.error) || t('cfgSaveFail'), true);
    }
  }
  /**
   * 单个站点开关拨动。先乐观更新界面（开关立刻跟手），失败再回滚，
   * 避免原实现那种"开关已经拨过去了、其实没保存成功"的错觉。
   */
  async function toggleCfg(key, on) {
    const prev = siteCfg[key];
    siteCfg[key] = on;
    if (cfgReadOnly.value) { siteCfg[key] = prev; showToast(t('cfgReadOnlyToast'), true); return; }
    const res = await putJSON('/api/site/settings', { [key]: on });
    if (res.ok) {
      if (ZelmSiteCfg && res.data && res.data.settings) ZelmSiteCfg.writeFromApi(res.data.settings);
      showToast(t('cfgSaved'));
    } else {
      siteCfg[key] = prev;
      showToast((res.data && res.data.error) || t('cfgSaveFail'), true);
    }
  }

  function setEntry(v) {
    if (v === siteCfg.entry_page) return;
    return saveCfg({ entry_page: v === 'about' ? 'about' : 'index' });
  }

  /* ---- 清除本地缓存 ---- */
  async function clearCache() {
    if (!(await zelmConfirm(t('cfgClearCacheConfirm')))) return;
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && k.indexOf('zelm_') === 0) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
      sessionStorage.clear();
      if ('caches' in window) {
        try { (await caches.keys()).forEach((n) => caches.delete(n)); } catch (e) { /* 忽略 */ }
      }
      apwMsg.value = t('cfgClearCacheDone');
      setTimeout(() => { location.reload(); }, 1200);
    } catch (e) {
      apwMsg.value = t('opFail');
    }
  }

  /* ---- 关于页密码 ---- */
  function openApwModal() {
    apw.msg = '';
    apw.input = '';
    apw.visible = true;
  }
  function closeApwModal() { apw.visible = false; }

  async function apwPost(body) {
    return postJSON('/api/about/password', body);
  }
  async function apwSave() {
    const pw = apw.input.trim();
    if (pw.length < 4 || pw.length > 32) { apw.msg = t('apwLenErr'); return; }
    apw.busy = true;
    const res = await apwPost({ password: pw });
    apw.busy = false;
    if (res.ok) {
      apw.visible = false;
      siteCfg.about_password_enabled = true;   // 设了新密码即重新启用保护
      apwMsg.value = t('apwUpdatedMsg');
      showToast(t('apwUpdated'));
    } else {
      apw.msg = (res.data && res.data.error) || t('opFail');
    }
  }
  async function apwReset() {
    if (!(await zelmConfirm(t('confirmApwReset')))) return;
    const res = await apwPost({ reset: true });
    if (res.ok) {
      siteCfg.about_password_enabled = true;
      apwMsg.value = t('apwResetMsg');
      showToast(t('apwResetToast'));
    } else showToast((res.data && res.data.error) || t('opFail'), true);
  }
  async function apwClear() {
    if (!(await zelmConfirm(t('confirmApwClear')))) return;
    const res = await apwPost({ enabled: false });
    if (res.ok) {
      siteCfg.about_password_enabled = false;
      apwMsg.value = t('apwClearMsg');
      showToast(t('apwClearToast'));
    } else showToast((res.data && res.data.error) || t('opFail'), true);
  }

  /* ---------------- 查看密码弹窗 ---------------- */
  function closeReveal() { reveal.visible = false; }
  async function copyReveal(el) {
    try {
      if (el) el.select();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(reveal.password);
        showToast(t('copiedClip'));
        return;
      }
      throw new Error('no clipboard');
    } catch (e) {
      try {
        if (el) el.select();
        document.execCommand('copy');
        showToast(t('copied'));
      } catch (err) {
        showToast(t('copyFail'), true);
      }
    }
  }

  /* ---------------- 返回上一页 ---------------- */
  function back() {
    if (window.history.length > 1) window.history.back();
    else shell.goPage('home');
  }

  /* ---------------- 初始化：先确认自己是管理员 ---------------- */
  async function init() {
    const res = await getJSON('/api/me');
    if (!res.ok || !res.data) { shell.goPage('gate'); return; }
    const d = res.data;
    if (d.role !== 'admin' && d.role !== 'owner') { shell.goPage('home'); return; }
    me.value = d;
    ready.value = true;
    cfgReadOnly.value = d.role !== 'owner';
    cfgVisible.value = d.role === 'owner' || d.role === 'admin';
    loadSiteCfg();
    loadUsers();
    loadFbStats();
    loadFeedbacks();
  }

  return {
    // 身份
    me, ready, isOwner, adminSub,
    // 用户
    users, stats, statUsers, statsReady, userPage, userTotal, userSearch, userFilter,
    usersLoading, usersError, userPageSize, userPager, userPagerInfo, statPendingTitle,
    badgesFor, statusFor, actionsFor,
    // 反馈
    fbItems, fbPage, fbTotal, fbPending, fbLoading, fbDrafts, fbReplying,
    fbPager, fbPagerInfo, fbKindLabel, fbNote,
    // 站点设置
    siteCfg, cfgReadOnly, cfgVisible, apwMsg, statusCfg, statusText,
    // 弹窗 / 提示
    apw, reveal, toast,
    // 动作
    init, loadUsers, pickUserPage, setFilter, setSearch, refreshUsers, userAct,
    loadFeedbacks, loadFbStats, pickFbPage, refreshFb, deleteFb, replyFb,
    loadSiteCfg, saveCfg, toggleCfg, setEntry, clearCache,
    openApwModal, closeApwModal, apwSave, apwReset, apwClear,
    closeReveal, copyReveal, back, showToast,
  };
});
