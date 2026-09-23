/* ==========================================================================
 * src/modules/effects/specular-button.js —— 按钮的 WebGL 高光描边
 *
 * 原实现内联在 src/modules/pages/gate.js 里（约 140 行），和门控逻辑、主题切换、
 * 头像扭曲、粒子标题挤在同一个 IIFE 中，靠页面的 __raf/__onWin 回收器善后。
 * 现在抽成独立模块：传入按钮元素，返回卸载函数 —— 与 photo-wall.js 同一套路。
 * 这一段是纯 WebGL 视觉，不做模板化（顶点/片元着色器不适合声明式表达）。
 *
 * 保留的行为（逐条核对过）：
 *   - 无 ogl 或无 WebGL2 时静默跳过（按钮本身照常可点）
 *   - Renderer 初始化抛错时 warn 并降级，不冒泡打断页面
 *   - 描边的底色/高光色跟随当前配色方案的 --accent
 *   - 指针在按钮内 → 高光角度跟随指针；在按钮外 → 按距离衰减（smoothstep 过渡）
 *   - 按钮尺寸变化由 ResizeObserver 跟随（原实现同）
 *
 * ⚠ 一处原站遗留缺陷（本轮迁移中发现，**按原样保留、未擅自改视觉**）：
 *   `.specular-fx` 本身就是一个 `<canvas>`（`<canvas class="specular-fx">`），
 *   而原实现是 `canvasHost.appendChild(gl.canvas)` —— 把 WebGL 的 canvas 塞进
 *   这个 canvas 里当**子节点**。canvas 的子节点属于「不支持 canvas 时的降级内容」，
 *   浏览器永远不渲染它们。实测该内层 canvas 的 getBoundingClientRect() 为 0×0，
 *   也就是说这颗按钮的高光描边在原站**从来没有真正显示过**（RLS 白算一遍）。
 *   修法只需一行：把下面的 canvasHost 换成 btn（或直接挂到 btn 上并调 z-index），
 *   但那样欢迎页的按钮会多出一圈发光描边 —— 属于可见的视觉变化，
 *   故留待确认后再改。
 * ========================================================================== */

const PAD = 20;

const VERT = '#version 300 es\nin vec2 position;\nvoid main() {\n  gl_Position = vec4(position, 0.0, 1.0);\n}\n';
const FRAG = '#version 300 es\nprecision highp float;\nuniform vec2 uCenter;\nuniform vec2 uHalfSize;\nuniform float uRadius;\nuniform float uAngle;\nuniform float uPx;\nuniform vec3 uLineColor;\nuniform vec3 uBaseColor;\nuniform float uIntensity;\nuniform float uShineSize;\nuniform float uShineFade;\nuniform float uThickness;\nuniform float uBaseWidth;\nout vec4 fragColor;\nfloat sdRoundedRect(vec2 p, vec2 b, float r) {\n  vec2 q = abs(p) - b + r;\n  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;\n}\nfloat shapeSDF(vec2 p) { return sdRoundedRect(p, uHalfSize, uRadius); }\nfloat gaussianLine(float d, float sigma) {\n  float x = d / (sigma + 1e-6);\n  float k = mix(1.0, 1.6, smoothstep(0.0, 1.5, x));\n  return exp(-k * x * x);\n}\nvoid main() {\n  vec2 p = gl_FragCoord.xy - uCenter;\n  float d = shapeSDF(p);\n  vec2 L = vec2(cos(uAngle), sin(uAngle));\n  float base = (1.0 - smoothstep(0.0, uBaseWidth, abs(d))) * 0.45;\n  vec2 nEll = normalize(p / (uHalfSize * uHalfSize) + 1e-6);\n  float phi = acos(clamp(abs(dot(nEll, L)), 0.0, 1.0));\n  float rim = 1.0 - smoothstep(uShineSize - uShineFade, uShineSize + uShineFade + 1e-4, phi);\n  float line = gaussianLine(d, uThickness);\n  float edgeClamp = 1.0 - smoothstep(0.5 * uPx, 3.0 * uPx, abs(d));\n  float hi = line * rim * edgeClamp * uIntensity;\n  vec3 col = uBaseColor * base + uLineColor * hi;\n  float a = clamp(base + hi, 0.0, 1.0);\n  fragColor = vec4(col, a);\n}\n';

function hasWebGL2() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch (e) {
    return false;
  }
}

/** '#rrggbb' → [r, g, b]（0~1） */
function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

/**
 * 给按钮加上 WebGL 高光描边。
 * @param {HTMLElement} btn 按钮（内部需有 .specular-fx 画布容器）
 * @param {{ accent?: string }} [opts] accent：描边颜色，默认取不到时的兜底青绿
 * @returns {() => void} 卸载函数
 */
/** 真正的初始化（ogl 由调用方传入，便于动态加载） */
function setupSpecular(btn, ogl, opts) {
  const noop = () => {};
  if (!btn) return noop;
  const accent = (opts && opts.accent) || '#4ff0d0';

  // 无 ogl（动态加载失败）或无 WebGL2 → 跳过特效，按钮照常可用
  if (typeof ogl === 'undefined' || !hasWebGL2()) return noop;
  const canvasHost = btn.querySelector('.specular-fx');
  if (!canvasHost) return noop;

  const dpr = window.devicePixelRatio || 1;
  let renderer;
  try {
    renderer = new ogl.Renderer({ alpha: true, premultipliedAlpha: true, antialias: true, dpr });
  } catch (e) {
    console.warn('Gate WebGL 初始化失败，已降级显示', e);
    return noop;
  }

  const params = {
    radius: 26,
    lineColor: accent,
    baseColor: accent,
    intensity: 1.3,
    shineSize: 12,
    shineFade: 45,
    thickness: 1.2,
    speed: 0.4,
    followMouse: true,
    proximity: 300,
    autoAnimate: false,
  };

  const gl = renderer.gl;
  gl.clearColor(0, 0, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const geometry = new ogl.Triangle(gl);
  if (geometry.attributes.uv) delete geometry.attributes.uv;

  const program = new ogl.Program(gl, {
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
      uBaseWidth: { value: dpr },
    },
  });

  const mesh = new ogl.Mesh(gl, { geometry, program });
  canvasHost.appendChild(gl.canvas);
  gl.canvas.style.width = '100%';
  gl.canvas.style.height = '100%';
  gl.canvas.style.display = 'block';

  const sizeRef = { w: 1, h: 1 };
  function resize() {
    const rect = btn.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    sizeRef.w = w;
    sizeRef.h = h;
    renderer.setSize(w + PAD * 2, h + PAD * 2);
    program.uniforms.uCenter.value = [(PAD + w / 2) * dpr, (PAD + h / 2) * dpr];
    program.uniforms.uHalfSize.value = [(w / 2) * dpr, (h / 2) * dpr];
  }
  const ro = new ResizeObserver(resize);
  ro.observe(btn);
  resize();

  let pointerAngle = null;
  let proximityT = 0;
  function onPointerMove(e) {
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right);
    const dy = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
    const dist = Math.hypot(dx, dy);
    if (dist === 0) {
      // 指针落在按钮内：按相对中心的归一化坐标微调高光角度
      const nx = (e.clientX - cx) / (rect.width / 2);
      const ny = (cy - e.clientY) / (rect.height / 2);
      pointerAngle = Math.atan2(2 / rect.height, -2 / rect.width) + nx * 0.3 + ny * 0.15;
    } else {
      pointerAngle = Math.atan2(cy - e.clientY, e.clientX - cx);
    }
    const t = Math.max(0, 1 - dist / Math.max(params.proximity, 1));
    proximityT = t * t * (3 - 2 * t);
  }
  window.addEventListener('pointermove', onPointerMove);

  let angle = 2.4;
  let idleAngle = 2.4;
  let bright = 0;
  let last = performance.now();
  let rafId = 0;
  let disposed = false;
  const lineRgb = hexToRgb(params.lineColor);
  const baseRgb = hexToRgb(params.baseColor);

  function update(now) {
    if (disposed) return;
    rafId = requestAnimationFrame(update);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    idleAngle += params.speed * dt;
    const steer = params.followMouse && pointerAngle != null && (!params.autoAnimate || proximityT > 0);
    const target = steer ? pointerAngle : idleAngle;
    const diff = ((target - angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    angle += diff * (1 - Math.exp(-dt * 7));
    const brightTarget = params.autoAnimate ? 1 : proximityT;
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
  rafId = requestAnimationFrame(update);

  return function destroy() {
    disposed = true;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    ro.disconnect();
    window.removeEventListener('pointermove', onPointerMove);
    // 丢掉 WebGL 上下文，反复进出欢迎页才不会累积 GPU 资源
    try { gl.getExtension('WEBGL_lose_context').loseContext(); } catch (e) { /* 忽略 */ }
    try { if (gl.canvas && gl.canvas.parentNode) gl.canvas.parentNode.removeChild(gl.canvas); } catch (e) { /* 忽略 */ }
  };
}

/**
 * 给按钮加 WebGL 高光描边。
 *
 * ⚠️ ogl 是**动态 import** 的：它体积 128 KB（本项目最大的单个 JS），
 * 静态 import 会把它整个塞进欢迎页（落地页）的 chunk，首屏必须等它下载完。
 * 改成动态加载后：
 *   · 欢迎页 chunk 从 ~156 KB 降到 ~28 KB
 *   · 不支持 WebGL2 的设备根本不会下载这 128 KB
 *   · 加载失败也只是没有高光特效，按钮照常可点（与原来的降级行为一致）
 *
 * 返回值仍是同步的 disposer，调用方写法不用改。
 */
export function initSpecularButton(btn, opts) {
  const noop = () => {};
  if (!btn) return noop;
  if (!hasWebGL2()) return noop;                       // 不支持 → 连下载都省了
  if (!btn.querySelector('.specular-fx')) return noop; // 没有画布容器 → 也没必要下载

  let disposed = false;
  let cleanup = noop;

  import('@/vendor/ogl')
    .then((mod) => {
      if (disposed) return;                            // 已经卸载了就别初始化
      cleanup = setupSpecular(btn, mod.default || mod, opts);
    })
    .catch(() => { /* 加载失败 → 保持无特效，按钮照常可用 */ });

  return function destroy() {
    disposed = true;
    cleanup();
  };
}
