// Teste real de InputEngine.layer() (classe de produção real, não um clone) -- o comando
// ('input_layer') já é o "atalho dinâmico de camadas" do vMix 30: já está integrado na UI
// (compor-avancado.js, caixas Ligada/Bloqueada por slot), já é oferecido como ação de
// macro (macros.js) e já está documentado (docs/API.md), tudo pelo mesmo contrato único
// -- não é uma lacuna de recurso, mas não havia teste real de unidade/integração, o mesmo
// padrão de lacuna já fechado para a proteção de ciclo do tally (3Mix PR #7).
//
// Composição injetada diretamente em this.entries (não recriada via CreateScene/
// CreateSceneItem reais): é exatamente o formato que setScope() leria de um arquivo
// freemix-inputs/<hash>.json real no disco, então o teste exercita a mesma forma de dado
// que a produção usa, sem precisar reconstruir toda a sequência de create().
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { InputEngine } from './entradas-producao.mjs';

function mockObs(sobreRequisicoes = {}) {
  const chamadas = [];
  return {
    chamadas,
    async req(type, data = {}) {
      chamadas.push({ type, data });
      if (sobreRequisicoes[type]) return sobreRequisicoes[type](data);
      if (type === 'GetSceneList') return { scenes: [{ sceneName: 'Composição 1', sceneUuid: 'uuid-comp-1' }] };
      if (type === 'GetSourceFilterKindList') return { sourceFilterKinds: [] }; // setScope() lê isso uma vez, sem relação com layer()
      if (type === 'SetSceneItemEnabled') return {};
      throw Error('Chamada inesperada no mock: ' + type + ' ' + JSON.stringify(data));
    },
  };
}

async function novoInputEngine(obs) {
  const root = await mkdtemp(join(tmpdir(), '3mix-input-layer-'));
  const production = { root, req: (type, data) => obs.req(type, data), optional: async (type, data) => { try { return await obs.req(type, data); } catch { return null; } } };
  const engine = new InputEngine(production);
  await engine.setScope('Projeto Teste'); // sem arquivo ainda: entries={} (comportamento real de 1a leitura)
  const slotId = randomUUID();
  engine.entries['uuid-comp-1'] = {
    type: 'Composition',
    composition: { layout: '2box', color: '#101820', background: 'Fundo x', slots: [
      { id: slotId, label: 'A', inputKey: 'uuid-cam1', itemId: 42, mode: 'fit', enabled: true, locked: false },
    ] },
    tags: ['Composições'],
  };
  await engine.save(); // grava de verdade -- prova que o estado persiste em disco real, não só em memória
  return { engine, root, slotId };
}

test('layer(): trava (locked=true) uma camada e persiste de verdade em disco', async () => {
  const obs = mockObs();
  const { engine, root, slotId } = await novoInputEngine(obs);
  try {
    await engine.layer({ input: 'uuid-comp-1', slot: slotId, locked: true });
    const slot = engine.entries['uuid-comp-1'].composition.slots[0];
    assert.equal(slot.locked, true);
    // Releitura real do arquivo gravado (não apenas o objeto em memória).
    const arquivo = JSON.parse(await readFile(engine.file, 'utf8'));
    assert.equal(arquivo.entries['uuid-comp-1'].composition.slots[0].locked, true, 'locked deve sobreviver a uma releitura real do disco');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('layer(): desliga (enabled=false) uma camada -- chama SetSceneItemEnabled no motor com o itemId certo, não só muda o estado local', async () => {
  const chamadasSetEnabled = [];
  const obs = mockObs({
    GetVideoSettings: () => ({ baseWidth: 1920, baseHeight: 1080 }),
    SetSceneItemEnabled: (data) => { chamadasSetEnabled.push(data); return {}; },
  });
  const { engine, root, slotId } = await novoInputEngine(obs);
  try {
    await engine.layer({ input: 'uuid-comp-1', slot: slotId, enabled: false });
    assert.equal(engine.entries['uuid-comp-1'].composition.slots[0].enabled, false);
    assert.equal(chamadasSetEnabled.length, 1);
    assert.equal(chamadasSetEnabled[0].sceneItemId, 42, 'deve usar o itemId real do slot, não um valor arbitrário');
    assert.equal(chamadasSetEnabled[0].sceneItemEnabled, false);
    assert.equal(chamadasSetEnabled[0].sceneName, 'Composição 1');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('layer(): camada/slot inexistente é rejeitado explicitamente, nunca silenciosamente ignorado', async () => {
  const obs = mockObs();
  const { engine, root } = await novoInputEngine(obs);
  try {
    await assert.rejects(engine.layer({ input: 'uuid-comp-1', slot: 'slot-que-nao-existe', locked: true }), /Camada não encontrada/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('layer(): entrada sem composição (cena simples) é rejeitada, não tenta tratar como se tivesse slots', async () => {
  const obs = mockObs({ GetSceneList: () => ({ scenes: [{ sceneName: 'Cena Simples', sceneUuid: 'uuid-simples' }] }) });
  const { engine, root } = await novoInputEngine(obs);
  try {
    await assert.rejects(engine.layer({ input: 'uuid-simples', slot: 'qualquer', locked: true }), /Camada não encontrada/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('layer(): valor não-booleano para locked/enabled é rejeitado antes de MUTAR o motor (a cena ainda é resolvida para achar o slot, mas nenhum SetSceneItemEnabled ocorre)', async () => {
  const obs = mockObs();
  const { engine, root, slotId } = await novoInputEngine(obs);
  try {
    await assert.rejects(engine.layer({ input: 'uuid-comp-1', slot: slotId, locked: 'sim' }), /Estado inválido/);
    assert.ok(!obs.chamadas.some((c) => c.type === 'SetSceneItemEnabled'), 'nenhuma mutação real no motor deve ocorrer quando a validação do payload falha');
    assert.equal(engine.entries['uuid-comp-1'].composition.slots[0].locked, false, 'estado local também não deve ter sido alterado');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('layer(): falha ao salvar em disco desfaz a mudança no motor (SetSceneItemEnabled é revertido) -- nunca um estado onde a UI mostra uma coisa e o motor mostra outra', async () => {
  const chamadasSetEnabled = [];
  const obs = mockObs({
    GetVideoSettings: () => ({ baseWidth: 1920, baseHeight: 1080 }),
    SetSceneItemEnabled: (data) => { chamadasSetEnabled.push(data); return {}; },
  });
  const { engine, root, slotId } = await novoInputEngine(obs);
  try {
    // Quebra save() depois do setup inicial (que já gravou com sucesso em novoInputEngine).
    engine.save = async () => { throw Error('Disco cheio (simulado)'); };
    await assert.rejects(engine.layer({ input: 'uuid-comp-1', slot: slotId, enabled: false }), /Disco cheio/);
    assert.equal(engine.entries['uuid-comp-1'].composition.slots[0].enabled, true, 'estado em memória deve voltar ao original após falha ao salvar');
    assert.equal(chamadasSetEnabled.length, 2, 'deve ter revertido a chamada ao motor (desligou, depois religou de volta)');
    assert.equal(chamadasSetEnabled[1].sceneItemEnabled, true, 'a reversão deve religar exatamente o que foi desligado');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('layer(): mudar locked e enabled juntos aplica os dois -- não é um campo "ou outro"', async () => {
  const obs = mockObs({ GetVideoSettings: () => ({ baseWidth: 1920, baseHeight: 1080 }) });
  const { engine, root, slotId } = await novoInputEngine(obs);
  try {
    await engine.layer({ input: 'uuid-comp-1', slot: slotId, locked: true, enabled: false });
    const slot = engine.entries['uuid-comp-1'].composition.slots[0];
    assert.equal(slot.locked, true);
    assert.equal(slot.enabled, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
