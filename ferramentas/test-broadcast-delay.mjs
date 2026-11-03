import assert from 'node:assert/strict';
import { BroadcastDelayEngine } from './broadcast-delay.mjs';

// Regras do módulo com um motor falso. A prova com pacotes reais fica em qa-dump/testar-dump-real.mjs.
const motor = (over = {}) => ({ configured: true, configured_seconds: 7, preserve: true, streaming: true, active_seconds: 7, buffered_ms: 7000, success: true, ...over });

function criar(estado, dump) {
  const p = {
    chamadas: [], incidentes: [], aplicados: [],
    async vendor(tipo, dados) {
      this.chamadas.push(tipo);
      if (tipo === 'get_destinations') return { destinations: [{ active: true, name: 'Saída 2' }, { active: false, name: 'Saída 3' }] };
      if (estado.falha) throw new Error(estado.falha);
      return dados.action === 'dump' ? dump : estado.m;
    },
    blackboxEngine: { triggerIncident: async (tipo, detalhes) => { p.incidentes.push({ tipo, detalhes }); } },
    settingsEngine: { preferences: { execute: async (_a, d) => { p.aplicados.push(d); } } }
  };
  return { p, engine: new BroadcastDelayEngine(p) };
}

let ok = 0;
const teste = async (nome, fn) => { await fn(); ok++; console.log('PASSOU ' + nome); };

await teste('DUMP real registra o descarte e o incidente', async () => {
  const { p, engine } = criar({ m: motor() }, motor({ dumped: true, discarded_packets: 900, discarded_bytes: 4200000 }));
  const r = await engine.execute('dump', { note: 'palavrão' });
  assert.deepEqual(r, { dumped: true, discardedPackets: 900, discardedBytes: 4200000, delaySeconds: 7 });
  assert.equal(engine.summary().stats.dumpCount, 1);
  assert.equal(p.incidentes[0].tipo, 'BROADCAST_DELAY_DUMP');
  assert.equal(p.incidentes[0].detalhes.note, 'palavrão');
});

await teste('Sem transmissão, DUMP falha e não registra incidente', async () => {
  const { p, engine } = criar({ m: motor({ streaming: false, active_seconds: 0 }) }, motor({ dumped: false, streaming: false, active_seconds: 0 }));
  await assert.rejects(() => engine.execute('dump'), /não há transmissão/);
  assert.equal(p.incidentes.length, 0);
  assert.equal(engine.summary().stats.dumpCount, 0);
});

await teste('Transmissão sem atraso: DUMP falha com a orientação certa', async () => {
  const { engine } = criar({ m: motor({ active_seconds: 0 }) }, motor({ dumped: false, active_seconds: 0 }));
  await assert.rejects(() => engine.execute('dump'), /começou sem atraso/);
});

await teste('Motor sem o comando: resumo indisponível e DUMP falha', async () => {
  const { engine } = criar({ falha: 'unknown request' }, null);
  await engine.refresh(true);
  const s = engine.summary();
  assert.equal(s.available, false);
  assert.equal(s.state, 'unavailable');
  assert.equal(s.canDump, false);
  await assert.rejects(() => engine.execute('dump'), /unknown request/);
});

await teste('Estados: desligado, pronto, protegido, refazendo e no ar sem atraso', async () => {
  const casos = [
    [motor({ configured: false, streaming: false, active_seconds: 0, buffered_ms: 0 }), 'off', false],
    [motor({ streaming: false, active_seconds: 0, buffered_ms: 0 }), 'ready', false],
    [motor(), 'protected', true],
    [motor({ buffered_ms: 3000 }), 'rebuilding', true],
    [motor({ active_seconds: 0, buffered_ms: 0 }), 'streaming_without_delay', false]
  ];
  for (const [m, estado, pode] of casos) {
    const { engine } = criar({ m }, null);
    await engine.refresh(true);
    const s = engine.summary();
    assert.equal(s.state, estado);
    assert.equal(s.canDump, pode);
  }
});

await teste('Saídas extras no ar aparecem como não cobertas', async () => {
  const { engine } = criar({ m: motor() }, null);
  await engine.refresh(true);
  assert.deepEqual(engine.summary().uncoveredOutputs, ['Saída 2']);
});

await teste('Configuração só com a transmissão parada e valores válidos', async () => {
  const parado = motor({ streaming: false, active_seconds: 0 });
  const { p, engine } = criar({ m: parado }, null);
  await engine.execute('delay_set', { enabled: true, seconds: 10, preserve: false });
  assert.deepEqual(p.aplicados[0], { category: 'networkOutput', streamDelayEnabled: true, streamDelaySeconds: 10, preserveDelay: false });
  await assert.rejects(() => engine.execute('delay_set', { seconds: 0 }), /de 1 a 1800/);
  await assert.rejects(() => engine.execute('delay_set', { seconds: 2.5 }), /de 1 a 1800/);
  await assert.rejects(() => engine.execute('delay_set', {}), /Informe/);

  const noAr = criar({ m: motor() }, null);
  await assert.rejects(() => noAr.engine.execute('delay_set', { seconds: 10 }), /Pare a transmissão/);
  assert.equal(noAr.p.aplicados.length, 0);
});

await teste('Ação desconhecida é recusada', async () => {
  const { engine } = criar({ m: motor() }, null);
  await assert.rejects(() => engine.execute('delay_xyz'), /não reconhecida/);
});

console.log(`TODOS OS ${ok} TESTES DE ATRASO E DUMP PASSARAM`);
