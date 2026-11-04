param([Parameter(Mandatory=$true)][string]$DllPath)
$ErrorActionPreference = 'Stop'
$result = Get-AuthenticodeSignature -LiteralPath $DllPath
@{ status = [string]$result.Status; signer = if ($result.SignerCertificate) { [string]$result.SignerCertificate.Subject } else { $null } } | ConvertTo-Json -Compress
