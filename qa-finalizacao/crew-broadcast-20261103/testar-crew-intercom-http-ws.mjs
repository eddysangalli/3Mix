// Teste real e isolado da integracao HTTP+WS do Crew Intercom: replica fielmente a logica
// de auth de servidor-api.mjs (mesmas funcoes) + CrewIntercomEngine/AudioTapRegistry/
// CrewIntercomWsTransport REAIS (import direto), servidor de verdade em porta de teste.
// NUNCA toca o motor do operador nem as portas reais.
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';
import { AudioTapRegistry } from '../../ferramentas/audio-tap-registry.mjs';
import { CrewIntercomEngine } from '../../ferramentas/crew-intercom-producao.mjs';
import { CrewIntercomWsTransport } from '../../ferramentas/crew-intercom-transport-ws.mjs';

const PORTA = 29930;
const local = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const sessions = new Map();
function authorized(req) { if (local(req)) return true; const c = /(?:^|;\s*)freemix_session=([A-Za-z0-9_-]+)/.exec(req.headers.cookie || ''); return !!c && sessions.get(c[1]) > Date.now(); }

let proximoBatch = { packets: [] };
const productionFake = { async vendor(name, data) { if (data.action === 'drain') return proximoBatch; return {}; }, async optional() { return {}; } };
const registry = new AudioTapRegistry(productionFake);
const intercom = new CrewIntercomEngine(registry);
const transport = new CrewIntercomWsTransport(intercom);

const server = createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const json = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
  if (u.pathname === '/api/crew/intercom') {
    if (req.method === 'GET') { if (!authorized(req)) return json(401, { success: false }); return json(200, { success: true, ...intercom.summary() }); }
    if (req.method !== 'POST') return json(405, { success: false });
    let body = ''; req.on('data', (c) => (body += c)); req.on('end', async () => {
      const d = JSON.parse(body || '{}');
      const ACOES_LOCAIS = ['register_member', 'remove_member', 'create_group', 'set_member_groups'];
      if (ACOES_LOCAIS.includes(d.action) && !local(req)) return json(403, { success: false, error: 'Cadastro só no computador do 3Mix' });
      if (!authorized(req)) return json(401, { success: false });
      if (d.action === 'register_member') { const memberId = intercom.registerMember(d); await intercom.syncRegistry(); return json(200, { success: true, memberId, ...intercom.summary() }); }
      if (d.action === 'create_group') { const groupId = intercom.createGroup(d); return json(200, { success: true, groupId, ...intercom.summary() }); }
      if (d.action === 'set_member_groups') { intercom.setMemberGroups(d.memberId, d.groupIds || []); return json(200, { success: true, ...intercom.summary() }); }
      if (d.action === 'ptt_start') { const r = intercom.startPtt(d.memberId, d.targets || []); return json(200, { success: true, ...r }); }
      if (d.action === 'ptt_stop') { intercom.stopPtt(d.memberId, d.lease); return json(200, { success: true }); }
      return json(400, { success: false });
    });
    return;
  }
  json(404, { success: false });
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
server.on('upgrade', (req, socket, head) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname !== '/api/crew/intercom/ws' || !authorized(req)) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
  const memberId = u.searchParams.get('member') || '';
  if (!intercom.members.has(memberId)) { socket.write('HTTP/1.1 404 Not Found\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => transport.attach(memberId, ws));
});

await new Promise((resolve) => server.listen(PORTA, '127.0.0.1', resolve));

const resultados = [];
function check(nome, cond, detalhe) { resultados.push(cond); console.log((cond ? 'PASS' : 'FAIL') + ' - ' + nome + (detalhe ? ' :: ' + detalhe : '')); }

// 1. Cadastro de membro: SÓ LOCAL. Requisição local (127.0.0.1) funciona.
const r1 = await fetch('http://127.0.0.1:' + PORTA + '/api/crew/intercom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'register_member', name: 'Câmera A', sourceUuid: 'uuid-camA', role: 'crew' }) });
const j1 = await r1.json();
check('register_member local: aceito, devolve memberId e resumo', r1.ok && j1.success && !!j1.memberId);
const camA = j1.memberId;

const r1b = await fetch('http://127.0.0.1:' + PORTA + '/api/crew/intercom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'register_member', name: 'Repórter C', sourceUuid: 'uuid-repC', role: 'crew' }) });
const repC = (await r1b.json()).memberId;

// 2. GET /api/crew/intercom: resumo real com os 2 membros cadastrados.
const r2 = await fetch('http://127.0.0.1:' + PORTA + '/api/crew/intercom');
const j2 = await r2.json();
check('GET /api/crew/intercom: resumo real reflete os 2 membros cadastrados', j2.membros.length === 2);

// 3. PTT via HTTP real: Câmera A inicia PTT para Repórter C.
const r3 = await fetch('http://127.0.0.1:' + PORTA + '/api/crew/intercom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ptt_start', memberId: camA, targets: [repC] }) });
const j3 = await r3.json();
check('ptt_start via HTTP real: devolve lease', r3.ok && !!j3.lease);

// 4. WebSocket de áudio real: conectar com memberId cadastrado funciona; com memberId
//    desconhecido é recusado com 404 (nunca cria membro implícito).
const wsOk = new WebSocket('ws://127.0.0.1:' + PORTA + '/api/crew/intercom/ws?member=' + repC);
const abriu = await new Promise((resolve) => { wsOk.once('open', () => resolve(true)); wsOk.once('error', () => resolve(false)); });
check('WebSocket de áudio: memberId cadastrado conecta normalmente', abriu === true);

const wsRecusado = new WebSocket('ws://127.0.0.1:' + PORTA + '/api/crew/intercom/ws?member=nao-existe');
const recusou = await new Promise((resolve) => { wsRecusado.once('open', () => resolve(false)); wsRecusado.once('error', () => resolve(true)); wsRecusado.once('unexpected-response', () => resolve(true)); });
check('WebSocket de áudio: memberId DESCONHECIDO é recusado (nunca cria membro implícito)', recusou === true);

// 5. Áudio real de ponta a ponta: HTTP cria membros+PTT, motor mock gera pacotes, cliente
//    WS real recebe o áudio mixado de verdade pela rede.
function pacotePcm(uuid, amplitude, timestampNs, rateHz = 48000, frames = 960) {
  const pcm = Buffer.alloc(frames * 4);
  for (let f = 0; f < frames; f++) pcm.writeFloatLE(amplitude, f * 4);
  return { uuid, timestamp: BigInt(timestampNs), frames, rate: rateHz, channels: 1, pcm: pcm.toString('base64') };
}
const mensagens = [];
wsOk.on('message', (data) => mensagens.push(data));
{
  let t = Date.now() * 1e6;
  for (let i = 0; i < 15; i++) { proximoBatch = { packets: [pacotePcm('uuid-camA', 0.25, t)] }; await registry.drainOnce(); t += 20_000_000; }
}
await new Promise((r) => setTimeout(r, 200));
check('Fluxo de ponta a ponta via HTTP (cadastro+PTT) + WS real (áudio): cliente recebeu dados binários reais', mensagens.some((d) => Buffer.isBuffer(d) && d.length > 12));
check('Amplitude real (0.25) presente em algum pacote recebido pela rede', mensagens.some((d) => Buffer.isBuffer(d) && d.length > 12 && Math.abs(d.readFloatLE(12) - 0.25) < 0.05));

wsOk.close(); wsRecusado.close();
await server.close();
transport.close();
await intercom.close();
console.log('\nRESULTADO: ' + resultados.filter(Boolean).length + '/' + resultados.length + ' PASS');
process.exit(resultados.every(Boolean) ? 0 : 1);
