/* ============================================================================
 * confirm-modal.js —— 自定义确认弹窗（移动端友好）
 * 替换原生 confirm()：微信/QQ 内置浏览器（X5 内核）的原生 confirm 不可靠，
 * 表现为"点了没反应"。本组件用站点同款 modal 渲染确认框，跨端一致。
 * 用法：const ok = await window.zelmConfirm('确定删除吗？'); if (!ok) return;
 * ========================================================================== */
(function () {
  'use strict';
  if (window.zelmConfirm) return;

  // 注入样式（自包含：不依赖主站 .modal / .modal-overlay，确保 admin 等未引 style.css 的页面也能正常定位/居中/跟随主题）
  var style = document.createElement('style');
  style.textContent =
    '.zconfirm-overlay{position:fixed;inset:0;z-index:6000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(2,8,6,.6);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);animation:fadeIn .2s ease;}' +
    '.zconfirm-overlay[hidden]{display:none;}' +
    '.zconfirm-modal{position:relative;width:min(340px,100%);max-width:340px;padding:22px 20px 18px;text-align:left;background:rgba(9,14,20,.96);border:1px solid var(--border,rgba(79,240,208,.18));border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.6);animation:modalIn .28s ease;}' +
    '.zconfirm-text{font-size:.9rem;line-height:1.8;color:var(--text,#e9edf6);margin:0 0 18px;word-break:break-word;}' +
    '.zconfirm-actions{display:flex;gap:10px;justify-content:flex-end;}' +
    '.zconfirm-actions button{min-width:84px;height:34px;border-radius:9px;border:1px solid var(--border,rgba(79,240,208,.18));background:rgba(255,255,255,.05);color:var(--text,#e9edf6);font-size:.85rem;cursor:pointer;font-family:inherit;transition:all .2s;display:inline-flex;align-items:center;justify-content:center;}' +
    '.zconfirm-actions .zconfirm-cancel:hover{border-color:var(--accent,#4ff0d0);color:var(--accent,#4ff0d0);}' +
    '.zconfirm-actions .zconfirm-ok{background:rgba(239,68,68,.14);border-color:rgba(239,68,68,.5);color:#f87171;}' +
    '.zconfirm-actions .zconfirm-ok:hover{background:rgba(239,68,68,.24);box-shadow:0 0 12px rgba(239,68,68,.25);}' +
    'html[data-theme="light"] .zconfirm-overlay{background:rgba(20,60,40,.4);}' +
    'html[data-theme="light"] .zconfirm-modal{background:rgba(255,255,255,.97);}' +
    'html[data-theme="light"] .zconfirm-actions button{background:rgba(0,0,0,.04);color:#16332a;}' +
    'html[data-theme="light"] .zconfirm-actions .zconfirm-ok{background:rgba(239,68,68,.1);color:#b91c1c;}';
  document.head.appendChild(style);

  // 构建 DOM
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay zconfirm-overlay';
  overlay.hidden = true;
  overlay.innerHTML =
    '<div class="modal zconfirm-modal" role="dialog" aria-label="确认">' +
      '<p class="zconfirm-text"></p>' +
      '<div class="zconfirm-actions">' +
        '<button type="button" class="zconfirm-cancel">取消</button>' +
        '<button type="button" class="zconfirm-ok">确定</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  var textEl = overlay.querySelector('.zconfirm-text');
  var okBtn = overlay.querySelector('.zconfirm-ok');
  var cancelBtn = overlay.querySelector('.zconfirm-cancel');
  var resolver = null;

  // 按钮文案随站点语言（zelm_settings.lang），与主站共用
  var BTN_TXT = {
    zh: { ok: '确定', cancel: '取消' },
    en: { ok: 'OK', cancel: 'Cancel' }
  };
  function btnLang() {
    try { return JSON.parse(localStorage.getItem('zelm_settings') || '{}').lang === 'en' ? 'en' : 'zh'; } catch (e) { return 'zh'; }
  }
  function applyBtnLang() {
    var t = BTN_TXT[btnLang()];
    okBtn.textContent = t.ok;
    cancelBtn.textContent = t.cancel;
  }
  window.addEventListener('storage', function (e) { if (e.key === 'zelm_settings') applyBtnLang(); });
  document.addEventListener('zelm:lang', applyBtnLang);

  function close(result) {
    overlay.hidden = true;
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    if (resolver) { resolver(result); resolver = null; }
  }
  function show(message, okLabel, cancelLabel) {
    if (resolver) close(false); // 前一弹窗未决时先关
    textEl.textContent = message || (btnLang() === 'en' ? 'Are you sure?' : '确定继续吗？');
    applyBtnLang();
    if (okLabel) okBtn.textContent = okLabel;
    if (cancelLabel) cancelBtn.textContent = cancelLabel;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    try { okBtn.focus(); } catch (e) { /* 忽略 */ }
    return new Promise(function (resolve) { resolver = resolve; });
  }

  okBtn.addEventListener('click', function () { close(true); });
  cancelBtn.addEventListener('click', function () { close(false); });
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !overlay.hidden) close(false);
  });

  window.zelmConfirm = show;
})();
