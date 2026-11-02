import {MixEffectsEngine} from './mix-effects-producao.mjs';
// Signal Registry — read-only catalog of signals that can later be routed into Input
// Slots via Patch (PRODUCT-VISION.md §3: "Signal Registry: Catálogo de sinais
// disponíveis, incluindo resultados internos.").
//
// Etapa B, primeira fatia: catalogação pura, sem Patch e sem nenhuma escrita no motor.
// Agrega o que os motores existentes já expõem (MAIN, Mix 2/3/4 via get_mixes, AUX,
// Inputs/Compositions) — não inventa capacidade nova, só nomeia o que já existe como
// um grafo de sinais navegável. Nenhuma rota usa este catálogo para comutar nada ainda.
export class SignalRegistryEngine {
  // mixes: shared MixEffectsEngine instance — see the matching comment on
  // OutputEngine's constructor in saidas-producao.mjs (audit finding A6).
  // Defaults to a fresh instance so any existing/future caller that doesn't
  // pass one keeps working exactly as before.
  constructor(p, mixes = new MixEffectsEngine(p)) { this.p = p; this.mixes = mixes; this.lastMixError = null; }

  async summary() {
    const signals = [];
    const state = this.p.state || {};

    // M/E 1 — MAIN é sempre presente (PRODUCT-VISION.md §4); reaproveita o
    // Program/Preview nativo já existente, sem caminho novo.
    signals.push({ id: 'me1:program', kind: 'me-output', meId: 1, label: 'M/E 1 · Programa', routable: false, name: state.program || null });
    signals.push({ id: 'me1:preview', kind: 'me-output', meId: 1, label: 'M/E 1 · Preview', routable: false, name: state.preview || null });

    // M/E 2–4 — independentes, via get_mixes nativo (mesma consulta de estado que
    // saidas-producao.mjs já usa; payload vazio é o ramo seguro confirmado no motor).
    let mixes = [];
    try {
      const r = await this.mixes.read();
      mixes = Array.isArray(r?.mixes) ? r.mixes : [];
      this.lastMixError = null;
    } catch (e) {
      this.lastMixError = e.message;
    }
    for (const mix of mixes) {
      const mixId = Number(mix.mixId);
      if (![2, 3, 4].includes(mixId)) continue;
      // Nesting: o motor agora mantém uma Source pública estável ("proxy") por
      // M/E, criada na primeira vez que ele roda (preview/cut/fade/take) e
      // nunca destruída por configure — proxyUuid é o alvo seguro para Patch.
      // routable fica false até o proxy existir de verdade (M/E nunca usado
      // ainda não tem nada estável para apontar); não inventa um UUID.
      signals.push({
        id: `me${mixId}:output`, kind: 'me-output', meId: mixId,
        label: `M/E ${mixId} · Saída`, routable: !!mix.proxyUuid, signalKey: mix.proxyUuid || null,
        width: mix.width, height: mix.height, transitioning: !!mix.transitioning
      });
    }

    // AUX — roteamento de sinal existente, não um novo processamento (PRODUCT-VISION.md
    // §4: "M/E não é AUX"). Só catalogado se o host conectou o AuxOutputRouter.
    if (this.p.auxOutputRouter && typeof this.p.auxOutputRouter.getAllAuxBuses === 'function') {
      for (const bus of this.p.auxOutputRouter.getAllAuxBuses()) {
        signals.push({ id: `aux:${bus.id}`, kind: 'aux', label: bus.name, routable: false, metadataOnly: true, sourceType: bus.sourceType });
      }
    }

    // Inputs operacionais já no acervo. Uma Composition hoje já materializa como
    // Scene/Input (entradas-producao.mjs); aqui ela é só rotulada, não duplicada.
    for (const input of state.inputs || []) {
      signals.push({
        id: `input:${input.key}`, kind: input.composition ? 'composition' : 'input',
        label: input.name, routable: false, inputKey: input.key, inputNumber: input.number
      });
    }

    // Tally de M/E 2-4 incluído aqui (não no refresh() principal de Production, que roda em loop apertado): esta
    // rota só é consultada sob demanda pelo painel, então o custo extra de GetSceneItemList por M/E ativo fica
    // isolado dessa consulta, nunca somado ao ciclo de estado constante da mesa.
    const meTally = await this.meTally().catch(() => ({}));

    return {
      version: 1,
      signals,
      meTally,
      mixError: this.lastMixError,
      note: 'Catálogo somente-leitura (Etapa B); Patch/Input Slot ainda não aplicam roteamento real a partir daqui.'
    };
  }

  // Tally for M/E 2-4, mirroring exactly how MAIN's own tally works (controle-producao.mjs's visibleTree: walk
  // the scene item tree recursively, counting nested scenes/groups as visible). MAIN's confirmation never
  // checks another M/E's state (the task's explicit rule, already enforced in mix-effects-producao.mjs); this
  // tally is the read-only counterpart for M/E 2-4's own Program/Preview, never touching MAIN's own tree.
  async meTally() {
    const inputsByKey = new Map((this.p.state?.inputs || []).map((i) => [i.key, i.name]));
    let mixes = [];
    try { mixes = (await this.mixes.read())?.mixes || []; } catch { /* reported via summary()'s own mixError path */ }
    const result = {};
    for (const mix of mixes) {
      const mixId = Number(mix.mixId);
      if (![2, 3, 4].includes(mixId)) continue;
      const programName = inputsByKey.get(mix.programUuid), previewName = inputsByKey.get(mix.previewUuid);
      const [programTree, previewTree] = await Promise.all([
        programName ? this.p.visibleTree(programName) : new Set(),
        previewName ? this.p.visibleTree(previewName) : new Set(),
      ]);
      result[mixId] = { program: [...programTree], preview: [...previewTree] };
    }
    return result;
  }
}
