import test from 'node:test';
import assert from 'node:assert/strict';
import { DEINTERLACE_MODES, DEINTERLACE_FIELD_ORDERS, DEINTERLACE_MODE_LABELS, ASYNC_CAPTURE_KINDS, validateDeinterlaceMode, validateDeinterlaceFieldOrder, readDeinterlace, setDeinterlace } from './deinterlace-producao.mjs';

test('os 9 modos reais do enum nativo estão presentes, todos com rótulo em português', () => {
  assert.equal(DEINTERLACE_MODES.length, 9);
  for (const mode of DEINTERLACE_MODES) assert.ok(DEINTERLACE_MODE_LABELS[mode], mode + ' sem rótulo');
});

test('validateDeinterlaceMode aceita as 9 strings reais e rejeita qualquer outra', () => {
  for (const mode of DEINTERLACE_MODES) assert.equal(validateDeinterlaceMode(mode), mode);
  assert.throws(() => validateDeinterlaceMode('YADIF'), /inválido/, 'não aceita o nome curto, só a string exata que o motor espera');
  assert.throws(() => validateDeinterlaceMode('OBS_DEINTERLACE_MODE_INVENTADO'), /inválido/);
});

test('validateDeinterlaceFieldOrder aceita só TOP/BOTTOM', () => {
  for (const order of DEINTERLACE_FIELD_ORDERS) assert.equal(validateDeinterlaceFieldOrder(order), order);
  assert.throws(() => validateDeinterlaceFieldOrder('MIDDLE'), /inválida/);
});

test('readDeinterlace: fonte fora da lista de captura física (ex. browser_source) devolve supported:false sem chamar o motor', async () => {
  let chamou = false;
  const obs = { req: async () => { chamou = true; return {}; } };
  const r = await readDeinterlace(obs, { inputName: 'Overlay', inputKind: 'browser_source' });
  assert.equal(r.supported, false);
  assert.equal(chamou, false, 'não deveria nem tentar consultar o motor para um tipo que o próprio motor recusaria');
});

test('readDeinterlace: câmera real (dshow_input) consulta modo e ordem de campo reais via obs-websocket padrão', async () => {
  const chamadas = [];
  const obs = { req: async (type, data) => { chamadas.push(type); if (type === 'GetInputDeinterlaceMode') return { inputDeinterlaceMode: 'OBS_DEINTERLACE_MODE_YADIF' }; if (type === 'GetInputDeinterlaceFieldOrder') return { inputDeinterlaceFieldOrder: 'OBS_DEINTERLACE_FIELD_ORDER_TOP' }; throw Error('inesperado'); } };
  const r = await readDeinterlace(obs, { inputName: 'CAM 1', inputKind: 'dshow_input' });
  assert.equal(r.supported, true);
  assert.equal(r.mode, 'OBS_DEINTERLACE_MODE_YADIF');
  assert.equal(r.fieldOrder, 'OBS_DEINTERLACE_FIELD_ORDER_TOP');
  assert.deepEqual(chamadas.sort(), ['GetInputDeinterlaceFieldOrder', 'GetInputDeinterlaceMode']);
});

test('readDeinterlace: motor recusa (ex. dshow_input sem dispositivo real ainda) -- devolve supported:false com o motivo, não lança', async () => {
  const obs = { req: async () => { throw Error('The specified input is not async.'); } };
  const r = await readDeinterlace(obs, { inputName: 'CAM 1', inputKind: 'dshow_input' });
  assert.equal(r.supported, false);
  assert.match(r.reason, /not async/);
});

test('setDeinterlace: aplica modo E ordem de campo reais, confirmando por releitura (mesmo padrão de SetInputMute/GetInputMute do resto do projeto)', async () => {
  let modoAplicado = 'OBS_DEINTERLACE_MODE_DISABLE', ordemAplicada = 'OBS_DEINTERLACE_FIELD_ORDER_TOP';
  const obs = {
    req: async (type, data) => {
      if (type === 'SetInputDeinterlaceMode') { modoAplicado = data.inputDeinterlaceMode; return {}; }
      if (type === 'SetInputDeinterlaceFieldOrder') { ordemAplicada = data.inputDeinterlaceFieldOrder; return {}; }
      if (type === 'GetInputDeinterlaceMode') return { inputDeinterlaceMode: modoAplicado };
      if (type === 'GetInputDeinterlaceFieldOrder') return { inputDeinterlaceFieldOrder: ordemAplicada };
      throw Error('inesperado: ' + type);
    }
  };
  const r = await setDeinterlace(obs, { inputName: 'CAM 1', inputKind: 'dshow_input', mode: 'OBS_DEINTERLACE_MODE_YADIF', fieldOrder: 'OBS_DEINTERLACE_FIELD_ORDER_BOTTOM' });
  assert.equal(r.mode, 'OBS_DEINTERLACE_MODE_YADIF');
  assert.equal(r.fieldOrder, 'OBS_DEINTERLACE_FIELD_ORDER_BOTTOM');
});

test('setDeinterlace: motor não confirma o modo enviado (ex. race condition/fonte removida) -- lança, não finge sucesso', async () => {
  const obs = {
    req: async (type) => {
      if (type === 'SetInputDeinterlaceMode') return {};
      if (type === 'GetInputDeinterlaceMode') return { inputDeinterlaceMode: 'OBS_DEINTERLACE_MODE_DISABLE' }; // não mudou de verdade
      if (type === 'GetInputDeinterlaceFieldOrder') return { inputDeinterlaceFieldOrder: 'OBS_DEINTERLACE_FIELD_ORDER_TOP' };
      throw Error('inesperado: ' + type);
    }
  };
  await assert.rejects(() => setDeinterlace(obs, { inputName: 'CAM 1', inputKind: 'dshow_input', mode: 'OBS_DEINTERLACE_MODE_YADIF' }), /não confirmou o modo/);
});

test('setDeinterlace: fonte fora da lista de captura física é recusada antes de qualquer chamada ao motor', async () => {
  let chamou = false;
  const obs = { req: async () => { chamou = true; return {}; } };
  await assert.rejects(() => setDeinterlace(obs, { inputName: 'Overlay', inputKind: 'browser_source', mode: 'OBS_DEINTERLACE_MODE_YADIF' }), /não é uma captura física/);
  assert.equal(chamou, false);
});

test('setDeinterlace: só mode informado não toca a ordem de campo, e vice-versa -- os dois campos são independentes', async () => {
  const chamadas = [];
  const obs = {
    req: async (type, data) => {
      chamadas.push(type);
      if (type === 'SetInputDeinterlaceMode') return {};
      if (type === 'GetInputDeinterlaceMode') return { inputDeinterlaceMode: 'OBS_DEINTERLACE_MODE_YADIF' };
      if (type === 'GetInputDeinterlaceFieldOrder') return { inputDeinterlaceFieldOrder: 'OBS_DEINTERLACE_FIELD_ORDER_TOP' };
      throw Error('inesperado: ' + type);
    }
  };
  await setDeinterlace(obs, { inputName: 'CAM 1', inputKind: 'dshow_input', mode: 'OBS_DEINTERLACE_MODE_YADIF' });
  assert.ok(!chamadas.includes('SetInputDeinterlaceFieldOrder'), 'sem fieldOrder no pedido, não deveria chamar Set da ordem de campo');
});

test('ASYNC_CAPTURE_KINDS cobre os tipos de captura física/arquivo já usados em outras partes do projeto (audio-routing, PTZ), sem inventar nenhum novo', () => {
  assert.ok(ASYNC_CAPTURE_KINDS.includes('dshow_input'));
  assert.ok(ASYNC_CAPTURE_KINDS.includes('decklink-input'));
});
