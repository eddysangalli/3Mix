# Prepares a QA copy to be opened natively, without ever touching the operator's 3mix-runtime.
# - refuses the operator installation and any destination without a QA marker;
# - refuses while the QA copy is running;
# - mirrors 3mix-panel/painel into <Destino>\painel, preserving painel\local.js and everything outside painel;
# - injects an "AMBIENTE DE TESTE" banner and a "3Mix QA —" page title into the copy only.
# It does not start the program. Close the QA window as soon as the visual check is done.
#
#   powershell -ExecutionPolicy Bypass -File preparar-qa-nativo.ps1 -Destino "D:\...\FreeMix-QA-..."
param(
  [Parameter(Mandatory = $true)][string]$Destino,
  [string]$Origem = ''
)
$ErrorActionPreference = 'Stop'
if (-not $Origem) { $Origem = Join-Path $PSScriptRoot '../../painel' }
$qaMarker = '(?i)\\(FreeMix-QA[^\\]*|3Mix-QA[^\\]*|qa-finalizacao|qa-replay)(\\|$)'
$dest = [IO.Path]::GetFullPath($Destino).TrimEnd('\')
$src = [IO.Path]::GetFullPath($Origem).TrimEnd('\')
$operator = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../3mix-runtime')).TrimEnd('\')

if ($dest -ieq $operator -or $dest.StartsWith($operator + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw "Recusado: $dest é a instalação do operador (3mix-runtime). Use uma cópia QA própria."
}
if ($dest -notmatch $qaMarker) {
  throw "Recusado: $dest não tem marcador de QA no caminho (FreeMix-QA, 3Mix-QA, qa-finalizacao ou qa-replay)."
}
if (-not (Test-Path (Join-Path $dest 'painel'))) {
  throw "Recusado: $dest não parece uma instalação (falta a pasta painel)."
}
$running = Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($dest + '\', [StringComparison]::OrdinalIgnoreCase) }
if ($running) {
  throw "A cópia QA está aberta (PID $($running.ProcessId -join ', ')). Feche a janela QA antes de sincronizar o painel."
}
if (-not (Test-Path (Join-Path $src 'mesa.html'))) { throw "Origem inválida: $src" }

Write-Host "Sincronizando painel de $src para $dest\painel (local.js preservado)…"
# /MIR remove painel antigo; /XF local.js preserva a configuração local da cópia.
& robocopy $src (Join-Path $dest 'painel') /MIR /XF local.js /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy falhou (código $LASTEXITCODE)" }

$qaJs = @'
// Injected only in the QA copy by preparar-qa-nativo.ps1.
(() => {
  const keep = () => {
    if (!document.getElementById('qa-ambiente-teste')) {
      const d = document.createElement('div');
      d.id = 'qa-ambiente-teste';
      d.innerHTML = '<b>AMBIENTE DE TESTE</b> · cópia QA · não é a instalação do operador';
      document.documentElement.appendChild(d);
    }
    const t = document.title.replace(/^3Mix QA — /, '');
    if (!document.title.startsWith('3Mix QA — ')) document.title = '3Mix QA — ' + t;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', keep); else keep();
  setInterval(keep, 800);
})();
'@
$qaCss = @'
#qa-ambiente-teste{position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:2147483647;background:#dca900;color:#171717;font:800 10.5px/1.2 "Segoe UI",sans-serif;padding:3px 12px;border-radius:0 0 4px 4px;box-shadow:0 2px 8px rgba(0,0,0,.55);pointer-events:none;letter-spacing:.35px;white-space:nowrap}
#qa-ambiente-teste b{font-weight:900}
'@
$utf8 = New-Object System.Text.UTF8Encoding($false)
$painel = Join-Path $dest 'painel'
[IO.File]::WriteAllText((Join-Path $painel 'qa-ambiente.js'), $qaJs, $utf8)
[IO.File]::WriteAllText((Join-Path $painel 'qa-ambiente.css'), $qaCss, $utf8)

$patched = 0
Get-ChildItem -Path $painel -Recurse -Filter *.html -File | ForEach-Object {
  $text = [IO.File]::ReadAllText($_.FullName, [Text.Encoding]::UTF8)
  if ($text -notmatch 'qa-ambiente\.js') {
    $inject = '<link rel="stylesheet" href="qa-ambiente.css"><script src="qa-ambiente.js"></script>'
    if ($text -match '(?i)</body>') { $text = [Text.RegularExpressions.Regex]::Replace($text, '(?i)</body>', "$inject</body>", 1) }
    else { $text += $inject }
    [IO.File]::WriteAllText($_.FullName, $text, $utf8)
  }
  if ($text -match '<title>') { $patched++ }
}
Write-Host "Painel sincronizado; faixa de teste aplicada em $patched páginas."
Write-Host "Antes de abrir: dê à produção/preset da cópia QA um nome que comece por '3Mix QA —'."
Write-Host "Ao terminar a verificação visual, feche a janela QA. Use fechar-qa.ps1 -Destino '$dest' se precisar."
