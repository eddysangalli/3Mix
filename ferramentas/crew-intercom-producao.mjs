// 3Mix Crew — Intercom (Fase 1 do superprompt de Melhorias Broadcast + Crew).
//
// Arquitetura (pedido explícito do dono, 03/11/2026, registrado aqui para não se perder):
// 1. Reaproveita o motor de mixagem PCM existente (mixReturn, retornos-calls.mjs) — função
//    pura, já testada em produção pelo 3Mix Calls, NÃO duplicada nem reescrita.
// 2. Reaproveita a captura nativa via AudioTapRegistry (audio-tap-registry.mjs) — nunca
//    chama call_audio diretamente; isso é o que garante bus separado de Calls sem duas
//    capturas nativas concorrentes (o recurso nativo é exclusivo, ver comentário lá).
// 3. Transporte DESACOPLADO da mixagem: esta classe produz buffers PCM mixados por membro
//    e os entrega via EventEmitter ('mix', memberId, pcmBuffer) — quem estiver ouvindo
//    decide COMO entregar (WebSocket binário hoje; WebRTC pode assinar o mesmo evento
//    depois, sem mudar uma linha daqui). Nenhuma lógica de WebSocket/WebRTC mora aqui.
// 4. Grupos + PTT individual/coletivo + prioridade da direção: modelo de dados abaixo.
// 5. Isolamento do PGM (regra 5 do superprompt, obrigatória): esta classe NUNCA chama
//    production.run()/req() para tocar o motor de vídeo/PGM, nunca escreve num bus M/A/B
//    nem em qualquer estado do motor — só lê pacotes PCM já capturados pelo registry
//    compartilhado e os remixa em memória. Confirmar por teste negativo dedicado (ver
//    qa-finalizacao/crew-broadcast-20261103/testar-crew-intercom-isolamento-pgm.mjs).
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mixReturn } from './retornos-calls.mjs';

const PTT_LEASE_TTL_MS = 1500; // mesmo valor que o talkback de Calls já usa (controle-producao.mjs)

export class CrewIntercomEngine extends EventEmitter {
  constructor(registry) {
    super();
    this.registry = registry; // AudioTapRegistry compartilhado — nunca cria o próprio
    this.members = new Map(); // memberId -> {memberId, name, sourceUuid, groupIds:Set, role, connected, lastSeenAt}
    this.groups = new Map(); // groupId -> {groupId, name, priority}
    this.activePtt = new Map(); // memberId -> {lease, targets:Set<memberId|groupId>, expiresAt, isDirector}
    this.cursors = new Map(); // memberId -> cursor de janela (alinhamento temporal por ouvinte)
    this.lastPackets = []; // janela curta para a mixagem (mesmo padrão de `pending` em CallReturns)
    this.watchdog = setInterval(() => this.expirePtt(), 150); // mesmo ritmo do watchdog de talkback já em produção
    this.watchdog.unref();
    this.onRegistryPackets = (consumer, packets) => { if (consumer === 'crew') this.onPackets(packets); };
    this.registry.on('packets', this.onRegistryPackets);
  }

  // --- Cadastro (sem tocar o motor; isto é só estado do Intercom) ---
  registerMember({ memberId = randomUUID(), name, sourceUuid, role = 'crew' } = {}) {
    if (typeof sourceUuid !== 'string' || !sourceUuid) throw Error('Membro do Crew precisa de uma fonte de áudio (sourceUuid) real');
    if (!['director', 'crew'].includes(role)) throw Error('Função de membro inválida');
    this.members.set(memberId, { memberId, name: String(name || memberId).slice(0, 80), sourceUuid, groupIds: new Set(), role, connected: false, lastSeenAt: 0 });
    return memberId;
  }
  removeMember(memberId) {
    this.members.delete(memberId);
    this.cursors.delete(memberId);
    for (const ptt of this.activePtt.values()) ptt.targets.delete(memberId);
  }
  createGroup({ groupId = randomUUID(), name, priority = 0 } = {}) {
    this.groups.set(groupId, { groupId, name: String(name || groupId).slice(0, 80), priority: Number(priority) || 0 });
    return groupId;
  }
  setMemberGroups(memberId, groupIds) {
    const member = this.members.get(memberId); if (!member) throw Error('Membro não encontrado');
    for (const g of groupIds) if (!this.groups.has(g)) throw Error('Grupo não encontrado: ' + g);
    member.groupIds = new Set(groupIds);
  }
  heartbeat(memberId) { const m = this.members.get(memberId); if (m) { m.connected = true; m.lastSeenAt = Date.now(); } }
  markDisconnected(memberId) { const m = this.members.get(memberId); if (m) m.connected = false; }

  // Reivindica ao registry compartilhado exatamente as fontes dos membros cadastrados —
  // nunca mais, nunca menos. Chame depois de registerMember/removeMember.
  async syncRegistry() {
    await this.registry.claim('crew', [...this.members.values()].map((m) => m.sourceUuid));
  }

  // --- PTT (push-to-talk) ---
  // targets: array de memberId e/ou groupId. Resolvido em tempo real a cada mixagem — se a
  // composição de um grupo mudar enquanto o PTT está ativo, a próxima mixagem já reflete.
  startPtt(memberId, targets) {
    const member = this.members.get(memberId); if (!member) throw Error('Membro não encontrado');
    if (!Array.isArray(targets) || !targets.length) throw Error('Selecione ao menos um destinatário');
    const lease = randomUUID();
    this.activePtt.set(memberId, { lease, targets: new Set(targets), expiresAt: Date.now() + PTT_LEASE_TTL_MS, isDirector: member.role === 'director' });
    return { lease, ttlMs: PTT_LEASE_TTL_MS };
  }
  pingPtt(memberId, lease) {
    const ptt = this.activePtt.get(memberId);
    if (!ptt || ptt.lease !== lease) throw Error('PTT expirado ou inválido; pressione de novo');
    ptt.expiresAt = Date.now() + PTT_LEASE_TTL_MS;
  }
  stopPtt(memberId, lease) {
    const ptt = this.activePtt.get(memberId);
    if (ptt && (lease === undefined || ptt.lease === lease)) this.activePtt.delete(memberId);
  }
  // Fail-safe real: nenhum PTT sobrevive além do TTL sem ping (watchdog por intervalo, não
  // uma promessa de que o cliente vai mandar "stop" educadamente).
  expirePtt() {
    const now = Date.now();
    for (const [memberId, ptt] of this.activePtt) if (ptt.expiresAt <= now) this.activePtt.delete(memberId);
  }

  // Resolve um target (memberId OU groupId) para o conjunto real de memberIds destinatários.
  resolveTarget(target) {
    if (this.members.has(target)) return [target];
    if (this.groups.has(target)) return [...this.members.values()].filter((m) => m.groupIds.has(target)).map((m) => m.memberId);
    return [];
  }

  // --- Mixagem (reaproveita mixReturn, nunca reimplementa DSP) ---
  onPackets(packets) {
    this.lastPackets.push(...packets);
    if (this.lastPackets.length > 1000) this.lastPackets.splice(0, this.lastPackets.length - 1000);
    this.mixAll();
  }

  mixAll() {
    if (!this.lastPackets.length) return;
    const rate = this.lastPackets[0].rate, block = Math.round(rate * 0.05);
    for (const listener of this.members.values()) {
      // Quem este listener deve ouvir agora: todo falante PTT ativo cujo alvo resolvido
      // inclua este listener (e que não seja o próprio listener). Prioridade da direção
      // (regra explícita do dono): se algum diretor está falando para este listener,
      // falantes "crew" comuns são SILENCIADOS para ele enquanto isso — nunca misturados
      // com a voz do diretor ao mesmo tempo.
      const falandoParaMim = [...this.activePtt.entries()].filter(([speakerId, ptt]) => speakerId !== listener.memberId && [...ptt.targets].some((t) => this.resolveTarget(t).includes(listener.memberId)));
      const diretorFalando = falandoParaMim.some(([, ptt]) => ptt.isDirector);
      const falantesEfetivos = diretorFalando ? falandoParaMim.filter(([, ptt]) => ptt.isDirector) : falandoParaMim;
      const sources = new Set(falantesEfetivos.map(([speakerId]) => this.members.get(speakerId)?.sourceUuid).filter(Boolean));
      if (!sources.size) continue;
      const output = mixReturn(this.lastPackets, { own: listener.sourceUuid, sources, director: null, lease: null, targets: new Set(), key: listener.memberId, window: { rate, start: this.cursorFor(listener.memberId, rate, block), frames: block } });
      if (output) this.emit('mix', listener.memberId, output);
    }
  }

  // Cursor por ouvinte — MESMO algoritmo de janela deslizante que CallReturns.pump já usa
  // em produção (retornos-calls.mjs:70-74), replicado com fidelidade (não uma versão
  // simplificada): salto grosso (>50% de rate ou cursor atrasado) força resync completo;
  // desvio pequeno é corrigido GRADUALMENTE (drift de até 5% do bloco por chamada), nunca
  // deixado "preso" fora de sincronia. Cursor PRÓPRIO por listener (não compartilhado): o
  // atraso de processamento de um ouvinte nunca afeta o alinhamento temporal dos demais.
  //
  // Bug real encontrado e corrigido nesta rodada: a 1ª versão usava um limiar de resync de
  // 100% de `rate` (1s) em vez dos 50% que CallReturns já usa — um gap de silêncio entre
  // duas sessões de PTT diferentes (ex.: diretor para de falar, 200-500ms depois outra
  // pessoa começa) ficava ABAIXO do limiar de resync mas sem a correção fina de drift que
  // existia em produção, deixando o cursor "preso" numa janela que nunca intersectava os
  // pacotes novos — o ouvinte nunca recebia nada. Achado por teste real (fluxo com gap
  // entre falantes diferentes), não por leitura: ver qa-finalizacao/crew-broadcast-
  // 20261103/testar-crew-reconexao-multimembro.mjs.
  cursorFor(memberId, rate, block) {
    const newest = Math.max(...this.lastPackets.map((p) => Number(BigInt(p.timestamp) * BigInt(rate) / 1000000000n) + p.frames));
    const targetLag = block * 2;
    let cursor = this.cursors.get(memberId);
    if (cursor === undefined) { cursor = newest - targetLag; }
    else {
      const currentLag = newest - cursor;
      if (currentLag > rate * 0.5 || currentLag < -block) cursor = newest - targetLag; // salto grosso: resync completo
      else if (Math.abs(currentLag - targetLag) > rate * 0.01) { // desvio pequeno: corrige gradualmente, nunca trava
        const driftAdj = Math.sign(currentLag - targetLag) * Math.min(Math.abs(Math.round((currentLag - targetLag) * 0.05)), Math.round(block * 0.05));
        cursor += driftAdj;
      }
    }
    this.cursors.set(memberId, cursor + block);
    return cursor;
  }

  summary() {
    return {
      membros: [...this.members.values()].map((m) => ({ memberId: m.memberId, name: m.name, role: m.role, groupIds: [...m.groupIds], connected: m.connected, falando: this.activePtt.has(m.memberId) })),
      grupos: [...this.groups.values()],
      pttAtivos: [...this.activePtt.entries()].map(([memberId, ptt]) => ({ memberId, targets: [...ptt.targets], isDirector: ptt.isDirector, expiresAt: ptt.expiresAt })),
    };
  }

  async close() {
    clearInterval(this.watchdog);
    this.activePtt.clear();
    this.registry.off('packets', this.onRegistryPackets);
    await this.registry.release('crew');
  }
}
