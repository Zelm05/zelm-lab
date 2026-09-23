#!/usr/bin/env node
/* ==========================================================================
 * scripts/csp-hash.mjs — 生成 CSP 用的内联脚本 sha256
 *
 * 作用：从构建产物 dist/index.html 抽取所有**内联** <script>，算 sha256(base64)，
 *       打印可直接粘进 worker/index.js `CSP_SCRIPT_HASHES` 的片段。
 *
 * 用法：
 *     npm run build && node scripts/csp-hash.mjs [htmlFile]
 *
 * 为什么从 dist 而不是源码 index.html：
 *   Worker 实际下发的是 dist/index.html。实测 Vite 不改写内联脚本，两者逐字节一致；
 *   但从产物算最稳妥（万一将来引入会改写 HTML 的插件也能立刻发现）。
 *
 * ⚠️ 为什么必须先做 LF 归一化（CSP hash 头号大坑）：
 *   HTML 输入流预处理器会把 CRLF / CR 统一成 LF，浏览器对**归一化后**的脚本文本取哈希。
 *   本仓库文件是 CRLF，若不归一化，算出的哈希会全部对不上 —— 切强制 CSP 后内联脚本被拦，
 *   页面「整体缩小/主题引导」直接失效。
 * ========================================================================== */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const file = process.argv[2] || resolve(process.cwd(), 'dist/index.html');
const html = readFileSync(file, 'utf8').replace(/\r\n?/g, '\n'); // LF 归一化

const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const hashes = [];
let m;
while ((m = re.exec(html)) !== null) {
  if (/\bsrc\s*=/i.test(m[1] || '')) continue; // 外链脚本（有 src）不需要 hash
  const h = createHash('sha256').update(m[2], 'utf8').digest('base64');
  hashes.push(`'sha256-${h}'`);
}

console.log(`// source: ${file}  (${hashes.length} inline script(s))`);
console.log(hashes.join(' '));
