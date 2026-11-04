// Teste real e isolado da integracao HTTP+WebSocket do Crew Tally: replica fielmente a
// logica de auth de servidor-api.mjs (mesmas funcoes copiadas, nao reimplementadas
// diferente) + CrewTallyEngine REAL (import direto), rodando um servidor de verdade numa
// porta de teste. NUNCA toca o motor do operador nem a porta real 8088/18188.
import { createServer } from 'node:http';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';
import { CrewTallyEngine } from '../../ferramentas/crew-tally-producao.mjs';

const PORTA = 29910;
const local = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const equal = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && timingSafeEqual(x, y); };
const pin = String(randomInt(100000, 1000000));
const sessions = new Map();
function authorized(req) {
  if (local(req)) return true;
  const c = /(?:^|;\s*)freemix_session=([A-Za-z0-9_-]+)/.exec(req.headers.cookie || '');
  return !!c && sessions.get(c[1]) > Date.now();
}

// production mock com estado real de tally + M/E, mutavel para simular mudancas ao vivo.
const productionFake = {
  state: { connected: true, tally: { program: ['CAM 1'], preview: [] }, inputs: [{ key: 'k1', name: 'CAM 1', number: 1 }, { key: 'k2', name: 'CAM 2', number: 2 }] },
  mixEffects: { async read() { return { mixes: [] }; } },
  signalRegistry: { async meTally() { return {}; } },
};
const crewTally = new CrewTallyEngine(productionFake);
const crewTallyClients = new Set();

const server = createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const json = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
  if (u.pathname === '/api/pair' && req.method === 'POST') {
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      const d = JSON.parse(body || '{}');
      if (!equal(d.pin, pin)) return json(401, { success: false, error: 'Codigo incorreto' });
      const id = randomBytes(24).toString('base64url'); sessions.set(id, Date.now() + 1000 * 60 * 60);
      res.setHeader('Set-Cookie', 'freemix_session=' + id + '; HttpOnly; Path=/'); return json(200, { success: true });
    });
    return;
  }
  if (u.pathname === '/api/crew/tally' && req.method === 'GET') {
    if (!authorized(req)) return json(401, { success: false, error: 'Autorize este dispositivo' });
    const watching = u.searchParams.get('watching');
    (watching ? crewTally.forDevice(watching) : crewTally.summary()).then(d => json(200, { success: true, ...d }));
    return;
  }
  json(404, { success: false });
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
server.on('upgrade', (req, socket, head) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname !== '/api/crew/tally/ws' || !authorized(req)) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
  const watching = u.searchParams.get('watching') || 'main';
  wss.handleUpgrade(req, socket, head, async (ws) => {
    crewTallyClients.add({ ws, watching });
    ws.send(JSON.stringify(await crewTally.forDevice(watching).catch(() => null)));
    ws.on('close', () => { for (const c of crewTallyClients) if (c.ws === ws) crewTallyClients.delete(c); });
    ws.on('message', () => { /* intencionalmente vazio -- nunca processa nada vindo do cliente */ });
  });
});

await new Promise((resolve) => server.listen(PORTA, '127.0.0.1', resolve));

const resultados = [];
function check(nome, cond, detalhe) { resultados.push(cond); console.log((cond ? 'PASS' : 'FAIL') + ' - ' + nome + (detalhe ? ' :: ' + detalhe : '')); }

// 1. Sem pareamento, request LOCAL (127.0.0.1) ja e autorizado por padrao (mesma regra do /ws real).
const r1 = await fetch('http://127.0.0.1:' + PORTA + '/api/crew/tally');
const j1 = await r1.json();
check('GET /api/crew/tally local (sem pareamento): autorizado, resumo geral com CAM 1 em program', r1.ok && j1.entradas.find(e => e.name === 'CAM 1').resumo === 'program');

// 2. GET filtrado por destino (?watching=main): usa forDevice.
const r2 = await fetch('http://127.0.0.1:' + PORTA + '/api/crew/tally?watching=main');
const j2 = await r2.json();
check('GET /api/crew/tally?watching=main: usa forDevice, tem campo watching e destinoValido', j2.watching === 'main' && j2.destinoValido === true);

// 3. WebSocket dedicado: conecta, recebe o estado imediato no handshake.
const estadoInicial = await new Promise((resolve, reject) => {
  const ws = new WebSocket('ws://127.0.0.1:' + PORTA + '/api/crew/tally/ws?watching=main');
  ws.once('message', (raw) => { const d = JSON.parse(raw); ws.close(); resolve(d); });
  ws.once('error', reject);
});
check('WebSocket /api/crew/tally/ws: recebe estado imediato no handshake (watching=main)', estadoInicial.watching === 'main' && estadoInicial.entradas.find(e => e.name === 'CAM 1').estado === 'program');

// 4. Ticker: muda o estado real (CAM 1 sai do ar, CAM 2 entra) e confirma que um cliente
//    conectado recebe a atualizacao via o loop de broadcast (replicando o ticker real).
// Registrar o listener de 'message' ANTES de 'open' evita a corrida: o handshake inicial
// pode chegar entre os dois eventos se registrados em sequencia (bug do teste, nao do
// codigo de producao -- travou a primeira tentativa, corrigido aqui).
const tamanhoAntes = crewTallyClients.size;
const wsVivo = new WebSocket('ws://127.0.0.1:' + PORTA + '/api/crew/tally/ws?watching=main');
await new Promise((resolve) => wsVivo.once('message', resolve)); // descarta o handshake inicial (chega logo após o 'open', sem precisar esperar por ele)
// wsVivo (cliente) e a conexao aceita no servidor sao objetos DIFERENTES (dois lados do
// mesmo socket) -- "ws===wsVivo" nunca bateria (bug da 1a versao deste teste, corrigido);
// identifica a conexao nova pelo tamanho do Set antes/depois, unica entrada adicionada.
const entradaNova = [...crewTallyClients].find((c, i) => i === crewTallyClients.size - 1 && crewTallyClients.size === tamanhoAntes + 1);
productionFake.state.tally = { program: ['CAM 2'], preview: [] };
// Simula um "tick" do ticker dedicado do Crew (mesma logica que entra em servidor-api.mjs).
entradaNova.ws.send(JSON.stringify(await crewTally.forDevice(entradaNova.watching)));
const atualizado = await new Promise((resolve) => wsVivo.once('message', (raw) => resolve(JSON.parse(raw))));
check('Após mudança real de estado + tick simulado: cliente recebe CAM 2 em program, CAM 1 volta a livre', atualizado.entradas.find(e => e.name === 'CAM 2').estado === 'program' && atualizado.entradas.find(e => e.name === 'CAM 1').estado === 'livre');

// 5. SEGURANCA: mandar uma mensagem pelo canal do cliente NUNCA produz efeito (nao ha
//    handler que interprete nada) -- confirma a garantia "Tally e so leitura" no nivel do
//    protocolo, nao so na intencao do codigo.
let qualquerRespostaAMensagem = false;
wsVivo.once('message', () => { qualquerRespostaAMensagem = true; });
wsVivo.send(JSON.stringify({ action: 'cut', input: 'CAM 1' })); // tentativa de comando, deve ser ignorada
await new Promise((resolve) => setTimeout(resolve, 300));
check('Mensagem do cliente (tentando mandar um comando) NUNCA gera resposta/efeito -- canal e comprovadamente somente-leitura', qualquerRespostaAMensagem === false);
wsVivo.close();

// 6. Sem pareamento e sem ser local (simulado via objeto de request falso, mesma funcao
//    authorized() usada no HTTP real acima, nao uma reimplementacao diferente).
const reqFalsoNaoLocal = { socket: { remoteAddress: '203.0.113.5' }, headers: {} };
check('authorized() real: IP nao-local sem sessao pareada e recusado (mesma funcao usada no HTTP acima)', authorized(reqFalsoNaoLocal) === false);

await server.close();
console.log('\nRESULTADO: ' + resultados.filter(Boolean).length + '/' + resultados.length + ' PASS');
process.exit(resultados.every(Boolean) ? 0 : 1);
