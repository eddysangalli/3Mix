// Native audio tap registry — ponto ÚNICO de acesso ao vendor request nativo "call_audio"
// (FreeMixCallAudio.cpp). Existe porque esse recurso nativo é EXCLUSIVO por desenho: um
// único Set global de taps no C++, substituído inteiro a cada "configure" (confirmado por
// leitura de FreeMixCallAudio.cpp — Stop() + replace, não união). Sem este registry, Calls
// e 3Mix Crew (Fase 1 do superprompt) chamando "configure" cada um com suas próprias
// fontes se ROUBARIAM a captura um do outro.
//
// Decisão de arquitetura (pedido explícito do dono, 03/11/2026): "separe completamente os
// buses e permissões do Crew dos Calls" + "não duplique motores, não quebre o 3Mix Calls".
// Resolvido assim: este registry é o ÚNICO chamador de call_audio; cada consumidor
// (identificado por uma string curta, ex. "calls"/"crew") registra as UUIDs de fonte que
// precisa; o registry manda ao motor a UNIÃO de todas, e demultiplexa cada pacote recebido
// de volta só para os consumidores que pediram aquela UUID. Isso é "separar buses" no nível
// de ROTEAMENTO (cada consumidor só vê e mixa o que pediu), preservando a única captura
// nativa real (não duplicada). CallReturns (Calls) pode migrar para isto depois — não migrado
// nesta rodada para não arriscar regressão em produção sem QA dedicado; ver nota no fim.
import { EventEmitter } from 'node:events';
export class AudioTapRegistry extends EventEmitter {
  constructor(production) {
    super();
    this.p = production;
    this.consumers = new Map(); // nome -> Set<uuid>
    this.configured = new Set(); // união atual já confirmada pelo motor
    this.timer = null;
    this.reconcileTail = Promise.resolve();
    this.closed = false;
    this.drainGeneration = 0;
    this.captureUncertain = false;
    this.reconfiguring = false;
    this.pendingStops = 0;
    this.draining = false;
    this.closePromise = null;
  }

  // Um consumidor declara (ou atualiza) quais fontes precisa. A união de todos os
  // consumidores é recalculada e, se mudou, reconfigura o motor nativo (uma vez só, nunca
  // uma chamada por consumidor). Nenhum consumidor nunca vê a UUID de outro além da sua
  // própria lista — o filtro por consumidor acontece em drain(), não aqui.
  async claim(consumerName, uuids) {
    if (this.closed) throw Error('Registro de áudio encerrado');
    if (typeof consumerName !== 'string' || !consumerName) throw Error('Nome do consumidor de áudio obrigatório');
    if (!Array.isArray(uuids) || uuids.some((u) => typeof u !== 'string' || !u)) throw Error('Lista de fontes de áudio inválida');
    const requested = new Set(uuids);
    const existing = this.consumers.get(consumerName);
    // Idempotent renewal must not invalidate a batch already addressed to this
    // subscription. Still reconcile so a previous native failure can be retried.
    if (!existing || existing.size !== requested.size || [...requested].some(uuid => !existing.has(uuid))) {
      this.consumers.set(consumerName, requested);
    }
    await this.reconcile();
  }

  async release(consumerName) {
    this.consumers.delete(consumerName);
    await this.reconcile();
  }

  reconcile() {
    const work = this.reconcileTail.then(() => this.reconcileCurrent());
    // Preserve the rejection for this caller, but do not poison later retries.
    this.reconcileTail = work.catch(() => {});
    return work;
  }

  async reconcileCurrent() {
    if (this.closed) return;
    const union = new Set();
    for (const set of this.consumers.values()) for (const u of set) union.add(u);
    const sameSize = union.size === this.configured.size;
    const same = sameSize && [...union].every((u) => this.configured.has(u));
    if (same && !this.captureUncertain) return; // evita reconfigurar o motor (e perder ~3s de buffer) sem necessidade
    if (!union.size) { await this.stopCurrent(); return; }
    this.drainGeneration++;
    this.reconfiguring = true;
    this.captureUncertain = true;
    try {
      const reply = await this.p.vendor('call_audio', { action: 'configure', sources: [...union].map((uuid) => ({ uuid })) }, 'freemix');
      if (reply?.success !== true) throw Error('Configuração da captura de áudio não confirmada');
      // Publish only the source set actually acknowledged by the native engine.
      this.configured = union;
      this.captureUncertain = false;
      if (!this.closed) this.ensureTimer();
    } finally {
      this.reconfiguring = false;
    }
  }

  ensureTimer() {
    if (this.closed || this.captureUncertain || !this.configured.size || this.timer) return;
    this.timer = setInterval(() => this.drainOnce().catch(() => {}), 50);
    this.timer.unref();
  }

  // Chamado a cada 50ms (mesmo ritmo que CallReturns.pump já usa em produção — não um
  // número novo inventado). Pede o batch bruto ao motor UMA VEZ, e entrega a cada
  // consumidor só os pacotes das UUIDs que ele reivindicou — isolamento de bus real, não
  // de confiança: um consumidor NUNCA recebe um pacote de uma fonte que não é dele.
  async drainOnce() {
    if (this.closed || this.captureUncertain || this.reconfiguring || this.pendingStops > 0 || this.draining || !this.configured.size) return;
    this.draining = true;
    try {
      const generation = this.drainGeneration;
      const recipients = [...this.consumers].map(([name, uuids]) => [name, new Set(uuids), uuids]);
      const batch = await this.p.vendor('call_audio', { action: 'drain' }, 'freemix');
      if (this.closed || generation !== this.drainGeneration) return;
      const packets = batch?.packets || [];
      if (!packets.length) return;
      for (const [name, uuids, subscription] of recipients) {
        // A synchronous packets listener can request stop/close reentrantly.
        if (this.closed || generation !== this.drainGeneration) break;
        const current = this.consumers.get(name);
        if (!current || current !== subscription) continue;
        const mine = packets.filter((p) => uuids.has(p.uuid) && current.has(p.uuid));
        if (mine.length) this.emit('packets', name, mine);
      }
    } finally {
      this.draining = false;
    }
  }

  stop() {
    this.drainGeneration++;
    this.pendingStops++;
    const work = this.reconcileTail.then(() => this.stopCurrent()).finally(() => { this.pendingStops--; });
    this.reconcileTail = work.catch(() => {});
    return work;
  }

  async stopCurrent() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    // No acknowledged capture belongs to this registry: do not stop another owner.
    if (!this.configured.size && !this.captureUncertain) return;
    this.drainGeneration++;
    this.pendingStops++;
    this.captureUncertain = true;
    try {
      const reply = await this.p.optional('CallVendorRequest', { vendorName: 'freemix', requestType: 'call_audio', requestData: { action: 'stop' } });
      if (reply?.responseData?.success !== true) throw Error('Parada da captura de áudio não confirmada');
      this.configured = new Set();
      this.captureUncertain = false;
    } finally {
      this.pendingStops--;
    }
  }

  close() {
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    this.consumers.clear();
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    const work = this.stop();
    this.closePromise = work;
    // A failed stop remains visible to its callers, while a later explicit close
    // may retry. The registry stays terminal and cannot accept new captures.
    work.catch(() => { if (this.closePromise === work) this.closePromise = null; });
    return work;
  }
}
