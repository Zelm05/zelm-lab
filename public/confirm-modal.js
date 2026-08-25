/* ============================================================================
 * confirm-modal.js —— 自定义确认弹窗（移动端友好）
 * 替换原生 confirm()：微信/QQ 内置浏览器（X5 内核）的原生 confirm 不可靠，
 * 表现为"点了没反应"。本组件用站点同款 modal 渲染确认框，跨端一致。
 * 用法：const ok = await window.zelmConfirm('确定删除吗？'); if (!ok) return;
 * ========================================================================== */
(function () {
  'use strict';
  if (window.zelmConfirm) return;

  // 注入样式（主题变量自适应）
  var style = document.createElement('style');
  style.textContent =
    '.zconfirm-overlay{z-index:600;}' +
    '.zconfirm-modal{max-width:320px;padding:22px 20px 18px;text-align:left;}' +
    '.zconfirm-text{font-size:.9rem;line-height:1.8;color:var(--text,#e9edf6);margin:0 0 18px;word-break:break-word;}' +
    '.zconfirm-actions{display:flex;gap:10px;justify-content:flex-end;}' +
    '.zconfirm-actions button{min-width:84px;height:34px;border-radius:9px;border:1px solid var(--border);background:rgba(255,255,255,.05);color:var(--text,#e9edf6);font-size:.85rem;cursor:pointer;font-family:inherit;transition:all .2s;display:inline-flex;align-items:center;justify-content:center;}' +
    '.zconfirm-actions .zconfirm-cancel:hover{border-color:var(--accent,#4ff0d0);color:var(--accent,#4ff0d0);}' +
    '.zconfirm-actions .zconfirm-ok{background:rgba(239,68,68,.14);border-color:rgba(239,68,68,.5);color:#f87171;}' +
    '.zconfirm-actions .zconfirm-ok:hover{background:rgba(239,68,68,.24);box-shadow:0 0 12px rgba(239,68,68,.25);}' +
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

  function close(result) {
    overlay.hidden = true;
    document.body.style.overflow = '';
    if (resolver) { resolver(result); resolver = null; }
  }
  function show(message, okLabel, cancelLabel) {
    if (resolver) close(false); // 前一弹窗未决时先关
    textEl.textContent = message || '确定继续吗？';
    if (okLabel) okBtn.textContent = okLabel;
    if (cancelLabel) cancelBtn.textContent = cancelLabel;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
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
