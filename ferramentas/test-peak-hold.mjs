// Teste real de painel/remoto/peak-hold.js (import direto do arquivo de produção via
// node:vm, mesmo padrão de test-clock-message.mjs -- não é um clone). Motivado pela
// auditoria vMix 30 ("indicadores dinâmicos de pico"): o mixer já media nível instantâneo
// (onMeters()/--l em mesa.html) mas sem reter o pico nem indicar clipe -- confirmado por
// busca, não suposição. A lógica é pura (sem DOM, sem Date.now() interno) exatamente para
// este teste poder controlar o tempo quadro a quadro, sem sleep real nem flakiness.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createContext, runInContext } from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(resolve(root, 'painel/remoto/peak-hold.js'), 'utf8');

const sandbox = {};
sandbox.window = sandbox;
createContext(sandbox);
runInContext(src, sandbox, { filename: 'peak-hold.js' });
const { PeakHoldMeter, CLIP_THRESHOLD } = sandbox.PeakHoldMeter;
assert.ok(PeakHoldMeter, 'window.PeakHoldMeter.PeakHoldMeter deve existir após carregar o arquivo real');

let t = 0;
const passou = [];
function check(nome, cond, detalhe) { passou.push(cond); console.log((cond ? 'PASS' : 'FAIL') + ' - ' + nome + (detalhe !== undefined ? ' :: ' + detalhe : '')); }

// 1. Pico sobe junto com o nível, sem atraso -- não é um segundo filtro de suavização do
// próprio nível instantâneo, só uma marca que fica.
{
  const m = new PeakHoldMeter();
  check('pico inicial é 0', m.update(0, t) === 0);
  t += 10; check('pico acompanha nível subindo (0.3)', m.update(0.3, t) === 0.3);
  t += 10; check('pico acompanha nível subindo mais (0.7)', m.update(0.7, t) === 0.7);
}

// 2. Nível cai mas o pico FICA no valor mais alto durante o tempo de hold (não cai junto).
{
  const m = new PeakHoldMeter({ holdMs: 1000, decayPerS: 1 });
  t = 0; m.update(0.8, t);
  t += 500; const p = m.update(0.1, t); // nível caiu para 0.1, mas ainda dentro do hold de 1000ms
  check('pico retido durante o hold mesmo com nível baixo depois', p === 0.8, 'pico=' + p);
}

// 3. Depois do hold, o pico decai de forma previsível (decayPerS por segundo), nunca
// instantaneamente, e nunca abaixo do nível atual.
{
  const m = new PeakHoldMeter({ holdMs: 1000, decayPerS: 1 });
  t = 0; m.update(0.8, t);
  t += 1000; m.update(0, t); // fim exato do hold, nível já baixo
  t += 500; const p = m.update(0, t); // 500ms de decaimento a 1.0/s = 0.5 de queda
  check('pico decai de forma proporcional ao tempo após o hold (0.8 - 0.5 = 0.3)', Math.abs(p - 0.3) < 0.01, 'pico=' + p);
  t += 10000; const p2 = m.update(0, t); // tempo de sobra: nunca fica negativo
  check('pico nunca fica negativo mesmo com muito tempo decaindo', p2 === 0, 'pico=' + p2);
}

// 4. Pico nunca cai abaixo do nível instantâneo atual (senão o medidor mostraria um pico
// "fantasma" mais baixo que a barra real, o que não faz sentido visualmente).
{
  const m = new PeakHoldMeter({ holdMs: 0, decayPerS: 0.01 });
  t = 0; m.update(0.5, t);
  t += 100; const p = m.update(0.9, t); // nível subiu de novo antes do pico decair até lá
  check('pico nunca fica abaixo do nível instantâneo atual', p === 0.9, 'pico=' + p);
}

// 5. Clipping: nível no limite (>= CLIP_THRESHOLD) marca clipped()=true, e continua true
// por clipHoldMs mesmo depois do nível cair -- não é um flash de 1 frame que passa
// despercebido no olho humano.
{
  const m = new PeakHoldMeter({ clipHoldMs: 1000 });
  t = 0; check('sem clipe no início', m.clipped(t) === false);
  m.update(CLIP_THRESHOLD, t);
  check('clipe detectado no instante do estouro', m.clipped(t) === true);
  t += 500; m.update(0, t);
  check('clipe continua marcado 500ms depois (dentro do clipHoldMs)', m.clipped(t) === true);
  t += 600; // total 1100ms > 1000ms de clipHoldMs
  check('clipe se apaga sozinho depois do clipHoldMs sem novo estouro', m.clipped(t) === false);
}

// 6. Nível levemente abaixo de CLIP_THRESHOLD (ex. -1dB) não deve marcar clipe -- senão
// todo fader quase no topo ficaria vermelho o tempo todo, inútil para o operador.
{
  const m = new PeakHoldMeter();
  m.update(CLIP_THRESHOLD - 0.05, 0);
  check('nível perto do topo mas abaixo do limiar não marca clipe', m.clipped(0) === false);
}

// 7. reset() limpa pico e clipe imediatamente -- o botão "limpar pico" do operador precisa
// disso sem esperar o decaimento natural.
{
  const m = new PeakHoldMeter();
  m.update(1, 0);
  check('antes do reset, pico e clipe estão marcados', m.peak() === 1 && m.clipped(0) === true);
  m.reset(0);
  check('depois do reset, pico volta a 0', m.peak() === 0);
  check('depois do reset, clipe para imediatamente', m.clipped(0) === false);
}

// 8. Entrada inválida (NaN/undefined/negativo/>1) nunca quebra nem produz pico fora de
// 0..1 -- onMeters() já trata isso antes de chamar, mas o módulo não deve confiar nisso.
{
  const m = new PeakHoldMeter();
  for (const ruim of [NaN, undefined, -5, 7, Infinity, -Infinity]) {
    const p = m.update(ruim, 0);
    check('entrada inválida (' + ruim + ') produz pico dentro de 0..1', p >= 0 && p <= 1, 'pico=' + p);
  }
}

// 9. Sintaxe/parse do arquivo real inteiro já foi exercitado pelo runInContext acima -- se
// houvesse erro de sintaxe, a própria importação já teria lançado antes de chegarmos aqui.

// 10. Integração real com mesa.html: extrai onMeters()/peakFor() exatamente como estão no
// arquivo de produção (mesma técnica de extração por regex de test-clock-message.mjs para
// clockText) e roda contra um DOM mínimo falso -- não jsdom (o projeto não usa), só objetos
// simples com os métodos que o trecho real chama (querySelector, querySelectorAll, style,
// classList). Prova que a integração funciona, sem fingir um motor OBS/CEF ligado.
{
  const mesaHtml = readFileSync(resolve(root, 'painel/mesa.html'), 'utf8');
  const clampSrc = mesaHtml.match(/ {2}const clamp = \([^\n]*\n/)?.[0];
  const peakForBlock = mesaHtml.match(/ {2}const meterPeaks = new WeakMap\(\);[\s\S]*?\n {2}function onMeters\(inputs\) \{[\s\S]*?\n {2}\}\n/)?.[0];
  assert.ok(clampSrc, 'clamp() deve continuar existindo em mesa.html, no formato esperado');
  assert.ok(peakForBlock, 'o bloco meterPeaks/peakFor/onMeters deve continuar existindo em mesa.html, no formato esperado');

  function fakeBar() {
    const vars = {};
    return {
      style: { setProperty: (k, v) => { vars[k] = v; } },
      classList: { toggle: (cls, on) => { vars['class:' + cls] = !!on; } },
      _vars: vars,
    };
  }
  const strips = new Map(); // inputName -> [barL, barR]
  const fakeDocument = {
    querySelector(sel) {
      const m = /\.strip\[data-n="([^"]+)"\]/.exec(sel);
      if (!m) return null;
      const name = m[1].replace(/\\(.)/g, '$1');
      if (!strips.has(name)) return null;
      const bars = strips.get(name);
      return { querySelectorAll: () => bars };
    },
  };
  const sandbox2 = { document: fakeDocument, CSS: { escape: (s) => s }, console, Date, WeakMap, window: { PeakHoldMeter: sandbox.PeakHoldMeter } };
  createContext(sandbox2);
  runInContext(clampSrc + peakForBlock, sandbox2, { filename: 'mesa.html (trecho extraído)' });

  const barsCam1 = [fakeBar(), fakeBar()];
  strips.set('CAM 1', barsCam1);
  // mul=1.0 → 0 dBFS exato → deve estourar clipe de verdade através do onMeters real extraído.
  sandbox2.onMeters([{ inputName: 'CAM 1', inputLevelsMul: [[0, 1], [0, 1]] }]);
  check('integração real: --l é setado pelo onMeters extraído de mesa.html', barsCam1[0]._vars['--l'] === '1.000');
  check('integração real: --p (pico) é setado via PeakHoldMeter real', barsCam1[0]._vars['--p'] === '1.000');
  check('integração real: classe "clip" é aplicada quando o nível bate 0 dBFS', barsCam1[0]._vars['class:clip'] === true);

  // Nível depois cai, mas o pico (--p) deve continuar marcado por um tempo -- mesmo
  // comportamento do módulo isolado, agora provado através do trecho real de mesa.html.
  sandbox2.onMeters([{ inputName: 'CAM 1', inputLevelsMul: [[0, 0.01], [0, 0.01]] }]); // mul=0.01 → -40 dBFS → l≈0.33
  check('integração real: --l cai imediatamente com o nível', Number(barsCam1[0]._vars['--l']) < 0.5, '--l=' + barsCam1[0]._vars['--l']);
  check('integração real: --p (pico) continua alto mesmo com --l baixo (hold em efeito)', Number(barsCam1[0]._vars['--p']) > 0.9);

  // Entrada sem elemento .strip correspondente não deve lançar (igual ao comportamento
  // original: "if (!el) continue").
  assert.doesNotThrow(() => sandbox2.onMeters([{ inputName: 'CAM INEXISTENTE', inputLevelsMul: [[0, 0.5]] }]));
  check('integração real: entrada sem .strip correspondente não lança (if (!el) continue preservado)', true);
}

const total = passou.length, ok = passou.filter(Boolean).length;
console.log(`\nRESULTADO: ${ok}/${total} PASS`);
process.exit(ok === total ? 0 : 1);
