// ════════════════════════════════════════════════════════════
// Tela ÁUDIO — mixer completo e barramentos
// ════════════════════════════════════════════════════════════

import { estado, emitir, formatador } from "../estado.js";
import { comando, dbParaPercentual, enderecoDoCanal } from "../ponte.js";

function avisoIndisponivel(rotulo) {
  emitir("aviso", { texto: `Indisponível nesta versão: ${rotulo}` });
}

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

const medidores = new Map();
let ultimoQuadro = 0;

const posicaoDoDb = (db) => Math.max(0, Math.min(100, ((db + 60) / 66) * 100));
const dbDaPosicao = (pos) => -60 + (pos / 100) * 66;
const nivelDoDb = (db) => Math.max(0, Math.min(100, ((db + 60) / 60) * 100));

function montarMixer() {
  const alvo = $("#mixer-completo");
  if (!alvo) return;
  alvo.innerHTML = "";

  estado.canais.forEach((canal, indice) => {
    if (indice === 6) {
      const divisor = document.createElement("div");
      divisor.className = "divisor-grupo";
      alvo.appendChild(divisor);
    }

    const no = document.createElement("div");
    no.className = `canal${canal.principal ? " principal" : ""}`;
    no.dataset.canal = canal.id;
    no.innerHTML = `
      <div class="canal-nome">${canal.nome}</div>
      <div class="ganho"><span>GAIN</span><b>${canal.ganho > 0 ? "+" : ""}${canal.ganho.toFixed(1)}</b></div>
      <button class="canal-fone" title="Escutar canal (PFL)"><svg><use href="#i-headphone"/></svg></button>
      <div class="canal-corpo">
        <div class="canal-escala">${["0", "-10", "-20", "-30", "-40", "-60"].map((r, i) => `<span style="bottom:${[100, 83, 66, 49, 32, 4][i]}%">${r}</span>`).join("")}</div>
        <div class="fader" data-fader="${canal.id}">
          <div class="fader-trilho"></div>
          <div class="fader-cabo${canal.principal ? " azul" : ""}" style="bottom:${posicaoDoDb(canal.db)}%"></div>
        </div>
        <div class="canal-medidor"><div class="barra"><i></i></div><div class="barra"><i></i></div></div>
      </div>
      <div class="canal-db" data-db="${canal.id}">${formatador.db(canal.db)}</div>
      <div class="canal-pan"><span>L</span><div class="pan-knob" style="--pan:${canal.pan * 135}deg"></div><span>R</span></div>
      <div class="canal-botoes">
        <button class="b-mudo${canal.mudo ? " is-on" : ""}" data-mudo="${canal.id}">M</button>
        <button class="b-solo${canal.solo ? " is-on" : ""}" data-solo="${canal.id}">SOLO</button>
        <button class="b-afv${canal.afv ? " is-on" : ""}" data-afv="${canal.id}">AFV</button>
      </div>`;

    const fader = $(".fader", no);
    let arrastando = false;
    const aplicar = (evento, enviar) => {
      const caixa = fader.getBoundingClientRect();
      const pos = Math.max(0, Math.min(100, ((caixa.bottom - evento.clientY) / caixa.height) * 100));
      canal.db = Number(dbDaPosicao(pos).toFixed(1));
      $(".fader-cabo", fader).style.bottom = `${pos}%`;
      const rotulo = document.querySelector(`[data-db="${canal.id}"]`);
      if (rotulo) rotulo.textContent = formatador.db(canal.db);
      if (enviar) {
        const endereco = enderecoDoCanal(canal);
        if (!endereco) { avisoIndisponivel(canal.nome); return; }
        comando("audio_volume", { input: endereco, volume: dbParaPercentual(canal.db) });
      }
    };
    fader.addEventListener("pointerdown", (e) => { arrastando = true; fader.setPointerCapture(e.pointerId); aplicar(e, false); });
    fader.addEventListener("pointermove", (e) => { if (arrastando) aplicar(e, false); });
    fader.addEventListener("pointerup", (e) => {
      if (!arrastando) return;
      arrastando = false;
      try { fader.releasePointerCapture(e.pointerId); } catch {}
      aplicar(e, true);
    });

    no.addEventListener("click", (evento) => {
      const botao = evento.target.closest("button");
      if (!botao) return;
      if (botao.dataset.mudo) {
        const endereco = enderecoDoCanal(canal);
        if (!endereco) { avisoIndisponivel(canal.nome); return; }
        const novoEstado = !canal.mudo;
        comando("audio_mute", { input: endereco, muted: novoEstado }).then((r) => {
          if (r?.ok !== false) { canal.mudo = novoEstado; botao.classList.toggle("is-on", canal.mudo); }
        });
      } else if (botao.dataset.afv) {
        // AFV real (audio_routing_afv) é por UUID de fonte, não por canal do
        // mixer local — ver nota equivalente em telas/mesa.js. A tela de
        // Áudio › Processamento é quem já expõe isso corretamente.
        avisoIndisponivel("AFV — use a aba Processamento, à direita");
      } else if (botao.dataset.solo) {
        // SOLO/PFL ainda não tem ação correspondente em controle-producao.mjs
        // (nenhum "audio_solo"/"audio_pfl" existe hoje). Mantido como estado
        // visual local explícito — não finge controlar o motor.
        canal.solo = !canal.solo;
        botao.classList.toggle("is-on", canal.solo);
        avisoIndisponivel("Solo/PFL — ainda sem contraparte no motor (visual apenas)");
      } else if (botao.classList.contains("canal-fone")) {
        botao.classList.toggle("is-on");
      }
    });

    alvo.appendChild(no);
    if (!medidores.has(canal.id)) medidores.set(canal.id, { nivel: nivelDoDb(canal.db), pico: nivelDoDb(canal.db) });
  });
}

function montarBarras() {
  const lista = $("#barras-lista");
  if (!lista) return;
  lista.innerHTML = estado.barramentos.map((b) => `
    <div class="barra-item" data-barra-id="${b.id}">
      <span class="barra-nome"><b>${b.nome.split("—")[0].trim()}</b>${b.nome.includes("—") ? " — " + b.nome.split("—")[1].trim() : ""}</span>
      <div class="medidor-h"><i data-nivel="${b.id}" style="width:${nivelDoDb(b.db)}%"></i></div>
      <span class="barra-nivel" data-db-barra="${b.id}">${formatador.db(b.db)} dB</span>
    </div>`).join("");
}

export function iniciarAudio() {
  montarMixer();
  montarBarras();

  $("#btn-reset-faders")?.addEventListener("click", () => {
    estado.canais.forEach((c) => { if (!c.principal) c.db = -6; });
    montarMixer();
  });

  $("#seg-barra")?.addEventListener("click", (e) => {
    const botao = e.target.closest("button");
    if (!botao) return;
    $$("#seg-barra button").forEach((b) => b.classList.toggle("is-on", b === botao));
  });
}

export function animarAudio(agora) {
  if (agora - ultimoQuadro < 60) return;
  ultimoQuadro = agora;

  for (const canal of estado.canais) {
    const m = medidores.get(canal.id) || { nivel: 30, pico: 30 };
    const alvo = canal.mudo ? 0 : Math.max(0, Math.min(100, nivelDoDb(canal.db) + (Math.random() - 0.5) * 10));
    m.nivel += (alvo - m.nivel) * 0.3;
    m.pico = Math.max(m.nivel, m.pico - 0.5);
    medidores.set(canal.id, m);
    document.querySelectorAll(`.canal[data-canal="${canal.id}"] .barra i`).forEach((barra, i) => {
      barra.style.height = `${Math.max(0, m.nivel - i * 2.2)}%`;
    });
  }

  for (const barra of estado.barramentos) {
    const master = medidores.get("MASTER")?.nivel ?? 45;
    const oscilar = Math.max(0, Math.min(100, master + (Math.random() - 0.5) * 7));
    const preenchimento = document.querySelector(`[data-nivel="${barra.id}"]`);
    if (preenchimento) preenchimento.style.width = `${oscilar}%`;
    const rotulo = document.querySelector(`[data-db-barra="${barra.id}"]`);
    if (rotulo) rotulo.textContent = `${(-60 + (oscilar / 100) * 60).toFixed(1)} dB`;
  }

  const master = medidores.get("MASTER");
  if (master) {
    const trilhos = document.querySelectorAll("#master-vu .trilho i:not(.pico)");
    trilhos.forEach((t, i) => { t.style.height = `${Math.max(0, master.nivel - i * 3)}%`; });
    const picos = document.querySelectorAll("#master-vu .trilho i.pico");
    picos.forEach((p, i) => { p.style.bottom = `${Math.min(99, master.pico + i)}%`; });
  }
}
