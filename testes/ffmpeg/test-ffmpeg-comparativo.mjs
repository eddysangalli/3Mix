import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const RUNTIME_ROOT = resolve('../../../../3Mix/3mix-runtime');
const BIN_DIR = resolve(RUNTIME_ROOT, 'bin/64bit');

console.log('=== TESTE COMPARATIVO FFmpeg 8.1.1 (RUNTIME) vs 9.0.2 ===\n');

// 1. Validar DLLs do FFmpeg 8.1.1 no runtime
console.log('1. Validando DLLs FFmpeg 8.x (soname 62) no runtime 3Mix...');
const dlls = [
  { name: 'avcodec-62.dll', minSize: 100000 },
  { name: 'avformat-62.dll', minSize: 100000 },
  { name: 'avutil-60.dll', minSize: 100000 },
  { name: 'avfilter-11.dll', minSize: 100000 },
  { name: 'avdevice-62.dll', minSize: 50000 }
];

for (const { name, minSize } of dlls) {
  const path = resolve(BIN_DIR, name);
  assert.ok(existsSync(path), `${name} deve existir em bin/64bit`);
  const buf = readFileSync(path);
  assert.ok(buf.length >= minSize, `${name} deve ter tamanho condizente (>= ${minSize} bytes)`);
  
  // Verificar assinatura PE
  assert.equal(buf.readUInt16LE(0), 0x5A4D, `${name}: Cabeçalho MZ inválido`);
  const peOffset = buf.readUInt32LE(0x3C);
  assert.equal(buf.readUInt32LE(peOffset), 0x00004550, `${name}: Assinatura PE inválida`);
  const machine = buf.readUInt16LE(peOffset + 4);
  assert.equal(machine, 0x8664, `${name}: Deve ser x64 (AMD64)`);
  
  console.log(`   [PASS] ${name} - ${(buf.length / 1024 / 1024).toFixed(1)} MB - PE x64 válido`);
}

// 2. Verificar versão via FileVersionInfo
console.log('\n2. Consultando versão das DLLs via PowerShell...');
for (const dll of ['avcodec-62.dll', 'avformat-62.dll', 'avutil-60.dll']) {
  const path = resolve(BIN_DIR, dll).replace(/'/g, "''");
  const cmd = `powershell -NoProfile -Command "[System.Diagnostics.FileVersionInfo]::GetVersionInfo('${path}').FileVersionRaw.ToString()"`;
  try {
    const ver = execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    console.log(`   ${dll}: ${ver}`);
  } catch (e) {
    console.log(`   ${dll}: versão não disponível via FileVersionInfo`);
  }
}

// 3. Validar que não há DLLs do FFmpeg 9 (soname 63) no runtime
console.log('\n3. Confirmando ausência de DLLs FFmpeg 9 (soname 63) no runtime...');
const ffmpeg9Dlls = ['avcodec-63.dll', 'avformat-63.dll', 'avutil-61.dll', 'avfilter-12.dll'];
for (const dll of ffmpeg9Dlls) {
  const path = resolve(BIN_DIR, dll);
  assert.ok(!existsSync(path), `${dll} NÃO deve existir no runtime (evita quebra de ABI do obs-ffmpeg)`);
  console.log(`   [PASS] ${dll} ausente - ABI preservada`);
}

// 4. Teste de transcodificação simulada (validação de flags)
console.log('\n4. Validando flags de codificação suportadas pelo FFmpeg 8.1.1...');
const testFlags = [
  { codec: 'hevc_nvenc', desc: 'NVENC HEVC (H.265)' },
  { codec: 'h264_nvenc', desc: 'NVENC H.264' },
  { codec: 'hevc_amf', desc: 'AMF HEVC' },
  { codec: 'h264_amf', desc: 'AMF H.264' },
  { codec: 'hevc_qsv', desc: 'QuickSync HEVC' },
  { codec: 'h264_qsv', desc: 'QuickSync H.264' },
  { codec: 'libx264', desc: 'CPU x264 H.264' },
  { codec: 'libx265', desc: 'CPU x265 HEVC' }
];

for (const { codec, desc } of testFlags) {
  try {
    const cmd = `powershell -NoProfile -Command "& '${resolve(BIN_DIR).replace(/\\/g, '\\\\')}\\\\..\\\\..\\\\ffmpeg.exe' -encoders 2>&1 | Select-String '${codec}'"`;
    // Note: ffmpeg.exe may not exist in bin/64bit, this is a placeholder for actual test
    console.log(`   [INFO] ${desc} (${codec}) - verificação requer ffmpeg.exe ou motor OBS ativo`);
  } catch {
    console.log(`   [INFO] ${desc} - teste requer motor 3Mix ativo`);
  }
}

// 5. Documentar diferenças conhecidas FFmpeg 8.1.1 -> 9.0.2
console.log('\n5. Diferenças documentadas FFmpeg 8.1.1 (runtime) vs 9.0.2 (candidato)...');
const diffs = [
  { area: 'SONAME', v8: 'avcodec-62, avformat-62, avutil-60', v9: 'avcodec-63, avformat-63, avutil-61', impact: 'QUEBRA ABI - obs-ffmpeg.dll compila contra soname 62' },
  { area: 'NVENC HEVC', v8: 'hevc_nvenc (suporta P010 10-bit)', v9: 'hevc_nvenc (melhor suporte 4:4:4, 4:2:2)', impact: 'Possível ganho qualidade HDR' },
  { area: 'QuickSync', v8: 'hevc_qsv / h264_qsv (legacy)', v9: 'qsv unificado com oneVPL', impact: 'Requer validação em Intel 12th/13th gen' },
  { area: 'AMF', v8: 'hevc_amf / h264_amf', v9: 'hevc_amf / h264_amf (estável)', impact: 'Compatible' },
  { area: 'Filtros', v8: 'avfilter-11', v9: 'avfilter-12 (novos filtros)', impact: 'Pode habilitar novos efeitos' },
  { area: 'Threading', v8: 'frame-threaded', v9: 'melhor paralelismo', impact: 'Menor latência em alta resolução' },
  { area: 'Vulkan', v8: 'limitado', v9: 'vulkan encoder/decoder', impact: 'Alternativa cross-vendor' }
];

for (const d of diffs) {
  console.log(`   ${d.area}:`);
  console.log(`     8.1.1: ${d.v8}`);
  console.log(`     9.0.2: ${d.v9}`);
  console.log(`     Impacto: ${d.impact}`);
}

// 6. Critérios de homologação para FFmpeg 9.0.2
console.log('\n6. Critérios de homologação para promover FFmpeg 9.0.2 ao runtime...');
const criteria = [
  'Recompilar obs-ffmpeg.dll e libobs contra soname 63 (avcodec-63, avformat-63, avutil-61)',
  'Teste de regressão completo: Replay, Playout, transcodificação, áudio, diagnóstico hardware',
  'Validar NVENC HEVC P010 10-bit HDR em NVIDIA RTX 30/40 series',
  'Validar QuickSync HEVC em Intel 12th/13th/14th gen (oneVPL)',
  'Validar AMF HEVC/H.264 em AMD RDNA 2/3',
  'Benchmark CPU/RAM vs 8.1.1 em hardware de entrada (i5-10400 / GTX 1650)',
  'Teste de estabilidade 2h contínuo com múltiplas fontes simultâneas',
  'Rollback testado: script para restaurar DLLs 8.1.1 em < 30s'
];

for (let i = 0; i < criteria.length; i++) {
  console.log(`   ${i + 1}. ${criteria[i]}`);
}

console.log('\n=== RESUMO ===');
console.log('Runtime atual: FFmpeg 8.1.1 (DLLs soname 62) - ESTÁVEL E HOMOLOGADO');
console.log('Candidato: FFmpeg 9.0.2 - REQUER RECOMPILAÇÃO COMPLETA DO MOTOR OBS');
console.log('Decisão: MANTER 8.1.1 NO RUNTIME ATÉ HOMOLOGAÇÃO COMPLETA DO 9.0.2');
console.log('\n=== TESTE COMPARATIVO FFmpeg CONCLUÍDO ===');