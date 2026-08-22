/* WarpText / WarpImage —— 原生 JavaScript 实现
 * WebGL 扭曲折射特效：环境噪声扭曲 + 鼠标透镜放大 + 涟漪波纹 + RGB 色差
 * 基于 React WarpText 组件改写，依赖 ogl 库。支持文字和图片两种模式。 */
(function (global) {
  'use strict';

  var vertex = '#version 300 es\nin vec2 position;\nin vec2 uv;\nout vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = vec4(position, 0.0, 1.0);\n}\n';

  var fragment = '#version 300 es\nprecision highp float;\nuniform sampler2D uTextTexture;\nuniform vec2 uResolution;\nuniform vec2 uPointer;\nuniform float uPointerActive;\nuniform float uTime;\nuniform float uWarpStrength;\nuniform float uWarpScale;\nuniform float uSpeed;\nuniform float uPointerInfluence;\nuniform float uPointerStrength;\nuniform float uRefraction;\nuniform float uRipple;\nuniform float uMotion;\nin vec2 vUv;\nout vec4 fragColor;\nfloat hash(vec2 p) {\n  p = fract(p * vec2(123.34, 456.21));\n  p += dot(p, p + 45.32);\n  return fract(p.x * p.y);\n}\nfloat noise(vec2 p) {\n  vec2 i = floor(p);\n  vec2 f = fract(p);\n  vec2 u = f * f * (3.0 - 2.0 * f);\n  float a = hash(i);\n  float b = hash(i + vec2(1.0, 0.0));\n  float c = hash(i + vec2(0.0, 1.0));\n  float d = hash(i + vec2(1.0, 1.0));\n  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);\n}\nfloat fbm(vec2 p) {\n  float value = 0.0;\n  float amplitude = 0.5;\n  for (int i = 0; i < 4; i++) {\n    value += amplitude * noise(p);\n    p *= 2.02;\n    amplitude *= 0.5;\n  }\n  return value;\n}\nvec4 sampleTex(vec2 uv) {\n  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {\n    return vec4(0.0);\n  }\n  return texture(uTextTexture, uv);\n}\nvoid main() {\n  vec2 uv = vUv;\n  float aspect = uResolution.x / max(uResolution.y, 1.0);\n  float time = uTime * uSpeed;\n  float scale = max(uWarpScale, 0.001);\n  vec2 drift = vec2(time * 0.055, -time * 0.045);\n  float n1 = fbm(uv * scale * 3.1 + drift);\n  float n2 = fbm((uv + 19.17) * scale * 3.4 - drift.yx);\n  vec2 ambient = (vec2(n1, n2) - 0.5) * uWarpStrength * 0.045 * uMotion;\n  vec2 pointerDelta = uv - uPointer;\n  vec2 aspectDelta = vec2(pointerDelta.x * aspect, pointerDelta.y);\n  float dist = length(aspectDelta);\n  float radius = max(uPointerInfluence, 0.001);\n  float t = clamp(dist / radius, 0.0, 1.0);\n  float lens = smoothstep(radius, 0.0, dist) * uPointerActive;\n  float bulge = t * (1.0 - t) * (1.0 - t) * 6.75 * uPointerActive;\n  vec2 dir = dist > 0.0001 ? vec2(aspectDelta.x / aspect, aspectDelta.y) / dist : vec2(0.0);\n  float rippleWave = sin(dist * 28.0 - time * 4.2) * 0.5 + 0.5;\n  float rippleRing = (rippleWave - 0.5) * uRipple;\n  vec2 pointerWarp = -dir * bulge * uPointerStrength * 0.045;\n  pointerWarp += dir * rippleRing * bulge * uPointerStrength * 0.016;\n  vec2 displaced = uv + ambient + pointerWarp;\n  vec2 splitDir = ambient + pointerWarp;\n  float splitLen = length(splitDir);\n  splitDir = splitLen > 0.00001 ? splitDir / splitLen : vec2(0.7071, 0.7071);\n  vec2 split = splitDir * uRefraction * 0.16 * (0.35 + lens * 1.65);\n  vec4 base = sampleTex(displaced);\n  float r = sampleTex(displaced + split).r;\n  float g = base.g;\n  float b = sampleTex(displaced - split).b;\n  float a = max(max(sampleTex(displaced + split).a, base.a), sampleTex(displaced - split).a);\n  vec3 color = vec3(r, g, b) + lens * base.a * 0.055;\n  fragColor = vec4(color, a);\n}\n';

  // ===== 文字光栅化工具 =====
  function getFontValue(value) {
    return typeof value === 'number' ? value + 'px' : value;
  }
  function measureLine(ctx, line, letterSpacing) {
    var chars = Array.from(line);
    var textWidth = chars.reduce(function (w, ch) { return w + ctx.measureText(ch).width; }, 0);
    return textWidth + Math.max(0, chars.length - 1) * letterSpacing;
  }
  function drawLine(ctx, line, x, y, letterSpacing) {
    var chars = Array.from(line);
    var cursor = x - measureLine(ctx, line, letterSpacing) / 2;
    chars.forEach(function (ch, i) {
      ctx.fillText(ch, cursor, y);
      cursor += ctx.measureText(ch).width + (i === chars.length - 1 ? 0 : letterSpacing);
    });
  }
  function buildTextCanvas(container, width, height, dpr, props) {
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    var ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    var probe = document.createElement('span');
    probe.textContent = props.text;
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;white-space:pre;inset:0 auto auto 0;';
    probe.style.fontFamily = props.fontFamily;
    probe.style.fontSize = getFontValue(props.fontSize);
    probe.style.fontWeight = String(props.fontWeight);
    probe.style.letterSpacing = getFontValue(props.letterSpacing);
    probe.style.lineHeight = typeof props.lineHeight === 'number' ? String(props.lineHeight) : props.lineHeight;
    container.appendChild(probe);
    var computed = window.getComputedStyle(probe);
    var fontSizePx = parseFloat(computed.fontSize) || 96;
    var fontFamily = computed.fontFamily || 'sans-serif';
    var fontWeight = computed.fontWeight || String(props.fontWeight);
    var letterSpacing = computed.letterSpacing === 'normal' ? 0 : parseFloat(computed.letterSpacing) || 0;
    var lineHeight = parseFloat(computed.lineHeight);
    if (!Number.isFinite(lineHeight)) {
      lineHeight = fontSizePx * (typeof props.lineHeight === 'number' ? props.lineHeight : 0.92);
    }
    probe.remove();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = props.color;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    var lines = String(props.text || '').split('\n');
    function applyFont() { ctx.font = fontWeight + ' ' + fontSizePx + 'px ' + fontFamily; }
    applyFont();
    var maxWidth = width * 0.9;
    var maxHeight = height * 0.82;
    var widest = Math.max.apply(null, lines.map(function (l) { return measureLine(ctx, l, letterSpacing); }).concat([1]));
    var blockHeight = Math.max(lineHeight * lines.length, 1);
    var fit = Math.min(1, maxWidth / widest, maxHeight / blockHeight);
    if (fit < 1) {
      fontSizePx *= fit; letterSpacing *= fit; lineHeight *= fit; applyFont();
    }
    var startY = height / 2 - (lineHeight * (lines.length - 1)) / 2;
    lines.forEach(function (l, i) { drawLine(ctx, l, width / 2, startY + i * lineHeight, letterSpacing); });
    return canvas;
  }

  // ===== 通用 Warp 核心 =====
  function hasWebGL2() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
    } catch (e) { return false; }
  }
  function createWarp(container, options, getTextureCanvas) {
    if (!container || typeof ogl === 'undefined') return null;
    if (!hasWebGL2()) return null; // 无 WebGL2 时保留原始文字/图片，避免黑屏
    var props = Object.assign({
      warpStrength: 0.08,
      warpScale: 1.7,
      speed: 0.55,
      pointerInfluence: 0.42,
      pointerStrength: 0.38,
      refraction: 0.018,
      ripple: true
    }, options || {});

    var renderer, gl, program, geometry, mesh, texture;
    var resizeObserver, intersectionObserver;
    var raf = 0;
    var disposed = false;
    var contextLost = false;
    var visible = true;
    var pageVisible = !document.hidden;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var rasterVersion = 0;
    var pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: 0, activeTarget: 0 };
    var startTime = performance.now();

    try {
      renderer = new ogl.Renderer({
        alpha: true,
        premultipliedAlpha: false,
        antialias: true,
        dpr: Math.min(window.devicePixelRatio || 1, 2)
      });
      gl = renderer.gl;
    } catch (e) {
      console.warn('Warp: WebGL init failed', e);
      return null;
    }

    gl.clearColor(0, 0, 0, 0);
    var canvas = gl.canvas;
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);

    try {
      texture = new ogl.Texture(gl, {
        generateMipmaps: false,
        minFilter: gl.LINEAR,
        magFilter: gl.LINEAR,
        wrapS: gl.CLAMP_TO_EDGE,
        wrapT: gl.CLAMP_TO_EDGE
      });

      geometry = new ogl.Triangle(gl);
      program = new ogl.Program(gl, {
        vertex: vertex,
        fragment: fragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uTextTexture: { value: texture },
          uResolution: { value: new Float32Array([1, 1]) },
          uPointer: { value: new Float32Array([0.5, 0.5]) },
          uPointerActive: { value: 0 },
          uTime: { value: 0 },
          uWarpStrength: { value: props.warpStrength },
          uWarpScale: { value: props.warpScale },
          uSpeed: { value: props.speed },
          uPointerInfluence: { value: props.pointerInfluence },
          uPointerStrength: { value: props.pointerStrength },
          uRefraction: { value: props.refraction },
          uRipple: { value: props.ripple ? 1 : 0 },
          uMotion: { value: reduceMotion ? 0 : 1 }
        }
      });
      mesh = new ogl.Mesh(gl, { geometry: geometry, program: program });
    } catch (e) {
      console.warn('Warp: WebGL 资源创建失败，已降级显示', e);
      if (canvas.parentNode === container) container.removeChild(canvas);
      return null;
    }

    function renderOnce() {
      if (disposed || contextLost) return;
      renderer.render({ scene: mesh });
    }

    function rasterize() {
      var version = ++rasterVersion;
      var doIt = function () {
        if (disposed || contextLost || version !== rasterVersion) return;
        var rect = container.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var texCanvas = getTextureCanvas(container, rect.width, rect.height, dpr);
        if (!texCanvas) return;
        texture.image = texCanvas;
        texture.needsUpdate = true;
        renderOnce();
      };
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(doIt).catch(doIt);
      } else { doIt(); }
    }

    function resize() {
      if (disposed || contextLost) return;
      var rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      renderer.dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setSize(rect.width, rect.height);
      program.uniforms.uResolution.value[0] = gl.drawingBufferWidth;
      program.uniforms.uResolution.value[1] = gl.drawingBufferHeight;
      rasterize();
    }

    function onPointerMove(e) {
      if (e.pointerType === 'touch') return;
      var rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      pointer.tx = (e.clientX - rect.left) / rect.width;
      pointer.ty = 1 - (e.clientY - rect.top) / rect.height;
      pointer.activeTarget = 1;
    }
    function onPointerLeave() { pointer.activeTarget = 0; }
    function onContextLost(e) { e.preventDefault(); contextLost = true; if (raf) cancelAnimationFrame(raf); raf = 0; }
    function onVisibility() {
      pageVisible = !document.hidden;
      if (pageVisible && visible && !raf) raf = requestAnimationFrame(loop);
      if (!pageVisible && raf) { cancelAnimationFrame(raf); raf = 0; }
    }
    var mediaQuery = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    function onReducedMotion(e) {
      reduceMotion = e.matches;
      program.uniforms.uMotion.value = reduceMotion ? 0 : 1;
      renderOnce();
    }

    function loop(now) {
      if (disposed || contextLost) return;
      var elapsed = (now - startTime) * 0.001;
      var idleX = 0.5 + Math.sin(elapsed * 0.33) * 0.12;
      var idleY = 0.5 + Math.cos(elapsed * 0.27) * 0.1;
      var targetX = pointer.activeTarget > 0 ? pointer.tx : idleX;
      var targetY = pointer.activeTarget > 0 ? pointer.ty : idleY;
      var damping = pointer.activeTarget > 0 ? 0.12 : 0.035;
      pointer.x += (targetX - pointer.x) * damping;
      pointer.y += (targetY - pointer.y) * damping;
      pointer.active += ((pointer.activeTarget > 0 ? 1 : 0.18) - pointer.active) * 0.06;
      program.uniforms.uPointer.value[0] = pointer.x;
      program.uniforms.uPointer.value[1] = pointer.y;
      program.uniforms.uPointerActive.value = reduceMotion ? pointer.active * 0.35 : pointer.active;
      program.uniforms.uTime.value = reduceMotion ? 0 : elapsed;
      renderOnce();
      raf = requestAnimationFrame(loop);
    }

    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    intersectionObserver = new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible && pageVisible && !raf) raf = requestAnimationFrame(loop);
      if (!visible && raf) { cancelAnimationFrame(raf); raf = 0; }
    }, { threshold: 0 });
    intersectionObserver.observe(container);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('webglcontextlost', onContextLost, false);
    document.addEventListener('visibilitychange', onVisibility);
    if (mediaQuery) mediaQuery.addEventListener('change', onReducedMotion);

    resize();
    raf = requestAnimationFrame(loop);
    container.classList.add('warp-ready');

    return {
      destroy: function () {
        disposed = true;
        if (raf) cancelAnimationFrame(raf);
        if (resizeObserver) resizeObserver.disconnect();
        if (intersectionObserver) intersectionObserver.disconnect();
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerleave', onPointerLeave);
        canvas.removeEventListener('webglcontextlost', onContextLost);
        document.removeEventListener('visibilitychange', onVisibility);
        if (mediaQuery) mediaQuery.removeEventListener('change', onReducedMotion);
        if (!contextLost) {
          try {
            if (texture && texture.texture) gl.deleteTexture(texture.texture);
            if (geometry && geometry.remove) geometry.remove();
            if (program && program.remove) program.remove();
            var ext = gl.getExtension('WEBGL_lose_context');
            if (ext) ext.loseContext();
          } catch (e) { /* 忽略 */ }
        }
        if (canvas.parentNode === container) container.removeChild(canvas);
      },
      rasterize: rasterize
    };
  }

  // ===== 文字模式 =====
  function WarpText(container, options) {
    var textProps = Object.assign({
      text: 'Warp Text',
      color: '#ffffff',
      fontSize: 'clamp(3rem, 10vw, 9rem)',
      fontWeight: 800,
      fontFamily: 'inherit',
      letterSpacing: '-0.06em',
      lineHeight: 0.9
    }, options || {});
    return createWarp(container, textProps, function (cont, w, h, dpr) {
      return buildTextCanvas(cont, w, h, dpr, textProps);
    });
  }

  // ===== 图片模式 =====
  function WarpImage(container, options) {
    var imgProps = Object.assign({
      src: '',
      fit: 'cover'
    }, options || {});
    if (!imgProps.src) return null;
    var img = new Image();
    var instance = null;
    img.onload = function () {
      instance = createWarp(container, imgProps, function (cont, w, h, dpr) {
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.floor(w * dpr));
        c.height = Math.max(1, Math.floor(h * dpr));
        var ctx = c.getContext('2d');
        if (!ctx) return c;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        var iw = img.width, ih = img.height;
        var scale = imgProps.fit === 'cover'
          ? Math.max(w / iw, h / ih)
          : Math.min(w / iw, h / ih);
        var dw = iw * scale, dh = ih * scale;
        var dx = (w - dw) / 2, dy = (h - dh) / 2;
        ctx.drawImage(img, dx, dy, dw, dh);
        return c;
      });
    };
    img.src = imgProps.src;
    return {
      destroy: function () { if (instance) instance.destroy(); },
      rasterize: function () { if (instance) instance.rasterize(); }
    };
  }

  global.WarpText = WarpText;
  global.WarpImage = WarpImage;
})(window);
