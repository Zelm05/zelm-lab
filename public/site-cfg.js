/* ============================================================================
 * site-cfg.js — 站点设置（站长在管理台配置）的同步读取 / 写入
 *
 * 为什么需要它：
 *   板块显隐（主站「关于我」、关于页「照片墙」）如果等 /api/site/settings 异步
 *   返回后再处理，页面会先按 HTML 原样渲染出来，几百毫秒后才被隐藏，肉眼看就是
 *   "先闪一下、设置好像没生效"。Worker 会在返回 HTML 页面时把配置写进
 *   zelm_site_cfg Cookie，本文件在 HTML 解析阶段同步读出，让显隐在首屏绘制前完成。
 *
 * 安全说明：
 *   该 Cookie 不带 HttpOnly（前端需要读取），内容仅 8 个开关状态，不含任何凭据；
 *   它只用于「首屏渲染提示」，真正的权限判定始终由后端接口决定。
 *
 * 用法：
 *   <script src="site-cfg.js"></script>            // 放在 <head>，会阻塞解析、保证同步可用
 *   var cfg = window.ZelmSiteCfg.read();           // { apw, ep, mlr, llr, alr, pw, ha, mp }
 *   window.ZelmSiteCfg.writeFromApi(apiResponse);  // 接口返回后回写，保持 Cookie 新鲜
 * ========================================================================== */
(function () {
  'use strict';

  var COOKIE = 'zelm_site_cfg';
  // 默认值：全部开启、落地页为主站（与后端 DEFAULTS 保持一致）
  var DEFAULTS = { apw: 1, ep: 'i', mlr: 1, llr: 1, alr: 1, pw: 1, ha: 1, mp: 1 };

  function clone(o) {
    var out = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = o[k];
    return out;
  }

  function raw() {
    try {
      var m = document.cookie.match(/(?:^|;\s*)zelm_site_cfg=([^;]*)/);
      return m ? m[1] : '';
    } catch (e) {
      return '';
    }
  }

  // Cookie 是否真实存在（区分"未下发"与"下发了但取值等于默认值"）
  function has() {
    return !!raw();
  }

  function read() {
    var out = clone(DEFAULTS);
    var rawValue = raw();
    if (!rawValue) return out;
    try {
      var o = JSON.parse(decodeURIComponent(rawValue));
      if (o && typeof o === 'object') {
        for (var k in DEFAULTS) {
          if (Object.prototype.hasOwnProperty.call(DEFAULTS, k) && o[k] !== undefined) out[k] = o[k];
        }
      }
    } catch (e) { /* Cookie 损坏时沿用默认值 */ }
    return out;
  }

  // 把 /api/site/settings 的完整响应换算成精简对象
  function fromApi(d) {
    return {
      apw: d.about_password_enabled === false ? 0 : 1,
      ep: d.entry_page === 'about' ? 'a' : 'i',
      mlr: d.message_login_required === false ? 0 : 1,
      llr: d.like_login_required === false ? 0 : 1,
      alr: d.about_login_required === false ? 0 : 1,
      pw: d.photo_wall_enabled === false ? 0 : 1,
      ha: d.home_about_enabled === false ? 0 : 1,
      mp: d.music_player_enabled === false ? 0 : 1
    };
  }

  function write(obj) {
    try {
      document.cookie =
        COOKIE + '=' + encodeURIComponent(JSON.stringify(obj)) +
        '; Path=/; SameSite=Lax; Max-Age=86400';
    } catch (e) { /* 隐私模式等场景下写入失败可忽略，接口结果仍会即时生效 */ }
  }

  // 接口返回后回写：保证本次访问之后的新页面无需等待接口就能拿到最新配置
  function writeFromApi(d) {
    if (!d) return;
    try { write(fromApi(d)); } catch (e) { /* 忽略 */ }
  }

  window.ZelmSiteCfg = {
    COOKIE: COOKIE,
    DEFAULTS: DEFAULTS,
    has: has,
    read: read,
    fromApi: fromApi,
    write: write,
    writeFromApi: writeFromApi
  };
})();
