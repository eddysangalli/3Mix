// Teste real de integração da UI: extrai formatExtrasHtml()/readFormat() exatamente como
// estão em painel/remoto/dados.js (mesma técnica de extração por regex de
// test-clock-message.mjs/test-peak-hold.mjs -- não reimplementa a lógica). O projeto não usa
// jsdom/happy-dom em lugar nenhum, então o "DOM" aqui é um conjunto mínimo de objetos à mão
// com os métodos que o trecho real chama (querySelectorAll por seletor de atributo,
// .dataset, .value, .checked) -- real o bastante para provar o contrato entre as duas
// funções, sem fingir um navegador inteiro.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createContext, runInContext } from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(resolve(root, 'painel/remoto/dados.js'), 'utf8');

function extract(nome, inicio, fimPadrao) {
  const re = new RegExp(` function ${nome}\\([^)]*\\)\\{[\\s\\S]*?\\n ${fimPadrao}`);
  const m = re.exec(src);
  assert.ok(m, `${nome}() deve continuar existindo em dados.js, no formato esperado`);
  return m[0];
}
const formatExtrasHtmlSrc = extract('formatExtrasHtml', '', '}\n');
const readFormatSrc = extract('readFormat', '', '}\n');

// ---- formatExtrasHtml: função pura que só devolve uma string HTML; sem DOM necessário ----
{
  const sandbox = { esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) };
  createContext(sandbox);
  runInContext(formatExtrasHtmlSrc + '\nthis.formatExtrasHtml = formatExtrasHtml;', sandbox, { filename: 'dados.js (formatExtrasHtml extraído)' });
  const { formatExtrasHtml } = sandbox;

  const semTipo = formatExtrasHtml('subtitle', undefined);
  assert.equal(semTipo, '', 'tipo "text" (ausência de spec) não produz nenhum controle extra');

  const numero = formatExtrasHtml('subtitle', { type: 'number', decimals: 2 });
  assert.match(numero, /data-format-param="decimals"/);
  assert.match(numero, /data-format-field="subtitle"/);
  assert.match(numero, /value="2"/);

  const ms = formatExtrasHtml('duracao', { type: 'milliseconds', style: 'hh:mm:ss' });
  assert.match(ms, /data-format-param="style"/);
  assert.match(ms, /value="hh:mm:ss" selected/);

  const hora = formatExtrasHtml('inicio', { type: 'time', offset: 3, ampm: true });
  assert.match(hora, /data-format-param="offset"/);
  assert.match(hora, /value="3"/);
  assert.match(hora, /data-format-param="ampm"/);
  assert.match(hora, /checked/);

  const data = formatExtrasHtml('dia', { type: 'date', offset: -3 });
  assert.doesNotMatch(data, /data-format-param="ampm"/, '"date" (sem hora) não oferece opção AM/PM');
}

// ---- readFormat: precisa de um "DOM" mínimo -- construído à mão, não reimplementando a
// lógica, só os elementos que um operador real teria produzido ao interagir com a tela ----
function fakeMappingContainer(elements) {
  const matches = (el, sel) => {
    const attrs = [...sel.matchAll(/\[([a-zA-Z-]+)(?:="([^"]*)")?\]/g)];
    return attrs.every(([, name, value]) => {
      const attr = { 'data-format-type': el.dataset.formatType, 'data-format-field': el.dataset.formatField, 'data-format-param': el.dataset.formatParam }[name];
      return value === undefined ? attr !== undefined : attr === value;
    });
  };
  return {
    querySelectorAll: (sel) => elements.filter((el) => matches(el, sel)),
    querySelector: (sel) => elements.find((el) => matches(el, sel)) || null,
  };
}

{
  const sandbox2 = {};
  createContext(sandbox2);
  // el('data-mapping') é a única dependência externa de readFormat(); injeto diretamente.
  sandbox2.el = (id) => (id === 'data-mapping' ? sandbox2.__mapping : null);
  runInContext(readFormatSrc + '\nthis.readFormat = readFormat;', sandbox2, { filename: 'dados.js (readFormat extraído)' });

  // Cenário: campo "subtitle" formatado como número com 2 decimais; campo "title" deixado
  // como "text" (não deve aparecer no resultado -- mesma regra de zero regressão).
  sandbox2.__mapping = fakeMappingContainer([
    { dataset: { formatType: '1', formatField: 'subtitle' }, value: 'number' },
    { dataset: { formatParam: 'decimals', formatField: 'subtitle' }, value: '2' },
    { dataset: { formatType: '1', formatField: 'title' }, value: 'text' },
  ]);
  const formato = sandbox2.readFormat();
  // Objeto produzido dentro do contexto vm (outro "realm") -- compara por JSON, não por
  // identidade de protótipo, que deepStrictEqual exigiria cross-realm sem necessidade real.
  assert.equal(JSON.stringify(formato), JSON.stringify({ subtitle: { type: 'number', decimals: 2 } }), 'campo "text" fica fora; campo formatado traz type e decimals lidos dos elementos reais');
}

{
  const sandbox3 = {};
  createContext(sandbox3);
  sandbox3.el = (id) => (id === 'data-mapping' ? sandbox3.__mapping : null);
  runInContext(readFormatSrc + '\nthis.readFormat = readFormat;', sandbox3, { filename: 'dados.js (readFormat extraído)' });
  sandbox3.__mapping = fakeMappingContainer([
    { dataset: { formatType: '1', formatField: 'inicio' }, value: 'time' },
    { dataset: { formatParam: 'offset', formatField: 'inicio' }, value: '-3' },
    { dataset: { formatParam: 'ampm', formatField: 'inicio' }, checked: true },
  ]);
  const formato = sandbox3.readFormat();
  assert.equal(JSON.stringify(formato), JSON.stringify({ inicio: { type: 'time', offset: -3, ampm: true } }));
}

{
  // Nenhum campo formatado (todos "text") -- readFormat() deve devolver undefined, não {},
  // pra data-bind não mandar um objeto "format" vazio ao backend sem necessidade.
  const sandbox4 = {};
  createContext(sandbox4);
  sandbox4.el = (id) => (id === 'data-mapping' ? sandbox4.__mapping : null);
  runInContext(readFormatSrc + '\nthis.readFormat = readFormat;', sandbox4, { filename: 'dados.js (readFormat extraído)' });
  sandbox4.__mapping = fakeMappingContainer([{ dataset: { formatType: '1', formatField: 'title' }, value: 'text' }]);
  assert.equal(sandbox4.readFormat(), undefined);
}

console.log('PASS: UI de formatação de Fontes de Dados (formatExtrasHtml, readFormat, extraídos do arquivo real)');
