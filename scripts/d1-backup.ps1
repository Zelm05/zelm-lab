# ============================================================================
# scripts/d1-backup.ps1 —— 导出 Cloudflare D1（默认 auth-db）为时间戳备份
#
# 用法（在仓库根目录执行）：
#   powershell -ExecutionPolicy Bypass -File scripts/d1-backup.ps1            # 导出远程库
#   powershell -ExecutionPolicy Bypass -File scripts/d1-backup.ps1 -Local     # 导出本地 .wrangler 状态
#   powershell -ExecutionPolicy Bypass -File scripts/d1-backup.ps1 -Db auth-db -OutDir backups
#
# 依赖：wranger（走 npx；远程导出需先 `wrangler login`）。
#
# 建议频率：
#   · 例行：每周一次
#   · 强制：每次执行 migrations/ 下**任何**迁移之前（本仓库多次强调「迁移前先备份」）
#
# 恢复演练步骤（见脚本末尾输出；务必先在本地/临时库演练，再考虑动线上）：
#   1) 建一个临时 D1（或直接用 --local）；
#   2) `wrangler d1 execute <db> --local --file=<备份文件>` 灌入；
#   3) 抽查关键表行数（users / messages / feedbacks）；
#   4) 确认无误后，才考虑对目标库恢复。
# ============================================================================
param(
  [string]$Db = 'auth-db',
  [string]$OutDir = 'backups',
  [switch]$Local
)

$ErrorActionPreference = 'Stop'
$ts = Get-Date -Format 'yyyyMMdd-HHmm'
$scope = if ($Local) { '--local' } else { '--remote' }
$scopeName = if ($Local) { 'local' } else { 'remote' }

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

$out = Join-Path $OutDir "auth-db-$ts.sql"
Write-Host "[d1-backup] 导出 $Db ($scopeName) -> $out"

npx wrangler d1 export $Db $scope --output $out
if ($LASTEXITCODE -ne 0) {
  Write-Error "[d1-backup] 导出失败（exit $LASTEXITCODE）"
  exit $LASTEXITCODE
}

$sizeKiB = [math]::Round((Get-Item $out).Length / 1KB, 1)
Write-Host "[d1-backup] 完成：$out（${sizeKiB} KiB）"
Write-Host ''
Write-Host '[d1-backup] 恢复演练（请先在临时库/本地演练）：'
Write-Host "  1) 灌入：npx wrangler d1 execute $Db --local --file=$out"
Write-Host '  2) 抽查：SELECT COUNT(*) FROM users;  (以及 messages / feedbacks)'
Write-Host '  3) 生产恢复前务必另行确认，并保持每周备份节奏'
