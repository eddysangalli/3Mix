import { DiskReplay } from './replay-disco.mjs';

console.log('--- TESTE EMPÍRICO DAS NOVAS APIS DE REPLAY E VMIX ---');

// Mock leve do OBS WebSocket
const mockObs = {
  scenes: [
    { sceneName: 'CAM 1' },
    { sceneName: 'CAM 2' },
    { sceneName: 'REPLAY A' },
    { sceneName: 'REPLAY B' }
  ],
  currentProgramSceneName: 'CAM 1',
  currentPreviewSceneName: 'CAM 2',
  studioModeEnabled: true,
  mediaStatus: {
    'Replay Player A': { mediaDuration: 10000, mediaCursor: 2500, mediaState: 'OBS_MEDIA_STATE_PAUSED' },
    'Replay Player B': { mediaDuration: 10000, mediaCursor: 1000, mediaState: 'OBS_MEDIA_STATE_PAUSED' }
  },
  req: async (type, data = {}) => {
    if (type === 'GetSceneList') {
      return { scenes: mockObs.scenes, currentProgramSceneName: mockObs.currentProgramSceneName, currentPreviewSceneName: mockObs.currentPreviewSceneName };
    }
    if (type === 'GetSceneCollectionList') {
      return { currentSceneCollectionName: 'Colecao Teste', sceneCollections: ['Colecao Teste'] };
    }
    if (type === 'GetStudioModeEnabled') {
      return { studioModeEnabled: mockObs.studioModeEnabled };
    }
    if (type === 'SetCurrentProgramScene') {
      mockObs.currentProgramSceneName = data.sceneName;
      return {};
    }
    if (type === 'SetCurrentPreviewScene') {
      mockObs.currentPreviewSceneName = data.sceneName;
      return {};
    }
    if (type === 'GetMediaInputStatus') {
      return mockObs.mediaStatus[data.inputName] || { mediaDuration: 10000, mediaCursor: 0, mediaState: 'OBS_MEDIA_STATE_PAUSED' };
    }
    if (type === 'SetMediaInputCursor') {
      if (mockObs.mediaStatus[data.inputName]) {
        mockObs.mediaStatus[data.inputName].mediaCursor = data.mediaCursor;
      }
      return {};
    }
    if (type === 'TriggerMediaInputAction') {
      if (mockObs.mediaStatus[data.inputName]) {
        if (data.mediaAction.includes('PLAY')) mockObs.mediaStatus[data.inputName].mediaState = 'OBS_MEDIA_STATE_PLAYING';
        if (data.mediaAction.includes('PAUSE')) mockObs.mediaStatus[data.inputName].mediaState = 'OBS_MEDIA_STATE_PAUSED';
      }
      return {};
    }
    return {};
  }
};

const replay = new DiskReplay({ root: '.', getObs: () => mockObs });
replay.scope = 'Colecao Teste';
replay.req = mockObs.req;
replay.optional = mockObs.req;
replay.hydratePlayers = async () => {};
replay.waitFor = async () => {};
replay.save = async () => {};

// Popula dados de simulação
replay.state.events = [
  { id: 'ev1', name: 'GOL TIME A', dur: 10, clips: [{ cam: 'CAM 1', file: 'cam1.mp4' }, { cam: 'CAM 2', file: 'cam2.mp4' }] },
  { id: 'ev2', name: 'FALTA PERIGOSA', dur: 8, clips: [{ cam: 'CAM 1', file: 'cam1.mp4' }] }
];
replay.state.players['A'] = { eventId: 'ev1', cam: 'CAM 1', file: 'cam1.mp4', duration: 10, frameRate: 30 };
replay.state.players['B'] = { eventId: 'ev1', cam: 'CAM 2', file: 'cam2.mp4', duration: 10, frameRate: 30 };

let passed = 0;
let total = 0;
function assert(name, condition, extra = '') {
  total++;
  if (condition) {
    passed++;
    console.log(`[PASS] ${name} ${extra}`);
  } else {
    console.error(`[FAIL] ${name} ${extra}`);
  }
}

async function run() {
  // 1. Teste de Swap
  assert('Estado inicial activePlayer é A', replay.state.activePlayer === 'A');
  await replay.command('swap');
  assert('Swap fora do ar alterna activePlayer para B', replay.state.activePlayer === 'B');
  await replay.command('swap');
  assert('Swap fora do ar alterna activePlayer de volta para A', replay.state.activePlayer === 'A');

  // 2. Teste de Jump em Segundos (+3s de 2500ms = 5500ms)
  await replay.command('jump', { player: 'A', seconds: 3 });
  assert('Jump de +3s desloca cursor para 5500ms', mockObs.mediaStatus['Replay Player A'].mediaCursor === 5500, `Cursor: ${mockObs.mediaStatus['Replay Player A'].mediaCursor}`);

  // 3. Teste de Jump em Quadros (-30 quadros em 30fps = -1000ms -> 4500ms)
  await replay.command('jump', { player: 'A', frames: -30 });
  assert('Jump de -30 quadros recua cursor para ~4500ms', Math.abs(mockObs.mediaStatus['Replay Player A'].mediaCursor - 4500) < 50, `Cursor: ${mockObs.mediaStatus['Replay Player A'].mediaCursor}`);

  // 4. Teste de Play/Pause
  assert('Player A inicialmente PAUSED', mockObs.mediaStatus['Replay Player A'].mediaState === 'OBS_MEDIA_STATE_PAUSED');
  await replay.command('play-pause', { player: 'A' });
  assert('play-pause muda Player A para PLAYING', mockObs.mediaStatus['Replay Player A'].mediaState === 'OBS_MEDIA_STATE_PLAYING');
  await replay.command('play-pause', { player: 'A' });
  assert('play-pause muda Player A de volta para PAUSED', mockObs.mediaStatus['Replay Player A'].mediaState === 'OBS_MEDIA_STATE_PAUSED');

  // 5. Teste de Seleção de Evento
  await replay.command('select-event', { offset: 'next' });
  assert('select-event next seleciona ev2', replay.state.selectedEventId === 'ev2');
  await replay.command('select-event', { offset: 'first' });
  assert('select-event first seleciona ev1', replay.state.selectedEventId === 'ev1');

  // 6. Teste de Jump to Now
  await replay.command('jump-to-now', { player: 'A' });
  assert('jump-to-now posiciona cursor próximo ao fim do clipe', mockObs.mediaStatus['Replay Player A'].mediaCursor >= 9800, `Cursor: ${mockObs.mediaStatus['Replay Player A'].mediaCursor}`);

  console.log(`\nRESUMO: ${passed}/${total} testes aprovados com 100% de sucesso!`);
  if (passed !== total) process.exit(1);
}

run().catch(err => {
  console.error('ERRO FATAL NO TESTE:', err);
  process.exit(1);
});
