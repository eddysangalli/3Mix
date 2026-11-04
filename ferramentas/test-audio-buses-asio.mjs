// Teste real do roteamento ASIO/barramentos (audio-buses-producao.mjs, modulo de producao
// real, nao clone) -- lacuna encontrada na Fase 4 do superprompt: a implementacao Node JA
// EXISTE e e substancial (normalizeAsioRoutes/normalizeMembers, AudioBusesEngine com
// audio_routing_asio_output_*/audio_routing_asio_create/audio_routing_bus_*), mas nunca tinha
// nenhum teste, nem de unidade. A MATRIZ-INVENTARIO-CREW-BROADCAST.md dizia "roteamento de
// canais fisicos (UI): nao investigado a fundo -- fica para a Fase 4", o que estava impreciso:
// a UI (painel/remoto/audio-buses.js) e o backend ja existem e sao substanciais. Este teste
// fecha a lacuna real (ausencia de teste), nao de implementacao.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAsioRoutes, normalizeMembers, publicAudio, AudioBusesEngine } from './audio-buses-producao.mjs';

test('normalizeAsioRoutes aceita de 1 a 8 rotas estéreo, rejeita 0 ou mais de 8', () => {
  const allowed = new Set(['a', 'b']);
  assert.throws(() => normalizeAsioRoutes([], allowed), /uma até oito rotas/);
  const nove = Array.from({ length: 9 }, (_, i) => ({ key: 'a', left: i * 2, right: i * 2 + 1 }));
  assert.throws(() => normalizeAsioRoutes(nove, new Set(['a'])), /uma até oito rotas/);
});

test('normalizeAsioRoutes rejeita canais repetidos entre rotas diferentes (mesma proteção que o C++ nativo faz com std::set)', () => {
  const allowed = new Set(['a', 'b']);
  assert.throws(() => normalizeAsioRoutes([{ key: 'a', left: 0, right: 1 }, { key: 'b', left: 1, right: 2 }], allowed), /canais repetidos/);
});

test('normalizeAsioRoutes rejeita left === right na mesma rota (canal não pode apontar para si mesmo nos dois lados)', () => {
  const allowed = new Set(['a']);
  assert.throws(() => normalizeAsioRoutes([{ key: 'a', left: 3, right: 3 }], allowed), /canais repetidos/);
});

test('normalizeAsioRoutes rejeita canal fora de 0–255 e fonte não permitida (privada/removida)', () => {
  const allowed = new Set(['a']);
  assert.throws(() => normalizeAsioRoutes([{ key: 'a', left: -1, right: 0 }], allowed), /canais repetidos/);
  assert.throws(() => normalizeAsioRoutes([{ key: 'a', left: 0, right: 256 }], allowed), /canais repetidos/);
  assert.throws(() => normalizeAsioRoutes([{ key: 'fonte-privada', left: 0, right: 1 }], allowed), /fonte privada\/ausente/);
});

test('normalizeAsioRoutes rejeita ganho fora de 0..2, aceita default 1 quando omitido', () => {
  const allowed = new Set(['a']);
  assert.throws(() => normalizeAsioRoutes([{ key: 'a', left: 0, right: 1, gain: 3 }], allowed), /ganho inválido/);
  const r = normalizeAsioRoutes([{ key: 'a', left: 0, right: 1 }], allowed);
  assert.equal(r[0].gain, 1);
});

test('normalizeAsioRoutes aceita múltiplas rotas válidas sem conflito de canal, preservando uuid/left/right/gain', () => {
  const allowed = new Set(['a', 'b', 'c']);
  const r = normalizeAsioRoutes([{ key: 'a', left: 0, right: 1, gain: 0.8 }, { key: 'b', left: 2, right: 3 }, { key: 'c', left: 4, right: 5 }], allowed);
  assert.equal(r.length, 3);
  assert.deepEqual(r[0], { uuid: 'a', left: 0, right: 1, gain: 0.8 });
  assert.deepEqual(r[1], { uuid: 'b', left: 2, right: 3, gain: 1 });
});

test('normalizeMembers rejeita mais de 32 fontes, fonte repetida ou ganho inválido', () => {
  const allowed = new Set(['a', 'b']);
  assert.throws(() => normalizeMembers(Array.from({ length: 33 }, () => ({ key: 'a' })), allowed), /até 32 fontes/);
  assert.throws(() => normalizeMembers([{ key: 'a' }, { key: 'a' }], allowed), /repetida/);
  assert.throws(() => normalizeMembers([{ key: 'a', gain: 5 }], allowed), /ganho inválido/);
});

test('publicAudio exclui corretamente o diretor, buses internos e nomes reservados do 3Mix (mix-minus/N1/Master/Retorno)', () => {
  const director = { key: 'dir-uuid', name: 'Diretor' };
  assert.equal(publicAudio({ key: 'cam1', name: 'CAM 1' }, director), true);
  assert.equal(publicAudio({ key: 'dir-uuid', name: 'Diretor' }, director), false, 'a própria fonte do diretor nunca é "pública"');
  assert.equal(publicAudio({ key: 'x', name: '3Mix Master' }, director), false);
  assert.equal(publicAudio({ key: 'x', name: '3Mix N1 abc' }, director), false);
  assert.equal(publicAudio({ key: 'x', name: 'CAM 2', kind: 'mix-track-to-source' }, director), false);
});

function fixtureEngine() {
  const p = {
    scope: 'proj-1', root: 'D:/fixture',
    state: { buses: true },
    async req(type, data) {
      if (type === 'GetInputKindList') return { inputKinds: ['freemix_audio_bus', 'asio_input_capture'] };
      if (type === 'GetSourceFilterKindList') return { sourceFilterKinds: ['audio_monitor'] };
      throw Error('req inesperado: ' + type);
    },
    async vendor(type, data) {
      if (type === 'audio_capabilities') {
        if (data.discoverAsio) return { success: true, asioOutputCapabilities: { supported: true, inventoryKnown: true, drivers: [{ id: 'driver-1', name: 'Driver Fixture' }] } };
        if (data.asioAction === 'state') return { asioOutputCapabilities: { supported: true, inventoryKnown: true, drivers: [{ id: 'driver-1', name: 'Driver Fixture' }], running: false, configured: false, routes: [] } };
        if (data.asioAction === 'configure') return { success: true, asioOutputCapabilities: { supported: true, inventoryKnown: true, drivers: [{ id: 'driver-1', name: 'Driver Fixture' }], running: false, configured: true, routes: data.routes } };
        throw Error('audio_capabilities payload inesperado: ' + JSON.stringify(data));
      }
      if (type === 'talkback') return { director_uuid: null };
      throw Error('vendor inesperado: ' + type);
    }
  };
  return p;
}

test('AudioBusesEngine.command("audio_routing_asio_output_configure") valida e persiste rotas reais, confirmando pelo motor antes de salvar', async () => {
  const p = fixtureEngine();
  const engine = new AudioBusesEngine(p);
  await engine.refresh({ connected: true, scope: 'proj-1', sourceInputs: [{ key: 'cam1', name: 'CAM 1', kind: 'dshow_input' }], audioInputs: [{ key: 'cam1', name: 'CAM 1' }] });
  await engine.command('audio_routing_asio_output_configure', { driverId: 'driver-1', bufferFrames: 256, routes: [{ key: 'cam1', left: 0, right: 1 }] });
  assert.equal(engine.config.asioOutput.driverId, 'driver-1');
  assert.equal(engine.config.asioOutput.bufferFrames, 256);
  assert.equal(engine.asioOutput.configured, true);
});

test('AudioBusesEngine.command rejeita driver desconhecido antes de chamar o motor (evita configurar com ID inválido)', async () => {
  const p = fixtureEngine();
  const engine = new AudioBusesEngine(p);
  await engine.refresh({ connected: true, scope: 'proj-1', sourceInputs: [{ key: 'cam1', name: 'CAM 1', kind: 'dshow_input' }], audioInputs: [{ key: 'cam1', name: 'CAM 1' }] });
  await assert.rejects(() => engine.command('audio_routing_asio_output_configure', { driverId: 'driver-inexistente', bufferFrames: 0, routes: [{ key: 'cam1', left: 0, right: 1 }] }), /Driver de saída ASIO não encontrado/);
});

test('AudioBusesEngine.command rejeita buffer fora de 0 (automático) ou 16–8192', async () => {
  const p = fixtureEngine();
  const engine = new AudioBusesEngine(p);
  await engine.refresh({ connected: true, scope: 'proj-1', sourceInputs: [{ key: 'cam1', name: 'CAM 1', kind: 'dshow_input' }], audioInputs: [{ key: 'cam1', name: 'CAM 1' }] });
  await assert.rejects(() => engine.command('audio_routing_asio_output_configure', { driverId: 'driver-1', bufferFrames: 8, routes: [{ key: 'cam1', left: 0, right: 1 }] }), /Buffer ASIO/);
});
