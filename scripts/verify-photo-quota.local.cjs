/* ==========================================================================
 * scripts/verify-photo-quota.local.cjs —— 本轮两项修复的真机验证（本地 wrangler dev :8788）
 *
 * ① 照片墙浅色主题：.drift-wall 背景/遮罩在深浅主题下的计算样式对比 + 截图
 * ② AI 剩余额度：/api/ai/usage 返回 + 弹窗额度条显示 + 四语切换
 *
 * 前置（已由调用方完成）：
 *   · 本地 D1 已应用 migration-029（ai_usage 表）
 *   · ai_usage 已种入当日 1234 Neurons
 *   · 测试账号 verify_zelm 已注册（登录在脚本内完成，cookie 用 addCookies 注入
 *     —— 本地登录 cookie 带 Secure，Chrome 在 127.0.0.1 跨页面会丢）
 * ========================================================================== */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:8788';
const OUT = path.join(__dirname, '..', '.workbuddy', 'shots', 'photo-quota-verify');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  /* 0) 登录拿 token → 注入 cookie（Secure cookie 必须走这一步，见 2026-09-28 笔记） */
  const login = await fetch(BASE + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE },
    body: JSON.stringify({ username: 'verify_zelm', password: 'Verify#2026zelm' }),
  });
  const setCookie = login.headers.get('set-cookie') || '';
  const token = (setCookie.match(/token=([^;]+)/) || [])[1];
  console.log('[登录]', login.status, '| token:', token ? 'OK' : 'MISS');
  if (!token || login.status !== 200) process.exit(1);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: 'token', value: token, url: BASE, httpOnly: true, sameSite: 'Strict' }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));

  /* ============ ① 照片墙深浅主题 ============ */
  await page.goto(BASE + '/#/about', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  /* 过密码门（站点密码 1234） */
  const gateVisible = await page.locator('#aboutGate:not([hidden])').count();
  if (gateVisible) {
    await page.fill('#gateInput input', '1234');
    await page.click('#gateBtn');
    await page.waitForTimeout(1500);
  }
  await page.locator('#photoWall').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);

  const wallStyle = () => page.evaluate(() => {
    const el = document.querySelector('.drift-wall');
    const cs = getComputedStyle(el);
    const ov = document.querySelector('.drift-wall__overlay');
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      wallBg: cs.backgroundColor,
      overlayBg: ov ? getComputedStyle(ov).backgroundColor : 'none',
      border: cs.borderColor,
    };
  });

  /* 默认深色主题 */
  await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
  await page.waitForTimeout(600);
  const dark = await wallStyle();
  console.log('[①] 深色  wallBg:', dark.wallBg, '| overlay:', dark.overlayBg);
  await page.screenshot({ path: path.join(OUT, 'wall-dark.png') });

  /* 切浅色主题 */
  await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'light'); });
  await page.waitForTimeout(600);
  const light = await wallStyle();
  console.log('[①] 浅色  wallBg:', light.wallBg, '| overlay:', light.overlayBg);
  await page.screenshot({ path: path.join(OUT, 'wall-light.png') });

  /* 断言：浅色下背景不再是 #060010（rgb(6,0,16)），且深浅两态颜色不同 */
  const bgChanged = dark.wallBg !== light.wallBg;
  const notDarkInLight = light.wallBg !== 'rgb(6, 0, 16)' && !/rgba\(6, 0, 16/.test(light.wallBg);
  console.log('[①] 断言  深浅背景不同:', bgChanged, '| 浅色下非深紫底:', notDarkInLight);

  /* ============ ② AI 剩余额度 ============ */
  /* 2-1 接口直测：GET /api/ai/usage（带 cookie） */
  const usage = await page.evaluate(async (b) => {
    const r = await fetch(b + '/api/ai/usage', { credentials: 'include' });
    return { status: r.status, body: await r.json() };
  }, BASE);
  console.log('[②] /api/ai/usage:', usage.status, JSON.stringify(usage.body));
  const expectRemain = Math.max(0, (usage.body.limit || 10000) - (usage.body.used || 0));
  console.log('[②] 断言  remaining = limit - used:', expectRemain === usage.body.remaining);
  console.log('[②] 断言  resetsAt 是未来时刻的 UTC 午夜:', /T00:00:00\.000Z$/.test(usage.body.resetsAt || '') && new Date(usage.body.resetsAt) > new Date());

  /* 2-2 弹窗额度条显示 */
  await page.goto(BASE + '/#/home', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.click('.ai-fab');
  await page.waitForTimeout(1200);
  const quotaText = await page.locator('.ai-quota').textContent().catch(() => '(无)');
  console.log('[②] 弹窗额度条:', quotaText.trim());
  const showsRight = quotaText.includes(String(expectRemain));
  console.log('[②] 断言  显示剩余值', expectRemain, ':', showsRight);
  await page.screenshot({ path: path.join(OUT, 'chat-quota-zh.png') });

  /* 2-3 四语切换（改 localStorage 语言后重开弹窗） */
  for (const lang of ['en', 'zh-TW', 'ja']) {
    await page.evaluate((l) => { try { localStorage.setItem('zelm_lang', l); } catch (e) {} }, lang);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    await page.click('.ai-fab');
    await page.waitForTimeout(1000);
    const t = await page.locator('.ai-quota').textContent().catch(() => '(无)');
    console.log('[②] 额度条[' + lang + ']:', t.trim());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => { try { localStorage.setItem('zelm_lang', 'zh-CN'); } catch (e) {} });

  await browser.close();
  console.log('DONE');
})().catch((e) => { console.error('E:', e.message); process.exit(1); });
