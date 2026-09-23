import { defineConfig, devices } from '@playwright/test';

/* ==========================================================================
 * playwright.config.js — E2E 最小方案
 *
 * 定位：**只在本地跑，CI 不跑**（不接进 npm test / 构建流水线）。
 *
 * 首次准备：
 *   1) npx playwright install chromium      # 下载浏览器（一次性）
 *   2) npm run db:init                       # 建本地 D1（schema）
 *      npx wrangler d1 execute auth-db --local --file=./migrations/migration-add-pwd-params-and-moderation-log.sql
 *   3) npx playwright test                   # 运行（会自动起 wrangler dev）
 *
 * webServer 用 `npm run dev:full`（vite build + wrangler dev --local），
 * 端口 8787；若已有服务在跑则复用（reuseExistingServer）。
 * ========================================================================== */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:8787',
    trace: 'on-first-retry',
    locale: 'zh-CN',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev:full',
    url: 'http://127.0.0.1:8787/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
