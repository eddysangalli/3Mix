// Teste real: reconexao apos queda ABRUPTA de socket (nao um close() educado), e audio
// simultaneo com multiplos membros falando em PTTs diferentes/cruzados ao mesmo tempo
// (grupos que se sobrepoem). Servidor WS real, engine/registry/transporte REAIS.
import { createServer } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import { AudioTapRegistry } from '../../ferramentas/audio-tap-registry.mjs';
import { CrewIntercomEngine } from '../../ferramentas/crew-intercom-producao.mjs';
import { CrewIntercomWsTransport } from '../../ferramentas/crew-intercom-transport-ws.mjs';

const PORTA = 29940;
const resultados = [];
function check(nome, cond, detalhe) { resultados.push(cond); console.log((cond ? 'PASS' : 'FAIL') + ' - ' + nome + (detalhe ? ' :: ' + detalhe : '')); }

let proximoBatch = { packets: [] };
const productionFake = { async vendor(name, data) { if (data.action === 'drain') return proximoBatch; return {}; }, async optional() { return {}; } };
const registry = new AudioTapRegistry(productionFake);
const intercom = new CrewIntercomEngine(registry);
const transport = new CrewIntercomWsTransport(intercom);

const diretor = intercom.registerMember({ name: 'Diretor', sourceUuid: 'uuid-diretor', role: 'director' });
const camA = intercom.registerMember({ name: 'A', sourceUuid: 'uuid-camA', role: 'crew' });
const camB = intercom.registerMember({ name: 'B', sourceUuid: 'uuid-camB', role: 'crew' });
const repC = intercom.registerMember({ name: 'C', sourceUuid: 'uuid-repC', role: 'crew' });
const repD = intercom.registerMember({ name: 'D', sourceUuid: 'uuid-repD', role: 'crew' });
await intercom.syncRegistry();
const grupoCameras = intercom.createGroup({ name: 'Câmeras' });
const grupoReporteres = intercom.createGroup({ name: 'Repórteres' });
intercom.setMemberGroups(camA, [grupoCameras]);
intercom.setMemberGroups(camB, [grupoCameras]);
intercom.setMemberGroups(repC, [grupoReporteres]);
intercom.setMemberGroups(repD, [grupoCameras, grupoReporteres]); // D está nos DOIS grupos -- cenário de sobreposição real

const server = createServer();
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const memberId = new URL(req.url, 'http://localhost').searchParams.get('member');
  if (!intercom.members.has(memberId)) { socket.write('HTTP/1.1 404 Not Found\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => transport.attach(memberId, ws));
});
await new Promise((resolve) => server.listen(PORTA, '127.0.0.1', resolve));

function pacote(uuid, amplitude, timestampNs, rateHz = 48000, frames = 960) {
  const pcm = Buffer.alloc(frames * 4);
  for (let f = 0; f < frames; f++) pcm.writeFloatLE(amplitude, f * 4);
  return { uuid, timestamp: BigInt(timestampNs), frames, rate: rateHz, channels: 1, pcm: pcm.toString('base64') };
}
async function fluxo(pacotesDesteTick) {
  let t = Date.now() * 1e6;
  for (let i = 0; i < 15; i++) { proximoBatch = { packets: pacotesDesteTick.map((p) => pacote(p.uuid, p.amp, t)) }; await registry.drainOnce(); t += 20_000_000; }
}

// --- 1. RECONEXÃO após queda ABRUPTA (terminate(), não close()) ---
let ws1 = new WebSocket('ws://127.0.0.1:' + PORTA + '/?member=' + repC);
await new Promise((r) => ws1.once('open', r));
check('Conexão 1 de Repórter C: engine marca conectado', intercom.members.get(repC).connected === true);
ws1.terminate(); // queda abrupta real -- sem handshake de close, simula perda de rede/wifi
await new Promise((r) => setTimeout(r, 300));
check('Após queda ABRUPTA (terminate, não close): engine detecta e marca desconectado', intercom.members.get(repC).connected === false);

// Reconecta (mesmo memberId, nova conexão -- é assim que um celular reconectaria depois de perder wifi).
const ws1b = new WebSocket('ws://127.0.0.1:' + PORTA + '/?member=' + repC);
await new Promise((r) => ws1b.once('open', r));
check('Reconexão com o mesmo memberId: aceita normalmente, marca conectado de novo', intercom.members.get(repC).connected === true);
const mensagensAposReconexao = [];
ws1b.on('message', (d) => mensagensAposReconexao.push(d));
intercom.startPtt(diretor, [repC]);
await fluxo([{ uuid: 'uuid-diretor', amp: 0.6 }]);
await new Promise((r) => setTimeout(r, 200));
check('Após reconexão: volta a receber áudio real normalmente (sem precisar recriar o membro)', mensagensAposReconexao.some((d) => Buffer.isBuffer(d) && d.length > 12 && Math.abs(d.readFloatLE(12) - 0.6) < 0.05));
intercom.stopPtt(diretor);
ws1b.close();

// --- 2. ÁUDIO SIMULTÂNEO MULTI-MEMBRO: Câmera A fala pro grupo Câmeras, Repórter D (que
//    está nos dois grupos) fala pro grupo Repórteres, AO MESMO TEMPO. Câmera B (só no
//    grupo Câmeras) deve ouvir só A; Repórter C (só no grupo Repórteres) deve ouvir só D;
//    ninguém deve ouvir as duas vozes misturadas.
const wsB = new WebSocket('ws://127.0.0.1:' + PORTA + '/?member=' + camB);
const wsC2 = new WebSocket('ws://127.0.0.1:' + PORTA + '/?member=' + repC);
await Promise.all([new Promise((r) => wsB.once('open', r)), new Promise((r) => wsC2.once('open', r))]);
const recebidoB = [], recebidoC = [];
wsB.on('message', (d) => recebidoB.push(d));
wsC2.on('message', (d) => recebidoC.push(d));
intercom.startPtt(camA, [grupoCameras]);
intercom.startPtt(repD, [grupoReporteres]);
await fluxo([{ uuid: 'uuid-camA', amp: 0.3 }, { uuid: 'uuid-repD', amp: 0.5 }]);
await new Promise((r) => setTimeout(r, 200));
check('Multi-membro: Câmera B ouve a voz de A (0.3, grupo Câmeras)', recebidoB.some((d) => Buffer.isBuffer(d) && d.length > 12 && Math.abs(d.readFloatLE(12) - 0.3) < 0.05));
check('Multi-membro: Câmera B NUNCA ouve a voz de D (0.5, grupo diferente) nem a mistura (0.8)', !recebidoB.some((d) => Buffer.isBuffer(d) && d.length > 12 && (Math.abs(d.readFloatLE(12) - 0.5) < 0.05 || Math.abs(d.readFloatLE(12) - 0.8) < 0.05)));
check('Multi-membro: Repórter C ouve a voz de D (0.5, grupo Repórteres)', recebidoC.some((d) => Buffer.isBuffer(d) && d.length > 12 && Math.abs(d.readFloatLE(12) - 0.5) < 0.05));
check('Multi-membro: Repórter C NUNCA ouve a voz de A (0.3, grupo diferente) nem a mistura (0.8)', !recebidoC.some((d) => Buffer.isBuffer(d) && d.length > 12 && (Math.abs(d.readFloatLE(12) - 0.3) < 0.05 || Math.abs(d.readFloatLE(12) - 0.8) < 0.05)));
intercom.stopPtt(camA); intercom.stopPtt(repD);
wsB.close(); wsC2.close();

await server.close();
transport.close();
await intercom.close();
console.log('\nRESULTADO: ' + resultados.filter(Boolean).length + '/' + resultados.length + ' PASS');
process.exit(resultados.every(Boolean) ? 0 : 1);
