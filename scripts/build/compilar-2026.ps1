# Full build of the fork (freemix-app) with Visual Studio 2026, which has the C++ ATL component the three remaining
# modules need (frontend-tools, obs-qsv11, win-dshow with the virtual camera). Uses its own build folder, build_2026,
# so the quick Visual Studio 2022 build of the interface (build_x64) keeps working.
# Result: freemix-app\build_2026\rundir\RelWithDebInfo. Log of this run: freemix-build-2026.log, next to this file
# (plain text; errors are the lines with "error C..." or "error LNK...").
# The first run takes minutes; later runs only rebuild what changed. -ConfigureOnly stops after generating the
# project files; -Target builds one target (for the program itself: obs-studio).
param([switch]$ConfigureOnly, [string]$Target = '')
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$workspace = Split-Path -Parent $repo
if (Test-Path -LiteralPath (Join-Path $workspace '.freemix-build-lock')) { 'Outra compilacao esta em andamento. Nenhum build duplicado iniciado.'; exit 1 }
$root = $workspace; $src = Join-Path $root '3mix-engine'; $log = Join-Path $root 'qa-finalizacao/freemix-build-2026.log'
$cmake = 'C:\Program Files\Microsoft Visual Studio\18\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe'
if (-not (Test-Path $cmake)) { 'CMake do Visual Studio 2026 nao encontrado.'; exit 1 }
# The 32-bit helpers are configured into build_x86; one made by the 2022 generator cannot be reused by the 2026 one.
$x86 = Join-Path $src 'build_x86'; $cache = Join-Path $x86 'CMakeCache.txt'
if ((Test-Path $cache) -and (Select-String -Path $cache -Pattern 'CMAKE_GENERATOR:INTERNAL=Visual Studio 17' -Quiet)) { Rename-Item -LiteralPath $x86 -NewName 'build_x86_vs2022' }
$build = Join-Path $src 'build_2026'
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
