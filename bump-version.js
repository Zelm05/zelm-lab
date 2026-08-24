#!/usr/bin/env node
/**
 * bump-version.js —— 部署前自动刷新静态资源版本号
 *
 * 作用：把所有 HTML 中引用的 JS/CSS 的 ?v=xxx 统一替换为当前时间戳，
 * 保证 wrangler deploy 后浏览器一定拉到最新资源（绕过 worker 的 1 天缓存）。
 *
 * 用法：
 *   node bump-version.js          # 只刷新版本号
 *   npm run deploy                # 刷新版本号 + wrangler deploy（推荐）
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, 'public');
// 版本号用"日期+时分秒"，每次运行都生成唯一值，保证部署后必拉新资源
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const VERSION =
  'v=' +
  now.getFullYear() +
  pad(now.getMonth() + 1) +
  pad(now.getDate()) +
  pad(now.getHours()) +
  pad(now.getMinutes()) +
  pad(now.getSeconds());

const files = ['index.html', 'home.html', 'about.html', 'admin.html', 'gate.html'];
let changed = 0;

for (const f of files) {
  const p = path.join(PUBLIC, f);
  if (!fs.existsSync(p)) continue;
  let html = fs.readFileSync(p, 'utf8');
  // 替换所有 ?v=xxx（含 JS 新加的）
  const next = html.replace(/([?"&])v=[a-zA-Z0-9]+/g, '$1' + VERSION);
  if (next !== html) {
    fs.writeFileSync(p, next);
    changed++;
    console.log(`  bumped ${f} -> ?${VERSION}`);
  } else {
    console.log(`  ${f}: 无版本号引用（跳过）`);
  }
}
console.log(`\n完成：${changed} 个文件已更新为 ?${VERSION}`);
