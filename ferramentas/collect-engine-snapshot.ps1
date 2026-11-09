param([ValidateRange(0,2147483647)][int]$ObservedEnginePid = 0)
$ErrorActionPreference = 'Stop'
try {
  $rows = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('3Mix.exe','FreeMix.exe','obs64.exe') -or ($ObservedEnginePid -gt 0 -and $_.ProcessId -eq $ObservedEnginePid) } | ForEach-Object {
    if (-not $_.ExecutablePath) { throw 'Engine executable path inaccessible' }
    @{ pid = [int]$_.ProcessId; path = [string]$_.ExecutablePath; exited = $false }
  })
  @{ complete = $true; snapshot = $rows } | ConvertTo-Json -Depth 4 -Compress
} catch {
  @{ complete = $false; snapshot = @(); error = 'Engine enumeration unavailable or incomplete' } | ConvertTo-Json -Compress
  exit 1
}
