import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { IncidentBlackboxEngine } from './blackbox-producao.mjs';

/**
 * Teste de Validação Empírica: Incident Blackbox Engine
 * 
 * Verifica:
 * 1. Coleta contínua de telemetria em ring buffer (limite de tamanho circular).
 * 2. Gatilho automático ao perder sinal de entrada ativa no Program.
 * 3. Gatilho automático ao detectar pico súbito de frame drops.
 * 4. Gatilho automático de silêncio contínuo no Master em transmissão ativa.
 * 5. Gatilho manual disparado pelo operador.
 * 6. Gravação do arquivo de snapshot com manifesto JSON no disco.
 * 7. Respeito ao tempo de cooldown entre eventos repetidos.
 */

console.log('--- Iniciando Teste de Validação: Incident Blackbox Engine ---');

class MockProduction {
  constructor() {
    this.root = join(process.cwd(), 'qa-replay', 'blackbox-test-output');
    this.state = {
      program: 'Câmera 1',
      preview: 'Câmera 2',
      streaming: true,
      recording: false,
      video: { cpuPercent: 12.5, fps: 60, frameDrops: 0 },
      inputs: [
        { key: 'cam1', name: 'Câmera 1', health: { signal: 'ok' } },
        { key: 'cam2', name: 'Câmera 2', health: { signal: 'ok' } }
      ],
      audioInputs: [
        { name: 'Master', muted: false }
      ]
    };
  }
}

async function runTests() {
  const prod = new MockProduction();
  // Limpa diretório de teste anterior se existir
  await rm(prod.root, { recursive: true, force: true });

  const engine = new IncidentBlackboxEngine(prod, { bufferSeconds: 10, cooldownMs: 1000 });

  // 1. Amostragem e Ring Buffer
  for (let i = 0; i < 15; i++) {
    await engine.sampleTick({ cpuPercent: 10 + i, fps: 60, frameDrops: 0 });
  }
  assert.equal(engine.ringBuffer.length, 10, 'Ring buffer deve limitar ao máximo de 10 amostras');
  assert.equal(engine.ringBuffer[9].cpuPercent, 24, 'Última amostra deve ser a mais recente');
  console.log('✓ Teste 1 PASS: Ring buffer circular retém exatamente as últimas N amostras');

  // 2. Disparo de Sinal Perdido no Program
  prod.state.inputs[0].health.signal = 'lost';
  await engine.sampleTick();
  assert(engine.incidents.length > 0, 'Deve registrar incidente ao perder sinal no PGM');
  assert.equal(engine.incidents[0].trigger, 'SIGNAL_LOST_ON_PROGRAM');
  assert(engine.incidents[0].savedPath, 'Deve ter salvo o arquivo de snapshot no disco');
  console.log(`✓ Teste 2 PASS: Queda de sinal no Program detectada automaticamente (${engine.incidents[0].savedPath})`);

  // 3. Cooldown: Nova chamada imediata do mesmo tipo deve ser ignorada
  const countBefore = engine.incidents.length;
  await engine.sampleTick();
  assert.equal(engine.incidents.length, countBefore, 'Cooldown deve prevenir múltiplos disparos para o mesmo erro');
  console.log('✓ Teste 3 PASS: Cooldown ativo previne tempestade de eventos repetitivos');

  // 4. Disparo de Pico de Drop de Quadros
  prod.state.inputs[0].health.signal = 'ok';
  // Simular 5 ticks com salto súbito de frame drops
  for (let i = 0; i < 6; i++) {
    await engine.sampleTick({ frameDrops: i === 5 ? 50 : 0 });
  }
  const dropIncident = engine.incidents.find(inc => inc.trigger === 'FRAME_DROP_SPIKE');
  assert(dropIncident, 'Deve ter registrado pico de frame drop');
  assert.equal(dropIncident.details.dropsLast5s, 50);
  console.log('✓ Teste 4 PASS: Pico de perda de quadros (>30 drops em 5s) detectado com sucesso');

  // 5. Disparo de Silêncio Contínuo no Master em Stream Ativo
  prod.state.audioInputs[0].muted = true;
  for (let i = 0; i < 5; i++) {
    await engine.sampleTick();
  }
  const silenceIncident = engine.incidents.find(inc => inc.trigger === 'AUDIO_SILENCE_ON_AIR');
  assert(silenceIncident, 'Deve registrar silêncio de áudio no Master');
  console.log('✓ Teste 5 PASS: Silêncio contínuo no Master (>5s no ar) detectado com sucesso');

  // 6. Disparo Manual do Operador (Marcação de Falha)
  const manualRecord = await engine.execute('blackbox_mark', {
    note: 'Operador notou corte seco estranho do repórter'
  });
  assert.equal(manualRecord.trigger, 'MANUAL_OPERATOR_MARK');
  assert.equal(engine.incidents[0].trigger, 'MANUAL_OPERATOR_MARK');
  console.log('✓ Teste 6 PASS: Marcação manual pelo operador registrada com snapshot e histórico');

  // Limpeza de QA
  await rm(prod.root, { recursive: true, force: true });

  console.log('\n======================================================');
  console.log('TODOS OS TESTES DA INCIDENT BLACKBOX ENGINE PASSARAM COM SUCESSO!');
  console.log('======================================================');
}

runTests().catch(err => {
  console.error('FALHA NOS TESTES DA BLACKBOX:', err);
  process.exit(1);
});

