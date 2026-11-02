import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RundownEngine } from './rundown-producao.mjs';

/**
 * Testes do modelo/preparação/execução/persistência do Rundown.
 *
 * Usa um motor simulado que implementa as mesmas operações usadas pelo
 * Production real: execute(preview/cut/fade/overlay/audio/media), req() para
 * confirmação e vendor() para os downstream keyers. Nenhum teste aqui fala com
 * o motor 3Mix real.
 */

const WORKSPACE = fileURLToPath(new URL('../../', import.meta.url));
const QA_ROOT = join(WORKSPACE, 'qa-rundown');

class MockProduction {
  constructor() {
    this.calls = [];
    this.dskAdds = [];
    this.overlaySelects = [];
    this.autoRuns = [];
    this.failAudio = false;
    this.failDskChannel = null;
    this.state = {
      connected: true,
      program: 'CAM 1',
      preview: 'CAM 2',
      scenes: ['CAM 1', 'CAM 2', 'VT ABERTURA', 'GC TARJA'],
      transitions: [],
      inputs: [
        { key: 'uuid-cam-1', name: 'CAM 1', type: 'Camera', media: null, duration: null },
        { key: 'uuid-cam-2', name: 'CAM 2', type: 'Camera', media: null, duration: null },
        { key: 'uuid-vt', name: 'VT ABERTURA', type: 'Video', media: 'VT ABERTURA MP4', duration: 120000 },
        { key: 'uuid-gc', name: 'GC TARJA', type: 'Browser', media: null, duration: null }
      ],
      sourceInputs: [
        { key: 'audio-cam-1', name: 'Audio CAM 1', kind: 'wasapi_input_capture' },
        { key: 'audio-vt', name: 'Audio VT', kind: 'ffmpeg_source' }
      ],
      audioInputs: [
        { name: 'Audio CAM 1', muted: false, volumeMul: 1, volumeDb: 0, tracks: { 1: true } },
        { name: 'Audio VT', muted: false, volumeMul: 0.8, volumeDb: -1.9, tracks: { 1: true } }
      ],
      media: [
        { name: 'VT ABERTURA MP4', kind: 'ffmpeg_source', duration: 120000, state: 'OBS_MEDIA_STATE_PLAYING' }
      ],
      overlays: [
        { number: 1, scene: '' },
        { number: 2, scene: '' }
      ]
    };
  }

  input(identifier) {
    const input = this.state.inputs.find(item => item.key === identifier || item.name === identifier);
    if (!input) throw new Error(`Entrada simulada não encontrada: ${identifier}`);
    return input;
  }

  async req(type, data = {}) {
    if (type === 'GetSceneList') {
      return {
        currentProgramSceneName: this.state.program,
        currentPreviewSceneName: this.state.preview,
        scenes: this.state.scenes.map(sceneName => ({ sceneName }))
      };
    }
    if (type === 'GetInputMute') {
      const audio = this.state.audioInputs.find(item => item.name === data.inputName);
      if (!audio) throw new Error('Áudio simulado não encontrado');
      return { inputMuted: audio.muted };
    }
    if (type === 'GetInputVolume') {
      const audio = this.state.audioInputs.find(item => item.name === data.inputName);
      if (!audio) throw new Error('Áudio simulado não encontrado');
      return { inputVolumeMul: audio.volumeMul, inputVolumeDb: audio.volumeDb };
    }
    if (type === 'GetMediaInputStatus') {
      const media = this.state.media.find(item => item.name === data.inputName);
      if (!media) throw new Error('Mídia simulada não encontrada');
      return { mediaState: media.state, mediaDuration: media.duration, mediaCursor: 0 };
    }
    return {};
  }

  async vendor(type, data = {}) {
    if (type === 'get_downstream_keyers') {
      return { downstream_keyers: [{ name: '1' }, { name: '2' }] };
    }
    if (type === 'add_downstream_keyer') {
      return { success: true };
    }
    if (type === 'dsk_add_scene') {
      if (this.failDskChannel !== null && Number(data.dsk_name) === Number(this.failDskChannel)) throw new Error('Falha simulada ao preparar DSK');
      this.dskAdds.push({ ...data });
      return { success: true };
    }
    if (type === 'dsk_get_scene') {
      if (this.failDskChannel !== null && Number(data.dsk_name) === Number(this.failDskChannel)) throw new Error('Falha simulada no DSK');
      const overlay = this.state.overlays.find(item => Number(item.number) === Number(data.dsk_name));
      return { scene: overlay?.scene || '' };
    }
    return { success: true };
  }

  async execute(action, data = {}) {
    this.calls.push({ action, data: { ...data } });
    if (action === 'preview') {
      this.state.preview = this.input(data.input).name;
      return;
    }
    if (action === 'cut' || action === 'fade') {
      this.state.program = this.input(data.input).name;
      return;
    }
    if (action === 'overlay') {
      const channel = Number(data.channel);
      const overlay = this.state.overlays.find(item => Number(item.number) === channel);
      if (!overlay) throw new Error('Canal DSK simulado não existe');
      const scene = data.input ? this.state.inputs.find(item => item.name === data.input || item.key === data.input)?.name : '';
      if (data.input && !scene) throw new Error('Cena simulada não encontrada');
      overlay.scene = scene || '';
      this.overlaySelects.push({ channel, scene: overlay.scene });
      return;
    }
    if (action === 'audio_mute') {
      if (this.failAudio) throw new Error('Falha simulada de áudio');
      const audio = this.state.audioInputs.find(item => item.name === data.input);
      if (!audio) throw new Error('Áudio simulado não encontrado');
      audio.muted = !!data.muted;
      return;
    }
    if (action === 'audio_volume') {
      if (this.failAudio) throw new Error('Falha simulada de áudio');
      const audio = this.state.audioInputs.find(item => item.name === data.input);
      if (!audio) throw new Error('Áudio simulado não encontrado');
      audio.volumeMul = Number(data.volume) / 100;
      return;
    }
    if (action === 'media') {
      const input = this.input(data.input);
      const media = this.state.media.find(item => item.name === input.media);
      if (media) media.state = data.command === 'PLAY' || data.command === 'RESTART'
        ? 'OBS_MEDIA_STATE_PLAYING'
        : 'OBS_MEDIA_STATE_PAUSED';
      return;
    }
    throw new Error(`Ação simulada não implementada: ${action}`);
  }

  runRundown(action, data) {
    this.autoRuns.push({ action, data });
    return Promise.resolve({ result: null, state: this.state });
  }
}

const step = (id, title, extra = {}) => ({
  id,
  title,
  type: 'camera',
  sourceInputKey: 'uuid-cam-2',
  sourceName: 'CAM 2',
  transition: 'cut',
  transitionMs: 500,
  durationMode: 'fixed',
  durationSec: 30,
  endBehavior: 'wait_operator',
  loadPreview: true,
  dsk: [],
  audio: [],
  notes: '',
  ...extra
});

function script(steps = [], extra = {}) {
  return {
    id: 'roteiro-qa',
    name: 'Roteiro de Teste',
    blocks: [{ id: 'bloco-1', title: 'Bloco 1', notes: '', steps }],
    ...extra
  };
}

let testRoot = null;
let scopeSequence = 0;

async function freshEngine(prefix = 'Projeto QA') {
  const production = new MockProduction();
  production.root = testRoot;
  const engine = new RundownEngine(production);
  const scope = `${prefix} ${process.pid} ${++scopeSequence}`;
  await engine.setScope(scope);
  return { production, engine, scope };
}

function callNames(production) {
  return production.calls.map(call => call.action);
}

async function testModelAndValidation() {
  const { engine } = await freshEngine();
  const s = script([
    step('s1', 'Abertura', { sourceInputKey: 'uuid-cam-2', sourceName: 'CAM 2', durationSec: 30 }),
    step('s2', 'VT Matéria', {
      type: 'video',
      sourceInputKey: 'uuid-vt',
      sourceName: 'VT ABERTURA',
      durationMode: 'media',
      durationSec: null,
      endBehavior: 'media_end',
      dsk: [{ channel: 1, action: 'enter', scene: 'GC TARJA' }],
      audio: [{ targetKey: 'audio-vt', targetName: 'Audio VT', action: 'mute' }]
    }),
    step('s3', 'Passagem', { type: 'manual', sourceInputKey: null, sourceName: null, durationMode: 'none', durationSec: null })
  ]);
  const summary = await engine.saveScript({ script: s, expectedRevision: 1 });

  assert.equal(summary.blocks.length, 1);
  assert.equal(summary.steps.length, 3);
  assert.equal(summary.totalPlannedDurationSec, 150, '30s fixos + 120s da mídia');
  assert.equal(summary.totalDurationSec, 150);
  assert.equal(summary.unknownDurationSteps, 1);
  assert.equal(summary.steps[2].durationMode, 'none');
  assert.equal(summary.validation.valid, true, 'o roteiro de teste deve validar sem erros');
  assert.equal(summary.currentStepId, null);
  assert.equal(summary.running, false);
  assert.equal(summary.automation.armed, false);
  console.log('✓ Modelo Roteiro → Blocos → Passos, duração total e validação');
}

async function testSelectPrepareExecuteAndDivergence() {
  const { production, engine } = await freshEngine();
  await engine.saveScript({
    script: script([
      step('s1', 'Abertura', { sourceInputKey: 'uuid-cam-2', sourceName: 'CAM 2', durationSec: 30 }),
      step('s2', 'VT Matéria', {
        type: 'video',
        sourceInputKey: 'uuid-vt',
        sourceName: 'VT ABERTURA',
        durationMode: 'media',
        durationSec: null,
        endBehavior: 'media_end',
        dsk: [{ channel: 1, action: 'enter', scene: 'GC TARJA' }],
        audio: [{ targetKey: 'audio-vt', targetName: 'Audio VT', action: 'mute' }]
      })
    ]),
    expectedRevision: 1
  });

  const beforeSelect = production.calls.length;
  const selected = await engine.select('s1');
  assert.equal(selected.selectedStepId, 's1');
  assert.equal(selected.currentStepId, null);
  assert.equal(production.calls.length, beforeSelect, 'selecionar não executa nada');
  assert.equal(selected.steps[0].status, 'pending');
  console.log('✓ Selecionar linha não executa nada');

  const prepared = await engine.prepare({ stepId: 's1' });
  assert.equal(prepared.preparedStepId, 's1');
  assert.equal(prepared.steps[0].status, 'prepared');
  assert.equal(production.state.program, 'CAM 1', 'preparar não muda o Programa');
  assert.equal(production.state.audioInputs.find(a => a.name === 'Audio CAM 1').muted, false, 'preparar não muda áudio');
  assert.equal(production.state.overlays[0].scene, '', 'preparar não entra DSK');
  assert.deepEqual(callNames(production), ['preview'], 'preparar só carrega PVW');
  assert.equal(production.state.preview, 'CAM 2');
  console.log('✓ PREPARAR valida, carrega PVW e não muda Programa/áudio/DSK');

  const rev = prepared.revision;
  // Salva uma alteração do passo preparado: a preparação deve ser invalidada.
  const editScript = {
    id: 'roteiro-qa',
    name: 'Roteiro de Teste',
    blocks: prepared.blocks.map(block => ({
      id: block.id,
      title: block.title,
      notes: block.notes,
      steps: block.steps.map(item => item.id === 's1' ? { ...item, title: 'Abertura editada' } : item)
    }))
  };
  const afterEdit = await engine.saveScript({ script: editScript, expectedRevision: rev });
  assert.equal(afterEdit.preparedStepId, null, 'editar passo preparado invalida a preparação');
  assert.equal(afterEdit.steps[0].prepared, false);
  assert.equal(production.calls.filter(call => call.action === 'cut').length, 0);
  console.log('✓ Editar passo preparado invalida apenas aquela preparação');

  await engine.prepare({ stepId: 's1' });
  const receiptId = 'exec-1';
  const executed = await engine.executeStep({ stepId: 's1', operationId: receiptId });
  assert.equal(executed.receipt.outcome, 'confirmed');
  assert.equal(executed.receipt.confirmed, true);
  assert.equal(executed.currentStepId, 's1');
  assert.equal(executed.steps[0].status, 'current');
  assert.equal(production.state.program, 'CAM 2');
  assert.equal(production.state.audioInputs.find(a => a.name === 'Audio CAM 1').muted, false, 'áudio não mencionado permanece');
  assert.equal(production.state.overlays[0].scene, '', 'DSK não mencionado permanece');
  console.log('✓ EXECUTAR aplica somente o passo preparado e confirma o Programa');

  const callsAfterExecute = production.calls.length;
  const replay = await engine.executeStep({ stepId: 's1', operationId: receiptId });
  assert.equal(replay.operationReplay, true, 'clique repetido com o mesmo operationId deve ser replay idempotente');
  assert.equal(production.calls.length, callsAfterExecute, 'replay não repete comandos');
  await assert.rejects(
    () => engine.executeStep({ stepId: 's1', operationId: 'exec-2' }),
    /já foi executado|Prepare novamente/i,
    'preparação consumida impede execução duplicada'
  );
  console.log('✓ Duplicidade por clique/reconexão bloqueada por operationId e preparação consumida');

  await engine.prepare({ stepId: 's2' });
  assert.equal(production.state.overlays[0].scene, '', 'preparar DSK não entra no ar');
  assert.ok(production.dskAdds.some(add => add.dsk_name === '1' && add.scene === 'GC TARJA'), 'preparar DSK registra a cena no keyer');
  assert.equal(production.overlaySelects.length, 0, 'preparar DSK não seleciona/entra no ar');

  const second = await engine.executeStep({ stepId: 's2', operationId: 'exec-3' });
  assert.equal(second.currentStepId, 's2');
  assert.equal(second.steps[0].status, 'done', 'passo anterior vira concluído');
  assert.equal(production.state.program, 'VT ABERTURA');
  assert.equal(production.state.overlays[0].scene, 'GC TARJA', 'DSK 1 entrou conforme o passo');
  assert.equal(production.state.audioInputs.find(a => a.name === 'Audio VT').muted, true, 'áudio explícito aplicado');
  assert.equal(production.state.audioInputs.find(a => a.name === 'Audio CAM 1').muted, false, 'áudio não mencionado preservado');
  assert.ok(production.calls.some(call => call.action === 'media' && call.data.command === 'PLAY'));
  assert.equal(second.steps[1].execution.planDurationSec, 120, 'duração real da mídia registrada');
  console.log('✓ DSK/áudio explícitos, mídia real e preservação de canais não mencionados');

  // Mudança manual posterior: o motor sinaliza, mas não desfaz.
  production.state.program = 'CAM 1';
  production.state.overlays[0].scene = '';
  production.state.audioInputs.find(a => a.name === 'Audio VT').muted = false;
  const diverged = engine.summary();
  assert.equal(diverged.divergence.active, true);
  assert.ok(diverged.divergence.items.some(item => item.type === 'program'));
  assert.ok(diverged.divergence.items.some(item => item.type === 'dsk'));
  assert.ok(diverged.divergence.items.some(item => item.type === 'audio'));
  assert.equal(production.state.program, 'CAM 1', 'o motor não desfaz a mudança manual');
  assert.equal(production.state.overlays[0].scene, '', 'o motor não reentra o DSK manualmente');
  console.log('✓ Divergência manual detectada sem desfazer a mesa');

  const reprepared = await engine.prepare({ stepId: 's2' });
  assert.equal(reprepared.preparedStepId, 's2');
  assert.equal(reprepared.steps[1].prepared, true, 'o passo atual pode ser re-preparado após divergência');
  console.log('✓ Re-preparar após divergência é permitido');
}

async function testPartialFailure() {
  const { production, engine } = await freshEngine('Projeto Falha');
  await engine.saveScript({
    script: script([
      step('p1', 'Falha parcial', {
        sourceInputKey: 'uuid-cam-2',
        sourceName: 'CAM 2',
        dsk: [{ channel: 1, action: 'enter', scene: 'GC TARJA' }],
        audio: [{ targetKey: 'audio-cam-1', targetName: 'Audio CAM 1', action: 'mute' }]
      })
    ]),
    expectedRevision: 1
  });
  production.failAudio = true;
  await engine.prepare({ stepId: 'p1' });
  let failure;
  try {
    await engine.executeStep({ stepId: 'p1', operationId: 'partial-1' });
    assert.fail('a execução deveria falhar no áudio');
  } catch (error) {
    failure = error;
  }
  assert.equal(failure.code, 'RUNDOWN_PARTIAL');
  assert.ok(failure.result);
  const summary = failure.summary;
  const item = summary.steps[0];
  assert.equal(item.status, 'failed');
  assert.equal(item.execution.partial, true);
  assert.equal(item.execution.confirmed, false);
  const programAction = item.execution.actions.find(action => action.type === 'program');
  const dskAction = item.execution.actions.find(action => action.type === 'dsk');
  const audioAction = item.execution.actions.find(action => action.type === 'audio');
  assert.equal(programAction.status, 'confirmed');
  assert.equal(dskAction.status, 'confirmed');
  assert.equal(audioAction.status, 'failed');
  assert.equal(production.state.program, 'CAM 2', 'o que já foi aplicado não é desfeito');
  assert.equal(production.state.overlays[0].scene, 'GC TARJA', 'o DSK confirmado permanece');
  assert.equal(summary.automation.armed, false);
  assert.equal(summary.automation.suspended, true);
  assert.match(summary.automation.suspendedReason, /Falha parcial/i);
  assert.equal(summary.history[0].outcome, 'partial');
  assert.equal(summary.executingStepId, null, 'o lock de execução é liberado após a falha');
  console.log('✓ Falha parcial registra ações ocorridas e suspende a automação');

  const callsAfterFailure = production.calls.length;
  await assert.rejects(
    () => engine.executeStep({ stepId: 'p1', operationId: 'partial-2' }),
    /já foi executado|Prepare novamente/i,
    'falha não pode repetir o passo automaticamente'
  );
  assert.equal(production.calls.length, callsAfterFailure, 'nenhum comando é repetido');
  await engine.prepare({ stepId: 'p1' });
  assert.equal(engine.summary().steps[0].prepared, true, 'intervenção explícita permite preparar novamente');
  console.log('✓ Falha parcial não repete o passo; operador precisa preparar novamente');
}

async function testPersistenceAndRestart(tempRoot) {
  const production = new MockProduction();
  production.root = tempRoot;
  const engine = new RundownEngine(production);
  await engine.setScope('Projeto Persistente');
  const saved = await engine.saveScript({
    script: script([
      step('persist-1', 'Primeiro', { sourceInputKey: 'uuid-cam-2', sourceName: 'CAM 2', durationSec: 40 }),
      step('persist-2', 'Segundo', { type: 'video', sourceInputKey: 'uuid-vt', sourceName: 'VT ABERTURA', durationMode: 'media', durationSec: null })
    ]),
    expectedRevision: 1
  });
  await engine.prepare({ stepId: 'persist-1' });
  await engine.executeStep({ stepId: 'persist-1', operationId: 'persist-exec' });
  const executed = engine.summary();
  assert.equal(executed.currentStepId, 'persist-1');
  assert.equal(executed.history.length, 1);

  const folder = join(tempRoot, 'config', 'obs-studio', 'plugin_config', 'freemix-rundown');
  const files = await readdir(folder);
  const hash = createHash('sha256').update('Projeto Persistente').digest('hex').slice(0, 24);
  const scriptFile = `${hash}.json`;
  const historyFile = `${hash}.historico.json`;
  assert.ok(files.includes(scriptFile), 'arquivo do roteiro salvo');
  assert.ok(files.includes(historyFile), 'arquivo de histórico separado');
  const scriptDisk = JSON.parse(await readFile(join(folder, scriptFile), 'utf8'));
  const historyDisk = JSON.parse(await readFile(join(folder, historyFile), 'utf8'));
  assert.equal(scriptDisk.schemaVersion, 2);
  assert.ok(scriptDisk.script.blocks.length === 1);
  assert.ok(!('history' in scriptDisk.script), 'roteiro salvo não carrega o histórico');
  assert.ok(Array.isArray(historyDisk.entries) && historyDisk.entries.length >= 1);
  assert.equal(historyDisk.entries[0].outcome, 'confirmed');
  console.log('✓ Roteiro e histórico persistidos em arquivos separados');

  // Reinício: nova instância no mesmo projeto recupera o roteiro, mas nada executa.
  const restartedProduction = new MockProduction();
  restartedProduction.root = tempRoot;
  const restarted = new RundownEngine(restartedProduction);
  await restarted.setScope('Projeto Persistente');
  const restored = restarted.summary();
  assert.equal(restored.stepsCount, 2);
  assert.equal(restored.revision, executed.revision);
  assert.equal(restored.currentStepId, null, 'não retoma o passo em execução após reiniciar');
  assert.equal(restored.running, false);
  assert.equal(restored.automation.armed, false, 'não retoma automação sem ação explícita');
  assert.equal(restored.ended, false);
  assert.equal(restored.steps[0].status, 'pending');
  assert.ok(restored.history.length >= 1, 'histórico de execução é recuperado separadamente');
  assert.equal(restartedProduction.calls.length, 0, 'reiniciar não envia comandos ao motor');
  console.log('✓ Reinício recupera roteiro, zera estado de execução e mantém automação desarmada');

  // Edição do passo em execução (antes do reinício) é protegida.
  const editCurrent = {
    id: engine.script.id,
    name: engine.script.name,
    blocks: engine.script.blocks.map(block => ({
      ...block,
      steps: block.steps.map(item => item.id === 'persist-1' ? { ...item, title: 'Mudou no ar' } : item)
    }))
  };
  await assert.rejects(
    () => engine.saveScript({ script: editCurrent, expectedRevision: engine.script.revision }),
    /passo em execução permanece estável/i
  );
  console.log('✓ Passo em execução permanece estável durante edição');

  // Conflito de versão e invalidação de preparação de passo futuro.
  await assert.rejects(
    () => restarted.saveScript({ script: restored.blocks.length ? { id: restored.id, name: restored.name, blocks: restored.blocks } : {}, expectedRevision: 1 }),
    /alterado por outra sessão/i
  );
  const preparedNext = await restarted.prepare({ stepId: 'persist-2' });
  assert.equal(preparedNext.preparedStepId, 'persist-2');
  const futureEdit = {
    id: restarted.script.id,
    name: restarted.script.name,
    blocks: restarted.script.blocks.map(block => ({
      ...block,
      steps: block.steps.map(item => item.id === 'persist-2' ? { ...item, title: 'Segundo editado' } : item)
    }))
  };
  const afterFuture = await restarted.saveScript({ script: futureEdit, expectedRevision: restarted.script.revision });
  assert.equal(afterFuture.preparedStepId, null);
  assert.equal(afterFuture.steps[1].prepared, false);
  console.log('✓ Conflito de versão e invalidação de preparação futura');
}

async function testCaptureDraft() {
  const { production, engine } = await freshEngine('Projeto Captura');
  await engine.saveScript({ script: script([step('c1', 'Existente')]), expectedRevision: 1 });
  production.state.overlays[0].scene = 'GC TARJA';
  const beforeCalls = production.calls.length;
  const beforeSteps = engine.summary().stepsCount;
  const captured = engine.captureCurrentToStep('Captura da mesa', 45);
  assert.equal(captured.success, true);
  assert.equal(captured.step.sourceName, 'CAM 1');
  assert.equal(captured.step.sourceInputKey, 'uuid-cam-1');
  assert.equal(captured.step.dsk[0].scene, 'GC TARJA');
  assert.equal(engine.summary().stepsCount, beforeSteps, 'captura não substitui nem acrescenta passo');
  assert.equal(engine.summary().currentStepId, null, 'captura não executa');
  assert.equal(production.calls.length, beforeCalls, 'captura não envia comandos');
  const applied = await engine.applyCapture({ step: { ...captured.step, title: 'Captura revisada' } });
  assert.equal(applied.stepsCount, beforeSteps + 1, 'aplicar o rascunho é uma ação explícita');
  assert.equal(applied.captureDraft, null);
  assert.equal(applied.steps.at(-1).title, 'Captura revisada');
  assert.equal(production.calls.length, beforeCalls, 'aplicar rascunho não executa');
  console.log('✓ Capturar estado cria rascunho; aplicar é explícito e não executa');
}

async function testMediaEndEvent() {
  const { production, engine } = await freshEngine('Projeto Mídia');
  await engine.saveScript({
    script: script([
      step('m1', 'VT com fim real', {
        type: 'video',
        sourceInputKey: 'uuid-vt',
        sourceName: 'VT ABERTURA',
        durationMode: 'media',
        durationSec: null,
        endBehavior: 'media_end'
      }),
      step('m2', 'Próximo')
    ]),
    expectedRevision: 1
  });
  await engine.prepare({ stepId: 'm1' });
  await engine.executeStep({ stepId: 'm1', operationId: 'media-exec' });
  assert.equal(production.state.media[0].state, 'OBS_MEDIA_STATE_PLAYING');

  production.state.media[0].state = 'OBS_MEDIA_STATE_ENDED';
  engine.onNativeEvent('MediaInputPlaybackEnded', { inputName: 'Outra Mídia' });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(production.autoRuns.length, 0, 'evento de outra mídia é ignorado');

  await engine.arm();
  assert.equal(engine.summary().automation.armed, true);
  assert.equal(engine.summary().automation.mediaWatch.mediaName, 'VT ABERTURA MP4');
  engine.onNativeEvent('MediaInputPlaybackEnded', { inputName: 'VT ABERTURA MP4' });
  engine.onNativeEvent('MediaInputPlaybackEnded', { inputName: 'VT ABERTURA MP4' });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(production.autoRuns.length, 1, 'fim real da mídia dispara a automação uma única vez');
  assert.equal(production.autoRuns[0].action, 'rundown_auto_advance');
  await engine.suspend('teste concluído');
  console.log('✓ Fim de mídia usa evento real e só avança com sessão armada');
}

async function testSkipEndReopenAndDisconnect() {
  const { production, engine } = await freshEngine('Projeto Controles');
  await engine.saveScript({
    script: script([
      step('c1', 'Primeiro', { sourceInputKey: 'uuid-cam-2', sourceName: 'CAM 2', durationSec: 20 }),
      step('c2', 'Segundo', { sourceInputKey: 'uuid-cam-1', sourceName: 'CAM 1', durationSec: 20 }),
      step('c3', 'Terceiro', { sourceInputKey: 'uuid-cam-2', sourceName: 'CAM 2', durationSec: 20 })
    ]),
    expectedRevision: 1
  });
  await engine.prepare({ stepId: 'c1' });
  await engine.executeStep({ stepId: 'c1', operationId: 'controls-1' });
  const programAfterFirst = production.state.program;
  await engine.prepare({ stepId: 'c2' });
  assert.equal(engine.summary().preparedStepId, 'c2');

  const skipped = await engine.skip({ stepId: 'c2' });
  assert.equal(skipped.currentStepId, 'c1', 'pular um passo futuro não altera o passo em execução');
  assert.equal(skipped.preparedStepId, null, 'pular o passo preparado descarta sua preparação');
  assert.equal(skipped.steps[1].status, 'skipped');
  assert.equal(production.state.program, programAfterFirst, 'pular não altera o Programa');

  await engine.arm();
  assert.equal(engine.summary().automation.armed, true);
  engine.disconnected();
  const afterDisconnect = engine.summary();
  assert.equal(afterDisconnect.automation.armed, false, 'queda de conexão desarma a automação');
  assert.equal(afterDisconnect.automation.suspended, true);
  assert.equal(afterDisconnect.preparedStepId, null, 'preparação antiga não sobrevive à reconexão');
  assert.equal(afterDisconnect.currentStepId, 'c1', 'o estado visual do passo atual é preservado');

  const ended = await engine.end('teste');
  assert.equal(ended.ended, true);
  assert.equal(ended.currentStepId, null, 'encerrar libera o passo atual');
  assert.equal(ended.automation.armed, false);
  const reopened = await engine.reopen();
  assert.equal(reopened.ended, false);
  assert.equal(reopened.currentStepId, null);
  assert.equal(reopened.steps.every(item => item.status === 'pending'), true, 'reabrir limpa o estado transitório');
  console.log('✓ PULAR, ENCERRAR, REABRIR e queda de conexão preservam o Programa e suspendem automação');
}

async function testNoAutoAdvanceWhenUnarmed() {
  const { production, engine } = await freshEngine('Projeto Manual');
  await engine.saveScript({
    script: script([
      step('u1', 'Manual', { endBehavior: 'wait_operator', durationSec: 1 }),
      step('u2', 'Próximo')
    ]),
    expectedRevision: 1
  });
  await engine.prepare({ stepId: 'u1' });
  await engine.executeStep({ stepId: 'u1', operationId: 'manual-exec' });
  await new Promise(resolve => setTimeout(resolve, 1150));
  const summary = engine.summary();
  assert.equal(summary.currentStepId, 'u1', 'sem sessão armada não avança por tempo');
  assert.equal(production.autoRuns.length, 0);
  assert.ok(summary.overdueSec >= 0);
  assert.equal(summary.remainingSec, 0);
  console.log('✓ Avanço manual continua manual; tempo vencido não dispara sozinho');
}

async function run() {
  await mkdir(QA_ROOT, { recursive: true });
  const tempRoot = await mkdtemp(join(QA_ROOT, 'run-'));
  testRoot = tempRoot;
  try {
    console.log('--- Rundown: modelo, preparação, execução e persistência ---');
    await testModelAndValidation();
    await testSelectPrepareExecuteAndDivergence();
    await testPartialFailure();
    await testPersistenceAndRestart(tempRoot);
    await testCaptureDraft();
    await testMediaEndEvent();
    await testSkipEndReopenAndDisconnect();
    await testNoAutoAdvanceWhenUnarmed();
    console.log('\nTODOS OS TESTES DE RUNDOWN PASSARAM.');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error('FALHA NOS TESTES DE RUNDOWN:', error);
  process.exit(1);
});
