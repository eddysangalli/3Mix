# Closes QA windows/copies of 3Mix without ever touching the operator's 3mix-runtime.
# It only targets executables whose path carries a QA marker (QA, qa-finalizacao or qa-replay) and is not 3mix-runtime.
# Graceful by default (CloseMainWindow); -Forcar is explicit and still limited to those QA paths.
#
#   powershell -ExecutionPolicy Bypass -File fechar-qa.ps1
#   powershell -ExecutionPolicy Bypass -File fechar-qa.ps1 -Destino "D:\...\FreeMix-QA-..."
param(
  [string]$Destino = '',
  [switch]$Forcar
)
$ErrorActionPreference = 'Stop'
$qaMarker = '(?i)\\(FreeMix-QA[^\\]*|3Mix-QA[^\\]*|qa-finalizacao|qa-replay)(\\|$)'
$operator = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../3mix-runtime')).TrimEnd('\')
$filter = if ($Destino) { [IO.Path]::GetFullPath($Destino).TrimEnd('\') } else { '' }

$targets = Get-CimInstance Win32_Process | Where-Object {
  $_.ExecutablePath -and
  $_.ExecutablePath -notlike "$operator\*" -and
  $_.ExecutablePath -match $qaMarker -and
  ($filter -eq '' -or $_.ExecutablePath.StartsWith($filter + '\', [StringComparison]::OrdinalIgnoreCase))
}
if (-not $targets) { Write-Host 'Nenhum processo de cópia QA encontrado. Nenhuma janela QA aberta.'; exit 0 }

foreach ($t in $targets) {
  $p = Get-Process -Id $t.ProcessId -ErrorAction SilentlyContinue
  if (-not $p) { continue }
  if ($p.MainWindowTitle) {
    Write-Host "Fechando janela QA: PID $($p.Id) — '$($p.MainWindowTitle)' — $($t.ExecutablePath)"
    [void]$p.CloseMainWindow()
  } else {
    Write-Host "Processo QA sem janela: PID $($p.Id) — $($t.ExecutablePath)"
  }
}

Start-Sleep -Seconds 4
$still = Get-CimInstance Win32_Process | Where-Object {
  $_.ExecutablePath -and
  $_.ExecutablePath -notlike "$operator\*" -and
  $_.ExecutablePath -match $qaMarker -and
  ($filter -eq '' -or $_.ExecutablePath.StartsWith($filter + '\', [StringComparison]::OrdinalIgnoreCase))
}
if ($still -and $Forcar) {
  foreach ($t in $still) {
    Write-Host "Encerrando processo QA (pedido explícito): PID $($t.ProcessId) — $($t.ExecutablePath)"
    Stop-Process -Id $t.ProcessId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 2
  $still = Get-CimInstance Win32_Process | Where-Object {
    $_.ExecutablePath -and $_.ExecutablePath -notlike "$operator\*" -and $_.ExecutablePath -match $qaMarker -and
    ($filter -eq '' -or $_.ExecutablePath.StartsWith($filter + '\', [StringComparison]::OrdinalIgnoreCase))
  }
}
if ($still) {
  Write-Host "Ainda em execução (feche manualmente): $($still.ProcessId -join ', ')"
  exit 1
}
Write-Host 'Nenhuma janela/processo de cópia QA ficou aberto.'
