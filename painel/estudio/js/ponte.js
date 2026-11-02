// ════════════════════════════════════════════════════════════
// Ponte entre a interface e o motor 3Mix (libobs) via API local
// Descobre a porta real (mesma origem → 8088 → 18188..18198),
// assina o WebSocket de estado e envia comandos de operação.
// ════════════════════════════════════════════════════════════

import { estado, emitir } from "./estado.js";
import { marcarComandoAceito, marcarEstadoAplicado } from "./perf.js";

const CHAVE_CACHE = "3mix.api.origem";
let origem = null;
let socket = null;
let tentativas = 0;
let reconexao = null;

export const conexao = {
  ativa: false,
  motor: false,
  origem: null,
  ultimoErro: null
};

function comTimeout(promessa, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("tempo esgotado")), ms);
    promessa.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

async function saudavel(base) {
  try {
    const r = await comTimeout(fetch(`${base}/api/health`, { cache: "no-store" }), 700);
    if (!r.ok) return false;
    const dados = await r.json();
    return dados?.success === true || dados?.app === "FreeMix" || dados?.app === "3Mix";
  } catch {
    return false;
  }
}

function candidatos() {
  const lista = [];
  if (location.protocol.startsWith("http")) lista.push(location.origin);
  lista.push("http://127.0.0.1:8088");
  for (let p = 18188; p <= 18198; p++) lista.push(`http://127.0.0.1:${p}`);
  return [...new Set(lista)];
}

export async function detectar(forcar = false) {
  if (!forcar) {
    const salvo = sessionStorage.getItem(CHAVE_CACHE);
    if (salvo && (await saudavel(salvo))) return finalizar(salvo, true);
  }
  const resultados = await Promise.all(candidatos().map(async (base) => ({ base, ok: await saudavel(base) })));
  const achado = resultados.find((r) => r.ok);
  if (!achado) {
    conexao.origem = null;
    conexao.motor = false;
    emitir("conexao", conexao);
    return null;
  }
  return finalizar(achado.base, false);
}

function finalizar(base, cache) {
  origem = base;
  conexao.origem = base;
  if (!cache) sessionStorage.setItem(CHAVE_CACHE, base);
  emitir("conexao", conexao);
  return base;
}

export function baseApi() {
  return origem;
}

export function conectar() {
  if (!origem) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

  clearTimeout(reconexao);
  const wsUrl = origem.replace(/^http/, "ws") + "/ws";

  try {
    socket = new WebSocket(wsUrl);
  } catch (erro) {
    conexao.ultimoErro = String(erro);
    agendarReconexao();
    return;
  }

  socket.onopen = () => {
    tentativas = 0;
    conexao.ativa = true;
    conexao.ultimoErro = null;
    emitir("conexao", conexao);
  };

  socket.onmessage = (evento) => {
    let msg;
    try { msg = JSON.parse(evento.data); } catch { return; }
    tratarMensagem(msg);
  };

  socket.onclose = () => {
    conexao.ativa = false;
    emitir("conexao", conexao);
    agendarReconexao();
  };

  socket.onerror = () => {
    conexao.ultimoErro = "falha no WebSocket";
    emitir("conexao", conexao);
  };
}

function agendarReconexao() {
  tentativas++;
  const espera = Math.min(8000, 700 * tentativas);
  clearTimeout(reconexao);
  reconexao = setTimeout(async () => {
    if (!origem) await detectar(true);
    conectar();
  }, espera);
}

// ── tradução do estado do motor para o estado da interface ───

function acharEntrada(nome) {
  if (nome === undefined || nome === null) return null;
  const alvo = String(nome).trim().toLowerCase();
  return estado.entradas.find((e) => e.nome.toLowerCase() === alvo)
    || estado.entradas.find((e) => alvo.includes(e.nome.toLowerCase()))
    || null;
}

function tratarMensagem(msg) {
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "init" || msg.type === "state") {
    aplicarEstado(msg.data || {});
    return;
  }

  if (msg.type === "meters" || msg.type === "levels") {
    aplicarMedidores(msg.inputs || msg.data || []);
    return;
  }

  if (msg.type === "replay_state" && msg.data) {
    const d = msg.data;
    if (typeof d.rec === "boolean") {
      estado.replay.gravandoDisco = d.rec;
      if (d.duration) estado.replay.tempoGravacao = d.duration;
      emitir("replay", estado.replay);
    }
    return;
  }
}

export function aplicarEstado(d) {
  if (!d) return;
  conexao.motor = true;

  if (typeof d.program === "string") {
    const e = acharEntrada(d.program);
    if (e) estado.programa = e.id;
  }
  if (typeof d.preview === "string") {
    const e = acharEntrada(d.preview);
    if (e) estado.preview = e.id;
  }
  if (Array.isArray(d.inputs) && d.inputs.length) {
    const entradasMotor = d.inputs
      .filter((i) => i && i.name && !/^(REPLAY [AB]|3Mix Barramentos)$/i.test(i.name))
      .map((i, indice) => ({
        id: Number(i.number) || indice + 1,
        nome: String(i.name).toUpperCase(),
        tipo: /ffmpeg|vlc|media|playlist/i.test(String(i.type)) ? "player"
          : /scene|compos/i.test(String(i.type)) ? "composicao" : "camera",
        imagem: estado.entradas[indice % estado.entradas.length]?.imagem
      }));
    if (entradasMotor.length) estado.entradas = entradasMotor;
  }

  if (Array.isArray(d.audioInputs) && d.audioInputs.length) {
    for (const canal of estado.canais) {
      const achado = d.audioInputs.find((a) => String(a.name || "").toUpperCase().startsWith(canal.nome));
      if (achado) {
        if (typeof achado.volume === "number") canal.db = Number((20 * Math.log10(Math.max(0.001, achado.volume))).toFixed(1));
        if (typeof achado.muted === "boolean") canal.mudo = achado.muted;
      }
    }
  }

  // Lista real de cenas do projeto conectado — usada para resolver, por
  // aproximação de nome, qual cena cada DSK mockado deveria ligar/desligar
  // neste projeto específico (cada operador nomeia suas cenas diferente).
  if (Array.isArray(d.scenes)) estado.cenasDoMotor = d.scenes;

  // O payload real de overlay é { number, scene } — "scene" vazia = fora do
  // ar. Não existe "visible"/"active"/"onAir" na resposta do motor (eram
  // campos supostos, nunca enviados por controle-producao.mjs); checar por
  // eles sempre dava `undefined`, então o estado do DSK na UI nunca batia
  // com o motor depois de um F5. Corrigido para o campo que existe de fato.
  if (Array.isArray(d.overlays)) {
    estado.dsk.forEach((dsk) => {
      const achado = d.overlays.find((o) => Number(o.number) === dsk.id);
      if (!achado) return;
      dsk.noAr = !!achado.scene;
      if (achado.scene) dsk.cena = achado.scene;
      else if (dsk.cena === undefined) dsk.cena = null;
    });
  }

  if (typeof d.recording === "boolean") estado.gravando = d.recording;
  if (typeof d.streaming === "boolean") estado.transmitindo = d.streaming;
  if (typeof d.recordingTime === "number") estado.tempoRec = d.recordingTime;

  emitir("estado", estado);
}

function aplicarMedidores(lista) {
  if (!Array.isArray(lista)) return;
  const niveis = [];
  for (const item of lista) {
    const nome = String(item?.name || item?.input || "").toUpperCase();
    const nivel = Number(item?.level ?? item?.peak ?? item?.db ?? NaN);
    const canal = estado.canais.find((c) => nome && (nome === c.nome || nome.startsWith(c.nome)));
    if (canal) niveis.push({ id: canal.id, nivel });
  }
  if (niveis.length) emitir("medidores", niveis);
}

// ── comandos ─────────────────────────────────────────────────

export async function comando(acao, dados = {}) {
  if (!origem) return { ok: false, motivo: "sem-motor" };
  try {
    const r = await comTimeout(fetch(`${origem}/api/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: acao, ...dados })
    }), 4000);
    // Marca "comando aceito" no instante em que a resposta HTTP chega —
    // é o ponto real de "clique → comando aceito" da Fase 2 (medição só
    // ativa com ?perf=1; ver perf.js). A marca de clique correspondente
    // fica a cargo de quem chama comando() (telas/mesa.js).
    marcarComandoAceito(acao);
    const corpo = await r.json().catch(() => ({}));
    if (corpo?.state) aplicarEstado(corpo.state);
    // "Estado aplicado": depois que aplicarEstado() já rodou (ou, se o
    // motor não devolveu `state` neste payload, ainda assim marca aqui —
    // o estado efetivo chega pelo WebSocket nesse caso, mas o ciclo
    // HTTP síncrono termina neste ponto).
    marcarEstadoAplicado(acao);
    return { ok: r.ok, ...corpo };
  } catch (erro) {
    conexao.ultimoErro = String(erro?.message || erro);
    emitir("conexao", conexao);
    return { ok: false, erro: conexao.ultimoErro };
  }
}

// ── conversões de payload (vocabulário da UI em dB/ids curtos
//    → vocabulário real de controle-producao.mjs em nomes/percentual) ──

// O motor aceita "volume" como percentual linear 0–100 (100 = 0 dB / unidade),
// não dB. O fader da interface vai de -60 a +6 dB; valores acima de 0 dB não
// têm como ser representados nesse payload (o motor recusa volume > 100,
// confira `number(d.volume,0,100,'Volume')` em controle-producao.mjs).
export function dbParaPercentual(db) {
  const linear = Math.pow(10, db / 20);
  const percentual = Math.round(linear * 100);
  return Math.max(0, Math.min(100, percentual));
}

export function nomeDaEntrada(id) {
  const entrada = estado.entradas.find((e) => e.id === id);
  return entrada ? entrada.nome : null;
}

// Palavra-chave por tipo de DSK mockado → o que procurar nas cenas reais do
// projeto conectado. Cada operador nomeia as próprias cenas; isto é uma
// tentativa best-effort de aproximação, nunca uma garantia — por isso
// `cenaResolvidaDoDsk` pode devolver null, e quem chama DEVE tratar esse
// caso desabilitando o controle (nunca enviando `scene: ''` por engano, o
// que apagaria um overlay que já estivesse correto no canal).
const PALAVRA_CHAVE_DSK = { placar: "PLACAR", logo: "LOGO", ticker: "TARJA", marca: "MARCA" };

export function cenaResolvidaDoDsk(dsk) {
  if (dsk.cena) return dsk.cena; // já resolvido por um /api/json anterior
  const chave = PALAVRA_CHAVE_DSK[dsk.tipo];
  if (!chave || !estado.cenasDoMotor.length) return null;
  const achada = estado.cenasDoMotor.find((nome) => nome.toUpperCase().includes(chave));
  return achada || null;
}

// Endereço real de controle de áudio para um canal do mixer (C1..C4, VT, ME,
// MASTER da interface). O motor não tem 7 inputs de áudio fixos — ele espera
// o nome de uma entrada real ou um alias de barramento (M/A/B, ver `busNames`
// em controle-producao.mjs: M = "3Mix Master"). MASTER usa esse alias.
// Recebe o OBJETO canal (não só o id): o `id` do canal ("C1") e o nome da
// entrada correspondente ("CAM 1") não têm relação textual nenhuma — um
// `startsWith(id)` contra o nome da entrada parecia plausível mas nunca
// batia de verdade ("CAM 1" não começa com "C1"); `canal.nome` já É "CAM 1"
// em estado.js, então a comparação certa é direta contra isso, não contra o id.
// "M/E" não tem contrapartida 1:1 no motor atual (não é um bus nem uma
// entrada) — retorna null de propósito, e as telas devem desabilitar o
// controle em vez de inventar um destino (regra do super-prompt: "se não
// existir, NÃO invente — deixe o botão desabilitado com tooltip").
export function enderecoDoCanal(canal) {
  if (canal.id === "MASTER") return "M";
  const entrada = estado.entradas.find((e) => e.nome.toUpperCase() === canal.nome.toUpperCase());
  return entrada ? entrada.nome : null;
}
// Nota de QA: nos dados de demonstração de estado.js, o canal "VT" (áudio)
// e a entrada "VT — VARZEA" (vídeo) têm nomes que não coincidem por um
// traço longo — por isso VT também cai em null aqui, com aviso na tela, e
// não é um defeito desta função (confirmado em qa-beta/recibos). Quando o
// motor estiver conectado, `estado.entradas` é substituída pelos nomes
// reais do projeto (ver aplicarEstado em ponte.js) e a comparação exata
// volta a funcionar normalmente para qualquer canal cujo nome bata 1:1.

// ── miniaturas reais (item 1.4 do plano de beta) ──────────────

let pollThumbs = null;

// Busca GET /api/thumbs e aplica cada imagem por chave (nome da entrada),
// sem re-renderizar a grade inteira — regra de desempenho do plano:
// "não use setInterval para re-render global; estado via chave". O servidor
// já faz seu próprio throttle (thumbs-engine.mjs, ~900ms por fonte); aqui
// só paramos de perguntar se ninguém está olhando a mesa.
export async function atualizarMiniaturas() {
  if (!origem) return;
  try {
    const r = await comTimeout(fetch(`${origem}/api/thumbs`, { cache: "no-store" }), 2500);
    if (!r.ok) return;
    const { thumbs } = await r.json().catch(() => ({ thumbs: {} }));
    if (!thumbs) return;
    for (const [nome, dataUrl] of Object.entries(thumbs)) {
      const entrada = estado.entradas.find((e) => e.nome.toUpperCase() === nome.toUpperCase());
      if (!entrada) continue;
      for (const img of document.querySelectorAll(`[data-id="${entrada.id}"] img`)) {
        if (img.src !== dataUrl) img.src = dataUrl;
      }
    }
  } catch {
    // Falha de rede isolada não deve interromper o polling nem gerar aviso
    // visível — a tela simplesmente continua com a última miniatura válida
    // (ou a imagem estática, se nunca recebeu nenhuma).
  }
}

export function iniciarPollingMiniaturas() {
  if (pollThumbs) return;
  pollThumbs = setInterval(atualizarMiniaturas, 1000);
}

export function pararPollingMiniaturas() {
  clearInterval(pollThumbs);
  pollThumbs = null;
}

export async function comandoReplay(acao, dados = {}) {
  if (!origem) return { ok: false, motivo: "sem-motor" };
  try {
    const r = await comTimeout(fetch(`${origem}/api/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: acao, ...dados })
    }), 5000);
    const corpo = await r.json().catch(() => ({}));
    if (corpo?.replay) emitir("replay", corpo.replay);
    return { ok: r.ok, ...corpo };
  } catch (erro) {
    return { ok: false, erro: String(erro?.message || erro) };
  }
}
