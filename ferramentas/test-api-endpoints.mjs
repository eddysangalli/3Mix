// 3Mix Pro - Teste Automatizado de Integração das Novas Funcionalidades e Telas Web
// Abrange: Clip Audio Gain (TriCaster DDR), Pre-Flight, Blackbox, Broadcast Delay + DUMP, Return Feeds N-1, Rundown, Auto-Ducking e Páginas Web (VidBlasterX/MotionCaster Modular).

import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Production } from './controle-producao.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PANEL = join(ROOT, 'painel');

console.log('=== INICIANDO TESTE DE INTEGRAÇÃO DE NOVOS RECURSOS & INTERFACES 3MIX PRO ===');

// 1. Instanciar o motor de Produção com mock de OBS
const mockCalls = [];
const mockObs = {
  call: async (requestType, requestData = {}) => {
    mockCalls.push({ requestType, requestData });
    if (requestType === 'GetSceneList') {
      return { currentProgramSceneName: 'CAM 1', currentPreviewSceneName: 'CAM 2', scenes: [{ sceneName: 'CAM 1' }, { sceneName: 'CAM 2' }] };
    }
    if (requestType === 'GetRecordDirectory') {
      return { recordDirectory: ROOT };
    }
    if (requestType === 'GetInputMute') {
      return { inputMuted: false };
    }
    if (requestType === 'GetInputVolume') {
      return { inputVolumeDb: 0.0 };
    }
    if (requestType === 'GetSourceFilterList') {
      return { filters: [] };
    }
    if (requestType === 'CreateSourceFilter' || requestType === 'SetSourceFilterSettings') {
      return { success: true };
    }
    return {};
  }
};

const production = new Production({
  root: ROOT,
  panel: PANEL,
  getObs: () => mockObs,
  publish: () => {}
});

console.log('[1/8] Verificando Playout Engine com Clip Audio Gain (TriCaster DDR Style)...');
assert(production.playoutEngine, 'playoutEngine deve existir');
const clipList = [
  { id: 'clip1', file: 'video1.mp4', durationMs: 10000, audioGainDb: -3.5 },
  { id: 'clip2', file: 'video2.mp4', durationMs: 15000, audioGainDb: 2.0 }
];
const setRes = await production.playoutEngine.execute('playout_save_playlist', { id: 'pl_qa', name: 'Playlist QA', items: clipList });
assert.strictEqual(setRes.activeListId, 'pl_qa', 'Deve salvar e ativar a playlist');
const gainRes = await production.playoutEngine.execute('playout_item_update', { itemId: 'clip1', audioGainDb: -6.0 });
assert(gainRes, 'Deve atualizar item');
const activeList = production.playoutEngine.getActiveList();
assert.strictEqual(activeList.items[0].audioGainDb, -6.0, 'Ganho do clipe 1 deve ser -6.0 dB');
console.log('  -> PASS: Playout DDR ajusta ganho pré-fader individual por clipe com sucesso.');

console.log('[2/8] Verificando Pre-Flight Check Engine...');
assert(production.preflightEngine, 'preflightEngine deve existir');
const preflightData = await production.preflightEngine.runCheck();
assert(preflightData.checks, 'Deve conter lista de checks');
assert(preflightData.verdict, 'Deve conter veredicto');
console.log(`  -> PASS: Pre-Flight Check veredito = ${preflightData.verdict} com ${preflightData.checks.length} verificações.`);

console.log('[3/8] Verificando Incident Blackbox Engine...');
assert(production.blackboxEngine, 'blackboxEngine deve existir');
await production.blackboxEngine.sampleTick({ fps: 59.94, cpuPercent: 12.5 });
const snapRes = await production.blackboxEngine.triggerIncident('MANUAL_OPERATOR_MARK', { note: 'Teste de QA automatizado' });
assert(snapRes && snapRes.id, 'Incidente da Blackbox deve ser gravado');
assert.strictEqual(snapRes.trigger, 'MANUAL_OPERATOR_MARK');
console.log(`  -> PASS: Blackbox registrou incidente: ${snapRes.id}`);

console.log('[4/8] Verificando Broadcast Delay + DUMP FIFO...');
assert(production.broadcastDelayEngine, 'broadcastDelayEngine deve existir');
production.broadcastDelayEngine.setDelay(7.0);
production.broadcastDelayEngine.enqueuePacket({ id: 'pkt1', isKeyframe: true, sizeBytes: 1024 });
production.broadcastDelayEngine.enqueuePacket({ id: 'pkt2', isKeyframe: false, sizeBytes: 512 });
const dumpRes = production.broadcastDelayEngine.dump({ mode: 'to_live' });
assert.strictEqual(dumpRes.success, true, 'DUMP deve ser executado com sucesso');
console.log(`  -> PASS: Broadcast DUMP executado: descartou ${dumpRes.discardedPackets} pacotes (${dumpRes.discardedBytes} bytes).`);

console.log('[5/8] Verificando Return Feed Manager (Clean Feed + N-1 Mix-Minus)...');
assert(production.returnFeedManager, 'returnFeedManager deve existir');
const feedConfig = production.returnFeedManager.configureFeed('return-1', {
  name: 'Link Externa QA',
  videoSource: 'clean',
  audioMode: 'n-1'
});
assert.strictEqual(feedConfig.feed.name, 'Link Externa QA');
assert.strictEqual(feedConfig.feed.videoSource, 'clean');
assert.strictEqual(feedConfig.feed.audioMode, 'n-1');
console.log('  -> PASS: Canal de retorno configurado para Clean Feed + Áudio N-1 Mix-Minus.');

console.log('[6/8] Verificando Rundown / Cue Sheet Engine...');
assert(production.rundownEngine, 'rundownEngine deve existir');
production.rundownEngine.setSteps([
  { id: 'step1', title: 'Abertura', expectedDurationSec: 30 },
  { id: 'step2', title: 'VT Matéria', expectedDurationSec: 60 }
]);
const nextRes = await production.rundownEngine.nextStep();
assert.strictEqual(nextRes.currentIndex, 0, 'Deve iniciar no primeiro passo');
const captureRes = production.rundownEngine.captureCurrentToStep('Bloco Capturado QA');
assert.strictEqual(captureRes.success, true, 'Deve capturar cena atual para o roteiro');
console.log('  -> PASS: Rundown avançou passo e capturou estado de cena.');

console.log('[7/8] Verificando Audio Auto-Ducking Engine...');
assert(production.audioDuckingEngine, 'audioDuckingEngine deve existir');
production.audioDuckingEngine.configure({
  voiceSources: ['Microfone Narrador'],
  duckedSources: ['Trilha Sonora'],
  attenuationDb: -14.0,
  thresholdDb: -30
});
const duckRes = production.audioDuckingEngine.processLevels([
  { input: 'Microfone Narrador', peakDb: -10 }
]);
assert.strictEqual(duckRes.active, true, 'Ducking deve ser ativado com fala no microfone');
assert.strictEqual(duckRes.attenuationDb, -14.0, 'Atenuação deve ser de -14 dB');
console.log('  -> PASS: Auto-Ducking calculou atenuação suave com sucesso.');

console.log('[8/8] Verificando integridade das Telas Web Criadas e Rotas no Servidor...');
const webPages = [
  { file: 'FreeMix/painel/remoto/rundown.html', title: 'Roteiro de Produção' },
  { file: 'FreeMix/painel/remoto/retornos.html', title: 'Retornos de Externa' },
  { file: 'FreeMix/painel/remoto/blackbox.html', title: 'Caixa-Preta de Incidentes' },
  { file: 'FreeMix/painel/remoto/modular.html', title: 'Modular' }
];

for (const page of webPages) {
  assert(existsSync(page.file), `Arquivo da página deve existir: ${page.file}`);
  const content = readFileSync(page.file, 'utf8');
  assert(content.includes('<!doctype html>'), `Deve conter doctype html: ${page.file}`);
  assert(content.includes(page.title), `Deve conter o título correto: ${page.file}`);
  console.log(`  -> PASS: Tela ${page.file} verificada e íntegra.`);
}

console.log('\n=== TODOS OS 8 TESTES DE INTEGRAÇÃO PASSARAM COM SUCESSO EMPÍRICO NO 3MIX PRO (8/8 PASS) ===\n');
