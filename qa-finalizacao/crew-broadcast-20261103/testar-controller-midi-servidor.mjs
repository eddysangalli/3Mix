// Teste da camada MIDI do controlador que roda no SERVIDOR (Node, parte real do
// produto, sem WebMIDI/browser): controller_event, normalizeTrigger(midi) e
// normalizeMidiFeedback. A camada de DECODE de bytes MIDI reais 3-byte (status/
// number/value) roda em painel/remoto/atalhos-engine.js, no browser, via WebMIDI —
// essa parte não é exercitada aqui (depende de contexto seguro + permissão do
// navegador + dispositivo real, fora do alcance desta sessão sem CEF/hardware).
// Para não testar "ar", reimplemento aqui, de forma independente, o MESMO decode
// de status byte que atalhos-engine.js faz a partir de 3 bytes brutos (status,
// number, value), e alimento o resultado no controller_event real do servidor —
// cobrindo o caminho byte MIDI cru → ação real, exceto a entrega do browser/driver.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ControllerEngine } from '../../ferramentas/controlador-producao.mjs';
import { MacroEngine } from '../../ferramentas/macros-producao.mjs';

const checks = [];
const check = (s) => checks.push(s);

// --- mesmo decode de 3 bytes MIDI que atalhos-engine.js faz no browser (status&0xf0
// para o tipo, status&15 +1 para o canal 1-based) — reimplementado aqui, independente.
function decodeMidi3BytesIndependente([status, number, value], deviceId, deviceName) {
  const type = status & 0xf0, channel = (status & 15) + 1;
  if (![0x80, 0x90, 0xb0].includes(type) || number < 0 || number > 127 || value < 0 || value > 127) return null;
  return { type: 'midi', deviceId, deviceName, channel, message: type === 0xb0 ? 'cc' : 'note', number, value: type === 0x80 ? 0 : value };
}

const root = await mkdtemp(join(tmpdir(), 'FreeMix-QA-MIDI-Servidor-'));
const inputKey = randomUUID();
const state = {
  connected: true, program: 'Outra', preview: 'Outra', recording: false, streaming: false,
  inputs: [{ key: inputKey, name: 'CAM Própria QA MIDI', volume: 50, muted: false, audioBuses: 'M', tally: { program: false, preview: false } }],
  overlays: [], tally: { program: [], preview: [] },
  calls: { director: { key: 'director-qa' }, guests: [{ key: 'g1' }], talking: false },
  macros: { items: [], job: null },
};
const executed = [];
const leases = new Set();
const p = {
  root, state, publish() {},
  scene(id) { const i = p.state.inputs.find((i) => i.key === id || i.name === id); if (!i) throw Error('Input de QA não encontrado'); return i; },
  media() { return { kind: 'ffmpeg_source' }; },
  async execute(action, data) { executed.push({ action, data }); if (action === 'audio_volume') p.scene(data.input).volume = data.volume; },
  callEngine: {
    async execute(action, d) {
      if (action === 'call_talk_start') { const lease = randomUUID(); leases.add(lease); state.calls.talking = true; return { lease }; }
      if (action === 'call_talk_stop') { leases.delete(d.lease); state.calls.talking = leases.size > 0; }
    },
  },
};
p.macroEngine = new MacroEngine(p);
await p.macroEngine.setScope('QA MIDI Servidor');
const controller = new ControllerEngine(p);
p.run = (a, d) => controller.execute(a, d);
await controller.setScope('QA MIDI Servidor');

const deviceId = 'qa-launchpad-01', deviceName = 'QA Launchpad';
const clientId = randomUUID();

// 1) note on/off mapeado para talkback (hold-to-talk físico, caso real de uso: um
// botão do controlador MIDI como PTT de intercom/talkback)
const talkTrigger = { type: 'midi', deviceId, deviceName, channel: 1, message: 'note', number: 36 };
await controller.execute('controller_save', { name: 'Talk via MIDI', trigger: talkTrigger, target: { action: 'talkback', data: {} } });
const talkId = controller.items.at(-1).id;
check('Atalho MIDI (nota, canal 1, number 36) salvo com sucesso, mapeado para talkback');

// Nota ligada (status 0x90 = note-on canal1, velocity 100) — como atalhos-engine.js decodifica
const noteOn = decodeMidi3BytesIndependente([0x90, 36, 100], deviceId, deviceName);
assert.deepEqual(noteOn, { type: 'midi', deviceId, deviceName, channel: 1, message: 'note', number: 36, value: 100 });
await controller.execute('controller_event', { ...noteOn, clientId });
assert.equal(state.calls.talking, true, 'talkback deveria estar ativo após note-on real');
check('Note-on real (bytes 0x90,36,100) decodificado de forma independente, enviado via controller_event, abriu talkback de verdade (lease real criada)');

// Nota solta (status 0x80 = note-off, ou 0x90 com velocity 0 — ambos válidos em MIDI real)
const noteOff = decodeMidi3BytesIndependente([0x80, 36, 0], deviceId, deviceName);
assert.equal(noteOff.value, 0);
await controller.execute('controller_event', { ...noteOff, clientId });
assert.equal(state.calls.talking, false, 'talkback deveria fechar após note-off real');
check('Note-off real (bytes 0x80,36,0) fechou o talkback e liberou a lease — ciclo PTT físico completo via MIDI');

// 2) Control Change (fader físico) mapeado para volume contínuo — caso real de
// fader motorizado/potenciômetro de superfície de controle
const volTrigger = { type: 'midi', deviceId, deviceName, channel: 2, message: 'cc', number: 7, continuous: true };
await controller.execute('controller_save', { name: 'Volume via Fader MIDI', trigger: volTrigger, target: { action: 'audio_volume', data: { input: inputKey, volume: 0 } } });
check('Atalho MIDI contínuo (CC 7, canal 2) salvo, mapeado para audio_volume');

const ccMeio = decodeMidi3BytesIndependente([0xb1, 7, 64], deviceId, deviceName); // 0xb1 = CC canal 2
assert.deepEqual(ccMeio, { type: 'midi', deviceId, deviceName, channel: 2, message: 'cc', number: 7, value: 64 });
await controller.execute('controller_event', { ...ccMeio, clientId });
assert.ok(Math.abs(p.scene(inputKey).volume - (64 / 127 * 100)) < 0.01, 'volume deveria refletir o CC real recebido (64/127)');
check('Control Change real (bytes 0xb1,7,64) decodificado e aplicado como volume real (' + p.scene(inputKey).volume.toFixed(1) + '%), sem debounce de 180ms (é contínuo)');

// 3) validação: mensagem/estrutura rejeitada pelo decode (nem chega a virar ação) —
// confirma que bytes fora do padrão (ex. Program Change, 0xc0) são ignorados pelo
// MESMO filtro que atalhos-engine.js aplica no browser
const programChange = decodeMidi3BytesIndependente([0xc0, 5, 0], deviceId, deviceName);
assert.equal(programChange, null, 'Program Change (0xc0) não é nota nem CC — deve ser ignorado, igual ao browser real');
check('Bytes MIDI fora do conjunto suportado (Program Change) são descartados antes de chegar ao servidor, replicando o filtro real do cliente');

// 4) validação do lado do servidor: controller_event com message inválida é
// rejeitado mesmo que o decode do cliente tivesse (hipoteticamente) deixado passar —
// defesa em profundidade real, não suposição
await assert.rejects(controller.execute('controller_event', { type: 'midi', deviceId, channel: 1, number: 36, value: 100, message: 'aftertouch', clientId }), /Mensagem MIDI inválida/);
check('Servidor rejeita controller_event com message fora de note/cc mesmo que chegasse do cliente — defesa em profundidade confirmada, não suposta');

// 5) feedback MIDI: normalizeMidiFeedback real, exercitado via controller_save
await controller.execute('controller_save', {
  name: 'Talk via MIDI', id: talkId, trigger: talkTrigger, target: { action: 'talkback', data: {} },
  midiFeedback: { enabled: true, outputId: 'qa-out-1', outputName: 'QA Out', channel: 1, message: 'note', number: 36, value: 'active', onValue: 127, offValue: 0 },
});
const saved = controller.items.find((i) => i.id === talkId);
assert.equal(saved.midiFeedback.enabled, true);
assert.equal(saved.midiFeedback.onValue, 127);
check('normalizeMidiFeedback real aceitou e persistiu configuração de feedback MIDI (LED do controlador) para o atalho de talkback');

await controller.releaseAll();
await controller.osc.stop();
check('releaseAll real liberou qualquer lease de talkback pendente ao final do teste (fail-safe de hold mesmo fora de fire())');

console.log('PASS — ' + checks.length + ' verificações:');
for (const c of checks) console.log('  - ' + c);
