// Teste real da proteção contra ciclo/referência circular em sceneSources()/visibleTree()/
// meTally() (classe Production real, não um clone). Motivado pela correção da auditoria
// vMix 30 (3Mix PR #3, §3): a guarda `if(visited.has(name))return` existe no código nas 3
// funções (controle-producao.mjs) e em meTally() (registro-sinais-producao.mjs, que chama
// visibleTree()), mas nenhum teste forçava um ciclo real -- só a leitura do código provava
// a proteção. Este arquivo fecha essa lacuna específica.
//
// Cenário: uma árvore de cenas onde "Cena A" contém "Cena B" como item, e "Cena B" contém
// "Cena A" de volta -- um ciclo direto de 2 nós. Não é um estado que a UI do motor permite
// montar por engano fácil, mas é exatamente o tipo de inconsistência que um arquivo de
// projeto editado à mão, uma falha de sincronização entre Patch/Input Slot, ou uma versão
// futura do motor com nesting mais permissivo poderia produzir -- e a guarda existe
// justamente para esse caso, não para o caminho feliz.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Production } from './controle-producao.mjs';
import { SignalRegistryEngine } from './registro-sinais-producao.mjs';
import { MixEffectsEngine } from './mix-effects-producao.mjs';

// Grafo de cenas: { nomeDaCena: [ {sourceName, sourceType} | nome de fonte simples ] }
const GRAFO_CICLO_DIRETO = {
  'Cena A': [{ sourceName: 'Cena B', sourceType: 'OBS_SOURCE_TYPE_SCENE' }, 'CAM 1'],
  'Cena B': [{ sourceName: 'Cena A', sourceType: 'OBS_SOURCE_TYPE_SCENE' }, 'CAM 2'], // ciclo: B aponta de volta pra A
  'Cena C (sem ciclo)': [{ sourceName: 'Cena A', sourceType: 'OBS_SOURCE_TYPE_SCENE' }, 'CAM 3'],
};
// Ciclo indireto de 3 nós (A -> B -> C -> A): mais realista que o de 2 nós para um erro de
// Patch/encadeamento de composições, que normalmente passa por um nó intermediário.
const GRAFO_CICLO_TRIANGULO = {
  'Cena A': [{ sourceName: 'Cena B', sourceType: 'OBS_SOURCE_TYPE_SCENE' }, 'CAM 1'],
  'Cena B': [{ sourceName: 'Cena C', sourceType: 'OBS_SOURCE_TYPE_SCENE' }, 'CAM 2'],
  'Cena C': [{ sourceName: 'Cena A', sourceType: 'OBS_SOURCE_TYPE_SCENE' }, 'CAM 3'],
};
// Auto-referência direta: uma cena que se contém a si mesma (o caso degenerado mais simples
// de todos -- se a guarda falhasse, este é o cenário que travaria na primeira chamada recursiva).
const GRAFO_AUTO_REFERENCIA = {
  'Cena Espelhada': [{ sourceName: 'Cena Espelhada', sourceType: 'OBS_SOURCE_TYPE_SCENE' }, 'CAM 1'],
};

function mockObsComCiclo(cenas = GRAFO_CICLO_DIRETO) {
  return {
    async req(type, data = {}) {
      if (type === 'GetSceneItemList') {
        const itens = cenas[data.sceneName];
        if (!itens) throw Error('Cena inexistente no mock: ' + data.sceneName);
        return { sceneItems: itens.map((it) => typeof it === 'string'
          ? { sourceName: it, sourceType: 'OBS_SOURCE_TYPE_DSHOW_INPUT', isGroup: false, sceneItemEnabled: true }
          : { sourceName: it.sourceName, sourceType: it.sourceType, isGroup: false, sceneItemEnabled: true }) };
      }
      if (type === 'GetGroupSceneItemList') return { sceneItems: [] };
      throw Error('Chamada inesperada no mock: ' + type);
    },
  };
}

function novaProduction(cenas) {
  const obs = mockObsComCiclo(cenas);
  return { p: new Production({ root: '.', panel: '.', getObs: () => obs }), obs };
}

// ---- sceneSources(): usada por entradas-producao.mjs/InputEngine para resolver fontes reais de uma cena ----
test('sceneSources() não entra em loop infinito com um ciclo direto A↔B e devolve as fontes reais encontradas', async () => {
  const { p } = novaProduction();
  const resultado = await Promise.race([
    p.sceneSources('Cena A'),
    new Promise((_, reject) => setTimeout(() => reject(Error('TIMEOUT: sceneSources() não retornou -- ciclo não protegido')), 2000)),
  ]);
  assert.ok(Array.isArray(resultado), 'deve devolver um array, não lançar nem travar');
  assert.ok(resultado.includes('CAM 1'), 'fontes reais da Cena A devem aparecer');
  assert.ok(resultado.includes('CAM 2'), 'fontes reais da Cena B (alcançada pelo ciclo) também devem aparecer uma vez');
});

test('sceneSources() a partir de "Cena B" (o outro lado do mesmo ciclo) também termina e encontra as mesmas fontes', async () => {
  const { p } = novaProduction();
  const resultado = await Promise.race([
    p.sceneSources('Cena B'),
    new Promise((_, reject) => setTimeout(() => reject(Error('TIMEOUT: sceneSources() não retornou a partir do outro lado do ciclo')), 2000)),
  ]);
  assert.ok(resultado.includes('CAM 1') && resultado.includes('CAM 2'));
});

test('sceneSources(): cena sem ciclo que referencia uma cena ciclada continua funcionando normalmente (o ciclo não "contamina" quem a usa)', async () => {
  const { p } = novaProduction();
  const resultado = await Promise.race([
    p.sceneSources('Cena C (sem ciclo)'),
    new Promise((_, reject) => setTimeout(() => reject(Error('TIMEOUT')), 2000)),
  ]);
  assert.ok(resultado.includes('CAM 1') && resultado.includes('CAM 2') && resultado.includes('CAM 3'));
});

// ---- visibleTree(): usada pelo tally do MAIN (programTree/previewTree) e por meTally() (M/E 2-4) ----
test('visibleTree() não entra em loop infinito com o mesmo ciclo e inclui as fontes reais na árvore visível', async () => {
  const { p } = novaProduction();
  const visited = await Promise.race([
    p.visibleTree('Cena A'),
    new Promise((_, reject) => setTimeout(() => reject(Error('TIMEOUT: visibleTree() não retornou -- ciclo não protegido')), 2000)),
  ]);
  assert.ok(visited instanceof Set);
  assert.ok(visited.has('CAM 1') && visited.has('CAM 2'), 'fontes reais dos dois lados do ciclo devem estar na árvore visível');
  // As próprias cenas também entram no Set (são visitadas), o que é esperado -- a garantia
  // da guarda é terminar e não duplicar trabalho infinitamente, não excluir os nós do ciclo.
  assert.ok(visited.has('Cena A') && visited.has('Cena B'));
});

test('realtimeVisibleTree() (a guarda real-time usada antes de excluir uma Entrada) também não entra em loop com o mesmo ciclo', async () => {
  const { p } = novaProduction();
  const visited = await Promise.race([
    p.realtimeVisibleTree('Cena A'),
    new Promise((_, reject) => setTimeout(() => reject(Error('TIMEOUT: realtimeVisibleTree() não retornou')), 2000)),
  ]);
  assert.ok(visited.has('CAM 1') && visited.has('CAM 2'));
});

// ---- meTally() (registro-sinais-producao.mjs): o tally recursivo de M/E 2-4, que usa visibleTree() internamente ----
test('meTally() não entra em loop infinito quando o Programa/Preview de um M/E resolve para uma cena dentro do ciclo', async () => {
  const { p, obs } = novaProduction();
  // meTally() olha this.p.state.inputs para resolver programUuid/previewUuid -> nome da cena;
  // monta esse estado mínimo e um MixEffectsEngine cujo .read() devolve um M/E 2 apontando
  // pra dentro do ciclo, exatamente como o motor real faria via mix.programUuid.
  p.state.inputs = [{ key: 'uuid-cena-a', name: 'Cena A' }, { key: 'uuid-cena-b', name: 'Cena B' }];
  const mixes = new MixEffectsEngine(p);
  mixes.read = async () => ({ mixes: [{ mixId: 2, programUuid: 'uuid-cena-a', previewUuid: 'uuid-cena-b' }] });
  const signals = new SignalRegistryEngine(p);
  signals.mixes = mixes;

  const resultado = await Promise.race([
    signals.meTally(),
    new Promise((_, reject) => setTimeout(() => reject(Error('TIMEOUT: meTally() não retornou -- o ciclo se propagou pelo tally de M/E')), 2000)),
  ]);
  assert.ok(resultado[2], 'M/E 2 deve aparecer no resultado');
  assert.ok(resultado[2].program.includes('CAM 1'), 'tally de Programa do M/E 2 deve incluir a fonte real alcançada através do ciclo');
  assert.ok(resultado[2].preview.includes('CAM 2'), 'tally de Preview do M/E 2 deve incluir a fonte real do outro lado do ciclo');
});

// ---- Garantia adicional: o tempo de execução não cresce de forma anormal (prova indireta
// de que não há trabalho repetido sem limite, só a garantia de terminar não bastaria se
// terminasse "devagar demais" por reprocessar o ciclo centenas de vezes antes de desistir). ----
test('visibleTree() num ciclo termina rapidamente (não apenas "eventualmente'+'") -- sem reprocessamento escondido', async () => {
  const { p } = novaProduction();
  const inicio = Date.now();
  await p.visibleTree('Cena A');
  const duracao = Date.now() - inicio;
  assert.ok(duracao < 500, `deveria terminar em poucos milissegundos (mock local, sem rede); levou ${duracao}ms`);
});

// ---- Variação: ciclo indireto de 3 nós (A -> B -> C -> A), mais realista que o de 2 nós ----
test('sceneSources()/visibleTree(): ciclo indireto de 3 nós (triângulo) também termina e encontra todas as fontes reais', async () => {
  const { p } = novaProduction(GRAFO_CICLO_TRIANGULO);
  const fontes = await Promise.race([
    p.sceneSources('Cena A'),
    new Promise((_, reject) => setTimeout(() => reject(Error('TIMEOUT: ciclo triangular não protegido em sceneSources()')), 2000)),
  ]);
  assert.ok(['CAM 1', 'CAM 2', 'CAM 3'].every((c) => fontes.includes(c)), 'fontes dos 3 nós do triângulo devem aparecer');

  const visited = await Promise.race([
    p.visibleTree('Cena B'), // entrando pelo meio do triângulo, não pelo nó "inicial"
    new Promise((_, reject) => setTimeout(() => reject(Error('TIMEOUT: ciclo triangular não protegido em visibleTree()')), 2000)),
  ]);
  assert.ok(['CAM 1', 'CAM 2', 'CAM 3'].every((c) => visited.has(c)));
});

// ---- Variação: auto-referência direta (uma cena que se contém a si mesma) ----
test('sceneSources()/visibleTree(): uma cena que se contém a si mesma (auto-referência direta) não trava na primeira chamada recursiva', async () => {
  const { p } = novaProduction(GRAFO_AUTO_REFERENCIA);
  const fontes = await Promise.race([
    p.sceneSources('Cena Espelhada'),
    new Promise((_, reject) => setTimeout(() => reject(Error('TIMEOUT: auto-referência não protegida em sceneSources()')), 2000)),
  ]);
  assert.deepEqual(fontes, ['CAM 1']);

  const visited = await Promise.race([
    p.visibleTree('Cena Espelhada'),
    new Promise((_, reject) => setTimeout(() => reject(Error('TIMEOUT: auto-referência não protegida em visibleTree()')), 2000)),
  ]);
  assert.ok(visited.has('CAM 1') && visited.has('Cena Espelhada'));
});
