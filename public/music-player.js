/* ============================================================================
 * music-player.js —— 外壳常驻背景音乐播放器（配合 index.html 外壳 + iframe）
 * 特性：
 *  - 音频元素常驻外壳页面，iframe 切换内容页时音乐【零中断】
 *  - 曲目 / 音量 / 播放模式 本地记忆（zelm_music_v1）
 *  - 播放进度仅存本地 localStorage（跨页续播），不做账号云端持久化（避免登录时覆盖/打断播放）
 *  - 主题化播放/暂停/上一首/下一首/模式 SVG 图标
 *  - 三种播放模式：顺序(默认) / 循环 / 随机
 *  - 单端登录：轮询 /api/session/check，被顶号时弹出通知并下线
 * ========================================================================== */
(function () {
  'use strict';

  var STORAGE_KEY = 'zelm_music_v1';
  var SESSION_CHECK_MS = 15000;      // 单端登录心跳间隔

  var MUSIC_LIST = [
    { name: 'Always Online', artist: '林俊杰',           url: 'assets/music/林俊杰 - Always Online.mp3', discBg: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)' },
    { name: '爱错',          artist: '王力宏',           url: 'assets/music/王力宏 - 爱错.mp3',                 discBg: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)' },
    { name: '爱我还是他',    artist: '陶喆',             url: 'assets/music/陶喆 - 爱我还是他.mp3',             discBg: 'linear-gradient(135deg, #f953c6 0%, #b91d73 100%)' },
    { name: '背对背拥抱',    artist: '林俊杰',           url: 'assets/music/林俊杰 - 背对背拥抱.mp3',           discBg: 'linear-gradient(135deg, #5ee7df 0%, #b490ca 100%)' },
    { name: '不将就',        artist: '李荣浩',           url: 'assets/music/李荣浩 - 不将就.mp3',               discBg: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)' },
    { name: '当你',          artist: '林俊杰',           url: 'assets/music/林俊杰 - 当你.mp3',                 discBg: 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)' },
    { name: '江南',          artist: '林俊杰',           url: 'assets/music/林俊杰 - 江南.mp3',                 discBg: 'linear-gradient(135deg, #43cea2 0%, #185a9d 100%)' },
    { name: '开始懂了',      artist: '孙燕姿',           url: 'assets/music/孙燕姿 - 开始懂了.mp3',             discBg: 'linear-gradient(135deg, #fddb92 0%, #d1fdff 100%)' },
    { name: '美人鱼',        artist: '林俊杰',           url: 'assets/music/林俊杰 - 美人鱼.mp3',               discBg: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
    { name: '模特',          artist: '李荣浩',           url: 'assets/music/李荣浩 - 模特.mp3',                 discBg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
    { name: '普通朋友',      artist: '陶喆',             url: 'assets/music/陶喆 - 普通朋友.mp3',               discBg: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)' },
    { name: '其实',          artist: '薛之谦',           url: 'assets/music/薛之谦 - 其实.mp3',                 discBg: 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)' },
    { name: '手牵手',        artist: '王力宏,陶喆,蔡琴', url: 'assets/music/王力宏,陶喆,蔡琴 - 手牵手.mp3',      discBg: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' },
    { name: '手写的从前',    artist: '赵乃吉',           url: 'assets/music/赵乃吉 - 手写的从前.mp3',           discBg: 'linear-gradient(135deg, #a8e063 0%, #56ab2f 100%)' },
    { name: '听雨的声音',    artist: '瑞恩船长,雪球',    url: 'assets/music/瑞恩船长,雪球 - 听雨的声音.mp3',    discBg: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
    { name: '唯一',          artist: '邓紫棋',           url: 'assets/music/邓紫棋 - 唯一.mp3',                 discBg: 'linear-gradient(135deg, #c471f5 0%, #fa71cd 100%)' },
    { name: '我怀念的',      artist: '孙燕姿',           url: 'assets/music/孙燕姿 - 我怀念的.mp3',             discBg: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)' },
    { name: '我们的歌',      artist: '王力宏',           url: 'assets/music/王力宏 - 我们的歌.mp3',             discBg: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)' },
    { name: '演员',          artist: '薛之谦',           url: 'assets/music/薛之谦 - 演员.mp3',                 discBg: 'linear-gradient(135deg, #30e8bf 0%, #ff8235 100%)' },
    { name: '勇气',          artist: '梁静茹',           url: 'assets/music/梁静茹 - 勇气.mp3',                 discBg: 'linear-gradient(135deg, #ff9966 0%, #ff5e62 100%)' }
  ];

  var MODES = ['order', 'loop', 'shuffle'];

  // 主题化图标（currentColor 跟随站点主题）
  var ICON = {
    play:    '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.4-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14z"/></svg>',
    pause:   '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z"/></svg>',
    prev:    '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M7 6a1 1 0 0 1 2 0v12a1 1 0 0 1-2 0V6zM20 6.2v11.6a1 1 0 0 1-1.54.84L9.3 12l9.16-6.64A1 1 0 0 1 20 6.2z"/></svg>',
    next:    '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M17 6a1 1 0 0 0-2 0v12a1 1 0 0 0 2 0V6zM4 6.2v11.6a1 1 0 0 0 1.54.84L14.7 12 5.54 5.36A1 1 0 0 0 4 6.2z"/></svg>',
    order:   '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M3 5h18v2H3zM3 11h18v2H3zM3 17h12v2H3z"/></svg>',
    loop:    '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>'
  };

  // 播放器文案（随站点语言切换）
  var PLAYER_STR = {
    zh: {
      notPlaying: '未播放', playlist: '音乐列表', prev: '上一首', play: '播放', pause: '暂停', next: '下一首',
      mode: '播放模式', modeOrder: '顺序', modeLoop: '循环', modeShuffle: '随机',
      kickTitle: '账号已在其他设备登录', kickDesc: '您的账号已在另一台设备登录，您已被下线。', kickOk: '我知道了',
      resumeHint: '点击任意处恢复播放'
    },
    en: {
      notPlaying: 'Not playing', playlist: 'Playlist', prev: 'Previous', play: 'Play', pause: 'Pause', next: 'Next',
      mode: 'Playback mode', modeOrder: 'Order', modeLoop: 'Loop', modeShuffle: 'Shuffle',
      kickTitle: 'Account signed in elsewhere', kickDesc: 'Your account was signed in on another device. You have been signed out.', kickOk: 'Got it',
      resumeHint: 'Click anywhere to resume'
    }
  };
  var plang = 'zh';
  function pstr(key) { return (PLAYER_STR[plang] || PLAYER_STR.zh)[key] || key; }
  function modeLabel() { return pstr('mode' + mode.charAt(0).toUpperCase() + mode.slice(1)); }

  // ---- 运行时状态 ----
  var audio = null;
  var els = {};
  var currentIndex = -1;
  var isPlaying = false;
  var mode = 'order';
  var volume = 0.7;
  var isLoggedIn = false;
  var pendingResume = false;
  var sessionTimer = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) return '0:00';
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function randInt(n) { return Math.floor(Math.random() * n); }

  /* ---------------- 持久化（曲目/音量/模式；audio 常驻无需断点） ---------------- */
  function loadLocal() {
    try {
      var s = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (s && typeof s === 'object') {
        currentIndex = (typeof s.trackIndex === 'number') ? s.trackIndex : -1;
        if (currentIndex < 0 || currentIndex >= MUSIC_LIST.length) currentIndex = -1;
        mode = (MODES.indexOf(s.mode) >= 0) ? s.mode : 'order';
        volume = (typeof s.volume === 'number') ? s.volume : 0.7;
        if (volume < 0) volume = 0; if (volume > 1) volume = 1;
      }
    } catch (e) { /* ignore */ }
  }
  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        trackIndex: currentIndex,
        mode: mode,
        volume: volume
      }));
    } catch (e) { /* ignore */ }
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    els = {
      player: $('musicPlayer'),
      disc: $('disc'),
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
      buffered: $('musicBuffered'),
      curTime: $('musicCurTime'),
      durTime: $('musicDurTime'),
      mainBuffered: $('musicMainBuffered'),
      volIcon: $('musicVolumeIcon'),
      volBar: $('musicVolumeBar'),
      volVal: $('musicVolumeVal'),
      list: $('musicList'),
      kick: $('sessionKickModal'),
      kickOk: $('sessionKickOk'),
      hint: $('musicResumeHint')
    };

    if (els.playBtn) els.playBtn.addEventListener('click', togglePlay);
    if (els.prevBtn) { els.prevBtn.innerHTML = ICON.prev; els.prevBtn.addEventListener('click', goPrev); }
    if (els.nextBtn) { els.nextBtn.innerHTML = ICON.next; els.nextBtn.addEventListener('click', function () { goNext(false); }); }
    if (els.modeBtn) els.modeBtn.addEventListener('click', function (e) { e.stopPropagation(); cycleMode(); });
    if (els.player) els.player.addEventListener('click', function (e) {
      if (e.target.closest('#musicPopup')) return;
      openPopup();
    });
    if (els.popupClose) els.popupClose.addEventListener('click', closePopup);
    if (els.kickOk) els.kickOk.addEventListener('click', function () {
      if (els.kick) els.kick.hidden = true;
      window.location.reload();
    });
    if (els.hint) els.hint.addEventListener('click', resumeOnGesture);

    // 跳转播放进度：duration 就绪直接 seek；未就绪（未播放/未加载时 duration 为 NaN）先确保音源挂载，
    // 然后轮询等待元数据就绪再 seek——不依赖 loadedmetadata 事件时序，第一次点击即可生效
    function seekTo(frac) {
      if (!audio) return;
      var dur = audio.duration;
      if (dur && isFinite(dur) && dur > 0) {
        audio.currentTime = Math.max(0, Math.min(dur, frac * dur));
        updateProgressUI();
        updateMainUI();
        return;
      }
      // duration 未就绪：无音源则挂载当前曲目，有音源则 load() 触发元数据加载
      if (currentIndex >= 0 && !audio.currentSrc) {
        audio.src = MUSIC_LIST[currentIndex].url;
      }
      try { audio.load(); } catch (e) { /* 忽略 */ }
      waitSeek(frac, 0);
    }
    function waitSeek(frac, tries) {
      if (tries > 160) return;                 // 最多等待约 8s，超时放弃
      var dur = audio.duration;
      if (dur && isFinite(dur) && dur > 0) {
        audio.currentTime = Math.max(0, Math.min(dur, frac * dur));
        updateProgressUI();
        updateMainUI();
        return;
      }
      setTimeout(function () { waitSeek(frac, tries + 1); }, 50);
    }

    // 进度条拖动 / 点击轨道（弹窗内 range）
    if (els.progress) {
      var onProgressInput = function () { seekTo(Number(els.progress.value) / 100); };
      els.progress.addEventListener('input', onProgressInput);
      els.progress.addEventListener('change', onProgressInput);   // 点击轨道落点也生效
    }
    // 迷你进度条（点击跳转）
    if (els.mainBar) els.mainBar.addEventListener('click', function (e) {
      var r = els.mainBar.getBoundingClientRect();
      if (!r.width) return;
      seekTo((e.clientX - r.left) / r.width);
    });
    // 音量
    if (els.volBar) els.volBar.addEventListener('input', function () {
      volume = Number(els.volBar.value) / 100;
      if (audio) audio.volume = volume;
      updateVolumeUI();
      saveLocal();
    });
    if (els.volIcon) els.volIcon.addEventListener('click', function () {
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
      if (!e.target || e.target.isConnected === false) return;
      if (els.popup && !els.popup.hidden &&
          !els.popup.contains(e.target) && els.player && !els.player.contains(e.target)) {
        closePopup();
      }
    });

    // 音频事件
    if (audio) {
      audio.addEventListener('loadedmetadata', function () { updateProgressUI(); updateMainUI(); updateBuffered(); });
      audio.addEventListener('timeupdate', onTimeUpdate);
      audio.addEventListener('progress', updateBuffered);
      audio.addEventListener('play', function () { isPlaying = true; reflectPlayState(); saveLocal(); });
      audio.addEventListener('pause', function () { isPlaying = false; reflectPlayState(); });
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('error', function () { /* 加载失败静默 */ });
    }
  }

  /* ---------------- 播放控制 ---------------- */
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
      p.then(function () { pendingResume = false; hideResumeHint(); })
       .catch(function () {
          // 浏览器拦截自动播放：等用户首次交互再续播，并给出提示
          pendingResume = true;
          showResumeHint();
          document.addEventListener('pointerdown', resumeOnGesture, { once: true });
          document.addEventListener('keydown', resumeOnGesture, { once: true });
        });
    }
  }
  function pause() { if (audio) audio.pause(); }
  function togglePlay() {
    if (isPlaying) pause();
    else { if (currentIndex < 0) selectTrack(0, false); play(); }
  }
  function showResumeHint() { if (els.hint) { els.hint.innerHTML = '<span class="music-resume-dot"></span>' + pstr('resumeHint'); els.hint.hidden = false; } }
  function hideResumeHint() { if (els.hint) els.hint.hidden = true; }
  function resumeOnGesture() {
    hideResumeHint();
    if (pendingResume) { pendingResume = false; play(); }
  }
  function nextIndex(auto) {
    var n = MUSIC_LIST.length;
    if (mode === 'shuffle') {
      if (n <= 1) return 0;
      var r; do { r = randInt(n); } while (r === currentIndex);
      return r;
    }
    if (auto && mode === 'order' && currentIndex >= n - 1) return -1;
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
    if (currentIndex >= MUSIC_LIST.length - 1) { pause(); isPlaying = false; reflectPlayState(); }
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
      els.modeBtn.title = pstr('mode') + '：' + modeLabel();
    }
  }

  /* ---------------- UI 刷新 ---------------- */
  function reflectPlayState() {
    if (els.playBtn) els.playBtn.innerHTML = isPlaying ? ICON.pause : ICON.play;
    if (els.disc) els.disc.classList.toggle('playing', isPlaying);
    if (els.npDisc) els.npDisc.classList.toggle('playing', isPlaying);
    if (els.player) els.player.classList.toggle('playing', isPlaying);
  }
  function updateDiscStyle() {
    if (currentIndex < 0) return;
    var bg = MUSIC_LIST[currentIndex].discBg;
    if (els.disc) { els.disc.style.background = bg; }
    if (els.npDisc) { els.npDisc.style.background = bg; }
  }
  function updateNowPlaying() {
    var m = (currentIndex >= 0) ? MUSIC_LIST[currentIndex] : null;
    var title = m ? m.name : pstr('notPlaying');
    var artist = m ? m.artist : '-';
    if (els.mainTitle) els.mainTitle.textContent = title;
    if (els.mainArtist) els.mainArtist.textContent = artist;
    if (els.npTitle) els.npTitle.textContent = title;
    if (els.npArtist) els.npArtist.textContent = artist;
  }
  function updateMainUI() {
    if (!audio) return;
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
  /* 加载（缓冲）进度条：显示音频已缓冲到哪，浅色层叠在播放进度之下 */
  function updateBuffered() {
    var elA = els.mainBuffered, elB = els.buffered;
    if (!elA && !elB) return;
    if (!audio || !audio.duration || !audio.buffered || !audio.buffered.length) {
      if (elA) elA.style.width = '0%';
      if (elB) elB.style.width = '0%';
      return;
    }
    var pct = 0;
    try {
      pct = Math.min(100, (audio.buffered.end(audio.buffered.length - 1) / audio.duration) * 100);
    } catch (e) { /* 忽略 */ }
    if (elA) elA.style.width = pct + '%';
    if (elB) elB.style.width = pct + '%';
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
  }

  /* ---------------- 弹窗开合 ---------------- */
  function openPopup() { if (els.popup) { els.popup.hidden = false; renderList(); updateNowPlaying(); } }
  function closePopup() { if (els.popup) els.popup.hidden = true; }

  /* ---------------- 语言切换 ---------------- */
  function applyLang() {
    try {
      var s = JSON.parse(localStorage.getItem('zelm_settings') || '{}');
      plang = (s.lang === 'en') ? 'en' : 'zh';
    } catch (e) { plang = 'zh'; }
    if (currentIndex < 0) {
      if (els.mainTitle) els.mainTitle.textContent = pstr('notPlaying');
      if (els.npTitle) els.npTitle.textContent = pstr('notPlaying');
    }
    if (els.popup) {
      var head = els.popup.querySelector('.music-popup-head span');
      if (head) head.textContent = pstr('playlist');
    }
    if (els.prevBtn) els.prevBtn.title = pstr('prev');
    if (els.nextBtn) els.nextBtn.title = pstr('next');
    if (els.playBtn) els.playBtn.title = isPlaying ? pstr('pause') : pstr('play');
    setModeUI();
    if (els.kick) {
      var kt = els.kick.querySelector('.session-kick-title');
      var kd = els.kick.querySelector('.session-kick-desc');
      var ko = els.kick.querySelector('#sessionKickOk');
      if (kt) kt.textContent = pstr('kickTitle');
      if (kd) kd.textContent = pstr('kickDesc');
      if (ko) ko.textContent = pstr('kickOk');
    }
  }

  /* ---------------- 单端登录：心跳 + 顶号通知 ---------------- */
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
    fetch('/api/session/check', { method: 'GET', credentials: 'include' })
      .then(function (r) {
        if (r.ok) {
          isLoggedIn = true;
          sessionTimer = setInterval(sessionCheck, SESSION_CHECK_MS);
        } else {
          isLoggedIn = false;
        }
      })
      .catch(function () { isLoggedIn = false; });
  }
  function stopSessionGuard() {
    if (sessionTimer) { clearInterval(sessionTimer); sessionTimer = null; }
  }
  function showKick() {
    if (els.kick) { els.kick.hidden = false; document.body.style.overflow = 'hidden'; }
  }

  /* ---------------- 初始化（由外壳 shell.js 调用） ---------------- */
  function init() {
    loadLocal();
    audio = $('bgAudio');
    bind();

    // 还原音量 / 模式 / 曲目
    if (audio) audio.volume = volume;
    updateVolumeUI();
    setModeUI();
    if (els.playBtn) els.playBtn.innerHTML = ICON.play;
    if (currentIndex >= 0 && audio) {
      audio.src = MUSIC_LIST[currentIndex].url;
      audio.load();
      updateDiscStyle(); updateNowPlaying(); renderList();
    } else {
      updateNowPlaying(); renderList();
    }

    // 单端登录守护
    startSessionGuard();

    // 语言切换
    document.addEventListener('zelm:lang', function () { applyLang(); });
    applyLang();
  }

  // 对外暴露（由外壳 shell.js 显式调用 init()）
  window.ZelmMusic = {
    init: init,
    setVolume: function (v) {
      volume = Math.max(0, Math.min(1, Number(v) || 0));
      if (audio) audio.volume = volume;
      updateVolumeUI();
      saveLocal();
    }
  };
})();
