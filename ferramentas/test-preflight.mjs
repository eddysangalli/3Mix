import assert from 'node:assert/strict';
import { PreflightEngine } from './preflight-producao.mjs';

/**
 * Teste de Validação Empírica: Pre-Flight Check Engine
 * 
 * Verifica:
 * 1. Detecção de sistema 100% pronto (GO LIVE liberado).
 * 2. Bloqueio crítico quando FTB (Fade to Black) está ativo.
 * 3. Bloqueio crítico quando Program está vazio/sem input.
 * 4. Bloqueio crítico quando o áudio Master está mutado.
 * 5. Alerta de aviso quando há perda de sinal em live inputs.
 * 6. Cálculo coerente de espaço em disco e tempo estimado de gravação em horas.
 */

console.log('--- Iniciando Teste de Validação: Pre-Flight Check Engine ---');

class MockProduction {
  constructor(state = {}) {
    this.root = process.cwd();
    this.state = {
      program: 'Câmera 1 (PGM)',
      preview: 'VT Gols (PVW)',
      ftb: false,
      inputs: [
        { key: 'cam1', name: 'Câmera 1', health: { signal: 'ok' } },
        { key: 'cam2', name: 'Câmera 2', health: { signal: 'ok' } }
      ],
      audioInputs: [
        { name: 'Master', muted: false }
      ],
      playout: {
        program: { status: 'idle', audioGainDb: 0 },
        preview: { preloadState: 'ready' }
      },
      ...state
    };
  }
}

async function runTests() {
  // Cenário 1: Tudo Pronto (READY)
  const prodReady = new MockProduction();
  const engineReady = new PreflightEngine(prodReady);
  const resReady = await engineReady.runCheck();

  assert.equal(resReady.verdict, 'READY', 'Veredito deve ser READY');
  assert.equal(resReady.readyToAir, true, 'readyToAir deve ser true');
  assert.equal(resReady.issues.length, 0, 'Não deve haver problemas');
  assert(resReady.disk.estRecordingHours > 0, 'Deve calcular horas estimadas de gravação');
  console.log(`✓ Teste 1 PASS: Sistema saudável aprovado para GO LIVE (${resReady.disk.freeGb} GB livres, ~${resReady.disk.estRecordingHours}h de gravação)`);

  // Cenário 2: FTB Ativado (Bloqueio Crítico)
  const prodFtb = new MockProduction({ ftb: true });
  const engineFtb = new PreflightEngine(prodFtb);
  const resFtb = await engineFtb.runCheck();

  assert.equal(resFtb.verdict, 'FAIL', 'Veredito deve ser FAIL com FTB ativo');
  assert.equal(resFtb.readyToAir, false, 'readyToAir deve ser false');
  const ftbIssue = resFtb.issues.find(i => i.code === 'FTB_ENGAGED');
  assert(ftbIssue, 'Deve reportar FTB_ENGAGED');
  assert.equal(ftbIssue.severity, 'CRITICAL');
  console.log('✓ Teste 2 PASS: FTB ativo detectado como falha crítica bloqueante');

  // Cenário 3: Program Vazio
  const prodNoProg = new MockProduction({ program: null });
  const engineNoProg = new PreflightEngine(prodNoProg);
  const resNoProg = await engineNoProg.runCheck();

  assert.equal(resNoProg.verdict, 'FAIL', 'Veredito deve ser FAIL com Program vazio');
  assert.equal(resNoProg.readyToAir, false);
  assert(resNoProg.issues.some(i => i.code === 'PROGRAM_EMPTY'));
  console.log('✓ Teste 3 PASS: Program vazio detectado e barrado antes do ar');

  // Cenário 4: Áudio Master Mutado
  const prodMuted = new MockProduction({
    audioInputs: [{ name: 'Master', muted: true }]
  });
  const engineMuted = new PreflightEngine(prodMuted);
  const resMuted = await engineMuted.runCheck();

  assert.equal(resMuted.verdict, 'FAIL', 'Veredito deve ser FAIL com Master mutado');
  assert.equal(resMuted.readyToAir, false);
  assert(resMuted.issues.some(i => i.code === 'AUDIO_MASTER_MUTED'));
  console.log('✓ Teste 4 PASS: Mute acidental no Master barrado com alerta vermelho');

  // Cenário 5: Perda de Sinal em Câmera (Alerta de Aviso WARN)
  const prodSignalLost = new MockProduction({
    inputs: [
      { key: 'cam1', name: 'Câmera 1', health: { signal: 'ok' } },
      { key: 'cam2', name: 'Câmera 2', health: { signal: 'lost' } }
    ]
  });
  const engineSignal = new PreflightEngine(prodSignalLost);
  const resSignal = await engineSignal.runCheck();

  assert.equal(resSignal.verdict, 'WARN', 'Veredito deve ser WARN com perda parcial de sinal');
  assert.equal(resSignal.readyToAir, true, 'readyToAir pode ser true com ressalvas');
  assert(resSignal.issues.some(i => i.code === 'INPUT_SIGNAL_LOST'));
  console.log('✓ Teste 5 PASS: Sinal de câmera perdido sinalizado como WARN com ressalva');

  console.log('\n======================================================');
  console.log('TODOS OS TESTES DO PRE-FLIGHT CHECK ENGINE PASSARAM COM SUCESSO!');
  console.log('======================================================');
}

runTests().catch(err => {
  console.error('FALHA NOS TESTES DE PREFLIGHT:', err);
  process.exit(1);
});

