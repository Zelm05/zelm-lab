/* ==========================================================================
 * src/modules/photo-wall.js —— 照片墙漂移动画（DriftWall 香草移植）
 *
 * 原实现内联在 src/modules/pages/about.js 里（约 220 行），与页面的
 * getElementById / rAF 回收器 / 站点设置耦合在一起，只在「进入正文」时被调一次。
 * 现在抽成独立模块：传入容器元素即可，返回一个卸载函数。
 *
 * 保留的行为（逐条核对过）：
 *   - 18 张照片按列分配，轨道取模无缝循环；照片版本号 ?v=2 用于破缓存
 *   - 手机（<640px）3 列轻 3D，桌面 5 列原版参数
 *   - 黄金比例伪随机变速 + 隔列反向；各列初始错开
 *   - 指针视差（阻尼 0.12s）+ 命中瓦片高亮（所在列暂停）
 *   - prefers-reduced-motion：只做视差，不滚动
 *   - 断点切换（跨 640px）时销毁重建
 * 这部分是纯视觉模块，不做模板化 —— 和 gate 的 WebGL 特效同一处理方式。
 * ========================================================================== */

/** 照片版本号：换图后 +1 即可让浏览器 / 边缘缓存立即失效 */
const PHOTO_VER = '2';

/** 照片清单（后续新增图片：把注释里的几行放开即可） */
/* 回落照片：正常走 /api/content/photos（Supabase），这里只在接口失败时用。
   2026-09-25：18 张已迁到 Supabase photos 桶，本地只留 photo-01
   —— 它同时是 og:image 的封面图（page-meta.js / index.html），不能删。 */
/* 回落照片：正常走 /api/content/photos（Supabase），这里只在接口失败时用。
   2026-09-25：18 张已迁到 Supabase photos 桶，本地只留 photo-01
   —— 它同时是 og:image 的封面图（page-meta.js / index.html），不能删。 */
const PHOTOS = [
  'assets/photos/photo-01.webp',
];

/**
 * 初始化照片墙。
 * @param {HTMLElement} wall 容器（.drift-wall#photoWall）
 * @param {{ onBreakpoint?: () => void }} [opts] onBreakpoint：跨越 640px 断点时回调
 *        （由调用方决定销毁重建，因为重建需要重新测量容器尺寸）
 * @returns {(() => void) | null} 卸载函数；容器尺寸还没就绪时返回 null（调用方可稍后重试）
 */
export function initDriftWall(wall, opts) {
  if (!wall) return () => {};
  const onBreakpoint = (opts && opts.onBreakpoint) || null;

  /* 2026-09-25：照片改为**可由外部传入**（来自 /api/content/photos + Supabase 公开 URL）。
     未传时回落到下面的硬编码 PHOTOS（保证旧行为不变）。 */
  const ext = (opts && opts.photos && opts.photos.length) ? opts.photos : null;
  const items = ext
    ? ext.map((src, i) => ({ image: src, title: (opts.titles && opts.titles[i]) || ('Photo ' + (i + 1)) }))
    : PHOTOS.map((src, i) => ({ image: src + '?v=' + PHOTO_VER, title: 'Photo ' + (i + 1) }));

  const cw = wall.clientWidth;
  const ch = wall.clientHeight;
  /* 布局未就绪（宽度为 0）时交给调用方稍后重试 */
  if (cw < 50 || ch < 50) return null;

  /* ---- 响应式配置：手机 3 列小瓦片轻 3D，桌面 5 列原版参数 ---- */
  const isMobile = cw < 640;
  let cfg;
  if (isMobile) {
    const mW = Math.floor((cw - 10 * 2) / 3);
    cfg = { columns: 3, tileW: mW, tileH: Math.floor(mW * 0.66), gap: 10, radius: 12,
            tilt: 8, turn: -6, roll: 0, perspective: 1000, depth: 40, scale: 1.06,
            speed: 28, variance: 0.4, parallax: 0.25, lift: 30, fade: 0.6, dim: 0.5 };
  } else {
    const dW = Math.min(200, Math.floor((cw - 18 * 4) / 5));
    cfg = { columns: 5, tileW: dW, tileH: Math.floor(dW * 0.66), gap: 18, radius: 14,
            tilt: 16, turn: -14, roll: 0, perspective: 1200, depth: 120, scale: 1.18,
            speed: 42, variance: 0.45, parallax: 0.6, lift: 64, fade: 0.6, dim: 0.55 };
  }
  const grayscale = false;
  const overlayColor = '#060010';
  const pauseOnHover = false;

  let isReduced = false;
  try { isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* 忽略 */ }

  /* CSS 变量 */
  const cssVars = {
    '--dw-tile-w': cfg.tileW + 'px', '--dw-tile-h': cfg.tileH + 'px', '--dw-gap': cfg.gap + 'px',
    '--dw-radius': cfg.radius + 'px', '--dw-perspective': cfg.perspective + 'px',
    '--dw-lift': cfg.lift + 'px', '--dw-dim': cfg.dim, '--dw-overlay': overlayColor,
    '--dw-edge': Math.max(0, (1 - cfg.fade) * 100) + '%',
  };
  Object.keys(cssVars).forEach((k) => wall.style.setProperty(k, cssVars[k]));
  wall.classList.toggle('drift-wall--gray', grayscale);

  /* ---- 照片按列分配（items[i % columns]，空列兜底） ---- */
  let columnItems = [];
  for (let c0 = 0; c0 < cfg.columns; c0 += 1) columnItems.push([]);
  items.forEach((it, i) => { columnItems[i % cfg.columns].push(it); });
  columnItems = columnItems.map((col) => (col.length ? col : items.slice(0, 1)));

  /* ---- 轨道元数据：单份内容高度 + 循环份数（视口 1.6 倍 + 1） ---- */
  const unit = cfg.tileH + cfg.gap;
  const columnMeta = columnItems.map((col) => {
    const copyHeight = Math.max(unit, col.length * unit);
    const copies = Math.max(2, Math.ceil((ch * 1.6) / copyHeight) + 1);
    return { copyHeight, copies };
  });

  /* ---- 基础速度：黄金比例伪随机变速 + 隔列反向 ---- */
  const columnFactor = (index) => 1 + cfg.variance * ((((index * 0.6180339887 + 0.35) % 1) * 2) - 1);
  const baseV = columnItems.map((_, c) => cfg.speed * columnFactor(c) * (c % 2 === 0 ? 1 : -1));

  /* ---- 初始偏移：各列错开 ---- */
  const offsets = columnMeta.map((m, c) => m.copyHeight * ((c * 0.37) % 1));
  const vel = columnItems.map(() => 0);

  /* ---- 交互状态 ---- */
  let pointer = { x: 0, y: 0 };
  const pDamped = { x: 0, y: 0 };
  let activeId = null;
  let hoveredCol = -1;
  let wallHovered = false;
  let lastTs = null;
  let raf = null;

  /* ---- 构建 DOM：plane → col(flex) → track → tiles(自然流) ---- */
  const plane = document.createElement('div');
  plane.className = 'drift-wall__plane';
  wall.appendChild(plane);

  const tracks = [];
  const allTiles = [];

  function setActive() {
    for (let i = 0; i < allTiles.length; i += 1) {
      allTiles[i].el.classList.toggle('is-active', allTiles[i].id === activeId);
    }
  }
  function activate(id, col) { activeId = id; hoveredCol = col; setActive(); }
  function release() { activeId = null; hoveredCol = -1; setActive(); }

  columnItems.forEach((col, c) => {
    const meta = columnMeta[c];
    const colDiv = document.createElement('div');
    colDiv.className = 'drift-wall__col';
    const track = document.createElement('div');
    track.className = 'drift-wall__track';
    for (let copy = 0; copy < meta.copies; copy += 1) {
      col.forEach((it, idx) => {
        const id = c + '-' + copy + '-' + idx;
        const el = document.createElement('div');
        el.className = 'drift-wall__tile';
        el.setAttribute('data-tile-id', id);
        el.setAttribute('data-col', String(c));
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.setAttribute('aria-label', it.title || 'tile');
        const img = document.createElement('img');
        img.src = it.image; img.alt = it.title || ''; img.loading = 'lazy'; img.decoding = 'async';
        img.draggable = false;
        img.width = cfg.tileW; img.height = cfg.tileH;
        const ov = document.createElement('span');
        ov.className = 'drift-wall__overlay';
        el.appendChild(img); el.appendChild(ov);
        el.addEventListener('focus', () => activate(id, c));
        el.addEventListener('blur', release);
        track.appendChild(el);
        allTiles.push({ el, id });
      });
    }
    colDiv.appendChild(track);
    plane.appendChild(colDiv);
    tracks.push(track);
  });

  /* 初始帧：先把轨道摆到初始偏移（reduced motion 下即为最终位置） */
  for (let c1 = 0; c1 < tracks.length; c1 += 1) {
    tracks[c1].style.transform = 'translate3d(0,' + (-offsets[c1]) + 'px,0)';
  }

  function applyPlane(px, py) {
    plane.style.transform =
      'translate(-50%,-50%) scale(' + cfg.scale + ') rotateX(' + (cfg.tilt + py) + 'deg)' +
      ' rotateY(' + (cfg.turn + px) + 'deg) rotateZ(' + cfg.roll + 'deg)' +
      ' translateZ(' + (-cfg.depth) + 'px)';
  }
  applyPlane(0, 0);

  /* ---- 动画主循环：轨道整体位移 + 负数取模无缝回绕 ---- */
  function animate(ts) {
    if (lastTs === null) lastTs = ts;
    const dt = Math.min(0.05, Math.max(0, (ts - lastTs) / 1000));
    lastTs = ts;

    /* 视差缓动（阻尼 0.12s） */
    const maxTilt = cfg.parallax * 8;
    const damp = 1 - Math.exp(-dt / 0.12);
    pDamped.x += (pointer.x * maxTilt - pDamped.x) * damp;
    pDamped.y += (-pointer.y * maxTilt - pDamped.y) * damp;
    applyPlane(pDamped.x, pDamped.y);

    if (!isReduced) {
      for (let c = 0; c < tracks.length; c += 1) {
        const meta = columnMeta[c];
        const paused = wallHovered && pauseOnHover;
        const factor = (paused || hoveredCol === c) ? 0 : 1;
        const target = baseV[c] * factor;
        const ease = 1 - Math.exp(-dt / (target === 0 ? 0.16 : 0.28));
        vel[c] += (target - vel[c]) * ease;

        let next = offsets[c] + vel[c] * dt;
        next = ((next % meta.copyHeight) + meta.copyHeight) % meta.copyHeight;
        offsets[c] = next;
        tracks[c].style.transform = 'translate3d(0,' + (-next) + 'px,0)';
      }
    }
    raf = requestAnimationFrame(animate);
  }
  raf = requestAnimationFrame(animate);

  /* ---- 指针交互：视差 + 命中瓦片高亮（所在列暂停） ---- */
  function onPointerMove(e) {
    const rect = wall.getBoundingClientRect();
    if (cfg.parallax > 0 && !isReduced) {
      pointer = { x: (e.clientX - rect.left) / rect.width - 0.5, y: (e.clientY - rect.top) / rect.height - 0.5 };
    }
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const tile = hit && hit.closest ? hit.closest('[data-tile-id]') : null;
    if (!tile) return;
    const id = tile.getAttribute('data-tile-id');
    if (id !== activeId) activate(id, Number(tile.getAttribute('data-col')));
  }
  function onEnter() { wallHovered = true; }
  function deactivate() {
    wallHovered = false;
    pointer = { x: 0, y: 0 };
    release();
  }
  wall.addEventListener('pointermove', onPointerMove);
  wall.addEventListener('pointerenter', onEnter);
  wall.addEventListener('pointerleave', deactivate);
  wall.addEventListener('pointercancel', deactivate);

  /* ---- 响应式：断点切换时由调用方重建 ---- */
  let resizeTimer = null;
  function onResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const nowMobile = wall.clientWidth < 640;
      if (nowMobile !== isMobile && onBreakpoint) onBreakpoint();
    }, 250);
  }
  window.addEventListener('resize', onResize);

  /* ---- 卸载 ---- */
  return function destroy() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    if (resizeTimer) clearTimeout(resizeTimer);
    window.removeEventListener('resize', onResize);
    wall.removeEventListener('pointermove', onPointerMove);
    wall.removeEventListener('pointerenter', onEnter);
    wall.removeEventListener('pointerleave', deactivate);
    wall.removeEventListener('pointercancel', deactivate);
    wall.innerHTML = '';
  };
}
