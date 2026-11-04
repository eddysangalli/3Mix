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
  }

  // Um consumidor declara (ou atualiza) quais fontes precisa. A união de todos os
  // consumidores é recalculada e, se mudou, reconfigura o motor nativo (uma vez só, nunca
  // uma chamada por consumidor). Nenhum consumidor nunca vê a UUID de outro além da sua
  // própria lista — o filtro por consumidor acontece em drain(), não aqui.
  async claim(consumerName, uuids) {
    if (typeof consumerName !== 'string' || !consumerName) throw Error('Nome do consumidor de áudio obrigatório');
    if (!Array.isArray(uuids) || uuids.some((u) => typeof u !== 'string' || !u)) throw Error('Lista de fontes de áudio inválida');
    this.consumers.set(consumerName, new Set(uuids));
    await this.reconcile();
  }

  async release(consumerName) {
    this.consumers.delete(consumerName);
    await this.reconcile();
  }

  async reconcile() {
    const union = new Set();
    for (const set of this.consumers.values()) for (const u of set) union.add(u);
    const sameSize = union.size === this.configured.size;
    const same = sameSize && [...union].every((u) => this.configured.has(u));
    if (same) return; // evita reconfigurar o motor (e perder ~3s de buffer) sem necessidade
    this.configured = union;
    if (!union.size) { await this.stop(); return; }
    await this.p.vendor('call_audio', { action: 'configure', sources: [...union].map((uuid) => ({ uuid })) }, 'freemix');
    this.ensureTimer();
  }

  ensureTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => this.drainOnce().catch(() => {}), 50);
    this.timer.unref();
  }

  // Chamado a cada 50ms (mesmo ritmo que CallReturns.pump já usa em produção — não um
  // número novo inventado). Pede o batch bruto ao motor UMA VEZ, e entrega a cada
  // consumidor só os pacotes das UUIDs que ele reivindicou — isolamento de bus real, não
  // de confiança: um consumidor NUNCA recebe um pacote de uma fonte que não é dele.
  async drainOnce() {
    if (!this.configured.size) return;
    const batch = await this.p.vendor('call_audio', { action: 'drain' }, 'freemix');
    const packets = batch?.packets || [];
    if (!packets.length) return;
    for (const [name, uuids] of this.consumers) {
      const mine = packets.filter((p) => uuids.has(p.uuid));
      if (mine.length) this.emit('packets', name, mine);
    }
  }

  async stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.configured = new Set();
    await this.p.optional('CallVendorRequest', { vendorName: 'freemix', requestType: 'call_audio', requestData: { action: 'stop' } });
  }

  async close() {
    this.consumers.clear();
    await this.stop();
  }
}
