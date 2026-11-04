// Teste real e isolado do CrewIntercomWsTransport (classe REAL) + CrewIntercomEngine REAL +
// AudioTapRegistry REAL + servidor WebSocket de verdade (porta de teste, nunca a real).
// Confirma: entrega binaria real por socket, desconexao marca o membro como desconectado
// no engine, e mensagens do cliente NUNCA sao processadas (garantia no nivel do protocolo).
import { createServer } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import { AudioTapRegistry } from '../../ferramentas/audio-tap-registry.mjs';
import { CrewIntercomEngine } from '../../ferramentas/crew-intercom-producao.mjs';
import { CrewIntercomWsTransport } from '../../ferramentas/crew-intercom-transport-ws.mjs';

const PORTA = 29920;
const resultados = [];
function check(nome, cond, detalhe) { resultados.push(cond); console.log((cond ? 'PASS' : 'FAIL') + ' - ' + nome + (detalhe ? ' :: ' + detalhe : '')); }

let proximoBatch = { packets: [] };
const productionFake = { async vendor(name, data) { if (data.action === 'drain') return proximoBatch; return {}; }, async optional() { return {}; } };
const registry = new AudioTapRegistry(productionFake);
const intercom = new CrewIntercomEngine(registry);
const transport = new CrewIntercomWsTransport(intercom);

const camA = intercom.registerMember({ name: 'A', sourceUuid: 'uuid-camA', role: 'crew' });
const repC = intercom.registerMember({ name: 'C', sourceUuid: 'uuid-repC', role: 'crew' });
await intercom.syncRegistry();

const server = createServer();
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const memberId = new URL(req.url, 'http://localhost').searchParams.get('member');
  wss.handleUpgrade(req, socket, head, (ws) => transport.attach(memberId, ws));
});
await new Promise((resolve) => server.listen(PORTA, '127.0.0.1', resolve));

function pacote(uuid, amplitude, timestampNs, rateHz = 48000, frames = 480) {
  const pcm = Buffer.alloc(frames * 4);
  for (let f = 0; f < frames; f++) pcm.writeFloatLE(amplitude, f * 4);
  return { uuid, timestamp: BigInt(timestampNs), frames, rate: rateHz, channels: 1, pcm: pcm.toString('base64') };
}

const clienteC = new WebSocket('ws://127.0.0.1:' + PORTA + '/?member=' + repC);
await new Promise((resolve) => clienteC.once('open', resolve));

// 1. Câmera A fala para Repórter C -- o cliente real conectado via socket deve receber
//    dados BINÁRIOS reais pela rede (não um mock chamando uma função, um socket de verdade).
// Acumula TODAS as mensagens do fluxo (os primeiros pacotes do fluxo real costumam ter
// amplitude 0 até a janela de alinhamento temporal "pegar o ritmo" — mesmo comportamento
// já visto e explicado no teste do engine; aqui confirmamos que ALGUMA mensagem real
// trafegada pela rede tem o valor certo, não assumindo que é a primeira).
const mensagensRecebidas = [];
clienteC.on('message', (data) => mensagensRecebidas.push(data));
intercom.startPtt(camA, [repC]);
{
  let t = Date.now() * 1e6;
  for (let i = 0; i < 15; i++) { proximoBatch = { packets: [pacote('uuid-camA', 0.3, t, 48000, 960)] }; await registry.drainOnce(); t += 20_000_000; }
}
await new Promise((r) => setTimeout(r, 200)); // tempo para as mensagens chegarem pela rede real
check('Transporte WS real: cliente conectado via socket de verdade recebeu dados binários', mensagensRecebidas.some((d) => Buffer.isBuffer(d) && d.length > 12));
check('Em algum dado binário recebido pela rede real, a amplitude é a esperada (0.3)', mensagensRecebidas.some((d) => Buffer.isBuffer(d) && d.length > 12 && Math.abs(d.readFloatLE(12) - 0.3) < 0.05));
intercom.stopPtt(camA);
await new Promise((r) => setTimeout(r, 200)); // esvazia qualquer mensagem de PTT ainda em trânsito antes do teste 2

// 2. Mensagem do cliente para o servidor NUNCA é processada (mesma garantia do Tally).
mensagensRecebidas.length = 0;
clienteC.send(JSON.stringify({ action: 'ptt_start', targets: ['qualquer'] })); // tentativa de comando pelo canal errado
await new Promise((r) => setTimeout(r, 300));
check('Mensagem do cliente pelo canal de áudio NUNCA é processada (transporte é somente saída)', mensagensRecebidas.length === 0);

// 3. Desconexão real: fechar o socket deve marcar o membro como desconectado no ENGINE
//    (não só fechar a conexão TCP) -- confirma que transporte e engine estão de fato
//    conectados via o evento de close, não só "deveria funcionar".
check('Antes de desconectar: membro aparece conectado no engine', intercom.members.get(repC).connected === true);
clienteC.close();
await new Promise((r) => setTimeout(r, 300));
check('Após desconexão real do socket: engine marca o membro como desconectado', intercom.members.get(repC).connected === false);

await server.close();
transport.close();
await intercom.close();
console.log('\nRESULTADO: ' + resultados.filter(Boolean).length + '/' + resultados.length + ' PASS');
process.exit(resultados.every(Boolean) ? 0 : 1);
