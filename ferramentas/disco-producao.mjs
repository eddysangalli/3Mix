// Fase 3.3 do super-prompt ("mensagens acionáveis para: disco cheio") pedia essa checagem
// tanto no Pre-Flight operacional quanto na primeira execução/conexão -- até aqui só existia
// dentro de preflight-producao.mjs, acoplada ao momento pós-conexão com o motor. Extraída
// para uso compartilhado sem duplicar a lógica nem mudar o comportamento já testado do
// Pre-Flight (ele passa a chamar esta função, em vez de reimplementá-la).
import { statfs } from 'node:fs/promises';

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
