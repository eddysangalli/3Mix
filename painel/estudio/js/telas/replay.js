// ════════════════════════════════════════════════════════════
// Tela REPLAY — players A/B, slow-motion, lances e histórico
// ════════════════════════════════════════════════════════════

import { estado, emitir, formatador } from "../estado.js";
import { comandoReplay } from "../ponte.js";

function avisoReplay(texto) {
  emitir("aviso", { texto });
}

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

const players = {
  A: { tocando: false, ultimo: 0 },
  B: { tocando: false, ultimo: 0 }
};

function montarHistorico() {
  const grade = $("#historico-grade");
  if (!grade) return;
  const cameras = [
    { num: 1, nome: "Principal", img: "../img/cena/cam-1.jpg" },
    { num: 2, nome: "Lateral direita", img: "../img/cena/cam-2.jpg" },
    { num: 3, nome: "Atrás do gol", img: "../img/cena/cam-3.jpg", sel: true },
    { num: 4, nome: "Lateral esquerda", img: "../img/cena/cam-4.jpg" }
  ];
  grade.innerHTML = cameras.map((c) => `
    <div class="historico-cam${c.sel ? " is-sel" : ""}">
      <img src="${c.img}" alt="CAM ${c.num}" draggable="false">
      <span class="cam-rotulo"><b>CAM ${c.num}</b> ${c.nome}</span>
      ${c.sel ? '<span class="cam-sel-tag">SELECIONADA</span>' : ""}
    </div>`).join("");
}

function montarLances() {
  const corpo = $("#lances-corpo");
  if (!corpo) return;
  corpo.innerHTML = estado.lances.map((l) => `
    <tr data-lance="${l.id}" class="${l.id === 1 ? "is-sel" : ""}">
      <td class="col-id">${l.id}</td>
      <td><span class="col-tipo"><span class="ico ${l.icone}">${l.icone === "gol" ? "⚽" : l.icone === "defesa" ? "✋" : l.icone === "falta" ? "⚑" : "≡"}</span>${l.tipo}</span></td>
      <td>${l.tempo}</td>
      <td>${l.duracao}</td>
      <td>${l.angulos}</td>
      <td>
        <div class="col-acoes">
          <button data-carregar="A" data-lance-id="${l.id}" class="${l.id === 1 ? "is-on" : ""}">CARREGAR A</button>
          <button data-carregar="B" data-lance-id="${l.id}">CARREGAR B</button>
        </div>
      </td>
      <td class="col-menu">⋯</td>
    </tr>`).join("");

  const resumo = $("#lances-resumo");
  if (resumo) {
    const total = estado.lances.reduce((a, l) => a + parseFloat(l.duracao), 0);
    resumo.textContent = `${estado.lances.length} lances · ${formatador.tc(total)} total`;
  }
  const contagem = $("#lances-contagem");
  if (contagem) contagem.textContent = `(eventos de replay)`;
}

function atualizarPlayer(lado) {
  const dados = estado.replay[lado === "A" ? "playerA" : "playerB"];
  const alvo = $(`#${lado === "A" ? "a" : "b"}-timecode`);
  if (alvo) alvo.textContent = `${formatador.tc(dados.posicao)} / ${formatador.tc(dados.duracao)}`;
  const estadoNo = $(`#estado-${lado.toLowerCase()}`);
  if (estadoNo) {
    estadoNo.classList.toggle("no-ar", dados.noAr);
    estadoNo.classList.toggle("carregado", dados.preparado && !dados.noAr);
    estadoNo.textContent = dados.noAr ? "NO AR" : dados.preparado ? "CARREGADO" : "PRONTO";
  }
  const pos = dados.posicao / dados.duracao;
  const cursor = $("#tl-cursor");
  if (cursor && lado === estado.replay.alvo) cursor.style.left = `${Math.max(0, Math.min(100, pos * 100))}%`;
}

// LACUNA CONHECIDA (play/pause corrigidos; seek/frame-a-frame/in/out ainda
// NÃO chamam o motor): a ação real é "transport" com {player, command:
// "PLAY"|"PAUSE"|"STOP"} — ligada aqui para play/pause, que são seguros e
// idempotentes. "-1"/"+1" (frame a frame) e "in"/"out" (ir ao início/fim do
// clipe) teriam que usar "seek" com um cursor em milissegundos calculado a
// partir do frame rate real do clipe carregado (replay-disco.mjs usa
// `seekTargets`, que depende de estado que só existe depois de um "load"
// bem-sucedido) — implementar isso sem motor ao vivo para testar seria
// arriscar quebrar o seek de verdade; registrado como pendente, não feito
// às pressas (regra "corrija a causa, não a expectativa").
function transportar(lado, acao) {
  const dados = estado.replay[lado === "A" ? "playerA" : "playerB"];
  const quadro = 1 / 29.97;
  switch (acao) {
    case "play":
      players[lado].tocando = true;
      players[lado].ultimo = performance.now();
      comandoReplay("transport", { player: lado, command: "PLAY" }).then((r) => {
        if (r?.ok === false) avisoReplay(r.error || `Player ${lado}: o motor recusou reproduzir`);
      });
      break;
    case "pause":
      players[lado].tocando = false;
      comandoReplay("transport", { player: lado, command: "PAUSE" }).then((r) => {
        if (r?.ok === false) avisoReplay(r.error || `Player ${lado}: o motor recusou pausar`);
      });
      break;
    case "-1":
      dados.posicao = Math.max(0, dados.posicao - quadro);
      break;
    case "+1":
      dados.posicao = Math.min(dados.duracao, dados.posicao + quadro);
      break;
    case "in":
      dados.posicao = 0;
      break;
    case "out":
      dados.posicao = dados.duracao;
      break;
  }
  atualizarPlayer(lado);
}

function animarPlayers(agora) {
  for (const lado of ["A", "B"]) {
    const p = players[lado];
    if (!p.tocando) continue;
    const delta = (agora - p.ultimo) / 1000;
    p.ultimo = agora;
    const dados = estado.replay[lado === "A" ? "playerA" : "playerB"];
    const fator = (estado.replay.velocidade / 100) * 1;
    dados.posicao += delta * fator;
    if (dados.posicao >= dados.duracao) {
      dados.posicao = dados.duracao;
      p.tocando = false;
    }
    atualizarPlayer(lado);
  }
}

// LACUNA CONHECIDA (registrada, não corrigida nesta rodada): esta função só
// move os marcadores visuais locais. O motor tem "mark-in"/"mark-out" reais
// em replay-disco.mjs (markIn/markOut, que criam um lance de IN até OUT),
// mas ligar isso de verdade exige testar ao vivo contra um motor conectado
// — exatamente o tipo de mudança que a regra "corrija a causa, não a
// expectativa" do plano de beta pede para não fazer às pressas sem QA. Até
// alguém validar isso com o motor rodando, os botões MARCAR IN/MARCAR OUT
// continuam só locais; ver qa-beta/recibos/fase1-dock-comandos.md.
function marcar(tipo) {
  const dados = estado.replay;
  const pos = Math.max(2, Math.min(98, dados.playerA.posicao / dados.playerA.duracao * 100));
  if (tipo === "in") {
    dados.marcadorIn = pos;
    const marca = $("#tl-marca-in");
    if (marca) marca.style.left = `${pos}%`;
    $("#btn-marcar-in")?.classList.add("is-on");
  } else {
    dados.marcadorOut = pos;
    const marca = $("#tl-marca-out");
    if (marca) marca.style.left = `${pos}%`;
    $("#btn-marcar-out")?.classList.add("is-on");
  }
  const janela = $("#tl-janela");
  if (janela) {
    const inicio = Math.min(dados.marcadorIn, dados.marcadorOut);
    const fim = Math.max(dados.marcadorIn, dados.marcadorOut);
    janela.style.left = `${inicio}%`;
    janela.style.width = `${Math.max(2, fim - inicio)}%`;
  }
}

// A ação real do motor é "capture" (replay-disco.mjs), não "save_event" —
// e ela só aceita exatamente 5, 10 ou 20 segundos (`if (![5,10,20].includes
// (seconds)) throw`). Qualquer outro valor que a UI mandasse (ex.: o botão
// "SALVAR LANCE" mandava 10 por padrão mas o rótulo não deixa isso óbvio)
// era silenciosamente rejeitado pelo motor enquanto a lista local de lances
// crescia do mesmo jeito — por isso o F5 sempre "perdia" lances que na
// verdade nunca tinham sido salvos no motor. Corrigido: só grava de
// verdade com um dos três valores válidos, e só adiciona à lista local
// depois da confirmação do motor.
function salvarLance(segundos = 10) {
  if (![5, 10, 20].includes(segundos)) {
    avisoReplay(`Captura precisa ser 5, 10 ou 20 s — recebido ${segundos}s`);
    return;
  }
  comandoReplay("capture", { seconds: segundos }).then((r) => {
    if (r?.ok === false) { avisoReplay(r.error || "O motor recusou a captura do lance"); return; }
    const agora = new Date();
    const hora = [agora.getHours(), agora.getMinutes(), agora.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
    const novo = {
      id: estado.lances.length + 1,
      tipo: segundos >= 20 ? "Sequência" : segundos >= 10 ? "Lance" : "Falta",
      icone: segundos >= 20 ? "lance" : segundos >= 10 ? "lance" : "falta",
      tempo: hora,
      duracao: `${segundos.toFixed(2)}s`,
      angulos: 4
    };
    estado.lances.unshift(novo);
    montarLances();
    emitir("lances", estado.lances);
  });
}

function ligarControles() {
  $$(".player").forEach((bloco) => {
    const lado = bloco.id === "player-a" ? "A" : "B";
    bloco.addEventListener("click", (e) => {
      const botao = e.target.closest("button");
      if (!botao) return;
      const acao = botao.dataset.transporte;
      if (acao) transportar(lado, acao);
    });
  });

  // "speed" já existia pronto no motor (replay-disco.mjs) e nunca era
  // chamado — o slider mudava só o número na tela, sem afetar reprodução
  // real nenhuma. Debounce de ~120ms para não inundar a API durante o
  // arrasto contínuo do range (regra de desempenho do plano de beta).
  let debounceVelocidade = null;
  const enviarVelocidade = (v) => {
    clearTimeout(debounceVelocidade);
    debounceVelocidade = setTimeout(() => {
      comandoReplay("speed", { speed: v }).then((r) => {
        if (r?.ok === false) avisoReplay(r.error || "O motor recusou a velocidade");
      });
    }, 120);
  };

  $("#slow-range")?.addEventListener("input", (e) => {
    estado.replay.velocidade = Number(e.target.value);
    $("#slow-valor").textContent = `${estado.replay.velocidade}%`;
    const pct = ((e.target.value - 10) / 90) * 100;
    e.target.style.setProperty("--pct", `${pct}%`);
    $$(".slow-presets button").forEach((b) => b.classList.toggle("is-on", Number(b.dataset.vel) === estado.replay.velocidade));
    enviarVelocidade(estado.replay.velocidade);
  });

  $(".slow-presets")?.addEventListener("click", (e) => {
    const botao = e.target.closest("button");
    if (!botao) return;
    const velocidade = Number(botao.dataset.vel);
    estado.replay.velocidade = velocidade;
    $("#slow-valor").textContent = `${velocidade}%`;
    const range = $("#slow-range");
    if (range) { range.value = velocidade; range.style.setProperty("--pct", `${((velocidade - 10) / 90) * 100}%`); }
    $$(".slow-presets button").forEach((b) => b.classList.toggle("is-on", b === botao));
    enviarVelocidade(velocidade);
  });

  $("#vincular-players")?.addEventListener("change", (e) => { estado.replay.vincular = e.target.checked; });

  $("#btn-marcar-in")?.addEventListener("click", () => marcar("in"));
  $("#btn-marcar-out")?.addEventListener("click", () => marcar("out"));
  $("#acao-marcar-in")?.addEventListener("click", () => marcar("in"));
  $("#acao-marcar-out")?.addEventListener("click", () => marcar("out"));
  $("#acao-salvar-lance")?.addEventListener("click", () => salvarLance(10));
  $("#btn-criar-lance")?.addEventListener("click", () => salvarLance(5));

  $$("[data-captura-rapida]").forEach((botao) => {
    botao.addEventListener("click", () => salvarLance(Number(botao.dataset.capturaRapida)));
  });

  $$("[data-captura]").forEach((botao) => {
    // Mesmo destino do motor que "SALVAR ÚLTIMOS Ns" (ação "capture"); unificado
    // em salvarLance() para que o lance também apareça na lista local — antes
    // este botão gravava no motor mas não atualizava a lista aqui, então o
    // operador via o replay "sumir" da tela até o próximo refresh completo.
    botao.addEventListener("click", () => salvarLance(Number(botao.dataset.captura)));
  });

  $("#lances-corpo")?.addEventListener("click", (e) => {
    const botao = e.target.closest("[data-carregar]");
    if (!botao) return;
    const lado = botao.dataset.carregar;
    const lance = estado.lances.find((l) => String(l.id) === botao.dataset.lanceId);
    if (!lance) return;
    const dados = estado.replay[lado === "A" ? "playerA" : "playerB"];
    dados.preparado = true;
    dados.posicao = 0;
    dados.duracao = parseFloat(lance.duracao) || 9;
    atualizarPlayer(lado);
    $$(`#lances-corpo [data-carregar="${lado}"]`).forEach((b) => b.classList.toggle("is-on", b === botao));
    $$("#lances-corpo tr").forEach((tr) => tr.classList.toggle("is-sel", tr.dataset.lance === botao.dataset.lanceId));
  });

  $$("[data-player-alvo]").forEach((botao) => {
    botao.addEventListener("click", () => {
      estado.replay.alvo = botao.dataset.playerAlvo;
      $$("[data-player-alvo]").forEach((b) => b.classList.toggle("is-on", b === botao));
    });
  });

  $("#btn-colocar-no-ar")?.addEventListener("click", () => {
    const lado = estado.replay.alvo;
    const dados = estado.replay[lado === "A" ? "playerA" : "playerB"];
    // A ação real é "air" (não "take") — e no motor ela é só de ENTRADA:
    // chamar de novo com o mesmo player apenas reinicia a reprodução, não
    // volta ao vivo (ver replay-disco.mjs: air() nunca lê this.state.back
    // para desligar, só live() faz isso). Este botão era um toggle visual
    // que nunca correspondeu ao que o motor realmente faz; corrigido para
    // sempre AR (o botão "VOLTAR AO VIVO", ao lado, já cobre o caminho
    // inverso chamando live() corretamente).
    comandoReplay("air", { player: lado }).then((r) => {
      if (r?.ok === false) { avisoReplay(r.error || "O motor recusou colocar o replay no ar"); return; }
      dados.noAr = true;
      $("#btn-colocar-no-ar")?.classList.add("is-on");
      $("#rb-status-texto").textContent = `REPLAY ${lado} NO AR`;
      atualizarPlayer(lado);
    });
  });

  $("#btn-voltar-vivo")?.addEventListener("click", () => {
    // live() falha com erro explícito se nenhuma cena ao vivo foi guardada
    // ainda (this.state.back vazio) — ex.: reaberto o painel sem nenhum
    // "air" nesta sessão. Só limpamos o estado visual depois da confirmação.
    comandoReplay("live").then((r) => {
      if (r?.ok === false) { avisoReplay(r.error || "Nenhuma entrada ao vivo anterior foi guardada"); return; }
      estado.replay.playerA.noAr = false;
      estado.replay.playerB.noAr = false;
      $("#btn-colocar-no-ar")?.classList.remove("is-on");
      $("#rb-status-texto").textContent = "AO VIVO";
      atualizarPlayer("A");
      atualizarPlayer("B");
    });
  });

  $$("[data-tl]").forEach((botao) => {
    botao.addEventListener("click", () => {
      const acao = botao.dataset.tl;
      if (acao === "-5") { estado.replay.playerA.posicao = Math.max(0, estado.replay.playerA.posicao - 5); }
      else if (acao === "play") transportar("A", "play");
      else if (acao === "pause") transportar("A", "pause");
      else if (acao === "+1") transportar("A", "+1");
      else if (acao === "-1") transportar("A", "-1");
      else if (acao === "now") { estado.replay.playerA.posicao = estado.replay.playerA.duracao; }
      atualizarPlayer("A");
    });
  });

  $$(".canal-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      $$(".canal-chip").forEach((c) => c.classList.toggle("is-on", c === chip));
    });
  });
}

export function iniciarReplay() {
  montarHistorico();
  montarLances();
  atualizarPlayer("A");
  atualizarPlayer("B");
  ligarControles();
  const range = $("#slow-range");
  if (range) range.style.setProperty("--pct", `${((estado.replay.velocidade - 10) / 90) * 100}%`);
}

export function animarReplay(agora) {
  animarPlayers(agora);
  const agoraTexto = $("#historico-hora");
  if (agoraTexto && Math.floor(agora / 1000) % 2 === 0) {
    const d = new Date();
    agoraTexto.textContent = [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":") + `:${String(d.getMilliseconds()).padStart(3, "0").slice(0, 2)}`;
  }
}
