# Compilação oficial do binário 3Mix.exe
$ErrorActionPreference = 'Stop'
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) {
    throw "Compilador csc.exe não encontrado em $csc"
}

$root = Split-Path -Parent $PSScriptRoot
$binDir = Join-Path $root "bin\64bit"
$icoPath = Join-Path $PSScriptRoot "3Mix.ico"
$srcPath = Join-Path $PSScriptRoot "3MixApp.cs"
$targetExe = Join-Path $binDir "3Mix.exe"

$dllCore = Join-Path $binDir "Microsoft.Web.WebView2.Core.dll"
$dllForms = Join-Path $binDir "Microsoft.Web.WebView2.WinForms.dll"

Write-Host "Compilando executável nativo 3Mix.exe a partir de $srcPath..."
$compileArgs = @(
    "/target:winexe",
    "/optimize+",
    "/platform:x64",
    "/win32icon:$icoPath",
    "/r:System.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Core.dll,$dllCore,$dllForms",
    "/out:$targetExe",
    $srcPath
)

& $csc $compileArgs
if ($LASTEXITCODE -eq 0) {
    Write-Host "SUCESSO: 3Mix.exe compilado com ícone oficial e janela própria em $targetExe" -ForegroundColor Green
} else {
    throw "Falha na compilação do 3Mix.exe (código $LASTEXITCODE)"
}

