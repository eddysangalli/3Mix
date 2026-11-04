// Teste de integração real: cliente OSC 100% independente (socket UDP puro, sem
// importar nenhum código do 3Mix), simulando como um módulo genérico de OSC do
// Bitfocus Companion (ou qualquer superfície de controle físico) se conectaria de
// fora do processo Node do produto. Não é reteste do codec (já cobre
// scripts/controllers-qa/test-software.mjs) — é o handshake fire→execute→feedback
// de ponta a ponta, visto puramente pelo protocolo na rede, como um controlador
// físico real veria.
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ControllerEngine } from '../../ferramentas/controlador-producao.mjs';
import { MacroEngine } from '../../ferramentas/macros-producao.mjs';

const checks = [];
const check = (s) => checks.push(s);

// --- codec OSC 1.0 cru, reimplementado aqui de forma independente do produto,
// para que este teste não dependa do mesmo encoder/decoder que está sendo testado.
const padded = (s) => {
  const b = Buffer.from(s + '\0');
  return Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
};
function oscEncodeIndependente(address, args = []) {
  let tags = ',';
  const parts = [];
  for (const value of args) {
    if (typeof value === 'string') { tags += 's'; parts.push(padded(value)); }
    else { tags += 'i'; const b = Buffer.alloc(4); b.writeInt32BE(value); parts.push(b); }
  }
  return Buffer.concat([padded(address), padded(tags), ...parts]);
}
function oscDecodeIndependente(wire) {
  let offset = 0;
  const readString = () => {
    const end = wire.indexOf(0, offset);
    const next = (end + 4) & ~3;
    const s = wire.subarray(offset, end).toString('utf8');
    offset = next;
    return s;
  };
  const address = readString();
  const tags = readString();
  const args = [];
  for (const tag of tags.slice(1)) {
    if (tag === 's') args.push(readString());
    else { args.push(wire.readInt32BE(offset)); offset += 4; }
  }
  return { address, args };
}

// --- produção isolada mínima (mesmo padrão dos outros scripts de QA desta pasta:
// motor real não disponível/não tocado nesta sessão, engine real exercitada com
// estado sintético próprio, nunca PASS fabricado).
const root = await mkdtemp(join(tmpdir(), 'FreeMix-QA-OSC-Independente-'));
const inputKey = randomUUID();
const state = {
  connected: true,
  program: 'Outra', preview: 'Outra',
  recording: false, streaming: false,
  inputs: [{ key: inputKey, name: 'CAM Própria QA', volume: 50, muted: false, audioBuses: 'M', tally: { program: false, preview: false } }],
  overlays: [], tally: { program: [], preview: [] },
  calls: { director: null, guests: [], talking: false },
  macros: { items: [], job: null },
};
const executed = [];
const p = {
  root, state, publish() {},
  scene(id) { const i = p.state.inputs.find((i) => i.key === id || i.name === id); if (!i) throw Error('Input de QA não encontrado'); return i; },
  media() { return { kind: 'ffmpeg_source' }; },
  async execute(action, data) { executed.push({ action, data }); if (action === 'preview') state.preview = state.inputs.find((i) => i.key === data.input).name; },
  callEngine: { async execute() { throw Error('Talkback não exercitado neste teste'); } },
};
p.macroEngine = new MacroEngine(p);
await p.macroEngine.setScope('QA OSC Independente');
const controller = new ControllerEngine(p);
p.run = (a, d) => controller.execute(a, d);
await controller.setScope('QA OSC Independente');

const itemId = await (async () => {
  await controller.execute('controller_save', { name: 'Preview CAM Própria', trigger: { type: 'keyboard', code: 'F9' }, target: { action: 'preview', data: { input: inputKey } } });
  return controller.items.at(-1).id;
})();

const port = 19121; // porta diferente da default (19120), evita colidir com instância real
await controller.osc.configure({ port });
await controller.osc.start();
check('Servidor OSC do 3Mix (ControllerOSC) iniciado em processo real, porta dedicada de QA');

// --- cliente externo: dgram puro, nenhum import do código do 3Mix a partir daqui.
const client = dgram.createSocket('udp4');
await new Promise((ok, no) => { client.once('error', no); client.bind(0, '127.0.0.1', ok); });
const inbox = [];
client.on('message', (wire) => { try { inbox.push(oscDecodeIndependente(wire)); } catch (e) { inbox.push({ error: String(e) }); } });
const send = (address, args = []) => client.send(oscEncodeIndependente(address, args), port, '127.0.0.1');
const waitFor = async (pred, label, timeoutMs = 3000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) { const hit = inbox.find(pred); if (hit) return hit; await new Promise((r) => setTimeout(r, 15)); }
  throw Error('Timeout esperando ' + label + '. Caixa recebida: ' + JSON.stringify(inbox));
};

try {
  // 1) subscribe — como o Companion faria ao conectar o módulo
  send('/freemix/subscribe', [1]);
  const ack = await waitFor((m) => m.address === '/freemix/ack' && m.args[0] === 'subscribe', 'ack de subscribe');
  assert.deepEqual(ack.args, ['subscribe', 1]);
  check('Cliente externo (dgram puro) completou subscribe real contra o servidor OSC do produto');

  await waitFor((m) => m.address === '/freemix/state', 'estado inicial via /freemix/state');
  await waitFor((m) => m.address === '/freemix/feedback' && m.args[0] === itemId, 'feedback inicial do botão salvo');
  check('Estado global e feedback do botão chegaram via push automático após subscribe, sem o cliente pedir /freemix/read');

  // 2) fire down — como um botão físico sendo pressionado
  inbox.length = 0;
  send('/freemix/fire', [itemId, 'down', 127]);
  const fireAck = await waitFor((m) => m.address === '/freemix/ack' && m.args[0] === itemId, 'ack de fire down');
  assert.deepEqual(fireAck.args, [itemId, 1]);
  assert.equal(executed.at(-1).action, 'preview');
  assert.equal(executed.at(-1).data.input, inputKey);
  check('Fire down real via UDP externo chegou ao controller.execute e disparou a ação preview real na Production sintética');

  const feedbackAfterFire = await waitFor((m) => m.address === '/freemix/feedback' && m.args[0] === itemId && m.args[3] === 1, 'feedback com active=1 após fire');
  assert.equal(feedbackAfterFire.args[1], 1, 'enabled deveria ser 1');
  assert.equal(feedbackAfterFire.args[2], 1, 'available deveria ser 1 (conectado + input existe)');
  check('Feedback /freemix/feedback refletiu active=1 depois do preview real mudar o estado — Stream Deck veria o botão aceso');

  // 3) fire up — soltar o botão (ação é 'preview', que ignora phase 'up', mas o
  // protocolo deve aceitar sem erro, igual a um botão físico real sendo solto)
  inbox.length = 0;
  send('/freemix/fire', [itemId, 'up']);
  await waitFor((m) => m.address === '/freemix/ack' && m.args[0] === itemId, 'ack de fire up');
  check('Fire up (soltar o botão) aceito sem erro pelo protocolo, consistente com dispositivo físico real');

  // 4) comando malformado/fora do allowlist — superfície de controle "hostil" ou com bug
  inbox.length = 0;
  send('/freemix/delete_everything', []);
  const errMsg = await waitFor((m) => m.address === '/freemix/error', 'erro para comando não permitido');
  assert.match(errMsg.args[0], /não permitido/);
  check('Comando OSC fora do allowlist (/freemix/delete_everything) foi rejeitado com /freemix/error, não executado, não travou o servidor');

  // 5) depois do passo 4, o servidor ainda responde normalmente — confirma que o
  // erro anterior não deixou o peer "travado" (p.busy nunca liberado, por exemplo)
  inbox.length = 0;
  send('/freemix/read', [itemId]);
  await waitFor((m) => m.address === '/freemix/feedback' && m.args[0] === itemId, 'feedback após read pontual, pós-erro');
  check('Servidor continuou respondendo normalmente após o comando rejeitado — erro não deixou o peer travado');
} finally {
  await new Promise((ok) => client.close(ok));
  await controller.osc.stop();
  check('Cliente UDP e servidor OSC de QA encerrados de forma graciosa (socket.close, sem matar processo)');
}

console.log('PASS — ' + checks.length + ' verificações:');
for (const c of checks) console.log('  - ' + c);
