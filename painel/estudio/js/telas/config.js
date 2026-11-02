// ════════════════════════════════════════════════════════════
// CONFIGURAÇÕES — janela de tela cheia com seções
// ════════════════════════════════════════════════════════════

import { estado, emitir } from "../estado.js";
import { conexao } from "../ponte.js";

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

let secaoAtual = "video";
let alterado = false;

const PRESETS = {
  "720p": { largura: 1280, altura: 720, fps: 59.94 },
  "1080p": { largura: 1920, altura: 1080, fps: 59.94 },
  "4K": { largura: 3840, altura: 2160, fps: 59.94 },
  "Vertical": { largura: 1080, altura: 1920, fps: 59.94 },
  "Personalizado": null
};

function marcarAlterado(valor = true) {
  alterado = valor;
  const aviso = $("#cfg-alterado");
  if (aviso) aviso.hidden = !valor;
}

// ── seção Vídeo ──────────────────────────────────────────────

function renderVideo() {
  const c = estado.config;
  return `
    <div class="cfg-titulo">
      <h1>Vídeo</h1>
      <p>Formato da produção e das saídas.</p>
    </div>

    <div class="cfg-grade">
      <div class="cfg-col">

        <section class="cfg-card">
          <header>
            <h2>Formato da produção</h2>
            <p>Define a resolução e a taxa de quadros da sua produção.</p>
          </header>
          <div class="cfg-linha">
            <label>Tamanho pronto</label>
            <div class="presets" id="presets-formato">
              ${Object.keys(PRESETS).map((nome) => `<button data-preset="${nome}" class="${c.preset === nome ? "is-on" : ""}">${nome === "1080p" ? "1080p" : nome}</button>`).join("")}
            </div>
          </div>
          <div class="cfg-linha">
            <label>Largura</label>
            <div class="cfg-campo">
              <input class="entrada-num" id="cfg-largura" type="number" value="${c.largura}">
              <span class="x">×</span>
              <span style="font-size:11px;color:var(--txt-3);min-width:34px">Altura</span>
              <input class="entrada-num" id="cfg-altura" type="number" value="${c.altura}">
            </div>
          </div>
          <div class="cfg-linha">
            <label>Taxa de quadros</label>
            <div class="cfg-campo">
              <div class="select">
                <select id="cfg-fps">
                  ${[23.976, 25, 29.97, 50, 59.94, 60].map((v) => `<option value="${v}" ${Number(c.fps) === v ? "selected" : ""}>${String(v).replace(".", ",")} fps</option>`).join("")}
                </select>
                <svg><use href="#i-chevron"/></svg>
              </div>
              <span style="font-size:11px;color:var(--txt-3);min-width:56px">Varredura</span>
              <div class="select">
                <select id="cfg-varredura">
                  <option ${c.varredura === "Progressivo" ? "selected" : ""}>Progressivo</option>
                  <option ${c.varredura === "Entrelaçado" ? "selected" : ""}>Entrelaçado</option>
                </select>
                <svg><use href="#i-chevron"/></svg>
              </div>
            </div>
          </div>
        </section>

        <section class="cfg-card">
          <header>
            <h2>Formato da saída</h2>
            <p>Define o formato de resolução das saídas (streaming, gravação, NDI, etc.).</p>
          </header>
          <label class="cfg-check" style="margin:6px 0 4px">
            <input type="checkbox" id="cfg-usar-producao" ${c.usarFormatoProducao ? "checked" : ""}>
            <span class="caixa"></span>
            <span class="texto">Usar o formato da produção<small>As saídas utilizarão a mesma resolução e taxa de quadros da produção.</small></span>
          </label>
          <div class="cfg-linha">
            <label>Largura</label>
            <div class="cfg-campo">
              <input class="entrada-num" id="cfg-largura-saida" type="number" value="${c.larguraSaida}" ${c.usarFormatoProducao ? "disabled" : ""}>
              <span class="x">×</span>
              <span style="font-size:11px;color:var(--txt-3);min-width:34px">Altura</span>
              <input class="entrada-num" id="cfg-altura-saida" type="number" value="${c.alturaSaida}" ${c.usarFormatoProducao ? "disabled" : ""}>
            </div>
          </div>
          <div class="cfg-linha">
            <label>Taxa de quadros</label>
            <div class="cfg-campo">
              <div class="select">
                <select id="cfg-fps-saida" ${c.usarFormatoProducao ? "disabled" : ""}>
                  ${[23.976, 25, 29.97, 50, 59.94, 60].map((v) => `<option value="${v}" ${Number(c.fpsSaida) === v ? "selected" : ""}>${String(v).replace(".", ",")} fps</option>`).join("")}
                </select>
                <svg><use href="#i-chevron"/></svg>
              </div>
              <span style="font-size:11px;color:var(--txt-3);min-width:56px">Varredura</span>
              <div class="select">
                <select id="cfg-varredura-saida" ${c.usarFormatoProducao ? "disabled" : ""}>
                  <option ${c.varreduraSaida === "Progressivo" ? "selected" : ""}>Progressivo</option>
                  <option ${c.varreduraSaida === "Entrelaçado" ? "selected" : ""}>Entrelaçado</option>
                </select>
                <svg><use href="#i-chevron"/></svg>
              </div>
            </div>
          </div>
          <div class="cfg-status-formato">
            <span>Formato da saída atual</span>
            <b id="cfg-resumo-saida">${c.usarFormatoProducao ? `${c.largura} × ${c.altura} · ${String(c.fps).replace(".", ",")}p` : `${c.larguraSaida} × ${c.alturaSaida} · ${String(c.fpsSaida).replace(".", ",")}p`}</b>
          </div>
        </section>

        <section class="cfg-card">
          <header>
            <h2>Ajuste das entradas</h2>
            <p>Define como as fontes de vídeo são ajustadas quando a resolução da produção é alterada.</p>
          </header>
          <label class="cfg-check">
            <input type="checkbox" id="cfg-reenquadrar" ${c.reenquadrar ? "checked" : ""}>
            <span class="caixa"></span>
            <span class="texto">Reenquadrar entradas ao alterar resolução<small>Redimensiona e posiciona automaticamente as entradas no novo formato.</small></span>
          </label>
          <div class="cfg-linha">
            <label>Modo de ajuste</label>
            <div class="cfg-campo">
              <div class="select">
                <select id="cfg-modo-ajuste">
                  <option value="proporcao" ${c.modoAjuste === "proporcao" ? "selected" : ""}>Manter proporção</option>
                  <option value="preencher" ${c.modoAjuste === "preencher" ? "selected" : ""}>Preencher quadro</option>
                  <option value="esticar" ${c.modoAjuste === "esticar" ? "selected" : ""}>Esticar</option>
                </select>
                <svg><use href="#i-chevron"/></svg>
              </div>
            </div>
          </div>
          <div class="cfg-aviso"><svg><use href="#i-info"/></svg><span>As entradas serão ajustadas mantendo a proporção original, evitando distorções na imagem.</span></div>
        </section>

      </div>

      <div class="cfg-col">
        <section class="cfg-card previa-card">
          <div class="previa-topo">
            <div><h2 style="font-size:13px">Prévia do formato</h2></div>
            <span class="previa-res" id="previa-res">${c.largura} × ${c.altura} (16:9)</span>
          </div>
          <div class="previa-video">
            <img src="../img/cena/pgm.jpg" alt="Prévia do formato">
            <div class="previa-guias"></div>
            <div class="previa-legenda">Ticolé passou. Ticolé tá na cara do gol. Bateu!</div>
          </div>
          <div class="previa-stats">
            <div class="previa-stat"><span>Produção</span><b id="previa-producao">${c.largura} × ${c.altura} · ${String(c.fps).replace(".", ",")}p</b></div>
            <div class="previa-stat"><span>Saída</span><b id="previa-saida">${c.usarFormatoProducao ? `${c.largura} × ${c.altura} · ${String(c.fps).replace(".", ",")}p` : `${c.larguraSaida} × ${c.alturaSaida} · ${String(c.fpsSaida).replace(".", ",")}p`}</b></div>
          </div>
          <div class="cfg-aviso"><svg><use href="#i-info"/></svg><span>O formato da produção define a resolução e taxa de quadros com que o 3Mix trabalha internamente. O formato da saída define a resolução das saídas (streaming, gravação, NDI, etc.). Quando ativado, as saídas utilizam o mesmo formato da produção.</span></div>
        </section>
      </div>
    </div>`;
}

function ligarVideo(raiz) {
  const c = estado.config;

  const atualizarResumo = () => {
    const producao = `${c.largura} × ${c.altura} · ${String(c.fps).replace(".", ",")}p`;
    const saida = c.usarFormatoProducao ? producao : `${c.larguraSaida} × ${c.alturaSaida} · ${String(c.fpsSaida).replace(".", ",")}p`;
    $("#previa-producao").textContent = producao;
    $("#previa-saida").textContent = saida;
    $("#cfg-resumo-saida").textContent = saida;
    $("#previa-res").textContent = `${c.largura} × ${c.altura} (${(c.largura / c.altura).toFixed(2).replace(".", ":")})`;
  };

  $("#presets-formato", raiz)?.addEventListener("click", (e) => {
    const botao = e.target.closest("button[data-preset]");
    if (!botao) return;
    c.preset = botao.dataset.preset;
    $$("#presets-formato button", raiz).forEach((b) => b.classList.toggle("is-on", b === botao));
    const preset = PRESETS[c.preset];
    if (preset) {
      c.largura = preset.largura;
      c.altura = preset.altura;
      c.fps = preset.fps;
      $("#cfg-largura").value = preset.largura;
      $("#cfg-altura").value = preset.altura;
      $("#cfg-fps").value = preset.fps;
    }
    atualizarResumo();
    marcarAlterado();
  });

  $("#cfg-largura", raiz)?.addEventListener("input", (e) => { c.largura = Number(e.target.value) || 0; atualizarResumo(); marcarAlterado(); });
  $("#cfg-altura", raiz)?.addEventListener("input", (e) => { c.altura = Number(e.target.value) || 0; atualizarResumo(); marcarAlterado(); });
  $("#cfg-fps", raiz)?.addEventListener("change", (e) => { c.fps = Number(e.target.value); atualizarResumo(); marcarAlterado(); });
  $("#cfg-varredura", raiz)?.addEventListener("change", (e) => { c.varredura = e.target.value; marcarAlterado(); });

  $("#cfg-usar-producao", raiz)?.addEventListener("change", (e) => {
    c.usarFormatoProducao = e.target.checked;
    ["#cfg-largura-saida", "#cfg-altura-saida", "#cfg-fps-saida", "#cfg-varredura-saida"].forEach((sel) => {
      const campo = $(sel, raiz);
      if (campo) campo.disabled = c.usarFormatoProducao;
    });
    atualizarResumo();
    marcarAlterado();
  });

  ["#cfg-largura-saida", "#cfg-altura-saida"].forEach((sel) => {
    $(sel, raiz)?.addEventListener("input", (e) => {
      if (sel.includes("largura")) c.larguraSaida = Number(e.target.value) || 0;
      else c.alturaSaida = Number(e.target.value) || 0;
      atualizarResumo(); marcarAlterado();
    });
  });
  $("#cfg-fps-saida", raiz)?.addEventListener("change", (e) => { c.fpsSaida = Number(e.target.value); atualizarResumo(); marcarAlterado(); });
  $("#cfg-varredura-saida", raiz)?.addEventListener("change", (e) => { c.varreduraSaida = e.target.value; marcarAlterado(); });
  $("#cfg-reenquadrar", raiz)?.addEventListener("change", (e) => { c.reenquadrar = e.target.checked; marcarAlterado(); });
  $("#cfg-modo-ajuste", raiz)?.addEventListener("change", (e) => { c.modoAjuste = e.target.value; marcarAlterado(); });
}

// ── seções simples (schema) ──────────────────────────────────

const SECOES = {
  audio: {
    titulo: "Áudio", sub: "Entrada, saída e processamento de áudio da produção.",
    cards: [
      { titulo: "Dispositivo de áudio", desc: "Interface usada para monitoração e captura.", campos: [
        { tipo: "select", rotulo: "Dispositivo", valor: "WASAPI — Padrão do sistema", opcoes: ["WASAPI — Padrão do sistema", "ASIO — Interface USB", "NDI Audio", "SRT Audio"] },
        { tipo: "select", rotulo: "Taxa de amostragem", valor: "48 kHz", opcoes: ["44,1 kHz", "48 kHz", "96 kHz"] },
        { tipo: "select", rotulo: "Buffer", valor: "512 amostras", opcoes: ["128 amostras", "256 amostras", "512 amostras", "1024 amostras"] }
      ]},
      { titulo: "Mixer", desc: "Comportamento dos faders e monitoração.", campos: [
        { tipo: "check", rotulo: "N-1 automático em retornos", valor: true },
        { tipo: "check", rotulo: "Peak hold nos medidores", valor: true },
        { tipo: "check", rotulo: "Ducking automático entre canais", valor: false }
      ]}
    ]
  },
  "saidas-audio": {
    titulo: "Saídas de áudio", sub: "Barramentos físicos e digitais disponíveis para o operador.",
    cards: [
      { titulo: "Barramentos", desc: "Saídas ativas nesta máquina.", campos: [
        { tipo: "check", rotulo: "PGM — Programa", valor: true },
        { tipo: "check", rotulo: "AUX 1 — Retorno para convidados", valor: true },
        { tipo: "check", rotulo: "AUX 2 — Painel de comentaristas", valor: true },
        { tipo: "check", rotulo: "ISO — Gravação multipista", valor: false }
      ]}
    ]
  },
  streaming: {
    titulo: "Streaming", sub: "Destinos, codificação e redundância da transmissão.",
    cards: [
      { titulo: "Destino principal", desc: "Serviço usado na transmissão ao vivo.", campos: [
        { tipo: "select", rotulo: "Serviço", valor: "YouTube", opcoes: ["YouTube", "Twitch", "RTMP personalizado", "SRT", "Facebook"] },
        { tipo: "texto", rotulo: "Chave de transmissão", valor: "•••• •••• •••• 4F2A" },
        { tipo: "select", rotulo: "Encoder", valor: "NVENC H.264", opcoes: ["NVENC H.264", "NVENC HEVC", "QuickSync H.264", "x264"] },
        { tipo: "select", rotulo: "Bitrate", valor: "4.2 Mbps", opcoes: ["3 Mbps", "4.2 Mbps", "6 Mbps", "8 Mbps"] }
      ]},
      { titulo: "Redundância", desc: "Failover automático entre destinos.", campos: [
        { tipo: "check", rotulo: "Multistream simultâneo", valor: true },
        { tipo: "check", rotulo: "Reconectar automaticamente", valor: true }
      ]}
    ]
  },
  gravacao: {
    titulo: "Gravação", sub: "Formato, destino e política de arquivos.",
    cards: [
      { titulo: "Arquivos", desc: "Onde e como o programa é gravado.", campos: [
        { tipo: "texto", rotulo: "Pasta de destino", valor: "D:\\3Mix\\Gravacoes" },
        { tipo: "select", rotulo: "Formato", valor: "MKV", opcoes: ["MKV", "MP4", "MOV"] },
        { tipo: "select", rotulo: "Qualidade", valor: "Alta (CQP 18)", opcoes: ["Média", "Alta (CQP 18)", "Master (CQP 14)"] },
        { tipo: "check", rotulo: "Gravação ISO por câmera", valor: true }
      ]}
    ]
  },
  ndi: {
    titulo: "Saídas NDI / SRT", sub: "Distribuição para painéis, retornos e externas.",
    cards: [
      { titulo: "NDI", desc: "Descoberta e publicação na rede local.", campos: [
        { tipo: "check", rotulo: "Publicar PGM em NDI", valor: true },
        { tipo: "check", rotulo: "Publicar Clean Feed", valor: true },
        { tipo: "texto", rotulo: "Nome na rede", valor: "3MIX-FUTSAL-PGM" }
      ]},
      { titulo: "SRT", desc: "Retornos de externa com mix-minus.", campos: [
        { tipo: "check", rotulo: "Retorno 1 — 20 Mbps", valor: true },
        { tipo: "check", rotulo: "Retorno 2 — 12 Mbps", valor: false },
        { tipo: "select", rotulo: "Latência", valor: "120 ms", opcoes: ["80 ms", "120 ms", "200 ms", "500 ms"] }
      ]}
    ]
  },
  aparencia: {
    titulo: "Aparência e workspace", sub: "Tema, densidade e organização das janelas.",
    cards: [
      { titulo: "Tema", desc: "Identidade visual aplicada à operação.", campos: [
        { tipo: "select", rotulo: "Tema", valor: "3Mix Grafite", opcoes: ["3Mix Grafite", "3Mix Alto Contraste", "Claro"] },
        { tipo: "select", rotulo: "Densidade", valor: "Compacta", opcoes: ["Compacta", "Confortável"] },
        { tipo: "check", rotulo: "Animar transições da interface", valor: true }
      ]}
    ]
  },
  multiview: {
    titulo: "Multiview e tela cheia", sub: "Layout do multiview e comportamento das janelas de saída.",
    cards: [
      { titulo: "Multiview", desc: "Distribuição dos monitores na saída de vídeo.", campos: [
        { tipo: "select", rotulo: "Layout", valor: "4 × 4 com PGM", opcoes: ["4 × 4 com PGM", "3 × 3", "1 + 7", "2 × 2"] },
        { tipo: "check", rotulo: "Mostrar tally de Preview", valor: true },
        { tipo: "check", rotulo: "Mostrar medidores de áudio", valor: true }
      ]}
    ]
  },
  atalhos: {
    titulo: "Atalhos", sub: "Teclas de operação e controladores externos.",
    cards: [
      { titulo: "Teclado", desc: "Atalhos globais da mesa de corte.", campos: [
        { tipo: "texto", rotulo: "Corte", valor: "Enter" },
        { tipo: "texto", rotulo: "Transição automática", valor: "Espaço" },
        { tipo: "texto", rotulo: "Marcar IN", valor: "I" },
        { tipo: "texto", rotulo: "Marcar OUT", valor: "O" }
      ]}
    ]
  },
  remoto: {
    titulo: "Controle remoto", sub: "Acesso de painéis e convidados pela rede.",
    cards: [
      { titulo: "Acesso", desc: "Quem pode controlar esta instalação.", campos: [
        { tipo: "check", rotulo: "Painel remoto na rede local", valor: true },
        { tipo: "check", rotulo: "Exigir PIN de pareamento", valor: true },
        { tipo: "texto", rotulo: "Porta", valor: "18188" }
      ]}
    ]
  },
  desempenho: {
    titulo: "Desempenho", sub: "Renderização, codificação e uso de hardware.",
    cards: [
      { titulo: "Motor", desc: "Renderizador e política de aceleração.", campos: [
        { tipo: "select", rotulo: "Renderizador", valor: "Direct3D 11", opcoes: ["Direct3D 11", "Vulkan", "OpenGL"] },
        { tipo: "select", rotulo: "Color space", valor: "Rec. 709", opcoes: ["Rec. 709", "Rec. 2020 HLG", "sRGB"] },
        { tipo: "check", rotulo: "Aceleração de GPU para composição", valor: true }
      ]}
    ]
  },
  cor: {
    titulo: "Cor", sub: "Calibração e espaços de cor da produção.",
    cards: [
      { titulo: "Calibração", desc: "Perfil aplicado a todas as entradas.", campos: [
        { tipo: "select", rotulo: "Perfil", valor: "Rec. 709 (SDR)", opcoes: ["Rec. 709 (SDR)", "Rec. 2020 HLG", "Rec. 2100 PQ"] },
        { tipo: "check", rotulo: "Aplicar LUT de monitoração", valor: false }
      ]}
    ]
  },
  sobre: {
    titulo: "Sobre", sub: "3Mix Studio — suíte broadcast modular.",
    // Regra 10 do plano de beta: "a interface não pode mentir — proibido mostrar
    // valores falsos de medidor, tempo ou status". Esta seção tinha um número de
    // versão fixo no código ("3Mix Studio 2.4") que nunca correspondeu à instalação
    // real — corrigido para refletir só o que a API de fato confirma hoje
    // (conexão/instalação ativa via /api/health). A API ainda não expõe o número de
    // versão (version.json do runtime não tem rota HTTP própria) nem as licenças de
    // terceiros em formato consumível pela UI; até que isso exista, mostramos que
    // está pendente em vez de inventar um valor. THIRD-PARTY-NOTICES.txt já existe
    // em FreeMix/docs/ com o conteúdo real — falta só a rota/link para servir aqui.
    get cards() {
      const ligado = conexao.motor;
      return [
        { titulo: "Instalação", desc: ligado ? "Conectado ao motor." : "Sem conexão com o motor.", campos: [
          { tipo: "texto", rotulo: "Produto", valor: "3Mix" },
          { tipo: "texto", rotulo: "Motor", valor: ligado ? "3mix-engine (libobs) — conectado" : "não conectado" },
          { tipo: "texto", rotulo: "Origem da API", valor: ligado ? (conexao.origem || "—") : "—" },
          { tipo: "texto", rotulo: "Versão", valor: "não exposta por esta API ainda — ver version.json no pacote de instalação" }
        ]},
        { titulo: "Licenças e código-fonte", desc: "Terceiros usados pelo 3Mix.", campos: [
          { tipo: "texto", rotulo: "Avisos de terceiros", valor: "FreeMix/docs/THIRD-PARTY-NOTICES.txt (no pacote)" },
          { tipo: "texto", rotulo: "Oferta de código (GPL)", valor: "ver THIRD-PARTY-NOTICES.txt" }
        ]}
      ];
    }
  }
};

function campoHtml(campo) {
  if (campo.tipo === "check") {
    return `<label class="cfg-check"><input type="checkbox" ${campo.valor ? "checked" : ""}><span class="caixa"></span><span class="texto">${campo.rotulo}</span></label>`;
  }
  if (campo.tipo === "select") {
    return `<div class="cfg-linha"><label>${campo.rotulo}</label><div class="cfg-campo"><div class="select"><select>${campo.opcoes.map((o) => `<option ${o === campo.valor ? "selected" : ""}>${o}</option>`).join("")}</select><svg><use href="#i-chevron"/></svg></div></div></div>`;
  }
  return `<div class="cfg-linha"><label>${campo.rotulo}</label><div class="cfg-campo"><input class="entrada-num" value="${campo.valor}"></div></div>`;
}

function renderGenerico(chave) {
  const secao = SECOES[chave];
  if (!secao) return `<div class="cfg-titulo"><h1>${chave}</h1><p>Seção em preparação.</p></div>`;
  return `
    <div class="cfg-titulo"><h1>${secao.titulo}</h1><p>${secao.sub}</p></div>
    <div class="cfg-grade">
      <div class="cfg-col">
        ${secao.cards.map((card) => `
          <section class="cfg-card">
            <header><h2>${card.titulo}</h2><p>${card.desc}</p></header>
            ${card.campos.map(campoHtml).join("")}
          </section>`).join("")}
      </div>
      <div class="cfg-col">
        <section class="cfg-card">
          <header><h2>Resumo operacional</h2><p>Como esta configuração afeta a mesa agora.</p></header>
          <div class="cfg-status-formato"><span>Estado</span><b>Pronto para operar</b></div>
          <div class="cfg-aviso"><svg><use href="#i-info"/></svg><span>Alterações nesta seção são aplicadas ao salvar e valem para todas as saídas ativas.</span></div>
        </section>
      </div>
    </div>`;
}

// ── ciclo da janela ──────────────────────────────────────────

function render() {
  const conteudo = $("#cfg-conteudo");
  if (!conteudo) return;
  conteudo.innerHTML = secaoAtual === "video" ? renderVideo() : renderGenerico(secaoAtual);
  conteudo.scrollTop = 0;
  marcarAlterado(false);

  if (secaoAtual === "video") ligarVideo(conteudo);
  else {
    $$("input, select", conteudo).forEach((campo) => campo.addEventListener("change", () => marcarAlterado()));
  }
}

export function abrirConfig() {
  const tela = $("#tela-config");
  if (!tela) return;
  tela.hidden = false;
  secaoAtual = "video";
  $$(".cfg-item").forEach((b) => b.classList.toggle("is-on", b.dataset.cfg === "video"));
  render();
}

export function fecharConfig() {
  const tela = $("#tela-config");
  if (tela) tela.hidden = true;
}

function salvar() {
  const c = estado.config;
  estado.formato = {
    largura: c.largura,
    altura: c.altura,
    fps: c.fps,
    varredura: c.varredura
  };
  emitir("formato", estado.formato);
  marcarAlterado(false);
  fecharConfig();
}

export function iniciarConfig() {
  $("#cfg-menu")?.addEventListener("click", (e) => {
    const botao = e.target.closest(".cfg-item");
    if (!botao) return;
    secaoAtual = botao.dataset.cfg;
    $$(".cfg-item").forEach((b) => b.classList.toggle("is-on", b === botao));
    render();
  });

  $("#cfg-salvar")?.addEventListener("click", salvar);
  $("#cfg-aplicar")?.addEventListener("click", () => { salvar(); });
  $("#cfg-cancelar")?.addEventListener("click", fecharConfig);
  $("#cfg-restaurar")?.addEventListener("click", () => {
    estado.config = {
      preset: "1080p", largura: 1920, altura: 1080, fps: 59.94, varredura: "Progressivo",
      usarFormatoProducao: true, larguraSaida: 1920, alturaSaida: 1080,
      fpsSaida: 59.94, varreduraSaida: "Progressivo", reenquadrar: true, modoAjuste: "proporcao"
    };
    render();
    marcarAlterado(false);
  });
  $$("[data-fechar-config]").forEach((b) => b.addEventListener("click", fecharConfig));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#tela-config")?.hidden) fecharConfig();
  });
}
