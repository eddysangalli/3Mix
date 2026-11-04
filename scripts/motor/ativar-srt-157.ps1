# Script de Ativação do SRT 1.5.7 Homologado
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$RuntimeBin = Join-Path $Root '3mix-runtime\bin\64bit'
$CurrentDll = Join-Path $RuntimeBin 'srt.dll'
$Dist157 = Join-Path $Root 'qa-finalizacao\srt-1.5.7-dist\srt.dll'

Write-Host "[ATIVAR SRT 1.5.7] Verificando binário homologado..."
if (-not (Test-Path $Dist157)) {
    Write-Error "Binário compilado de SRT 1.5.7 não encontrado em $Dist157!"
    exit 1
}

# Verifica se o 3Mix está rodando
$proc = Get-Process -Name 3Mix -ErrorAction SilentlyContinue
if ($proc) {
    Write-Host "[ATIVAR SRT 1.5.7] 3Mix ativo (PID: $($proc.Id)). Encerrando com segurança antes da troca..."
    & (Join-Path $Root 'DESLIGAR-3MIX.cmd')
    Start-Sleep -Seconds 2
}

# Garante backup do que estiver ativo
if (Test-Path $CurrentDll) {
    Copy-Item $CurrentDll (Join-Path $RuntimeBin 'srt.dll.pre-157.bak') -Force
}

Copy-Item $Dist157 $CurrentDll -Force
Write-Host "[ATIVAR SRT 1.5.7] Sucesso! srt.dll atualizada para a versão 1.5.7."
$v = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($CurrentDll)
Write-Host "[ATIVAR SRT 1.5.7] Versão ativa agora:" $v.FileVersionRaw.ToString()
