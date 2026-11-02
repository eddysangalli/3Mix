// ════════════════════════════════════════════════════════════
// 3Mix Studio — orquestrador da interface
// ════════════════════════════════════════════════════════════

import { estado, ao, emitir, formatador } from "./estado.js";
import { detectar, conectar, conexao, comando, iniciarPollingMiniaturas, pararPollingMiniaturas } from "./ponte.js";
import { iniciarMesa, atualizarMesa, animarMedidores, aplicarNiveisMotor } from "./telas/mesa.js";
import { iniciarAudio, animarAudio } from "./telas/audio.js";
import { iniciarReplay, animarReplay } from "./telas/replay.js";
import { iniciarConfig, abrirConfig, fecharConfig } from "./telas/config.js";
import { perfAtivo, iniciarObservadorLongTask } from "./perf.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

let telaAtual = "mesa";
let segundosRec = 0;

// ── modo dock ────────────────────────────────────────────────
// Carregado dentro do motor (browser dock) via estudio-dock.html.
// Preview/Programa já são nativos ali; escondemos a duplicata e
// trocamos a navegação por abas pela faixa compacta `.dock-nav`.
const modoDock = new URLSearchParams(location.search).get("dock") === "1";
if (modoDock) document.body.classList.add("modo-dock");

// ── roteamento entre telas ───────────────────────────────────

function mostrarTela(nome) {
  telaAtual = nome;
  $$(".tela").forEach((tela) => { tela.hidden = tela.dataset.telaNome !== nome; });
  $$(".tab").forEach((tab) => tab.classList.toggle("is-on", tab.dataset.telaDestino === nome));
  $$("#dock-nav button").forEach((b) => b.classList.toggle("is-on", b.dataset.telaDestino === nome));
  document.body.dataset.tela = nome;

  const emReplay = nome === "replay";
  $("#pill-rec").style.display = emReplay ? "none" : "";
  $("#pill-live").style.display = emReplay ? "none" : "";
  $("#btn-cameras").hidden = !emReplay;
  $("#btn-salvar-workspace").style.display = emReplay ? "none" : "";

  if (nome === "mesa") atualizarMesa();
}

// ── relógio e telemetria ─────────────────────────────────────

function atualizarRelogio() {
  const agora = new Date();
  const relogio = $("#relogio");
  if (relogio) relogio.textContent = agora.toLocaleTimeString("pt-BR", { hour12: false });
  const data = $("#calendario");
  if (data) {
    const texto = agora.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
    data.textContent = texto.replace(".", "").replace(/^(\w)/, (m) => m.toUpperCase());
  }
  const tempo = $("#tempo-rec");
  if (tempo) tempo.textContent = formatador.hms(segundosRec);
  const replayTempo = $("#replay-rec-time");
  if (replayTempo) replayTempo.textContent = formatador.hms(estado.replay.tempoGravacao);
}

setInterval(() => {
  if (estado.gravando) segundosRec++;
  estado.tempoRec = segundosRec;
  if (telaAtual === "replay") estado.replay.tempoGravacao++;
  atualizarRelogio();
}, 1000);

// ── gravação / transmissão ───────────────────────────────────

// A ação real é "record"/"stream" com {active:boolean} — não existem
// "record_start"/"record_stop"/"stream_start"/"stream_stop" em
// controle-producao.mjs (`case 'record': case 'stream': ... Start+prefix`).
// Confirmado ao vivo contra o motor: a ação antiga respondia HTTP 400
// "Comando não implementado" — não silenciosa, mas o código da UI nunca
// checava o resultado, então o botão mudava de cor mesmo com o erro.
// Corrigido para refletir somente o que o motor confirmar (testado:
// record→{active:true} iniciou e {active:false} parou a gravação real).
async function alternarGravacao() {
  const novoEstado = !estado.gravando;
  const r = await comando("record", { active: novoEstado });
  if (r?.ok === false) { aviso(r.error || "O motor recusou a gravação"); return; }
  estado.gravando = novoEstado;
  segundosRec = estado.gravando ? segundosRec : 0;
  $("#pill-rec").classList.toggle("is-on", estado.gravando);
  $("#btn-gravar").classList.toggle("is-on", estado.gravando);
  $("#btn-gravar").lastChild.textContent = estado.gravando ? "Parar gravação" : "Gravar";
  aviso(estado.gravando ? "Gravação iniciada" : "Gravação encerrada");
}

async function alternarTransmissao() {
  const novoEstado = !estado.transmitindo;
  const r = await comando("stream", { active: novoEstado });
  if (r?.ok === false) { aviso(r.error || "O motor recusou a transmissão"); return; }
  estado.transmitindo = novoEstado;
  $("#pill-live").classList.toggle("is-on", estado.transmitindo);
  $("#btn-transmitir").classList.toggle("is-on", estado.transmitindo);
  $("#btn-transmitir").lastChild.textContent = estado.transmitindo ? "Parar transmissão" : "Transmitir";
  aviso(estado.transmitindo ? "Transmissão ao vivo iniciada" : "Transmissão encerrada");
}

// ── avisos ───────────────────────────────────────────────────

let timerAviso = null;
function aviso(texto) {
  const no = $("#toast");
  if (!no) return;
  no.textContent = texto;
  no.hidden = false;
  requestAnimationFrame(() => no.classList.add("is-on"));
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => {
    no.classList.remove("is-on");
    setTimeout(() => { no.hidden = true; }, 220);
  }, 2200);
}

// ── status bar / formato ─────────────────────────────────────

function atualizarFormato() {
  const f = estado.formato;
  const chip = $(".status-chip");
  if (chip) chip.textContent = `${f.largura}×${f.altura}`;
  const fps = $("#status-fps-format");
  if (fps) fps.textContent = `${String(f.fps).replace(".", ",")}p`;
}

function atualizarConexao() {
  const sinal = $(".status-sinal");
  if (!sinal) return;
  const ativa = conexao.motor;
  sinal.style.color = ativa ? "#35c05a" : "#e8a33d";
  sinal.title = ativa ? `Motor conectado — ${conexao.origem}` : "Bancada local — motor não encontrado";
  const dot = sinal.querySelector(".dot");
  if (dot) {
    dot.style.background = ativa ? "#35c05a" : "#e8a33d";
    dot.style.boxShadow = `0 0 7px ${ativa ? "rgba(53,192,90,.55)" : "rgba(232,163,61,.5)"}`;
  }
}

// ── janela nativa ────────────────────────────────────────────

function ligarJanela() {
  const desktop = new URLSearchParams(location.search).has("desktop")
    || navigator.userAgent.includes("3MixDesktop");
  if (desktop) document.body.classList.add("desktop");

  $$("[data-janela]").forEach((botao) => {
    botao.addEventListener("click", () => {
      const acao = botao.dataset.janela;
      if (window.chrome?.webview) {
        window.chrome.webview.postMessage({ tipo: "janela", acao });
        return;
      }
      if (acao === "fechar") window.close();
    });
  });
}

// ── inicialização ────────────────────────────────────────────

function ligarInterface() {
  $("#tabs").addEventListener("click", (e) => {
    const aba = e.target.closest(".tab");
    if (aba) mostrarTela(aba.dataset.telaDestino);
  });

  $("#dock-nav")?.addEventListener("click", (e) => {
    const botao = e.target.closest("button");
    if (botao) mostrarTela(botao.dataset.telaDestino);
  });

  $("#btn-config").addEventListener("click", abrirConfig);
  $("#btn-gravar").addEventListener("click", alternarGravacao);
  $("#btn-transmitir").addEventListener("click", alternarTransmissao);
  $("#btn-salvar-workspace").addEventListener("click", () => aviso("Workspace salvo"));
  $("#btn-cameras").addEventListener("click", () => aviso("Configuração de câmeras"));

  $$("[data-fechar-config]").forEach((b) => b.addEventListener("click", fecharConfig));

  ao("estado", () => {
    atualizarMesa();
    atualizarFormato();
    $("#pill-rec").classList.toggle("is-on", estado.gravando);
    $("#pill-live").classList.toggle("is-on", estado.transmitindo);
  });

  ao("conexao", atualizarConexao);
  ao("conexao", () => {
    // Pollar miniaturas sem motor conectado só geraria 404/erro de rede
    // repetido; a tela já cai para a imagem estática nesse caso.
    if (conexao.motor) iniciarPollingMiniaturas();
    else pararPollingMiniaturas();
  });
  // Dock em segundo plano (minimizado, outra aba na frente): parar de gastar
  // ciclos do motor com screenshots que ninguém está vendo. Document visível
  // de novo retoma sozinho, se ainda conectado.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pararPollingMiniaturas();
    else if (conexao.motor) iniciarPollingMiniaturas();
  });
  ao("formato", atualizarFormato);
  ao("medidores", (niveis) => aplicarNiveisMotor(niveis));
  // Telas filhas (mesa/áudio/replay) emitem "aviso" para reaproveitar este
  // mesmo toast em vez de cada uma desenhar sua própria mensagem de erro.
  ao("aviso", (dado) => aviso(typeof dado === "string" ? dado : dado?.texto || ""));
}

function laco(agora) {
  // Instrumentação da Fase 2 (duração real de frame, só com ?perf=1):
  // mede o próprio quadro do laço de render, não um proxy.
  if (perfAtivo) performance.mark("3mix-marca:frame:inicio");
  animarMedidores(agora);
  if (telaAtual === "audio") animarAudio(agora);
  if (telaAtual === "replay") animarReplay(agora);
  if (perfAtivo) {
    performance.mark("3mix-marca:frame:fim");
    try { performance.measure("3mix:frame", "3mix-marca:frame:inicio", "3mix-marca:frame:fim"); } catch {}
  }
  requestAnimationFrame(laco);
}

async function iniciar() {
  if (perfAtivo) iniciarObservadorLongTask();
  ligarJanela();
  ligarInterface();

  iniciarMesa();
  iniciarAudio();
  iniciarReplay();
  iniciarConfig();

  atualizarRelogio();
  atualizarFormato();
  mostrarTela("mesa");

  const base = await detectar();
  if (base) {
    conectar();
    atualizarConexao();
  } else {
    atualizarConexao();
  }

  requestAnimationFrame(laco);
}

document.addEventListener("DOMContentLoaded", iniciar);
