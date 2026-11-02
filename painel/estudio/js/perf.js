// ════════════════════════════════════════════════════════════
// Instrumentação de desempenho (Fase 2 do plano de beta) —
// clique → comando aceito → estado aplicado.
//
// Fica DESLIGADA por padrão (zero custo em produção): só grava
// marks/measures quando `?perf=1` na URL ou
// `localStorage['3mix.perf'] === '1'`. Os nomes de measure usam
// o prefixo "3mix:" para não colidir com marks de outras libs.
// ════════════════════════════════════════════════════════════

const ligado = new URLSearchParams(location.search).get("perf") === "1"
  || (() => { try { return localStorage.getItem("3mix.perf") === "1"; } catch { return false; } })();

export const perfAtivo = ligado;

function nomeMarca(fase, acao) {
  return `3mix-marca:${fase}:${acao}`;
}

// Marca o início de um ciclo (clique do operador). `acao` identifica o
// ciclo (ex.: "cut", "fade", "preview") — chamadas repetidas da mesma
// ação se sobrescrevem (não acumulam marks órfãs), porque cada ciclo de
// teste espera o anterior terminar antes do próximo clique.
export function marcarClique(acao) {
  if (!ligado) return;
  try { performance.mark(nomeMarca("clique", acao)); } catch {}
}

export function marcarComandoAceito(acao) {
  if (!ligado) return;
  try {
    performance.mark(nomeMarca("aceito", acao));
    performance.measure(`3mix:aceite:${acao}`, nomeMarca("clique", acao), nomeMarca("aceito", acao));
  } catch {}
}

export function marcarEstadoAplicado(acao) {
  if (!ligado) return;
  try {
    performance.mark(nomeMarca("aplicado", acao));
    performance.measure(`3mix:aplicado:${acao}`, nomeMarca("aceito", acao), nomeMarca("aplicado", acao));
    performance.measure(`3mix:total:${acao}`, nomeMarca("clique", acao), nomeMarca("aplicado", acao));
  } catch {}
}

// Para a bateria de testes: devolve { count, p50, p95, max } em ms de
// um measure, e limpa os entries medidos (evita o buffer crescer sem
// limite numa sessão longa de QA).
export function coletar(nomeMedida) {
  if (!ligado) return { count: 0, p50: 0, p95: 0, max: 0, media: 0 };
  const entradas = performance.getEntriesByName(nomeMedida, "measure").map((e) => e.duration);
  performance.clearMeasures(nomeMedida);
  if (!entradas.length) return { count: 0, p50: 0, p95: 0, max: 0, media: 0 };
  const ordenado = [...entradas].sort((a, b) => a - b);
  const pct = (p) => ordenado[Math.min(ordenado.length - 1, Math.floor((p / 100) * ordenado.length))];
  const media = entradas.reduce((a, b) => a + b, 0) / entradas.length;
  return { count: entradas.length, p50: pct(50), p95: pct(95), max: ordenado[ordenado.length - 1], media };
}

export function limparTudo() {
  if (!ligado) return;
  try { performance.clearMarks(); performance.clearMeasures(); } catch {}
}

// Long tasks (>50ms de bloqueio da thread principal) durante a janela de
// medidores — usado no teste de 10 min de medidores contínuos (meta: zero
// long task > 50ms durante a operação, regra da Fase 2).
let observadorLongTask = null;
export const longTasks = [];

export function iniciarObservadorLongTask() {
  if (!ligado || observadorLongTask || typeof PerformanceObserver === "undefined") return;
  try {
    observadorLongTask = new PerformanceObserver((lista) => {
      for (const entrada of lista.getEntries()) {
        longTasks.push({ inicio: entrada.startTime, duracao: entrada.duration });
      }
    });
    observadorLongTask.observe({ type: "longtask", buffered: true });
  } catch {
    // navegador sem suporte a 'longtask' (fora do Chromium) — teste de
    // long task fica marcado como NÃO TESTADO nesse ambiente, não como PASS.
  }
}

export function pararObservadorLongTask() {
  observadorLongTask?.disconnect();
  observadorLongTask = null;
}

if (ligado) window.__3mixPerf = { coletar, limparTudo, longTasks, iniciarObservadorLongTask, pararObservadorLongTask };

