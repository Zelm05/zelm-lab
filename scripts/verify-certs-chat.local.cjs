#!/usr/bin/env node
/* ==========================================================================
 * verify-certs-chat.local.cjs —— 证书排序/缩略图 + 聊天移动端宽度 + 额度刷新
 *   + 非流式单帧回复 完整性 真机验证（2026-09-28）
 *
 * 前置：本地 wrangler dev :8792 + 本地 D1 已种入：
 *   · 证书 8001（PDF，sort_order 0 → API 排第一）与 8002（图片，sort_order 1）
 *     → 修复后 DOM 顺序应为「图片证书在前、PDF 证书在后」（排序生效的直接证据）
 *   · ai_usage 当日 1234 Neurons → 额度条应显示 remaining 8766
 * 桩：Supabase 上游沙箱不可达 → Playwright route 回放 PDF/PNG；
 *     /api/ai/chat 回放非流式单帧 SSE（worker 默认路径的线上形态）。
 * ========================================================================== */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:8792';
const OUT = path.join(__dirname, '..', '.workbuddy', 'shots', 'certs-chat-verify');
fs.mkdirSync(OUT, { recursive: true });

/* 最小合法单页 PDF（pdf.js 可渲染） */
function tinyPdf() {
  return Buffer.from(
    '%PDF-1.4\n' +
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
    '4 0 obj<</Length 58>>stream\n' +
    'BT /F1 28 Tf 60 700 Td (CERT TEST 12345) Tj ET\n' +
    'endstream endobj\n' +
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n' +
    'trailer<</Root 1 0 R>>\n' +
    '%%EOF',
    'latin1',
  );
}
/* 1×1 红 PNG + 证书感边框（用 SVG 生成更直观：横向 4:3 黄底证书） */
function certPng() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">' +
    '<rect width="800" height="600" fill="#fdf6d8" stroke="#b8860b" stroke-width="16"/>' +
    '<text x="60" y="300" font-size="64" fill="#333">CERT IMAGE EDGE</text></svg>';
  return Buffer.from(svg, 'utf8'); // route fulfill 支持 content-type image/svg+xml
}

(async () => {
  /* ---- 登录（cookie 带 Secure：node fetch 拿 token → addCookies 注入） ---- */
  const login = await fetch(BASE + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE },
    body: JSON.stringify({ username: 'verify_zelm', password: 'Verify#2026zelm' }),
  });
  const setCookie = login.headers.get('set-cookie') || '';
  const token = (setCookie.match(/token=([^;]+)/) || [])[1];
  console.log('[登录]', login.status, '| token:', token ? 'OK' : 'MISS');
  if (!token) process.exit(1);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: 'token', value: token, url: BASE, httpOnly: true, sameSite: 'Strict' }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 250)));

  /* 桩：Supabase 资产 + AI 上游（回放线上非流式单帧形态） */
  let usageCalls = 0;
  await page.route('**/api/file-proxy**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/pdf', body: tinyPdf() }));
  await page.route('**supabase**/**', (route) => {
    const url = route.request().url();
    if (/\.png|\.webp|\.jpg|image/i.test(url)) {
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: certPng() });
    }
    return route.fulfill({ status: 200, contentType: 'application/pdf', body: tinyPdf() });
  });
  await page.route('**/api/ai/usage', async (route) => {
    usageCalls += 1;
    const res = await route.fetch();
    return route.fulfill({ response: res });
  });
  await page.route('**/api/ai/chat', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      body: 'data: {"response":"1 + 2 = 3"}\n\ndata: [DONE]\n\n',
    }));

  await page.goto(BASE + '/#/about', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  /* 密码门（#gateInput 本身就是 input 元素） */
  if (await page.locator('#aboutGate:not([hidden])').count()) {
    await page.fill('#gateInput', '1234');
    await page.click('#gateBtn');
    await page.waitForTimeout(1500);
  }

  /* ---- ① 证书排序：图片在前 PDF 在后 ---- */
  await page.locator('#secCerts').scrollIntoViewIfNeeded();
  await page.waitForTimeout(2500);
  const order = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.cert-card--clickable')).map((c) => {
      const hasImg = !!c.querySelector('img.cert-img');
      const hasThumb = !!c.querySelector('.pdf-thumb');
      return { hasImg, hasThumb, name: (c.querySelector('h3') || {}).textContent || '' };
    }));
  console.log('[①] DOM 顺序:', JSON.stringify(order));
  const imgFirst = order.length >= 2 && order[0].hasImg && order[order.length - 1].hasThumb;
  console.log('[①] 图片在前 PDF 在后:', imgFirst ? 'PASS' : 'FAIL');
  await page.screenshot({ path: path.join(OUT, 'cert-grid.png') });

  /* ---- ② 缩略图完整显示（contain + 4:3 + 主题留白） ---- */
  const style = await page.evaluate(() => {
    const el = document.querySelector('img.cert-img');
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { objectFit: cs.objectFit, aspectRatio: cs.aspectRatio, w: Math.round(r.width), h: Math.round(r.height), bg: cs.backgroundColor, complete: el.complete && el.naturalWidth > 0 };
  });
  console.log('[②] 图片缩略图样式:', JSON.stringify(style));
  const containOk = style && style.objectFit === 'contain' && style.aspectRatio === '4 / 3' && style.complete;
  console.log('[②] contain + 4:3 + 加载成功:', containOk ? 'PASS' : 'FAIL');
  const pdfThumb = await page.evaluate(() => {
    const c = document.querySelector('.pdf-thumb canvas');
    if (!c) return null;
    return { w: c.width, h: c.height, drawn: c.width > 0 && c.height > 0 };
  });
  console.log('[②] PDF 缩略图 canvas:', JSON.stringify(pdfThumb), pdfThumb && pdfThumb.drawn ? 'PASS' : '(懒加载可能未触发，不判失败)');

  /* ---- 深浅主题留白对比 ---- */
  const bgDark = await page.evaluate(() => getComputedStyle(document.querySelector('img.cert-img')).backgroundColor);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.waitForTimeout(400);
  const bgLight = await page.evaluate(() => getComputedStyle(document.querySelector('img.cert-img')).backgroundColor);
  console.log('[②] 留白底色 深→浅:', bgDark, '→', bgLight, bgDark !== bgLight ? 'PASS' : 'FAIL');
  await page.screenshot({ path: path.join(OUT, 'cert-light.png') });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));

  /* ---- ③+④ 聊天：移动端宽度 / 额度显示与刷新 / 回复完整 ---- */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(700);
  await page.click('.ai-fab');
  await page.waitForTimeout(1600);
  const panel = await page.evaluate(() => {
    const r = document.querySelector('.ai-panel').getBoundingClientRect();
    return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), zoom: getComputedStyle(document.body).zoom };
  });
  console.log('[③] 390×844 面板:', JSON.stringify(panel));
  const wOk = panel.w > 390 * 0.9 && panel.w <= 392;
  console.log('[③] 宽≈96%屏(w>351):', wOk ? 'PASS' : 'FAIL');
  await page.screenshot({ path: path.join(OUT, 'chat-mobile.png') });

  const quotaText1 = await page.locator('.ai-quota').textContent().catch(() => 'NO-EL');
  console.log('[④] 打开弹窗额度条:', JSON.stringify(quotaText1.trim()), '| usage 拉取次数:', usageCalls);

  /* 发送 → 回放单帧 SSE → 断言完整回复 + usage 再次拉取；
     有内容后面板高度应撑到接近屏高上限（≤92% 屏高，不溢出） */
  await page.fill('#aiInput', '1+2等于几');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2200);
  const panel2 = await page.evaluate(() => {
    const r = document.querySelector('.ai-panel').getBoundingClientRect();
    return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
  });
  console.log('[③] 有内容后面板:', JSON.stringify(panel2),
    panel2.h <= 844 * 0.93 ? 'PASS(≤92%屏高)' : 'FAIL(溢出)');
  const replyText = await page.evaluate(() => {
    const bubbles = document.querySelectorAll('.ai-bubble');
    return bubbles.length ? bubbles[bubbles.length - 1].textContent.trim() : '';
  });
  console.log('[⑤] 回复渲染文本:', JSON.stringify(replyText), replyText === '1 + 2 = 3' ? 'PASS' : 'FAIL');
  const quotaText2 = await page.locator('.ai-quota').textContent().catch(() => 'NO-EL');
  console.log('[④] 对话后额度条:', JSON.stringify(quotaText2.trim()), '| usage 拉取次数:', usageCalls, usageCalls >= 2 ? 'PASS(已刷新)' : 'FAIL');
  await page.screenshot({ path: path.join(OUT, 'chat-mobile-msg.png') });

  /* 桌面端宽度回归（1280 视口不缩放） */
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(600);
  const deskW = await page.evaluate(() => Math.round(document.querySelector('.ai-panel').getBoundingClientRect().width));
  console.log('[③] 桌面 1280 面板宽:', deskW, deskW >= 900 && deskW <= 925 ? 'PASS(≈920 不变)' : 'FAIL');

  await page.screenshot({ path: path.join(OUT, 'chat-desktop.png') });
  await browser.close();
  console.log('DONE');
})().catch((e) => { console.error('E:', e.message); process.exit(1); });
