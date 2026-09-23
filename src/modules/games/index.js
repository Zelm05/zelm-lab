/* ==========================================================================
 * src/modules/games/index.js —— 小游戏引擎（记忆翻牌 / 猜数字 / 贪吃蛇 /
 *                              俄罗斯方块 / 扫雷 / 小恐龙）
 *
 * 为什么这里还是命令式：这几个游戏是逐帧 canvas 绘制 + 键盘/触摸输入，
 * 状态（得分、蛇身、方块、粒子）每帧都在变，套进 Vue 的响应式没有收益，
 * 反而会把 60fps 的绘制拖进依赖追踪。它们与「列表/表单」那类 UI 不同，
 * 本质是「挂到一个容器上、返回一个销毁函数」的外挂引擎，因此原样保留其
 * 实现，只把外壳换成 mountGame()。
 *
 * 相对原站（src/modules/pages/home.js 内联）的三处工程性调整：
 *   ① 文案从 I18N[settings.lang] 换成 packs/home.js 的中文词典（全站只有中文）
 *   ② 主题判断 settings.theme === 'light' 换成读设置 store 的 themeIsLight()
 *   ③ 监听器 / rAF 由本模块自己的小回收器登记，游戏关闭时随 destroy 一并清掉
 *      （原站登记在页面级 __tear 里，要等整页卸载才回收）
 * 游戏逻辑本身一行未改（含原有的一处不可达引擎 startGuess，见文件末注）。
 * ========================================================================== */
import { useSettingsStore } from '@/stores/settings';
import homePack from '@/i18n/packs/home';

/** 游戏内文案（原 I18N[settings.lang] || I18N.zh）。
 *  ⚠️ 2026-09-21 修复：此前是 `const T = homePack.zh` —— 模块加载时把文案表
 *  固化成了中文，游戏弹窗内的所有 UI（选择难度 / 步数 / Game Over …）永远
 *  不随语言切换（用户截图反馈）。现在每次开一局时按当前 locale 动态取，
 *  缺失 key 回落中文（与全站回落策略一致）；弹窗开着时切语言，重开一局即生效。 */
import { i18n } from '@/core/i18n';
function gameT() {
  try {
    const loc = i18n.global.locale.value;
    if (loc === 'zh-CN') return homePack.zh;
    const msgs = i18n.global.getLocaleMessage(loc);
    const m = msgs && msgs.home;
    return m ? { ...homePack.zh, ...m } : homePack.zh;
  } catch (e) {
    return homePack.zh;
  }
}

let _st = null;
function st() { if (!_st) _st = useSettingsStore(); return _st; }
/** 原 settings.theme === 'light' */
function themeIsLight() { return st().s.theme === 'light'; }

/** 取当前主题的强调色（原 home.js accentColor） */
function accentColor() {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4ff0d0';
  } catch (e) { return '#4ff0d0'; }
}

/** 洗牌（原 home.js shuffle） */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ---- 单局游戏的资源回收（替代原站的页面级 __tear） ---- */
let _fns = [];
let _rafs = new Set();
function onWin(type, fn, opt) {
  window.addEventListener(type, fn, opt);
  _fns.push(() => window.removeEventListener(type, fn, opt));
}
function raf(cb) { const id = requestAnimationFrame(cb); _rafs.add(id); return id; }
function caf(id) { _rafs.delete(id); return cancelAnimationFrame(id); }
function releaseListeners() {
  _fns.forEach((f) => { try { f(); } catch (e) { console.error('[game teardown]', e); } });
  _fns = [];
  _rafs.forEach((id) => cancelAnimationFrame(id));
  _rafs = new Set();
}

/* ======================= 以下为原样切出的游戏实现 ======================= */
function startMemory(stage, msg) {
  const t = gameT();
  const EMOJIS = ['🍎', '🍌', '🍇', '🍓', '🍑', '🍒', '🥝', '🍉', '🍊', '🍋', '🥭', '🍍'];
  const WILD = '⭐';
  const diffHTML = '<div class="mem-diff"><p class="mem-diff-title">' + t.memSelectDifficulty + '</p><div class="mem-diff-btns"><button class="mem-diff-btn" data-size="4">🎯 ' + t.memEasy + '<br><small>4×4 · 8</small></button><button class="mem-diff-btn" data-size="5">🔥 ' + t.memHard + '<br><small>5×5 · 12+⭐</small></button></div></div>';
  stage.innerHTML = diffHTML;
  stage.querySelectorAll('.mem-diff-btn').forEach(btn => btn.addEventListener('click', () => initGame(parseInt(btn.dataset.size))));

  function initGame(size) {
    const is5x5 = size === 5;
    const pairs = is5x5 ? 12 : 8;
    const selectedEmojis = EMOJIS.slice(0, pairs);
    let cards = is5x5 ? shuffle([...selectedEmojis, ...selectedEmojis, WILD]) : shuffle([...selectedEmojis, ...selectedEmojis]);
    const cellSize = is5x5 ? 48 : 56;
    stage.innerHTML = '<div class="mem-board" style="grid-template-columns: repeat(' + size + ', ' + cellSize + 'px)"></div><div class="mem-info">' + t.memMoves + ': 0' + (is5x5 ? ' · ' + t.memWildCard : '') + '</div><button class="mem-restart-btn" type="button">🔄 ' + t.memReselect + '</button>';
    const board = stage.querySelector('.mem-board');
    const info = stage.querySelector('.mem-info');
    const restartBtn = stage.querySelector('.mem-restart-btn');
    let first = null, lock = false, matched = 0, moves = 0, wildUsed = false;
    const totalPairs = pairs + (is5x5 ? 1 : 0);

    cards.forEach(e => {
      const c = document.createElement('button');
      c.className = 'mem-card'; c.type = 'button'; c.dataset.emoji = e; c.textContent = '❓';
      c.style.width = cellSize + 'px'; c.style.height = cellSize + 'px'; c.style.fontSize = (cellSize * 0.45) + 'px';
      if (e === WILD) c.classList.add('mem-wild');
      c.addEventListener('click', () => {
        if (lock || c.classList.contains('open') || c.classList.contains('done')) return;
        if (c.dataset.emoji === WILD && !wildUsed) {
          c.classList.add('done'); c.textContent = WILD; wildUsed = true; matched++;
          if (matched === totalPairs) msg.textContent = t.memAllMatched + moves + t.memMovesUnit;
          return;
        }
        c.classList.add('open'); c.textContent = e;
        if (!first) { first = c; return; }
        moves++; info.textContent = t.memMoves + ': ' + moves + (is5x5 ? ' · ' + t.memWildCard : '');
        if (first.dataset.emoji === c.dataset.emoji) {
          first.classList.add('done'); c.classList.add('done'); first = null; matched++;
          if (matched === totalPairs) msg.textContent = t.memAllMatched + moves + t.memMovesUnit;
        } else {
          lock = true;
          setTimeout(() => {
            first.classList.remove('open'); first.textContent = '❓';
            c.classList.remove('open'); c.textContent = '❓';
            first = null; lock = false;
          }, 700);
        }
      });
      board.appendChild(c);
    });

    restartBtn.addEventListener('click', () => {
      stage.innerHTML = diffHTML;
      stage.querySelectorAll('.mem-diff-btn').forEach(b => b.addEventListener('click', () => initGame(parseInt(b.dataset.size))));
      msg.textContent = '';
    });
  }
  return () => {};
}
function startSnake(stage, msg) {
  const t = gameT();
  stage.innerHTML = '<canvas class="snake-canvas" width="360" height="360"></canvas><div class="snake-info">' + t.snakeControls + ' · ' + t.snakeScore + ': <span class="snake-score">0</span></div><button class="snake-start-btn" type="button">▶ ' + t.snakeStart + '</button>';
  const cv = stage.querySelector('.snake-canvas');
  const ctx = cv.getContext('2d');
  const startBtn = stage.querySelector('.snake-start-btn');
  const N = 20, SZ = 18;
  // 离屏 canvas 预渲染背景（渐变 + 网格线），避免每帧重复创建
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = 360; bgCanvas.height = 360;
  const bgCtx = bgCanvas.getContext('2d');
  (function renderBg() {
    const isLight = themeIsLight();
    const grad = bgCtx.createRadialGradient(180, 180, 0, 180, 180, 250);
    if (isLight) {
      grad.addColorStop(0, '#e8f5ec');
      grad.addColorStop(1, '#d0e8d8');
    } else {
      grad.addColorStop(0, '#1a2a3a');
      grad.addColorStop(1, '#0d1b2a');
    }
    bgCtx.fillStyle = grad;
    bgCtx.fillRect(0, 0, 360, 360);
    bgCtx.strokeStyle = isLight ? 'rgba(28, 75, 50, 0.08)' : 'rgba(79, 240, 208, 0.05)';
    bgCtx.lineWidth = 1;
    for (let i = 0; i <= N; i++) {
      bgCtx.beginPath(); bgCtx.moveTo(i * SZ, 0); bgCtx.lineTo(i * SZ, 360); bgCtx.stroke();
      bgCtx.beginPath(); bgCtx.moveTo(0, i * SZ); bgCtx.lineTo(360, i * SZ); bgCtx.stroke();
    }
  })();

  let snake = [{ x: 10, y: 10 }];
  let dir = { x: 1, y: 0 };
  let food = rndFood();
  let score = 0, alive = true, timer = null, started = false, particles = [];
  function rndFood() { return { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) }; }
  function addParticles(x, y, color) {
    for (let i = 0; i < 6; i++) {
      particles.push({
        x: x * SZ + SZ/2, y: y * SZ + SZ/2,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        life: 12, color
      });
    }
    if (particles.length > 40) particles = particles.slice(-40);
  }
  function draw() {
    // 直接绘制预渲染的背景
    ctx.drawImage(bgCanvas, 0, 0);
    // 食物（发光苹果）
    const fx = food.x * SZ + SZ/2, fy = food.y * SZ + SZ/2;
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#ff6b6b';
    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath();
    ctx.arc(fx, fy, SZ/2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(fx - 3, fy - 3, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4caf50';
    ctx.fillRect(fx - 1, fy - SZ/2 + 1, 2, 4);
    // 蛇身（用简单 fillRect，蛇头单独画圆角+眼睛）
    for (let i = snake.length - 1; i >= 1; i--) {
      const s = snake[i];
      const ratio = i / Math.max(snake.length - 1, 1);
      const r = Math.floor(79 + (155 - 79) * ratio);
      const g = Math.floor(240 + (231 - 240) * ratio);
      const b = Math.floor(208 + (255 - 208) * ratio);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(s.x * SZ + 2, s.y * SZ + 2, SZ - 4, SZ - 4);
    }
    // 蛇头（圆角 + 眼睛）
    const head = snake[0];
    const hx = head.x * SZ, hy = head.y * SZ;
    ctx.fillStyle = accentColor();
    ctx.beginPath();
    ctx.roundRect(hx + 1, hy + 1, SZ - 2, SZ - 2, 5);
    ctx.fill();
    // 蛇头眼睛
    ctx.fillStyle = '#fff';
    let ex1, ey1, ex2, ey2;
    if (dir.x === 1) { ex1 = hx + SZ - 6; ey1 = hy + 5; ex2 = hx + SZ - 6; ey2 = hy + SZ - 7; }
    else if (dir.x === -1) { ex1 = hx + 4; ey1 = hy + 5; ex2 = hx + 4; ey2 = hy + SZ - 7; }
    else if (dir.y === -1) { ex1 = hx + 5; ey1 = hy + 4; ex2 = hx + SZ - 7; ey2 = hy + 4; }
    else { ex1 = hx + 5; ey1 = hy + SZ - 6; ex2 = hx + SZ - 7; ey2 = hy + SZ - 6; }
    ctx.beginPath(); ctx.arc(ex1, ey1, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex2, ey2, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(ex1 + dir.x, ey1 + dir.y, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex2 + dir.x, ey2 + dir.y, 1.2, 0, Math.PI * 2); ctx.fill();
    // 粒子
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      ctx.globalAlpha = p.life / 12;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 3, 3);
    }
    ctx.globalAlpha = 1;
    // 开始提示
    if (!started) {
      ctx.fillStyle = themeIsLight() ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, 360, 360);
      ctx.fillStyle = themeIsLight() ? '#2d7a5a' : accentColor(); ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center';
      ctx.fillText(t.snakeClickStart, 180, 180);
      ctx.font = '12px monospace'; ctx.fillStyle = '#8b94a3';
      ctx.fillText(t.snakeControlDir, 180, 205);
    }
  }
  function step() {
    if (!alive || !started) return;
    // 边界穿越：撞到边缘后从另一端出现（环绕）
    const head = {
      x: (snake[0].x + dir.x + N) % N,
      y: (snake[0].y + dir.y + N) % N
    };
    const willEat = !!(food && head.x === food.x && head.y === food.y);
    // 撞到身体则结束（尾巴本帧会移开，排除在外，否则穿越到尾巴位置会误判死亡）
    const bodyToCheck = willEat ? snake : snake.slice(0, -1);
    if (bodyToCheck.some(s => s.x === head.x && s.y === head.y)) {
      alive = false; msg.textContent = t.snakeGameOver + score + t.snakeClickRestart; startBtn.textContent = '🔄 ' + t.snakeRestart; startBtn.hidden = false;
      addParticles(snake[0].x, snake[0].y, '#ff6b6b');
      return;
    }
    snake.unshift(head);
    if (willEat) {
      score++; stage.querySelector('.snake-score').textContent = score;
      addParticles(food.x, food.y, '#ffd700');
      food = rndFood();
    } else { snake.pop(); }
    // 更新粒子
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
    draw();
  }
  function key(e) {
    const m = {
      ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
      w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 }
    };
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (m[k]) { const nd = m[k]; if (!(nd.x === -dir.x && nd.y === -dir.y)) dir = nd; e.preventDefault(); }
  }
  function startGame() {
    if (!alive) {
      snake = [{ x: 10, y: 10 }]; dir = { x: 1, y: 0 }; food = rndFood(); score = 0; alive = true; particles = [];
      stage.querySelector('.snake-score').textContent = '0'; msg.textContent = '';
    }
    started = true; startBtn.hidden = true;
    if (timer) clearInterval(timer);
    timer = setInterval(step, 250);
    draw();
  }
  startBtn.addEventListener('click', startGame);
  draw();
  onWin('keydown', key);
  return () => { clearInterval(timer); window.removeEventListener('keydown', key); };
}
function startTetris(stage, msg) {
  const t = gameT();
  const MODES = { casual: { dropMs: 800, label: t.tetrisCasual }, normal: { dropMs: 500, label: t.tetrisNormal }, speed: { dropMs: 250, label: t.tetrisSpeed } };
  let timer = null, keyHandler = null;
  const modeHTML = '<div class="tetris-mode"><p class="tetris-mode-title">' + t.tetrisSelectMode + '</p><div class="tetris-mode-btns"><button class="tetris-mode-btn" data-mode="casual">🌿 ' + t.tetrisCasual + '<br><small>' + t.tetrisSlowDrop + '</small></button><button class="tetris-mode-btn" data-mode="normal">🎮 ' + t.tetrisNormal + '<br><small>' + t.tetrisStandardSpeed + '</small></button><button class="tetris-mode-btn" data-mode="speed">⚡ ' + t.tetrisSpeed + '<br><small>' + t.tetrisFastDrop + '</small></button></div></div>';
  stage.innerHTML = modeHTML;
  stage.querySelectorAll('.tetris-mode-btn').forEach(btn => btn.addEventListener('click', () => initGame(btn.dataset.mode)));
  function initGame(modeKey) {
    const cfg = MODES[modeKey];
    stage.innerHTML = '<canvas class="tetris-canvas" width="200" height="400"></canvas><div class="tetris-info">' + t.tetrisControls + ' · ' + cfg.label + ' ' + t.tetrisMode + ' · ' + t.snakeScore + ': <b class="tetris-score">0</b></div><button class="tetris-restart-btn" type="button">🔄 ' + t.tetrisReselect + '</button>';
    const cv = stage.querySelector('.tetris-canvas'), ctx = cv.getContext('2d'), restartBtn = stage.querySelector('.tetris-restart-btn');
    const COLS = 10, ROWS = 20, SZ = 20;
    const SHAPES = [
      { m: [[1, 1, 1, 1]], color: '#3ee6f0' }, { m: [[1, 1], [1, 1]], color: '#ffd93d' },
      { m: [[0, 1, 0], [1, 1, 1]], color: '#b07cff' }, { m: [[0, 1, 1], [1, 1, 0]], color: '#5bff9d' },
      { m: [[1, 1, 0], [0, 1, 1]], color: '#ff6b7d' }, { m: [[1, 0, 0], [1, 1, 1]], color: '#5b8bff' },
      { m: [[0, 0, 1], [1, 1, 1]], color: '#ffa14d' }
    ];
    let grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    let cur = null, score = 0, over = false, lastDrop = 0, dropMs = cfg.dropMs;
    function newPiece() { const p = SHAPES[Math.floor(Math.random() * SHAPES.length)]; cur = { m: p.m.map(r => r.slice()), color: p.color, x: Math.floor((COLS - p.m[0].length) / 2), y: 0 }; if (collide(cur.m, cur.x, cur.y)) { over = true; msg.textContent = t.snakeGameOver + score; } }
    function collide(m, x, y) { for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) { if (!m[r][c]) continue; const nx = x + c, ny = y + r; if (nx < 0 || nx >= COLS || ny >= ROWS) return true; if (ny >= 0 && grid[ny][nx]) return true; } return false; }
    function rotate(m) { const R = m.length, C = m[0].length; return Array.from({ length: C }, (_, c) => Array.from({ length: R }, (_, r) => m[R - 1 - r][c])); }
    function merge() { cur.m.forEach((row, r) => row.forEach((v, c) => { if (v) { const ny = cur.y + r; if (ny >= 0) grid[ny][cur.x + c] = cur.color; } })); }
    function clearRows() { let cleared = 0; for (let r = ROWS - 1; r >= 0; r--) { if (grid[r].every(v => v !== 0)) { grid.splice(r, 1); grid.unshift(Array(COLS).fill(0)); r++; cleared++; } } if (cleared) { score += cleared * 100; stage.querySelector('.tetris-score').textContent = score; dropMs = Math.max(80, cfg.dropMs - Math.floor(score / 500) * 40); } }
    function drop() { if (over) return; if (!collide(cur.m, cur.x, cur.y + 1)) { cur.y++; } else { merge(); clearRows(); newPiece(); } draw(); }
    function hardDrop() { if (over) return; while (!collide(cur.m, cur.x, cur.y + 1)) cur.y++; merge(); clearRows(); newPiece(); draw(); }
    function draw() { ctx.fillStyle = themeIsLight() ? '#d8ecde' : '#0d1b2a'; ctx.fillRect(0, 0, 200, 400); for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { if (grid[r][c]) { ctx.fillStyle = grid[r][c]; ctx.fillRect(c * SZ, r * SZ, SZ - 1, SZ - 1); } } if (cur && !over) { cur.m.forEach((row, r) => row.forEach((v, c) => { if (v && cur.y + r >= 0) { ctx.fillStyle = cur.color; ctx.fillRect((cur.x + c) * SZ, (cur.y + r) * SZ, SZ - 1, SZ - 1); } })); } }
    keyHandler = function(e) { if (over) return; const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; const move = (dx, dy) => { if (!collide(cur.m, cur.x + dx, cur.y + dy)) { cur.x += dx; cur.y += dy; } draw(); }; if (k === 'ArrowLeft' || k === 'a') { move(-1, 0); e.preventDefault(); } else if (k === 'ArrowRight' || k === 'd') { move(1, 0); e.preventDefault(); } else if (k === 'ArrowDown' || k === 's') { move(0, 1); e.preventDefault(); } else if (k === 'ArrowUp' || k === 'w') { const nm = rotate(cur.m); if (!collide(nm, cur.x, cur.y)) cur.m = nm; draw(); e.preventDefault(); } else if (k === ' ') { hardDrop(); e.preventDefault(); } };
    function loop(ts) { if (over) return; if (ts - lastDrop >= dropMs) { lastDrop = ts; drop(); } if (!over) timer = raf(loop); }
    restartBtn.addEventListener('click', () => { if (timer) caf(timer); if (keyHandler) window.removeEventListener('keydown', keyHandler); stage.innerHTML = modeHTML; stage.querySelectorAll('.tetris-mode-btn').forEach(b => b.addEventListener('click', () => initGame(b.dataset.mode))); msg.textContent = ''; });
    newPiece(); draw(); timer = raf(loop); onWin('keydown', keyHandler);
  }
  return () => { if (timer) caf(timer); if (keyHandler) window.removeEventListener('keydown', keyHandler); };
}


/* ===== 扫雷游戏 ===== */

function startMinesweeper(stage, msg) {
  const t = gameT();
  const DIFFICULTIES = {
    easy: { rows: 9, cols: 9, mines: 10, label: t.msEasy },
    medium: { rows: 12, cols: 12, mines: 25, label: t.msMedium },
    hard: { rows: 16, cols: 16, mines: 50, label: t.msHard }
  };
  stage.innerHTML = '<div class="ms-diff"><p class="ms-diff-title">' + t.msSelectDifficulty + '</p><div class="ms-diff-btns"><button class="ms-diff-btn" data-diff="easy">😊 ' + t.msEasy + '<br><small>9×9 · 10' + t.msMines + '</small></button><button class="ms-diff-btn" data-diff="medium">😐 ' + t.msMedium + '<br><small>12×12 · 25' + t.msMines + '</small></button><button class="ms-diff-btn" data-diff="hard">😈 ' + t.msHard + '<br><small>16×16 · 50' + t.msMines + '</small></button></div></div>';
  const diffBtns = stage.querySelectorAll('.ms-diff-btn');
  diffBtns.forEach(btn => {
    btn.addEventListener('click', () => initGame(btn.dataset.diff));
  });

  function initGame(diffKey) {
    const cfg = DIFFICULTIES[diffKey];
    const ROWS = cfg.rows, COLS = cfg.cols, MINES = cfg.mines;
    // 手机端根据屏幕宽度动态调整格子大小
    const isMobile = window.innerWidth <= 640;
    const maxBoardWidth = isMobile ? window.innerWidth - 64 : 600;
    let cellSize = ROWS <= 9 ? 32 : ROWS <= 12 ? 28 : 24;
    if (isMobile) {
      cellSize = Math.min(cellSize, Math.floor(maxBoardWidth / COLS));
      cellSize = Math.max(cellSize, 14);
    }
    stage.innerHTML = '<div class="ms-info">💣 Minesweeper · ' + cfg.label + ' · ' + t.msLeftClick + ' · ' + t.msRightClick + ' · ' + t.msRemaining + ': <span class="ms-left">' + MINES + '</span></div><div class="ms-board-wrap"><div class="ms-board" style="grid-template-columns: repeat(' + COLS + ', ' + cellSize + 'px)"></div></div><button class="ms-restart-btn" type="button">🔄 ' + t.msReselect + '</button>';
    const board = stage.querySelector('.ms-board');
    const leftEl = stage.querySelector('.ms-left');
    const restartBtn = stage.querySelector('.ms-restart-btn');

    let grid = [], revealed = [], flagged = [], cells = [];
    let gameOver = false, firstClick = true, revealedCount = 0;

    // 初始化：一次性创建所有格子 DOM，存储引用
    function initBoard() {
      grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
      revealed = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
      flagged = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
      cells = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
      gameOver = false; firstClick = true; revealedCount = 0;
      leftEl.textContent = MINES;

      const frag = document.createDocumentFragment();
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = document.createElement('button');
          cell.className = 'ms-cell';
          cell.type = 'button';
          cell.style.width = cellSize + 'px';
          cell.style.height = cellSize + 'px';
          cell.style.fontSize = (cellSize * 0.45) + 'px';
          cell.dataset.r = r;
          cell.dataset.c = c;
          cells[r][c] = cell;
          frag.appendChild(cell);
        }
      }
      board.appendChild(frag);
    }

    // 只更新单个格子的显示，不重建 DOM
    function updateCell(r, c) {
      const cell = cells[r][c];
      if (!cell) return;
      cell.className = 'ms-cell';
      cell.style.width = cellSize + 'px';
      cell.style.height = cellSize + 'px';
      cell.style.fontSize = (cellSize * 0.45) + 'px';
      cell.textContent = '';
      if (revealed[r][c]) {
        cell.classList.add('revealed');
        if (grid[r][c] === -1) cell.textContent = '💣';
        else if (grid[r][c] > 0) { cell.textContent = grid[r][c]; cell.classList.add('n' + grid[r][c]); }
      } else if (flagged[r][c]) {
        cell.textContent = '🚩';
      }
    }

    function placeMines(safeR, safeC) {
      let placed = 0;
      while (placed < MINES) {
        const r = Math.floor(Math.random() * ROWS), c = Math.floor(Math.random() * COLS);
        if (grid[r][c] === -1) continue;
        if (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1) continue;
        grid[r][c] = -1; placed++;
      }
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (grid[r][c] === -1) continue;
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && grid[nr][nc] === -1) count++;
        }
        grid[r][c] = count;
      }
    }

    // 递归翻开，只更新被修改的格子
    function reveal(r, c) {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
      if (revealed[r][c] || flagged[r][c]) return;
      revealed[r][c] = true; revealedCount++;
      updateCell(r, c);
      if (grid[r][c] === 0) {
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          reveal(r + dr, c + dc);
        }
      }
    }

    function checkWin() {
      if (revealedCount === ROWS * COLS - MINES) {
        gameOver = true;
        msg.textContent = t.msWin;
      }
    }

    // 事件委托：只在 board 上添加一个监听器
    function handleClick(e) {
      const cell = e.target.closest('.ms-cell');
      if (!cell || gameOver) return;
      const r = parseInt(cell.dataset.r), c = parseInt(cell.dataset.c);
      if (revealed[r][c] || flagged[r][c]) return;
      if (firstClick) { placeMines(r, c); firstClick = false; }
      if (grid[r][c] === -1) {
        gameOver = true;
        for (let rr = 0; rr < ROWS; rr++) for (let cc = 0; cc < COLS; cc++) {
          if (grid[rr][cc] === -1) { revealed[rr][cc] = true; updateCell(rr, cc); }
        }
        msg.textContent = t.msGameOver;
        return;
      }
      reveal(r, c);
      checkWin();
    }

    function handleContextMenu(e) {
      e.preventDefault();
      const cell = e.target.closest('.ms-cell');
      if (!cell || gameOver) return;
      const r = parseInt(cell.dataset.r), c = parseInt(cell.dataset.c);
      if (revealed[r][c]) return;
      flagged[r][c] = !flagged[r][c];
      updateCell(r, c);
      const flagCount = flagged.flat().filter(Boolean).length;
      leftEl.textContent = MINES - flagCount;
    }

    restartBtn.addEventListener('click', () => {
      board.removeEventListener('click', handleClick);
      board.removeEventListener('contextmenu', handleContextMenu);
      stage.innerHTML = '<div class="ms-diff"><p class="ms-diff-title">' + t.msSelectDifficulty + '</p><div class="ms-diff-btns"><button class="ms-diff-btn" data-diff="easy">😊 ' + t.msEasy + '<br><small>9×9 · 10' + t.msMines + '</small></button><button class="ms-diff-btn" data-diff="medium">😐 ' + t.msMedium + '<br><small>12×12 · 25' + t.msMines + '</small></button><button class="ms-diff-btn" data-diff="hard">😈 ' + t.msHard + '<br><small>16×16 · 50' + t.msMines + '</small></button></div></div>';
      stage.querySelectorAll('.ms-diff-btn').forEach(b => b.addEventListener('click', () => initGame(b.dataset.diff)));
      msg.textContent = '';
    });

    initBoard();
    board.addEventListener('click', handleClick);
    board.addEventListener('contextmenu', handleContextMenu);
  }
  return () => {};
}

/* ===== 小恐龙游戏（Chrome Dino 风格） ===== */
function startRunner(stage, msg) {
  const t = gameT();
  stage.innerHTML = '<canvas class="runner-canvas" width="480" height="240"></canvas><div class="runner-info">' + t.runnerControls + ' · ' + t.runnerCoins + ': <span class="runner-coins">0</span> · ' + t.snakeScore + ': <span class="runner-score">0</span> · ' + t.runnerBest + ': <span class="runner-best">0</span></div><button class="runner-start-btn" type="button">▶ ' + t.snakeStart + '</button>';
  const cv = stage.querySelector('.runner-canvas');
  const ctx = cv.getContext('2d');
  const startBtn = stage.querySelector('.runner-start-btn');
  const W = 480, H = 240, GROUND_Y = 200;
  const scoreEl = stage.querySelector('.runner-score');
  const coinsEl = stage.querySelector('.runner-coins');
  const bestEl = stage.querySelector('.runner-best');
  let best = parseInt(localStorage.getItem('zelm_runner_best') || '0');
  bestEl.textContent = best;
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = W; bgCanvas.height = H;
  const bgCtx = bgCanvas.getContext('2d');
  (function() {
    const isLight = themeIsLight();
    const grad = bgCtx.createLinearGradient(0, 0, 0, H);
    if (isLight) {
      grad.addColorStop(0, '#e8f5ec'); grad.addColorStop(0.4, '#d8ecde');
      grad.addColorStop(0.7, '#c8e0d0'); grad.addColorStop(1, '#b8d4c0');
    } else {
      grad.addColorStop(0, '#0a1628'); grad.addColorStop(0.4, '#0d2833');
      grad.addColorStop(0.7, '#0f3a3d'); grad.addColorStop(1, '#134d45');
    }
    bgCtx.fillStyle = grad; bgCtx.fillRect(0, 0, W, H);
    bgCtx.fillStyle = isLight ? 'rgba(100, 160, 130, 0.4)' : 'rgba(20, 80, 75, 0.5)';
    bgCtx.beginPath(); bgCtx.moveTo(0, GROUND_Y);
    bgCtx.lineTo(60, 140); bgCtx.lineTo(120, 170); bgCtx.lineTo(180, 120);
    bgCtx.lineTo(240, 155); bgCtx.lineTo(300, 110); bgCtx.lineTo(360, 145);
    bgCtx.lineTo(420, 125); bgCtx.lineTo(480, 160); bgCtx.lineTo(480, GROUND_Y);
    bgCtx.closePath(); bgCtx.fill();
    bgCtx.fillStyle = isLight ? 'rgba(80, 140, 110, 0.5)' : 'rgba(15, 60, 55, 0.7)';
    bgCtx.beginPath(); bgCtx.moveTo(0, GROUND_Y);
    bgCtx.lineTo(80, 165); bgCtx.lineTo(160, 185); bgCtx.lineTo(240, 150);
    bgCtx.lineTo(320, 175); bgCtx.lineTo(400, 155); bgCtx.lineTo(480, 180);
    bgCtx.lineTo(480, GROUND_Y); bgCtx.closePath(); bgCtx.fill();
    for (let i = 0; i < 15; i++) {
      bgCtx.fillStyle = isLight ? 'rgba(255, 255, 255, ' + (0.3 + (i % 5) * 0.15) + ')' : 'rgba(79, 240, 208, ' + (0.2 + (i % 5) * 0.1) + ')';
      bgCtx.beginPath(); bgCtx.arc((i * 37) % W, 20 + (i * 23) % 120, 1 + (i % 3), 0, Math.PI * 2); bgCtx.fill();
    }
    bgCtx.fillStyle = isLight ? '#a8d0b8' : '#1a4d3a'; bgCtx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    bgCtx.fillStyle = isLight ? '#88c0a0' : '#2d7a5a'; bgCtx.fillRect(0, GROUND_Y, W, 4);
  })();
  let dino = { x: 60, y: GROUND_Y - 52, w: 50, h: 52, vy: 0, jumping: false, ducking: false, duckTimer: 0 };
  let obstacles = [], coins = [], particles = [];
  let score = 0, coinCount = 0, speed = 3.5, alive = true, started = false, timer = null, frame = 0, groundOffset = 0;
  const GRAVITY = 0.7, JUMP_FORCE = -13;
  function jump() { if (!dino.jumping && !dino.ducking && alive && started) { dino.vy = JUMP_FORCE; dino.jumping = true; } }
  function duck() { if (!dino.jumping && alive && started && !dino.ducking) { dino.ducking = true; dino.duckTimer = 30; dino.h = 30; dino.y = GROUND_Y - 30; } }
  function spawnObstacle() {
    if (Math.random() < 0.65) {
      const h = 22 + Math.random() * 20;
      obstacles.push({ x: W, y: GROUND_Y - h, w: 20 + Math.random() * 10, h, type: 'ground', variant: Math.floor(Math.random() * 3) });
    } else {
      obstacles.push({ x: W, y: GROUND_Y - 58, w: 28, h: 22, type: 'air' });
    }
  }
  function spawnCoin() { coins.push({ x: W, y: GROUND_Y - 35 - Math.random() * 55, collected: false, anim: Math.random() * Math.PI * 2 }); }
  function addParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) particles.push({ x, y, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5 - 2, life: 18, color });
    if (particles.length > 50) particles = particles.slice(-50);
  }
  /* ---------------- 恐龙造型（对齐 Chrome Dino） ----------------
   * 原版是 44×47 的**像素剪影**：单色、头顶朝右、眼睛是挖空的方孔、
   * 左侧一条粗尾、两条腿；跑动只有两帧交替。
   * 这里用 25×26 的像素位图逐格还原（数据取自公开的 Chrome-style
   * 小恐龙位图，逐位对应），下蹲则把站立造型横向拉宽、纵向压扁
   * （原版下蹲 59×30，比站立更宽更矮）。
   */
  const DINO_PX = 2;                    // 每格画 2×2 显示像素 → 50×52
  const DINO_ART = [
    '.........................',
    '.............##########..',
    '.............##.########.',
    '............###.########.',
    '............############.',
    '............############.',
    '............############.',
    '............######.......',
    '............##########...',
    '.#..........######.......',
    '.#.........######........',
    '.#.......########........',
    '.##.....###########......',
    '.###...##########.#......',
    '.################........',
    '.################........',
    '.################........',
    '..##############.........',
    '...#############.........',
    '....###########..........',
    '......########...........',
    '.......###.###...........',
    '.......##...##...........',
    '.......##...##...........',
    '.......#....##...........',
    '.......##...###..........',
  ];
  const DINO_RUN_A = [
    '.........................',
    '.............##########..',
    '.............##.########.',
    '............###.########.',
    '............############.',
    '............############.',
    '............############.',
    '............######.......',
    '............##########...',
    '.#..........######.......',
    '.#.........######........',
    '.#.......########........',
    '.##.....###########......',
    '.###...##########.#......',
    '.################........',
    '.################........',
    '.################........',
    '..##############.........',
    '...#############.........',
    '....###########..........',
    '......########...........',
    '.......###.###...........',
    '.......##...##...........',
    '.......##...##...........',
    '............##...........',
    '............###..........',
  ];
  const DINO_RUN_B = [
    '.........................',
    '.............##########..',
    '.............##.########.',
    '............###.########.',
    '............############.',
    '............############.',
    '............############.',
    '............######.......',
    '............##########...',
    '.#..........######.......',
    '.#.........######........',
    '.#.......########........',
    '.##.....###########......',
    '.###...##########.#......',
    '.################........',
    '.################........',
    '.################........',
    '..##############.........',
    '...#############.........',
    '....###########..........',
    '......########...........',
    '.......###.###...........',
    '.......##...##...........',
    '.......##...##...........',
    '.......#.................',
    '.......##................',
  ];

  /** 按位图绘制。把同一行相邻的实心格并成一次 fillRect，减少绘制调用。 */
  function drawDinoArt(art, ox, oy) {
    for (let r = 0; r < art.length; r++) {
      const row = art[r];
      let c = 0;
      while (c < row.length) {
        if (row[c] === '#') {
          let run = 1;
          while (c + run < row.length && row[c + run] === '#') run++;
          ctx.fillRect(ox + c * DINO_PX, oy + r * DINO_PX, run * DINO_PX, DINO_PX);
          c += run;
        } else c++;
      }
    }
  }

  function drawDino() {
    // 原版是纯单色剪影，眼睛靠位图里的挖空表现 —— 不做肚皮高光、不做瞳孔
    ctx.fillStyle = themeIsLight() ? '#4f5a4f' : '#e9f1e9';
    const x = dino.x, y = dino.y;
    if (dino.ducking) {
      // 趴下：横向拉宽、纵向压扁，底边对齐
      ctx.save();
      ctx.translate(x, y + dino.h);
      ctx.scale(1.3, 0.55);
      drawDinoArt(DINO_ART, 0, -26 * DINO_PX);
      ctx.restore();
      return;
    }
    const running = started && alive && !dino.jumping;
    const useB = running && Math.floor(frame / 5) % 2 === 1;
    drawDinoArt(useB ? DINO_RUN_B : (running ? DINO_RUN_A : DINO_ART), x, y);
  }
  function drawObstacle(o) {
  if (o.type === 'ground') {
    const x = o.x, y = o.y, w = o.w, h = o.h;
    const light = themeIsLight();
    const cMain = light ? '#2e8b57' : '#3fae6e';
    const cDark = light ? '#1f6b41' : '#2c7d4f';
    const cw = Math.min(w, 16);
    const cx = x + (w - cw) / 2;
    ctx.fillStyle = cMain;
    ctx.fillRect(cx, y, cw * 0.5, h);
    ctx.fillRect(cx - 4, y + h * 0.4, 4, h * 0.22);
    ctx.fillRect(cx - 4, y + h * 0.2, 4, h * 0.22);
    ctx.fillRect(cx + cw * 0.5, y + h * 0.5, 4, h * 0.2);
    ctx.fillRect(cx + cw * 0.5 + 4, y + h * 0.3, 4, h * 0.2);
    ctx.fillStyle = cDark;
    ctx.fillRect(cx + cw * 0.18, y + 3, 2, h - 6);
  } else {
    const x = o.x, y = o.y, w = o.w, h = o.h;
    const light = themeIsLight();
    const pCol = light ? '#7a3fb8' : '#b98bff';
    const flap = Math.sin(frame * 0.18) * 0.6;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.fillStyle = pCol;
    ctx.beginPath(); ctx.ellipse(0, 0, w * 0.28, h * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    const wy = flap * 12;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(-w * 0.6, -h * 0.35 - wy); ctx.lineTo(-w * 0.2, 0); ctx.lineTo(-w * 0.6, h * 0.3 + wy); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(w * 0.6, -h * 0.35 - wy); ctx.lineTo(w * 0.2, 0); ctx.lineTo(w * 0.6, h * 0.3 + wy); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(w * 0.2, -h * 0.1); ctx.lineTo(w * 0.7, -h * 0.18); ctx.lineTo(w * 0.2, h * 0.04); ctx.closePath(); ctx.fill();
    ctx.fillStyle = light ? '#fff' : '#0a1628';
    ctx.beginPath(); ctx.arc(w * 0.1, -h * 0.08, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
  function draw() {
    ctx.drawImage(bgCanvas, 0, 0);
    // 飘动的云（速度感 + 层次）
    ctx.fillStyle = themeIsLight() ? 'rgba(255, 255, 255, 0.8)' : 'rgba(79, 240, 208, 0.06)';
    [[((frame * 0.3) % (W + 90)) - 45, 26], [(((frame * 0.2) + 180) % (W + 90)) - 45, 64]].forEach(c => {
      ctx.beginPath();
      ctx.arc(c[0], c[1], 12, 0, Math.PI * 2);
      ctx.arc(c[0] + 14, c[1] - 5, 10, 0, Math.PI * 2);
      ctx.arc(c[0] + 28, c[1], 12, 0, Math.PI * 2);
      ctx.fill();
    });
    // 移动的地面纹理（速度感）
    ctx.fillStyle = themeIsLight() ? 'rgba(28, 75, 50, 0.25)' : 'rgba(79, 240, 208, 0.16)';
    for (let i = -20; i < W + 20; i += 20) {
      const ox = i - (groundOffset % 20);
      ctx.fillRect(ox, GROUND_Y + 8, 8, 2);
      ctx.fillRect(ox + 10, GROUND_Y + 16, 6, 2);
    }
    coins.forEach(coin => {
      if (coin.collected) return;
      coin.anim += 0.12;
      const bobY = Math.sin(coin.anim) * 4;
      const scale = Math.abs(Math.cos(coin.anim));
      ctx.save(); ctx.translate(coin.x, coin.y + bobY); ctx.scale(scale, 1);
      ctx.shadowBlur = 10; ctx.shadowColor = accentColor();
      ctx.fillStyle = '#ffd700'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffec8b'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#daa520'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('★', 0, 1);
      ctx.restore();
    });
    obstacles.forEach(o => drawObstacle(o));
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      ctx.globalAlpha = p.life / 18; ctx.fillStyle = p.color; ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
    drawDino();
    if (!started || !alive) {
      ctx.fillStyle = themeIsLight() ? 'rgba(255, 255, 255, 0.8)' : 'rgba(10, 22, 40, 0.75)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = themeIsLight() ? '#2d7a5a' : accentColor(); ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center';
      if (!started) {
        ctx.fillText(t.runnerTitle, W/2, H/2 - 20);
        ctx.font = '13px monospace'; ctx.fillStyle = themeIsLight() ? '#4a6b55' : '#8b94a3';
        ctx.fillText(t.runnerControls, W/2, H/2 + 5);
        ctx.fillText(t.runnerHint, W/2, H/2 + 24);
      } else {
        ctx.fillText(t.runnerGameOver, W/2, H/2 - 15);
        ctx.font = '14px monospace'; ctx.fillStyle = themeIsLight() ? '#1a2e22' : '#fff';
        ctx.fillText(t.runnerCoins + ': ' + coinCount + ' · ' + t.snakeScore + ': ' + score, W/2, H/2 + 10);
        ctx.font = '12px monospace'; ctx.fillStyle = themeIsLight() ? '#4a6b55' : '#8b94a3';
        ctx.fillText(t.runnerClickRestart, W/2, H/2 + 32);
      }
    }
    // 游戏中的 HUD：右上角实时计分
    if (started && alive) {
      ctx.fillStyle = themeIsLight() ? '#1a2e22' : '#eef3ee';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(t.snakeScore + ': ' + score + '   ' + t.runnerCoins + ': ' + coinCount, W - 12, 8);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }
  function update() {
    if (!alive || !started) return;
    frame++;
    groundOffset = (groundOffset + speed) % 20;
    dino.vy += GRAVITY; dino.y += dino.vy;
    const normalH = dino.ducking ? 30 : 52;
    const wasFalling = dino.vy > 3;
    if (dino.y >= GROUND_Y - normalH) {
      dino.y = GROUND_Y - normalH; dino.vy = 0; dino.jumping = false;
      if (wasFalling) addParticles(dino.x + dino.w / 2, GROUND_Y - 2, themeIsLight() ? 'rgba(120, 140, 120, 0.6)' : 'rgba(200, 200, 180, 0.55)', 4); // 落地扬尘
    }
    if (dino.ducking) { dino.duckTimer--; if (dino.duckTimer <= 0) { dino.ducking = false; dino.h = 52; dino.y = GROUND_Y - 52; } }
    if (frame % Math.max(50, 110 - Math.floor(score / 10)) === 0) spawnObstacle();
    obstacles.forEach(o => o.x -= speed); obstacles = obstacles.filter(o => o.x + o.w > 0);
    if (frame % 90 === 0 && Math.random() < 0.55) spawnCoin();
    coins.forEach(c => c.x -= speed); coins = coins.filter(c => c.x > -20 && !c.collected);
    for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life--; if (p.life <= 0) particles.splice(i, 1); }
    coins.forEach(coin => {
      if (coin.collected) return;
      const dx = (dino.x + dino.w/2) - coin.x; const dy = (dino.y + dino.h/2) - coin.y;
      if (Math.sqrt(dx*dx + dy*dy) < 26) {
        coin.collected = true; coinCount++; coinsEl.textContent = coinCount; score += 5; scoreEl.textContent = score;
        addParticles(coin.x, coin.y, '#ffd700', 6);
      }
    });
    obstacles.forEach(o => {
      // 宽容碰撞盒：比可见剪影小一圈（原版 Chrome 也是这么做的，手感更公正）
      const cl = dino.x + 8, cr = dino.x + dino.w - 10, ct = dino.y + 8, cb = dino.y + dino.h;
      if (cr > o.x && cl < o.x + o.w && cb > o.y && ct < o.y + o.h) {
        alive = false;
        if (score > best) { best = score; localStorage.setItem('zelm_runner_best', best); bestEl.textContent = best; }
        msg.textContent = t.runnerGameOverMsg + coinCount + t.runnerScoreMsg + score;
        startBtn.textContent = '🔄 ' + t.snakeRestart; startBtn.hidden = false;
        addParticles(dino.x + dino.w/2, dino.y + dino.h/2, '#ff6b6b', 10);
      }
    });
    if (frame % 7 === 0) { score++; scoreEl.textContent = score; }
    speed = 3.5 + Math.min(3.5, score / 120);
    draw();
  }
  function key(e) {
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') { e.preventDefault(); jump(); }
    else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'Control') { e.preventDefault(); if (alive && started) duck(); }
  }
  function startGame() {
    if (!alive) {
      dino = { x: 60, y: GROUND_Y - 52, w: 50, h: 52, vy: 0, jumping: false, ducking: false, duckTimer: 0 };
      obstacles = []; coins = []; particles = []; score = 0; coinCount = 0; frame = 0; speed = 3.5; alive = true;
      scoreEl.textContent = '0'; coinsEl.textContent = '0'; msg.textContent = '';
    }
    started = true; startBtn.hidden = true;
    if (timer) clearInterval(timer);
    timer = setInterval(update, 1000 / 60);
    draw();
  }
  startBtn.addEventListener('click', startGame);
  // 移动端：点击/触摸画布即可跳跃（键盘在手机上不可用）
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); jump(); });
  draw();
  onWin('keydown', key);
  return () => { clearInterval(timer); window.removeEventListener('keydown', key); };
}
/* ======================= 引擎登记与挂载 ======================= */

/** 列表里展示的游戏（原站 GAMES；顺序与图标一致） */
export const GAMES = [
  { id: 'memory', name: '记忆翻牌', icon: '🃏' },
  { id: 'snake', name: '贪吃蛇', icon: '🐍' },
  { id: 'tetris', name: '俄罗斯方块', icon: '🧱' },
  { id: 'minesweeper', name: '扫雷', icon: '💣' },
  { id: 'runner', name: '小恐龙', icon: '🦖' },
];

/* 游戏 id 对应的文案键（列表与弹窗标题都用它取名） */
export const GAME_NAME_KEYS = {
  memory: 'gameMemory',
  snake: 'gameSnake',
  tetris: 'gameTetris',
  minesweeper: 'gameMinesweeper',
  runner: 'gameRunner',
};

/* 注：原站曾有一个「猜数字」引擎 startGuess，但从未登记进 GAMES、也无入口调用，
 * 属于不可达代码，已在 2026-09-22 清理移除。 */
const ENGINES = {
  memory: startMemory,
  snake: startSnake,
  tetris: startTetris,
  minesweeper: startMinesweeper,
  runner: startRunner,
};

/**
 * 打开一局游戏：把引擎挂到 stage 上，返回销毁函数。
 * @param {string} id    游戏 id（GAMES 里的 id）
 * @param {HTMLElement} stage 游戏舞台容器
 * @param {HTMLElement} msg   消息行容器
 * @returns {() => void} 销毁函数（关闭弹窗时调用）
 */
export function mountGame(id, stage, msg) {
  releaseListeners();                       // 清掉上一局可能残留的监听
  const fn = ENGINES[id];
  const cleanup = fn ? fn(stage, msg) : null;
  return function destroy() {
    try { if (cleanup) cleanup(); } catch (e) { console.error('[game]', e); }
    releaseListeners();
  };
}
