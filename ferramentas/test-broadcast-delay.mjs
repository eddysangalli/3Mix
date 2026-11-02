import assert from 'node:assert/strict';
import { BroadcastDelayEngine } from './broadcast-delay.mjs';

/**
 * Teste de Validação Empírica: Broadcast Delay + DUMP Engine
 * 
 * Verifica:
 * 1. Enfileiramento sequencial de pacotes de vídeo/áudio em buffer circular.
 * 2. Retenção temporal e liberação (pollReleasable) de pacotes com idade >= delayMs.
 * 3. Operação DUMP: descarte imediato até o keyframe mais recente (evita macroblocos ao vivo).
 * 4. Registro forense automático na Incident Blackbox após o acionamento do DUMP.
 * 5. Bypass imediato quando delay desabilitado ou configurado para 0s.
 */

console.log('--- Iniciando Teste de Validação: Broadcast Delay + DUMP Engine ---');

class MockProduction {
  constructor() {
    this.incidents = [];
    this.blackboxEngine = {
      triggerIncident: async (trigger, details) => {
        this.incidents.push({ trigger, details });
      }
    };
  }
}

async function runTests() {
  const prod = new MockProduction();
  const engine = new BroadcastDelayEngine(prod, { delayMs: 200 }); // 200ms de delay para teste ágil

  // 1. Enfileirar 10 pacotes com 2 keyframes
  const now = Date.now();
  for (let i = 0; i < 10; i++) {
    engine.enqueuePacket({
      id: `pkt-${i}`,
      isKeyframe: (i === 0 || i === 7),
      mediaType: 'video',
      sizeBytes: 1024,
      pts: now + (i * 33)
    });
  }

  assert.equal(engine.packetQueue.length, 10, 'Fila deve conter 10 pacotes');
  assert.equal(engine.keyframeCount, 2, 'Fila deve conter 2 keyframes');
  assert.equal(engine.totalBytes, 10240, 'Total deve ser 10 KB');
  console.log('✓ Teste 1 PASS: Pacotes comprimidos enfileirados com contagem exata de keyframes');

  // 2. Consulta imediata sem esperar 200ms -> Nenhum pacote deve ser liberado
  const earlyReleasable = engine.pollReleasable(now + 50);
  assert.equal(earlyReleasable.length, 0, 'Nenhum pacote deve ser liberado antes de completar 200ms');
  console.log('✓ Teste 2 PASS: Retenção estrita de delay respeitada');

  // 3. Consulta após 250ms -> Pacotes devem ser liberados
  const lateReleasable = engine.pollReleasable(now + 250);
  assert.equal(lateReleasable.length, 10, 'Todos os 10 pacotes devem ser liberados após o delay');
  assert.equal(engine.packetQueue.length, 0, 'Buffer deve ficar vazio após liberação');
  console.log('✓ Teste 3 PASS: Liberação temporal de pacotes executada com sucesso');

  // 4. Teste da Operação DUMP (Censura ao vivo)
  // Enfileira novos pacotes simulando transmissão ao vivo:
  // pkt 0 a 4 (fala normal), pkt 5 (início do palavrão/incidente), pkt 8 (keyframe pós incidente), pkt 9 (continuação limpa)
  const baseTime = Date.now();
  for (let i = 0; i < 10; i++) {
    engine.enqueuePacket({
      id: `live-pkt-${i}`,
      isKeyframe: (i === 0 || i === 8),
      sizeBytes: 2048,
      pts: baseTime + (i * 33)
    });
  }

  assert.equal(engine.packetQueue.length, 10);
  console.log('Simulando incidente ofensivo no ar... Operador pressiona botão DUMP!');

  const dumpResult = engine.dump({ note: 'Censura de invasão de palco' });
  assert.equal(dumpResult.success, true);
  // O DUMP deve ter descartado até o keyframe mais recente (índice 8)
  assert.equal(dumpResult.discardedPackets, 8, 'Deve ter descartado os primeiros 8 pacotes');
  assert.equal(engine.packetQueue.length, 2, 'Devem restar 2 pacotes começando no keyframe 8');
  assert.equal(engine.packetQueue[0].id, 'live-pkt-8', 'Primeiro pacote após o DUMP deve ser o keyframe limpo');
  assert.equal(engine.packetQueue[0].isKeyframe, true);
  console.log('✓ Teste 4 PASS: DUMP descartou trecho ofensivo e alinhou a saída no keyframe mais recente');

  // 5. Integração com Incident Blackbox
  assert.equal(prod.incidents.length, 1, 'DUMP deve ter notificado a Incident Blackbox');
  assert.equal(prod.incidents[0].trigger, 'BROADCAST_DELAY_DUMP');
  console.log('✓ Teste 5 PASS: Notificação forense gravada na Incident Blackbox');

  // 6. Teste de Bypass quando desabilitado
  await engine.execute('delay_disable');
  const bypassPkt = engine.enqueuePacket({ id: 'direct-pkt', isKeyframe: true, sizeBytes: 512 });
  assert.equal(bypassPkt.immediate, true, 'Com delay desabilitado, pacote deve ter saída imediata');
  console.log('✓ Teste 6 PASS: Bypass imediato sem latência quando delay desabilitado');

  console.log('\n======================================================');
  console.log('TODOS OS TESTES DE BROADCAST DELAY + DUMP PASSARAM COM SUCESSO!');
  console.log('======================================================');
}

runTests().catch(err => {
  console.error('FALHA NOS TESTES DE DELAY:', err);
  process.exit(1);
});

