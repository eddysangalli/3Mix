# FreeMix local helper, started by the launcher and running while the program is open.
# The panel cannot write files, and the engine cannot duplicate a production when asked from outside, so "Salvar como"
# is done here: the panel leaves a request in the engine's persistent data file and this script copies the production
# file under the new name. It only reads and writes inside this folder's config.
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$cfg = Join-Path $root 'config\obs-studio'
$scenes = Join-Path $cfg 'basic\scenes'
$utf8 = New-Object System.Text.UTF8Encoding $false
$seen = 0
function Running { [bool](Get-Process obs64, FreeMix, 3Mix -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$root\*" }) }
$deadline = (Get-Date).AddSeconds(90)
while (-not (Running) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }

# Iniciar Servidor Multi-Operador e API vMix (Porta 8088)
$nodeExe = "node.exe"
$localNode = Join-Path $root 'runtime\node.exe'
if (-not (Test-Path -LiteralPath $localNode)) { $localNode = Join-Path $root '..\node24\node.exe' }
if (Test-Path $localNode) { $nodeExe = (Resolve-Path $localNode).Path }
$srvProc = $null
try {
  $env:FREEMIX_ROOT = $root
  $apiInfoRaw = & $nodeExe (Join-Path $PSScriptRoot 'iniciar-api.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'O servidor local nao iniciou.' }
  $apiInfo = $apiInfoRaw | ConvertFrom-Json
  $srvProc = Get-Process -Id $apiInfo.pid -ErrorAction Stop
} catch {
  $taskLogDir = Join-Path $cfg 'plugin_config\freemix-control'
  New-Item -ItemType Directory -Path $taskLogDir -Force | Out-Null
  $_ | Out-String | Set-Content -LiteralPath (Join-Path $taskLogDir 'erro-inicializacao-api.log') -Encoding UTF8
}

try {
while (Running) {
  Start-Sleep -Milliseconds 400
  $file = Get-ChildItem (Join-Path $cfg 'plugin_config\obs-websocket') -Recurse -Filter *.json | Where-Object { $_.LastWriteTime -gt (Get-Date).AddSeconds(-20) } | Where-Object { (Get-Content $_.FullName -Raw) -match '"freemix_cmd"' } | Select-Object -First 1
  if (-not $file) { continue }
  $m = [regex]::Match((Get-Content $file.FullName -Raw), '"freemix_cmd"\s*:\s*(\{[^{}]*\})')
  if (-not $m.Success) { continue }
  $cmd = $m.Groups[1].Value | ConvertFrom-Json
  if (-not $cmd.id -or $cmd.id -le $seen) { continue }
  $seen = $cmd.id
  if ($cmd.cmd -eq 'settings') {   # full Settings window of the engine, opened in its own process because the call blocks while it is open
    Start-Process powershell.exe -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$PSScriptRoot\abrir-configuracoes.ps1`"" -WindowStyle Hidden
    continue
  }
  if ($cmd.cmd -eq 'import_gt') {   # Windows file dialog to pick and import .gtzip title packages
    Start-Process powershell.exe -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$PSScriptRoot\importar-gt-dialog.ps1`"" -WindowStyle Hidden
    continue
  }
  if ($cmd.cmd -ne 'saveas' -or -not $cmd.name -or -not $cmd.from) { continue }
  # The production's own name is the "name" key at the first indentation level of its file. The file is matched as
  # text: Windows PowerShell cannot parse these files as JSON (keys that differ only in case, empty keys).
  $top = '(?m)^ {4}"name"\s*:\s*' + [regex]::Escape(($cmd.from | ConvertTo-Json)) + '(?=\s*,?\s*$)'
  $src = Get-ChildItem $scenes -Filter *.json | Where-Object { [System.IO.File]::ReadAllText($_.FullName, $utf8) -match $top } | Select-Object -First 1
  if (-not $src) { continue }
  $safe = ($cmd.name -replace '[^\p{L}\p{Nd}]+', '_').Trim('_'); if (-not $safe) { $safe = 'preset' }
  # The engine only knows productions it created itself (it keeps its own list), so the panel first asks the engine
  # to create the new one, empty, and this script then fills that file with the copy.
  $topNew = '(?m)^ {4}"name"\s*:\s*' + [regex]::Escape(($cmd.name | ConvertTo-Json)) + '(?=\s*,?\s*$)'
  $existing = Get-ChildItem $scenes -Filter *.json | Where-Object { [System.IO.File]::ReadAllText($_.FullName, $utf8) -match $topNew } | Select-Object -First 1
  if ($existing) { $dst = $existing.FullName } else { $dst = Join-Path $scenes "$safe.json"; $n = 2; while (Test-Path $dst) { $dst = Join-Path $scenes "$safe`_$n.json"; $n++ } }
  $text = [System.IO.File]::ReadAllText($src.FullName, $utf8)
  $line = '    "name": ' + ($cmd.name | ConvertTo-Json)
  $new = ([regex]$top).Replace($text, { param($x) $line }, 1)
  if ($new -eq $text -or -not $new.Contains($line)) { continue }   # only write when the copy really carries the new name
  $new = [regex]::Replace($new, '("record_mode"\s*:\s*)1(?=\s*[,}])', '${1}0')
  [System.IO.File]::WriteAllText($dst, $new, $utf8)
  & $nodeExe (Join-Path $PSScriptRoot 'clonar-preset.mjs') $cmd.from $cmd.name
}
} finally {
  if ($srvProc -and -not $apiInfo.reused -and -not $srvProc.HasExited) {
    Stop-Process -Id $srvProc.Id -Force -ErrorAction SilentlyContinue
  }
}
