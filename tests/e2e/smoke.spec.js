import { test, expect } from '@playwright/test';

/* ==========================================================================
 * tests/e2e/smoke.spec.js — 冒烟：登录 → 留言 → 语言切换 → 看板渲染
 *
 * 说明（务实取舍）：
 *   · 登录/留言用**页面内 fetch** 驱动 —— 这样浏览器会自动带上 Origin 头，
 *     正好覆盖 worker 的 P2-8 来源校验（直连 APIRequestContext 不会带 Origin）。
 *   · 语言切换、看板渲染则断言真实 DOM（html[lang] / #app 内容 / document.title）。
 *   · 用户名与留言内容都带随机后缀，避免与本地库历史数据撞车、可重复运行。
 *
 * 本套件只在本地跑（CI 不跑）；需要先 `npx playwright install chromium`。
 * ========================================================================== */

const uniq = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const USER = `e2e_${uniq}`;
const PASS = 'E2ePassw0rd!';
const MSG = `e2e 留言 ${uniq}`;

test.describe('冒烟：登录 → 留言 → 语言切换 → 看板渲染', () => {
  test('核心链路可跑通', async ({ page }) => {
    // ---------- 1) 注册 + 登录 ----------
    await page.goto('/#/home');

    const regStatus = await page.evaluate(
      async ([u, p]) => {
        const r = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u, password: p }),
        });
        return r.status;
      },
      [USER, PASS]
    );
    expect([201, 409]).toContain(regStatus); // 409 = 已存在（可重复运行）

    const loginStatus = await page.evaluate(
      async ([u, p]) => {
        const r = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u, password: p }),
        });
        return r.status;
      },
      [USER, PASS]
    );
    expect(loginStatus).toBe(200);

    // 登录态生效（/api/me 返回 200）
    const meStatus = await page.evaluate(async () => (await fetch('/api/me')).status);
    expect(meStatus).toBe(200);

    // ---------- 2) 留言 ----------
    const postStatus = await page.evaluate(async (m) => {
      const r = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: m }),
      });
      return r.status;
    }, MSG);
    expect([200, 201]).toContain(postStatus);

    const listed = await page.evaluate(async () => {
      const r = await fetch('/api/messages?limit=100');
      return r.json();
    });
    expect(JSON.stringify(listed)).toContain(MSG);

    // ---------- 3) 看板渲染 ----------
    await page.reload();
    await expect(page).toHaveTitle(/Zelm/);
    await expect(page.locator('#app')).not.toBeEmpty();
    // 主视图应挂载出内容（首页容器非空）
    await expect(page.locator('#viewRoot')).not.toBeEmpty();

    // ---------- 4) 语言切换（localStorage → 重载后 html[lang] 生效）----------
    await page.evaluate(() => localStorage.setItem('zelm_lang', 'en'));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    // 复位为中文，避免影响后续手动调试
    await page.evaluate(() => localStorage.setItem('zelm_lang', 'zh-CN'));
  });
});
