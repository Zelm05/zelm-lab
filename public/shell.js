/* ============================================================================
 * shell.js —— 外壳脚本（index.html 外壳专用）
 * 职责：
 *  - iframe 页面切换（主站 / 关于我 / 管理后台），切页音乐不中断
 *  - 初始化外壳常驻音乐播放器（ZelmMusic）
 *  - 暴露 window.ZelmShell 供 iframe 内页面调用（goPage / goBack）
 * ========================================================================== */
(function () {
  'use strict';

  var frame = document.getElementById('contentFrame');
  var PAGE_SRC = { home: 'home.html', about: 'about.html', admin: 'admin.html' };

  // 入口落地页：站长可在管理台把「进入网站」的落地页设为关于我
  // gate.js 会跳转到 index.html?entry=about，这里据此决定 iframe 初始页
  var initial = 'home';
  try {
    var q = new URLSearchParams(window.location.search).get('entry');
    if (q && PAGE_SRC[q]) initial = q;
  } catch (e) { initial = 'home'; }
  var current = initial;
  if (frame && initial !== 'home') frame.src = PAGE_SRC[initial];

  function goPage(page) {
    if (!PAGE_SRC[page]) return;
    current = page;
    if (frame) frame.src = PAGE_SRC[page];
  }

  // 返回：非主站页先回主站；主站页则执行浏览器后退（与地址栏 ← 一致）
  function goBack() {
    if (current !== 'home') { goPage('home'); return; }
    if (history.length > 1) history.back();
  }

  window.ZelmShell = {
    goPage: goPage,
    goBack: goBack,
    getCurrent: function () { return current; }
  };

  // 外壳常驻音乐播放器（audio 不随 iframe 切换销毁）
  if (window.ZelmMusic) window.ZelmMusic.init();
})();
