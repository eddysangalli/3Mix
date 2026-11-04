import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../../..');
const RUNTIME_ROOT = resolve(PROJECT_ROOT, '3mix-runtime');
const BIN_DIR = resolve(RUNTIME_ROOT, 'bin/64bit');
const FFMPEG_8_EXE = resolve(RUNTIME_ROOT, 'runtime/ffmpeg.exe');
const FFPROBE_EXE = resolve(RUNTIME_ROOT, 'runtime/ffprobe.exe');
const TEST_DIR = resolve(PROJECT_ROOT, 'qa-finalizacao/ffmpeg-comparativo');
const TEST_VIDEO = join(TEST_DIR, 'test-reference-10s.mp4');

let FFMPEG_9_EXE = null;
let ffmpeg9Available = false;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function runCommand(exe, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(exe, args, { 
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options
    });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => {
      if (code === 0) resolve({ stdout, stderr, code });
      else resolve({ stdout, stderr, code, error: new Error(`exit ${code}: ${stderr}`) });
    });
    proc.on('error', e => resolve({ stdout, stderr, code: -1, error: e }));
  });
}

async function findFfmpeg9() {
  const candidates = [
    'ffmpeg',
    'C:/ffmpeg-9.0.2/bin/ffmpeg.exe',
    'C:/Program Files/ffmpeg-9.0.2/bin/ffmpeg.exe',
    'D:/ffmpeg-9.0.2/bin/ffmpeg.exe',
    resolve(process.env.USERPROFILE || '', 'ffmpeg-9.0.2/bin/ffmpeg.exe'),
  ];
  
  for (const exe of candidates) {
    try {
      const { stdout } = await runCommand(exe, ['-version']);
      if (stdout.includes('ffmpeg version 9.')) {
        console.log(`   [DETECTADO] FFmpeg 9.0.2 em: ${exe}`);
        return exe;
      }
    } catch {}
  }
  return null;
}

async function probeVideo(exe, file) {
  const { stdout } = await runCommand(exe, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=nb_frames,duration,width,height,codec_name',
    '-of', 'csv=p=0', file
  ]);
  const [frames, duration, width, height, codec] = stdout.trim().split(',');
  return { 
    frames: parseInt(frames) || 0, 
    duration: parseFloat(duration) || 0, 
    width: parseInt(width) || 0, 
    height: parseInt(height) || 0,
    codec: codec || 'unknown'
  };
}

async function runTranscodeTest(exe, label, inputFile, outputFile, args) {
  const start = Date.now();
  const { stdout, stderr, code, error } = await runCommand(exe, [
    '-y', '-v', 'error', '-i', inputFile,
    ...args,
    outputFile
  ]);
  const elapsed = Date.now() - start;
  
  if (code === 0 && !error) {
    const info = await probeVideo(FFPROBE_EXE, outputFile);
    return { success: true, elapsed, frames: info.frames, duration: info.duration, codec: info.codec, size: (await import('node:fs')).readFileSync(outputFile).length };
  } else {
    return { success: false, elapsed, error: error?.message || stderr };
  }
}

console.log('=== TESTE COMPARATIVO FFmpeg 8.1.1 (RUNTIME) vs 9.0.2 ===\n');

if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });

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
  const path = join(BIN_DIR, name);
  assert.ok(existsSync(path), `${name} deve existir em bin/64bit`);
  const buf = readFileSync(path);
  assert.ok(buf.length >= minSize, `${name} deve ter tamanho condizente (>= ${minSize} bytes)`);
  assert.equal(buf.readUInt16LE(0), 0x5A4D, `${name}: Cabeçalho MZ inválido`);
  const peOffset = buf.readUInt32LE(0x3C);
  assert.equal(buf.readUInt32LE(peOffset), 0x00004550, `${name}: Assinatura PE inválida`);
  const machine = buf.readUInt16LE(peOffset + 4);
  assert.equal(machine, 0x8664, `${name}: Deve ser x64 (AMD64)`);
  console.log(`   [PASS] ${name} - ${(buf.length / 1024 / 1024).toFixed(1)} MB - PE x64 válido`);
}

// 2. Consultar versão das DLLs
console.log('\n2. Versões das DLLs FFmpeg 8.1.1 no runtime:');
for (const dll of ['avcodec-62.dll', 'avformat-62.dll', 'avutil-60.dll']) {
  const path = join(BIN_DIR, dll).replace(/'/g, "''");
  try {
    const { stdout } = await runCommand('powershell', ['-NoProfile', '-Command', `"[System.Diagnostics.FileVersionInfo]::GetVersionInfo('${path}').FileVersionRaw.ToString()"`]);
    console.log(`   ${dll}: ${stdout.trim() || 'N/A'}`);
  } catch {
    console.log(`   ${dll}: versão não disponível`);
  }
}

// 3. Confirmar ausência de DLLs FFmpeg 9 (soname 63)
console.log('\n3. Confirmando ausência de DLLs FFmpeg 9 (soname 63) no runtime...');
const ffmpeg9Dlls = ['avcodec-63.dll', 'avformat-63.dll', 'avutil-61.dll', 'avfilter-12.dll'];
for (const dll of ffmpeg9Dlls) {
  const path = join(BIN_DIR, dll);
  assert.ok(!existsSync(path), `${dll} NÃO deve existir no runtime (evita quebra de ABI do obs-ffmpeg)`);
  console.log(`   [PASS] ${dll} ausente - ABI preservada`);
}

// 4. Verificar FFmpeg 8.1.1 executável
console.log('\n4. Validando FFmpeg 8.1.1 executável do runtime...');
const { stdout: ver8 } = await runCommand(FFMPEG_8_EXE, ['-version']);
const ver8Match = ver8.match(/ffmpeg version ([\d.]+)/);
const ffmpeg8Version = ver8Match ? ver8Match[1] : 'unknown';
console.log(`   Versão: ${ffmpeg8Version}`);
assert.ok(ver8.includes('8.1.1'), 'Deve ser FFmpeg 8.1.1');
console.log('   [PASS] FFmpeg 8.1.1 confirmado');

// 5. Procurar FFmpeg 9.0.2
console.log('\n5. Procurando FFmpeg 9.0.2 para comparação...');
FFMPEG_9_EXE = await findFfmpeg9();
if (FFMPEG_9_EXE) {
  ffmpeg9Available = true;
  const { stdout: ver9 } = await runCommand(FFMPEG_9_EXE, ['-version']);
  const ver9Match = ver9.match(/ffmpeg version ([\d.]+)/);
  console.log(`   [DISPONÍVEL] FFmpeg ${ver9Match ? ver9Match[1] : '9.x'} detectado`);
} else {
  console.log('   [NÃO DISPONÍVEL] FFmpeg 9.0.2 não encontrado no sistema');
  console.log('   Locais: PATH, C:/ffmpeg-9.0.2, C:/Program Files/ffmpeg-9.0.2, D:/ffmpeg-9.0.2, ~/ffmpeg-9.0.2');
}

// 6. Gerar vídeo de referência se não existir
if (!existsSync(TEST_VIDEO)) {
  console.log('\n6. Gerando vídeo de referência 10s...');
  await runCommand(FFMPEG_8_EXE, [
    '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=10',
    '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=10:sample_rate=48000',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-pix_fmt', 'yuv420p', TEST_VIDEO
  ]);
  console.log('   [PASS] Vídeo de referência gerado');
} else {
  console.log('\n6. Vídeo de referência já existe');
}

const refInfo = await probeVideo(FFPROBE_EXE, TEST_VIDEO);
console.log(`   Referência: ${refInfo.frames} frames, ${refInfo.duration.toFixed(1)}s, ${refInfo.width}x${refInfo.height}, ${refInfo.codec}`);

// 7. Testes comparativos de transcodificação (se FFmpeg 9 disponível)
const transcodeTests = [
  { name: 'H.264 CPU (libx264)', args: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-c:a', 'copy'] },
  { name: 'H.264 NVENC', args: ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '23', '-c:a', 'copy'] },
  { name: 'HEVC NVENC', args: ['-c:v', 'hevc_nvenc', '-preset', 'p4', '-cq', '28', '-c:a', 'copy'] },
  { name: 'HEVC CPU (libx265)', args: ['-c:v', 'libx265', '-preset', 'medium', '-crf', '28', '-c:a', 'copy'] },
];

const results = { v8: {}, v9: {} };

if (ffmpeg9Available) {
  console.log('\n7. Testes comparativos transcodificação (8.1.1 vs 9.0.2)...');
  
  for (const test of transcodeTests) {
    console.log(`\n   --- ${test.name} ---`);
    
    const out8 = join(TEST_DIR, `out_8_${test.name.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`);
    const r8 = await runTranscodeTest(FFMPEG_8_EXE, 'v8', TEST_VIDEO, out8, test.args);
    results.v8[test.name] = r8;
    
    if (r8.success) {
      console.log(`     8.1.1: ${r8.elapsed}ms, ${r8.frames} frames, ${(r8.size/1024/1024).toFixed(1)}MB`);
    } else {
      console.log(`     8.1.1: FALHOU - ${r8.error}`);
    }
    
    const out9 = join(TEST_DIR, `out_9_${test.name.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`);
    const r9 = await runTranscodeTest(FFMPEG_9_EXE, 'v9', TEST_VIDEO, out9, test.args);
    results.v9[test.name] = r9;
    
    if (r9.success) {
      console.log(`     9.0.2: ${r9.elapsed}ms, ${r9.frames} frames, ${(r9.size/1024/1024).toFixed(1)}MB`);
      
      if (results.v8[test.name].success) {
        const speedup = ((results.v8[test.name].elapsed - r9.elapsed) / results.v8[test.name].elapsed * 100).toFixed(1);
        const sizeDiff = ((r9.size - results.v8[test.name].size) / results.v8[test.name].size * 100).toFixed(1);
        console.log(`     Comparação: ${speedup > 0 ? '+' : ''}${speedup}% tempo, ${sizeDiff > 0 ? '+' : ''}${sizeDiff}% tamanho`);
      }
    } else {
      console.log(`     9.0.2: FALHOU - ${r9.error}`);
    }
  }
} else {
  console.log('\n7. Testes comparativos: SKIPPED (FFmpeg 9.0.2 não disponível)');
  console.log('   Para habilitar: instale FFmpeg 9.0.2 no PATH ou em C:/ffmpeg-9.0.2/bin/ffmpeg.exe');
}

// 8. Diferenças conhecidas
console.log('\n8. Diferenças documentadas 8.1.1 vs 9.0.2...');
const diffs = [
  { area: 'SONAME', v8: 'avcodec-62, avformat-62, avutil-60', v9: 'avcodec-63, avformat-63, avutil-61', impact: 'QUEBRA ABI - obs-ffmpeg.dll compila contra soname 62' },
  { area: 'NVENC HEVC', v8: 'hevc_nvenc (P010 10-bit)', v9: 'hevc_nvenc (4:4:4, 4:2:2)', impact: 'Possível ganho HDR' },
  { area: 'QuickSync', v8: 'hevc_qsv/h264_qsv (legacy)', v9: 'qsv unificado oneVPL', impact: 'Requer validação Intel 12th/13th' },
  { area: 'AMF', v8: 'hevc_amf/h264_amf', v9: 'hevc_amf/h264_amf (estável)', impact: 'Compatible' },
  { area: 'Filtros', v8: 'avfilter-11', v9: 'avfilter-12 (novos)', impact: 'Novos efeitos' },
  { area: 'Threading', v8: 'frame-threaded', v9: 'melhor paralelismo', impact: 'Menor latência' },
  { area: 'Vulkan', v8: 'limitado', v9: 'vulkan encoder/decoder', impact: 'Cross-vendor' },
];

for (const d of diffs) {
  console.log(`   ${d.area}:`);
  console.log(`     8.1.1: ${d.v8}`);
  console.log(`     9.0.2: ${d.v9}`);
  console.log(`     Impacto: ${d.impact}`);
}

// 9. Critérios de homologação
console.log('\n9. Critérios para promover 9.0.2 ao runtime...');
const criteria = [
  'Recompilar obs-ffmpeg.dll e libobs contra soname 63',
  'Regressão completa: Replay, Playout, transcodificação, áudio, hardware',
  'NVENC HEVC P010 10-bit HDR em RTX 30/40',
  'QuickSync HEVC em Intel 12th/13th/14th (oneVPL)',
  'AMF HEVC/H.264 em AMD RDNA 2/3',
  'Benchmark CPU/RAM vs 8.1.1 (i5-10400 / GTX 1650)',
  'Estabilidade 2h múltiplas fontes',
  'Rollback testado: restaurar DLLs 8.1.1 < 30s'
];

for (let i = 0; i < criteria.length; i++) {
  console.log(`   ${i + 1}. ${criteria[i]}`);
}

// 10. Resumo
console.log('\n=== RESUMO ===');
console.log(`Runtime: FFmpeg ${ffmpeg8Version} (soname 62) - HOMOLOGADO`);
console.log(`FFmpeg 9.0.2: ${ffmpeg9Available ? 'DISPONÍVEL - COMPARATIVO EXECUTADO' : 'NÃO DISPONÍVEL - NÃO TESTADO'}`);
console.log('Decisão: MANTER 8.1.1 ATÉ HOMOLOGAÇÃO 9.0.2');
if (!ffmpeg9Available) {
  console.log('\n⚠️  FFmpeg 9.0.2 = NÃO TESTADO (indisponível)');
  console.log('   Não declarar testado sem execução real.');
}
console.log('\n=== FFmpeg COMPARATIVO CONCLUÍDO ===');