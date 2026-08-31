/* ============================================================================
 * shell.js —— 外壳脚本（index.html 外壳专用）
 * 职责：
 *  - 伪 SPA 路由：fetch home/about/admin 的 HTML，解析后注入 #viewRoot；
 *    同一时刻只保留当前视图 DOM（天然无 id 冲突），并消除 iframe 双层加载
 *  - hash 路由（#/home、#/about、#/admin），支持浏览器前进/后退
 *  - 初始化外壳常驻音乐播放器（ZelmMusic）——切视图不销毁 <audio>，音乐不中断
 *  - 应用站长「音乐播放器显隐」开关（zelm_site_cfg Cookie 首屏同步）
 *  - 暴露 window.ZelmShell 供视图内脚本调用（goPage / goBack / applyMusicPlayer）
 * ========================================================================== */
(function () {
  'use strict';

  var viewRoot = document.getElementById('viewRoot');
  var PAGE_SRC = { home: 'home.html', about: 'about.html', admin: 'admin.html' };
  var pageCache = {};   // page -> html 文本（会话内缓存，切回不再请求）
  var current = null;   // 当前已挂载视图
  var pending = null;   // 正在拉取的视图（防快速切换乱序）
  var cleanups = [];    // 当前视图注册的卸载清理回调（监听器/定时器回收），切视图时统一执行

  function routeFromHash() {
    var m = (location.hash || '').match(/^#\/(home|about|admin)$/);
    return m ? m[1] : null;
  }

  /* ---------------- 视图挂载 ---------------- */

  // 移除上一个视图的页面级 <style>，避免不同视图样式互相污染
  // 清理上一视图注入的页面级 <style> 与 <script>（都带 data-view-page 标记），
  // 否则反复切视图会让 head 里的样式与脚本无限累积，造成泄漏与样式互相污染
  function clearPageStyles() {
    Array.prototype.forEach.call(
      document.head.querySelectorAll('style[data-view-page], script[data-view-page]'),
      function (s) { s.parentNode.removeChild(s); }
    );
  }

  // 采纳视图 head 里的页面级 <style> 与 <title>（CSS link 已在外壳预载，跳过）
  function adoptHead(doc, page) {
    clearPageStyles();
    Array.prototype.forEach.call(doc.querySelectorAll('head style'), function (st) {
      var s = document.createElement('style');
      s.setAttribute('data-view-page', page);
      s.textContent = st.textContent;
      document.head.appendChild(s);
    });
    // 同步页面 <html> 的静态 class（如 site-open：导航栏/顶栏/背景/星空的可见性与
    // 入场动画全靠它；home/about 写在页面 <html> 上，伪 SPA 必须搬到外壳 <html>）
    document.documentElement.className = doc.documentElement.className || '';
    if (doc.title) document.title = doc.title;

    // 同步视图级 SEO meta（description / og:* / twitter:* / canonical）到外壳 head，
    // 避免伪 SPA 把各视图注入到同一文档后，所有视图共享 shell 的初始 meta，
    // 导致搜索引擎摘要与分享卡片信息错乱
    ['meta[name="description"]', 'meta[property^="og:"]', 'meta[name^="twitter:"]', 'link[rel="canonical"]']
      .forEach(function (sel) {
        Array.prototype.forEach.call(document.head.querySelectorAll(sel), function (m) { m.parentNode.removeChild(m); });
        Array.prototype.forEach.call(doc.head.querySelectorAll(sel), function (m) {
          document.head.appendChild(m.cloneNode(true));
        });
      });
  }

  // 按原顺序串行执行脚本：外部脚本加载执行完，才执行后面的内联脚本
  //（页面尾部的初始化内联脚本依赖其前的外部库，顺序不可乱）
  // 关键：每个视图脚本都在「独立作用域」里执行（new Function），避免重复挂载
  // 同一视图时，顶层 const/let/function 在共享的全局词法作用域中重复声明而报错
  //（iframe 时代每次是全新文档、无此问题；伪 SPA 复用外壳文档必须隔离作用域）。
  // 跨脚本协作统一走 window.*（如 window.ZelmShell / window.zelmConfirm），
  // 故隔离作用域不影响相互调用；同文件内部函数互调也在同一函数体内，正常可用。
  function runInScope(code) {
    try { (new Function(code))(); }
    catch (e) { console.error('[view script error]', e); }
  }
  function runScripts(scripts) {
    // 并行下载所有外部脚本（首屏提速），但按文档原顺序串行执行，
    // 以保证外部库先于依赖它的内联初始化脚本运行（顺序不可乱）。
    // site-cfg.js 外壳已加载，跳过重复执行。
    var tasks = scripts.map(function (old) {
      if (old.src) {
        if (/site-cfg\.js/.test(old.src)) return null;
        return fetch(old.src, { credentials: 'same-origin' })
          .then(function (r) { return r.text(); })
          .catch(function () { return null; }); // 单个脚本失败不阻断后续
      }
      return Promise.resolve(old.textContent);
    });
    return Promise.all(tasks).then(function (codes) {
      codes.forEach(function (code) {
        if (code == null) return;
        runInScope(code);
      });
    });
  }

  function mount(page, html) {
    // 切换到不同视图时，先执行上一视图注册的清理回调，回收其监听器/定时器，
    // 避免每次切回都重新叠加 window/document 上的事件监听造成内存泄漏
    if (current && current !== page) {
      cleanups.splice(0).forEach(function (fn) { try { fn(); } catch (e) {} });
    }
    var doc = new DOMParser().parseFromString(html, 'text/html');
    adoptHead(doc, page);
    // 收集脚本（按遇序），注入其余 DOM；脚本统一后置串行执行
    var scripts = [];
    Array.prototype.forEach.call(doc.body.querySelectorAll('script'), function (s) { scripts.push(s); });
    var frag = document.createDocumentFragment();
    Array.prototype.forEach.call(doc.body.childNodes, function (n) {
      if (n.nodeType === 1 && n.tagName === 'SCRIPT') return;
      frag.appendChild(document.importNode(n, true));
    });
    viewRoot.innerHTML = '';
    viewRoot.appendChild(frag);
    viewRoot.scrollTop = 0;
    current = page;
    document.body.setAttribute('data-view', page);
    // head 内联脚本（环境探测 / 主题 / 登录检测）在 body 注入前原时序执行
    var headInline = [];
    Array.prototype.forEach.call(doc.head.querySelectorAll('script:not([src])'), function (s) { headInline.push(s); });
    headInline.forEach(function (s) {
      var el = document.createElement('script');
      if (s.type) el.type = s.type;
      el.setAttribute('data-view-page', page); // 标记以便切视图时统一清理
      el.text = s.textContent;
      document.head.appendChild(el);
    });
    runScripts(scripts);
  }

  function load(page) {
    if (!PAGE_SRC[page]) return;
    var html = pageCache[page];
    if (html) { mount(page, html); return; }
    pending = page;
    fetch(PAGE_SRC[page], { credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        // 服务端鉴权重定向（如未登录访问 /admin.html 被 302 到 gate.html）：
        // 不缓存、不注入，整页跳过去（与旧 iframe 时代行为一致，登录后再回来）
        if (r.redirected && /gate\.html/i.test(r.url)) {
          location.href = r.url;
          throw new Error('redirected to ' + r.url);
        }
        return r.text();
      })
      .then(function (text) {
        pageCache[page] = text;
        if (pending === page) mount(page, text); // 仅挂载最后一次请求的视图
      })
      .catch(function () { /* 失败/被重定向保留当前视图 */ })
      .then(function () { if (pending === page) pending = null; });
  }

  /* ---------------- 路由 ---------------- */

  function goPage(page) {
    if (!PAGE_SRC[page]) return;
    var target = '#/' + page;
    if (location.hash === target) { if (current !== page) load(page); return; }
    location.hash = target; // 触发 hashchange 统一切视图（自动产生历史记录）
  }
  window.addEventListener('hashchange', function () {
    var page = routeFromHash();
    if (page && page !== current) load(page);
  });

  // 返回：非主站先回主站；主站则执行浏览器后退（与地址栏 ← 一致）
  function goBack() {
    if (current !== 'home') { goPage('home'); return; }
    if (history.length > 1) history.back();
  }

  // 音乐播放器显隐：站长可在管理台关闭；关闭时隐藏 UI 并暂停播放
  function applyMusicPlayer(enabled) {
    var off = !enabled;
    document.documentElement.setAttribute('data-no-music', off ? '1' : '0');
    if (off) {
      var a = document.getElementById('bgAudio');
      if (a && typeof a.pause === 'function') { try { a.pause(); } catch (e) {} }
    }
  }

  window.ZelmShell = {
    goPage: goPage,
    goBack: goBack,
    applyMusicPlayer: applyMusicPlayer,
    // 视图脚本可注册卸载回调（如移除 window/document 上的监听器、清除定时器），
    // 在切走该视图时自动执行，防止伪 SPA 反复挂载导致监听器泄漏
    onUnmount: function (fn) { if (typeof fn === 'function') cleanups.push(fn); },
    getCurrent: function () { return current; }
  };

  // 初始视图：gate 的 ?entry= 优先（站长可设落地页），其次 hash，默认 home
  var initial = 'home';
  try {
    var q = new URLSearchParams(location.search).get('entry');
    if (q && PAGE_SRC[q]) initial = q;
  } catch (e) { initial = 'home'; }
  var h = routeFromHash();
  if (h) initial = h;
  if (location.hash !== '#/' + initial) {
    try { history.replaceState(null, '', location.pathname + location.search + '#/' + initial); } catch (e) {}
  }
  load(initial);

  // 外壳常驻音乐播放器（audio 不随视图切换销毁）
  if (window.ZelmMusic) window.ZelmMusic.init();

  // 首屏按站长设置应用音乐播放器显隐（Cookie 已随页面下发）
  try {
    var mpCfg = window.ZelmSiteCfg ? window.ZelmSiteCfg.read() : null;
    applyMusicPlayer(!mpCfg || mpCfg.mp === 1);
  } catch (e) {}
})();
