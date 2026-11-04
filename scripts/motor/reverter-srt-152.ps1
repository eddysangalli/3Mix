# Script de Rollback Atômico para SRT 1.5.2 (Fallback de Emergência)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$RuntimeBin = Join-Path $Root '3mix-runtime\bin\64bit'
$CurrentDll = Join-Path $RuntimeBin 'srt.dll'
$BakDll = Join-Path $RuntimeBin 'srt.dll.v152.bak'

Write-Host "[ROLLBACK SRT] Verificando backup v1.5.2..."
if (-not (Test-Path $BakDll)) {
    Write-Error "Backup 'srt.dll.v152.bak' não encontrado em $RuntimeBin!"
    exit 1
}

# Verifica se o 3Mix está rodando
$proc = Get-Process -Name 3Mix -ErrorAction SilentlyContinue
if ($proc) {
    Write-Host "[ROLLBACK SRT] 3Mix ativo (PID: $($proc.Id)). Encerrando com segurança antes da troca..."
    & (Join-Path $Root 'DESLIGAR-3MIX.cmd')
    Start-Sleep -Seconds 2
}

# Realiza backup da versão 1.5.7 atual
$Dist157 = Join-Path $Root 'qa-finalizacao\srt-1.5.7-dist\srt.dll'
if (Test-Path $CurrentDll) {
    Copy-Item $CurrentDll (Join-Path $RuntimeBin 'srt.dll.v157.bak') -Force
}

Copy-Item $BakDll $CurrentDll -Force
Write-Host "[ROLLBACK SRT] Sucesso! srt.dll restaurada para a versão 1.5.2."
$v = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($CurrentDll)
Write-Host "[ROLLBACK SRT] Versão ativa agora:" $v.FileVersionRaw.ToString()
