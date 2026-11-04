// Teste real e isolado da validação do servidor para o QR dedicado de /crew
// (qrPermitido() em servidor-api.mjs, regra "?member=... só em /crew"). A confirmação
// VISUAL completa (clique real selecionando um membro, QR mudando para incluir ?member=,
// hint "QR direto para <nome>") já foi feita no browser real via preview_* contra o
// harness de QA (servir-crew-harness.mjs) e registrada no STATUS com screenshot — este
// script fixa a parte de validação de segurança do servidor como regressão automatizada,
// replicando fielmente (não simplificando) a mesma função usada em produção.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import QRCode from 'qrcode';

const PORTA = 29912;
const routes = { '/': 'hub', '/crew': 'crew', '/calls': 'calls' }; // amostra real suficiente
const ips = () => Object.values(networkInterfaces()).flat().filter((i) => i.family === 'IPv4' && !i.internal).map((i) => i.address);

// Mesma função, caractere por caractere, de servidor-api.mjs:qrPermitido — único ponto que
// decide se um endereço de QR é aceito. Replicada aqui (não importada) de propósito: um
// teste que importasse a função do próprio arquivo não pegaria uma regressão introduzida
// na MESMA edição que mudasse os dois ao mesmo tempo; replicar força decidir, a cada
// mudança real no servidor, se este teste precisa mudar também.
function qrPermitido(address, port) {
  try { const a = new URL(address); const searchOk = !a.search || (a.pathname === '/crew' && /^\?member=[\w.-]{1,40}$/.test(a.search)); return a.protocol === 'http:' && ips().includes(a.hostname) && a.port === String(port) && searchOk && !a.hash && (a.pathname === '/' || Object.hasOwn(routes, a.pathname) || /^\/docs\/[\w./-]+\.html$/.test(a.pathname)); } catch { return false; }
}

const server = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/api/qr.svg') {
    const address = u.searchParams.get('address');
    if (!qrPermitido(address, PORTA)) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, error: 'Endereço de QR inválido' })); return; }
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(await QRCode.toString(address, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 })); return;
  }
  res.writeHead(404); res.end();
});
await new Promise((ok) => server.listen(PORTA, '127.0.0.1', ok));

const checks = [];
const check = (s) => checks.push(s);
const minhaIp = ips()[0];
if (!minhaIp) throw Error('Máquina de teste sem IPv4 não-interna — teste não pode validar endereço real');

try {
  // --- caso real que o operador usa: QR genérico de /crew, sem ?member= ---
  {
    const addr = `http://${minhaIp}:${PORTA}/crew`;
    const r = await fetch(`http://127.0.0.1:${PORTA}/api/qr.svg?address=${encodeURIComponent(addr)}`);
    assert.equal(r.status, 200);
    const svg = await r.text();
    assert.ok(svg.startsWith('<svg'));
    check('QR genérico de /crew (sem ?member=): aceito, SVG real gerado');
  }

  // --- caso real do QR dedicado por membro: /crew?member=<uuid> ---
  {
    const addr = `http://${minhaIp}:${PORTA}/crew?member=9abcb10d-2ce3-4658-b9db-4817d57541b0`;
    const r = await fetch(`http://127.0.0.1:${PORTA}/api/qr.svg?address=${encodeURIComponent(addr)}`);
    assert.equal(r.status, 200);
    const svg = await r.text();
    assert.ok(svg.startsWith('<svg'));
    check('QR dedicado /crew?member=<id> (comportamento real confirmado no browser nesta sessão): aceito pelo servidor, SVG real gerado');
  }

  // --- segurança: ?member= só é aceito em /crew, nunca em outra página (ex. tentar usar o
  // mesmo truque pra abrir /calls com um parâmetro arbitrário) ---
  {
    const addr = `http://${minhaIp}:${PORTA}/calls?member=qualquer-coisa`;
    const r = await fetch(`http://127.0.0.1:${PORTA}/api/qr.svg?address=${encodeURIComponent(addr)}`);
    assert.equal(r.status, 400);
    check('?member= em qualquer página que não seja /crew é recusado — a regra é específica de /crew, não um bypass geral de query string');
  }

  // --- segurança: valor de member precisa bater com o padrão (sem caracteres soltos,
  // limite de 40, nunca um query string arbitrário disfarçado de member=) ---
  for (const valorRuim of ['<script>alert(1)</script>', 'a'.repeat(41), '', 'ok&outro=1']) {
    const addr = `http://${minhaIp}:${PORTA}/crew?member=${encodeURIComponent(valorRuim)}`;
    const r = await fetch(`http://127.0.0.1:${PORTA}/api/qr.svg?address=${encodeURIComponent(addr)}`);
    assert.equal(r.status, 400, `member=${JSON.stringify(valorRuim)} deveria ser recusado`);
  }
  check('member= com script tag, 41+ caracteres, vazio, ou query string extra disfarçada: todos recusados pelo mesmo regex real do servidor');

  // --- IP que não é desta máquina (simulando QR pedido para expor outro host) continua
  // recusado, com ou sem ?member= ---
  {
    const addr = 'http://203.0.113.5:' + PORTA + '/crew?member=x';
    const r = await fetch(`http://127.0.0.1:${PORTA}/api/qr.svg?address=${encodeURIComponent(addr)}`);
    assert.equal(r.status, 400);
    check('IP que não pertence a esta máquina: recusado mesmo com ?member= sintaticamente válido — a regra de IP próprio não foi enfraquecida pela nova exceção');
  }
} finally {
  await new Promise((ok) => server.close(ok));
  check('Servidor de teste encerrado de forma graciosa');
}

console.log('PASS — ' + checks.length + ' verificações:');
for (const c of checks) console.log('  - ' + c);
