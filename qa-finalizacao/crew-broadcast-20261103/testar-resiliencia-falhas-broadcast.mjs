import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import {
  mapaMultiCorder,
  estimativaMultiCorder
} from '../../ferramentas/disco-producao.mjs';
import { AudioTapRegistry } from '../../ferramentas/audio-tap-registry.mjs';
import { CrewIntercomEngine } from '../../ferramentas/crew-intercom-producao.mjs';
import { PreflightEngine, NIVEL } from '../../ferramentas/preflight-producao.mjs';

test('Suíte Consolidada de Testes de Falha e Resiliência Broadcast', async (t) => {

  await t.test('1. Falha e Saturação de Armazenamento', async () => {
    // 1.1 Disco crítico (< 5GB)
    const mockDiskCritico = async () => ({ supported: true, freeGb: 3.2, totalGb: 500, estRecordingHours: 0.5, severity: 'CRITICAL' });
    const prodFake = {
      root: '.',
      req: async (tipo) => {
        if (tipo === 'GetRecordDirectory') return { recordDirectory: process.cwd() };
        if (tipo === 'GetStats') return { activeFps: 60 };
        return {};
      },
      state: { connected: true, program: 'CAM 1', inputs: [{ key: '1', name: 'CAM 1', health: { sources: [{ video: true, width: 1920, height: 1080 }] } }] }
    };
    const preflight = new PreflightEngine(prodFake, { disco: mockDiskCritico });
    const itemGrav = await preflight.verificar('gravacao', { modo: 'leve' });
    assert.equal(itemGrav.nivel, NIVEL.BLOQUEIO, 'Disco crítico deve gerar BLOQUEIO operacional');
    assert.ok(itemGrav.motivo.includes('Disco quase cheio'), 'Deve conter motivo acionável');

    // 1.2 Estimativa com saturação de espaço para múltiplas câmeras
    const est = estimativaMultiCorder({ format: 'mxf', camsCount: 4, broadcastProfile: 'dnxhd_220', freeGb: 20 });
    assert.equal(est.severity, 'CRITICAL', 'Pouco espaço para 4 câmeras broadcast deve marcar CRITICAL');
    assert.ok(est.estHoursRemaining < 1.0, 'Tempo restante deve ser menor que 1h');

    // 1.3 Colisão física entre câmeras no mesmo volume
    const porNome = { 'CAM 1': 'C:\\Gravacoes\\CAM1', 'CAM 2': 'C:\\Gravacoes\\CAM2' };
    const mapa = await mapaMultiCorder(porNome);
    if (mapa.entradas.every(e => e.disco.supported)) {
      assert.ok(mapa.colisoes.length > 0, 'Deve detectar colisão quando duas câmeras gravam no mesmo disco físico');
    }
  });

  await t.test('2. Falha de Barramento e Isolamento PGM vs Crew', async () => {
    let proximoBatch = { packets: [] };
    const fakeProd = {
      root: '.',
      vendor: async (nome, data) => {
        if (data.action === 'drain') return proximoBatch;
        return { responseData: { success: true } };
      },
      optional: async () => ({})
    };
    const registry = new AudioTapRegistry(fakeProd);

    // 2.1 Reivindicação concorrente: Calls e Crew
    await registry.claim('calls', ['uuid-call-1']);
    await registry.claim('crew', ['uuid-cam-1']);
    assert.deepEqual([...registry.configured].sort(), ['uuid-call-1', 'uuid-cam-1'].sort());

    // 2.2 Isolamento de pacotes: pacotes de Calls não chegam no listener do Crew
    proximoBatch = { packets: [{ uuid: 'uuid-call-1', frames: 10 }] };
    let pacotesCrew = null;
    let pacotesCalls = null;
    registry.on('packets', (consumidor, pacotes) => {
      if (consumidor === 'crew') pacotesCrew = pacotes;
      if (consumidor === 'calls') pacotesCalls = pacotes;
    });

    await registry.drainOnce();

    assert.ok(pacotesCalls, 'Calls deve receber seu próprio pacote');
    assert.equal(pacotesCrew, null, 'Crew NUNCA deve receber pacotes de Calls');

    // 2.3 Preflight detecta colisão de recursos nativos exclusivos
    const prodColisao = {
      root: '.',
      req: async () => ({}),
      vendor: async () => ({ responseData: { success: true } }),
      optional: async () => ({}),
      state: {
        connected: true,
        program: 'CAM 1',
        inputs: [{ key: '1', name: 'CAM 1', health: { sources: [{ video: true, width: 1920, height: 1080 }] } }],
        tally: { program: ['CAM 1'], preview: [] }
      },
      crewTally: { summary: async () => ({ entradas: [{ name: 'CAM 1', resumo: 'PROGRAM' }] }) },
      crewIntercom: {
        summary: () => ({ membros: [{ id: 'c1', name: 'CAM 1', connected: true }], pttAtivos: [] }),
        registry: registry
      },
      callEngine: { returns: { timer: 12345 } } // Calls ativo ao mesmo tempo
    };

    const pf = new PreflightEngine(prodColisao);
    const itemCrew = await pf.verificar('crew', { modo: 'leve' });
    assert.equal(itemCrew.nivel, NIVEL.BLOQUEIO, 'Calls ativo + Crew disputando o registry deve gerar BLOQUEIO');
    assert.ok(itemCrew.motivo.includes('disputam') || itemCrew.motivo.includes('captura'), 'Motivo deve citar disputa de áudio');
  });

  await t.test('3. Watchdog e Expiração Automática de PTT sob Queda de Conexão', async () => {
    const fakeProd = {
      vendor: async () => ({ responseData: { success: true } })
    };
    const registry = new AudioTapRegistry(fakeProd);
    const intercom = new CrewIntercomEngine(registry);
    intercom.registerMember({ memberId: 'cam1', name: 'Cinegrafista 1', role: 'crew', sourceUuid: 'uuid-cam-1' });
    intercom.registerMember({ memberId: 'dir', name: 'Diretor', role: 'director', sourceUuid: 'uuid-dir-1' });

    // Dispara PTT do diretor
    const lease = intercom.startPtt('dir', ['cam1']);
    assert.ok(lease, 'Lease de PTT deve ser concedida');
    assert.equal(intercom.summary().pttAtivos.length, 1, 'Deve haver 1 PTT ativo');

    // Simula expiração temporal por timeout (passando o tempo do TTL)
    intercom.activePtt.get('dir').expiresAt = Date.now() - 10;
    intercom.expirePtt();

    // Watchdog deve ter revogado a fala automaticamente
    assert.equal(intercom.summary().pttAtivos.length, 0, 'PTT deve ter sido revogado automaticamente pelo watchdog');
    await intercom.close();
  });

  await t.test('4. Resiliência de WebSocket e Desconexão Abrupta', async () => {
    const srv = createServer();
    const wss = new WebSocketServer({ server: srv });
    let conectado = false;
    let desconectado = false;

    wss.on('connection', (ws) => {
      conectado = true;
      ws.on('close', () => {
        desconectado = true;
      });
    });

    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const porta = srv.address().port;

    const wsClient = new WebSocket(`ws://127.0.0.1:${porta}`);
    await new Promise(r => wsClient.on('open', r));
    assert.ok(conectado, 'Conexão inicial estabelecida');

    // Encerramento abrupto pelo cliente
    wsClient.terminate();
    await new Promise(r => setTimeout(r, 100));

    assert.ok(desconectado, 'Servidor deve detectar a desconexão abrupta imediatamente sem travar');
    await new Promise(r => srv.close(r));
  });

  await t.test('5. Validação Defensiva de Pareamento e Injeção', () => {
    const regexValido = /^[\w.-]{1,40}$/;
    
    // Casos legítimos
    assert.ok(regexValido.test('cam-1'));
    assert.ok(regexValido.test('membro_diretor.2'));

    // Tentativas de ataque / injeção
    assert.equal(regexValido.test('<script>alert(1)</script>'), false);
    assert.equal(regexValido.test('cam/../etc/passwd'), false);
    assert.equal(regexValido.test('a'.repeat(41)), false); // Overflow
    assert.equal(regexValido.test(''), false); // Vazio
  });

});
