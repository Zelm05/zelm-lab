/* ===================================================================
 * auth-panel.js — 自包含认证弹窗组件（gate 风格：深色玻璃拟态 + 青色点缀）
 * 提供两个视图：login（登录）/ register（注册）
 * 管理员与普通用户统一走 login 入口：登录后根据返回 role 决定右上角是否显示「管理后台」，不再单独提供管理员登录窗口。
 * 用法：
 *   <script src="auth-panel.js"></script>
 *   AuthPanel.open('login');      // 打开登录窗口
 *   AuthPanel.open('register');   // 打开注册窗口
 * 无需额外引入 CSS —— 组件会自动注入样式，并适配深浅主题与中英语言。
 * =================================================================== */
(function () {
  'use strict';

  /* ---------------- 注入样式 ---------------- */
  var css = [
    '.auth-modal{position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px}',
    '.auth-modal[hidden]{display:none}',
    '.auth-backdrop{position:absolute;inset:0;background:rgba(2,10,7,.62);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);animation:authFade .25s ease}',
    '@keyframes authFade{from{opacity:0}to{opacity:1}}',
    '@keyframes authPop{from{opacity:0;transform:scale(.92) translateY(14px)}to{opacity:1;transform:scale(1) translateY(0)}}',
    '.auth-card{position:relative;z-index:1;width:min(400px,92vw);background:rgba(13,24,19,.88);border:1px solid rgba(79,240,208,.28);border-radius:22px;padding:26px 26px 22px;color:#e9edf6;box-shadow:0 24px 80px rgba(0,0,0,.55),0 0 44px rgba(79,240,208,.12);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);animation:authPop .32s cubic-bezier(.34,1.56,.64,1)}',
    '.auth-head{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:4px}',
    '.auth-head img{width:42px;height:42px;border-radius:50%;border:2px solid rgba(79,240,208,.45);box-shadow:0 0 14px rgba(79,240,208,.25);object-fit:cover}',
    '.auth-title{font-size:1.05rem;font-weight:700;letter-spacing:.5px;background:linear-gradient(135deg,#4ff0d0,#5b8bff);-webkit-background-clip:text;background-clip:text;color:transparent}',
    '.auth-close{position:absolute;top:12px;right:12px;width:30px;height:30px;border-radius:50%;border:1px solid rgba(79,240,208,.35);background:rgba(255,255,255,.04);color:#9fe8d8;font-size:1rem;line-height:1;cursor:pointer;display:grid;place-items:center;transition:all .2s}',
    '.auth-close:hover{transform:rotate(90deg) scale(1.08);border-color:#4ff0d0;color:#4ff0d0;box-shadow:0 0 12px rgba(79,240,208,.35)}',
    '.auth-tabs{display:inline-flex;width:100%;background:rgba(255,255,255,.07);border-radius:999px;padding:3px;gap:3px;border:1px solid rgba(79,240,208,.18);margin:14px 0 6px;box-sizing:border-box}',
    '.auth-tab{flex:1;border:none;background:none;color:rgba(255,255,255,.6);font-size:.88rem;font-weight:600;font-family:inherit;padding:8px 0;border-radius:999px;cursor:pointer;transition:all .2s}',
    '.auth-tab:hover{color:rgba(255,255,255,.9);background:rgba(255,255,255,.05)}',
    '.auth-tab.active{background:linear-gradient(135deg,rgba(79,240,208,.92),rgba(91,139,255,.92));color:#022;box-shadow:0 2px 12px rgba(79,240,208,.3)}',
    '.auth-panel[hidden]{display:none}',
    '.auth-field{margin-top:12px}',
    '.auth-field label{display:block;font-size:.8rem;margin-bottom:5px;opacity:.8;letter-spacing:.3px}',
    '.auth-input{width:100%;box-sizing:border-box;padding:11px 13px;border-radius:11px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#e9edf6;font-size:.92rem;font-family:inherit;outline:none;transition:border-color .2s,box-shadow .2s}',
    '.auth-input::placeholder{color:rgba(255,255,255,.32)}',
    '.auth-input:focus{border-color:#4ff0d0;box-shadow:0 0 0 3px rgba(79,240,208,.14)}',
    '.auth-hint{font-size:.72rem;opacity:.5;margin-top:4px}',
    '.auth-btn{width:100%;margin-top:18px;padding:12px;border:none;border-radius:11px;background:linear-gradient(135deg,rgba(79,240,208,.95),rgba(91,139,255,.95));color:#022;font-size:.95rem;font-weight:700;font-family:inherit;cursor:pointer;letter-spacing:2px;transition:transform .15s,box-shadow .2s,opacity .2s;box-shadow:0 4px 18px rgba(79,240,208,.25)}',
    '.auth-btn:hover{transform:translateY(-1px);box-shadow:0 6px 24px rgba(79,240,208,.4)}',
    '.auth-btn:active{transform:translateY(0)}',
    '.auth-btn:disabled{opacity:.55;cursor:not-allowed;transform:none}',
    '.auth-msg{margin-top:12px;font-size:.8rem;min-height:16px;text-align:center}',
    '.auth-msg.err{color:#f87171}',
    '.auth-msg.ok{color:#4ade80}',
    '.auth-link{margin-top:12px;text-align:center;font-size:.8rem;opacity:.85}',
    '.auth-link a{color:#4ff0d0;text-decoration:none;font-weight:600}',
    '.auth-link a:hover{text-decoration:underline}',
    '.auth-adminlink{display:block;margin:14px auto 0;border:none;background:rgba(255,255,255,.05);border:1px solid rgba(79,240,208,.25);color:#4ff0d0;font-size:.76rem;font-family:inherit;padding:6px 16px;border-radius:999px;cursor:pointer;transition:all .2s}',
    '.auth-adminlink:hover{background:rgba(79,240,208,.12);box-shadow:0 0 12px rgba(79,240,208,.25)}',
    '.auth-adminlink span{display:inline-block;transform:rotate(0)}',
    '.auth-adminlink:hover span{transform:rotate(180deg)}',
    'html[data-theme="light"] .auth-card{background:rgba(244,250,247,.92);color:#0f2a1e;border-color:rgba(45,122,90,.25);box-shadow:0 24px 80px rgba(20,60,40,.18),0 0 40px rgba(45,122,90,.1)}',
    'html[data-theme="light"] .auth-close{border-color:rgba(45,122,90,.3);background:rgba(45,122,90,.05);color:#2d7a5a}',
    'html[data-theme="light"] .auth-close:hover{border-color:#2d7a5a;color:#2d7a5a}',
    'html[data-theme="light"] .auth-tabs{background:rgba(45,122,90,.08);border-color:rgba(45,122,90,.18)}',
    'html[data-theme="light"] .auth-tab{color:rgba(26,46,34,.6)}',
    'html[data-theme="light"] .auth-tab:hover{color:rgba(26,46,34,.9);background:rgba(45,122,90,.08)}',
    'html[data-theme="light"] .auth-input{background:rgba(45,122,90,.06);border-color:rgba(45,122,90,.18);color:#0f2a1e}',
    'html[data-theme="light"] .auth-input::placeholder{color:rgba(26,46,34,.35)}',
    'html[data-theme="light"] .auth-input:focus{border-color:#2d7a5a;box-shadow:0 0 0 3px rgba(45,122,90,.14)}',
    'html[data-theme="light"] .auth-link a{color:#2d7a5a}',
    'html[data-theme="light"] .auth-adminlink{border-color:rgba(45,122,90,.3);color:#2d7a5a;background:rgba(45,122,90,.05)}',
    'html[data-theme="light"] .auth-adminlink:hover{background:rgba(45,122,90,.12)}'
  ].join('\n');
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ---------------- 多语言文案 ---------------- */
  var T = {
    titleLogin:   { zh: '欢迎回来', en: 'Welcome back' },
    titleReg:     { zh: '创建账号', en: 'Create account' },
    titleAdmin:   { zh: '管理员登录', en: 'Admin Sign In' },
    tabLogin:     { zh: '登录', en: 'Login' },
    tabReg:       { zh: '注册', en: 'Register' },
    username:     { zh: '用户名', en: 'Username' },
    password:     { zh: '密码', en: 'Password' },
    confirm:      { zh: '确认密码', en: 'Confirm Password' },
    uPlace:       { zh: '请输入用户名', en: 'Enter username' },
    pPlace:       { zh: '请输入密码', en: 'Enter password' },
    cPlace:       { zh: '再次输入密码', en: 'Repeat password' },
    ruPlace:      { zh: '3-32 位字母/数字/下划线', en: '3-32 chars, letters/digits/_' },
    rpPlace:      { zh: '至少 8 位', en: 'At least 8 chars' },
    uHint:        { zh: '3-32 位，仅字母/数字/下划线，不可与已有账号重复', en: '3-32 chars (letters/digits/_), must be unique' },
    pHint:        { zh: '至少 8 位', en: 'At least 8 characters' },
    btnLogin:     { zh: '登录', en: 'Sign In' },
    btnReg:       { zh: '注册', en: 'Sign Up' },
    btnAdmin:     { zh: '管理员登录', en: 'Admin Sign In' },
    adminLink:    { zh: '管理员登录', en: 'Admin Sign In' },
    linkLogin:    { zh: '还没有账号？', en: 'No account? ' },
    linkReg:      { zh: '已有账号？', en: 'Have an account? ' },
    toReg:        { zh: '去注册', en: 'Register' },
    toLogin:      { zh: '去登录', en: 'Sign in' },
    backLogin:    { zh: '← 返回普通登录', en: '← Back to user login' },
    pwMismatch:   { zh: '两次输入的密码不一致', en: 'Passwords do not match' },
    regOk:        { zh: '注册成功，请登录', en: 'Registered! Please sign in' },
    entering:     { zh: '登录成功，正在进入…', en: 'Sign in success. Entering…' },
    adminOk:      { zh: '管理员验证通过，正在进入后台…', en: 'Admin verified. Entering console…' },
    notAdmin:     { zh: '该账号不是管理员，无权登录后台', en: 'This account is not an admin' },
    netErr:       { zh: '网络错误，请重试', en: 'Network error, please retry' }
  };

  function getSettings() {
    try { return JSON.parse(localStorage.getItem('zelm_settings') || '{}'); } catch (e) { return {}; }
  }
  function lang() { return getSettings().lang || 'zh'; }
  function tt(key) { return (T[key] && T[key][lang()]) || (T[key] && T[key].zh) || key; }

  // 主题：与 gate / 主站共用 localStorage 设置
  var theme = getSettings().theme || 'dark';
  if (!document.documentElement.getAttribute('data-theme')) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  /* ---------------- 构建 DOM ---------------- */
  var modal = document.createElement('div');
  modal.className = 'auth-modal';
  modal.hidden = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML =
    '<div class="auth-backdrop"></div>' +
    '<div class="auth-card">' +
      '<button class="auth-close" type="button" aria-label="关闭">✕</button>' +
      '<div class="auth-head">' +
        '<img src="assets/avatar.jpg" alt="Zelm 头像" />' +
        '<span class="auth-title" id="apTitle">' + tt('titleLogin') + '</span>' +
      '</div>' +
      // ---- 登录 / 注册 Tab ----
      '<div class="auth-tabs" id="apTabs">' +
        '<button class="auth-tab active" data-tab="login" type="button">' + tt('tabLogin') + '</button>' +
        '<button class="auth-tab" data-tab="register" type="button">' + tt('tabReg') + '</button>' +
      '</div>' +
      // ---- 登录面板 ----
      '<div class="auth-panel" id="apPanelLogin">' +
        '<form id="apLoginForm" novalidate>' +
          '<div class="auth-field"><label for="apLoginUser">' + tt('username') + '</label>' +
            '<input class="auth-input" id="apLoginUser" type="text" autocomplete="username" placeholder="' + tt('uPlace') + '" required></div>' +
          '<div class="auth-field"><label for="apLoginPass">' + tt('password') + '</label>' +
            '<input class="auth-input" id="apLoginPass" type="password" autocomplete="current-password" placeholder="' + tt('pPlace') + '" required></div>' +
          '<button class="auth-btn" id="apLoginBtn" type="submit">' + tt('btnLogin') + '</button>' +
          '<div class="auth-msg" id="apLoginMsg"></div>' +
        '</form>' +
        '<div class="auth-link" id="apLoginLink">' + tt('linkLogin') + '<a href="#" data-switch="register">' + tt('toReg') + '</a></div>' +
      '</div>' +
      // ---- 注册面板 ----
      '<div class="auth-panel" id="apPanelRegister" hidden>' +
        '<form id="apRegForm" novalidate>' +
          '<div class="auth-field"><label for="apRegUser">' + tt('username') + '</label>' +
            '<input class="auth-input" id="apRegUser" type="text" autocomplete="username" placeholder="' + tt('ruPlace') + '" required>' +
            '<div class="auth-hint">' + tt('uHint') + '</div></div>' +
          '<div class="auth-field"><label for="apRegPass">' + tt('password') + '</label>' +
            '<input class="auth-input" id="apRegPass" type="password" autocomplete="new-password" placeholder="' + tt('rpPlace') + '" required>' +
            '<div class="auth-hint">' + tt('pHint') + '</div></div>' +
          '<div class="auth-field"><label for="apRegConfirm">' + tt('confirm') + '</label>' +
            '<input class="auth-input" id="apRegConfirm" type="password" autocomplete="new-password" placeholder="' + tt('cPlace') + '" required></div>' +
          '<button class="auth-btn" id="apRegBtn" type="submit">' + tt('btnReg') + '</button>' +
          '<div class="auth-msg" id="apRegMsg"></div>' +
        '</form>' +
        '<div class="auth-link" id="apRegLink">' + tt('linkReg') + '<a href="#" data-switch="login">' + tt('toLogin') + '</a></div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);

  var $ = function (id) { return document.getElementById(id); };
  var currentTab = 'login';

  /* ---------------- 语言切换 ---------------- */
  function applyLang() {
    var l = lang();
    function s(id, key) { var el = $(id); if (el) el.textContent = tt(key); }
    s('apTitle', 'title' + (currentTab === 'login' ? 'Login' : currentTab === 'register' ? 'Reg' : 'Admin'));
    var tabs = modal.querySelectorAll('.auth-tab');
    if (tabs[0]) tabs[0].textContent = T.tabLogin[l];
    if (tabs[1]) tabs[1].textContent = T.tabReg[l];
    var labels = modal.querySelectorAll('label');
    var keys = ['username', 'password', 'username', 'password', 'confirm'];
    labels.forEach(function (el, i) { if (keys[i]) el.textContent = tt(keys[i]); });
    var ph = [
      ['apLoginUser', 'uPlace'], ['apLoginPass', 'pPlace'],
      ['apRegUser', 'ruPlace'], ['apRegPass', 'rpPlace'], ['apRegConfirm', 'cPlace'],
      ['apAdminPass', 'pPlace']
    ];
    ph.forEach(function (m) { var el = $(m[0]); if (el) el.placeholder = tt(m[1]); });
    var hints = modal.querySelectorAll('.auth-hint');
    if (hints[0]) hints[0].textContent = tt('uHint');
    if (hints[1]) hints[1].textContent = tt('pHint');
    $('apLoginBtn').textContent = tt('btnLogin');
    $('apRegBtn').textContent = tt('btnReg');
    $('apLoginLink').innerHTML = tt('linkLogin') + '<a href="#" data-switch="register">' + tt('toReg') + '</a>';
    $('apRegLink').innerHTML = tt('linkReg') + '<a href="#" data-switch="login">' + tt('toLogin') + '</a>';
  }

  /* ---------------- 开关 ---------------- */
  function open(tab) {
    switchTab(tab === 'register' ? 'register' : 'login');
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    var first = currentTab === 'login' ? $('apLoginUser') : $('apRegUser');
    setTimeout(function () { try { first.focus(); } catch (e) {} }, 60);
  }
  function close() {
    modal.hidden = true;
    document.body.style.overflow = '';
    ['apLoginMsg', 'apRegMsg'].forEach(function (id) { var el = $(id); if (el) { el.textContent = ''; el.className = 'auth-msg'; } });
  }

  function switchTab(tab) {
    currentTab = tab;
    modal.querySelectorAll('.auth-tab').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    $('apPanelLogin').hidden = tab !== 'login';
    $('apPanelRegister').hidden = tab !== 'register';
    ['apLoginMsg', 'apRegMsg'].forEach(function (id) { var el = $(id); if (el) { el.textContent = ''; el.className = 'auth-msg'; } });
    var titleEl = $('apTitle');
    if (titleEl) titleEl.textContent = tt(tab === 'login' ? 'titleLogin' : tab === 'register' ? 'titleReg' : 'titleAdmin');
  }

  function setMsg(id, text, type) {
    var el = $(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'auth-msg' + (type ? ' ' + type : '');
  }

  /* ---------------- 提交 ---------------- */
  function postJSON(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (d) { return { ok: r.ok, data: d }; });
    });
  }

  function onLoginSuccess() {
    // 通知音乐播放器同步账号播放进度并启动单端守护
    try { document.dispatchEvent(new Event('zelm:login')); } catch (e) {}
    var path = window.location.pathname;
    // 在主站页面上则刷新以显示「登出」，否则跳转主站
    if (path === '/' || path === '/index.html') window.location.reload();
    else window.location.href = 'index.html';
  }

  // 单端登录冲突确认弹窗（该账号已在别处登录，是否继续登录）
  var apConflictModal = null;
  function showConflictConfirm(message, onContinue) {
    if (!apConflictModal) {
      var box = document.createElement('div');
      box.className = 'modal-overlay';
      box.id = 'apConflictModal';
      box.innerHTML =
        '<div class="modal conflict-modal" role="dialog" aria-label="登录冲突确认">' +
          '<div class="conflict-icon"><svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M12 2 1 21h22L12 2zm1 14h-2v2h2v-2zm0-8h-2v6h2V8z"/></svg></div>' +
          '<h3 class="conflict-title">账号已在其他设备登录</h3>' +
          '<p class="conflict-desc">该账号已在别处登录，是否继续登录？继续后将顶掉原设备。</p>' +
          '<div class="conflict-buttons">' +
            '<button class="conflict-btn conflict-cancel" id="apConflictCancel" type="button">取消</button>' +
            '<button class="conflict-btn conflict-ok" id="apConflictOk" type="button">继续登录</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(box);
      apConflictModal = box;
      // 必须高于登录框（.auth-modal z-index:9000），否则冲突提示会被遮住看不见
      box.style.zIndex = '9500';
      box.addEventListener('click', function (e) {
        if (e.target === box) hideConflictConfirm();
      });
    }
    var okBtn = apConflictModal.querySelector('#apConflictOk');
    var cancelBtn = apConflictModal.querySelector('#apConflictCancel');
    okBtn.onclick = function () { hideConflictConfirm(); onContinue(); };
    cancelBtn.onclick = function () { hideConflictConfirm(); };
    apConflictModal.querySelector('.conflict-desc').textContent =
      message || '该账号已在别处登录，是否继续登录？继续后将顶掉原设备。';
    apConflictModal.hidden = false;
  }
  function hideConflictConfirm() {
    if (apConflictModal) apConflictModal.hidden = true;
  }

  // 执行登录（force=true 用于顶号续登）
  function doLogin(force) {
    var btn = $('apLoginBtn'), msg = $('apLoginMsg');
    setMsg('apLoginMsg', '', '');
    btn.disabled = true;
    postJSON('/api/login', {
      username: $('apLoginUser').value.trim(),
      password: $('apLoginPass').value,
      force: !!force
    }).then(function (res) {
      if (res.ok) {
        setMsg('apLoginMsg', tt('entering'), 'ok');
        setTimeout(onLoginSuccess, 450);
      } else if (res.data && res.data.conflict) {
        // 单端登录冲突：询问是否继续登录
        btn.disabled = false;
        setMsg('apLoginMsg', '', '');
        showConflictConfirm(res.data.message, function () { doLogin(true); });
      } else {
        setMsg('apLoginMsg', res.data.error || tt('netErr'), 'err');
        btn.disabled = false;
      }
    }).catch(function () {
      setMsg('apLoginMsg', tt('netErr'), 'err');
      btn.disabled = false;
    });
  }

  // 登录
  $('apLoginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    doLogin(false);
  });

  // 注册（用户名不可重复，后端校验并返回错误）
  $('apRegForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('apRegBtn'), user = $('apRegUser').value.trim(),
        pass = $('apRegPass').value, confirm = $('apRegConfirm').value;
    setMsg('apRegMsg', '', '');
    if (pass !== confirm) { setMsg('apRegMsg', tt('pwMismatch'), 'err'); return; }
    btn.disabled = true;
    postJSON('/api/register', {
      username: user,
      password: pass
    }).then(function (res) {
      if (res.ok) {
        setMsg('apRegMsg', tt('regOk'), 'ok');
        $('apLoginUser').value = user;
        setTimeout(function () { switchTab('login'); }, 800);
      } else {
        setMsg('apRegMsg', res.data.error || tt('netErr'), 'err');
        btn.disabled = false;
      }
    }).catch(function () {
      setMsg('apRegMsg', tt('netErr'), 'err');
      btn.disabled = false;
    });
  });

  /* ---------------- 事件绑定 ---------------- */
  modal.querySelector('.auth-close').addEventListener('click', close);
  modal.querySelector('.auth-backdrop').addEventListener('click', close);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hidden) close();
  });
  modal.querySelectorAll('.auth-tab').forEach(function (b) {
    b.addEventListener('click', function () { switchTab(b.dataset.tab); });
  });
  modal.addEventListener('click', function (e) {
    var sw = e.target.closest && e.target.closest('[data-switch]');
    if (sw) { e.preventDefault(); switchTab(sw.dataset.switch); }
  });

  // 全局委托：任何带 data-auth-open 的按钮点击都会弹出对应认证窗口
  // （不依赖页面内联绑定脚本的执行顺序，最健壮；欢迎页/主站均可使用）
  document.addEventListener('click', function (e) {
    var opener = e.target.closest && e.target.closest('[data-auth-open]');
    if (opener) open(opener.dataset.authOpen);
  });

  /* ---------------- 对外接口 ---------------- */
  window.AuthPanel = {
    open: open,
    close: close,
    switchTab: switchTab,
    refreshLang: applyLang
  };

  // 监听语言设置变化（其它脚本保存设置后触发）
  window.addEventListener('storage', function (e) {
    if (e.key === 'zelm_settings') applyLang();
  });
  applyLang();
})();
