/**
 * convert-pdfs-to-webp.mjs
 * ──────────────────────────────────────────────────────────────────
 * 零配置「上传后自动后台转长图」工具（本地批处理版）。
 *
 * 干什么：把目录里的每个 PDF 渲染成「一张竖向长图」并输出为 WebP，
 *         文件名自动取为 <原名>.long.webp（与线上 Moments 的 longImageRef 约定一致）。
 *         下载 / 展示逻辑前端已写好：展示走 .long.webp，下载仍是原 PDF。
 *
 * 为什么这么做：移动端 iframe/直链看 PDF 体验差（白屏、强制下载、排版乱）；
 *              发布时把 PDF 先转成适合手机竖屏阅读的长图，网页里直接 <img> 内嵌，
 *              丝滑顺畅；用户要下载时给的仍是原 PDF 文件。
 *
 * 零配置：宽度 / 清晰度 / 格式 / 质量全部写死在下方 DEFAULTS 里，无需任何设置。
 *
 * 用法：
 *   node scripts/convert-pdfs-to-webp.mjs [目录] [--watch]
 *   目录省略时用当前工作目录；--watch 开启后台监视（目录里新增 PDF 自动转）。
 *
 * 依赖（项目已装）：pdfjs-dist（渲染）、@napi-rs/canvas（离屏画布）、sharp（编码 WebP）。
 * 注意：本脚本为本地离线工具，不经过 Cloudflare Worker，也不消耗任何线上额度。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createCanvas } from '@napi-rs/canvas';
import sharp from 'sharp';

const require = createRequire(import.meta.url);

// pdfjs 在 Node 下需要几个 canvas 相关的全局类（@napi-rs/canvas 与 node-canvas API 兼容）
for (const name of ['Path2D', 'ImageData', 'CanvasGradient', 'CanvasPattern']) {
  if (globalThis[name] === undefined) {
    try { globalThis[name] = require('@napi-rs/canvas')[name]; } catch { /* 忽略缺失 */ }
  }
}

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
// worker 必须给合法的 file:// URL（Windows 裸 d:\ 路径会被 ESM loader 拒绝）
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
  require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
).href;

// ── 固定默认参数（零配置，不需要用户设置）────────────────────────────
const DEFAULTS = {
  logicalWidth: 1080,   // 逻辑宽度（CSS px），对应手机竖屏舒适阅读宽度
  scale: 2,             // 2x 渲染 → 设备像素 2160，视网膜清晰
  gap: 24,              // 页与页之间的留白（设备像素）
  bg: '#ffffff',        // 长图底色（白）
  webpQuality: 90,      // WebP 质量（0-100）
};

// pdfjs 在 Node 用的离屏画布工厂（适配 @napi-rs/canvas，API 与 node-canvas 一致）
class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext('2d') };
  }
  reset(obj, width, height) {
    obj.canvas.width = width;
    obj.canvas.height = height;
  }
  destroy(obj) {
    obj.canvas.width = 0;
    obj.canvas.height = 0;
    obj.canvas = null;
    obj.context = null;
  }
}

async function convertOne(pdfPath, outDir) {
  const stem = path.basename(pdfPath, path.extname(pdfPath));
  const outPath = path.join(outDir, `${stem}.long.webp`);

  // 幂等：已存在则跳过，方便后台重复运行 / watch 不重复转
  if (fs.existsSync(outPath)) {
    return { status: 'skip', outPath };
  }

  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({
    data,
    useWorkerFetch: false, // Node 下尽量主线程渲染，避免 worker 线程兼容问题
    canvasFactory: new NodeCanvasFactory(),
    // 标准 14 字体（Helvetica/Times 等）若 PDF 未内嵌，pdfjs 需要这份数据才能渲染文字
    standardFontDataUrl: pathToFileURL(
      path.resolve(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts'),
    ).href + '/',
  }).promise;

  const deviceW = DEFAULTS.logicalWidth * DEFAULTS.scale;
  let totalH = 0;
  const pages = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const fitScale = deviceW / vp.width;          // 按宽度自适应
    const renderVp = page.getViewport({ scale: fitScale });
    const w = Math.ceil(renderVp.width);
    const h = Math.ceil(renderVp.height);

    const { canvas, context } = factory().create(w, h);
    await page.render({ canvasContext: context, viewport: renderVp, canvasFactory: factory() }).promise;
    pages.push({ canvas, h });
    totalH += h + DEFAULTS.gap;
    page.cleanup();
  }
  totalH -= DEFAULTS.gap; // 末尾去掉一个留白

  // 把各页拼到一张长画布上
  const big = createCanvas(deviceW, totalH);
  const bctx = big.getContext('2d');
  bctx.fillStyle = DEFAULTS.bg;
  bctx.fillRect(0, 0, deviceW, totalH);
  let y = 0;
  for (const p of pages) {
    bctx.drawImage(p.canvas, 0, y);
    y += p.h + DEFAULTS.gap;
  }

  // @napi-rs/canvas 不直接出 webp → 先出 PNG 再由 sharp 编码为 webp
  const png = big.toBuffer('image/png');
  await sharp(png).webp({ quality: DEFAULTS.webpQuality }).toFile(outPath);

  if (typeof doc.destroy === 'function') {
    await doc.destroy();
  }
  const meta = await sharp(outPath).metadata();
  return { status: 'done', outPath, width: meta.width, height: meta.height, pages: doc.numPages };
}

// 小工具：复用同一个工厂实例
let _factory;
function factory() {
  if (!_factory) _factory = new NodeCanvasFactory();
  return _factory;
}

async function run(dir, watch) {
  if (!fs.existsSync(dir)) {
    console.error(`目录不存在：${dir}`);
    process.exit(1);
  }
  const doBatch = async () => {
    const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf'));
    if (!files.length) {
      console.log(`[convert] 目录无 PDF：${dir}`);
      return;
    }
    for (const f of files) {
      const full = path.join(dir, f);
      try {
        const r = await convertOne(full, dir);
        if (r.status === 'skip') console.log(`[convert] 跳过（已存在）: ${r.outPath}`);
        else console.log(`[convert] ✅ ${f} → ${path.basename(r.outPath)} (${r.width}x${r.height}, ${r.pages}页)`);
      } catch (e) {
        console.error(`[convert] ❌ ${f} 失败: ${e.message}`);
      }
    }
  };

  await doBatch();

  if (watch) {
    console.log(`\n[convert] 后台监视已开启：${dir}（新增 PDF 会自动转 .long.webp，Ctrl+C 退出）\n`);
    let timer = null;
    fs.watch(dir, (event, filename) => {
      if (filename && filename.toLowerCase().endsWith('.pdf')) {
        // 防抖：写入未结束时可能触发多次
        clearTimeout(timer);
        timer = setTimeout(() => doBatch(), 400);
      }
    });
  }
}

const dir = process.argv.slice(2).find((a) => !a.startsWith('--')) || process.cwd();
const watch = process.argv.slice(2).includes('--watch');
run(dir, watch);
