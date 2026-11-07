// Verifica, sem DOM, que o template de texto do assistente de primeira execucao
// (painel/remoto/primeira-execucao.js, etapa "inventario") nunca afirma que o
// Resizable BAR esta "ativo"/"ligado" -- so relata o sinal de tamanho de BAR1,
// no mesmo espirito de rebar-diagnostico.mjs e diagnostico-maquina.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'painel', 'remoto', 'primeira-execucao.js');
const src = readFileSync(FILE, 'utf8');

test('primeira-execucao.js nunca usa vocabulario que afirme ReBAR ativo/ligado', () => {
  // The three real status strings must be present...
  for (const status of ['bar1_large', 'bar1_legacy', 'undetermined']) {
    assert.ok(src.includes(status), `status "${status}" ausente do template`);
  }
  // ...and the UI copy must stay in the hedged "signal, not a toggle" register:
  // the 3Mix itself never claims to turn ReBAR on, confirm it, or control it.
  assert.match(src, /não é um recurso que o 3Mix liga/i);
  assert.match(src, /não controla isso/i);
  assert.ok(!/\b3mix\b.{0,60}(ativ[ao]|ligou|habilitou|confirma a negociação)\b/i.test(src), '3Mix nao deve se afirmar como quem ativa/confirma o ReBAR');
});

test('template so renderiza a linha quando i.resizableBar existe (sem fabricar dado ausente)', () => {
  assert.match(src, /i\.resizableBar\s*\?/);
});
