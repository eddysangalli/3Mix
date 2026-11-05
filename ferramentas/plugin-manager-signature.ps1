param([Parameter(Mandatory = $true)][string]$DllPath)

$ErrorActionPreference = 'Stop'

# O servidor chama o Windows PowerShell 5.1 de um processo Node. Ambientes de
# desenvolvimento podem injetar modulos do PowerShell 7 antes dos modulos
# nativos no PSModulePath; nesse caso o auto-carregamento encontra o modulo,
# mas nao consegue importa-lo. Use explicitamente o modulo da instalacao do
# Windows para que a verificacao seja deterministica no launcher e no QA.
$securityModule = Join-Path ([Environment]::SystemDirectory) 'WindowsPowerShell\v1.0\Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1'
if (-not (Test-Path -LiteralPath $securityModule -PathType Leaf)) {
    throw "Modulo nativo Microsoft.PowerShell.Security nao encontrado: $securityModule"
}

Import-Module -Name $securityModule -Force -ErrorAction Stop

$result = Get-AuthenticodeSignature -LiteralPath $DllPath
@{
    status = [string]$result.Status
    signer = if ($result.SignerCertificate) { [string]$result.SignerCertificate.Subject } else { $null }
} | ConvertTo-Json -Compress
