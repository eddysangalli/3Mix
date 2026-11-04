import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { validateSrtTransport } from '../../ferramentas/srt-presets.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../../..');
const RUNTIME_ROOT = resolve(PROJECT_ROOT, '3mix-runtime');
const BIN_DIR = resolve(RUNTIME_ROOT, 'bin/64bit');
const FFMPEG_EXE = resolve(RUNTIME_ROOT, 'runtime/ffmpeg.exe');
const FFPROBE_EXE = resolve(RUNTIME_ROOT, 'runtime/ffprobe.exe');
const TEST_DIR = resolve(PROJECT_ROOT, 'qa-finalizacao/srt-homologacao');
const TEST_VIDEO = join(TEST_DIR, 'test-source-10s.mp4');
const RECEIVED_VIDEO = join(TEST_DIR, 'received-10s.mp4');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function runFfmpeg(args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_EXE, args, { 
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options
    });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`ffmpeg exit ${code}: ${stderr}`));
    });
    proc.on('error', reject);
  });
}

async function generateTestVideo() {
  console.log('   Gerando vídeo de teste 10s...');
  await runFfmpeg([
    '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=10',
    '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=10:sample_rate=48000',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
    '-c:a', 'aac', '-b:a', '128k',
    '-pix_fmt', 'yuv420p', TEST_VIDEO
  ]);
  assert.ok(existsSync(TEST_VIDEO), 'Vídeo de teste deve ser gerado');
  const stats = readFileSync(TEST_VIDEO);
  console.log(`   [PASS] Vídeo gerado: ${(stats.length/1024/1024).toFixed(1)} MB`);
}

function runFfprobe(args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFPROBE_EXE, args, { 
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options
    });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`ffprobe exit ${code}: ${stderr}`));
    });
    proc.on('error', reject);
  });
}

async function probeVideo(file) {
  const { stdout } = await runFfprobe([
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=nb_frames,duration,width,height',
    '-of', 'csv=p=0', file
  ]);
  const [frames, duration, width, height] = stdout.trim().split(',');
  return { frames: parseInt(frames) || 0, duration: parseFloat(duration) || 0, width: parseInt(width) || 0, height: parseInt(height) || 0 };
}

class IsolatedTestEnv {
  constructor(obs, prefix) {
    this.obs = obs;
    this.prefix = prefix;
    this.createdInputs = [];
    this.createdScenes = [];
  }

  async createScene(name) {
    const fullName = `${this.prefix}_${name}`;
    await this.obs.req('CreateScene', { sceneName: fullName });
    this.createdScenes.push(fullName);
    return fullName;
  }

  async createInput(sceneName, inputName, inputKind, inputSettings) {
    const fullName = `${this.prefix}_${inputName}`;
    await this.obs.req('CreateInput', {
      sceneName,
      inputName: fullName,
      inputKind,
      inputSettings
    });
    this.createdInputs.push(fullName);
    return fullName;
  }

  async getInputStatus(inputName) {
    const fullName = `${this.prefix}_${inputName}`;
    try {
      return await this.obs.req('GetInputStatus', { inputName: fullName });
    } catch {
      return { active: false };
    }
  }

  async cleanup() {
    console.log(`   Limpando ambiente isolado ${this.prefix}...`);
    for (const input of this.createdInputs.reverse()) {
      await this.obs.req('RemoveInput', { inputName: input }).catch(() => {});
    }
    for (const scene of this.createdScenes.reverse()) {
      await this.obs.req('RemoveScene', { sceneName: scene }).catch(() => {});
    }
    console.log(`   [PASS] Limpeza concluída`);
  }
}

async function waitForConnection(obs, env, inputName, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await env.getInputStatus(inputName);
    if (status.active === true) {
      return true;
    }
    await sleep(500);
  }
  return false;
}

async function testSrtObsIntegration(obs, env, testName, listenerUrl, callerUrl, description) {
  console.log(`\n   --- ${testName}: ${description} ---`);
  
  const listenerName = `listener_${testName}`;
  const callerName = `caller_${testName}`;
  const sceneName = await env.createScene(`srt_${testName}`);
  
  await env.createInput(sceneName, listenerName, 'ffmpeg_source', {
    input: listenerUrl,
    is_local_file: false,
    restart_on_activate: true,
    close_when_inactive: false
  });
  await sleep(1000);
  
  await env.createInput(sceneName, callerName, 'ffmpeg_source', {
    input: callerUrl,
    is_local_file: false,
    restart_on_activate: true,
    close_when_inactive: false
  });
  
  const connected = await waitForConnection(obs, env, callerName);
  
  if (!connected) {
    console.log('   [FAIL] Conexão não estabelecida em 15s');
    throw new Error(`SRT ${testName}: Falha na conexão - listener/caller não conectaram`);
  }
  
  console.log(`   [PASS] Conexão SRT estabelecida`);
  await sleep(5000);
  
  const callerStatus = await env.getInputStatus(callerName);
  const listenerStatus = await env.getInputStatus(listenerName);
  
  console.log(`   Status Caller: ${callerStatus.active ? 'ATIVO' : 'INATIVO'}`);
  console.log(`   Status Listener: ${listenerStatus.active ? 'ATIVO' : 'INATIVO'}`);
  
  assert.ok(callerStatus.active, 'Caller deve permanecer ativo durante transmissão');
  
  await obs.req('RemoveInput', { inputName: `${env.prefix}_${callerName}` }).catch(() => {});
  await obs.req('RemoveInput', { inputName: `${env.prefix}_${listenerName}` }).catch(() => {});
  env.createdInputs = env.createdInputs.filter(i => !i.endsWith(callerName) && !i.endsWith(listenerName));
  
  console.log(`   [PASS] ${testName} concluído`);
  return true;
}

console.log('=== TESTE SRT 1.5.7 — TRANSMISSÃO REAL + INTEGRAÇÃO OBS ===\n');

let obs = null;
let testEnv = null;
let testResults = {
  ffmpegDirect: { executed: false, passed: false, frameRatio: 0 },
  obsIntegration: { executed: false, passed: 0, total: 0, details: [] }
};

try {
  if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
  await generateTestVideo();
  
  const testVideoInfo = await probeVideo(TEST_VIDEO);
  console.log(`   Vídeo referência: ${testVideoInfo.frames} frames, ${testVideoInfo.duration.toFixed(1)}s`);
  assert.ok(testVideoInfo.frames >= 250, 'Vídeo deve ter frames suficientes');
  
  console.log('\n[1/2] Conectando ao 3Mix Pro (opcional)...');
  try {
    if (process.env.MIX3_QA_ALLOW_LIVE !== 'YES') throw new Error('Testes integrados com OBS exigem opt-in em instância exclusiva de QA (MIX3_QA_ALLOW_LIVE=YES)');
    const { connect } = await import(pathToFileURL(resolve(RUNTIME_ROOT, 'ferramentas/obsws.mjs')).href);
    obs = await connect({ root: RUNTIME_ROOT });
    console.log('   [PASS] Conectado ao 3Mix Pro');
    testEnv = new IsolatedTestEnv(obs, `SRT_HOMOLOG_${process.pid}_${Date.now()}`);
  } catch (err) {
    console.log('   [SKIPPED] 3Mix Pro não ativo — testes OBS-integrados pulados');
    obs = null;
  }
  
  // -------------------------------------------------------------
  // TESTE A: TRANSMISSÃO DIRETA FFmpeg→FFmpeg (SEMPRE EXECUTA)
  // -------------------------------------------------------------
  console.log('\n[A] Transmissão direta FFmpeg→FFmpeg via SRT...');
  
  const listenerPortDirect = 19380;
  const listenerArgs = [
    '-y', '-v', 'error',
    '-i', `srt://0.0.0.0:${listenerPortDirect}?mode=listener&latency=120000`,
    '-c', 'copy', RECEIVED_VIDEO
  ];
  
  const listenerProc = spawn(FFMPEG_EXE, listenerArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
  await sleep(2000);
  
  const senderArgs = [
    '-y', '-v', 'error',
    '-re', '-i', TEST_VIDEO,
    '-c', 'copy',
    '-f', 'mpegts',
    `srt://127.0.0.1:${listenerPortDirect}?mode=caller&latency=120000`
  ];
  
  const senderProc = spawn(FFMPEG_EXE, senderArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
  
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout transmissão direta')), 20000);
    senderProc.on('close', code => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`Sender exit ${code}`));
    });
    senderProc.on('error', e => { clearTimeout(timeout); reject(e); });
  });
  
  await sleep(3000);
  listenerProc.kill();
  
  testResults.ffmpegDirect.executed = true;
  if (existsSync(RECEIVED_VIDEO)) {
    const receivedInfo = await probeVideo(RECEIVED_VIDEO);
    const frameRatio = receivedInfo.frames / testVideoInfo.frames;
    testResults.ffmpegDirect.frameRatio = frameRatio;
    
    console.log(`   Enviados: ${testVideoInfo.frames} frames | Recebidos: ${receivedInfo.frames} (${(frameRatio*100).toFixed(1)}%)`);
    console.log(`   Duração: ${receivedInfo.duration.toFixed(1)}s`);
    
    assert.ok(frameRatio >= 0.8, `Mínimo 80% quadros (recebido ${(frameRatio*100).toFixed(1)}%)`);
    assert.ok(receivedInfo.duration >= 8, `Duração ≥ 8s (recebido ${receivedInfo.duration.toFixed(1)}s)`);
    
    testResults.ffmpegDirect.passed = true;
    console.log('   [PASS] Transmissão FFmpeg→FFmpeg validada');
  } else {
    throw new Error('Arquivo não criado - transmissão falhou');
  }
  
  // -------------------------------------------------------------
  // TESTE B: INTEGRAÇÃO OBS (SÓ SE 3MIX ATIVO)
  // -------------------------------------------------------------
  if (obs && testEnv) {
    testResults.obsIntegration.executed = true;
    
    const passphrase256 = 'ChaveSeguraBroadcast256!MaximaSegurancaMilitar';
    const passphrase128 = 'ChaveSeguraBroadcast128!';
    const streamId = '#!::u=operador,r=pgm_clean,m=publish';
    
    const tests = [
      { 
        name: 'aes256_caller_listener', 
        listenerUrl: `srt://0.0.0.0:19360?mode=listener&latency=120000&passphrase=${encodeURIComponent(passphrase256)}&pbkeylen=32&streamid=${encodeURIComponent(streamId)}`,
        callerUrl: `srt://127.0.0.1:19360?mode=caller&latency=120000&passphrase=${encodeURIComponent(passphrase256)}&pbkeylen=32&streamid=${encodeURIComponent(streamId)}`,
        desc: 'Caller→Listener AES-256 + Stream ID'
      },
      { 
        name: 'rendezvous_aes128', 
        listenerUrl: `srt://127.0.0.1:19363?mode=rendezvous&port=19362&latency=150000&passphrase=${encodeURIComponent(passphrase128)}&pbkeylen=16`,
        callerUrl: `srt://127.0.0.1:19362?mode=rendezvous&port=19363&latency=150000&passphrase=${encodeURIComponent(passphrase128)}&pbkeylen=16`,
        desc: 'Rendezvous AES-128'
      }
    ];
    
    for (const t of tests) {
      testResults.obsIntegration.total++;
      try {
        await testSrtObsIntegration(obs, testEnv, t.name, t.listenerUrl, t.callerUrl, t.desc);
        testResults.obsIntegration.passed++;
        testResults.obsIntegration.details.push({ name: t.name, status: 'PASS' });
      } catch (e) {
        testResults.obsIntegration.details.push({ name: t.name, status: 'FAIL', error: e.message });
        throw e;
      }
    }
    
    // AES negotiation params only (no connection test without listener)
    console.log('\n   Validando parâmetros AES-128/192/256...');
    for (const [label, pbkeylen, passphrase] of [
      ['AES-128', 16, 'ChaveSeguraBroadcast128!'],
      ['AES-192', 24, 'ChaveSeguraBroadcast192!MedioSeguro'],
      ['AES-256', 32, 'ChaveSeguraBroadcast256!MaximaSegurancaMilitarGrade']
    ]) {
      const transport = validateSrtTransport({ latencyMs: 100, passphrase, pbkeylen }, 'contribuicao-lan');
      const url = `srt://127.0.0.1:19370?mode=caller&latency=${transport.latencyMs*1000}&passphrase=${encodeURIComponent(transport.passphrase)}&pbkeylen=${pbkeylen}`;
      const srcName = `param_${label}`;
      const sceneName = await testEnv.createScene(`param_${label}`);
      await testEnv.createInput(sceneName, srcName, 'ffmpeg_source', { input: url, is_local_file: false, restart_on_activate: true, close_when_inactive: false });
      await sleep(200);
      await obs.req('RemoveInput', { inputName: `${testEnv.prefix}_${srcName}` }).catch(() => {});
      testEnv.createdInputs = testEnv.createdInputs.filter(i => !i.endsWith(srcName));
    }
    console.log('   [PASS] Parâmetros AES aceitos');
    
    // Wrong password rejection
    console.log('\n   Testando rejeição senha incorreta...');
    const correctPass = 'SenhaCorretaParaTeste123!';
    const wrongPass = 'SenhaErradaParaTeste456!';
    const tc = validateSrtTransport({ latencyMs: 120, passphrase: correctPass, pbkeylen: 16 }, 'contribuicao-lan');
    const scene = await testEnv.createScene('wrong_pass');
    await testEnv.createInput(scene, 'listener_ok', 'ffmpeg_source', { input: `srt://0.0.0.0:19371?mode=listener&latency=${tc.latencyMs*1000}&passphrase=${encodeURIComponent(tc.passphrase)}&pbkeylen=16`, is_local_file: false, restart_on_activate: true, close_when_inactive: false });
    await sleep(1000);
    await testEnv.createInput(scene, 'caller_bad', 'ffmpeg_source', { input: `srt://127.0.0.1:19371?mode=caller&latency=${tc.latencyMs*1000}&passphrase=${encodeURIComponent(wrongPass)}&pbkeylen=16`, is_local_file: false, restart_on_activate: true, close_when_inactive: false });
    await sleep(3000);
    const badStatus = await testEnv.getInputStatus('caller_bad');
    assert.ok(!badStatus.active, 'Senha incorreta deve ser rejeitada');
    console.log('   [PASS] Senha incorreta rejeitada');
    await testEnv.cleanup(); // will clean up this scene too
    
    // Stream IDs
    console.log('\n   Validando Stream IDs...');
    for (const sid of ['#!::u=op,r=pgm,m=publish', '#!::r=preview,m=request']) {
      const url = `srt://127.0.0.1:19372?mode=caller&latency=120000&streamid=${encodeURIComponent(sid)}`;
      const src = `sid_test`;
      const sc = await testEnv.createScene('streamid');
      await testEnv.createInput(sc, src, 'ffmpeg_source', { input: url, is_local_file: false, restart_on_activate: true, close_when_inactive: false });
      await sleep(200);
      await obs.req('RemoveInput', { inputName: `${testEnv.prefix}_${src}` }).catch(() => {});
      testEnv.createdInputs = testEnv.createdInputs.filter(i => !i.endsWith(src));
    }
    console.log('   [PASS] Stream IDs aceitos');
    
    // Reconnect params
    console.log('\n   Validando parâmetros reconexão...');
    const rcUrl = 'srt://127.0.0.1:19373?mode=caller&latency=120000&reconnect=1&reconnect_delay=1000&reconnect_at_eof=1&reconnect_streamed=1&reconnect_delay_max=5000';
    const sc = await testEnv.createScene('reconnect');
    await testEnv.createInput(sc, 'rc_test', 'ffmpeg_source', { input: rcUrl, is_local_file: false, restart_on_activate: true, close_when_inactive: false });
    await sleep(200);
    await obs.req('RemoveInput', { inputName: `${testEnv.prefix}_rc_test` }).catch(() => {});
    testEnv.createdInputs = testEnv.createdInputs.filter(i => !i.endsWith('rc_test'));
    console.log('   [PASS] Parâmetros reconexão aceitos');
    
  } else {
    console.log('\n[B] Testes OBS-integrados: SKIPPED (3Mix não ativo)');
  }
  
  // Summary
  console.log('\n=== RESUMO ===');
  console.log(`FFmpeg→FFmpeg direto: ${testResults.ffmpegDirect.executed ? 'EXECUTADO' : 'PULADO'} | ${testResults.ffmpegDirect.passed ? 'PASS' : 'FAIL'} | ${(testResults.ffmpegDirect.frameRatio*100).toFixed(1)}% quadros`);
  if (testResults.obsIntegration.executed) {
    console.log(`Integração OBS: ${testResults.obsIntegration.passed}/${testResults.obsIntegration.total} PASS`);
    testResults.obsIntegration.details.forEach(d => console.log(`  - ${d.name}: ${d.status}${d.error ? ' (' + d.error + ')' : ''}`));
  } else {
    console.log('Integração OBS: SKIPPED (3Mix não ativo)');
  }
  
} catch (err) {
  console.error('\n❌ FALHA:', err.message);
  process.exitCode = 1;
  throw err;
} finally {
  if (testEnv) await testEnv.cleanup();
  if (obs) obs.close();
}