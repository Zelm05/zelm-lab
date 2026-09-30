/* ==========================================================================
 * src/stores/admin/site-cfg.js —— 站点设置领域（含关于页密码）
 *
 * 原 stores/admin.js 的「站点设置 / 清除本地缓存 / 关于页密码」段落。
 * 改动都会回写 Cookie（ZelmSiteCfg.writeFromApi），让主站 / 关于页下一屏
 * 无需等接口就能应用最新设置。
 * ========================================================================== */
import { ref, reactive } from 'vue';
import { getJSON, putJSON, postJSON } from '@/api/http';
import { ZelmSiteCfg } from '@/core/site-cfg';
import { zelmConfirm } from '@/modules/confirm';
import { statusText as logicStatusText, siteCfgFromApi } from './logic';

export function useSiteCfg({ t, showToast }) {
  const siteCfg = reactive({
    about_password_enabled: true,
    entry_page: 'index',
    message_login_required: true,
    like_login_required: true,
    about_login_required: true,
    photo_wall_enabled: true,
    certificates_enabled: true,   // 证书板块开关（与照片墙同一默认：开）
    home_about_enabled: true,
  });
  const cfgReadOnly = ref(true);
  const cfgVisible = ref(false);
  const apwMsg = ref('');

  /* 关于页密码弹窗 */
  const apw = reactive({ visible: false, input: '', msg: '', busy: false });

  /* ---------------- 派生 ---------------- */
  function statusCfg() {
    // 每个开关对应的「状态文案 + on/off 类」由视图用 statusText(key, mode) 取
    return siteCfg;
  }
  const statusText = (on, mode) => logicStatusText(on, mode, t);

  /* ---------------- 加载 / 保存 ---------------- */
  async function loadSiteCfg() {
    const res = await getJSON('/api/site/settings');
    if (!res.ok || !res.data) { apwMsg.value = t('cfgLoadFail'); return; }
    const d = res.data;
    Object.assign(siteCfg, siteCfgFromApi(d));
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

  return {
    siteCfg, cfgReadOnly, cfgVisible, apwMsg, statusCfg, statusText,
    apw,
    loadSiteCfg, saveCfg, toggleCfg, setEntry, clearCache,
    openApwModal, closeApwModal, apwSave, apwReset, apwClear,
  };
}
