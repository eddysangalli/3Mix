# Applies a verified update: closes this installation, applies with backup, reopens and confirms the program came back.
# If the new version does not come back, restores the previous one. Started detached by the API, so it outlives it.
param([Parameter(Mandatory=$true)][string]$Package,[Parameter(Mandatory=$true)][int]$ApiPort,[int]$HealthSeconds=150)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$updates=Join-Path $root 'updates'
$logFile=Join-Path $updates 'ultima-atualizacao.log'
function Log([string]$text){ Add-Content -LiteralPath $logFile -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss')+' '+$text) -Encoding UTF8 }
function Result([string]$status,[string]$version,[string]$message){
  $json=@{status=$status;version=$version;message=$message;at=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json -Compress
  [IO.File]::WriteAllText((Join-Path $updates 'resultado.json'),$json,(New-Object Text.UTF8Encoding($false)))
}
function OwnProcesses{
  $prefix=$root.TrimEnd('\')+'\'
  Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) -and $_.ProcessId -ne $PID }
}
function CloseInstallation{
  for($i=0;$i -lt 40;$i++){
    $rows=@(OwnProcesses)
    if(-not $rows.Count){return}
    foreach($row in $rows){ Stop-Process -Id $row.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 500
  }
  throw 'Nao foi possivel fechar o 3Mix para atualizar.'
}
function Open3Mix{ Start-Process -FilePath (Join-Path $root '3Mix Studio.cmd') -WorkingDirectory $root -WindowStyle Minimized }
function CameBack{
  $deadline=(Get-Date).AddSeconds($HealthSeconds)
  while((Get-Date) -lt $deadline){
    try{ $health=Invoke-RestMethod -Uri ('http://127.0.0.1:'+$ApiPort+'/api/health') -TimeoutSec 4; if($health.connected -eq $true){return $true} }catch{}
    Start-Sleep -Seconds 3
  }
  return $false
}
function RunUpdater([string]$action,[string]$target){
  # A copy of Node outside the installation, so the update can replace the bundled one.
  $node=Join-Path ([IO.Path]::GetTempPath()) ('3Mix-update-'+[guid]::NewGuid().ToString('N')+'.exe')
  Copy-Item -LiteralPath (Join-Path $root 'runtime\node.exe') -Destination $node
  try{
    $script = Join-Path $PSScriptRoot 'atualizar-3mix.mjs'
    if(-not (Test-Path $script)){ $script = Join-Path $PSScriptRoot 'atualizar-freemix.mjs' }
    $output=& $node $script $action $root $target 2>&1
    if($LASTEXITCODE -ne 0){ throw (($output|Out-String).Trim()) }
    return (($output|Out-String).Trim())
  } finally { Remove-Item -LiteralPath $node -Force -ErrorAction SilentlyContinue }
}
New-Item -ItemType Directory -Path $updates -Force | Out-Null
$version='';$applied=$false
try{
  Start-Sleep -Seconds 2
  Log ('inicio pacote='+$Package)
  CloseInstallation
  Log 'instalacao fechada'
  $info=(RunUpdater 'apply' $Package)|ConvertFrom-Json
  $version=$info.version;$applied=$true
  Log ('aplicada '+$version+' backup='+$info.backup)
  Open3Mix
  if(CameBack){
    Result 'installed' $version 'Atualizado.'
    Log 'confirmada'
    Remove-Item -LiteralPath $Package -Recurse -Force -ErrorAction SilentlyContinue
    exit 0
  }
  Log 'a versao nova nao abriu; restaurando a anterior'
  CloseInstallation
  RunUpdater 'rollback' $info.backup | Out-Null
  Result 'rolled-back' $version 'A versao nova nao abriu. A anterior foi restaurada.'
  Log 'restaurada'
  Open3Mix
  exit 1
}catch{
  $text=$_.Exception.Message
  Log ('falha: '+$text)
  if(-not $applied){ Result 'failed' $version ('A atualizacao nao foi aplicada: '+$text) }
  else { Result 'failed' $version ('Falha depois de aplicar: '+$text) }
  try{ if(-not @(Get-CimInstance Win32_Process -Filter "Name='FreeMix.exe'"|Where-Object { $_.ExecutablePath -like ($root+'\*') }).Count){ Open3Mix } }catch{}
  exit 1
}
