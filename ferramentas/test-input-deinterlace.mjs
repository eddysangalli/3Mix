// Teste real de integração: InputEngine.execute('input_deinterlace', ...) (módulo de produção
// real, não clone), confirmando que o novo comando resolve a fonte NATIVA certa via
// state.sourceInputs (não a cena/composição que a contém) e chama o motor pelo contrato padrão
// do obs-websocket (não um vendor request customizado).
import test from 'node:test';
import assert from 'node:assert/strict';
import { InputEngine } from './entradas-producao.mjs';

function fixtureProduction(sourceInputs) {
  let modoAtual = 'OBS_DEINTERLACE_MODE_DISABLE', ordemAtual = 'OBS_DEINTERLACE_FIELD_ORDER_TOP';
  const p = {
    state: { sourceInputs },
    async req(type, data) {
      if (type === 'SetInputDeinterlaceMode') { modoAtual = data.inputDeinterlaceMode; return {}; }
      if (type === 'SetInputDeinterlaceFieldOrder') { ordemAtual = data.inputDeinterlaceFieldOrder; return {}; }
      if (type === 'GetInputDeinterlaceMode') return { inputDeinterlaceMode: modoAtual };
      if (type === 'GetInputDeinterlaceFieldOrder') return { inputDeinterlaceFieldOrder: ordemAtual };
      throw Error('req inesperado: ' + type);
    }
  };
  return p;
}

test('input_deinterlace aplica o modo real na fonte nativa (dshow_input), confirmado pelo motor', async () => {
  const p = fixtureProduction([{ key: 'uuid-1', name: 'Câmera 1', kind: 'dshow_input' }]);
  const engine = new InputEngine(p);
  const r = await engine.execute('input_deinterlace', { sourceName: 'Câmera 1', mode: 'OBS_DEINTERLACE_MODE_YADIF' });
  assert.equal(r.mode, 'OBS_DEINTERLACE_MODE_YADIF');
});

test('input_deinterlace recusa fonte que não existe em sourceInputs -- não inventa estado para nome inexistente', async () => {
  const p = fixtureProduction([{ key: 'uuid-1', name: 'Câmera 1', kind: 'dshow_input' }]);
  const engine = new InputEngine(p);
  await assert.rejects(() => engine.execute('input_deinterlace', { sourceName: 'Câmera Fantasma', mode: 'OBS_DEINTERLACE_MODE_YADIF' }), /não encontrada/);
});

test('input_deinterlace recusa fonte que não é captura física (ex. browser_source) -- erro chega até a integração real, não só o módulo isolado', async () => {
  const p = fixtureProduction([{ key: 'uuid-2', name: 'Overlay GC', kind: 'browser_source' }]);
  const engine = new InputEngine(p);
  await assert.rejects(() => engine.execute('input_deinterlace', { sourceName: 'Overlay GC', mode: 'OBS_DEINTERLACE_MODE_YADIF' }), /não é uma captura física/);
});

test('input_deinterlace aplica ordem de campo junto com o modo, na mesma chamada', async () => {
  const p = fixtureProduction([{ key: 'uuid-1', name: 'Câmera 1', kind: 'decklink-input' }]);
  const engine = new InputEngine(p);
  const r = await engine.execute('input_deinterlace', { sourceName: 'Câmera 1', mode: 'OBS_DEINTERLACE_MODE_YADIF_2X', fieldOrder: 'OBS_DEINTERLACE_FIELD_ORDER_BOTTOM' });
  assert.equal(r.mode, 'OBS_DEINTERLACE_MODE_YADIF_2X');
  assert.equal(r.fieldOrder, 'OBS_DEINTERLACE_FIELD_ORDER_BOTTOM');
});
