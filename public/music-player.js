/* ============================================================================
 * music-player.js —— 全站共用的背景音乐播放器
 * 特性：
 *  - 每个非 gate 页面都有播放器（index 用静态标记，about/admin 自动注入）
 *  - 跨页面不中断：状态存 localStorage，跳转后从断点续播
 *  - 登录后播放进度按账号持久化（GET/POST /api/playback），换设备/下次继续
 *  - 主题化播放/暂停图标（SVG，currentColor）
 *  - 三种播放模式：顺序(默认) / 循环 / 随机
 *  - 仅从 gate 页进入主站时才弹「是否播放」确认
 *  - 单端登录：轮询 /api/session/check，被顶号时弹出通知并下线
 * ========================================================================== */
(function () {
  'use strict';

  var STORAGE_KEY = 'zelm_music_v1';
  var ACCOUNT_SAVE_MS = 4000;        // 播放中向账号保存进度的最小间隔
  var SESSION_CHECK_MS = 15000;      // 单端登录心跳间隔

  var MUSIC_LIST = [
    { name: '听雨的声音', artist: '瑞恩船长,雪球', url: 'assets/music/瑞恩船长,雪球 - 听雨的声音.mp3', discBg: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
    { name: '手牵手',     artist: '王力宏,陶喆,蔡琴', url: 'assets/music/王力宏,陶喆,蔡琴 - 手牵手.mp3', discBg: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' },
    { name: '爱错',       artist: '王力宏',         url: 'assets/music/王力宏 - 爱错.mp3',                 discBg: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)' },
    { name: '手写的从前', artist: '赵乃吉',         url: 'assets/music/赵乃吉 - 手写的从前.mp3',           discBg: 'linear-gradient(135deg, #a8e063 0%, #56ab2f 100%)' },
    { name: '我们的歌',   artist: '王力宏',         url: 'assets/music/王力宏 - 我们的歌.mp3',             discBg: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)' }
  ];

  var MODES = ['order', 'loop', 'shuffle'];
  var MODE_LABEL = { order: '顺序', loop: '循环', shuffle: '随机' };

  // 主题化图标（描边用 currentColor，跟随站点主题）
  var ICON = {
    play:    '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.4-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14z"/></svg>',
    pause:   '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z"/></svg>',
    prev:    '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M7 6a1 1 0 0 1 2 0v12a1 1 0 0 1-2 0V6zM20 6.2v11.6a1 1 0 0 1-1.54.84L9.3 12l9.16-6.64A1 1 0 0 1 20 6.2z"/></svg>',
    next:    '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M17 6a1 1 0 0 0-2 0v12a1 1 0 0 0 2 0V6zM4 6.2v11.6a1 1 0 0 0 1.54.84L14.7 12 5.54 5.36A1 1 0 0 0 4 6.2z"/></svg>',
    order:   '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M3 5h18v2H3zM3 11h18v2H3zM3 17h12v2H3z"/></svg>',
    loop:    '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>'
  };

  // ---- 运行时状态 ----
  var audio = null;
  var els = {};
  var currentIndex = -1;
  var isPlaying = false;
  var mode = 'order';
  var volume = 0.7;
  var lastSaveTs = 0;
  var isLoggedIn = false;
  var accountReady = false;      // 账号进度是否已同步（同步完成前不向账号覆盖保存）
  var pendingResume = false;     // 自动播放被浏览器拦截时，等首次交互再续播
  var sessionTimer = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) return '0:00';
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function randInt(n) { return Math.floor(Math.random() * n); }

  /* ----------------------------------------------------------------
   * 持久化
   * ---------------------------------------------------------------- */
  function loadLocal() {
    try {
      var s = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (s && typeof s === 'object') {
        currentIndex = (typeof s.trackIndex === 'number') ? s.trackIndex : -1;
        if (currentIndex < 0 || currentIndex >= MUSIC_LIST.length) currentIndex = -1;
        mode = (MODES.indexOf(s.mode) >= 0) ? s.mode : 'order';
        volume = (typeof s.volume === 'number') ? s.volume : 0.7;
        if (volume < 0) volume = 0; if (volume > 1) volume = 1;
        return s;
      }
    } catch (e) { /* ignore */ }
    return null;
  }
  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        trackIndex: currentIndex,
        currentTime: audio ? audio.currentTime : 0,
        playing: isPlaying,
        mode: mode,
        volume: volume
      }));
    } catch (e) { /* ignore */ }
  }

  /* ----------------------------------------------------------------
   * DOM：缺少播放器标记的页面（about / admin）自动注入，保持 ID 一致
   * ---------------------------------------------------------------- */
  var PLAYER_HTML = '' +
    '<div class="music-player glass" id="musicPlayer">' +
      '<div class="disc" id="disc"><div class="disc-cover" id="discCover">♪</div><div class="disc-hole"></div></div>' +
      '<div class="music-main-info">' +
        '<div class="music-main-title" id="musicMainTitle">未播放</div>' +
        '<div class="music-main-artist" id="musicMainArtist">-</div>' +
        '<div class="music-main-progress">' +
          '<span class="music-main-time" id="musicMainCurTime">0:00</span>' +
          '<div class="music-main-bar" id="musicMainBar"><div class="music-main-bar-fill" id="musicMainBarFill"></div></div>' +
          '<span class="music-main-time" id="musicMainDurTime">0:00</span>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="music-popup" id="musicPopup" hidden>' +
      '<div class="music-popup-head"><span>音乐列表</span><button class="music-popup-close" id="musicPopupClose" aria-label="关闭">✕</button></div>' +
      '<div class="music-popup-body">' +
        '<div class="music-now-playing" id="musicNowPlaying">' +
          '<div class="music-np-disc" id="musicNpDisc"></div>' +
          '<div class="music-np-info"><div class="music-np-title" id="musicNpTitle">未播放</div><div class="music-np-artist" id="musicNpArtist">-</div></div>' +
        '</div>' +
        '<div class="music-controls">' +
          '<button class="music-ctrl-btn" id="musicPrevBtn" title="上一首"></button>' +
          '<button class="music-ctrl-btn music-play-btn" id="musicPlayBtn" title="播放/暂停"></button>' +
          '<button class="music-ctrl-btn" id="musicNextBtn" title="下一首"></button>' +
          '<button class="music-ctrl-btn music-mode-btn" id="musicModeBtn" title="播放模式">顺序</button>' +
        '</div>' +
        '<div class="music-progress">' +
          '<span class="music-time" id="musicCurTime">0:00</span>' +
          '<input type="range" class="music-progress-bar" id="musicProgressBar" min="0" max="100" value="0">' +
          '<span class="music-time" id="musicDurTime">0:00</span>' +
        '</div>' +
        '<div class="music-volume">' +
          '<span class="music-volume-icon" id="musicVolumeIcon">🔊</span>' +
          '<input type="range" class="music-volume-bar" id="musicVolumeBar" min="0" max="100" value="70">' +
          '<span class="music-volume-val" id="musicVolumeVal">70%</span>' +
        '</div>' +
        '<div class="music-list" id="musicList"></div>' +
      '</div>' +
    '</div>' +
    '<div class="modal-overlay" id="musicConfirmOverlay" hidden>' +
      '<div class="modal music-confirm-modal" role="dialog">' +
        '<div class="music-confirm-header"><div class="music-confirm-icon">🎵</div>' +
          '<div class="music-confirm-text"><h3 class="music-confirm-title">是否播放背景音乐？</h3>' +
          '<p class="music-confirm-desc">可随时在右下角播放器中控制</p></div>' +
        '</div>' +
        '<div class="music-confirm-buttons">' +
          '<button class="music-confirm-btn music-confirm-no" id="musicConfirmNo">暂不播放</button>' +
          '<button class="music-confirm-btn music-confirm-yes" id="musicConfirmYes">播放</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="modal-overlay" id="sessionKickModal" hidden>' +
      '<div class="modal session-kick-modal" role="dialog">' +
        '<div class="session-kick-icon"><svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M12 2 1 21h22L12 2zm1 14h-2v2h2v-2zm0-8h-2v6h2V8z"/></svg></div>' +
        '<h3 class="session-kick-title">账号已在其他设备登录</h3>' +
        '<p class="session-kick-desc">您的账号已在另一台设备登录，您已被下线。</p>' +
        '<button class="session-kick-ok" id="sessionKickOk">我知道了</button>' +
      '</div>' +
    '</div>' +
    '<audio id="bgAudio"></audio>';

  function ensureDOM() {
    if (!$('musicPlayer')) {
      var wrap = document.createElement('div');
      wrap.innerHTML = PLAYER_HTML;
      while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    }
    // index 静态标记可能没有「模式」按钮，统一补齐
    var ctrl = document.querySelector('.music-controls');
    if (ctrl && !$('musicModeBtn')) {
      var mb = document.createElement('button');
      mb.className = 'music-ctrl-btn music-mode-btn';
      mb.id = 'musicModeBtn';
      mb.title = '播放模式：' + MODE_LABEL[mode];
      ctrl.appendChild(mb);
    }
    audio = $('bgAudio');
    // preload 用 metadata：保证 load() 后 loadedmetadata 可靠触发（跨页断点 seek 依赖它），
    // 又不预载媒体数据，避免切页后从曲目头播
    if (audio) { audio.preload = 'metadata'; audio.volume = volume; }
  }

  function bind() {
    els = {
      player: $('musicPlayer'),
      disc: $('disc'),
      discCover: $('discCover'),
      mainTitle: $('musicMainTitle'),
      mainArtist: $('musicMainArtist'),
      mainCur: $('musicMainCurTime'),
      mainDur: $('musicMainDurTime'),
      mainBar: $('musicMainBar'),
      mainBarFill: $('musicMainBarFill'),
      popup: $('musicPopup'),
      popupClose: $('musicPopupClose'),
      npDisc: $('musicNpDisc'),
      npTitle: $('musicNpTitle'),
      npArtist: $('musicNpArtist'),
      playBtn: $('musicPlayBtn'),
      prevBtn: $('musicPrevBtn'),
      nextBtn: $('musicNextBtn'),
      modeBtn: $('musicModeBtn'),
      progress: $('musicProgressBar'),
      curTime: $('musicCurTime'),
      durTime: $('musicDurTime'),
      volIcon: $('musicVolumeIcon'),
      volBar: $('musicVolumeBar'),
      volVal: $('musicVolumeVal'),
      list: $('musicList'),
      confirm: $('musicConfirmOverlay'),
      confirmYes: $('musicConfirmYes'),
      confirmNo: $('musicConfirmNo'),
      kick: $('sessionKickModal'),
      kickOk: $('sessionKickOk')
    };

    if (els.playBtn) els.playBtn.addEventListener('click', togglePlay);
    if (els.prevBtn) { els.prevBtn.innerHTML = ICON.prev; els.prevBtn.addEventListener('click', function () { goPrev(); }); }
    if (els.nextBtn) { els.nextBtn.innerHTML = ICON.next; els.nextBtn.addEventListener('click', function () { goNext(false); }); }
    if (els.modeBtn) els.modeBtn.addEventListener('click', function (e) {
      // 阻止冒泡：setModeUI 会替换按钮内容，若让事件冒泡到 document，
      // 旧图标已脱离 DOM，会被「点击空白关闭」误判为点击外部而关掉选歌窗口
      e.stopPropagation();
      cycleMode();
    });
    if (els.player) els.player.addEventListener('click', function (e) {
      if (e.target.closest('#musicPopup')) return;
      openPopup();
    });
    if (els.popupClose) els.popupClose.addEventListener('click', closePopup);
    if (els.confirmYes) els.confirmYes.addEventListener('click', confirmPlay);
    if (els.confirmNo) els.confirmNo.addEventListener('click', confirmNo);
    if (els.kickOk) els.kickOk.addEventListener('click', function () {
      if (els.kick) els.kick.hidden = true;
      window.location.href = (location.pathname.indexOf('admin.html') >= 0) ? 'index.html' : location.pathname;
    });

    // 进度条拖动
    if (els.progress) els.progress.addEventListener('input', function () {
      if (!audio || !audio.duration) return;
      audio.currentTime = (Number(els.progress.value) / 100) * audio.duration;
      updateProgressUI();
    });
    // 点击紧凑进度条跳转
    if (els.mainBar) els.mainBar.addEventListener('click', function (e) {
      if (!audio || !audio.duration) return;
      var r = els.mainBar.getBoundingClientRect();
      audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration;
    });
    // 音量
    if (els.volBar) els.volBar.addEventListener('input', function () {
      volume = Number(els.volBar.value) / 100;
      if (audio) audio.volume = volume;
      updateVolumeUI();
      saveLocal();
    });
    if (els.volIcon) els.volIcon.addEventListener('click', function () {
      if (volume > 0) { els.volIcon.dataset.muted = '1'; }
      else { delete els.volIcon.dataset.muted; }
      volume = (volume > 0) ? 0 : (Number(els.volBar.value) || 70) / 100 || 0.7;
      if (audio) audio.volume = volume;
      updateVolumeUI();
      saveLocal();
    });

    // 列表点击（事件委托）
    if (els.list) els.list.addEventListener('click', function (e) {
      var item = e.target.closest('.music-item');
      if (!item) return;
      var idx = parseInt(item.dataset.index, 10);
      selectTrack(idx, true);
    });

    // 点击空白处关闭弹窗
    document.addEventListener('click', function (e) {
      // e.target 已脱离 DOM（如点击弹窗内按钮后其内容被重渲染）时忽略，
      // 避免把「弹窗内部点击」误判为「点击外部」
      if (!e.target || e.target.isConnected === false) return;
      if (els.popup && !els.popup.hidden &&
          !els.popup.contains(e.target) && els.player && !els.player.contains(e.target)) {
        closePopup();
      }
    });

    // 音频事件
    if (audio) {
      audio.addEventListener('loadedmetadata', function () { updateProgressUI(); updateMainUI(); });
      audio.addEventListener('timeupdate', onTimeUpdate);
      audio.addEventListener('play', function () { isPlaying = true; reflectPlayState(); saveLocal(); });
      audio.addEventListener('pause', function () { isPlaying = false; reflectPlayState(); saveLocal(); saveAccount(); });
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('error', function () { /* 加载失败静默 */ });
    }
  }

  /* ----------------------------------------------------------------
   * 播放控制
   * ---------------------------------------------------------------- */
  function selectTrack(index, autoplay) {
    if (index < 0 || index >= MUSIC_LIST.length) return;
    currentIndex = index;
    if (!audio) return;
    var m = MUSIC_LIST[index];
    audio.src = m.url;
    audio.load();
    updateDiscStyle();
    updateNowPlaying();
    renderList();
    if (autoplay) play();
    saveLocal();
  }

  function play() {
    if (!audio || currentIndex < 0) {
      if (currentIndex < 0) selectTrack(0, false);
      if (currentIndex < 0) return;
    }
    var p = audio.play();
    if (p && typeof p.then === 'function') {
      p.then(function () { pendingResume = false; })
       .catch(function () {
          // 浏览器拦截自动播放：等用户首次交互再续播
          pendingResume = true;
          document.addEventListener('pointerdown', resumeOnGesture, { once: true });
          document.addEventListener('keydown', resumeOnGesture, { once: true });
        });
    }
  }
  function resumeOnGesture() {
    if (pendingResume) { pendingResume = false; play(); }
  }
  function pause() {
    if (audio) audio.pause();
  }
  function togglePlay() {
    if (isPlaying) pause();
    else { if (currentIndex < 0) selectTrack(0, false); play(); }
  }

  function nextIndex(auto) {
    var n = MUSIC_LIST.length;
    if (mode === 'shuffle') {
      if (n <= 1) return 0;
      var r; do { r = randInt(n); } while (r === currentIndex);
      return r;
    }
    if (auto && mode === 'order' && currentIndex >= n - 1) return -1; // 顺序播完即停
    return (currentIndex + 1) % n;
  }
  function prevIndex() {
    var n = MUSIC_LIST.length;
    if (mode === 'shuffle') {
      if (n <= 1) return 0;
      var r; do { r = randInt(n); } while (r === currentIndex);
      return r;
    }
    return (currentIndex - 1 + n) % n;
  }
  function goNext(auto) {
    var ni = nextIndex(auto);
    if (ni < 0) { pause(); updateProgressUI(); return; }
    selectTrack(ni, true);
  }
  function goPrev() { selectTrack(prevIndex(), true); }

  function onEnded() {
    if (mode === 'loop') { selectTrack((currentIndex + 1) % MUSIC_LIST.length, true); return; }
    if (mode === 'shuffle') { goNext(false); return; }
    // order：最后一首播完则停
    if (currentIndex >= MUSIC_LIST.length - 1) { pause(); isPlaying = false; reflectPlayState(); saveLocal(); }
    else goNext(false);
  }

  function cycleMode() {
    var i = MODES.indexOf(mode);
    mode = MODES[(i + 1) % MODES.length];
    setModeUI();
    saveLocal();
  }

  function setModeUI() {
    if (els.modeBtn) {
      els.modeBtn.innerHTML = ICON[mode] || '';
      els.modeBtn.title = '播放模式：' + MODE_LABEL[mode];
    }
  }

  /* ----------------------------------------------------------------
   * UI 刷新
   * ---------------------------------------------------------------- */
  function reflectPlayState() {
    if (els.playBtn) els.playBtn.innerHTML = isPlaying ? ICON.pause : ICON.play;
    if (els.disc) els.disc.classList.toggle('playing', isPlaying);
    if (els.npDisc) els.npDisc.classList.toggle('playing', isPlaying);
    if (els.player) els.player.classList.toggle('playing', isPlaying);
  }
  function updateDiscStyle() {
    if (currentIndex < 0) return;
    var bg = MUSIC_LIST[currentIndex].discBg;
    if (els.disc) { els.disc.style.background = bg; els.disc.style.backgroundSize = 'cover'; els.disc.style.backgroundPosition = 'center'; }
    if (els.npDisc) { els.npDisc.style.background = bg; els.npDisc.style.backgroundSize = 'cover'; els.npDisc.style.backgroundPosition = 'center'; }
  }
  function updateNowPlaying() {
    var m = (currentIndex >= 0) ? MUSIC_LIST[currentIndex] : null;
    var title = m ? m.name : '未播放';
    var artist = m ? m.artist : '-';
    if (els.mainTitle) els.mainTitle.textContent = title;
    if (els.mainArtist) els.mainArtist.textContent = artist;
    if (els.npTitle) els.npTitle.textContent = title;
    if (els.npArtist) els.npArtist.textContent = artist;
  }
  function updateMainUI() {
    if (els.mainCur) els.mainCur.textContent = fmt(audio.currentTime);
    if (els.mainDur) els.mainDur.textContent = fmt(audio.duration);
  }
  function updateProgressUI() {
    if (!audio) return;
    var cur = audio.currentTime || 0, dur = audio.duration || 0;
    if (els.curTime) els.curTime.textContent = fmt(cur);
    if (els.durTime) els.durTime.textContent = fmt(dur);
    if (els.progress && dur) els.progress.value = Math.min(100, Math.round((cur / dur) * 100));
    if (els.mainCur) els.mainCur.textContent = fmt(cur);
    if (els.mainDur) els.mainDur.textContent = fmt(dur);
    if (els.mainBarFill && dur) els.mainBarFill.style.width = (cur / dur * 100) + '%';
  }
  function updateVolumeUI() {
    if (els.volBar) els.volBar.value = Math.round(volume * 100);
    if (els.volVal) els.volVal.textContent = Math.round(volume * 100) + '%';
    if (els.volIcon) els.volIcon.textContent = (volume === 0) ? '🔇' : '🔊';
  }
  function renderList() {
    if (!els.list) return;
    els.list.innerHTML = MUSIC_LIST.map(function (m, i) {
      return '<div class="music-item ' + (i === currentIndex ? 'active' : '') + '" data-index="' + i + '">' +
        '<span class="music-item-index">' + (i === currentIndex && isPlaying ? '♪' : (i + 1)) + '</span>' +
        '<div class="music-item-info"><div class="music-item-name">' + esc(m.name) + '</div>' +
        '<div class="music-item-artist">' + esc(m.artist) + '</div></div></div>';
    }).join('');
  }

  function onTimeUpdate() {
    updateProgressUI();
    // 节流：播放中每 ACCOUNT_SAVE_MS 向账号保存一次进度
    var now = Date.now();
    if (isLoggedIn && isPlaying && now - lastSaveTs > ACCOUNT_SAVE_MS) {
      lastSaveTs = now;
      saveAccount();
    }
    saveLocal();
  }

  /* ----------------------------------------------------------------
   * 弹窗开合
   * ---------------------------------------------------------------- */
  function openPopup() { if (els.popup) { els.popup.hidden = false; renderList(); updateNowPlaying(); } }
  function closePopup() { if (els.popup) els.popup.hidden = true; }

  function showConfirm() {
    if (els.confirm) { els.confirm.hidden = false; document.body.style.overflow = 'hidden'; }
  }
  function hideConfirm() {
    if (els.confirm) { els.confirm.hidden = true; document.body.style.overflow = ''; }
    try { sessionStorage.setItem('zelm_musicConfirmed', '1'); } catch (e) {}
  }
  function confirmPlay() {
    hideConfirm();
    var local = loadLocal();
    if (currentIndex >= 0 && local && local.playing) { play(); }
    else { selectTrack(currentIndex >= 0 ? currentIndex : 0, true); }
  }
  function confirmNo() {
    hideConfirm();
    isPlaying = false;
    if (audio) audio.pause();
    reflectPlayState();
    saveLocal();
  }

  /* ----------------------------------------------------------------
   * 账号播放进度同步
   * ---------------------------------------------------------------- */
  function saveAccount() {
    if (!isLoggedIn || !accountReady || currentIndex < 0 || !audio) return;
    try {
      fetch('/api/playback', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          track_index: currentIndex,
          position: Math.floor(audio.currentTime || 0),
          mode: mode
        })
      }).then(function (r) {
        if (r.status === 401) isLoggedIn = false;
      }).catch(function () {});
    } catch (e) { /* ignore */ }
  }
  function syncAccount() {
    try {
      fetch('/api/playback', { method: 'GET', credentials: 'include' })
        .then(function (r) {
          if (r.status === 401) { isLoggedIn = false; accountReady = true; return null; }
          if (!r.ok) { accountReady = true; return null; }
          return r.json();
        })
        .then(function (data) {
          if (!data) return;
          isLoggedIn = true;
          accountReady = true;
          // 账号从无记录：保留本地播放状态，不覆盖
          if (data.has === false) { saveLocal(); return; }
          if (typeof data.track_index === 'number' && data.track_index >= 0 && data.track_index < MUSIC_LIST.length) {
            currentIndex = data.track_index;
            mode = (MODES.indexOf(data.mode) >= 0) ? data.mode : mode;
            setModeUI();
            var pos = Number(data.position) || 0;
            if (audio) {
              audio.src = MUSIC_LIST[currentIndex].url;
              audio.load();
              audio.addEventListener('loadedmetadata', function () {
                try { audio.currentTime = Math.min(pos, (audio.duration || pos)); } catch (e) {}
                updateProgressUI(); updateMainUI();
              }, { once: true });
            }
            updateDiscStyle(); updateNowPlaying(); renderList();
            saveLocal();
          }
        })
        .catch(function () { accountReady = true; });
    } catch (e) { /* ignore */ }
  }

  /* ----------------------------------------------------------------
   * 单端登录：心跳 + 顶号通知
   * ---------------------------------------------------------------- */
  function sessionCheck() {
    fetch('/api/session/check', { method: 'GET', credentials: 'include' })
      .then(function (r) {
        if (r.ok) { isLoggedIn = true; return; }
        return r.json().then(function (body) {
          if (body && body.kicked) {
            isLoggedIn = false;
            stopSessionGuard();
            showKick();
          } else {
            isLoggedIn = false;
            stopSessionGuard();
          }
        }).catch(function () { isLoggedIn = false; });
      })
      .catch(function () { /* 网络错误不处理 */ });
  }
  function startSessionGuard() {
    stopSessionGuard();
    // 先探一次，确认确实登录才轮询；登录成功后顺带同步账号播放进度
    fetch('/api/session/check', { method: 'GET', credentials: 'include' })
      .then(function (r) {
        if (r.ok) {
          isLoggedIn = true;
          syncAccount();
          sessionTimer = setInterval(sessionCheck, SESSION_CHECK_MS);
        } else {
          isLoggedIn = false;
          accountReady = true;   // 未登录：视为无账号进度可同步
        }
      })
      .catch(function () { isLoggedIn = false; accountReady = true; });
  }
  function stopSessionGuard() {
    if (sessionTimer) { clearInterval(sessionTimer); sessionTimer = null; }
  }
  function showKick() {
    if (els.kick) { els.kick.hidden = false; document.body.style.overflow = 'hidden'; }
  }

  /* ----------------------------------------------------------------
   * 初始化
   * ---------------------------------------------------------------- */
  function init() {
    var local = loadLocal();
    ensureDOM();
    bind();

    // 还原音量 / 模式 UI
    if (audio) audio.volume = volume;
    if (els.volBar) els.volBar.value = Math.round(volume * 100);
    if (els.volVal) els.volVal.textContent = Math.round(volume * 100) + '%';
    if (els.volIcon) els.volIcon.textContent = (volume === 0) ? '🔇' : '🔊';
    setModeUI();
    if (els.playBtn) els.playBtn.innerHTML = ICON.play;

    // 还原曲目（不自动播放，等确认/续播决定）；恢复跨页断点位置
    if (currentIndex >= 0 && audio) {
      audio.src = MUSIC_LIST[currentIndex].url;
      audio.load();
      updateDiscStyle(); updateNowPlaying(); renderList();
      if (local && Number(local.currentTime) > 0) {
        var resumeAt = Number(local.currentTime) || 0;
        audio.addEventListener('loadedmetadata', function () {
          try { audio.currentTime = Math.min(resumeAt, (audio.duration || resumeAt)); } catch (e) {}
          updateProgressUI(); updateMainUI();
        }, { once: true });
      }
      if (audio.duration) updateProgressUI();
    } else {
      updateNowPlaying(); renderList();
    }

    // 单端登录守护
    startSessionGuard();

    // gate → 主站才弹「是否播放」
    var fromGate = /gate\.html/.test(document.referrer) || /[?&]from=gate/.test(location.search);
    var confirmed = false;
    try { confirmed = sessionStorage.getItem('zelm_musicConfirmed') === '1'; } catch (e) {}
    if (fromGate && !confirmed) {
      showConfirm();
    } else if (local && local.playing) {
      // 跨页续播：从断点继续（浏览器可能拦截，已做手势兜底）
      play();
    }

    // 登录事件（由 auth-panel 触发）：同步账号进度并重启守护
    document.addEventListener('zelm:login', function () {
      syncAccount();
      startSessionGuard();
    });
    document.addEventListener('zelm:logout', function () {
      stopSessionGuard();
      isLoggedIn = false;
    });
  }

  // 对外暴露（由各页面显式调用 ZelmMusic.init()，避免重复初始化）
  window.ZelmMusic = {
    init: init,
    onLogin: function () { syncAccount(); startSessionGuard(); },
    onLogout: function () { stopSessionGuard(); isLoggedIn = false; }
  };
})();
