// Vídeo entrelaçado real (Fase 6 do superprompt: "validar vídeo entrelaçado nas entradas,
// preview, saída e gravação conforme hardware e pipeline"). O motor nativo (libobs) já tem o
// contrato completo via obs-websocket padrão -- NÃO é um recurso exclusivo do fork 3Mix, nem
// exige vendor request customizado nem rebuild: GetInputDeinterlaceMode/SetInputDeinterlaceMode
// e Get/SetInputDeinterlaceFieldOrder (confirmado lendo
// 3mix-engine/plugins/obs-websocket/src/requesthandler/RequestHandler_Inputs.cpp e o mapeamento
// de enum<->string em utils/Json.h). Restrito a fontes OBS_SOURCE_ASYNC (câmeras de captura
// reais: win-dshow, decklink, aja, e arquivos via obs-ffmpeg-source -- confirmado por grep nos
// plugins nativos) -- nunca em cenas/composições/browser_source, o motor recusa com
// InvalidResourceState nesses casos, não é limitação inventada aqui.
//
// Modos reais (9), na ordem do enum nativo (obs.h / NLOHMANN_JSON_SERIALIZE_ENUM em Json.h):
export const DEINTERLACE_MODES = [
  'OBS_DEINTERLACE_MODE_DISABLE',
  'OBS_DEINTERLACE_MODE_DISCARD',
  'OBS_DEINTERLACE_MODE_RETRO',
  'OBS_DEINTERLACE_MODE_BLEND',
  'OBS_DEINTERLACE_MODE_BLEND_2X',
  'OBS_DEINTERLACE_MODE_LINEAR',
  'OBS_DEINTERLACE_MODE_LINEAR_2X',
  'OBS_DEINTERLACE_MODE_YADIF',
  'OBS_DEINTERLACE_MODE_YADIF_2X'
];
export const DEINTERLACE_FIELD_ORDERS = ['OBS_DEINTERLACE_FIELD_ORDER_TOP', 'OBS_DEINTERLACE_FIELD_ORDER_BOTTOM'];

// Mesmo conjunto de inputKind já usado em audio-routing-producao.mjs (classificação 'camera')
// e efeitos-ptz.mjs (alvos reais de PTZ) para fontes de captura física -- mais obs-ffmpeg-source
// (arquivo 50i/59.94i) e aja/decklink confirmados OBS_SOURCE_ASYNC nos plugins nativos. Nenhuma
// suposição nova: reaproveita a mesma lista de tipos que o projeto já usa pra "fonte física real".
export const ASYNC_CAPTURE_KINDS = ['dshow_input', 'decklink-input', 'decklink_filter', 'aja_source', 'ffmpeg_source'];

/** Um rótulo em português por modo, para a UI -- não altera o valor enviado ao motor. */
export const DEINTERLACE_MODE_LABELS = {
  OBS_DEINTERLACE_MODE_DISABLE: 'Desligado',
  OBS_DEINTERLACE_MODE_DISCARD: 'Descartar um campo (mais rápido, menos nítido)',
  OBS_DEINTERLACE_MODE_RETRO: 'Retro (estilo linha dupla clássico)',
  OBS_DEINTERLACE_MODE_BLEND: 'Mesclar campos',
  OBS_DEINTERLACE_MODE_BLEND_2X: 'Mesclar campos (dobro de quadros)',
  OBS_DEINTERLACE_MODE_LINEAR: 'Interpolação linear',
  OBS_DEINTERLACE_MODE_LINEAR_2X: 'Interpolação linear (dobro de quadros)',
  OBS_DEINTERLACE_MODE_YADIF: 'YADIF (alta qualidade)',
  OBS_DEINTERLACE_MODE_YADIF_2X: 'YADIF (alta qualidade, dobro de quadros)'
};

/** Valida modo/ordem de campo antes de enviar ao motor. Lança erro em português nas mesmas condições do resto do projeto. */
export function validateDeinterlaceMode(mode) {
  if (!DEINTERLACE_MODES.includes(mode)) throw Error(`Modo de desentrelaçamento inválido; use um de: ${DEINTERLACE_MODES.join(', ')}`);
  return mode;
}
export function validateDeinterlaceFieldOrder(order) {
  if (!DEINTERLACE_FIELD_ORDERS.includes(order)) throw Error(`Ordem de campo inválida; use ${DEINTERLACE_FIELD_ORDERS.join(' ou ')}`);
  return order;
}

/**
 * Lê o estado real de desentrelaçamento de uma entrada via obs-websocket (comandos padrão,
 * não vendor request). Confirma primeiro que a entrada é de captura física/arquivo (as únicas
 * que o motor aceita) -- devolve supported:false sem lançar quando não for, para a UI poder
 * simplesmente ocultar o controle em vez de tratar erro.
 */
export async function readDeinterlace(obs, { inputName, inputKind }) {
  if (!ASYNC_CAPTURE_KINDS.includes(inputKind)) return { supported: false, reason: 'Esta entrada não é uma captura física/arquivo; o motor só desentrelaça esse tipo de fonte.' };
  try {
    const [modeResult, orderResult] = await Promise.all([
      obs.req('GetInputDeinterlaceMode', { inputName }),
      obs.req('GetInputDeinterlaceFieldOrder', { inputName })
    ]);
    return { supported: true, mode: modeResult.inputDeinterlaceMode, fieldOrder: orderResult.inputDeinterlaceFieldOrder };
  } catch (e) {
    // O motor recusa com InvalidResourceState quando a fonte concreta (apesar do kind) não é
    // async de fato (ex.: dshow_input sem dispositivo selecionado ainda) -- não inventa estado.
    return { supported: false, reason: e.message };
  }
}

/** Aplica modo/ordem de campo reais. Confirma por releitura que o motor de fato aceitou -- nunca retorna sucesso sem confirmação, mesmo padrão do resto do projeto (SetInputMute/GetInputMute etc.). */
export async function setDeinterlace(obs, { inputName, inputKind, mode, fieldOrder }) {
  if (!ASYNC_CAPTURE_KINDS.includes(inputKind)) throw Error('Esta entrada não é uma captura física/arquivo; o motor só desentrelaça esse tipo de fonte.');
  if (mode !== undefined) {
    validateDeinterlaceMode(mode);
    await obs.req('SetInputDeinterlaceMode', { inputName, inputDeinterlaceMode: mode });
  }
  if (fieldOrder !== undefined) {
    validateDeinterlaceFieldOrder(fieldOrder);
    await obs.req('SetInputDeinterlaceFieldOrder', { inputName, inputDeinterlaceFieldOrder: fieldOrder });
  }
  const confirmed = await readDeinterlace(obs, { inputName, inputKind });
  if (!confirmed.supported) throw Error('Motor não confirmou o desentrelaçamento após aplicar');
  if (mode !== undefined && confirmed.mode !== mode) throw Error('Motor não confirmou o modo de desentrelaçamento enviado');
  if (fieldOrder !== undefined && confirmed.fieldOrder !== fieldOrder) throw Error('Motor não confirmou a ordem de campo enviada');
  return confirmed;
}
