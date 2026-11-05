// Diagnóstico do computador: inventário, encoders testados de verdade, disco, rede local e perfil de capacidade.
// Serviço comum ao assistente de primeira execução, ao assistente de projeto e ao Pre-Flight.
// Regras: dado que o Windows não entrega fica null (nunca inventado); testes pesados só quando chamados,
// com tamanho controlado, cancelamento e limpeza do que foi criado.
import { execFile, spawn } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { detectResizableBar } from './rebar-diagnostico.mjs';

const ps = (script, timeout = 30000) => new Promise((resolve, reject) => {
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '[Console]::OutputEncoding=[Text.Encoding]::UTF8;' + script],
    { timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' }, (e, out) => (e ? reject(e) : resolve(out)));
});

const INVENTARIO = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$cs = Get-CimInstance Win32_ComputerSystem
$os = Get-CimInstance Win32_OperatingSystem
$reg = @{}
Get-ItemProperty 'HKLM:\SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0*' | Where-Object { $_.DriverDesc } | ForEach-Object { $reg[$_.DriverDesc] = $_.'HardwareInformation.qwMemorySize' }
$gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object { @{ nome = $_.Name; driver = $_.DriverVersion; vram = $(if ($reg[$_.Name]) { [double]$reg[$_.Name] } else { [double]$_.AdapterRAM }); vramRegistro = [bool]$reg[$_.Name] } })
$telas = @([System.Windows.Forms.Screen]::AllScreens | ForEach-Object { @{ nome = $_.DeviceName; largura = $_.Bounds.Width; altura = $_.Bounds.Height; principal = $_.Primary } })
$captura = @(Get-PnpDevice -Class Camera,Image -Status OK | ForEach-Object { @{ nome = $_.FriendlyName; classe = $_.Class } })
$audio = @(Get-PnpDevice -Class AudioEndpoint -Status OK | ForEach-Object { $_.FriendlyName })
$discos = @(Get-PhysicalDisk | ForEach-Object { @{ nome = $_.FriendlyName; tipo = [string]$_.MediaType; barramento = [string]$_.BusType; tamanho = [double]$_.Size } })
$volumes = @(Get-Volume | Where-Object { $_.DriveLetter -and $_.DriveType -eq 'Fixed' } | ForEach-Object { @{ letra = [string]$_.DriveLetter; livre = [double]$_.SizeRemaining; tamanho = [double]$_.Size; sistemaArquivos = $_.FileSystem } })
@{ cpu = @{ nome = $cpu.Name.Trim(); nucleos = $cpu.NumberOfCores; threads = $cpu.NumberOfLogicalProcessors; mhz = $cpu.MaxClockSpeed }; ram = [double]$cs.TotalPhysicalMemory; windows = $os.Caption + ' ' + $os.Version; gpus = $gpus; telas = $telas; captura = $captura; audio = $audio; discos = $discos; volumes = $volumes } | ConvertTo-Json -Compress -Depth 5
`;

const gb = (b) => (b ? Number((b / 1024 ** 3).toFixed(1)) : null);

/** Hardware deste computador. Campos que o Windows não entregou ficam null. */
export async function inventario() {
  const bruto = JSON.parse(await ps(INVENTARIO, 45000));
  const nvidia = await nvidiaSmi();
  // Platform-level signal only: Resizable BAR is BIOS+firmware+driver, not an app-level
  // D3D11 toggle. Reported purely for the Alpha hardware matrix; never implies app opt-in.
  const resizableBar = nvidia.length ? await detectResizableBar() : { status: 'undetermined', vendor: 'none', reason: 'Nenhuma GPU NVIDIA identificada por nvidia-smi nesta leitura' };
  return {
    lidoEm: new Date().toISOString(),
    resizableBar,
    windows: bruto.windows || null,
    cpu: bruto.cpu?.nome ? bruto.cpu : null,
    ramGb: gb(bruto.ram),
    gpus: (bruto.gpus || []).map((g) => {
      const n = nvidia.find((x) => x.nome === g.nome);
      // Sem o registro, o WMI corta a VRAM em 4 GB: nesse caso o valor fica marcado como aproximado.
      return { nome: g.nome, driver: g.driver || null, vramGb: n?.vramGb ?? gb(g.vram), vramExata: !!n || !!g.vramRegistro, temperatura: n?.temperatura ?? null };
    }),
    telas: bruto.telas || [],
    captura: bruto.captura || [],
    audio: bruto.audio || [],
    discos: (bruto.discos || []).map((d) => ({ nome: d.nome, tipo: d.tipo || null, barramento: d.barramento || null, tamanhoGb: gb(d.tamanho) })),
    volumes: (bruto.volumes || []).map((v) => ({ letra: v.letra, livreGb: gb(v.livre), tamanhoGb: gb(v.tamanho), sistemaArquivos: v.sistemaArquivos || null }))
  };
}

/** Dados da NVIDIA quando o driver traz o nvidia-smi; senão, lista vazia. */
export async function nvidiaSmi() {
  return new Promise((resolve) => {
    execFile('nvidia-smi', ['--query-gpu=name,memory.total,driver_version,temperature.gpu,utilization.gpu', '--format=csv,noheader,nounits'], { timeout: 8000, windowsHide: true, encoding: 'utf8' }, (e, out) => {
      if (e) return resolve([]);
      resolve(out.trim().split(/\r?\n/).filter(Boolean).map((l) => { const [nome, mem, driver, temp, uso] = l.split(',').map((x) => x.trim()); return { nome, vramGb: Number((Number(mem) / 1024).toFixed(1)), driver, temperatura: Number(temp), uso: Number(uso) }; }));
    });
  });
}

export const ENCODERS_TESTE = [
  ['h264_nvenc', 'NVIDIA H.264'], ['hevc_nvenc', 'NVIDIA HEVC'], ['av1_nvenc', 'NVIDIA AV1'],
  ['h264_qsv', 'Intel Quick Sync H.264'], ['hevc_qsv', 'Intel Quick Sync HEVC'], ['av1_qsv', 'Intel Quick Sync AV1'],
  ['h264_amf', 'AMD H.264'], ['hevc_amf', 'AMD HEVC'], ['av1_amf', 'AMD AV1'],
  ['libx264', 'x264 (CPU)']
];

/**
 * Codifica 3 s de vídeo 1080p60 com cada encoder e mede a velocidade. Estar compilado no ffmpeg
 * não prova que o hardware existe: só conta o que codificou de verdade.
 */
export async function testarEncoders(ffmpeg, { sinal, aoProgresso } = {}) {
  if (!existsSync(ffmpeg)) throw new Error('ffmpeg do 3Mix não encontrado em ' + ffmpeg + '. Reinstale o 3Mix.');
  const resultado = [];
  for (const [id, nome] of ENCODERS_TESTE) {
    if (sinal?.aborted) break;
    aoProgresso?.(`Testando ${nome}`);
    const t0 = Date.now();
    const r = await new Promise((resolve) => {
      const p = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=60', '-t', '3', '-c:v', id, '-f', 'null', '-'], { windowsHide: true });
      let erro = '';
      p.stderr.on('data', (d) => { erro += d; });
      const fim = setTimeout(() => p.kill(), 25000);
      const parar = () => p.kill();
      sinal?.addEventListener('abort', parar, { once: true });
      // Sem 'error', um ffmpeg ausente deixaria a promessa pendurada para sempre.
      p.on('error', (e) => { clearTimeout(fim); sinal?.removeEventListener('abort', parar); resolve({ code: -1, erro: 'ffmpeg não abriu: ' + e.message }); });
      p.on('close', (code) => { clearTimeout(fim); sinal?.removeEventListener('abort', parar); resolve({ code, erro }); });
    });
    const s = (Date.now() - t0) / 1000;
    resultado.push(r.code === 0
      ? { id, nome, funciona: true, fps: Math.round(180 / s), tempoS: Number(s.toFixed(1)) }
      : { id, nome, funciona: false, motivo: r.erro.split(/\r?\n/).find((l) => l.trim())?.slice(0, 160) || 'não abriu' });
  }
  return resultado;
}

/** Escreve e lê de volta um arquivo de tamanho controlado na pasta pedida, e apaga. */
export async function testarDisco(pasta, { mb = 512, sinal } = {}) {
  const arq = join(pasta, '.3mix-diagnostico-' + randomBytes(4).toString('hex') + '.tmp');
  const bloco = randomBytes(8 * 1024 * 1024);
  const blocos = Math.max(1, Math.round(mb / 8));
  try {
    let t0 = process.hrtime.bigint();
    const h = await open(arq, 'w');
    try {
      for (let i = 0; i < blocos; i++) { if (sinal?.aborted) throw new Error('cancelado'); await h.write(bloco); }
      await h.sync();
    } finally { await h.close(); }
    const escritaS = Number(process.hrtime.bigint() - t0) / 1e9;
    t0 = process.hrtime.bigint();
    const r = await open(arq, 'r');
    const buf = Buffer.alloc(bloco.length);
    try { for (let i = 0; i < blocos; i++) { if (sinal?.aborted) throw new Error('cancelado'); await r.read(buf, 0, buf.length, i * buf.length); } } finally { await r.close(); }
    const leituraS = Number(process.hrtime.bigint() - t0) / 1e9;
    return { pasta, mb: blocos * 8, escritaMBs: Math.round((blocos * 8) / escritaS), leituraMBs: Math.round((blocos * 8) / leituraS), observacao: 'A leitura logo após a escrita pode vir da memória do Windows; a escrita é o número que importa para gravar.' };
  } finally {
    await rm(arq, { force: true }).catch(() => {});
  }
}

/** Latência, variação e perda até o roteador (rede local). Internet só se pedido. */
export async function testarRede({ externo = false } = {}) {
  const script = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$gw = (Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1).NextHop
$alvos = @(); if ($gw -and $gw -ne '0.0.0.0') { $alvos += @{ nome = 'roteador'; host = $gw } }
${externo ? "$alvos += @{ nome = 'internet'; host = '1.1.1.1' }" : ''}
$saida = @()
foreach ($a in $alvos) {
  $r = @(Test-Connection -ComputerName $a.host -Count 20 -ErrorAction SilentlyContinue)
  $t = @($r | ForEach-Object { if ($_.ResponseTime -ne $null) { [double]$_.ResponseTime } else { [double]$_.Latency } })
  $saida += @{ nome = $a.nome; host = $a.host; enviados = 20; recebidos = $t.Count; tempos = $t }
}
ConvertTo-Json -Compress -Depth 4 -InputObject @($saida)
`;
  const lista = JSON.parse(await ps(script, 60000) || '[]');
  return lista.map((a) => {
    const t = a.tempos || [];
    const media = t.length ? t.reduce((s, x) => s + x, 0) / t.length : null;
    const variacao = t.length > 1 ? Math.sqrt(t.reduce((s, x) => s + (x - media) ** 2, 0) / (t.length - 1)) : null;
    return { nome: a.nome, host: a.host, latenciaMs: media == null ? null : Number(media.toFixed(1)), variacaoMs: variacao == null ? null : Number(variacao.toFixed(1)), perdaPct: Number((100 * (a.enviados - a.recebidos) / a.enviados).toFixed(0)) };
  }).concat([{ nome: 'upload externo', medido: false, motivo: 'Sem serviço de medição configurado: o 3Mix não mede a velocidade de envio para a internet.' }]);
}

// ---------------------------------------------------------------- perfil de capacidade
export const arquivoPerfil = (raiz) => join(raiz, 'config', '3mix-perfil-capacidade.json');

/** Identidade do hardware: quando muda (GPU, driver, CPU, discos), o perfil precisa ser refeito. */
export function impressao(inv) {
  const base = [inv.cpu?.nome, inv.ramGb, ...(inv.gpus || []).map((g) => `${g.nome}|${g.driver}`), ...(inv.discos || []).map((d) => d.nome)].join(';');
  return createHash('sha256').update(base).digest('hex').slice(0, 16);
}

export async function lerPerfil(raiz) {
  try { return JSON.parse(await readFile(arquivoPerfil(raiz), 'utf8')); } catch { return null; }
}

export async function salvarPerfil(raiz, parte) {
  const atual = (await lerPerfil(raiz)) || {};
  const novo = { ...atual, ...parte, atualizadoEm: new Date().toISOString() };
  if (parte.inventario) novo.impressao = impressao(parte.inventario);
  await mkdir(join(raiz, 'config'), { recursive: true });
  await writeFile(arquivoPerfil(raiz), JSON.stringify(novo, null, 1));
  return novo;
}

/** Compara o hardware atual com o do perfil salvo. */
export async function precisaRevalidar(raiz, inv) {
  const perfil = await lerPerfil(raiz);
  if (!perfil?.impressao) return { precisa: true, motivo: 'Este computador ainda não foi medido.' };
  if (perfil.impressao !== impressao(inv)) return { precisa: true, motivo: 'GPU, driver, processador ou discos mudaram desde a última medição.' };
  return { precisa: false };
}

export const versaoInstalada = async (raiz) => {
  const f = join(raiz, 'version.json');
  if (!existsSync(f)) return null;
  try { return JSON.parse(await readFile(f, 'utf8')).version || null; } catch { return null; }
};

// ---------------------------------------------------------------- equipamentos
/**
 * Câmeras PTZ ONVIF que respondem na rede local (WS-Discovery, multicast 239.255.255.250:3702).
 * VISCA sobre IP não tem descoberta padrão: essas câmeras são cadastradas pelo endereço.
 */
export function descobrirOnvif({ ms = 3000 } = {}) {
  return new Promise((resolve) => {
    const id = 'uuid:' + randomBytes(16).toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
    const probe = `<?xml version="1.0" encoding="UTF-8"?><e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope" xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:dn="http://www.onvif.org/ver10/network/wsdl"><e:Header><w:MessageID>${id}</w:MessageID><w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To><w:Action e:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action></e:Header><e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body></e:Envelope>`;
    const achados = new Map();
    let sock;
    try { sock = createSocket({ type: 'udp4', reuseAddr: true }); } catch { return resolve({ medido: false, motivo: 'Rede indisponível', cameras: [] }); }
    sock.on('error', () => {});
    sock.on('message', (msg, rinfo) => {
      const xml = msg.toString('utf8');
      const enderecos = (/<[^>]*XAddrs>([^<]+)</.exec(xml)?.[1] || '').trim().split(/\s+/).filter(Boolean);
      const escopos = decodeURIComponent(/<[^>]*Scopes[^>]*>([^<]+)</.exec(xml)?.[1] || '');
      const nome = /onvif:\/\/www\.onvif\.org\/name\/(\S+)/.exec(escopos)?.[1]?.replace(/_/g, ' ') || null;
      const modelo = /onvif:\/\/www\.onvif\.org\/hardware\/(\S+)/.exec(escopos)?.[1] || null;
      const ptz = /ptz/i.test(escopos);
      achados.set(rinfo.address, { ip: rinfo.address, nome, modelo, enderecos, ptzAnunciado: ptz });
    });
    sock.bind(0, () => {
      try { sock.setBroadcast(true); sock.send(probe, 3702, '239.255.255.250'); } catch { /* sem multicast */ }
      setTimeout(() => { try { sock.close(); } catch { /* fechado */ } resolve({ medido: true, cameras: [...achados.values()] }); }, ms);
    });
  });
}

// Controladores com suporte no 3Mix: MIDI (atalhos), Stream Deck e X-keys (adaptadores), além de OSC e Companion pela rede.
const CONTROLADORES = [[/VID_0FD9/i, 'Elgato Stream Deck', 'streamdeck'], [/VID_05F3/i, 'P.I. Engineering X-keys', 'xkeys']];
export async function controladoresConectados() {
  const bruto = await ps(String.raw`
$ErrorActionPreference = 'SilentlyContinue'
@(Get-CimInstance Win32_PnPEntity | Where-Object { $_.Status -eq 'OK' -and ($_.PNPDeviceID -match 'VID_0FD9|VID_05F3' -or ($_.PNPClass -eq 'MEDIA' -and $_.Name -match 'MIDI|APC|Launch|nanoKONTROL|X-Touch|Akai|Korg|Behringer|Novation|Arturia|Midiplus')) } | ForEach-Object { @{ nome = $_.Name; id = $_.PNPDeviceID; classe = $_.PNPClass } }) | ConvertTo-Json -Compress -Depth 3
`, 30000).catch(() => '[]');
  const lista = [].concat(JSON.parse(bruto || '[]') || []);
  const vistos = new Set();
  return lista.map((d) => {
    const c = CONTROLADORES.find(([re]) => re.test(d.id));
    return c ? { nome: c[1], tipo: c[2], dispositivo: d.nome } : { nome: d.nome, tipo: 'midi', dispositivo: d.nome };
  }).filter((d) => { const k = d.tipo + '|' + d.dispositivo; if (vistos.has(k)) return false; vistos.add(k); return true; });
}
