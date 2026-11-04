// Presets de latencia/transporte SRT (Fase 6 do superprompt: "melhorar presets, listener/
// caller, telemetria, reconexao e documentacao" de SRT). Parte que cabe em Node/API sem motor
// ligado nem rebuild: os parametros abaixo (latency/oheadbw/tlpktdrop/nakreport/passphrase)
// sao lidos pelo motor nativo direto da query string da URL de conexao -- confirmado lendo
// 3mix-engine/plugins/obs-ffmpeg/obs-ffmpeg-srt.h (av_find_info_tag), nao adicionam nenhum
// parametro que o motor nao aceite hoje. Nenhuma mudanca no C++/motor nativo, nenhum rebuild.
//
// Faltam, fora do escopo Node (registrado, nao fabricado): telemetria de RTT/perda real
// (exigiria expor srt_bstats do lado nativo, hoje so capturado pro log via srt_getlasterror/
// srt_getrejectreason -- ver obs-ffmpeg-srt.h linhas ~95-146) e reconexao configuravel por
// SRT especificamente (o motor usa Reconnect/RetryDelay/MaxRetries genericos de qualquer
// output, nao algo dedicado a SRT).

// Faixas e defaults conforme a especificacao do protocolo SRT (Haivision) e os limites que o
// proprio parser do motor aceita (strtoll/strtol sem cap explicito no C -- os limites abaixo
// sao os recomendados pela especificacao do protocolo, nao limitacao do parser).
export const SRT_LATENCY_MIN_MS = 20;
export const SRT_LATENCY_MAX_MS = 60000;
export const SRT_OVERHEAD_MIN_PERCENT = 1;
export const SRT_OVERHEAD_MAX_PERCENT = 100;

// Três cenários reais de broadcast, não um número arbitrário: a documentação oficial do SRT
// recomenda latência >= 3-4x o RTT esperado do caminho de rede. LAN local tem RTT tipicamente
// <5ms; internet de contribuição costuma variar bastante; distribuição ao vivo prioriza menor
// atraso possível, aceitando mais risco de pacote perdido/descartado.
export const SRT_PRESETS = {
  'contribuicao-lan': {
    label: 'Contribuição · LAN local',
    description: 'Mesma rede local, RTT baixo e estável. Latência mínima recomendada pela especificação SRT para esse caso.',
    latencyMs: 120,
    overheadPercent: 25,
    dropaDelayedPackets: true,
    nakReport: true
  },
  'contribuicao-internet': {
    label: 'Contribuição · Internet (WAN)',
    description: 'Enlace de internet variável (contribuição remota, 4G/5G, Wi-Fi externo). Latência maior para absorver jitter e perda sem travar o quadro.',
    latencyMs: 2000,
    overheadPercent: 25,
    dropaDelayedPackets: true,
    nakReport: true
  },
  'distribuicao-baixa-latencia': {
    label: 'Distribuição · Baixa latência',
    description: 'Prioriza o menor atraso possível para o espectador final; aceita mais descarte de pacote sob perda de rede.',
    latencyMs: 200,
    overheadPercent: 15,
    dropaDelayedPackets: true,
    nakReport: true
  }
};

const isFiniteInt = (v) => Number.isInteger(v) && Number.isFinite(v);

/** Valida e normaliza parâmetros de transporte SRT. Lança erro em português nas mesmas condições que o resto do projeto. */
export function validateSrtTransport(data = {}, presetId) {
  const preset = presetId !== undefined ? SRT_PRESETS[presetId] : undefined;
  if (presetId !== undefined && !preset) throw Error('Preset de transporte SRT desconhecido');
  const latencyMs = Number(data.latencyMs ?? preset?.latencyMs);
  const overheadPercent = Number(data.overheadPercent ?? preset?.overheadPercent);
  const dropaDelayedPackets = data.dropaDelayedPackets ?? preset?.dropaDelayedPackets ?? true;
  const nakReport = data.nakReport ?? preset?.nakReport ?? true;
  const passphrase = data.passphrase !== undefined ? String(data.passphrase) : undefined;
  if (!isFiniteInt(latencyMs) || latencyMs < SRT_LATENCY_MIN_MS || latencyMs > SRT_LATENCY_MAX_MS) throw Error(`Latência SRT deve ser um inteiro entre ${SRT_LATENCY_MIN_MS} e ${SRT_LATENCY_MAX_MS} ms`);
  if (!isFiniteInt(overheadPercent) || overheadPercent < SRT_OVERHEAD_MIN_PERCENT || overheadPercent > SRT_OVERHEAD_MAX_PERCENT) throw Error(`Overhead de banda SRT deve ser um inteiro entre ${SRT_OVERHEAD_MIN_PERCENT} e ${SRT_OVERHEAD_MAX_PERCENT}%`);
  if (typeof dropaDelayedPackets !== 'boolean') throw Error('dropaDelayedPackets deve ser verdadeiro ou falso');
  if (typeof nakReport !== 'boolean') throw Error('nakReport deve ser verdadeiro ou falso');
  // AES128/192/256 exige passphrase com 10-79 bytes (requisito real da libsrt: SRTO_PASSPHRASE
  // rejeita strings fora dessa faixa, não é um limite inventado aqui).
  if (passphrase !== undefined && passphrase !== '' && (passphrase.length < 10 || passphrase.length > 79)) throw Error('Senha de criptografia SRT deve ter entre 10 e 79 caracteres (ou vazia para desligar)');
  return { latencyMs, overheadPercent, dropaDelayedPackets, nakReport, ...(passphrase !== undefined ? { passphrase } : {}) };
}

/**
 * Monta a query string de transporte SRT a partir de parâmetros já validados
 * (validateSrtTransport). Não decodifica nem modifica o resto da URL do servidor --
 * só anexa/substitui os parâmetros de transporte reconhecidos pelo motor nativo.
 */
export function buildSrtQueryParams(transport) {
  const params = new URLSearchParams();
  params.set('latency', String(transport.latencyMs));
  params.set('oheadbw', String(transport.overheadPercent));
  params.set('tlpktdrop', transport.dropaDelayedPackets ? '1' : '0');
  params.set('nakreport', transport.nakReport ? '1' : '0');
  if (transport.passphrase) params.set('passphrase', transport.passphrase);
  return params;
}

/**
 * Aplica os parâmetros de transporte SRT a uma URL de servidor srt://..., preservando
 * host/porta/query existentes e substituindo apenas as chaves de transporte reconhecidas.
 * Não toca em servidores de outros protocolos (rtmp/rist/hls) -- devolve a URL original.
 */
export function applySrtTransportToServer(server, transport) {
  const url = String(server || '');
  if (!/^srt:\/\//i.test(url)) return url;
  const [base, query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  const next = buildSrtQueryParams(transport);
  for (const [key, value] of next.entries()) params.set(key, value);
  const serialized = params.toString();
  return serialized ? `${base}?${serialized}` : base;
}
