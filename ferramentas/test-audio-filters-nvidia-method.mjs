// Teste real de filterSettings()/AUDIO_FILTERS (modulo de producao real, nao clone), motivado
// pela auditoria vMix 30 secao 5.1: NVIDIA Dereverb. Achado ao ler o codigo nativo
// (3mix-engine/plugins/nv-filters/nvidia-audiofx-filter.c): o SDK NVIDIA AFX ja suporta os 3
// metodos (denoiser/dereverb/dereverb_denoiser) com reinicializacao real do modelo quando
// 'method' muda via update() -- so faltava o Node permitir escolher, estava fixo em
// 'denoiser'. Nao duplica RNNoise nem cria um segundo gerenciador de efeitos: estende o
// mecanismo unico ja existente (AUDIO_FILTERS/filterSettings), mesmo caminho que RNNoise usa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_FILTERS, filterSettings } from './audio-routing-producao.mjs';

test('NVIDIA aceita os 3 métodos reais do SDK (denoiser/dereverb/dereverb_denoiser) -- exatamente as 3 strings que o combo nativo oferece (nvafx-load.h)', () => {
  for (const method of ['denoiser', 'dereverb', 'dereverb_denoiser']) {
    const result = filterSettings('nvidia', { method });
    assert.equal(result.method, method);
  }
});

test('NVIDIA rejeita um método inventado -- nunca envia ao motor uma string que o SDK não reconhece', () => {
  assert.throws(() => filterSettings('nvidia', { method: 'metodo-que-nao-existe' }), /selecione uma das opções válidas/);
});

test('NVIDIA sem informar method usa o default "denoiser" -- comportamento de quem já configurou isso antes continua idêntico (zero regressão)', () => {
  const result = filterSettings('nvidia', {});
  assert.equal(result.method, 'denoiser');
});

test('NVIDIA preserva o method já salvo (previous) quando só a intensidade é ajustada -- trocar volume não reseta o modelo escolhido', () => {
  const result = filterSettings('nvidia', { intensity: 0.8 }, { method: 'dereverb', intensity: 0.5 });
  assert.equal(result.method, 'dereverb');
  assert.equal(result.intensity, 0.8);
});

test('intensity continua validada por faixa numérica normalmente, sem interferência do novo campo enum', () => {
  assert.throws(() => filterSettings('nvidia', { intensity: 1.5 }), /intensity: valor fora do intervalo/);
  assert.throws(() => filterSettings('nvidia', { intensity: -0.1 }), /intensity: valor fora do intervalo/);
});

test('um parâmetro desconhecido (nem range nem enum) continua rejeitado -- a extensão não afrouxou a validação geral', () => {
  assert.throws(() => filterSettings('nvidia', { campo_inexistente: 1 }), /Parâmetro de filtro não suportado/);
});

test('outros filtros (RNNoise, Gate, Compressor, Limiter, Expander) continuam funcionando exatamente como antes -- a mudança foi isolada ao NVIDIA, não afetou o mecanismo geral', () => {
  assert.deepEqual(filterSettings('rnnoise', {}), { suppress_method: 'rnnoise' });
  const gate = filterSettings('gate', { open_threshold: -20, close_threshold: -30 });
  assert.equal(gate.open_threshold, -20);
  assert.throws(() => filterSettings('gate', { open_threshold: -20, close_threshold: -10 }), /Gate: fechar deve estar abaixo de abrir/);
  const comp = filterSettings('compressor', { ratio: 8 });
  assert.equal(comp.ratio, 8);
  assert.equal(comp.sidechain_source, 'none');
});

test('AUDIO_FILTERS.nvidia.enums expõe exatamente os 3 valores, nem mais nem menos', () => {
  assert.deepEqual(AUDIO_FILTERS.nvidia.enums.method, ['denoiser', 'dereverb', 'dereverb_denoiser']);
});
