/* 欢迎页面 —— 独立脚本，不依赖主脚本。
 * 单击"进入网站"按钮即进入站点，按钮带 WebGL 高光描边特效。 */
(function () {
  'use strict';
  var gate = document.getElementById('gate');
  var btn = document.getElementById('captchaTrack');
  if (!gate || !btn) return;

  var verified = false;

  function pass() {
    if (verified || gate.hidden) return;
    verified = true;
    // 直接进入主站：不再播放离场动画（曾有用户反馈动画会导致页面卡住）
    window.location.href = 'index.html';
  }

  btn.addEventListener('click', pass);
  btn.addEventListener('keydown', function (e) {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); pass(); }
  });

  // ===== 头像点击查看大图 =====
  var avatarEl = document.getElementById('warpAvatar');
  var avatarViewer = document.getElementById('avatarViewer');
  var avatarViewerClose = document.getElementById('avatarViewerClose');
  var avatarViewerOverlay = avatarViewer ? avatarViewer.querySelector('.avatar-viewer-overlay') : null;

  function openAvatarViewer() {
    if (!avatarViewer) return;
    avatarViewer.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeAvatarViewer() {
    if (!avatarViewer) return;
    avatarViewer.hidden = true;
    document.body.style.overflow = '';
  }

  if (avatarEl) {
    avatarEl.addEventListener('click', function (e) {
      e.stopPropagation();
      openAvatarViewer();
    });
  }
  if (avatarViewerClose) {
    avatarViewerClose.addEventListener('click', closeAvatarViewer);
  }
  if (avatarViewerOverlay) {
    avatarViewerOverlay.addEventListener('click', closeAvatarViewer);
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && avatarViewer && !avatarViewer.hidden) {
      closeAvatarViewer();
    }
  });

  // ===== 欢迎页语言+主题切换 =====
  var gateLangSeg = document.getElementById('gateLangSeg');
  var gateThemeSeg = document.getElementById('gateThemeSeg');

  // 读取设置（与主脚本共用 localStorage key）
  function getSettings() {
    try {
      return JSON.parse(localStorage.getItem('zelm_settings') || '{}');
    } catch (e) {
      return {};
    }
  }
  function saveSettings(patch) {
    var s = getSettings();
    Object.keys(patch).forEach(function (k) { s[k] = patch[k]; });
    try { localStorage.setItem('zelm_settings', JSON.stringify(s)); } catch (e) { /* 忽略 */ }
    return s;
  }

  // 应用主题
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (gateThemeSeg) {
      gateThemeSeg.querySelectorAll('.gate-theme-btn').forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.theme === theme);
      });
    }
  }

  // 应用语言（更新 gate 中的文本）
  function applyGateLang(lang) {
    if (gateLangSeg) {
      gateLangSeg.querySelectorAll('.gate-lang-btn').forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.lang === lang);
      });
    }
    // 更新按钮文本
    var btnCn = document.querySelector('.gate-btn-cn');
    var btnEn = document.querySelector('.gate-btn-en');
    var slogan = document.querySelector('.gate-slogan');
    var hint = document.querySelector('.gate-hint');
    if (lang === 'zh' || lang === 'zh-TW') {
      if (btnCn) btnCn.style.display = '';
      if (btnEn) btnEn.style.display = 'none';
      if (slogan) slogan.textContent = lang === 'zh-TW' ? '探索 · 發現 · 創造' : '探索 · 发现 · 创造';
      if (hint) hint.textContent = lang === 'zh-TW' ? '訪客可直接進入 · 登錄後右上角顯示賬號' : '游客可直接进入 · 登录后右上角显示账号';
    } else {
      if (btnCn) btnCn.style.display = 'none';
      if (btnEn) btnEn.style.display = '';
      if (slogan) slogan.textContent = 'Explore · Discover · Create';
      if (hint) hint.textContent = 'Guests welcome · Sign in to show your account';
    }
  }

  // 初始化：读取已保存的设置
  var savedSettings = getSettings();
  var currentLang = savedSettings.lang || 'zh';
  var currentTheme = savedSettings.theme === 'light' ? 'light' : 'dark'; // 归一化：非法值（含旧 system）一律深色
  applyTheme(currentTheme);
  applyGateLang(currentLang);

  // 语言切换
  if (gateLangSeg) {
    gateLangSeg.querySelectorAll('.gate-lang-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentLang = btn.dataset.lang;
        saveSettings({ lang: currentLang });
        applyGateLang(currentLang);
        // 同步更新主页面 settings 并触发语言切换
        if (typeof settings !== 'undefined') {
          settings.lang = currentLang;
          if (typeof applyLang === 'function') applyLang();
        }
      });
    });
  }

  // 主题切换
  if (gateThemeSeg) {
    gateThemeSeg.querySelectorAll('.gate-theme-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentTheme = btn.dataset.theme;
        saveSettings({ theme: currentTheme });
        applyTheme(currentTheme);
        // 同步更新主页面 settings 并触发主题切换
        if (typeof settings !== 'undefined') {
          settings.theme = currentTheme;
          if (typeof applySettings === 'function') applySettings();
        }
      });
    });
  }

  // 跨标签页同步：其他页面（主站设置/管理台）改了语言/主题，欢迎页实时跟随
  window.addEventListener('storage', function (e) {
    if (e.key !== 'zelm_settings' || !e.newValue) return;
    var s;
    try { s = JSON.parse(e.newValue); } catch (err) { return; }
    var nl = s.lang || 'zh';
    var nt = s.theme === 'light' ? 'light' : 'dark';
    if (nl !== currentLang) { currentLang = nl; applyGateLang(currentLang); }
    if (nt !== currentTheme) { currentTheme = nt; applyTheme(currentTheme); }
  });

  // ===== WarpImage 头像扭曲 =====
  var warpAvatarEl = document.getElementById('warpAvatar');
  if (warpAvatarEl && typeof WarpImage !== 'undefined') {
    WarpImage(warpAvatarEl, {
      src: 'assets/avatar.jpg',
      fit: 'cover',
      warpStrength: 0.06,
      warpScale: 1.5,
      speed: 0.45,
      pointerInfluence: 0.5,
      pointerStrength: 0.45,
      refraction: 0.02,
      ripple: true
    });
  }

  // ===== WarpText 品牌名扭曲 =====
  var warpBrandEl = document.getElementById('warpBrand');
  if (warpBrandEl && typeof WarpText !== 'undefined') {
    WarpText(warpBrandEl, {
      text: '◉ Zelm',
      color: '#4ff0d0',
      warpStrength: 0.05,
      warpScale: 1.4,
      speed: 0.4,
      pointerInfluence: 0.55,
      pointerStrength: 0.4,
      refraction: 0.015,
      ripple: true,
      fontSize: '18px',
      fontWeight: 700,
      fontFamily: 'inherit',
      letterSpacing: '1px',
      lineHeight: 1
    });
  }

  // ===== 粒子文字标题 =====
  var particleContainer = document.getElementById('particleTitle');
  if (particleContainer && typeof ParticleText !== 'undefined') {
    // 手机端（或窄屏）显示中文标题，电脑端保持英文
    var htmlEl = document.documentElement;
    var isMobileView =
      htmlEl.classList.contains('is-mobile') ||
      (window.matchMedia && window.matchMedia('(max-width: 640px)').matches);
    var titleText = isMobileView ? '欢迎来到Zelm的世界' : "Welcome to Zelm's World";
    particleContainer.setAttribute('aria-label', titleText);
    ParticleText(particleContainer, {
      text: titleText,
      particleSize: 2.5,
      density: 3,
      color: '#ffffff',
      highlightColor: '#4ff0d0',
      scatter: 180,
      gatherDuration: 1600,
      stagger: 420,
      pointerRepel: 40,
      repelRadius: 120,
      idleDrift: 0.7,
      trigger: 'mount',
      fontSize: 'clamp(4rem, 16vw, 6.8rem)',
      fontWeight: 800,
      fontFamily: 'inherit',
      glow: true
    });
  }

  // ===== WebGL 高光描边特效 =====
  function hasWebGL2() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
    } catch (e) { return false; }
  }
  if (typeof ogl === 'undefined' || !hasWebGL2()) return; // 无 ogl 或无 WebGL2 时跳过特效
  var canvas = btn.querySelector('.specular-fx');
  if (!canvas) return;

  var dpr = window.devicePixelRatio || 1;
  var renderer;
  try {
    renderer = new ogl.Renderer({ alpha: true, premultipliedAlpha: true, antialias: true, dpr: dpr });
  } catch (e) {
    console.warn('Gate WebGL 初始化失败，已降级显示', e);
    return;
  }

  var PAD = 20;
  var VERT = '#version 300 es\nin vec2 position;\nvoid main() {\n  gl_Position = vec4(position, 0.0, 1.0);\n}\n';
  var FRAG = '#version 300 es\nprecision highp float;\nuniform vec2 uCenter;\nuniform vec2 uHalfSize;\nuniform float uRadius;\nuniform float uAngle;\nuniform float uPx;\nuniform vec3 uLineColor;\nuniform vec3 uBaseColor;\nuniform float uIntensity;\nuniform float uShineSize;\nuniform float uShineFade;\nuniform float uThickness;\nuniform float uBaseWidth;\nout vec4 fragColor;\nfloat sdRoundedRect(vec2 p, vec2 b, float r) {\n  vec2 q = abs(p) - b + r;\n  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;\n}\nfloat shapeSDF(vec2 p) { return sdRoundedRect(p, uHalfSize, uRadius); }\nfloat gaussianLine(float d, float sigma) {\n  float x = d / (sigma + 1e-6);\n  float k = mix(1.0, 1.6, smoothstep(0.0, 1.5, x));\n  return exp(-k * x * x);\n}\nvoid main() {\n  vec2 p = gl_FragCoord.xy - uCenter;\n  float d = shapeSDF(p);\n  vec2 L = vec2(cos(uAngle), sin(uAngle));\n  float base = (1.0 - smoothstep(0.0, uBaseWidth, abs(d))) * 0.45;\n  vec2 nEll = normalize(p / (uHalfSize * uHalfSize) + 1e-6);\n  float phi = acos(clamp(abs(dot(nEll, L)), 0.0, 1.0));\n  float rim = 1.0 - smoothstep(uShineSize - uShineFade, uShineSize + uShineFade + 1e-4, phi);\n  float line = gaussianLine(d, uThickness);\n  float edgeClamp = 1.0 - smoothstep(0.5 * uPx, 3.0 * uPx, abs(d));\n  float hi = line * rim * edgeClamp * uIntensity;\n  vec3 col = uBaseColor * base + uLineColor * hi;\n  float a = clamp(base + hi, 0.0, 1.0);\n  fragColor = vec4(col, a);\n}\n';

  var params = {
    radius: 26,
    lineColor: '#4ff0d0',
    baseColor: '#4ff0d0',
    intensity: 1.3,
    shineSize: 12,
    shineFade: 45,
    thickness: 1.2,
    speed: 0.4,
    followMouse: true,
    proximity: 300,
    autoAnimate: false
  };

  var gl = renderer.gl;
  gl.clearColor(0, 0, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  var geometry = new ogl.Triangle(gl);
  if (geometry.attributes.uv) delete geometry.attributes.uv;

  var program = new ogl.Program(gl, {
    vertex: VERT,
    fragment: FRAG,
    uniforms: {
      uCenter: { value: [0, 0] },
      uHalfSize: { value: [1, 1] },
      uRadius: { value: 0 },
      uAngle: { value: 2.4 },
      uPx: { value: dpr },
      uLineColor: { value: [1, 1, 1] },
      uBaseColor: { value: [0.32, 0.32, 0.32] },
      uIntensity: { value: 1 },
      uShineSize: { value: 0.17 },
      uShineFade: { value: 0.7 },
      uThickness: { value: 1 },
      uBaseWidth: { value: dpr }
    }
  });

  var mesh = new ogl.Mesh(gl, { geometry: geometry, program: program });
  canvas.appendChild(gl.canvas);
  gl.canvas.style.width = '100%';
  gl.canvas.style.height = '100%';
  gl.canvas.style.display = 'block';

  var sizeRef = { w: 1, h: 1 };
  function resize() {
    var rect = btn.getBoundingClientRect();
    var w = rect.width, h = rect.height;
    sizeRef.w = w; sizeRef.h = h;
    renderer.setSize(w + PAD * 2, h + PAD * 2);
    program.uniforms.uCenter.value = [(PAD + w / 2) * dpr, (PAD + h / 2) * dpr];
    program.uniforms.uHalfSize.value = [(w / 2) * dpr, (h / 2) * dpr];
  }
  var ro = new ResizeObserver(resize);
  ro.observe(btn);
  resize();

  var pointerAngle = null;
  var proximityT = 0;
  function onPointerMove(e) {
    var rect = btn.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var dx = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right);
    var dy = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
    var dist = Math.hypot(dx, dy);
    if (dist === 0) {
      var nx = (e.clientX - cx) / (rect.width / 2);
      var ny = (cy - e.clientY) / (rect.height / 2);
      pointerAngle = Math.atan2(2 / rect.height, -2 / rect.width) + nx * 0.3 + ny * 0.15;
    } else {
      pointerAngle = Math.atan2(cy - e.clientY, e.clientX - cx);
    }
    var t = Math.max(0, 1 - dist / Math.max(params.proximity, 1));
    proximityT = t * t * (3 - 2 * t);
  }
  window.addEventListener('pointermove', onPointerMove);

  var angle = 2.4, idleAngle = 2.4, bright = 0;
  var last = performance.now();
  var lineC = new ogl.Color(), baseC = new ogl.Color();

  function hexToRgb(hex) {
    var r = parseInt(hex.slice(1, 3), 16) / 255;
    var g = parseInt(hex.slice(3, 5), 16) / 255;
    var b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b];
  }
  var lineRgb = hexToRgb(params.lineColor);
  var baseRgb = hexToRgb(params.baseColor);

  function update(now) {
    requestAnimationFrame(update);
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    idleAngle += params.speed * dt;
    var steer = params.followMouse && pointerAngle != null && (!params.autoAnimate || proximityT > 0);
    var target = steer ? pointerAngle : idleAngle;
    var diff = ((target - angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    angle += diff * (1 - Math.exp(-dt * 7));
    var brightTarget = params.autoAnimate ? 1 : proximityT;
    bright += (brightTarget - bright) * (1 - Math.exp(-dt * 8));

    program.uniforms.uAngle.value = angle;
    program.uniforms.uRadius.value = Math.min(params.radius, Math.min(sizeRef.w, sizeRef.h) / 2) * dpr;
    program.uniforms.uLineColor.value = lineRgb;
    program.uniforms.uBaseColor.value = baseRgb;
    program.uniforms.uIntensity.value = params.intensity * bright;
    program.uniforms.uShineSize.value = (params.shineSize * Math.PI) / 180;
    program.uniforms.uShineFade.value = (params.shineFade * Math.PI) / 180;
    program.uniforms.uThickness.value = params.thickness * dpr;
    renderer.render({ scene: mesh });
  }
  requestAnimationFrame(update);
})();
