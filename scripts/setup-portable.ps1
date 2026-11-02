# FreeMix Setup Helper
# Downloads the portable OBS runtime if not already installed.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

Write-Host "=== FreeMix Setup Helper ==="
if (-not (Test-Path "$root\bin\64bit\obs64.exe")) {
    Write-Host "Binários do OBS não encontrados na pasta raiz."
    Write-Host "Baixe a versão pronta na aba Releases do GitHub ou extraia o OBS Studio portátil nesta pasta:"
    Write-Host "https://github.com/eddysangalli/3Mix/releases"
} else {
    Write-Host "Binários do OBS detectados com sucesso!"
    Write-Host "Execute 'Iniciar FreeMix.cmd' para abrir a mesa."
}
