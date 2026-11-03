// Leitura da carga do computador para o Pre-Flight: CPU, memória, GPU e processos.
// Só leitura (contadores do Windows via CIM); nunca altera nada. Sem dado, devolve null:
// o Pre-Flight marca "não verificado" em vez de supor que está tudo bem.
import { execFile } from 'node:child_process';

const SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$null = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process
$null = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine
Start-Sleep -Milliseconds 1000
$cpu = (Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'").PercentProcessorTime
$os = Get-CimInstance Win32_OperatingSystem
$cores = (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
$procs = @(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { $_.Name -ne '_Total' -and $_.Name -ne 'Idle' -and $_.IDProcess -gt 0 } | ForEach-Object { @{ n = $_.Name; p = [int]$_.IDProcess; c = [double]$_.PercentProcessorTime; m = [double]$_.WorkingSetPrivate } })
$gpu = @(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine | Where-Object { $_.UtilizationPercentage -gt 0 } | ForEach-Object { @{ n = $_.Name; u = [double]$_.UtilizationPercentage } })
$paths = @{}
Get-CimInstance Win32_Process | ForEach-Object { if ($_.ExecutablePath) { $paths[[string]$_.ProcessId] = $_.ExecutablePath } }
@{ cpu = [double]$cpu; cores = [int]$cores; livreKb = [double]$os.FreePhysicalMemory; totalKb = [double]$os.TotalVisibleMemorySize; procs = $procs; gpu = $gpu; paths = $paths } | ConvertTo-Json -Compress -Depth 4
`;

function powershell(script, timeout = 20000) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout, windowsHide: true, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' },
      (erro, saida) => (erro ? reject(erro) : resolve(saida)));
  });
}

/** Junta os dados brutos do Windows em uma amostra. Exportado para teste. */
export function montarAmostra(bruto) {
  const cores = Math.max(1, Number(bruto.cores) || 1);
  const gpuPorPid = new Map(), gpuPorMotor = new Map();
  for (const g of bruto.gpu || []) {
    const pid = Number(/pid_(\d+)/.exec(g.n)?.[1]);
    const motor = /engtype_([A-Za-z0-9]+)/.exec(g.n)?.[1] || 'outro';
    if (pid) gpuPorPid.set(pid, (gpuPorPid.get(pid) || 0) + g.u);
    gpuPorMotor.set(motor, (gpuPorMotor.get(motor) || 0) + g.u);
  }
  const gpuTotal = gpuPorMotor.size ? Math.min(100, Math.max(...gpuPorMotor.values())) : null;
  const processos = (bruto.procs || []).map((p) => ({
    pid: p.p,
    nome: String(p.n).replace(/#\d+$/, ''),
    cpu: Number((p.c / cores).toFixed(1)),
    ramMb: Math.round(p.m / (1024 * 1024)),
    gpu: Number(Math.min(100, gpuPorPid.get(p.p) || 0).toFixed(1)),
    caminho: bruto.paths?.[String(p.p)] || null
  }));
  return {
    cpu: Number(Number(bruto.cpu).toFixed(1)),
    nucleos: cores,
    ramLivreGb: Number((bruto.livreKb / (1024 * 1024)).toFixed(1)),
    ramTotalGb: Number((bruto.totalKb / (1024 * 1024)).toFixed(1)),
    gpu: gpuTotal === null ? null : Number(gpuTotal.toFixed(1)),
    processos
  };
}

/** Amostra atual da máquina, ou null se o Windows não respondeu. */
export async function amostrarMaquina() {
  if (process.platform !== 'win32') return null;
  try {
    const bruto = JSON.parse(await powershell(SCRIPT));
    return montarAmostra(bruto);
  } catch {
    return null;
  }
}

/**
 * Pede para um programa fechar como se o usuário clicasse no X da janela.
 * Nunca força: o programa pode perguntar se quer salvar, e a decisão é do usuário.
 */
export async function pedirFechamento(pids) {
  const lista = pids.filter((p) => Number.isInteger(p) && p > 4).join(',');
  if (!lista) return [];
  const script = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$saida = @()
foreach ($id in @(${lista})) {
  $p = Get-Process -Id $id
  if (-not $p) { $saida += @{ pid = $id; resultado = 'ja-fechado' }; continue }
  if ($p.MainWindowHandle -eq 0) { $saida += @{ pid = $id; resultado = 'sem-janela' }; continue }
  $null = $p.CloseMainWindow()
  $saida += @{ pid = $id; resultado = 'pedido' }
}
Start-Sleep -Seconds 6
foreach ($s in $saida) { if ($s.resultado -eq 'pedido') { if (-not (Get-Process -Id $s.pid)) { $s.resultado = 'fechou' } else { $s.resultado = 'aberto' } } }
ConvertTo-Json -Compress -InputObject @($saida)
`;
  try { return JSON.parse(await powershell(script, 30000)); } catch { return pids.map((pid) => ({ pid, resultado: 'falhou' })); }
}
