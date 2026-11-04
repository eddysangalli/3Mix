// QA-only: serve os arquivos REAIS de painel/remoto/crew.html+crew.js (nunca uma cópia) e
// um backend Tally+Intercom REAL (CrewTallyEngine/AudioTapRegistry/CrewIntercomEngine
// reais, import direto) com um production mock gerando tally+áudio sintéticos para
// verificação visual no browser. Nunca toca o motor do operador nem a porta real 8088.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, extname } from 'node:path';
import { networkInterfaces } from 'node:os';
import { randomInt } from 'node:crypto';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { CrewTallyEngine } from '../../ferramentas/crew-tally-producao.mjs';
import { AudioTapRegistry } from '../../ferramentas/audio-tap-registry.mjs';
import { CrewIntercomEngine } from '../../ferramentas/crew-intercom-producao.mjs';
import { CrewIntercomWsTransport } from '../../ferramentas/crew-intercom-transport-ws.mjs';

const PANEL = fileURLToPath(new URL('../../painel/remoto/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

let proximoBatch = { packets: [] };
const productionFake = {
  state: { connected: true, tally: { program: ['CAM 1'], preview: ['CAM 2'] }, inputs: [{ key: 'k1', name: 'CAM 1', number: 1 }, { key: 'k2', name: 'CAM 2', number: 2 }, { key: 'k3', name: 'CAM 3', number: 3 }] },
  mixEffects: { async read() { return { mixes: [] }; } },
  signalRegistry: { async meTally() { return {}; } },
  async vendor(name, data) { if (data.action === 'drain') return proximoBatch; return {}; },
  async optional() { return {}; },
};
const crewTally = new CrewTallyEngine(productionFake);
const registry = new AudioTapRegistry(productionFake);
const crewIntercom = new CrewIntercomEngine(registry);
const transport = new CrewIntercomWsTransport(crewIntercom);

const diretor = crewIntercom.registerMember({ name: 'Diretor', sourceUuid: 'uuid-diretor', role: 'director' });
const camA = crewIntercom.registerMember({ name: 'Câmera A', sourceUuid: 'uuid-camA', role: 'crew' });
const camB = crewIntercom.registerMember({ name: 'Câmera B', sourceUuid: 'uuid-camB', role: 'crew' });
await crewIntercom.syncRegistry();
const grupoCameras = crewIntercom.createGroup({ name: 'Câmeras' });
crewIntercom.setMemberGroups(camA, [grupoCameras]);
crewIntercom.setMemberGroups(camB, [grupoCameras]);
console.log('Membros de teste: diretor=' + diretor + ' camA=' + camA + ' camB=' + camB);

export async function startHarness(port) {
  // Pareamento/QR do harness: mesma lógica (não cópia simplificada) de qrPermitido() e
  // /api/access em servidor-api.mjs, incluindo a regra de `?member=` só em /crew — para
  // testar o QR dedicado da página real com membros reais já cadastrados acima, coisa que
  // o resto deste harness não exercita.
  const pin = String(randomInt(100000, 1000000));
  const ips = () => Object.values(networkInterfaces()).flat().filter((i) => i.family === 'IPv4' && !i.internal).map((i) => i.address);
  function qrPermitido(address) {
    try { const a = new URL(address); const searchOk = !a.search || (a.pathname === '/crew' && /^\?member=[\w.-]{1,40}$/.test(a.search)); return a.protocol === 'http:' && ips().includes(a.hostname) && a.port === String(port) && searchOk && !a.hash && (a.pathname === '/' || a.pathname === '/crew'); }
    catch { return false; }
  }
  const server = createServer(async (req, res) => {
    const u = new URL(req.url, 'http://localhost');
    const json = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    if (u.pathname === '/api/access') { return json(200, { pin, expires: 'ao fechar o 3Mix', urls: ips().map((ip) => `http://${ip}:${port}/`), redes: Object.entries(networkInterfaces()).flatMap(([nome, lista]) => lista.filter((i) => i.family === 'IPv4' && !i.internal).map((i) => ({ nome: nome.trim().slice(0, 30), url: `http://${i.address}:${port}/` }))) }); }
    if (u.pathname === '/api/qr.svg') { const address = u.searchParams.get('address'); if (!qrPermitido(address)) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, error: 'Endereço de QR inválido' })); return; } res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(await QRCode.toString(address, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 })); return; }
    if (u.pathname === '/api/crew/tally') { const watching = u.searchParams.get('watching'); return json(200, { success: true, ...(watching ? await crewTally.forDevice(watching) : await crewTally.summary()) }); }
    if (u.pathname === '/api/crew/intercom') {
      if (req.method === 'GET') return json(200, { success: true, ...crewIntercom.summary() });
      let body = ''; for await (const c of req) body += c;
      const d = JSON.parse(body || '{}');
      try {
        if (d.action === 'ptt_start') return json(200, { success: true, ...crewIntercom.startPtt(d.memberId, d.targets || []) });
        if (d.action === 'ptt_ping') { crewIntercom.pingPtt(d.memberId, d.lease); return json(200, { success: true }); }
        if (d.action === 'ptt_stop') { crewIntercom.stopPtt(d.memberId, d.lease); return json(200, { success: true }); }
      } catch (e) { return json(400, { success: false, error: e.message }); }
      return json(400, { success: false });
    }
    const path = u.pathname === '/' ? '/crew.html' : u.pathname;
    // /img/* é servido de painel/ (um nível acima de painel/remoto/), igual ao
    // servidor-api.mjs real faz hoje — não é um recurso exclusivo de remoto/.
    const base = path.startsWith('/img/') ? join(PANEL, '..') : PANEL;
    try { const data = await readFile(join(base, path.replace(/^\//, ''))); res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' }); res.end(data); }
    catch { res.writeHead(404); res.end('not found: ' + path); }
  });
  const wss = new WebSocketServer({ noServer: true });
  const crewTallyWss = new WebSocketServer({ noServer: true });
  const crewTallyClients = new Set();
  setInterval(async () => { for (const { ws, watching } of crewTallyClients) if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(await crewTally.forDevice(watching))); }, 1000);
  server.on('upgrade', (req, socket, head) => {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname === '/api/crew/tally/ws') { const watching = u.searchParams.get('watching') || 'main'; crewTallyWss.handleUpgrade(req, socket, head, async (ws) => { crewTallyClients.add({ ws, watching }); ws.send(JSON.stringify(await crewTally.forDevice(watching))); ws.on('close', () => { for (const c of crewTallyClients) if (c.ws === ws) crewTallyClients.delete(c); }); }); return; }
    if (u.pathname === '/api/crew/intercom/ws') { const memberId = u.searchParams.get('member') || ''; if (!crewIntercom.members.has(memberId)) { socket.write('HTTP/1.1 404 Not Found\r\n\r\n'); socket.destroy(); return; } wss.handleUpgrade(req, socket, head, (ws) => transport.attach(memberId, ws)); return; }
    socket.destroy();
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  console.log('Crew harness (QA) em http://127.0.0.1:' + port);

  // Simula tráfego de tally mudando a cada 4s, e um "diretor" falando por 2s a cada 8s —
  // só para dar vida à tela durante a verificação visual manual/automatizada.
  setInterval(() => { const t = productionFake.state.tally; productionFake.state.tally = t.program[0] === 'CAM 1' ? { program: ['CAM 2'], preview: ['CAM 1'] } : { program: ['CAM 1'], preview: ['CAM 2'] }; }, 4000);
  function pacote(uuid, amplitude, timestampNs) { const frames = 960, pcm = Buffer.alloc(frames * 4); for (let f = 0; f < frames; f++) pcm.writeFloatLE(amplitude, f * 4); return { uuid, timestamp: BigInt(timestampNs), frames, rate: 48000, channels: 1, pcm: pcm.toString('base64') }; }
  setInterval(async () => {
    crewIntercom.startPtt(diretor, [camA, camB]);
    let t = Date.now() * 1e6;
    for (let i = 0; i < 100; i++) { proximoBatch = { packets: [pacote('uuid-diretor', 0.4, t)] }; await registry.drainOnce(); t += 20_000_000; await new Promise((r) => setTimeout(r, 20)); }
    crewIntercom.stopPtt(diretor);
  }, 8000);
  return { server, port };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.argv[2]) || 8695;
  await startHarness(port);
}
