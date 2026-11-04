// Teste real e isolado do novo item 'crew' do Pre-Flight (ferramentas/preflight-producao.mjs)
// — PreflightEngine REAL (import direto), CrewTallyEngine/AudioTapRegistry/CrewIntercomEngine
// REAIS (import direto), anexados em `production` exatamente como servidor-api.mjs faz.
// Nunca toca o motor do operador: production é sintética, call_audio nunca é chamado de
// verdade (vendor() do mock só registra a chamada, não fala com nenhum processo externo).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PreflightEngine } from '../../ferramentas/preflight-producao.mjs';
import { CrewTallyEngine } from '../../ferramentas/crew-tally-producao.mjs';
import { AudioTapRegistry } from '../../ferramentas/audio-tap-registry.mjs';
import { CrewIntercomEngine } from '../../ferramentas/crew-intercom-producao.mjs';

const checks = [];
const check = (s) => checks.push(s);
const root = await mkdtemp(join(tmpdir(), 'FreeMix-QA-Preflight-Crew-'));

function novaProduction() {
  const camKey = randomUUID();
  const p = {
    root,
    state: {
      connected: true, program: 'CAM 1', preview: 'CAM 2',
      inputs: [{ key: camKey, name: 'CAM 1', number: 1, health: {} }],
      tally: { program: ['CAM 1'], preview: [] },
    },
    mixEffects: { async read() { return { mixes: [] }; } },
    signalRegistry: { async meTally() { return {}; } },
    async vendor(name, data) {
      if (name === 'call_audio' && data.action === 'drain') return { packets: [] };
      return {};
    },
    async optional() { return {}; },
    callEngine: { returns: { timer: null } }, // Calls inativo por padrão neste teste
  };
  return { p, camKey };
}

// --- caso 1: módulo Crew não carregado nesta instância (ex.: painel sem o módulo ativo) ---
{
  const { p } = novaProduction();
  const pre = new PreflightEngine(p);
  const r = await pre.runCheck({ item: 'crew' });
  const i = r.itens[0];
  assert.equal(i.nivel, 'NÃO VERIFICADO');
  assert.match(i.valor, /não carregado/);
  check('Sem crewTally/crewIntercom anexados: NÃO VERIFICADO explícito, nunca fabricando PASS');
}

// --- caso 2: Crew carregado, tally coerente, nenhum membro do intercom, Calls inativo ---
{
  const { p, camKey } = novaProduction();
  p.crewTally = new CrewTallyEngine(p);
  const registry = new AudioTapRegistry(p);
  p.crewIntercom = new CrewIntercomEngine(registry);
  const pre = new PreflightEngine(p);
  const r = await pre.runCheck({ item: 'crew' });
  const i = r.itens[0];
  assert.equal(i.nivel, 'APROVADO');
  assert.match(i.valor, /Tally ok/);
  assert.match(i.valor, /0\/0 membro/);
  assert.match(i.valor, /não verificado \(exige motor ao vivo/);
  check('Crew carregado, tally coerente (1 entrada com estado real PROGRAM), sem colisão: APROVADO — e a ressalva de hardware/latência aparece sempre, sem baixar o nível');
  await p.crewIntercom.close();
}

// --- caso 3: membro do intercom registrado e conectado, ainda sem colisão com Calls ---
{
  const { p, camKey } = novaProduction();
  p.crewTally = new CrewTallyEngine(p);
  const registry = new AudioTapRegistry(p);
  p.crewIntercom = new CrewIntercomEngine(registry);
  const memberId = p.crewIntercom.registerMember({ name: 'Operador de Câmera 1', sourceUuid: randomUUID() });
  p.crewIntercom.heartbeat(memberId);
  await p.crewIntercom.syncRegistry();
  const pre = new PreflightEngine(p);
  const r = await pre.runCheck({ item: 'crew' });
  const i = r.itens[0];
  assert.equal(i.nivel, 'APROVADO');
  assert.match(i.valor, /1\/1 membro/);
  check('Membro real registrado+conectado via syncRegistry real (reivindicou a fonte no AudioTapRegistry de verdade): reflete 1/1, ainda APROVADO sem Calls ativo');
  await p.crewIntercom.close();
}

// --- caso 4: a colisão REAL documentada no código — Calls ativo (timer) + Crew com fonte
// reivindicada no registry ao mesmo tempo. Isto é o ponto central do item do superprompt
// ("isolamento do PGM... teste negativo obrigatório") — aqui é a parte estática/config.
{
  const { p } = novaProduction();
  p.crewTally = new CrewTallyEngine(p);
  const registry = new AudioTapRegistry(p);
  p.crewIntercom = new CrewIntercomEngine(registry);
  const memberId = p.crewIntercom.registerMember({ name: 'Repórter Externa', sourceUuid: randomUUID() });
  await p.crewIntercom.syncRegistry();
  p.callEngine.returns.timer = setInterval(() => {}, 1000); // simula Calls ativo de verdade (mesmo campo real)
  try {
    const pre = new PreflightEngine(p);
    const r = await pre.runCheck({ item: 'crew' });
    const i = r.itens[0];
    assert.equal(i.nivel, 'BLOQUEIO');
    assert.match(i.valor, /disputando a mesma captura/);
    assert.match(i.motivo, /call_audio fora do AudioTapRegistry/);
    assert.ok(i.acao?.length > 0, 'deveria ter uma ação sugerida');
    assert.equal(r.veredito, 'BLOQUEIO', 'o veredito GERAL do Pre-Flight deveria bloquear também');
    check('Calls ativo (timer real) + Crew Intercom com fonte reivindicada no registry real ao mesmo tempo: BLOQUEIO real, com motivo e ação — não um aviso brando, a colisão é real (recurso nativo exclusivo)');
  } finally {
    clearInterval(p.callEngine.returns.timer);
    await p.crewIntercom.close();
  }
}

// --- caso 5: Calls ativo MAS Crew sem nenhuma fonte reivindicada (ex.: Crew carregado mas
// ninguém conectado ainda) — não deveria bloquear, porque não há disputa de verdade ainda.
{
  const { p } = novaProduction();
  p.crewTally = new CrewTallyEngine(p);
  const registry = new AudioTapRegistry(p);
  p.crewIntercom = new CrewIntercomEngine(registry);
  p.callEngine.returns.timer = setInterval(() => {}, 1000);
  try {
    const pre = new PreflightEngine(p);
    const r = await pre.runCheck({ item: 'crew' });
    const i = r.itens[0];
    assert.notEqual(i.nivel, 'BLOQUEIO');
    check('Calls ativo mas Crew Intercom SEM nenhum membro reivindicado: não bloqueia à toa — só bloqueia quando a disputa é real (ambos os lados ativos de verdade)');
  } finally {
    clearInterval(p.callEngine.returns.timer);
    await p.crewIntercom.close();
  }
}

// --- caso 6: tally incoerente — entrada sem nenhum estado de destino (ex.: tally não
// respondeu para aquele input) deveria rebaixar para ATENÇÃO, não esconder o problema ---
{
  const { p } = novaProduction();
  p.state.inputs.push({ key: randomUUID(), name: 'CAM Sem Tally', number: 99, health: {} });
  p.crewTally = { async summary() { return { conectado: true, destinosDisponiveis: ['MAIN'], entradas: [{ key: 'x', name: 'CAM Sem Tally', number: 99, destinos: {}, resumo: null }] }; } };
  const pre = new PreflightEngine(p);
  const r = await pre.runCheck({ item: 'crew' });
  const i = r.itens[0];
  assert.equal(i.nivel, 'ATENÇÃO');
  assert.match(i.valor, /Tally sem estado/);
  check('Tally com entrada sem resumo (estado incoerente/não lido): ATENÇÃO real, não escondido atrás de um "ok" genérico');
}

console.log('PASS — ' + checks.length + ' verificações:');
for (const c of checks) console.log('  - ' + c);
