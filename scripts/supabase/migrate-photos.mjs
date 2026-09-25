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

const URL = 'https://wrgsksjsbdvoqfedsdow.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || (fs.existsSync('.dev.vars')
      ? (fs.readFileSync('.dev.vars', 'utf8').match(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*"?([^"\r\n]+)"?/) || [])[1]
      : '');
if (!KEY) { console.error('缺少 SUPABASE_SERVICE_ROLE_KEY（环境变量或 .dev.vars）'); process.exit(1); }

const SRC = 'public/assets/photos';
const files = fs.readdirSync(SRC).filter((f) => /\.(webp|jpg|jpeg|png)$/i.test(f)).sort();
console.log('待上传 ' + files.length + ' 张');
const rows = [];
for (const f of files) {
  const buf = fs.readFileSync(path.join(SRC, f));
  const res = await fetch(URL + '/storage/v1/object/photos/' + encodeURIComponent(f), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'image/webp', 'x-upsert': 'true' },
    body: buf,
  });
  if (!res.ok) { console.error('  ✗ ' + f + ' → ' + res.status + ' ' + (await res.text()).slice(0, 120)); continue; }
  rows.push("  ('" + f.replace(/'/g, "''") + "', '" + f + "', " + rows.length + ", " + Date.now() + ")");
  console.log('  ✓ ' + f);
}
console.log('\n=== 可直接执行的 D1 插入语句 ===');
console.log('INSERT INTO photos (title, storage_path, sort_order, created_at) VALUES');
console.log(rows.join(',\n') + ';');
