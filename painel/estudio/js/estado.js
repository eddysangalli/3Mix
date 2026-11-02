// ════════════════════════════════════════════════════════════
// Estado central do 3Mix Studio
// Uma única fonte de verdade para todas as telas. Quando a
// ponte com o motor responde, estes valores passam a refletir
// o estado real; sem motor, o operador continua enxergando uma
// mesa consistente (modo bancada) em vez de caixas vazias.
// ════════════════════════════════════════════════════════════

const ASSETS = "../img/cena/";

export const estado = {
  projeto: "Futsal ao vivo",
  formato: { largura: 1920, altura: 1080, fps: 59.94, varredura: "Progressivo" },

  programa: 1,
  preview: 3,
  transicao: 800,
  gravando: false,
  transmitindo: false,
  tempoRec: 0,
  taxaStream: "4.2 Mbps",

  cpu: 12,
  gpu: 18,
  fps: 60,
  framesPerdidos: "0 (0.0%)",

  entradas: [
    { id: 1, nome: "CAM 1", tipo: "camera", imagem: `${ASSETS}fonte1.jpg` },
    { id: 2, nome: "CAM 2", tipo: "camera", imagem: `${ASSETS}fonte2.jpg` },
    { id: 3, nome: "CAM 3", tipo: "camera", imagem: `${ASSETS}fonte3.jpg` },
    { id: 4, nome: "CAM 4", tipo: "camera", imagem: `${ASSETS}fonte4.jpg` },
    { id: 5, nome: "CAM 5", tipo: "camera", imagem: `${ASSETS}fonte5.jpg` },
    { id: 6, nome: "VT — VARZEA", tipo: "player", imagem: `${ASSETS}fonte6.jpg` },
    { id: 7, nome: "PLACAR", tipo: "composicao", imagem: `${ASSETS}fonte7.jpg` },
    { id: 8, nome: "ENTREVISTA", tipo: "composicao", imagem: `${ASSETS}fonte8.jpg` }
  ],

  // `cena` é o nome real de cena no motor que este DSK liga/desliga. É null
  // até `ponte.js` resolver algo plausível em `cenasDoMotor` (projeto real)
  // ou até o operador escolher em "Gerenciar grafismos" (ainda não
  // implementado) — sem isso o DSK fica visível, mas inerte, com aviso,
  // em vez de inventar uma cena que pode não existir no projeto do operador.
  dsk: [
    { id: 1, nome: "Placar", tipo: "placar", noAr: false, cena: null },
    { id: 2, nome: "Logo VARZEA", tipo: "logo", noAr: false, cena: null },
    { id: 3, nome: "Chamada", tipo: "ticker", noAr: false, cena: null },
    { id: 4, nome: "Marca 3Mix", tipo: "marca", noAr: false, cena: null }
  ],

  // Cenas reais do motor conectado (GetSceneList via /api/json), para o DSK
  // e outras telas resolverem nomes em vez de supor. Vazio = sem motor ainda.
  cenasDoMotor: [],

  canais: [
    { id: "C1", nome: "CAM 1", db: -4.0, pan: 0, mudo: false, afv: true, solo: false, ganho: 0 },
    { id: "C2", nome: "CAM 2", db: -8.5, pan: 0, mudo: false, afv: true, solo: false, ganho: 0 },
    { id: "C3", nome: "CAM 3", db: -3.2, pan: 0, mudo: false, afv: true, solo: false, ganho: 0 },
    { id: "C4", nome: "CAM 4", db: -12.0, pan: 0, mudo: false, afv: true, solo: false, ganho: 0 },
    { id: "VT", nome: "VT", db: -7.1, pan: 0, mudo: false, afv: false, solo: false, ganho: 0 },
    { id: "ME", nome: "M/E", db: -6.0, pan: 0, mudo: false, afv: false, solo: false, ganho: 0 },
    { id: "MASTER", nome: "MASTER", db: 0.0, pan: 0, mudo: false, afv: false, solo: false, ganho: 0, principal: true }
  ],

  barramentos: [
    { id: "pgm", nome: "PGM — Programa", db: -3.1 },
    { id: "aux1", nome: "AUX 1 — Retorno", db: -8.4 },
    { id: "aux2", nome: "AUX 2 — Painel", db: -6.2 },
    { id: "n1", nome: "N-1 — Convidados", db: -5.8 },
    { id: "clean", nome: "Clean Feed", db: -3.1 },
    { id: "iso", nome: "ISO — Gravação", db: -0.9 }
  ],

  lances: [
    { id: 1, tipo: "Gol", icone: "gol", tempo: "19:29:42", duracao: "9.98s", angulos: 3 },
    { id: 2, tipo: "Defesa", icone: "defesa", tempo: "19:28:15", duracao: "7.42s", angulos: 2 },
    { id: 3, tipo: "Falta", icone: "falta", tempo: "19:26:30", duracao: "6.18s", angulos: 2 },
    { id: 4, tipo: "Lance 4", icone: "lance", tempo: "19:24:10", duracao: "5.03s", angulos: 3 }
  ],

  replay: {
    playerA: { preparado: false, noAr: false, posicao: 0, duracao: 9 },
    playerB: { preparado: true, noAr: false, posicao: 0, duracao: 9 },
    velocidade: 50,
    vincular: true,
    marcadorIn: 18,
    marcadorOut: 64,
    alvo: "A",
    autoEntrada: false,
    aoVivo: true,
    tempoGravacao: 24 * 60 + 18
  },

  config: {
    preset: "1080p",
    largura: 1920,
    altura: 1080,
    fps: 59.94,
    varredura: "Progressivo",
    usarFormatoProducao: true,
    larguraSaida: 1920,
    alturaSaida: 1080,
    fpsSaida: 59.94,
    varreduraSaida: "Progressivo",
    reenquadrar: true,
    modoAjuste: "proporcao"
  }
};

export const formatador = {
  tc(segundos) {
    const s = Math.max(0, Math.floor(segundos));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  },
  hms(segundos) {
    const s = Math.max(0, Math.floor(segundos));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    return [h, m, r].map((n) => String(n).padStart(2, "0")).join(":");
  },
  db(v) {
    return `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
  }
};

// ── store minimalista com assinatura por evento ──────────────
const ouvintes = new Map();

export function ao(evento, fn) {
  if (!ouvintes.has(evento)) ouvintes.set(evento, new Set());
  ouvintes.get(evento).add(fn);
  return () => ouvintes.get(evento)?.delete(fn);
}

export function emitir(evento, dado) {
  for (const fn of ouvintes.get(evento) || []) {
    try { fn(dado); } catch (erro) { console.error(`[3Mix] ouvinte ${evento}:`, erro); }
  }
}

export const consultas = {
  entrada: (id) => estado.entradas.find((e) => e.id === Number(id)),
  canal: (id) => estado.canais.find((c) => c.id === id),
  lances: () => estado.lances,
  totalLances() {
    return estado.lances.reduce((acc, l) => acc + parseFloat(l.duracao), 0);
  }
};
