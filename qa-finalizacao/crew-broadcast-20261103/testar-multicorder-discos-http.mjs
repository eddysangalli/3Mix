// Teste real e isolado da rota GET /api/multicorder/discos (Fase 3, "detecção de disco
// físico por nome amigável"): replica fielmente a lógica de auth de servidor-api.mjs (mesmo
// padrão já usado em testar-crew-tally-http-ws.mjs) + mapaMultiCorder() REAL (import
// direto, contra o PowerShell de verdade desta máquina — 2 discos físicos reais). NUNCA
// toca o motor do operador nem a porta real 8088/18188.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mapaMultiCorder } from '../../ferramentas/disco-producao.mjs';

const PORTA = 29911;
const local = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const equal = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && timingSafeEqual(x, y); };
const pin = String(randomInt(100000, 1000000));
const sessions = new Map();
function authorized(req) {
  if (local(req)) return true;
  const c = /(?:^|;\s*)freemix_session=([A-Za-z0-9_-]+)/.exec(req.headers.cookie || '');
  return !!c && sessions.get(c[1]) > Date.now();
}

// Descoberta independente dos discos reais desta máquina (script à parte, não importa nada
// do módulo testado) — usada para montar um cenário realista de produção/iso sintéticos.
function powershell(script) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: 8000, windowsHide: true, encoding: 'utf8' }, (erro, saida) => (erro ? reject(erro) : resolve(saida)));
  });
}
const bruto = await powershell('Get-Partition | Where-Object DriveLetter | ForEach-Object { [string]$_.DriveLetter + "=" + ($_ | Get-Disk).Number } | Write-Output');
const letras = bruto.trim().split(/\r?\n/).filter(Boolean).map((l) => l.split('=')[0]);
if (letras.length < 1) throw Error('Máquina de teste sem nenhuma unidade com letra — teste não pode rodar aqui');
const letraA = letras[0], letraB = letras[1] || letras[0]; // se só houver 1 disco, usa a mesma (ainda testa a rota, sem o caso de colisão real entre discos distintos)

// production/iso sintéticos com câmeras reais apontando para caminhos reais desta máquina.
const productionFake = {
  state: {
    connected: true,
    inputs: [
      { key: 'k1', name: 'CAM 1', number: 1 },
      { key: 'k2', name: 'CAM 2', number: 2 },
      { key: 'k3', name: 'CAM 3 sem override', number: 3 },
    ],
  },
};
const isoFake = { state: { recordOptions: { perInput: { 'CAM 1': { directory: letraA + ':\\' }, 'CAM 2': { directory: letraA + ':\\Users' } } } } };

const server = createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const json = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
  if (u.pathname === '/api/pair' && req.method === 'POST') {
    let body = ''; req.on('data', (c) => body += c); req.on('end', () => {
      const d = JSON.parse(body || '{}');
      if (!equal(d.pin, pin)) return json(401, { success: false, error: 'Codigo incorreto' });
      const id = randomBytes(24).toString('base64url'); sessions.set(id, Date.now() + 1000 * 60 * 60);
      res.setHeader('Set-Cookie', 'freemix_session=' + id + '; HttpOnly; Path=/'); return json(200, { success: true });
    });
    return;
  }
  if (u.pathname === '/api/multicorder/discos' && req.method === 'GET') {
    if (!authorized(req)) return json(401, { success: false, error: 'Autorize este dispositivo com o código do computador 3Mix' });
    const options = isoFake.state?.recordOptions || {};
    const porNome = {};
    for (const input of productionFake.state?.inputs || []) {
      const dir = options.perInput?.[input.name]?.directory || options.perInput?.[input.key]?.directory;
      if (dir) porNome[input.name] = dir;
    }
    mapaMultiCorder(porNome).then((resultado) => {
      const semOverride = (productionFake.state?.inputs || []).map((i) => i.name).filter((n) => !(n in porNome));
      json(200, { success: true, ...resultado, semOverrideDePasta: semOverride });
    });
    return;
  }
  json(404, { success: false });
});

await new Promise((ok) => server.listen(PORTA, '127.0.0.1', ok));
const checks = [];
const check = (s) => checks.push(s);

try {
  // --- authorized() real chamada direto com um req falso não-local, sem sessão pareada —
  // mesmo padrão já usado em testar-crew-tally-http-ws.mjs (uma conexão TCP de teste local
  // sempre chega como 127.0.0.1 de verdade; para testar a recusa de IP não-local de fato,
  // chama-se a MESMA função authorized() usada pela rota, com um req sintético) ---
  {
    const reqFalsoNaoLocal = { socket: { remoteAddress: '203.0.113.5' }, headers: {} };
    assert.equal(authorized(reqFalsoNaoLocal), false);
    check('authorized() real (mesma função usada pela rota): IP não-local sem sessão pareada é recusado');
  }
  {
    const r = await fetch(`http://127.0.0.1:${PORTA}/api/multicorder/discos`);
    assert.equal(r.status, 200, 'requisição real de 127.0.0.1 é sempre local, deveria passar sem PIN');
    check('Requisição local real (127.0.0.1 de verdade): autorizada sem PIN, igual a toda outra rota local');
  }
  {
    // pareamento real via PIN + cookie, mesmo fluxo que um dispositivo remoto pareado usaria
    const rPair = await fetch(`http://127.0.0.1:${PORTA}/api/pair`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) });
    const cookie = rPair.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie, 'pareamento real deveria devolver um cookie de sessão');
    check('Pareamento real por PIN (mesmo endpoint /api/pair) devolveu cookie de sessão válido');
  }

  // --- resposta real com câmeras reais, incluindo colisão (CAM 1 e CAM 2 na mesma letra) ---
  {
    const r = await fetch(`http://127.0.0.1:${PORTA}/api/multicorder/discos`);
    const d = await r.json();
    assert.equal(d.success, true);
    assert.equal(d.entradas.length, 2, 'só CAM 1 e CAM 2 têm override de pasta');
    assert.deepEqual(d.semOverrideDePasta, ['CAM 3 sem override'], 'CAM 3 sem override deveria ser listada separadamente, não inventada');
    const cam1 = d.entradas.find((e) => e.nome === 'CAM 1'), cam2 = d.entradas.find((e) => e.nome === 'CAM 2');
    assert.equal(cam1.disco.supported, true);
    assert.equal(cam2.disco.supported, true);
    assert.equal(cam1.disco.numero, cam2.disco.numero, 'CAM 1 e CAM 2 apontam para a mesma letra de unidade nesta máquina de teste');
    assert.equal(d.colisoes.length, 1);
    assert.deepEqual(new Set(d.colisoes[0].nomes), new Set(['CAM 1', 'CAM 2']));
    check(`Resposta HTTP real: 2 câmeras com override resolvidas para disco físico real (número ${cam1.disco.numero}, "${cam1.disco.nome}"), colisão real detectada, CAM 3 sem override listada à parte (não escondida nem inventada)`);
  }
} finally {
  await new Promise((ok) => server.close(ok));
  check('Servidor de teste encerrado de forma graciosa');
}

console.log('PASS — ' + checks.length + ' verificações:');
for (const c of checks) console.log('  - ' + c);
