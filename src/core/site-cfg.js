/* ==========================================================================
 * src/core/site-cfg.js —— 站点设置（站长在管理台配置）的同步读取
 *
 * 与原站 public/site-cfg.js 的行为完全一致，只去掉 window 全局：
 *   显隐类设置（主站「关于我」、关于页「照片墙」、音乐播放器）如果等
 *   /api/site/settings 异步返回再处理，页面会先按原样渲染、几百毫秒后才被
 *   隐藏，肉眼就是「闪一下」。Worker 在返回 HTML 时把配置写进 zelm_site_cfg
 *   Cookie，这里同步读出，让显隐在首屏绘制前就正确。
 *
 * 安全说明：该 Cookie 不含 HttpOnly（前端需要读取），内容仅 8 个开关状态，
 * 不含任何凭据，只用于「首屏渲染提示」；真正的权限判定始终由后端接口决定。
 * ========================================================================== */
const COOKIE = 'zelm_site_cfg';

/** 默认值：全部开启、落地页为主站（与后端 DEFAULTS 保持一致） */
const DEFAULTS = { apw: 1, ep: 'i', mlr: 1, llr: 1, alr: 1, pw: 1, ha: 1 };

function clone(o) {
  const out = {};
  for (const k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = o[k];
  return out;
}

function raw() {
  try {
    const m = document.cookie.match(/(?:^|;\s*)zelm_site_cfg=([^;]*)/);
    return m ? m[1] : '';
  } catch (e) {
    return '';
  }
}

/** Cookie 是否真实存在（区分「未下发」与「下发了但取值等于默认值」） */
function has() {
  return !!raw();
}

function read() {
  const out = clone(DEFAULTS);
  const rawValue = raw();
  if (!rawValue) return out;
  try {
    const o = JSON.parse(decodeURIComponent(rawValue));
    if (o && typeof o === 'object') {
      for (const k in DEFAULTS) {
        if (Object.prototype.hasOwnProperty.call(DEFAULTS, k) && o[k] !== undefined) out[k] = o[k];
      }
    }
  } catch (e) { /* Cookie 损坏时沿用默认值 */ }
  return out;
}

/** 把 /api/site/settings 的完整响应换算成精简对象 */
function fromApi(d) {
  return {
    apw: d.about_password_enabled === false ? 0 : 1,
    ep: d.entry_page === 'about' ? 'a' : 'i',
    mlr: d.message_login_required === false ? 0 : 1,
    llr: d.like_login_required === false ? 0 : 1,
    alr: d.about_login_required === false ? 0 : 1,
    pw: d.photo_wall_enabled === false ? 0 : 1,
    ha: d.home_about_enabled === false ? 0 : 1,
  };
}

function write(obj) {
  try {
    document.cookie =
      COOKIE + '=' + encodeURIComponent(JSON.stringify(obj)) +
      '; Path=/; SameSite=Lax; Max-Age=86400';
  } catch (e) { /* 隐私模式等场景写入失败可忽略，接口结果仍会即时生效 */ }
}

/** 接口返回后回写：保证本次访问之后的新页面无需等接口就能拿到最新配置 */
function writeFromApi(d) {
  if (!d) return;
  try { write(fromApi(d)); } catch (e) { /* 忽略 */ }
}

export const ZelmSiteCfg = { COOKIE, DEFAULTS, has, read, fromApi, write, writeFromApi };
