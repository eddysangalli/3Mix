// Formatação por campo para os vínculos de Fontes de Dados (vMix 30 §5.10: "texto, número,
// milissegundos, data, hora, data e hora combinadas"). Funções puras, sem I/O -- plugam em
// DataSources.mapped() (fontes-dados.mjs) como uma transformação OPCIONAL por campo, nunca
// um segundo mecanismo de alimentação de GT: a leitura CSV/JSON/XLSX (parse()), o vínculo
// (bind()/mapping) e a publicação (controle-producao.mjs publishData()) continuam exatamente
// como estão. Um campo sem formato configurado continua saindo como a string crua da célula,
// byte a byte -- zero regressão para todo vínculo configurado antes desta extensão existir.
export const FORMAT_TYPES = Object.freeze(['text', 'number', 'milliseconds', 'date', 'time', 'datetime']);

// locale: tag BCP-47 (padrão 'pt-BR', a mesma única locale já usada em todo o resto do
// projeto -- toLocaleDateString('pt-BR') etc. em painel/remoto/*.js). Nunca adivinhada do
// navegador: sempre explícita e salva na própria especificação do campo, a mesma decisão já
// tomada para o "offset" dos relógios de produção (relogios.snippet.js) -- salvo, não lido
// do sistema a cada renderização.
const DEFAULT_LOCALE = 'pt-BR';
const LOCALE_PATTERN = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;

function normalizeLocale(value) {
  return typeof value === 'string' && LOCALE_PATTERN.test(value) ? value : DEFAULT_LOCALE;
}

// Aceita tanto '1234.56' quanto '1234,56' (separador decimal pt-BR), mas só de forma
// inequívoca: um valor com '.' E ',' usa o que vier por último como decimal (o outro como
// separador de milhar) -- é assim que pt-BR e en-US escrevem números grandes. Um valor só
// com ',' e sem '.' é lido como vírgula decimal (convenção pt-BR). Este é a ÚNICA escolha
// de ambiguidade desta função que o "não faça conversões ambíguas silenciosamente" do
// superprompt exige documentar em vez de simplesmente acertar: células de CSV/JSON/XLSX
// quase sempre chegam com '.' decimal puro (número JSON, célula de planilha); este trecho
// de vírgula serve para uma coluna de texto já digitada ou formatada em pt-BR por alguém.
export function parseNumberValue(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
  let normalized;
  if (lastDot >= 0 && lastComma >= 0) normalized = lastDot > lastComma ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  else if (lastComma >= 0) normalized = s.replace(',', '.');
  else normalized = s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

// Interpreta o valor cru como um instante no tempo (epoch em ms, igual a Date.now()/
// createdAt/updatedAt já usados em todo o projeto). epochUnit é SEMPRE explícito na
// especificação salva, nunca adivinhado pela quantidade de dígitos (a forma mais comum de
// "conversão ambígua silenciosa" em bibliotecas de data) -- o padrão é milissegundos (a
// convenção universal do próprio 3Mix) e o operador troca para segundos quando a fonte for
// um epoch Unix (comum em exports e APIs de terceiros).
//
// Data isolada "AAAA-MM-DD": o construtor padrão new Date('2026-11-04') é UTC à meia-noite
// pela especificação ECMA-262 -- ao renderizar depois em fuso local (toLocaleDateString,
// usado em todo o projeto), isso desloca silenciosamente o dia exibido pra trás em qualquer
// máquina a oeste de UTC (o Brasil inteiro). Por isso o componente Y/M/D é extraído e
// construído como meia-noite LOCAL diretamente, nunca passando pelo parser UTC do texto --
// essa é exatamente a "conversão ambígua silenciosa" que o superprompt veda.
// "AAAA-MM-DDThh:mm:ss" sem fuso (sem Z nem +hh:mm) já é local pela mesma especificação, e
// uma string com Z/offset explícito já é um instante inequívoco -- os dois casos não
// precisam de tratamento especial, só o caso "só data" tem esse risco real.
export function parseDateValue(raw, { epochUnit = 'milliseconds' } = {}) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    const ms = epochUnit === 'seconds' ? n * 1000 : n;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dateOnly) {
    const [, y, m, day] = dateOnly;
    const d = new Date(Number(y), Number(m) - 1, Number(day));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Soma horas inteiras ao instante -- mesma técnica já usada em textoRelogio()
// (multiview-modelos.js: "new Date(agora.getTime() + fuso * 3600000)"): desloca o instante e
// deixa a renderização seguinte (toLocaleString, sempre em fuso da máquina local, igual ao
// resto do projeto) fazer a conversão de exibição. offset=0 (padrão) mostra exatamente a
// hora local da máquina, sem nenhuma segunda conversão escondida.
function withOffset(date, offsetHours) {
  return offsetHours ? new Date(date.getTime() + offsetHours * 3600000) : date;
}

export function formatText(raw) {
  return String(raw ?? '').trim();
}

export function formatNumber(raw, { locale = DEFAULT_LOCALE, decimals = 0, thousands = true, prefix = '', suffix = '' } = {}) {
  const n = parseNumberValue(raw);
  if (n === null) return formatText(raw);
  const texto = new Intl.NumberFormat(normalizeLocale(locale), { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: thousands !== false }).format(n);
  return String(prefix || '') + texto + String(suffix || '');
}

// "Milissegundos" no sentido do vMix: uma DURAÇÃO (cronômetro, tempo restante, tempo de
// jogo), não um instante de calendário -- por isso não usa Date/Intl.DateTimeFormat, só
// aritmética de divisão. style: 'mm:ss' (padrão), 'hh:mm:ss', 'mm:ss.mmm' ou 'seconds'.
export function formatMilliseconds(raw, { style = 'mm:ss', decimals = 0 } = {}) {
  const n = parseNumberValue(raw);
  if (n === null) return formatText(raw);
  const totalMs = Math.max(0, Math.round(n));
  if (style === 'seconds') return (totalMs / 1000).toFixed(Math.min(3, Math.max(0, Number.isInteger(decimals) ? decimals : 0)));
  const totalSeconds = Math.floor(totalMs / 1000);
  const hours = Math.floor(totalSeconds / 3600), minutes = Math.floor((totalSeconds % 3600) / 60), seconds = totalSeconds % 60, ms = totalMs % 1000;
  const pad = (v, len = 2) => String(v).padStart(len, '0');
  if (style === 'hh:mm:ss') return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  if (style === 'mm:ss.mmm') return `${pad(minutes)}:${pad(seconds)}.${pad(ms, 3)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

// kind: 'date' | 'time' | 'datetime'. offset em horas inteiras, -12 a 14 (mesma faixa já
// usada no campo "Diferença de horas (outro fuso)" dos relógios de produção).
export function formatDateLike(raw, kind, { locale = DEFAULT_LOCALE, offset = 0, epochUnit = 'milliseconds', ampm = false, seconds = true } = {}) {
  const date = parseDateValue(raw, { epochUnit });
  if (!date) return formatText(raw);
  const shifted = withOffset(date, Number(offset) || 0);
  const options = {};
  if (kind === 'date' || kind === 'datetime') Object.assign(options, { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (kind === 'time' || kind === 'datetime') Object.assign(options, { hour: '2-digit', minute: '2-digit', ...(seconds !== false ? { second: '2-digit' } : {}), hour12: ampm === true });
  return new Intl.DateTimeFormat(normalizeLocale(locale), options).format(shifted);
}

// Valida e normaliza a especificação de formato de UM campo antes de salvar (mesmo papel de
// filterSettings()/isoRecordingOptions() em outros módulos: nunca confia no payload crú).
export function normalizeFieldFormat(spec = {}) {
  const type = FORMAT_TYPES.includes(spec?.type) ? spec.type : 'text';
  const base = { type, locale: normalizeLocale(spec?.locale) };
  if (type === 'number') {
    const decimals = Number(spec?.decimals);
    base.decimals = Number.isInteger(decimals) && decimals >= 0 && decimals <= 6 ? decimals : 0;
    base.thousands = spec?.thousands !== false;
    base.prefix = typeof spec?.prefix === 'string' ? spec.prefix.slice(0, 20) : '';
    base.suffix = typeof spec?.suffix === 'string' ? spec.suffix.slice(0, 20) : '';
  } else if (type === 'milliseconds') {
    base.style = ['hh:mm:ss', 'mm:ss', 'mm:ss.mmm', 'seconds'].includes(spec?.style) ? spec.style : 'mm:ss';
    const decimals = Number(spec?.decimals);
    base.decimals = base.style === 'seconds' && Number.isInteger(decimals) && decimals >= 0 && decimals <= 3 ? decimals : 0;
  } else if (type === 'date' || type === 'time' || type === 'datetime') {
    const offset = Number(spec?.offset);
    base.offset = Number.isFinite(offset) ? Math.max(-12, Math.min(14, offset)) : 0;
    base.epochUnit = spec?.epochUnit === 'seconds' ? 'seconds' : 'milliseconds';
    if (type !== 'date') { base.ampm = spec?.ampm === true; base.seconds = spec?.seconds !== false; }
  }
  return base;
}

// Aplica o formato já normalizado a um valor de célula. Nunca lança: uma célula inesperada
// ou um formato mal configurado deve cair de volta pro texto cru, nunca interromper uma
// publicação de GT em transmissão ao vivo (mesma filosofia de robustez de onMeters()/
// publishData() no resto do projeto -- preferir mostrar algo imperfeito a travar o ar).
export function applyFieldFormat(raw, spec) {
  if (!spec) return formatText(raw);
  try {
    switch (spec.type) {
      case 'number': return formatNumber(raw, spec);
      case 'milliseconds': return formatMilliseconds(raw, spec);
      case 'date': return formatDateLike(raw, 'date', spec);
      case 'time': return formatDateLike(raw, 'time', spec);
      case 'datetime': return formatDateLike(raw, 'datetime', spec);
      default: return formatText(raw);
    }
  } catch { return formatText(raw); }
}
