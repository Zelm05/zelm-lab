/* ==========================================================================
 * 一次性迁移：把 public/assets/photos/*.webp 上传到 Supabase `photos` 桶
 *
 * 用法（在 zelm-lab 根目录）：
 *   SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/supabase/migrate-photos.mjs
 * 或在 .dev.vars 里写 SUPABASE_SERVICE_ROLE_KEY=xxx 后：
 *   node scripts/supabase/migrate-photos.mjs
 *
 * ⚠️ service_role key 只在本机环境变量里用，绝不写进仓库 / 前端。
 * 上传成功后脚本会打印可直接写进 D1 的 INSERT 语句（photos 表）。
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';

const URL = (process.env.SUPABASE_URL || 'https://wrguksjsbdvoqfedsdow.supabase.co').replace(/\/+$/, '');
/* 取值后**必须去掉包裹的引号与首尾空白**：
   很多人写成 SUPABASE_SERVICE_ROLE_KEY='eyJ...'（带单引号）或行尾带空格，
   而 Supabase 的 JWT 解码是**严格**的 —— 多一个 ' 就会报
   「Failed to base64url decode the signature」。 */
function cleanKey(v) {
  return String(v || '').trim().replace(/^["']+/, '').replace(/["']+$/, '').trim();
}
const KEY = cleanKey(process.env.SUPABASE_SERVICE_ROLE_KEY
  || (fs.existsSync('.dev.vars')
      ? (fs.readFileSync('.dev.vars', 'utf8').match(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.+)/) || [])[1]
      : ''));
if (!KEY) { console.error('缺少 SUPABASE_SERVICE_ROLE_KEY（环境变量或 .dev.vars）'); process.exit(1); }

/* 预检 key 格式：Supabase Storage 会把它当 JWT 解析（按 . 拆三段 + base64url 解码）。
   新版 API key（sb_secret_xxx）不是 JWT，会报
   「Failed to base64url decode the signature」—— 必须用 legacy service_role（eyJ...）。 */
const illegal = KEY.replace(/[A-Za-z0-9\-_.]/g, '');
if (illegal) {
  console.error('❌ key 里含非法字符 ' + JSON.stringify(illegal) + '（多半是包裹的引号或空格）');
  console.error('   请把 .dev.vars 写成：SUPABASE_SERVICE_ROLE_KEY=eyJ...（不要引号、不要空格）');
  process.exit(1);
}
const parts = KEY.split('.');
if (parts.length !== 3 || !KEY.startsWith('eyJ')) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY 格式不对：');
  console.error('   期望 legacy JWT（eyJ 开头、含两个 "."，长度约 200+）');
  console.error('   实际：开头 "' + KEY.slice(0, 12) + '…"，长度 ' + KEY.length + '，段数 ' + parts.length);
  console.error('   → 去 Supabase Dashboard → Project Settings → API → 找 service_role 的「Legacy」密钥');
  process.exit(1);
}
console.log('key 格式预检通过（legacy JWT，长度 ' + KEY.length + '）');

const SRC = 'public/assets/photos';
const files = fs.readdirSync(SRC).filter((f) => /\.(webp|jpg|jpeg|png)$/i.test(f)).sort();
console.log('待上传 ' + files.length + ' 张');
const rows = [];
for (const f of files) {
  const buf = fs.readFileSync(path.join(SRC, f));
  /* 网络抖动重试：国内访问 *.supabase.co 常被 RST（ECONNRESET），
     指数退避重试 3 次；每次之间留 150ms，避免连接churn。 */
  let res = null; let lastErr = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      res = await fetch(URL + '/storage/v1/object/photos/' + encodeURIComponent(f), {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'image/webp', 'x-upsert': 'true' },
        body: buf,
      });
      if (res.ok || res.status < 500) break;
      lastErr = 'HTTP ' + res.status;
    } catch (e) {
      lastErr = (e && e.cause && e.cause.code) || (e && e.message) || String(e);
      res = null;
    }
    if (attempt < 3) {
      console.log('  … ' + f + ' 第 ' + attempt + ' 次失败（' + lastErr + '），重试');
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
  if (!res) { console.error('  ✗ ' + f + ' → 重试 3 次仍失败：' + lastErr); continue; }
  await new Promise((r) => setTimeout(r, 150));
  if (!res.ok) { console.error('  ✗ ' + f + ' → ' + res.status + ' ' + (await res.text()).slice(0, 120)); continue; }
  rows.push("  ('" + f.replace(/'/g, "''") + "', '" + f + "', " + rows.length + ", " + Date.now() + ")");
  console.log('  ✓ ' + f);
}
if (!rows.length) {
  console.log('\n没有任何文件上传成功 —— 未生成 INSERT（请先解决上面的报错）');
} else {
  console.log('\n=== 可直接执行的 D1 插入语句（也可直接跑 migrations/migration-seed-photos.sql）===');
  console.log('INSERT INTO photos (title, storage_path, sort_order, created_at) VALUES');
  console.log(rows.join(',\n') + ';');
}
