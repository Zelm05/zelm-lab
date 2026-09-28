/* 动态板块修复的真机验证脚本（Playwright + 真实 Edge channel）。
   验证项：
   ① 内层动态卡片跟随配色方案（截图对比 data-scheme 切换前后）
   ② 附件文字按钮按类型显示、位于正文下方
   ③ PDF 按钮点击 → 同源代理 iframe 预览
   ④ 图片按钮点击 → 大图查看器
   产出截图到 .workbuddy/shots/moment-verify/ */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:8788';
const OUT = path.join(__dirname, '..', '.workbuddy', 'shots', 'moment-verify');
fs.mkdirSync(OUT, { recursive: true });

/* 最小可用 PDF（1 页 + 一行文字），用于本地回放 file-proxy 响应 */
const MIN_PDF = Buffer.from(
  '%PDF-1.4\n' +
  '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 120]/Contents 4 0 R>>endobj\n' +
  '4 0 obj<</Length 44>>stream\nBT /F1 14 Tf 20 60 Td (moment pdf preview ok) Tj ET\nendstream\nendobj\n' +
  'trailer<</Root 1 0 R>>\n%%EOF',
  'binary',
);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  /* 本地测试账号登录（⚠️ cookie 带 Secure，必须走页面内 fetch —— 127.0.0.1 属
     potentially-trustworthy origin，浏览器才肯保存/回传 Secure cookie） */
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  const loginStatus = await page.evaluate(async (b) => {
    const r = await fetch(b + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username: 'verify_zelm', password: 'Verify#2026zelm' }),
    });
    return r.status;
  }, BASE);
  console.log('[登录] /api/login:', loginStatus);
  if (loginStatus !== 200) process.exit(1);

  await page.goto(BASE + '/#/about', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  /* 关于页密码门（本地站点密码 1234，SHA-256 存 D1 site_secrets）→ 过门后才见正文 */
  if (await page.locator('#aboutGate:not([hidden])').count()) {
    await page.fill('#gateInput', '1234');
    await page.click('#gateBtn');
    await page.waitForTimeout(1200);
    console.log('[门控] 密码门已通过，showMain =', await page.evaluate(() => !document.getElementById('aboutMain').hidden));
  }
  await page.waitForTimeout(1500);
  const momentsEl = page.locator('#moments');
  await momentsEl.scrollIntoViewIfNeeded();
  await page.waitForSelector('.moment-item', { timeout: 15000 });

  /* ---- ① 附件按钮：文案 / 位置 ---- */
  const cards = await page.locator('.moment-item').count();
  const btns = await page.locator('.moment-file-btn').allTextContents();
  console.log('[①] 动态卡片数:', cards);
  console.log('[①] 附件按钮文案:', JSON.stringify(btns));
  /* 按钮是否在正文下方（DOM 顺序：moment-content 先于 moment-attachments） */
  const orderOk = await page.evaluate(() => {
    const item = document.querySelector('.moment-item');
    const c = item.querySelector('.moment-content');
    const a = item.querySelector('.moment-attachments');
    return !!(c && a && (c.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  console.log('[①] 按钮位于正文下方:', orderOk);
  /* 旧形态应已消失：缩略图列 / 内联图标贴片 */
  console.log('[①] 旧缩略图 .moment-imgs 残留:', await page.locator('.moment-imgs').count());
  console.log('[①] 旧内联贴片 .moment-file-inline 残留:', await page.locator('.moment-file-inline').count());
  /* 卡片颜色是否走 CSS 变量 */
  const cardBg = await page.evaluate(() => getComputedStyle(document.querySelector('.moment-item')).backgroundColor);
  console.log('[①] 卡片背景（应为 --surface 半透明值）:', cardBg);

  /* ---- ② 配色方案跟随：逐个 scheme 截图同一卡片 ---- */
  const schemes = ['default', 'sunset', 'ocean', 'sakura'];
  for (const s of schemes) {
    await page.evaluate((sc) => {
      if (sc === 'default') document.documentElement.removeAttribute('data-scheme');
      else document.documentElement.setAttribute('data-scheme', sc);
    }, s);
    await page.waitForTimeout(400);
    const border = await page.evaluate(() => getComputedStyle(document.querySelector('.moment-item')).borderColor);
    const btnBg = await page.evaluate(() => getComputedStyle(document.querySelector('.moment-file-btn')).backgroundColor);
    console.log(`[②] scheme=${s} 卡片边框: ${border} | 按钮背景: ${btnBg}`);
    await page.locator('.moments-list').screenshot({ path: path.join(OUT, `moments-${s}.png`) });
  }

  /* ---- ③ PDF 预览弹窗 ----
     ⚠️ 本沙箱无法直连 Supabase 上游（file-proxy 会 502/挂起），故这里用 Playwright
     路由拦截 /api/file-proxy 并回放一份真实 PDF 验证 **前端行为**（iframe 内嵌渲染、
     Esc 关闭）。代理本身的头改写逻辑已有 tests/file-proxy.test.js 7 例单测覆盖，
     且线上环境（Cloudflare 边缘）不受本地网络限制。 */
  await page.route('**/api/file-proxy?**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'Content-Disposition': 'inline' }, body: MIN_PDF });
  });
  await page.click('.moment-file-btn:has-text("查看 PDF")');
  await page.waitForSelector('.moment-viewer-frame', { timeout: 10000 });
  await page.waitForTimeout(4000); /* 等 PDF 在浏览器查看器里渲染 */
  const pdfSrc = await page.getAttribute('.moment-viewer-frame', 'src');
  console.log('[③] PDF iframe src（应同源 /api/file-proxy）:', pdfSrc);
  await page.screenshot({ path: path.join(OUT, 'pdf-viewer.png') });
  /* Esc 关闭 */
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  console.log('[③] Esc 关闭后查看器残留:', await page.locator('.moment-viewer').count());

  /* ---- ④ 图片大图查看器 ---- */
  await page.click('.moment-file-btn:has-text("查看图片")');
  await page.waitForSelector('.moment-viewer-img', { timeout: 10000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, 'img-viewer.png') });
  const imgVisible = await page.locator('.moment-viewer-img').isVisible();
  const natural = await page.evaluate(() => {
    const im = document.querySelector('.moment-viewer-img');
    return im ? { nw: im.naturalWidth, ok: im.complete } : null;
  });
  console.log('[④] 图片查看器可见:', imgVisible, '加载:', JSON.stringify(natural));
  await page.keyboard.press('Escape');

  /* ---- ⑤ 移动端 390×844 ---- */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await page.click('.moment-file-btn:has-text("查看图片")');
  await page.waitForTimeout(1500);
  const ovW = await page.evaluate(() => document.querySelector('.moment-viewer-ov').getBoundingClientRect().width);
  console.log('[⑤] 移动端遮罩宽度（应=390，无横向溢出）:', ovW);
  await page.screenshot({ path: path.join(OUT, 'mobile-img-viewer.png') });
  await page.keyboard.press('Escape');

  await browser.close();
  console.log('DONE ->', OUT);
})().catch((e) => { console.error('VERIFY_FAIL:', e.message); process.exit(1); });
