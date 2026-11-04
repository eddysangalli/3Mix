import test from 'node:test';
import assert from 'node:assert/strict';
import { SRT_PRESETS, validateSrtTransport, buildSrtQueryParams, applySrtTransportToServer } from './srt-presets.mjs';

test('os 3 presets existem com latência/overhead dentro dos limites do protocolo', () => {
  for (const [id, preset] of Object.entries(SRT_PRESETS)) {
    const v = validateSrtTransport({}, id);
    assert.ok(v.latencyMs >= 20 && v.latencyMs <= 60000, id + ': latência fora da faixa');
    assert.ok(v.overheadPercent >= 1 && v.overheadPercent <= 100, id + ': overhead fora da faixa');
  }
  assert.equal(Object.keys(SRT_PRESETS).length, 3);
});

test('preset de contribuição internet usa latência maior que LAN local (absorve jitter de WAN)', () => {
  const lan = validateSrtTransport({}, 'contribuicao-lan');
  const internet = validateSrtTransport({}, 'contribuicao-internet');
  assert.ok(internet.latencyMs > lan.latencyMs);
});

test('preset desconhecido é rejeitado, não ignorado silenciosamente', () => {
  assert.throws(() => validateSrtTransport({}, 'preset-que-nao-existe'), /desconhecido/);
});

test('parâmetros customizados sobrescrevem o preset, mas ainda passam pela validação de limites', () => {
  const v = validateSrtTransport({ latencyMs: 5000 }, 'contribuicao-lan');
  assert.equal(v.latencyMs, 5000);
  assert.equal(v.overheadPercent, 25, 'overhead continua vindo do preset, só latência foi sobrescrita');
});

test('latência fora da faixa [20, 60000] é rejeitada com mensagem em português', () => {
  assert.throws(() => validateSrtTransport({ latencyMs: 5, overheadPercent: 25 }), /Latência SRT/);
  assert.throws(() => validateSrtTransport({ latencyMs: 999999, overheadPercent: 25 }), /Latência SRT/);
  assert.throws(() => validateSrtTransport({ latencyMs: 1.5, overheadPercent: 25 }), /Latência SRT/, 'não aceita fracionário');
});

test('overhead fora da faixa [1, 100] é rejeitado', () => {
  assert.throws(() => validateSrtTransport({ latencyMs: 120, overheadPercent: 0 }), /Overhead/);
  assert.throws(() => validateSrtTransport({ latencyMs: 120, overheadPercent: 101 }), /Overhead/);
});

test('passphrase precisa ter entre 10 e 79 caracteres (limite real da libsrt, não arbitrário) ou ficar vazia', () => {
  const base = { latencyMs: 120, overheadPercent: 25 };
  assert.throws(() => validateSrtTransport({ ...base, passphrase: 'curta' }), /Senha de criptografia/);
  assert.throws(() => validateSrtTransport({ ...base, passphrase: 'x'.repeat(80) }), /Senha de criptografia/);
  const semSenha = validateSrtTransport({ ...base, passphrase: '' });
  assert.equal(semSenha.passphrase, '');
  const comSenha = validateSrtTransport({ ...base, passphrase: 'senha-com-dez-chars' });
  assert.equal(comSenha.passphrase, 'senha-com-dez-chars');
});

test('buildSrtQueryParams gera exatamente os parâmetros que o motor nativo lê (confirmado em obs-ffmpeg-srt.h)', () => {
  const transport = validateSrtTransport({}, 'contribuicao-lan');
  const params = buildSrtQueryParams(transport);
  assert.equal(params.get('latency'), '120');
  assert.equal(params.get('oheadbw'), '25');
  assert.equal(params.get('tlpktdrop'), '1');
  assert.equal(params.get('nakreport'), '1');
  assert.equal(params.get('passphrase'), null, 'sem passphrase definida, a chave não deve aparecer');
});

test('applySrtTransportToServer preserva host/porta e mescla query existente sem duplicar chaves', () => {
  const transport = validateSrtTransport({}, 'distribuicao-baixa-latencia');
  const resultado = applySrtTransportToServer('srt://relay.exemplo.com:9000?streamid=camera1', transport);
  assert.match(resultado, /^srt:\/\/relay\.exemplo\.com:9000\?/);
  assert.match(resultado, /streamid=camera1/, 'parâmetro pré-existente (streamid) não deve ser perdido');
  assert.match(resultado, /latency=200/);
  assert.match(resultado, /oheadbw=15/);
  const url = new URL(resultado.replace('srt://', 'http://'));
  assert.equal([...url.searchParams.keys()].filter((k) => k === 'latency').length, 1, 'não deve duplicar a chave latency');
});

test('applySrtTransportToServer NÃO altera servidores de outros protocolos (rtmp/rist/hls) -- nunca injeta parâmetro SRT onde não se aplica', () => {
  const transport = validateSrtTransport({}, 'contribuicao-lan');
  assert.equal(applySrtTransportToServer('rtmp://servidor.exemplo.com/live/chave', transport), 'rtmp://servidor.exemplo.com/live/chave');
  assert.equal(applySrtTransportToServer('rist://servidor.exemplo.com:1234', transport), 'rist://servidor.exemplo.com:1234');
  assert.equal(applySrtTransportToServer('', transport), '');
});

test('applySrtTransportToServer é case-insensitive no esquema (SRT:// também funciona)', () => {
  const transport = validateSrtTransport({}, 'contribuicao-lan');
  const resultado = applySrtTransportToServer('SRT://host:1000', transport);
  assert.match(resultado, /latency=120/);
});
