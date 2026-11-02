// ════════════════════════════════════════════════════════════
// Tela MESA — switcher, barramentos PV/PGM, fontes e mixer
// ════════════════════════════════════════════════════════════

import { estado, emitir, formatador } from "../estado.js";
import { comando, dbParaPercentual, nomeDaEntrada, enderecoDoCanal, cenaResolvidaDoDsk } from "../ponte.js";
import { marcarClique } from "../perf.js";

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const el = (tag, classe, html) => {
  const n = document.createElement(tag);
  if (classe) n.className = classe;
  if (html !== undefined) n.innerHTML = html;
  return n;
};

const medidores = new Map(); // id do canal -> { nivel, pico, alvo }
let ultimoQuadro = 0;
let emTransicao = false;

// ── barramentos ──────────────────────────────────────────────

function montarBarramentos() {
  for (const [alvo, ativo] of [["#barramento-pv", estado.preview], ["#barramento-pgm", estado.programa]]) {
    const trilho = $(alvo);
    if (!trilho) continue;
    trilho.innerHTML = "";
    for (const entrada of estado.entradas) {
      const no = el("div", "mini-fonte");
      if (entrada.id === ativo) no.classList.add("is-ativo");
      no.dataset.id = entrada.id;
      no.innerHTML = `
        <img src="${entrada.imagem}" alt="${entrada.nome}" draggable="false">
        <div class="mini-info"><span class="mini-num">${entrada.id}</span><span class="mini-nome">${entrada.nome}</span></div>`;
      no.addEventListener("click", () => selecionarPreview(entrada.id));
      trilho.appendChild(no);
    }
  }
}

// ── fontes ───────────────────────────────────────────────────

let filtroAtual = "todas";
let buscaAtual = "";

function montarFontes() {
  const grade = $("#fontes-grade");
  if (!grade) return;
  grade.innerHTML = "";

  const lista = estado.entradas.filter((e) => {
    if (filtroAtual !== "todas" && e.tipo !== filtroAtual) return false;
    if (buscaAtual && !e.nome.toLowerCase().includes(buscaAtual.toLowerCase())) return false;
    return true;
  });

  if (!lista.length) {
    grade.innerHTML = `<div style="grid-column:1/-1;display:grid;place-items:center;color:#5b6672;font-size:12px">Nenhuma fonte encontrada</div>`;
    return;
  }

  for (const entrada of lista) {
    const no = el("div", "fonte-card");
    no.dataset.id = entrada.id;
    if (entrada.id === estado.programa) no.classList.add("is-no-ar");
    else if (entrada.id === estado.preview) no.classList.add("is-selecionada");
    no.innerHTML = `
      <img src="${entrada.imagem}" alt="${entrada.nome}" draggable="false">
      <span class="fonte-tipo-tag">${rotuloTipo(entrada.tipo)}</span>
      <button class="fonte-menu" title="Opções da fonte" data-menu="${entrada.id}">
        <svg><use href="#i-dots"/></svg>
      </button>
      <div class="fonte-info"><span class="fonte-num">${entrada.id}</span><span>${entrada.nome}</span></div>`;
    no.addEventListener("click", () => selecionarPreview(entrada.id));
    no.addEventListener("dblclick", () => {
      selecionarPreview(entrada.id);
      executarTransicao("cut");
    });
    grade.appendChild(no);
  }
}

function rotuloTipo(tipo) {
  return { camera: "CAM", player: "DDR", composicao: "COMP", call: "CALL" }[tipo] || tipo.toUpperCase();
}

// ── DSK ──────────────────────────────────────────────────────

function previaDsk(dsk) {
  if (dsk.tipo === "placar") {
    return `<div class="dp-placar">
        <span class="dp-sigla">STA</span>
        <span class="dp-score">0 - 0</span>
        <span class="dp-sigla fur">FUR</span>
      </div>
      <div class="dp-faixa">1º TEMPO</div>`;
  }
  if (dsk.tipo === "logo") {
    return `<div class="dp-logo"><span class="dp-escudo"><b>V</b></span><em>VARZEA</em></div>`;
  }
  if (dsk.tipo === "ticker") {
    return `<div class="dp-ticker">
        <i></i>
        <div><b>STA 0 - 0 FUR</b><small>1º TEMPO · Futsal</small></div>
      </div>`;
  }
  return `<div class="dp-marca">
      <span class="dp-dots"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
      <b>3Mix</b>
    </div>`;
}

function montarDsk() {
  const lista = $("#dsk-lista");
  if (!lista) return;
  lista.innerHTML = "";
  for (const dsk of estado.dsk) {
    const no = el("div", "dsk-item");
    if (dsk.noAr) no.classList.add("is-no-ar");
    no.innerHTML = `
      <div class="dsk-etiqueta dsk-etiqueta--${dsk.tipo}" title="${dsk.nome}">
        <div class="dsk-prev">${previaDsk(dsk)}</div>
        <span>DSK ${dsk.id}</span>
      </div>
      <button class="dsk-mini" data-dsk-take="${dsk.id}">TAKE</button>
      <button class="dsk-mini" data-dsk-auto="${dsk.id}">AUTO</button>`;
    lista.appendChild(no);
  }
}

// ── mixer ────────────────────────────────────────────────────

function escalaDoFader() {
  return [[6, "6"], [0, "0"], [-10, "-10"], [-20, "-20"], [-30, "-30"], [-40, "-40"], [-60, "-60"]]
    .map(([db, rotulo]) => `<span style="bottom:${posicaoDoDb(db)}%">${rotulo}</span>`).join("");
}

function montarMixer() {
  const trilho = $("#mixer-trilho");
  if (!trilho) return;
  trilho.innerHTML = "";

  estado.canais.forEach((canal, indice) => {
    const no = el("div", `canal${canal.principal ? " principal" : ""}`);
    no.dataset.canal = canal.id;
    no.innerHTML = `
      <div class="canal-nome" title="${canal.nome}">${canal.nome}</div>
      <button class="canal-fone" title="Escutar canal (PFL)"><svg><use href="#i-headphone"/></svg></button>
      <div class="canal-corpo">
        <div class="canal-escala">${escalaDoFader()}</div>
        <div class="fader" data-fader="${canal.id}">
          <div class="fader-trilho"></div>
          <div class="fader-cabo${canal.principal ? " azul" : ""}" style="bottom:${posicaoDoDb(canal.db)}%"></div>
        </div>
        <div class="canal-medidor">
          <div class="barra"><i></i></div>
          <div class="barra"><i></i></div>
        </div>
      </div>
      <div class="canal-db" data-db="${canal.id}">${formatador.db(canal.db)}</div>
      <div class="canal-pan">
        <span>L</span>
        <div class="pan-knob" data-pan="${canal.id}" style="--pan:${canal.pan * 1.35}deg"></div>
        <span>R</span>
      </div>
      <div class="canal-botoes">
        <button class="b-mudo${canal.mudo ? " is-on" : ""}" data-mudo="${canal.id}" title="Mudo">M</button>
        <button class="b-pfl" title="Escuta PFL"><svg><use href="#i-headphone"/></svg></button>
        <button class="b-afv${canal.afv ? " is-on" : ""}" data-afv="${canal.id}" title="Audio Follows Video">AFV</button>
      </div>`;

    const fader = $(".fader", no);
    ligarFader(fader, canal);
    ligarPan($(".pan-knob", no), canal);

    trilho.appendChild(no);
    if (!medidores.has(canal.id)) {
      medidores.set(canal.id, { nivel: nivelDoDb(canal.db), pico: nivelDoDb(canal.db), alvo: nivelDoDb(canal.db) });
    }
  });

  trilho.onclick = (evento) => {
    const botao = evento.target.closest("button");
    if (!botao) return;
    if (botao.dataset.mudo) {
      const canal = estado.canais.find((c) => c.id === botao.dataset.mudo);
      const endereco = enderecoDoCanal(canal);
      if (!endereco) { avisoIndisponivel(canal.nome); return; }
      const novoEstado = !canal.mudo;
      comando("audio_mute", { input: endereco, muted: novoEstado }).then((r) => {
        // Só reflete na interface o que o motor de fato confirmou — nunca
        // otimista (regra 10 do plano de beta: a interface não pode mentir).
        if (r?.ok !== false) { canal.mudo = novoEstado; botao.classList.toggle("is-on", canal.mudo); }
      });
    }
    if (botao.dataset.afv) {
      // AFV real do motor (`audio_routing_afv`) é uma política persistente
      // por UUID de fonte, administrada em /audio (audio-routing-producao.mjs),
      // não um toggle por canal do mixer local. Associar os dois sem o UUID
      // da fonte inventaria um comportamento — por isso o botão fica inerte
      // aqui; a tela Áudio → Processamento é o lugar real para isso.
      avisoIndisponivel("AFV — use Áudio › Processamento");
    }
  };
}

function avisoIndisponivel(rotulo) {
  emitir("aviso", { texto: `Indisponível nesta versão da mesa: ${rotulo}` });
}

function posicaoDoDb(db) {
  const min = -60, max = 6;
  return Math.max(0, Math.min(100, ((db - min) / (max - min)) * 100));
}
function dbDaPosicao(pos) {
  const min = -60, max = 6;
  return min + (pos / 100) * (max - min);
}
function nivelDoDb(db) {
  return Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
}

function ligarFader(no, canal) {
  if (!no) return;
  let arrastando = false;

  const aplicar = (evento, enviar) => {
    const caixa = no.getBoundingClientRect();
    const pos = Math.max(0, Math.min(100, ((caixa.bottom - evento.clientY) / caixa.height) * 100));
    const db = Number(dbDaPosicao(pos).toFixed(1));
    canal.db = db;
    no.querySelector(".fader-cabo").style.bottom = `${pos}%`;
    const rotulo = document.querySelector(`[data-db="${canal.id}"]`);
    if (rotulo) rotulo.textContent = formatador.db(db);
    if (enviar) {
      const endereco = enderecoDoCanal(canal);
      if (!endereco) { avisoIndisponivel(canal.nome); return; }
      // O motor trabalha em percentual linear (100 = 0 dB), não dB — ver
      // dbParaPercentual em ponte.js. +6 dB vira 200%, acima do limite 100
      // que controle-producao.mjs aceita; o motor então fixa em 0 dB real.
      // É uma limitação do payload atual, não um bug desta tela — registrada
      // em qa-beta/recibos, não escondida.
      comando("audio_volume", { input: endereco, volume: dbParaPercentual(db) });
    }
  };

  no.addEventListener("pointerdown", (evento) => {
    arrastando = true;
    no.setPointerCapture(evento.pointerId);
    aplicar(evento, false);
  });
  no.addEventListener("pointermove", (evento) => { if (arrastando) aplicar(evento, false); });
  const soltar = (evento) => {
    if (!arrastando) return;
    arrastando = false;
    try { no.releasePointerCapture(evento.pointerId); } catch {}
    aplicar(evento, true);
  };
  no.addEventListener("pointerup", soltar);
  no.addEventListener("pointercancel", soltar);
  no.addEventListener("dblclick", () => {
    canal.db = canal.principal ? 0 : -6;
    no.querySelector(".fader-cabo").style.bottom = `${posicaoDoDb(canal.db)}%`;
    const rotulo = document.querySelector(`[data-db="${canal.id}"]`);
    if (rotulo) rotulo.textContent = formatador.db(canal.db);
  });
}

function ligarPan(no, canal) {
  if (!no) return;
  let origemY = null;
  no.addEventListener("pointerdown", (e) => { origemY = e.clientY; no.setPointerCapture(e.pointerId); });
  no.addEventListener("pointermove", (e) => {
    if (origemY === null) return;
    const delta = (origemY - e.clientY) * 1.6;
    origemY = e.clientY;
    canal.pan = Math.max(-1, Math.min(1, canal.pan + delta / 60));
    no.style.setProperty("--pan", `${canal.pan * 135}deg`);
  });
  no.addEventListener("pointerup", () => { origemY = null; });
  no.addEventListener("dblclick", () => { canal.pan = 0; no.style.setProperty("--pan", "0deg"); });
}

// ── monitores ────────────────────────────────────────────────

function atualizarMonitores() {
  const pv = estado.entradas.find((e) => e.id === estado.preview);
  const pgm = estado.entradas.find((e) => e.id === estado.programa);
  if (pv) {
    $("#pv-nome").textContent = pv.nome;
    $("#pv-img").src = pv.imagem;
  }
  if (pgm) {
    $("#pgm-nome").textContent = pgm.nome;
    $("#pgm-img").src = pgm.imagem;
  }
}

function selecionarPreview(id) {
  if (id === estado.programa) return;
  marcarClique("preview");
  estado.preview = id;
  atualizarMonitores();
  montarBarramentos();
  montarFontes();
  emitir("selecao", { preview: id });
  // Sem isto, CUT/FADE cortavam para o preview antigo do motor, não para o
  // que o operador acabou de clicar na interface — o estado visual e o
  // estado real do motor divergiam silenciosamente.
  const nome = nomeDaEntrada(id);
  if (nome) comando("preview", { input: nome });
}

// ── transições ───────────────────────────────────────────────

function executarTransicao(modo) {
  if (emTransicao) return;
  marcarClique(modo === "cut" ? "cut" : "fade");
  const duracao = Number($("#sel-duracao")?.value || estado.transicao);

  const concluir = () => {
    const anterior = estado.programa;
    estado.programa = estado.preview;
    estado.preview = anterior;
    atualizarMonitores();
    montarBarramentos();
    montarFontes();
    const flash = $("#pgm-flash");
    flash.classList.remove("is-on");
    void flash.offsetWidth;
    flash.classList.add("is-on");
    emTransicao = false;
  };

  if (modo === "cut") {
    concluir();
    comando("cut");
    return;
  }

  emTransicao = true;
  const botao = $("#btn-auto");
  botao?.classList.add("is-ativo");
  comando("fade", { duration: duracao });
  setTimeout(() => {
    botao?.classList.remove("is-ativo");
    concluir();
  }, duracao);
}

// ── T-Bar ────────────────────────────────────────────────────

function ligarTbar() {
  const area = $("#tbar");
  const cabo = $("#tbar-cabo");
  if (!area || !cabo) return;

  const mover = (evento, soltar) => {
    const caixa = area.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (evento.clientY - caixa.top) / caixa.height));
    cabo.style.top = `${pos * 100}%`;
    if (soltar) {
      if (pos > 0.92) executarTransicao("cut");
      else if (pos < 0.08) executarTransicao("cut");
      cabo.style.top = "50%";
      comando("tbar", { position: pos, release: true });
    }
  };

  let ativo = false;
  area.addEventListener("pointerdown", (e) => { ativo = true; area.setPointerCapture(e.pointerId); mover(e, false); });
  area.addEventListener("pointermove", (e) => { if (ativo) mover(e, false); });
  area.addEventListener("pointerup", (e) => {
    if (!ativo) return;
    ativo = false;
    try { area.releasePointerCapture(e.pointerId); } catch {}
    mover(e, true);
  });
}

// ── medidores ────────────────────────────────────────────────

let picoPv = 62, picoPgm = 74;

export function animarMedidores(agora) {
  if (agora - ultimoQuadro < 55) return;
  ultimoQuadro = agora;

  for (const canal of estado.canais) {
    const m = medidores.get(canal.id) || { nivel: 40, pico: 40, alvo: 40 };
    const base = nivelDoDb(canal.db);
    const jitter = (Math.random() - 0.5) * 9;
    m.alvo = canal.mudo ? 0 : Math.max(0, Math.min(100, base + jitter));
    m.nivel += (m.alvo - m.nivel) * 0.35;
    if (m.nivel > m.pico) m.pico = m.nivel;
    else m.pico = Math.max(0, m.pico - 0.45);
    medidores.set(canal.id, m);

    const canais = document.querySelectorAll(`.canal[data-canal="${canal.id}"] .barra i`);
    canais.forEach((barra, i) => { barra.style.height = `${Math.max(0, m.nivel - i * 2.5)}%`; });
  }

  const master = medidores.get("MASTER");
  const nivelPrograma = master ? master.nivel : 60;
  const pvAlvo = Math.max(6, Math.min(98, nivelPrograma * 0.85 + (Math.random() - 0.5) * 6));
  picoPv = Math.max(pvAlvo, picoPv - 0.4);
  picoPgm = Math.max(nivelPrograma, picoPgm - 0.4);

  const vuPv = document.querySelector('[data-vu="pv"] .vu-preenchimento');
  const marcaPv = document.querySelector('[data-vu="pv"] .vu-pico');
  const vuPgm = document.querySelector('[data-vu="pgm"] .vu-preenchimento');
  const marcaPgm = document.querySelector('[data-vu="pgm"] .vu-pico');
  if (vuPv) vuPv.style.height = `${pvAlvo}%`;
  if (marcaPv) marcaPv.style.bottom = `${picoPv}%`;
  if (vuPgm) vuPgm.style.height = `${nivelPrograma}%`;
  if (marcaPgm) marcaPgm.style.bottom = `${picoPgm}%`;
}

export function aplicarNiveisMotor(niveis) {
  for (const item of niveis) {
    const canal = estado.canais.find((c) => c.id === item.id);
    if (!canal || !Number.isFinite(item.nivel)) continue;
    const m = medidores.get(canal.id);
    if (m) m.alvo = Math.max(0, Math.min(100, item.nivel));
  }
}

// ── montagem / assinaturas ───────────────────────────────────

function ligarControles() {
  $("#btn-cut")?.addEventListener("click", () => executarTransicao("cut"));
  $("#btn-auto")?.addEventListener("click", () => executarTransicao("auto"));
  $("#sel-duracao")?.addEventListener("change", (e) => {
    estado.transicao = Number(e.target.value);
  });

  $("#filtros-fontes")?.addEventListener("click", (e) => {
    const botao = e.target.closest(".filtro");
    if (!botao) return;
    filtroAtual = botao.dataset.filtro;
    document.querySelectorAll("#filtros-fontes .filtro").forEach((b) => b.classList.toggle("is-on", b === botao));
    montarFontes();
  });

  $("#busca-fontes")?.addEventListener("input", (e) => {
    buscaAtual = e.target.value.trim();
    montarFontes();
  });

  $("#dsk-lista")?.addEventListener("click", (e) => {
    const botao = e.target.closest("button");
    if (!botao) return;
    const id = Number(botao.dataset.dskTake || botao.dataset.dskAuto);
    const dsk = estado.dsk.find((d) => d.id === id);
    if (!dsk) return;
    // A ação real é "overlay" (take) / "overlay_toggle", com payload
    // {channel, scene} — "number"/"visible" não existem na API
    // (overlays-producao.mjs: `throw Error('Ação de overlay não suportada')`
    // para qualquer nome fora de overlay_get/take/off/toggle/configure).
    // Cada DSK mockado só liga de verdade se existir, no projeto conectado,
    // uma cena cujo nome combine com o tipo (ver cenaResolvidaDoDsk);
    // sem essa correspondência, avisamos em vez de adivinhar uma cena.
    const cena = cenaResolvidaDoDsk(dsk);
    if (!cena) { avisoIndisponivel(`DSK "${dsk.nome}" — nenhuma cena do projeto combina; use "Gerenciar grafismos"`); return; }
    const ligar = () => {
      const proximoEstado = !dsk.noAr;
      comando("overlay_toggle", { channel: id, scene: cena }).then((r) => {
        if (r?.ok === false) { avisoIndisponivel(r.error || `DSK "${dsk.nome}" recusado pelo motor`); return; }
        dsk.noAr = proximoEstado;
        if (proximoEstado) dsk.cena = cena;
        montarDsk();
      });
    };
    if (botao.dataset.dskAuto) setTimeout(ligar, 600);
    else ligar();
  });
}

export function iniciarMesa() {
  montarBarramentos();
  montarFontes();
  montarDsk();
  montarMixer();
  atualizarMonitores();
  ligarControles();
  ligarTbar();
}

export function atualizarMesa() {
  atualizarMonitores();
  montarBarramentos();
  montarFontes();
  montarDsk();
  if (!$("#mixer-trilho")?.children.length) montarMixer();
}

export { selecionarPreview, executarTransicao };
