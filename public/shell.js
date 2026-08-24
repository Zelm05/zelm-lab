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
  var current = 'home';

  function goPage(page) {
    if (!PAGE_SRC[page]) return;
    current = page;
    var btns = document.querySelectorAll('.shell-page-btn');
    btns.forEach(function (b) { b.classList.toggle('active', b.dataset.page === page); });
    if (frame) frame.src = PAGE_SRC[page];
  }

  // 返回：非主站页先回主站；主站页则执行浏览器后退（与地址栏 ← 一致）
  function goBack() {
    if (current !== 'home') { goPage('home'); return; }
    if (history.length > 1) history.back();
  }

  // 页面切换栏
  document.querySelectorAll('.shell-page-btn').forEach(function (b) {
    b.addEventListener('click', function () { goPage(b.dataset.page); });
  });
  var brand = document.getElementById('shellBrand');
  if (brand) brand.addEventListener('click', goBack);

  window.ZelmShell = {
    goPage: goPage,
    goBack: goBack,
    getCurrent: function () { return current; }
  };

  // 外壳常驻音乐播放器（audio 不随 iframe 切换销毁）
  if (window.ZelmMusic) window.ZelmMusic.init();
})();
