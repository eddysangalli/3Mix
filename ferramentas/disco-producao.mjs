// Fase 3.3 do super-prompt ("mensagens acionáveis para: disco cheio") pedia essa checagem
// tanto no Pre-Flight operacional quanto na primeira execução/conexão -- até aqui só existia
// dentro de preflight-producao.mjs, acoplada ao momento pós-conexão com o motor. Extraída
// para uso compartilhado sem duplicar a lógica nem mudar o comportamento já testado do
// Pre-Flight (ele passa a chamar esta função, em vez de reimplementá-la).
import { statfs, open, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { platform } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

// Mesmos limiares e estimativa de preflight-producao.mjs (15 Mbps de gravação PGM,
// ~6.75 GB/hora) -- preservados intencionalmente para as duas checagens concordarem.
const CRITICAL_GB = 5, LOW_GB = 20, BITRATE_MBPS = 15;

export async function diskReport(targetDir) {
  if (typeof statfs !== 'function') return { supported: false };
  const stats = await statfs(targetDir).catch(() => null);
  if (!stats) return { supported: false };
  const freeBytes = Number(stats.bavail) * Number(stats.bsize);
  const totalBytes = Number(stats.blocks) * Number(stats.bsize);
  const bytesPerHour = (BITRATE_MBPS * 1000 * 1000 / 8) * 3600;
  const freeGb = Number((freeBytes / (1024 * 1024 * 1024)).toFixed(1));
  const totalGb = Number((totalBytes / (1024 * 1024 * 1024)).toFixed(1));
  const estRecordingHours = Number((freeBytes / bytesPerHour).toFixed(1));
  const severity = freeGb < CRITICAL_GB ? 'CRITICAL' : freeGb < LOW_GB ? 'WARN' : 'OK';
  return { supported: true, freeGb, totalGb, estRecordingHours, severity };
}

// Detecção de disco físico por nome amigável (Fase 3 do superprompt: "nice-to-have de UX,
// não bloqueio funcional" — o operador já pode apontar cada câmera para uma pasta diferente
// hoje via perInput.directory; isto só mostra QUAL disco físico cada pasta está, para o
// MultiCorder avisar se duas câmeras caíram sem querer no mesmo disco). Só Windows (onde o
// 3Mix roda hoje); em qualquer outra plataforma ou falha, devolve supported:false — nunca
// lança, nunca bloqueia quem chamou. Só leitura (Get-Partition/Get-Disk), nunca altera nada.
const DISK_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$result = @{}
foreach ($p in Get-Partition) {
  if (-not $p.DriveLetter) { continue }
  $disk = $p | Get-Disk
  if ($disk) { $result[[string]$p.DriveLetter] = @{ numero = $disk.Number; nome = $disk.FriendlyName; barramento = [string]$disk.BusType; serie = [string]$disk.SerialNumber } }
}
$result | ConvertTo-Json -Compress -Depth 4
`;

function powershellDisco(timeout = 8000) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', DISK_SCRIPT],
      { timeout, windowsHide: true, maxBuffer: 1024 * 1024, encoding: 'utf8' },
      (erro, saida) => (erro ? reject(erro) : resolve(saida)));
  });
}

// Normaliza a saída (PowerShell devolve objeto único em vez de dict quando só há 1 drive
// letter com partição — ConvertTo-Json não produz um array/dict consistente nesse caso;
// aqui tratamos string vazia/objeto único/dict normalmente, sem supor a forma).
function normalizarPorLetra(bruto) {
  const obj = JSON.parse(bruto || '{}');
  const porLetra = new Map();
  if (obj && typeof obj === 'object') for (const [letra, info] of Object.entries(obj)) {
    if (info && typeof info === 'object') porLetra.set(letra.toUpperCase(), { numero: Number(info.numero), nome: String(info.nome || '').trim() || 'Disco ' + info.numero, barramento: String(info.barramento || ''), serie: String(info.serie || '').trim() });
  }
  return porLetra;
}

let cache = null, cacheAt = 0;
const CACHE_MS = 60000; // discos não mudam a cada segundo; evita chamar PowerShell em loop

async function mapaDiscos() {
  if (cache && Date.now() - cacheAt < CACHE_MS) return cache;
  if (platform() !== 'win32') { cache = new Map(); cacheAt = Date.now(); return cache; }
  try { cache = normalizarPorLetra(await powershellDisco()); } catch { cache = new Map(); }
  cacheAt = Date.now();
  return cache;
}

// Para um caminho absoluto (ex. "D:\Gravacoes\CAM1"), devolve o disco físico real por trás
// da letra de unidade. supported:false se não for Windows, PowerShell falhar, ou o caminho
// não começar com uma letra de unidade reconhecível (ex. caminho UNC \\servidor\pasta).
export async function discoFisico(caminhoAbsoluto) {
  const letra = /^([a-z]):[\\/]/i.exec(String(caminhoAbsoluto || ''))?.[1]?.toUpperCase();
  if (!letra) return { supported: false };
  const mapa = await mapaDiscos();
  const info = mapa.get(letra);
  if (!info) return { supported: false };
  return { supported: true, letra, ...info };
}

// Dado um conjunto de { nome: caminho } (ex. por câmera do MultiCorder), devolve o disco
// físico de cada um e sinaliza colisões reais — duas câmeras apontando para o MESMO disco
// físico (não só pastas diferentes), que é exatamente o cenário que o MultiCorder existe
// para permitir evitar. Nunca lança; entradas sem detecção possível ficam supported:false,
// nunca excluídas silenciosamente (quem chama precisa saber que aquela não foi verificada).
export async function mapaMultiCorder(porNome) {
  const entradas = await Promise.all(Object.entries(porNome || {}).map(async ([nome, caminho]) => ({ nome, caminho, disco: await discoFisico(caminho) })));
  const porDisco = new Map();
  for (const e of entradas) if (e.disco.supported) { const lista = porDisco.get(e.disco.numero) || []; lista.push(e.nome); porDisco.set(e.disco.numero, lista); }
  const colisoes = [...porDisco.entries()].filter(([, nomes]) => nomes.length > 1).map(([numero, nomes]) => ({ numero, nomes }));
  return { entradas, colisoes };
}

// Perfis broadcast canônicos (Fase 2 e Fase 3 do superprompt) com matrizes de bitrate
// nominal e contêineres recomendados (MXF OP1a, MOV ProRes, MKV/MP4 broadcast).
export const BROADCAST_PROFILES = {
  'xdcam_hd422': { id: 'xdcam_hd422', nome: 'Sony XDCAM HD422 (MPEG-2 50Mbps 4:2:2)', bitrateMbps: 50, container: 'mxf', codec: 'mpeg2video', pixFmt: 'yuv422p', desc: 'Padrão emissoras TV aberta e cabo (1080i50/59.94 ou 1080p25/29.97)' },
  'dnxhd_145': { id: 'dnxhd_145', nome: 'Avid DNxHD 145 / DNxHR SQ (8-bit 4:2:2)', bitrateMbps: 145, container: 'mxf', codec: 'dnxhd', pixFmt: 'yuv422p', desc: 'Edição offline e contribuição standard' },
  'dnxhd_220': { id: 'dnxhd_220', nome: 'Avid DNxHD 220 / DNxHR HQ (8-bit 4:2:2)', bitrateMbps: 220, container: 'mxf', codec: 'dnxhd', pixFmt: 'yuv422p', desc: 'Master broadcast e finalização HD/4K' },
  'dnxhr_444': { id: 'dnxhr_444', nome: 'Avid DNxHR 444 (10-bit 4:4:4)', bitrateMbps: 440, container: 'mxf', codec: 'dnxhd', pixFmt: 'yuv444p10le', desc: 'VFX, gradação de cor e estúdio virtual' },
  'prores_422': { id: 'prores_422', nome: 'Apple ProRes 422 (147Mbps)', bitrateMbps: 147, container: 'mov', codec: 'prores', pixFmt: 'yuv422p10le', desc: 'Padrão NLE Final Cut Pro / Premiere' },
  'prores_hq': { id: 'prores_hq', nome: 'Apple ProRes 422 HQ (220Mbps)', bitrateMbps: 220, container: 'mov', codec: 'prores', pixFmt: 'yuv422p10le', desc: 'Master de alta fidelidade visual' },
  'h264_broadcast': { id: 'h264_broadcast', nome: 'H.264 Broadcast CBR (50Mbps)', bitrateMbps: 50, container: 'mkv', codec: 'h264', pixFmt: 'yuv420p', desc: 'Alta taxa de bits com máxima compatibilidade' },
  'h264_hq': { id: 'h264_hq', nome: 'H.264 Alta Qualidade (CRF 18 / ~20Mbps)', bitrateMbps: 20, container: 'mkv', codec: 'h264', pixFmt: 'yuv420p', desc: 'Gravação ISO de produção equilibrada' },
  'h264_default': { id: 'h264_default', nome: 'H.264 Padrão (CRF 23 / ~12Mbps)', bitrateMbps: 12, container: 'mkv', codec: 'h264', pixFmt: 'yuv420p', desc: 'Baixo consumo de espaço em disco' },
  'hevc_default': { id: 'hevc_default', nome: 'HEVC / H.265 Eficiente (~10Mbps)', bitrateMbps: 10, container: 'mkv', codec: 'hevc', pixFmt: 'yuv420p', desc: 'Alta compressão para ISOs longas' },
  'av1_default': { id: 'av1_default', nome: 'AV1 Broadcast (~8Mbps)', bitrateMbps: 8, container: 'mkv', codec: 'av1', pixFmt: 'yuv420p', desc: 'Codec aberto de próxima geração' },
  'mpegts_live': { id: 'mpegts_live', nome: 'MPEG-TS Live (~12Mbps)', bitrateMbps: 12, container: 'mpegts', codec: 'h264', pixFmt: 'yuv420p', desc: 'Tolerante a desligamentos repentinos' }
};

// Estima throughput em MB/s e consumo de armazenamento em GB/h por câmera e no total.
export function estimativaMultiCorder({ format = 'mpegts', encoder = 'default', crf = 23, camsCount = 1, broadcastProfile = null, freeGb = null } = {}) {
  const profileKey = broadcastProfile && BROADCAST_PROFILES[broadcastProfile] ? broadcastProfile :
    format === 'mxf' ? 'xdcam_hd422' :
    format === 'mov' ? 'prores_422' :
    format === 'mpegts' ? 'mpegts_live' :
    crf <= 18 ? 'h264_hq' : 'h264_default';

  const profile = BROADCAST_PROFILES[profileKey] || BROADCAST_PROFILES['h264_default'];
  const bitrateMbps = profile.bitrateMbps;
  // MB/s em base decimal (1 MB = 1.000.000 bytes) usado em especificações de throughput de storage
  const mbPerSecPerCam = Number((bitrateMbps / 8).toFixed(2));
  // GB/h em base decimal (1 GB = 10^9 bytes)
  const gbPerHourPerCam = Number(((bitrateMbps * 1e6 / 8) * 3600 / 1e9).toFixed(1));

  const totalCams = Math.max(1, Number(camsCount) || 1);
  const totalMbPerSec = Number((mbPerSecPerCam * totalCams).toFixed(2));
  const totalGbPerHour = Number((gbPerHourPerCam * totalCams).toFixed(1));

  let estHoursRemaining = null;
  let severity = 'OK';
  if (typeof freeGb === 'number' && freeGb > 0 && totalGbPerHour > 0) {
    estHoursRemaining = Number((freeGb / totalGbPerHour).toFixed(1));
    if (estHoursRemaining < 1.0 || freeGb < 5) severity = 'CRITICAL';
    else if (estHoursRemaining < 3.0 || freeGb < 20) severity = 'WARN';
  }

  return {
    profileKey,
    nomePerfil: profile.nome,
    container: profile.container,
    codec: profile.codec,
    bitrateMbps,
    mbPerSecPerCam,
    gbPerHourPerCam,
    totalCams,
    totalMbPerSec,
    totalGbPerHour,
    freeGb,
    estHoursRemaining,
    severity
  };
}

// Teste concorrente de escrita não destrutivo (Fase 3 do superprompt):
// Escreve um bloco temporário de 8MB simultaneamente em todas as pastas alvos
// e mede a vazão sustentada em MB/s por disco/pasta, limpando os arquivos em seguida.
export async function testeEscritaConcorrente(diretorios = [], tamanhoBytes = 8 * 1024 * 1024) {
  if (!Array.isArray(diretorios) || !diretorios.length) return { success: false, error: 'Nenhum diretório fornecido' };
  const bloco = Buffer.alloc(tamanhoBytes, 0x5a);
  const resultados = [];

  await Promise.all(diretorios.map(async (dir) => {
    const nomeArq = join(dir, `.3mix-bench-${randomBytes(4).toString('hex')}.tmp`);
    const t0 = process.hrtime.bigint();
    let gravado = false, velocidadeMBs = 0, erro = null;
    try {
      const h = await open(nomeArq, 'w');
      try {
        await h.write(bloco);
        await h.sync();
        gravado = true;
      } finally {
        await h.close();
      }
      const dt = Number(process.hrtime.bigint() - t0) / 1e9;
      velocidadeMBs = Number((tamanhoBytes / (1024 * 1024) / dt).toFixed(1));
    } catch (e) {
      erro = e.code || e.message;
    } finally {
      if (gravado) await rm(nomeArq, { force: true }).catch(() => {});
    }
    resultados.push({ diretorio: dir, gravado, velocidadeMBs, erro });
  }));

  const sucesso = resultados.every((r) => r.gravado);
  return { success: sucesso, resultados };
}
