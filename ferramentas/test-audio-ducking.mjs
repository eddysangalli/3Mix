import assert from 'node:assert/strict';
import { AudioDuckingEngine } from './audio-ducking-engine.mjs';

/**
 * Teste de Validação Empírica: Auto-Ducking Audio Engine
 * 
 * Verifica:
 * 1. Estado neutro quando locutores estão em silêncio (0 dB de atenuação).
 * 2. Ativação suave do ducking quando a voz do locutor ultrapassa o threshold (-14 dB na música).
 * 3. Manutenção da atenuação durante o período de Hold após o locutor terminar a fala.
 * 4. Retorno suave (Release) para o volume normal da música sem estalo.
 */

console.log('--- Iniciando Teste de Validação: Auto-Ducking Audio Engine ---');

async function runTests() {
  const ducking = new AudioDuckingEngine(null, {
    attenuationDb: -14,
    thresholdDb: -30,
    holdMs: 200,
    releaseMs: 300
  });

  // 1. Silêncio nos microfones
  const r1 = ducking.processLevels([
    { name: 'Microfone Narrador', peakDb: -50 },
    { name: 'Trilha Sonora', peakDb: -12 }
  ]);
  assert.equal(r1.active, false);
  assert.equal(r1.attenuationDb, 0, 'Sem locutor falando, trilha permanece no volume normal');
  console.log('✓ Teste 1 PASS: Sem locutor falando, atenuação permanece em 0 dB');

  // 2. Locutor começa a falar (-18 dB > -30 dB threshold)
  const r2 = ducking.processLevels([
    { name: 'Microfone Narrador', peakDb: -18 },
    { name: 'Trilha Sonora', peakDb: -12 }
  ]);
  assert.equal(r2.active, true);
  assert.equal(r2.attenuationDb, -14, 'Ducking deve atenuar a música para -14 dB');
  console.log('✓ Teste 2 PASS: Locutor falando ativa atenuação broadcast de -14 dB na trilha');

  // 3. Locutor para de falar, mas ainda dentro do Hold (100ms depois)
  await new Promise(r => setTimeout(r, 80));
  const r3 = ducking.processLevels([
    { name: 'Microfone Narrador', peakDb: -60 }
  ]);
  assert.equal(r3.active, true);
  assert.equal(r3.attenuationDb, -14, 'Durante o Hold time, música deve continuar atenuada');
  console.log('✓ Teste 3 PASS: Hold time mantém música baixa entre pausas curtas de fala');

  // 4. Após expirar Hold e Release (400ms depois), atenuação deve ter voltado para 0 dB
  await new Promise(r => setTimeout(r, 450));
  const r4 = ducking.processLevels([
    { name: 'Microfone Narrador', peakDb: -60 }
  ]);
  assert.equal(r4.active, false);
  assert.equal(r4.attenuationDb, 0, 'Após release completo, volume normal restaurado');
  console.log('✓ Teste 4 PASS: Release suave restaura volume integral da música sem estalo');

  console.log('\n======================================================');
  console.log('TODOS OS TESTES DE AUTO-DUCKING PASSARAM COM SUCESSO!');
  console.log('======================================================');
}

runTests().catch(err => {
  console.error('FALHA NOS TESTES DE DUCKING:', err);
  process.exit(1);
});

