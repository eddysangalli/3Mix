/**
 * Atraso de segurança e DUMP da transmissão principal.
 *
 * Os pacotes reais ficam no motor (obs_output_set_delay em libobs); este módulo só lê o estado,
 * aplica a configuração e pede o descarte. DUMP nunca responde sucesso sem o motor confirmar
 * que descartou, para o operador não achar que censurou algo que foi ao ar.
 *
 * Depois do DUMP, o motor esvazia a fila e só volta a aceitar pacotes no próximo keyframe. Por
 * isso a imagem no destino segura por cerca do tempo do atraso e volta com a proteção inteira.
 */
export const DELAY_MIN_SECONDS = 1;
export const DELAY_MAX_SECONDS = 1800;
export const DELAY_RECOMMENDED_SECONDS = 7;
const REFRESH_MS = 500;

export class BroadcastDelayEngine {
  constructor(production) {
    this.p = production;
    this.motor = null;
    this.error = null;
    this.uncovered = [];
    this.readAt = 0;
    this.outputsAt = 0;
    this.stats = { dumpCount: 0, lastDumpAt: 0, lastDiscardedPackets: 0, lastDiscardedBytes: 0 };
  }

  async request(action) {
    return this.p.vendor('broadcast_delay', { action }, 'freemix');
  }

  /** Lê o estado do motor. Nunca lança: sem motor, o resumo mostra indisponível. */
  async refresh(force = false) {
    const now = Date.now();
    if (!force && now - this.readAt < REFRESH_MS) return;
    this.readAt = now;
    try {
      this.motor = await this.request('state');
      this.error = null;
    } catch (e) {
      this.motor = null;
      this.error = e.message;
      return;
    }
    if (force || now - this.outputsAt >= 2000) {
      this.outputsAt = now;
      try {
        const list = (await this.p.vendor('get_destinations', {}, 'freemix')).destinations || [];
        this.uncovered = list.filter((d) => d.active).map((d) => d.name || 'Saída extra');
      } catch { this.uncovered = []; }
    }
  }

  summary() {
    const m = this.motor;
    const activeSeconds = Number(m?.active_seconds || 0);
    const configuredSeconds = Number(m?.configured_seconds || 0);
    const configured = !!m?.configured;
    const streaming = !!m?.streaming;
    const bufferedSeconds = Number((Number(m?.buffered_ms || 0) / 1000).toFixed(1));
    const active = streaming && activeSeconds > 0;
    let state = 'unavailable';
    if (m) {
      if (active) state = bufferedSeconds + 0.5 >= activeSeconds ? 'protected' : 'rebuilding';
      else if (streaming) state = 'streaming_without_delay';
      else state = configured ? 'ready' : 'off';
    }
    return {
      available: !!m,
      error: this.error,
      state,
      enabled: configured,
      configuredSeconds,
      preserve: !!m?.preserve,
      streaming,
      active,
      delaySeconds: active ? activeSeconds : configuredSeconds,
      bufferedSeconds,
      canDump: active,
      // Saídas extras não têm atraso: o DUMP não as alcança, e o operador precisa saber disso.
      uncoveredOutputs: active ? this.uncovered : [],
      recommendedSeconds: DELAY_RECOMMENDED_SECONDS,
      stats: { ...this.stats }
    };
  }

  /** DUMP real. Lança erro em português se o motor não descartou. */
  async dump(options = {}) {
    const r = await this.request('dump');
    this.motor = r;
    this.readAt = Date.now();
    if (!r.dumped) {
      throw new Error(r.streaming
        ? 'DUMP não executado: esta transmissão começou sem atraso. Ligue em Configurações e reinicie a transmissão.'
        : 'DUMP não executado: não há transmissão no ar.');
    }
    const result = {
      dumped: true,
      discardedPackets: Number(r.discarded_packets || 0),
      discardedBytes: Number(r.discarded_bytes || 0),
      delaySeconds: Number(r.active_seconds || 0)
    };
    this.stats = {
      dumpCount: this.stats.dumpCount + 1,
      lastDumpAt: Date.now(),
      lastDiscardedPackets: result.discardedPackets,
      lastDiscardedBytes: result.discardedBytes
    };
    if (this.p?.blackboxEngine?.triggerIncident) {
      await this.p.blackboxEngine.triggerIncident('BROADCAST_DELAY_DUMP', {
        ...result,
        note: options.note || 'DUMP acionado pelo operador'
      }).catch(() => {});
    }
    return result;
  }

  /** Grava a configuração. Vale no próximo início da transmissão; o motor recusa com saída no ar. */
  async configure({ enabled, seconds, preserve } = {}) {
    await this.refresh(true);
    if (this.motor?.streaming) throw new Error('Pare a transmissão para mudar o atraso: ele é definido quando ela começa.');
    const values = {};
    if (enabled !== undefined) {
      if (typeof enabled !== 'boolean') throw new Error('Informe enabled como verdadeiro ou falso');
      values.streamDelayEnabled = enabled;
    }
    if (seconds !== undefined) {
      const s = Number(seconds);
      if (!Number.isInteger(s) || s < DELAY_MIN_SECONDS || s > DELAY_MAX_SECONDS) throw new Error(`Atraso: use de ${DELAY_MIN_SECONDS} a ${DELAY_MAX_SECONDS} segundos, em números inteiros`);
      values.streamDelaySeconds = s;
    }
    if (preserve !== undefined) {
      if (typeof preserve !== 'boolean') throw new Error('Informe preserve como verdadeiro ou falso');
      values.preserveDelay = preserve;
    }
    if (!Object.keys(values).length) throw new Error('Informe enabled, seconds ou preserve');
    await this.p.settingsEngine.preferences.execute('settings_apply', { category: 'networkOutput', ...values });
    await this.refresh(true);
    return this.summary();
  }

  async execute(action, d = {}) {
    if (action === 'dump' || action === 'delay_dump') return this.dump(d);
    if (action === 'delay_summary') {
      await this.refresh(true);
      return this.summary();
    }
    if (action === 'delay_set') return this.configure({ enabled: d.enabled, seconds: d.seconds, preserve: d.preserve });
    if (action === 'delay_enable') return this.configure({ enabled: true, seconds: d.seconds });
    if (action === 'delay_disable') return this.configure({ enabled: false });
    throw new Error(`Ação de atraso não reconhecida: ${action}`);
  }
}
