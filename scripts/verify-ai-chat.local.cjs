/* AI 聊天 v2 多会话改造的真机验证脚本（Playwright + 真实 Edge channel）。
   后端 /api/ai/chat 用 Playwright 路由回放 SSE 流（沙箱无 Workers AI 绑定），
   验证的是前端多会话行为：新对话/切换/置顶/重命名/删除/持久化/主题联动/移动端抽屉。
   产出截图到 .workbuddy/shots/chat-verify/ */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:8788';
const OUT = path.join(__dirname, '..', '.workbuddy', 'shots', 'chat-verify');
fs.mkdirSync(OUT, { recursive: true });

/* SSE 回放：两帧增量 + DONE */
const SSE_BODY = 'data: {"response":"聚合把每组压成一行；"}\n\n' +
  'data: {"response":"窗口函数保留行明细再附加组内计算。"}\n\n' +
  'data: [DONE]\n\n';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  /* 登录：cookie 带 Secure，Chrome 在 http://127.0.0.1 上跨页面加载会丢弃
     （实测首次 load 带得上、reload 就丢），所以这里用 node fetch 拿 token 后
     直接 context.addCookies 注入（secure:false 才能在 http 下持久回传）。 */
  const loginRes = await fetch(BASE + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE },
    body: JSON.stringify({ username: 'verify_zelm', password: 'Verify#2026zelm' }),
  });
  const setCookie = loginRes.headers.get('set-cookie') || '';
  const token = (setCookie.match(/token=([^;]+)/) || [])[1];
  console.log('[登录]', loginRes.status, '| token 取到:', !!token);
  if (!token) process.exit(1);
  await page.context().addCookies([{
    name: 'token', value: token, url: BASE, httpOnly: true, sameSite: 'Strict',
  }]);

  /* 拦截 AI 后端 → SSE 回放 */
  await page.route('**/api/ai/chat', (route) => route.fulfill({
    status: 200,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store' },
    body: SSE_BODY,
  }));

  /* ---- ① 打开弹窗 + 首个会话 ---- */
  await page.goto(BASE + '/#/home', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.click('.ai-fab');
  await page.waitForSelector('.ai-panel', { timeout: 8000 });
  console.log('[①] 弹窗打开，侧栏可见:', await page.locator('.ai-side').isVisible());
  console.log('[①] 新对话按钮:', await page.locator('.ai-new-btn').textContent());
  console.log('[①] 右上角清空按钮残留:', await page.locator('.ai-head button:has-text("清空")').count());

  /* ---- ② 发消息 → 流式渲染 + 自动命名 ---- */
  await page.fill('#aiInput', 'SQL 窗口函数怎么写');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  const bubbles = await page.locator('.ai-msg').count();
  const lastText = await page.locator('.ai-msg').last().textContent();
  const sessionTitle = await page.locator('.ai-s-item--on .ai-s-title').first().textContent();
  console.log('[②] 消息气泡数(应=2):', bubbles, '| AI 回复尾帧渲染:', lastText.includes('窗口函数保留行明细'));
  console.log('[②] 会话自动命名:', JSON.stringify(sessionTitle));

  /* ---- ③ 新对话（不删旧）+ 第二会话发消息 ---- */
  await page.click('.ai-new-btn');
  await page.waitForTimeout(300);
  console.log('[③] 会话总数(应=2):', await page.locator('.ai-s-item').count());
  await page.fill('#aiInput', 'Power BI 建模思路');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
  console.log('[③] 第二会话消息数(应=2):', await page.locator('.ai-list .ai-msg').count());

  /* ---- ④ 切回第一会话 → 消息加载 ---- */
  await page.locator('.ai-s-title:has-text("SQL 窗口函数怎么写")').first().click();
  await page.waitForTimeout(300);
  const backMsg = await page.locator('.ai-msg').first().textContent();
  console.log('[④] 切回后首条消息:', backMsg.includes('SQL 窗口函数怎么写') ? 'OK' : 'FAIL:' + backMsg);

  /* ---- ⑤ 置顶第二会话 → 进置顶组 ---- */
  await page.locator('.ai-s-item:has-text("Power BI") button[title="置顶会话"]').first().click();
  await page.waitForTimeout(300);
  const sideText = await page.locator('.ai-side').textContent();
  console.log('[⑤] 置顶组标签前于 Power BI（已进置顶组）:', sideText.indexOf('置顶') >= 0 && sideText.indexOf('置顶') < sideText.indexOf('Power BI'));

  /* ---- ⑥ 重命名 ---- */
  const item = page.locator('.ai-s-item:has-text("Power BI")').first();
  await item.locator('button[title="重命名"]').click();
  await page.fill('.ai-rename-input', '建模笔记');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  console.log('[⑥] 重命名成功:', await page.locator('.ai-s-title:has-text("建模笔记")').count() > 0);

  /* ---- ⑦ 删除第二会话（确认弹窗）---- */
  const item2 = page.locator('.ai-s-item:has-text("建模笔记")').first();
  await item2.locator('button[title="删除会话"]').click();
  await page.waitForSelector('.zconfirm-modal', { timeout: 5000 });
  await page.click('.zconfirm-ok');
  await page.waitForTimeout(400);
  console.log('[⑦] 删除后会话数(应=1):', await page.locator('.ai-s-item').count());
  console.log('[⑦] 自动切回剩余会话(含 SQL 消息):', (await page.locator('.ai-list').textContent()).includes('SQL 窗口函数'));

  /* 截图：深色默认主题 */
  await page.screenshot({ path: path.join(OUT, 'chat-dark.png') });

  /* ---- ⑧ 刷新后 sessionStorage 持久化 ---- */
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.click('.ai-fab');
  await page.waitForTimeout(600);
  console.log('[⑧] 刷新后会话数(应=1):', await page.locator('.ai-s-item').count());
  console.log('[⑧] 刷新后消息保留:', (await page.locator('.ai-list').textContent()).includes('SQL 窗口函数'));

  /* ---- ⑨ 配色方案联动 ---- */
  for (const sc of ['sunset', 'ocean']) {
    await page.evaluate((s) => document.documentElement.setAttribute('data-scheme', s), sc);
    await page.waitForTimeout(300);
    const border = await page.evaluate(() => getComputedStyle(document.querySelector('.ai-panel')).borderColor);
    const itemBorder = await page.evaluate(() => {
      const el = document.querySelector('.ai-s-item--on');
      return el ? getComputedStyle(el).borderColor : 'none';
    });
    console.log(`[⑨] scheme=${sc} 弹窗边框: ${border} | 当前会话边框: ${itemBorder}`);
    await page.screenshot({ path: path.join(OUT, `chat-${sc}.png`) });
  }
  /* 浅色主题 */
  await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'light'); document.documentElement.removeAttribute('data-scheme'); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'chat-light.png') });
  console.log('[⑨] 浅色主题截图完成');
  await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });

  /* ---- ⑩ 移动端 390×844：抽屉 ----
     ⚠️ 站点在 <1280 视口用 body.style.zoom = innerWidth/1280 整体等比缩放（全站策略），
     所以面板/侧栏的「绝对宽度」变小是全站一致表现，判据改为：
     侧栏是否在屏幕外（rect.x < 0）、展开后是否入屏、页面有无横向溢出。 */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  const sideX = () => page.evaluate(() => {
    const s = document.querySelector('.ai-side').getBoundingClientRect();
    const pn = document.querySelector('.ai-panel').getBoundingClientRect();
    return { sx: s.x, px: pn.x, hidden: s.x + s.width <= pn.x + 1 };
  });
  const m0 = await sideX();
  await page.click('.ai-side-toggle');
  await page.waitForTimeout(500);
  const m1 = await sideX();
  const noHOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth + 1);
  const overlayCovers = await page.evaluate(() => {
    const r = document.querySelector('.ai-overlay').getBoundingClientRect();
    return r.width >= window.innerWidth - 4;
  });
  console.log('[⑩] 默认侧栏滑出面板左缘(收起，被 overflow:hidden 裁剪):', m0.hidden, `| side.x=${m0.sx.toFixed(0)} panel.x=${m0.px.toFixed(0)}`);
  console.log('[⑩] ☰ 展开后侧栏贴齐面板左缘:', m1.sx >= m1.px - 1, `| x=${m1.sx.toFixed(0)}`);
  console.log('[⑩] 无横向溢出:', noHOverflow, '| 遮罩覆盖全屏:', overlayCovers);
  await page.screenshot({ path: path.join(OUT, 'chat-mobile-drawer.png') });
  await page.locator('.ai-s-title').first().click();
  await page.waitForTimeout(500);
  const m2 = await sideX();
  console.log('[⑩] 选中会话后抽屉自动收起:', m2.hidden, `| x=${m2.sx.toFixed(0)}`);

  /* ---- ⑪ v1 旧数据迁移 ---- */
  await page.evaluate(() => {
    sessionStorage.removeItem('zelm_ai_chat_v2');
    sessionStorage.setItem('zelm_ai_chat_v1', JSON.stringify([
      { role: 'user', content: '旧版聊天记录：简历项目怎么描述' },
      { role: 'assistant', content: '建议用 STAR 法则…' },
    ]));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.click('.ai-fab');
  await page.waitForTimeout(600);
  const migrated = await page.evaluate(() => ({
    v1: sessionStorage.getItem('zelm_ai_chat_v1'),
    v2: JSON.parse(sessionStorage.getItem('zelm_ai_chat_v2') || 'null'),
  }));
  console.log('[⑪] v1 已删除:', migrated.v1 === null, '| v2 会话数:', migrated.v2.sessions.length,
    '| 自动命名:', JSON.stringify(migrated.v2.sessions[0].title));
  console.log('[⑪] 旧消息显示:', (await page.locator('.ai-list').textContent()).includes('简历项目怎么描述'));

  /* Esc 关闭 */
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  console.log('[⑫] Esc 关闭后弹窗残留:', await page.locator('.ai-panel').count());

  await browser.close();
  console.log('DONE ->', OUT);
})().catch((e) => { console.error('VERIFY_FAIL:', e.message); process.exit(1); });
