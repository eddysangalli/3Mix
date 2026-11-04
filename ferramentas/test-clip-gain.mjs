import assert from 'node:assert/strict';
import { MediaPlayoutEngine } from './media-playout-engine.mjs';

/**
 * Teste de Validação Empírica: Adjust Gain por Clipe (TriCaster DDR Style)
 * 
 * Verifica:
 * 1. Inicialização de lista com múltiplos clipes contendo ganhos individuais.
 * 2. Aplicação de ganho no TAKE via filtro dedicado 'FreeMix Clip Gain'.
 * 3. Comutação A/B entre clipes com ganhos distintos (+3 dB, -6 dB, 0 dB).
 * 4. Ajuste ao vivo (live trim) do ganho do clipe em execução via playout_item_update.
 * 5. Clamp seguro de valores fora da escala [-30 dB, +30 dB].
 * 6. Retrocompatibilidade com itens que não definem audioGainDb (default 0 dB).
 */

console.log('--- Iniciando Teste de Validação: Adjust Gain por Clipe ---');

// Mock do objeto Production com gravação de chamadas OBS
class MockProduction {
  constructor() {
    this.root = process.cwd();
    this.scope = 'default';
    this.calls = [];
    this.filterState = {};
    this.state = {
      inputs: [
        { key: 'vt-input-key', name: 'VT Playout', sources: ['VT Playout Audio'] }
      ],
      audioInputs: [
        { key: 'vt-audio-key', name: 'VT Playout Audio' }
      ]
    };
  }

  scene(key) {
    return { key: 'vt-input-key', name: 'VT Playout', media: true };
  }

  audioNames(key) {
    return ['VT Playout Audio'];
  }

  async execute(action, params) {
    this.calls.push({ type: 'execute', action, params });
  }

  async req(type, params = {}) {
    this.calls.push({ type: 'req', reqType: type, params });

    if (type === 'GetSourceFilterList') {
      const src = params.sourceName || 'VT Playout Audio';
      const filters = this.filterState[src] || [];
      return { filters };
    }

    if (type === 'CreateSourceFilter') {
      const src = params.sourceName || 'VT Playout Audio';
      if (!this.filterState[src]) this.filterState[src] = [];
      const filter = {
        filterName: params.filterName,
        filterKind: params.filterKind,
        filterSettings: params.filterSettings,
        filterEnabled: true
      };
      this.filterState[src].push(filter);
      return {};
    }

    if (type === 'SetSourceFilterSettings') {
      const src = params.sourceName || 'VT Playout Audio';
      const f = (this.filterState[src] || []).find(item => item.filterName === params.filterName);
      if (f) {
        f.filterSettings = { ...f.filterSettings, ...params.filterSettings };
      }
      return {};
    }

    if (type === 'SetSourceFilterEnabled') {
      const src = params.sourceName || 'VT Playout Audio';
      const f = (this.filterState[src] || []).find(item => item.filterName === params.filterName);
      if (f) {
        f.filterEnabled = params.filterEnabled;
      }
      return {};
    }

    return {};
  }
}

async function runTests() {
  const mockProd = new MockProduction();
  const engine = new MediaPlayoutEngine(mockProd);

  // 1. Criar playlist com 5 clipes com ganhos diferentes
  const playlistPayload = {
    id: 'playlist-fla-tv',
    name: 'Lista FlaTV - VTs do Jogo',
    items: [
      { id: 'clip-1', title: 'Gol 1 - Zico', input: 'VT Playout', durationMs: 10000, audioGainDb: 3.0 },
      { id: 'clip-2', title: 'Comercial 1', input: 'VT Playout', durationMs: 15000, audioGainDb: -6.0 },
      { id: 'clip-3', title: 'Entrevista Coletiva', input: 'VT Playout', durationMs: 20000, audioGainDb: 0 },
      { id: 'clip-4', title: 'Compacto Melhores Momentos', input: 'VT Playout', durationMs: 30000, audioGainDb: 4.5 },
      { id: 'clip-5', title: 'Encerramento Sem Ganho Declarado', input: 'VT Playout', durationMs: 5000 } // sem audioGainDb
    ]
  };

  await engine.execute('playout_save_playlist', playlistPayload);

  const activeList = engine.getActiveList();
  assert.equal(activeList.items.length, 5, 'Playlist deve conter 5 itens');
  assert.equal(activeList.items[0].audioGainDb, 3.0);
  assert.equal(activeList.items[1].audioGainDb, -6.0);
  assert.equal(activeList.items[4].audioGainDb, 0, 'Item sem ganho deve assumir 0 dB por padrão');
  console.log('✓ Teste 1 PASS: Playlist com 5 clipes e ganhos individuais criada com sucesso');

  // 2. Executar TAKE no Clipe 1 (+3 dB)
  await engine.take({ item: activeList.items[0] });
  assert.equal(engine.state.program.item.id, 'clip-1');
  assert.equal(engine.state.program.audioGainDb, 3.0, 'Program deve refletir +3 dB de ganho');

  // Verifica criação do filtro no mock OBS
  const createdFilter = mockProd.filterState['VT Playout Audio']?.find(f => f.filterName === '3Mix Clip Gain');
  assert(createdFilter, 'Filtro 3Mix Clip Gain deve ter sido criado no OBS');
  assert.equal(createdFilter.filterSettings.db, 3.0, 'Configuração db do filtro deve ser +3.0');
  console.log('✓ Teste 2 PASS: TAKE do Clipe 1 aplicou +3.0 dB via filtro 3Mix Clip Gain');

  // 3. Executar TAKE no Clipe 2 (-6 dB)
  await engine.take({ item: activeList.items[1] });
  assert.equal(engine.state.program.item.id, 'clip-2');
  assert.equal(engine.state.program.audioGainDb, -6.0, 'Program deve refletir -6 dB de ganho');
  assert.equal(createdFilter.filterSettings.db, -6.0, 'Filtro existente deve ter sido atualizado para -6.0 dB');
  console.log('✓ Teste 3 PASS: TAKE do Clipe 2 atualizou ganho para -6.0 dB de forma suave');

  // 4. Ajustar ganho ao vivo (Live Trim) do clipe em execução
  console.log('Simulando ajuste de ganho ao vivo pelo operador para o Clipe 2 (+1.5 dB)...');
  await engine.execute('playout_item_update', {
    itemId: 'clip-2',
    audioGainDb: 1.5
  });

  assert.equal(activeList.items[1].audioGainDb, 1.5, 'Item da lista deve ter ganho atualizado para 1.5 dB');
  assert.equal(engine.state.program.audioGainDb, 1.5, 'Program deve refletir ganho imediato de 1.5 dB');
  assert.equal(createdFilter.filterSettings.db, 1.5, 'Filtro no OBS deve receber 1.5 dB em tempo real');
  console.log('✓ Teste 4 PASS: Ajuste de ganho ao vivo (Live Trim) alterou o filtro instantaneamente sem corte');

  // 5. Teste de clamp de limites de segurança [-30 dB, +30 dB]
  await engine.applyClipAudioGain('VT Playout', 45); // valor excessivo
  assert.equal(engine.state.program.audioGainDb, 30, 'Ganho acima de +30 dB deve ser limitado em 30 dB');
  assert.equal(createdFilter.filterSettings.db, 30);

  await engine.applyClipAudioGain('VT Playout', -60); // valor muito baixo
  assert.equal(engine.state.program.audioGainDb, -30, 'Ganho abaixo de -30 dB deve ser limitado em -30 dB');
  assert.equal(createdFilter.filterSettings.db, -30);
  console.log('✓ Teste 5 PASS: Clamp de limites de segurança [-30 dB, +30 dB] validado');

  // 6. TAKE no Clipe 5 (sem ganho declarado / 0 dB)
  await engine.take({ item: activeList.items[4] });
  assert.equal(engine.state.program.item.id, 'clip-5');
  assert.equal(engine.state.program.audioGainDb, 0, 'Program deve ser 0 dB');
  assert.equal(createdFilter.filterSettings.db, 0, 'Filtro deve ter voltado para 0 dB');
  console.log('✓ Teste 6 PASS: Clipe neutro retorna ganho para 0 dB sem interferir no mixer master');

  console.log('\n======================================================');
  console.log('TODOS OS TESTES DE ADJUST GAIN POR CLIPE PASSARAM COM SUCESSO!');
  console.log('======================================================');
}

runTests().catch(err => {
  console.error('FALHA NOS TESTES:', err);
  process.exit(1);
});

