/* ==========================================================================
 * src/stores/admin/users.js —— 用户列表领域
 *
 * 原 stores/admin.js 的「用户列表 / 用户操作」段落。权限矩阵、徽章、在线状态、
 * 分页窗口这些纯逻辑已抽到 ./logic.js（可被 node 单测直接覆盖）；
 * 这里只做「把 me / isOwner / t 绑上去」和发请求 + 落状态。
 *
 * reveal（重置密码后的一次性明文弹窗）也归在这里：它唯一的写入方就是
 * userAct('resetpw')，是用户领域的产物，不属于站点设置。
 * ========================================================================== */
import { ref, reactive, computed } from 'vue';
import { getJSON, postJSON, patchJSON, delJSON } from '@/api/http';
import { shell } from '@/core/shell';
import { zelmConfirm } from '@/modules/confirm';
import {
  pagerOf,
  badgesFor as logicBadgesFor,
  statusFor as logicStatusFor,
  actionsFor as logicActionsFor,
  statsFromApi,
} from './logic';

export function useUsers({ t, me, isOwner, showToast }) {
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

  /* 重置密码后的一次性明文弹窗（见 AdminView.vue #revealModal） */
  const reveal = reactive({ visible: false, name: '', password: '', msg: '' });

  /* ---------------- 派生 ---------------- */
  const statUsers = computed(() => Math.max(0, stats.total - stats.admins));

  /* 纯逻辑的「绑定版」：对外仍是 badgesFor(u) / statusFor(u) / actionsFor(u)，
     与拆分前的调用方式完全一致，视图无需改动。 */
  const badgesFor = (u) => logicBadgesFor(u, me.value, t);
  const statusFor = (u) => logicStatusFor(u, me.value, t);
  const actionsFor = (u) => logicActionsFor(u, me.value, isOwner.value, t);

  const userPager = computed(() => pagerOf(userTotal.value, userPage.value, userPageSize.value));
  const userPagerInfo = computed(() => t('pagerInfo', { total: userTotal.value, page: userPage.value, pages: userPager.value.pages }));
  /** 待回复统计卡上的悬浮说明 */
  const statPendingTitle = computed(() => t('statPendingTitle', { n: stats.pending }));

  /* ---------------- 列表加载 ---------------- */
  /* 请求竞态守卫。
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
    Object.assign(stats, statsFromApi(d.stats || {}, d.users));
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
      /* 不再把重置后的密码固定成一个写在源码里的常量（旧实现传的是一组固定数字，
       * 且确认弹窗会把这串数字直接显示出来 —— 等于任何被重置过的账号都暴露在
       * 同一个公开口令下）。改为 { reveal: true }：后端用 generateRandomPassword()
       * 生成随机密码，并把明文一次性放在响应的 newPassword 里返回。
       * 后端同时会清掉该账号的 sessions，旧令牌立即失效。 */
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

  /* ---------------- 一次性明文弹窗 ---------------- */
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

  return {
    users, stats, statUsers, statsReady, userPage, userTotal, userSearch, userFilter,
    usersLoading, usersError, userPageSize, userPager, userPagerInfo, statPendingTitle,
    badgesFor, statusFor, actionsFor,
    loadUsers, pickUserPage, setFilter, setSearch, refreshUsers, userAct,
    reveal, closeReveal, copyReveal,
  };
}
