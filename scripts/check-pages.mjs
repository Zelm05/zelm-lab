/* ==========================================================================
 * check-pages.mjs —— 真实浏览器页面冒烟（Playwright）
 *
 * 为什么需要：lint / build / 单元测试都抓不到**运行时**错误
 *   （访问 undefined 的属性、组件里抛异常、i18n key 缺失导致的渲染异常…）。
 *   这里用无头 chromium 真的把页面跑起来，收集 console error 与 pageerror。
 *
 * 覆盖两种数据情形：
 *   · 后端不可达（模拟接口全挂）→ 验证「DB 优先、静态兜底」真的兜得住，页面不白屏
 *   · 后端可达（需同时起 wrangler dev）→ 走真实数据
 *
 * 运行：node scripts/check-pages.mjs            # 只起 vite dev，测兜底路径
 *       BASE=http://127.0.0.1:5173 node scripts/check-pages.mjs
 * ========================================================================== */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:5173';
/* 路由是 hash 模式：/#/about、/#/home … */
const PAGES = [
  ['home', '/#/home'],
  ['about', '/#/about'],
  ['logs', '/#/logs'],
  ['privacy', '/#/privacy'],
  ['gate', '/#/gate'],
];

const browser = await chromium.launch();
let fail = 0;

for (const [name, path] of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];      /* 真正的运行时错误：会让页面坏掉，必须为零 */
  const netNoise = [];    /* 网络/接口错误：后端没起时是预期的，只提示不判失败 */
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const txt = m.text();
    if (/Failed to load resource|net::ERR|status of \d{3}/.test(txt)) netNoise.push(txt);
    else errors.push('console: ' + txt);
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  try {
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);   /* 等内容加载 + 兜底路径走完 */

    const info = await page.evaluate(() => ({
      /* #app 里有没有真的渲染出东西（白屏检测） */
      appHtmlLen: (document.getElementById('app') || {}).innerHTML?.length || 0,
      bodyText: (document.body.innerText || '').slice(0, 200).replace(/\s+/g, ' '),
      /* i18n 缺 key 时会把键名原样渲染出来 —— 粗筛有没有残留的 cf / ed 前缀键名 */
      rawKeys: ((document.body.innerText || '').match(/\b(cf|ed)[A-Z][A-Za-z0-9]+\b/g) || []).slice(0, 5),
    }));

    const whiteScreen = info.appHtmlLen < 500;
    const ok = !whiteScreen && errors.length === 0 && info.rawKeys.length === 0;
    if (!ok) fail++;
    console.log((ok ? '  ✅ ' : '  ❌ ') + name.padEnd(9) +
      ' html=' + String(info.appHtmlLen).padStart(6) +
      (whiteScreen ? '  [白屏]' : '') +
      (info.rawKeys.length ? '  [未翻译的键名: ' + info.rawKeys.join(',') + ']' : ''));
    if (errors.length) errors.slice(0, 4).forEach((e) => console.log('       ⛔ ' + e.slice(0, 160)));
    /* 接口 4xx 属常态（访客未登录时 /api/me 会 401）；这里只列出来不判失败 */
    if (netNoise.length) console.log('       （接口返回 ' + netNoise.length + ' 条非 2xx：未登录 401 等属常态，不计失败）');
    if (!ok && !errors.length) console.log('       文本: ' + info.bodyText.slice(0, 120));
  } catch (e) {
    fail++;
    console.log('  ❌ ' + name.padEnd(9) + ' 打开失败: ' + String(e.message).slice(0, 120));
  }
  await ctx.close();
}

await browser.close();
console.log(fail ? '\n❌ ' + fail + ' 个页面有问题' : '\n✅ 全部页面正常渲染、无 console 错误');
process.exit(fail ? 1 : 0);
