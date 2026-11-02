import { EventEmitter } from 'node:events';

export const WATCHDOG_STATE = Object.freeze({
  IDLE: 'idle',
  STREAMING: 'streaming',
  DEGRADED: 'degraded',
  RECONNECTING: 'reconnecting',
  CIRCUIT_OPEN: 'circuit_open',
  ERROR: 'error'
});

export class OutputWatchdogEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxOutputs = options.maxOutputs || 16;
    this.maxLogs = options.maxLogs || 150;
    this.outputs = new Map();
    this.logs = [];
    this.timers = new Map();
  }

  registerOutput(id, config = {}) {
    if (!id || typeof id !== 'string') throw new Error('ID de saída inválido');
    if (this.outputs.size >= this.maxOutputs && !this.outputs.has(id)) {
      throw new Error(`Limite defensivo de ${this.maxOutputs} saídas atingido`);
    }

    const outputData = {
      id,
      name: config.name || id,
      protocol: config.protocol || 'rtmp',
      autoReconnect: config.autoReconnect !== false,
      baseBackoffMs: Math.max(100, Number(config.baseBackoffMs) || 1000),
      maxBackoffMs: Math.max(1000, Number(config.maxBackoffMs) || 30000),
      maxRetries: Math.max(1, Math.min(50, Number(config.maxRetries) || 8)),
      dropFrameThresholdPct: Math.max(1, Math.min(100, Number(config.dropFrameThresholdPct) || 15)),
      
      // Estado de execução
      state: WATCHDOG_STATE.IDLE,
      retriesCount: 0,
      nextRetryDelayMs: 0,
      startedAt: null,
      lastTelemetryAt: null,
      uptimeMs: 0,
      
      // Métricas de telemetria
      bitrateKbps: 0,
      totalFrames: 0,
      droppedFrames: 0,
      droppedPct: 0.0,
      rttMs: 0,
      
      // Erro e motivos
      lastError: null,
      userStopped: true
    };

    this.outputs.set(id, outputData);
    this.log('INFO', `Saída configurada no Watchdog: ${outputData.name} (${outputData.protocol})`, { id });
    return outputData;
  }

  unregisterOutput(id) {
    if (this.timers.has(id)) {
      clearTimeout(this.timers.get(id));
      this.timers.delete(id);
    }
    if (this.outputs.has(id)) {
      const name = this.outputs.get(id).name;
      this.outputs.delete(id);
      this.log('INFO', `Saída removida do Watchdog: ${name}`, { id });
      return true;
    }
    return false;
  }

  getOutput(id) {
    return this.outputs.get(id) || null;
  }

  onStreamStarted(id) {
    const out = this.outputs.get(id);
    if (!out) throw new Error(`Saída ${id} não registrada no Watchdog`);

    if (this.timers.has(id)) {
      clearTimeout(this.timers.get(id));
      this.timers.delete(id);
    }

    out.state = WATCHDOG_STATE.STREAMING;
    out.retriesCount = 0;
    out.nextRetryDelayMs = 0;
    out.startedAt = Date.now();
    out.userStopped = false;
    out.lastError = null;

    this.log('INFO', `Transmissão iniciada com sucesso em [${out.name}]`, { id, state: out.state });
    this.emit('state_change', { id, state: out.state, output: out });
    return out;
  }

  onStreamStopped(id, { userIntentional = true } = {}) {
    const out = this.outputs.get(id);
    if (!out) throw new Error(`Saída ${id} não registrada no Watchdog`);

    if (this.timers.has(id)) {
      clearTimeout(this.timers.get(id));
      this.timers.delete(id);
    }

    out.userStopped = !!userIntentional;
    out.state = WATCHDOG_STATE.IDLE;
    out.uptimeMs = out.startedAt ? Date.now() - out.startedAt : 0;
    out.startedAt = null;

    this.log('INFO', `Transmissão encerrada ${userIntentional ? 'pelo operador' : 'por comando'} em [${out.name}]`, { id, userIntentional });
    this.emit('state_change', { id, state: out.state, output: out });
    return out;
  }

  onStreamDrop(id, { reason = 'Queda de conexão de rede' } = {}) {
    const out = this.outputs.get(id);
    if (!out) throw new Error(`Saída ${id} não registrada no Watchdog`);

    // Se o operador parou intencionalmente, ignorar drop
    if (out.userStopped) {
      return out;
    }

    out.lastError = reason;

    if (!out.autoReconnect) {
      out.state = WATCHDOG_STATE.ERROR;
      this.log('WARN', `Queda na saída [${out.name}] sem auto-reconexão configurada: ${reason}`, { id });
      this.emit('state_change', { id, state: out.state, output: out });
      return out;
    }

    out.retriesCount++;

    if (out.retriesCount > out.maxRetries) {
      out.state = WATCHDOG_STATE.CIRCUIT_OPEN;
      out.nextRetryDelayMs = 0;
      this.log('ALERT', `Disjuntor aberto (Circuit Breaker) para [${out.name}]. Limite de ${out.maxRetries} tentativas excedido: ${reason}`, { id });
      this.emit('circuit_breaker', { id, retries: out.retriesCount, error: reason });
      this.emit('state_change', { id, state: out.state, output: out });
      return out;
    }

    // Cálculo do backoff exponencial determinístico com jitter defensivo
    const exponential = out.baseBackoffMs * Math.pow(2, out.retriesCount - 1);
    const clamped = Math.min(out.maxBackoffMs, exponential);
    // Jitter pseudo-determinístico de até 15% para evitar avalanche de reconexões simultâneas
    const jitter = Math.floor(clamped * 0.15 * (out.retriesCount % 3 === 0 ? 0.8 : 0.4));
    const delay = Math.round(clamped + jitter);

    out.nextRetryDelayMs = delay;
    out.state = WATCHDOG_STATE.RECONNECTING;

    this.log('WARN', `Queda na saída [${out.name}]. Tentativa ${out.retriesCount}/${out.maxRetries} em ${delay}ms: ${reason}`, { id, delay, attempt: out.retriesCount });
    this.emit('reconnecting', { id, attempt: out.retriesCount, maxRetries: out.maxRetries, delay });
    this.emit('state_change', { id, state: out.state, output: out });
    return out;
  }

  scheduleReconnect(id, reconnectFn) {
    const out = this.outputs.get(id);
    if (!out) throw new Error(`Saída ${id} não registrada no Watchdog`);
    if (typeof reconnectFn !== 'function') throw new Error('reconnectFn deve ser uma função executável');

    if (this.timers.has(id)) {
      clearTimeout(this.timers.get(id));
      this.timers.delete(id);
    }

    const timer = setTimeout(async () => {
      this.timers.delete(id);
      try {
        this.log('INFO', `Disparando tentativa de reconexão #${out.retriesCount} para [${out.name}]...`, { id });
        const success = await reconnectFn();
        if (success) {
          this.onStreamStarted(id);
        } else {
          this.onStreamDrop(id, { reason: 'Falha na negociação de reconexão' });
        }
      } catch (err) {
        this.onStreamDrop(id, { reason: err.message || 'Erro durante reconexão' });
      }
    }, out.nextRetryDelayMs);

    this.timers.set(id, timer);
    return timer;
  }

  updateTelemetry(id, { bitrateKbps = 0, totalFrames = 0, droppedFrames = 0, rttMs = 0 } = {}) {
    const out = this.outputs.get(id);
    if (!out) throw new Error(`Saída ${id} não registrada no Watchdog`);

    const now = Date.now();
    out.lastTelemetryAt = now;
    if (out.startedAt) {
      out.uptimeMs = now - out.startedAt;
    }

    out.bitrateKbps = Math.max(0, Number(bitrateKbps) || 0);
    out.totalFrames = Math.max(0, Number(totalFrames) || 0);
    out.droppedFrames = Math.max(0, Number(droppedFrames) || 0);
    out.rttMs = Math.max(0, Number(rttMs) || 0);

    if (out.totalFrames > 0) {
      out.droppedPct = Number(((out.droppedFrames / out.totalFrames) * 100).toFixed(2));
    } else {
      out.droppedPct = 0.0;
    }

    // Avaliação de degradação sob carga
    if (out.state === WATCHDOG_STATE.STREAMING && out.droppedPct >= out.dropFrameThresholdPct) {
      out.state = WATCHDOG_STATE.DEGRADED;
      this.log('WARN', `Degradação detectada na saída [${out.name}]: ${out.droppedPct}% quadros perdidos (acima do teto de ${out.dropFrameThresholdPct}%)`, { id, droppedPct: out.droppedPct });
      this.emit('state_change', { id, state: out.state, output: out });
    } else if (out.state === WATCHDOG_STATE.DEGRADED && out.droppedPct < out.dropFrameThresholdPct) {
      out.state = WATCHDOG_STATE.STREAMING;
      this.log('INFO', `Saída [${out.name}] recuperada e estabilizada (${out.droppedPct}% quadros perdidos)`, { id, droppedPct: out.droppedPct });
      this.emit('state_change', { id, state: out.state, output: out });
    }

    return out;
  }

  resetCircuit(id) {
    const out = this.outputs.get(id);
    if (!out) throw new Error(`Saída ${id} não registrada no Watchdog`);

    if (this.timers.has(id)) {
      clearTimeout(this.timers.get(id));
      this.timers.delete(id);
    }

    out.state = WATCHDOG_STATE.IDLE;
    out.retriesCount = 0;
    out.nextRetryDelayMs = 0;
    out.lastError = null;

    this.log('INFO', `Circuito resetado manualmente para a saída [${out.name}]`, { id });
    this.emit('state_change', { id, state: out.state, output: out });
    return out;
  }

  getSnapshot() {
    const snapshot = {};
    for (const [id, out] of this.outputs.entries()) {
      snapshot[id] = {
        id: out.id,
        name: out.name,
        protocol: out.protocol,
        state: out.state,
        retriesCount: out.retriesCount,
        maxRetries: out.maxRetries,
        nextRetryDelayMs: out.nextRetryDelayMs,
        uptimeMs: out.uptimeMs,
        bitrateKbps: out.bitrateKbps,
        droppedFrames: out.droppedFrames,
        droppedPct: out.droppedPct,
        rttMs: out.rttMs,
        lastError: out.lastError
      };
    }
    return snapshot;
  }

  getSummary() {
    let streaming = 0;
    let degraded = 0;
    let reconnecting = 0;
    let circuitOpen = 0;
    let idle = 0;
    let error = 0;

    for (const out of this.outputs.values()) {
      switch (out.state) {
        case WATCHDOG_STATE.STREAMING: streaming++; break;
        case WATCHDOG_STATE.DEGRADED: degraded++; break;
        case WATCHDOG_STATE.RECONNECTING: reconnecting++; break;
        case WATCHDOG_STATE.CIRCUIT_OPEN: circuitOpen++; break;
        case WATCHDOG_STATE.IDLE: idle++; break;
        case WATCHDOG_STATE.ERROR: error++; break;
      }
    }

    return {
      total: this.outputs.size,
      streaming,
      degraded,
      reconnecting,
      circuitOpen,
      idle,
      error,
      healthy: streaming > 0 && degraded === 0 && reconnecting === 0 && circuitOpen === 0
    };
  }

  log(level, message, data = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    };
    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
    this.emit('log', entry);
  }

  getLogs(limit = 20) {
    return this.logs.slice(0, Math.max(1, Math.min(this.maxLogs, Number(limit) || 20)));
  }

  destroy() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.outputs.clear();
    this.logs = [];
    this.removeAllListeners();
  }
}
