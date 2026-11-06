# Full build of the fork (freemix-app) with Visual Studio 2026, which has the C++ ATL component the three remaining
# modules need (frontend-tools, obs-qsv11, win-dshow with the virtual camera). Uses its own build folder, build_2026,
# so the quick Visual Studio 2022 build of the interface (build_x64) keeps working.
# Result: freemix-app\build_2026\rundir\RelWithDebInfo. Log of this run: freemix-build-2026.log, next to this file
# (plain text; errors are the lines with "error C..." or "error LNK...").
# The first run takes minutes; later runs only rebuild what changed. -ConfigureOnly stops after generating the
# project files; -Target builds one target (for the program itself: obs-studio).
param([switch]$ConfigureOnly, [string]$Target = '', [string]$BuildDirectory = '')
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$workspace = Split-Path -Parent $repo
if (Test-Path -LiteralPath (Join-Path $workspace '.freemix-build-lock')) { 'Outra compilacao esta em andamento. Nenhum build duplicado iniciado.'; exit 1 }
$root = $workspace; $src = Join-Path $root '3mix-engine'; $log = Join-Path $root 'qa-finalizacao/freemix-build-2026.log'
$cmake = 'C:\Program Files\Microsoft Visual Studio\18\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe'
if (-not (Test-Path $cmake)) { 'CMake do Visual Studio 2026 nao encontrado.'; exit 1 }
# Explicit build destinations must remain within project QA. Validate before any mutation.
$build = if ($BuildDirectory) { [IO.Path]::GetFullPath($BuildDirectory) } else { Join-Path $src 'build_2026' }
if ($BuildDirectory) {
  $qa = [IO.Path]::GetFullPath((Join-Path $workspace 'qa-finalizacao')).TrimEnd([IO.Path]::DirectorySeparatorChar)
  $prefix = $qa + [IO.Path]::DirectorySeparatorChar
  if (-not $build.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    'Destino de build deve ser uma subpasta de qa-finalizacao. Nenhum arquivo foi alterado.'; exit 1
  }
}
$cacheFile = Join-Path $build 'CMakeCache.txt'
if (Test-Path $cacheFile) {
  $home = Select-String -LiteralPath $cacheFile -Pattern '^CMAKE_HOME_DIRECTORY:INTERNAL=(.+)$'
  if ($home -and ([IO.Path]::GetFullPath($home.Matches[0].Groups[1].Value) -ne [IO.Path]::GetFullPath($src))) {
    'Cache CMake pertence a outra raiz. Use -BuildDirectory com pasta QA nova; nenhum cache foi alterado.'; exit 1
  }
}
Push-Location $src
try {
  "== inicio $(Get-Date -Format 'dd/MM HH:mm:ss') $Target" | Out-File $log -Encoding ascii
  if (-not (Test-Path (Join-Path $build 'CMakeCache.txt')) -or $ConfigureOnly) {
    cmd /c "`"$cmake`" --preset windows-x64 -B `"$build`" >> `"$log`" 2>&1"
    "== configurar terminou $(Get-Date -Format HH:mm:ss) (codigo $LASTEXITCODE)" | Out-File $log -Append -Encoding ascii
    if ($LASTEXITCODE -ne 0 -or $ConfigureOnly) { exit $LASTEXITCODE }
  }
  $extra = if ($Target) { "--target $Target" } else { '' }
  cmd /c "`"$cmake`" --build `"$build`" --config RelWithDebInfo $extra -- /m /v:m /nologo >> `"$log`" 2>&1"
  $code = $LASTEXITCODE
  "== fim $(Get-Date -Format HH:mm:ss) (codigo $code)" | Out-File $log -Append -Encoding ascii
  exit $code
} finally { Pop-Location }
