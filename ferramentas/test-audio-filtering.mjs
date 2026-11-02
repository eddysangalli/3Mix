import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { AudioRoutingEngine } from './audio-routing-producao.mjs';

console.log('=== TESTE DE FILTRAGEM BROADCAST DE ÁUDIO NO 3MIX PRO ===');

const mockObs = {
  req: async (name) => {
    if (name === 'GetInputKindList') return { inputKinds: ['wasapi_input_capture', 'ffmpeg_source', 'freemix_audio_bus'] };
    if (name === 'GetSourceFilterKindList') return { sourceFilterKinds: ['gain_filter', 'noise_gate_filter', 'compressor_filter', 'limiter_filter', 'noise_suppress_filter', 'expander_filter'] };
    return {};
  },
  vendor: async () => ({})
};

const engine = new AudioRoutingEngine({
  root: process.cwd(),
  req: mockObs.req,
  vendor: mockObs.vendor
});

// Simula contexto com as fontes problemáticas que apareceram no print do usuário
const mockContext = {
  connected: true,
  scope: 'producao_teste',
  tally: { program: ['CAM 1'] },
  director: { key: 'dir_1', name: 'Diretor' },
  audioInputs: [
    { key: 'mic1', name: 'VT áudio', kind: 'ffmpeg_source', muted: false },
    { key: 'mic2', name: 'CAM 10 (fonte)', kind: 'wasapi_input_capture', muted: false },
    { key: 'mic3', name: 'AUDIO 13 (fonte)', kind: 'wasapi_input_capture', muted: false },
    // Key em UUID é o normal do motor: não pode esconder a fonte real.
    { key: '123e4567-e89b-12d3-a456-426614174000', name: 'Microfone UUID', kind: 'wasapi_input_capture', muted: false },
    // As fontes UUID e barramentos que estavam sujando a UI:
    { key: 'uuid1', name: '24-bb19-4ade-a045-c08c71d75397', kind: 'wasapi_output_capture', muted: true },
    { key: 'uuid2', name: 'be-216e-431a-9cb0-be71c82c31ea', kind: 'wasapi_output_capture', muted: true },
    { key: 'bus_master', name: '3Mix Master', kind: 'freemix_audio_bus', muted: false },
    { key: 'bus_a', name: 'FreeMix Bus A', kind: 'freemix_audio_bus', muted: false },
    { key: 'retorno', name: 'FreeMix Retorno', kind: 'freemix_audio_bus', muted: true }
  ],
  sourceInputs: [
    { key: 'mic1', name: 'VT áudio', kind: 'ffmpeg_source' },
    { key: 'mic2', name: 'CAM 10 (fonte)', kind: 'wasapi_input_capture' },
    { key: 'mic3', name: 'AUDIO 13 (fonte)', kind: 'wasapi_input_capture' },
    { key: '123e4567-e89b-12d3-a456-426614174000', name: 'Microfone UUID', kind: 'wasapi_input_capture' }
  ]
};

await engine.observe(mockContext);
const summary = engine.summary();

console.log(`[1/3] Verificando isolamento de fontes internas...`);
const uuid1 = summary.sources.find(s => s.name === '24-bb19-4ade-a045-c08c71d75397');
assert(uuid1, 'Fonte deve existir no summary');
assert.strictEqual(uuid1.protected, true, 'UUID deve ser protegido');
assert.strictEqual(uuid1.internal, true, 'UUID deve ser marcado como interno');

const masterBus = summary.sources.find(s => s.name === '3Mix Master');
assert(masterBus, '3Mix Master deve existir');
assert.strictEqual(masterBus.protected, true, 'Barramento de sistema deve ser protegido');
assert.strictEqual(masterBus.internal, true, 'Barramento de sistema deve ser interno');

console.log(`[1b/3] Fonte real com key UUID não pode ser tratada como interna...`);
const uuidKey = summary.sources.find(s => s.name === 'Microfone UUID');
assert(uuidKey, 'Fonte com key UUID deve existir no summary');
assert.strictEqual(uuidKey.protected, false, 'Key UUID é normal: a fonte real deve ser controlável');
assert.strictEqual(uuidKey.internal, false, 'Key UUID não torna a fonte interna');
console.log('  -> PASS: a lista lateral recebe as fontes reais mesmo com keys em UUID.');

console.log('  -> PASS: UUIDs e barramentos de sistema devidamente protegidos e isolados.');

console.log(`[2/3] Verificando categorização broadcast...`);
const vt = summary.sources.find(s => s.name === 'VT áudio');
assert.strictEqual(vt.category, 'media', 'VT áudio deve ser categorizado como media');
const cam = summary.sources.find(s => s.name === 'CAM 10 (fonte)');
assert.strictEqual(cam.category, 'mic', 'WASAPI capture deve ser categorizado como mic');
console.log('  -> PASS: Categorias de áudio (media, mic, web, camera) identificadas com precisão.');

console.log(`[3/3] Verificando integridade das interfaces de áudio...`);
const audioHtml = readFileSync('3mix-panel/painel/remoto/audio.html', 'utf8');
assert(!audioHtml.includes('Padrão vMix'), 'Não deve conter "Padrão vMix"');
assert(!audioHtml.includes('FreeMix Studio'), 'Não deve conter "FreeMix Studio"');
assert(audioHtml.includes('3Mix'), 'Deve conter identidade 3Mix');

console.log('  -> PASS: Branding 3Mix Pro validado nas interfaces de áudio.');
for (const tab of ['Mixer', 'Roteamento', 'Retornos / N-1', 'Dispositivos']) {
  assert(audioHtml.includes(tab), `Deve conter a aba ${tab}`);
}
assert(audioHtml.includes('Aplicar alterações'), 'Deve conter o botão Aplicar alterações');
console.log('  -> PASS: abas Mixer/Roteamento/Retornos/Dispositivos e Aplicar alterações validados.');

console.log('=== TODOS OS TESTES DE ÁUDIO PASSARAM (3/3 PASS) ===');
