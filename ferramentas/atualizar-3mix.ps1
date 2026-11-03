param([ValidateSet('check','apply','rollback')][string]$Action='check',[Parameter(Mandatory=$true)][string]$Package)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$packagePath=(Resolve-Path -LiteralPath $Package).Path
$node=Join-Path $root 'runtime/node.exe'
if(-not(Test-Path -LiteralPath $node)){throw 'Node portátil ausente'}
# Run the updater outside the installation so Windows can replace its bundled Node.
$tempNode=Join-Path ([IO.Path]::GetTempPath()) ('3Mix-update-'+[guid]::NewGuid().ToString('N')+'.exe')
Copy-Item -LiteralPath $node -Destination $tempNode
try { & $tempNode (Join-Path $PSScriptRoot 'atualizar-3Mix.mjs') $Action $root $packagePath; if($LASTEXITCODE -ne 0){throw 'Atualização recusada; consulte a mensagem acima'} }
finally { if([IO.Path]::GetFullPath($tempNode).StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($tempNode) -match '^3Mix-update-[a-f0-9]{32}\.exe$'){Remove-Item -LiteralPath $tempNode -Force -ErrorAction SilentlyContinue} }

