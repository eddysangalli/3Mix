import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Production } from './controle-producao.mjs';

const TOOLS = fileURLToPath(new URL('./', import.meta.url));

/**
 * Integração isolada: Production real + RundownEngine real + OBS simulado.
 *
 * Não abre o motor 3Mix nem portas de rede. O que é exercitado de verdade é o
 * caminho Production.runRundown → RundownEngine → Production.execute
 * (preview/cut/overlay/audio) → confirmação por req/vendor.
 */

const WORKSPACE = fileURLToPath(new URL('../../', import.meta.url));
const QA_ROOT = join(WORKSPACE, 'qa-rundown');

class MockObs {
  constructor() {
    this.actions = [];
    this.currentTransition = { transitionName: 'Cut', transitionKind: 'cut_transition', transitionDuration: 0 };
    this.state = {
      connected: true,
      program: 'CAM 1',
      preview: 'CAM 2',
      preset: 'Projeto Integração',
      scenes: ['CAM 1', 'CAM 2', 'VT ABERTURA', 'GC TARJA'],
      transitions: [
        { transitionName: 'Cut', transitionKind: 'cut_transition', transitionDuration: 0 },
        { transitionName: 'Fade', transitionKind: 'fade_transition', transitionDuration: 500 }
      ],
      inputs: [
        { key: 'uuid-cam-1', name: 'CAM 1', type: 'Camera', media: null },
        { key: 'uuid-cam-2', name: 'CAM 2', type: 'Camera', media: null },
        { key: 'uuid-vt', name: 'VT ABERTURA', type: 'Video', media: 'VT ABERTURA MP4', duration: 60000 },
        { key: 'uuid-gc', name: 'GC TARJA', type: 'Browser', media: null }
      ],
      sourceInputs: [
        { key: 'audio-cam-1', name: 'Audio CAM 1', kind: 'wasapi_input_capture' },
        { key: 'audio-cam-2', name: 'Audio CAM 2', kind: 'wasapi_input_capture' },
        { key: 'audio-vt', name: 'Audio VT', kind: 'ffmpeg_source' }
      ],
      audioInputs: [
        { name: 'Audio CAM 1', muted: false, volumeMul: 1, volumeDb: 0, tracks: { 1: true } },
        { name: 'Audio CAM 2', muted: false, volumeMul: 1, volumeDb: 0, tracks: { 1: true } },
        { name: 'Audio VT', muted: false, volumeMul: 0.7, volumeDb: -3, tracks: { 1: true } }
      ],
      media: [
        { name: 'VT ABERTURA MP4', kind: 'ffmpeg_source', duration: 60000, state: 'OBS_MEDIA_STATE_PLAYING' }
      ],
      overlays: [
        { number: 1, scene: '' },
        { number: 2, scene: '' }
      ]
    };
  }

  scene(identifier) {
    return this.state.inputs.find(item => item.key === identifier || item.name === identifier) || null;
  }

  audio(name) {
    return this.state.audioInputs.find(item => item.name === name) || null;
  }

  async vendorRequest(type, data = {}) {
    if (type === 'get_downstream_keyers') return { downstream_keyers: [{ name: '1' }, { name: '2' }] };
    if (type === 'add_downstream_keyer') return { success: true };
    if (type === 'dsk_add_scene') return { success: true };
    if (type === 'dsk_select_scene') {
      const overlay = this.state.overlays.find(item => Number(item.number) === Number(data.dsk_name));
      if (!overlay) return { success: false, error: 'canal inexistente' };
      overlay.scene = String(data.scene || '');
      return { success: true };
    }
    if (type === 'dsk_get_scene') {
      const overlay = this.state.overlays.find(item => Number(item.number) === Number(data.dsk_name));
      return { scene: overlay?.scene || '' };
    }
    return { success: true };
  }

  async req(type, data = {}) {
    if (type === 'GetSceneList') {
      return {
        currentProgramSceneName: this.state.program,
        currentPreviewSceneName: this.state.preview,
        scenes: this.state.scenes.map(sceneName => ({ sceneName }))
      };
    }
    if (type === 'SetCurrentPreviewScene') {
      if (!this.scene(data.sceneName)) throw new Error('Cena de preview simulada não existe');
      this.state.preview = data.sceneName;
      return {};
    }
    if (type === 'SetCurrentProgramScene') {
      this.state.program = data.sceneName;
      return {};
    }
    if (type === 'SetCurrentSceneTransition') {
      const transition = this.state.transitions.find(item => item.transitionName === data.transitionName);
      if (!transition) throw new Error('Transição simulada não existe');
      this.currentTransition = { ...transition };
      return {};
    }
    if (type === 'GetCurrentSceneTransition') return { ...this.currentTransition };
    if (type === 'SetCurrentSceneTransitionDuration') {
      this.currentTransition.transitionDuration = data.transitionDuration;
      return {};
    }
    if (type === 'GetCurrentSceneTransitionCursor') return { transitionCursor: 1 };
    if (type === 'TriggerStudioModeTransition') {
      this.state.program = this.state.preview;
      this.actions.push({ type: 'transition', program: this.state.program });
      return {};
    }
    if (type === 'GetInputMute') return { inputMuted: !!this.audio(data.inputName)?.muted };
    if (type === 'SetInputMute') {
      const audio = this.audio(data.inputName);
      if (!audio) throw new Error('Áudio simulado não existe');
      audio.muted = !!data.inputMuted;
      this.actions.push({ type: 'mute', name: data.inputName, muted: audio.muted });
      return {};
    }
    if (type === 'GetInputVolume') {
      const audio = this.audio(data.inputName);
      return { inputVolumeMul: audio?.volumeMul ?? 0, inputVolumeDb: audio?.volumeDb ?? 0 };
    }
    if (type === 'SetInputVolume') {
      const audio = this.audio(data.inputName);
      if (!audio) throw new Error('Áudio simulado não existe');
      audio.volumeMul = Number(data.inputVolumeMul);
      this.actions.push({ type: 'volume', name: data.inputName, volume: audio.volumeMul });
      return {};
    }
    if (type === 'TriggerMediaInputAction') {
      const media = this.state.media.find(item => item.name === data.inputName);
      if (!media) throw new Error('Mídia simulada não existe');
      const command = String(data.mediaAction || '').split('_').pop();
      media.state = command === 'PLAY' || command === 'RESTART' ? 'OBS_MEDIA_STATE_PLAYING' : command === 'PAUSE' ? 'OBS_MEDIA_STATE_PAUSED' : 'OBS_MEDIA_STATE_STOPPED';
      this.actions.push({ type: 'media', command, name: media.name });
      return {};
    }
    if (type === 'GetMediaInputStatus') {
      const media = this.state.media.find(item => item.name === data.inputName);
      if (!media) throw new Error('Mídia simulada não existe');
      return { mediaState: media.state, mediaDuration: media.duration, mediaCursor: 0 };
    }
    if (type === 'CallVendorRequest') {
      const responseData = await this.vendorRequest(data.requestType, data.requestData || {});
      return { responseData };
    }
    return {};
  }

  close() {}
}

async function run() {
  await mkdir(QA_ROOT, { recursive: true });
  const root = await mkdtemp(join(QA_ROOT, 'integracao-'));
  let production;
  try {
    const motor = new MockObs();
    production = new Production({ root, panel: join(WORKSPACE, '3mix-panel', 'painel'), getObs: () => motor, publish: () => {} });
    production.state = motor.state;
    production.refresh = async () => motor.state;
    await production.rundownEngine.setScope('Projeto Integração');
    const scopeHash = createHash('sha256').update('Projeto Integração').digest('hex').slice(0, 24);
    const saved = await production.rundownEngine.saveScript({
      script: {
        id: 'roteiro-integracao',
        name: 'Integração',
        blocks: [{
          id: 'bloco-integracao',
          title: 'Bloco',
          notes: '',
          steps: [{
            id: 'integracao-1',
            title: 'Abertura integrada',
            type: 'camera',
            sourceInputKey: 'uuid-cam-2',
            sourceName: 'CAM 2',
            transition: 'cut',
            transitionMs: 500,
            durationMode: 'fixed',
            durationSec: 20,
            endBehavior: 'wait_operator',
            loadPreview: true,
            dsk: [{ channel: 1, action: 'enter', scene: 'GC TARJA' }],
            audio: [{ targetKey: 'audio-cam-1', targetName: 'Audio CAM 1', action: 'mute' }]
          }]
        }]
      },
      expectedRevision: 1
    });
    assert.equal(saved.stepsCount, 1);

    const prepare = await production.runRundown('rundown_prepare', { stepId: 'integracao-1' });
    const prepared = prepare.result;
    assert.equal(prepared.preparedStepId, 'integracao-1');
    assert.equal(motor.state.program, 'CAM 1', 'prepare via Production não muda o Programa');
    assert.equal(motor.state.overlays[0].scene, '', 'prepare via Production não entra DSK');
    assert.equal(motor.audio('Audio CAM 1').muted, false, 'prepare via Production não muda áudio');
    console.log('✓ Production.runRundown → PREPARAR sem mudar Programa/DSK/áudio');

    const execute = await production.runRundown('rundown_execute', { stepId: 'integracao-1', operationId: 'integration-1' });
    const executed = execute.result;
    assert.equal(executed.receipt.confirmed, true);
    assert.equal(executed.receipt.outcome, 'confirmed');
    assert.equal(executed.steps[0].execution.actions.find(action => action.type === 'program').status, 'confirmed');
    assert.equal(executed.steps[0].execution.actions.find(action => action.type === 'dsk').status, 'confirmed');
    assert.equal(executed.steps[0].execution.actions.find(action => action.type === 'audio').status, 'confirmed');
    assert.equal(motor.state.program, 'CAM 2', 'o corte real foi aplicado');
    assert.equal(motor.state.overlays[0].scene, 'GC TARJA', 'o DSK real foi aplicado');
    assert.equal(motor.audio('Audio CAM 1').muted, true, 'o mute explícito foi aplicado');
    assert.equal(motor.audio('Audio CAM 2').muted, false, 'áudio não mencionado permanece');
    assert.equal(motor.state.overlays[1].scene, '', 'DSK não mencionado permanece');
    console.log('✓ Production.runRundown → EXECUTAR aplica e confirma via comandos reais do Production (OBS simulado)');

    const actionCount = motor.actions.length;
    const replay = await production.runRundown('rundown_execute', { stepId: 'integracao-1', operationId: 'integration-1' });
    assert.equal(replay.result.operationReplay, true, 'reconexão/clique repetido devolve o recibo sem repetir');
    assert.equal(motor.actions.length, actionCount, 'nenhum comando repetido no replay');
    await assert.rejects(
      () => production.runRundown('rundown_execute', { stepId: 'integracao-1', operationId: 'integration-2' }),
      /já foi executado|Prepare novamente/i
    );
    console.log('✓ Production.runRundown bloqueia duplicidade e preserva o recibo');

    const scriptFile = join(root, 'config', 'obs-studio', 'plugin_config', 'freemix-rundown', `${scopeHash}.json`);
    const historyFile = join(root, 'config', 'obs-studio', 'plugin_config', 'freemix-rundown', `${scopeHash}.historico.json`);
    const disk = JSON.parse(await readFile(scriptFile, 'utf8'));
    const history = JSON.parse(await readFile(historyFile, 'utf8'));
    assert.equal(disk.schemaVersion, 2);
    assert.equal(disk.script.blocks[0].steps[0].id, 'integracao-1');
    assert.equal(history.entries[0].outcome, 'confirmed');
    assert.equal(motor.state.program, 'CAM 2', 'persistência não desfaz o que está no ar');
    console.log('✓ Persistência separada confirmada no caminho de integração');

    // Regressão do incidente de instalação: servidor novo + engine antigo não
    // pode derrubar a API ao receber o evento nativo.
    const serverSource = await readFile(join(TOOLS, 'servidor-api.mjs'), 'utf8');
    assert.match(serverSource, /production\.rundownEngine\?\.onNativeEvent\?\.\(type,data\)/, 'evento nativo deve ser opcional');
    assert.doesNotMatch(serverSource, /production\.rundownEngine\.onNativeEvent\(type,data\)/, 'não pode chamar onNativeEvent sem proteção');
    assert.match(serverSource, /typeof production\.runRundown==='function'/, 'rota deve tolerar Production antigo sem runRundown');
    const controlSource = await readFile(join(TOOLS, 'controle-producao.mjs'), 'utf8');
    assert.match(controlSource, /typeof this\.rundownEngine\?\.setScope==='function'/, 'refresh deve tolerar engine antigo sem setScope');
    const rundownUi = await readFile(join(WORKSPACE, '3mix-panel', 'painel', 'remoto', 'rundown.html'), 'utf8');
    assert.ok(!rundownUi.includes('view=doc') && !rundownUi.includes('view=dock'), 'Rundown não usa modos de URL inexistentes');
    assert.match(rundownUi, /const insideProgram = embedded/, 'expansão deve detectar contexto interno');
    assert.match(rundownUi, /if \(insideProgram\)/, 'fallback window.open deve ser bloqueado dentro do programa');
    const savedEngine = production.rundownEngine;
    production.rundownEngine = null;
    await assert.rejects(() => production.runRundown('rundown_prepare', {}), /Rundown indisponível/i);
    production.rundownEngine = savedEngine;
    console.log('✓ Compatibilidade defensiva: engine antigo não derruba a API/evento nativo');
    console.log('\nTESTE DE INTEGRAÇÃO ISOLADA DO RUNDOWN PASSOU (OBS SIMULADO).');
  } finally {
    production?.getObs?.()?.close?.();
    await rm(root, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error('FALHA NA INTEGRAÇÃO DO RUNDOWN:', error);
  process.exit(1);
});
