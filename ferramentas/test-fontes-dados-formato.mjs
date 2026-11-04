// Teste real de fontes-dados-formato.mjs (import direto do módulo de produção, não um
// clone). Motivado pela auditoria vMix 30 §5.10 ("formatação opcional por campo:
// texto/número/milissegundos/data-hora, locale/fuso explícitos, validação e persistência;
// manter API anterior"). Cobre especialmente os casos de ambiguidade que o superprompt
// pede para não resolver silenciosamente: separador decimal, dia isolado sem fuso,
// unidade de epoch.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNumberValue, parseDateValue, formatText, formatNumber, formatMilliseconds,
  formatDateLike, normalizeFieldFormat, applyFieldFormat, FORMAT_TYPES,
} from './fontes-dados-formato.mjs';

// ---- parseNumberValue: a regra de ambiguidade decimal ----
test('parseNumberValue: número simples com ponto decimal', () => {
  assert.equal(parseNumberValue('1234.5'), 1234.5);
});
test('parseNumberValue: só vírgula (sem ponto) é lida como decimal pt-BR', () => {
  assert.equal(parseNumberValue('1234,5'), 1234.5);
});
test('parseNumberValue: ponto E vírgula — o separador que vem DEPOIS é o decimal (milhar en-US: 1.234,56 não ocorre; 1,234.56 sim)', () => {
  assert.equal(parseNumberValue('1,234.56'), 1234.56); // en-US: vírgula de milhar, ponto decimal
  assert.equal(parseNumberValue('1.234,56'), 1234.56); // pt-BR: ponto de milhar, vírgula decimal
});
test('parseNumberValue: texto vazio ou não numérico devolve null, nunca NaN silencioso', () => {
  assert.equal(parseNumberValue(''), null);
  assert.equal(parseNumberValue('   '), null);
  assert.equal(parseNumberValue('abc'), null);
});
test('parseNumberValue: negativo e científico continuam válidos', () => {
  assert.equal(parseNumberValue('-42'), -42);
  assert.equal(parseNumberValue(String(1.5e3)), 1500);
});

// ---- parseDateValue: a regra de ambiguidade de fuso em data isolada ----
test('parseDateValue: "AAAA-MM-DD" vira meia-noite LOCAL, não UTC (o risco real documentado no módulo)', () => {
  const d = parseDateValue('2026-11-04');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 10); // novembro = índice 10
  assert.equal(d.getDate(), 4);
  assert.equal(d.getHours(), 0, 'deve ser meia-noite no fuso local da máquina, não deslocado por UTC');
});
test('parseDateValue: epoch em milissegundos (padrão) é lido como tal', () => {
  const d = parseDateValue('0', { epochUnit: 'milliseconds' });
  assert.equal(d.getTime(), 0);
});
test('parseDateValue: epoch em segundos só quando epochUnit="seconds" é explícito (nunca adivinhado pela quantidade de dígitos)', () => {
  const d = parseDateValue('1000', { epochUnit: 'seconds' });
  assert.equal(d.getTime(), 1000 * 1000);
  const comoMs = parseDateValue('1000', { epochUnit: 'milliseconds' });
  assert.equal(comoMs.getTime(), 1000, 'o mesmo texto "1000" deve dar resultados DIFERENTES conforme epochUnit, nunca adivinhado');
});
test('parseDateValue: texto vazio ou data inválida devolve null, nunca "Invalid Date" silenciosa', () => {
  assert.equal(parseDateValue(''), null);
  assert.equal(parseDateValue('não é uma data'), null);
});
test('parseDateValue: string ISO com hora e fuso explícito (Z) é um instante inequívoco, sem o risco de "só data"', () => {
  const d = parseDateValue('2026-11-04T10:00:00Z');
  assert.equal(d.toISOString(), '2026-11-04T10:00:00.000Z');
});

// ---- formatText: sempre disponível, nunca lança ----
test('formatText: apara espaços e nunca lança para valores estranhos', () => {
  assert.equal(formatText('  Olá  '), 'Olá');
  assert.equal(formatText(null), '');
  assert.equal(formatText(undefined), '');
  assert.equal(formatText(42), '42');
});

// ---- formatNumber ----
test('formatNumber: separador de milhar e decimais em pt-BR (padrão do projeto)', () => {
  assert.equal(formatNumber('1234567.8', { decimals: 1 }), '1.234.567,8');
});
test('formatNumber: zero decimais por padrão', () => {
  assert.equal(formatNumber('42.9'), '43'); // Intl.NumberFormat arredonda, não truncate -- comportamento documentado do Intl, não escondido
});
test('formatNumber: prefixo e sufixo aplicados ao redor do número formatado', () => {
  assert.equal(formatNumber('1500', { decimals: 0, prefix: 'R$ ', suffix: '' }), 'R$ 1.500');
  assert.equal(formatNumber('10', { suffix: ' km/h' }), '10 km/h');
});
test('formatNumber: thousands=false remove o separador de milhar', () => {
  assert.equal(formatNumber('1234', { thousands: false }), '1234');
});
test('formatNumber: valor não numérico cai de volta para texto cru, sem lançar', () => {
  assert.equal(formatNumber('não é número'), 'não é número');
});

// ---- formatMilliseconds: duração, não data de calendário ----
test('formatMilliseconds: mm:ss é o padrão', () => {
  assert.equal(formatMilliseconds(String(5 * 60000 + 30000)), '05:30');
});
test('formatMilliseconds: hh:mm:ss para durações longas', () => {
  assert.equal(formatMilliseconds(String(3661000), { style: 'hh:mm:ss' }), '01:01:01');
});
test('formatMilliseconds: mm:ss.mmm preserva a casa de milissegundos', () => {
  assert.equal(formatMilliseconds('1234', { style: 'mm:ss.mmm' }), '00:01.234');
});
test('formatMilliseconds: style "seconds" com decimais explícitos', () => {
  assert.equal(formatMilliseconds('1500', { style: 'seconds', decimals: 1 }), '1.5');
});
test('formatMilliseconds: negativo é tratado como zero, nunca um relógio andando pra trás', () => {
  assert.equal(formatMilliseconds('-500'), '00:00');
});

// ---- formatDateLike: date / time / datetime, locale e fuso explícitos ----
test('formatDateLike "date": formato dd/mm/aaaa em pt-BR', () => {
  assert.equal(formatDateLike('2026-11-04', 'date'), '04/11/2026');
});
test('formatDateLike "time": 24h por padrão (ampm=false), com segundos', () => {
  const r = formatDateLike('2026-11-04T15:30:45', 'time');
  assert.match(r, /^15:30:45$/);
});
test('formatDateLike "time": ampm=true usa 12h com AM/PM', () => {
  const r = formatDateLike('2026-11-04T15:30:00', 'time', { ampm: true, seconds: false });
  assert.match(r, /03:30/);
  assert.match(r.toUpperCase(), /PM/);
});
test('formatDateLike "datetime": combina data e hora', () => {
  const r = formatDateLike('2026-11-04T08:05:00', 'datetime', { seconds: false });
  assert.match(r, /04\/11\/2026/);
  assert.match(r, /08:05/);
});
test('formatDateLike: offset desloca o instante antes de exibir (mesma técnica de textoRelogio dos relógios de produção)', () => {
  const semOffset = formatDateLike('2026-11-04T23:00:00Z', 'time', { offset: 0, seconds: false });
  const comOffset = formatDateLike('2026-11-04T23:00:00Z', 'time', { offset: 3, seconds: false });
  assert.notEqual(semOffset, comOffset, 'offset diferente de zero deve produzir uma hora diferente');
});
test('formatDateLike: entrada que não é data nenhuma cai para texto cru', () => {
  assert.equal(formatDateLike('não é uma data', 'date'), 'não é uma data');
});

// ---- normalizeFieldFormat: nunca confia no payload crú, mesmo papel de filterSettings()/isoRecordingOptions() ----
test('normalizeFieldFormat: tipo desconhecido ou ausente cai para "text"', () => {
  assert.deepEqual(normalizeFieldFormat({}), { type: 'text', locale: 'pt-BR' });
  assert.deepEqual(normalizeFieldFormat({ type: 'nao-existe' }), { type: 'text', locale: 'pt-BR' });
});
test('normalizeFieldFormat: todos os FORMAT_TYPES documentados produzem uma especificação válida', () => {
  for (const type of FORMAT_TYPES) {
    const spec = normalizeFieldFormat({ type });
    assert.equal(spec.type, type);
  }
});
test('normalizeFieldFormat: locale fora do padrão BCP-47 cai para pt-BR, nunca passa adiante um valor perigoso', () => {
  assert.equal(normalizeFieldFormat({ type: 'number', locale: '<script>' }).locale, 'pt-BR');
  assert.equal(normalizeFieldFormat({ type: 'number', locale: 'en-US' }).locale, 'en-US');
});
test('normalizeFieldFormat: decimais fora de 0..6 (number) são grampeados para o padrão', () => {
  assert.equal(normalizeFieldFormat({ type: 'number', decimals: 99 }).decimals, 0);
  assert.equal(normalizeFieldFormat({ type: 'number', decimals: -1 }).decimals, 0);
  assert.equal(normalizeFieldFormat({ type: 'number', decimals: 3 }).decimals, 3);
});
test('normalizeFieldFormat: offset (date/time/datetime) é grampeado em -12..14, igual ao campo dos relógios de produção', () => {
  assert.equal(normalizeFieldFormat({ type: 'time', offset: 99 }).offset, 14);
  assert.equal(normalizeFieldFormat({ type: 'time', offset: -99 }).offset, -12);
  assert.equal(normalizeFieldFormat({ type: 'time', offset: -3 }).offset, -3);
});
test('normalizeFieldFormat: style de milliseconds fora da lista permitida cai para "mm:ss"', () => {
  assert.equal(normalizeFieldFormat({ type: 'milliseconds', style: 'inventado' }).style, 'mm:ss');
  assert.equal(normalizeFieldFormat({ type: 'milliseconds', style: 'hh:mm:ss' }).style, 'hh:mm:ss');
});
test('normalizeFieldFormat: prefix/suffix são truncados em 20 caracteres', () => {
  const longo = 'x'.repeat(50);
  assert.equal(normalizeFieldFormat({ type: 'number', prefix: longo }).prefix.length, 20);
});

// ---- applyFieldFormat: nunca lança, mesmo com especificação corrompida ----
test('applyFieldFormat: sem especificação (campo sem formato configurado) devolve texto cru -- zero regressão', () => {
  assert.equal(applyFieldFormat('  valor  ', undefined), 'valor');
  assert.equal(applyFieldFormat('  valor  ', null), 'valor');
});
test('applyFieldFormat: cada tipo normalizado produz o formato correspondente de ponta a ponta', () => {
  assert.equal(applyFieldFormat('1500', normalizeFieldFormat({ type: 'number', decimals: 2 })), '1.500,00');
  assert.equal(applyFieldFormat('65000', normalizeFieldFormat({ type: 'milliseconds' })), '01:05');
  assert.equal(applyFieldFormat('2026-11-04', normalizeFieldFormat({ type: 'date' })), '04/11/2026');
});
test('applyFieldFormat: nunca lança mesmo com spec.type corrompido depois de normalizado (robustez de produção)', () => {
  assert.doesNotThrow(() => applyFieldFormat('x', { type: 'quebrado-de-propósito' }));
});
