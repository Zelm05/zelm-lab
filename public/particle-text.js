/* 粒子文字特效 —— 原生 JavaScript 实现
 * 基于 React ParticleText 组件改写，文字由粒子聚集形成，鼠标靠近时粒子排斥。 */
(function (global) {
  'use strict';

  function hexToRgb(hex) {
    var clean = hex.replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16)
    };
  }

  function mixRgb(from, to, amount) {
    return {
      r: Math.round(from.r + (to.r - from.r) * amount),
      g: Math.round(from.g + (to.g - from.g) * amount),
      b: Math.round(from.b + (to.b - from.b) * amount)
    };
  }

  function rgbToCss(rgb) { return 'rgb(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ')'; }

  function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function resolveFontSize(value, container, fontWeight, fontFamily) {
    if (typeof value === 'number') return value;
    var probe = document.createElement('span');
    probe.textContent = 'M';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.fontSize = value;
    probe.style.fontWeight = String(fontWeight);
    probe.style.fontFamily = fontFamily;
    container.appendChild(probe);
    var size = parseFloat(window.getComputedStyle(probe).fontSize) || 96;
    probe.remove();
    return size;
  }

  function waitForFonts(font) {
    if (!('fonts' in document)) return Promise.resolve();
    return document.fonts.load(font).catch(function () {}).then(function () {
      return document.fonts.ready;
    });
  }

  function ParticleText(container, options) {
    if (!container) return null;
    var canvas = container.querySelector('canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'particle-title__canvas';
      container.appendChild(canvas);
    }
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;

    var opts = Object.assign({
      text: 'Particle Text',
      particleSize: 2,
      density: 4,
      color: '#ffffff',
      highlightColor: '#8b5cf6',
      scatter: 180,
      gatherDuration: 1600,
      stagger: 420,
      pointerRepel: 40,
      repelRadius: 120,
      idleDrift: 0.7,
      trigger: 'mount',
      fontSize: 'clamp(3rem, 12vw, 8rem)',
      fontWeight: 800,
      fontFamily: 'inherit',
      glow: true
    }, options || {});

    var particles = [];
    var animationFrame = null;
    var resizeFrame = null;
    var buildId = 0;
    var gathering = false;
    var gatherStart = 0;
    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var width = 0, height = 0, dpr = 1;

    var pointer = { active: false, x: 0, y: 0, smoothX: 0, smoothY: 0 };

    function startGather(fromScatter) {
      if (!particles.length) return;
      var now = performance.now();
      var spread = reducedMotion ? 0 : opts.scatter;
      particles.forEach(function (particle) {
        if (fromScatter) {
          var angle = particle.seed * Math.PI * 2;
          var distance = spread * (0.35 + particle.depth * 0.75);
          particle.x = particle.targetX + Math.cos(angle) * distance + (particle.depth - 0.5) * spread * 0.55;
          particle.y = particle.targetY + Math.sin(angle) * distance + (particle.seed - 0.5) * spread * 0.55;
        }
        particle.startX = particle.x;
        particle.startY = particle.y;
        particle.delay = reducedMotion ? 0 : particle.seed * opts.stagger;
      });
      gatherStart = now;
      gathering = true;
    }

    function drawParticle(particle) {
      var size = particle.size;
      ctx.fillStyle = particle.color;
      if (size <= 2.1) {
        ctx.fillRect(particle.x - size / 2, particle.y - size / 2, size, size);
        return;
      }
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    function render(now) {
      ctx.clearRect(0, 0, width, height);
      if (opts.glow && !reducedMotion) {
        ctx.shadowBlur = opts.particleSize * 3;
        ctx.shadowColor = opts.highlightColor;
      } else {
        ctx.shadowBlur = 0;
      }
      pointer.smoothX += (pointer.x - pointer.smoothX) * 0.18;
      pointer.smoothY += (pointer.y - pointer.smoothY) * 0.18;
      var complete = true;
      particles.forEach(function (particle) {
        var baseX = particle.targetX;
        var baseY = particle.targetY;
        var progress = 1;
        if (gathering) {
          var local = (now - gatherStart - particle.delay) / Math.max(1, reducedMotion ? 1 : opts.gatherDuration);
          progress = clamp(local, 0, 1);
          var eased = easeOutCubic(progress);
          baseX = particle.startX + (particle.targetX - particle.startX) * eased;
          baseY = particle.startY + (particle.targetY - particle.startY) * eased;
          if (progress < 1) complete = false;
        } else if (!reducedMotion && opts.idleDrift > 0) {
          var driftTime = now * 0.001;
          baseX += Math.sin(driftTime * 0.9 + particle.seed * 10) * opts.idleDrift * particle.depth;
          baseY += Math.cos(driftTime * 0.75 + particle.depth * 10) * opts.idleDrift * particle.depth;
        }
        if (pointer.active && !reducedMotion && opts.pointerRepel > 0 && opts.repelRadius > 0) {
          var dx = baseX - pointer.smoothX;
          var dy = baseY - pointer.smoothY;
          var distance = Math.hypot(dx, dy);
          if (distance > 0 && distance < opts.repelRadius) {
            var force = Math.pow(1 - distance / opts.repelRadius, 2) * opts.pointerRepel;
            baseX += (dx / distance) * force;
            baseY += (dy / distance) * force;
          }
        }
        var follow = reducedMotion ? 1 : 0.22;
        particle.x += (baseX - particle.x) * follow;
        particle.y += (baseY - particle.y) * follow;
        ctx.globalAlpha = clamp(0.35 + progress * 0.65, 0, 1);
        drawParticle(particle);
      });
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      if (gathering && complete) gathering = false;
      animationFrame = window.requestAnimationFrame(render);
    }

    function ensureRenderLoop() {
      if (animationFrame === null) animationFrame = window.requestAnimationFrame(render);
    }

    function sampleText() {
      var currentBuild = ++buildId;
      var rect = container.getBoundingClientRect();
      width = Math.floor(rect.width);
      height = Math.floor(rect.height);
      if (width <= 0 || height <= 0) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var computed = window.getComputedStyle(container);
      var resolvedFamily = opts.fontFamily === 'inherit' ? (computed.fontFamily || 'sans-serif') : opts.fontFamily;
      var resolvedSize = resolveFontSize(opts.fontSize, container, opts.fontWeight, resolvedFamily);
      var font = opts.fontWeight + ' ' + resolvedSize + 'px ' + resolvedFamily;

      waitForFonts(font).then(function () {
        if (currentBuild !== buildId) return;
        var offscreen = document.createElement('canvas');
        var offCtx = offscreen.getContext('2d', { willReadFrequently: true });
        if (!offCtx) return;
        var content = String(opts.text || ' ');
        var maxTextWidth = width * 0.92;
        offCtx.font = font;
        var metrics = offCtx.measureText(content);
        var measuredWidth = Math.max(1, metrics.width);
        if (measuredWidth > maxTextWidth) {
          resolvedSize = Math.max(18, resolvedSize * (maxTextWidth / measuredWidth));
          font = opts.fontWeight + ' ' + resolvedSize + 'px ' + resolvedFamily;
          waitForFonts(font).then(function () {
            if (currentBuild !== buildId) return;
            offCtx.font = font;
            doSample(offCtx, offscreen, content, font, resolvedSize, currentBuild);
          });
        } else {
          doSample(offCtx, offscreen, content, font, resolvedSize, currentBuild);
        }
      });
    }

    function doSample(offCtx, offscreen, content, font, resolvedSize, currentBuild) {
      var metrics = offCtx.measureText(content);
      var left = Math.ceil(metrics.actualBoundingBoxLeft || 0);
      var right = Math.ceil(metrics.actualBoundingBoxRight || metrics.width);
      var ascent = Math.ceil(metrics.actualBoundingBoxAscent || resolvedSize * 0.78);
      var descent = Math.ceil(metrics.actualBoundingBoxDescent || resolvedSize * 0.22);
      var padding = Math.max(12, Math.ceil(resolvedSize * 0.08));
      var textWidth = Math.max(1, left + right);
      var textHeight = Math.max(1, ascent + descent);
      offscreen.width = textWidth + padding * 2;
      offscreen.height = textHeight + padding * 2;
      offCtx.clearRect(0, 0, offscreen.width, offscreen.height);
      offCtx.font = font;
      offCtx.textAlign = 'left';
      offCtx.textBaseline = 'alphabetic';
      offCtx.fillStyle = '#ffffff';
      offCtx.fillText(content, padding - left, padding + ascent);

      var imageData = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);
      var targets = [];
      var step = Math.max(2, Math.floor(opts.density));
      for (var y = 0; y < offscreen.height; y += step) {
        for (var x = 0; x < offscreen.width; x += step) {
          var alpha = imageData.data[(y * offscreen.width + x) * 4 + 3];
          if (alpha > 40) {
            targets.push({
              x: width / 2 - offscreen.width / 2 + x,
              y: height / 2 - offscreen.height / 2 + y,
              alpha: alpha / 255
            });
          }
        }
      }

      var maxParticles = Math.max(900, Math.min(5200, Math.floor((width * height) / 90)));
      var stride = Math.max(1, Math.ceil(targets.length / maxParticles));
      var baseRgb = hexToRgb(opts.color);
      var highlightRgb = hexToRgb(opts.highlightColor);
      var selected = targets.filter(function (_, index) { return index % stride === 0; });
      particles = selected.map(function (target, index) {
        var seed = ((index * 9301 + 49297) % 233280) / 233280;
        var depth = 0.45 + (((index * 233 + 97) % 1000) / 1000) * 0.9;
        var blend = baseRgb && highlightRgb ? clamp(target.x / Math.max(1, width) + (seed - 0.5) * 0.35, 0, 1) : 0;
        var particleColor = baseRgb && highlightRgb ? rgbToCss(mixRgb(baseRgb, highlightRgb, blend)) : opts.color;
        var angle = seed * Math.PI * 2;
        var distance = (reducedMotion ? 0 : opts.scatter) * (0.35 + depth * 0.75);
        var startX = target.x + Math.cos(angle) * distance + (seed - 0.5) * opts.scatter * 0.45;
        var startY = target.y + Math.sin(angle) * distance + (depth - 0.9) * opts.scatter * 0.45;
        return {
          x: reducedMotion ? target.x : startX,
          y: reducedMotion ? target.y : startY,
          startX: startX,
          startY: startY,
          targetX: target.x,
          targetY: target.y,
          size: Math.max(0.6, opts.particleSize * (0.75 + target.alpha * 0.45)),
          color: particleColor,
          seed: seed,
          depth: depth,
          delay: seed * opts.stagger
        };
      });

      pointer.x = width / 2;
      pointer.y = height / 2;
      pointer.smoothX = pointer.x;
      pointer.smoothY = pointer.y;
      if (reducedMotion) {
        particles.forEach(function (particle) {
          particle.x = particle.targetX;
          particle.y = particle.targetY;
          particle.startX = particle.targetX;
          particle.startY = particle.targetY;
          particle.delay = 0;
        });
        gathering = false;
      } else {
        startGather(false);
      }
      ensureRenderLoop();
    }

    function queueSample() {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(sampleText);
    }

    function handlePointerMove(event) {
      var rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.active = true;
    }
    function handlePointerLeave() { pointer.active = false; }
    function handlePointerEnter(event) {
      handlePointerMove(event);
      if (opts.trigger === 'hover') startGather(true);
    }
    function handleClick() {
      if (opts.trigger === 'click') startGather(true);
    }

    var reduceMotionQuery = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    function handleReduceMotionChange(event) {
      reducedMotion = event.matches;
      sampleText();
    }
    if (reduceMotionQuery) reduceMotionQuery.addEventListener('change', handleReduceMotionChange);

    canvas.addEventListener('pointerenter', handlePointerEnter);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerleave', handlePointerLeave);
    canvas.addEventListener('click', handleClick);

    var resizeObserver = new ResizeObserver(queueSample);
    resizeObserver.observe(container);
    sampleText();

    return {
      destroy: function () {
        buildId += 1;
        resizeObserver.disconnect();
        if (reduceMotionQuery) reduceMotionQuery.removeEventListener('change', handleReduceMotionChange);
        canvas.removeEventListener('pointerenter', handlePointerEnter);
        canvas.removeEventListener('pointermove', handlePointerMove);
        canvas.removeEventListener('pointerleave', handlePointerLeave);
        canvas.removeEventListener('click', handleClick);
        if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
        if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      }
    };
  }

  global.ParticleText = ParticleText;
})(window);
