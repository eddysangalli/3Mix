import { createHash } from 'node:crypto';

export const HEALTH_STATUS = Object.freeze({
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  STALLED: 'stalled',
  OFFLINE: 'offline',
  ERROR: 'error'
});

export const TALLY_STATE = Object.freeze({
  PROGRAM: 'program',
  PREVIEW: 'preview',
  OVERLAY: 'overlay',
  STANDBY: 'standby'
});

export class InputHealthEngine {
  constructor(options = {}) {
    this.maxInputs = options.maxInputs || 64;
    this.maxLogs = options.maxLogs || 100;
    this.inputs = new Map();
    this.logs = [];
    this.programUuid = null;
    this.previewUuid = null;
    this.activeOverlays = new Set();
  }

  registerInput(uuid, name, type = 'camera') {
    if (!uuid || typeof uuid !== 'string') throw new Error('UUID de entrada inválido');
    if (!name || typeof name !== 'string') throw new Error('Nome de entrada obrigatório');
    if (this.inputs.size >= this.maxInputs && !this.inputs.has(uuid)) {
      throw new Error(`Limite defensivo de ${this.maxInputs} entradas atingido`);
    }

    const inputData = {
      uuid,
      name,
      type,
      health: HEALTH_STATUS.HEALTHY,
      tally: TALLY_STATE.STANDBY,
      fps: 0,
      droppedFrames: 0,
      audioPeakDb: -60.0,
      audioMuted: false,
      lastSeen: Date.now(),
      consecutiveUnchanged: 0,
      lastHash: null,
      error: null
    };

    this.inputs.set(uuid, inputData);
    this.log('INFO', `Entrada registrada: ${name} (${type})`, { uuid });
    return inputData;
  }

  unregisterInput(uuid) {
    if (this.inputs.has(uuid)) {
      const name = this.inputs.get(uuid).name;
      this.inputs.delete(uuid);
      this.log('INFO', `Entrada removida: ${name}`, { uuid });
      return true;
    }
    return false;
  }

  getInput(uuid) {
    return this.inputs.get(uuid) || null;
  }

  updateFrameTelemetry(uuid, { frameData, fps = 30, droppedFrames = 0 }) {
    const input = this.inputs.get(uuid);
    if (!input) throw new Error(`Entrada ${uuid} não encontrada`);

    const now = Date.now();
    input.lastSeen = now;
    input.fps = Math.max(0, Math.min(240, Number(fps) || 0));
    input.droppedFrames = Math.max(0, Number(droppedFrames) || 0);

    if (frameData) {
      const hash = createHash('sha256').update(frameData).digest('hex');
      if (hash === input.lastHash) {
        input.consecutiveUnchanged++;
        if (input.consecutiveUnchanged >= 30) {
          input.health = HEALTH_STATUS.DEGRADED;
          input.error = 'Vídeo estagnado ou sem alteração';
        }
      } else {
        input.consecutiveUnchanged = 0;
        input.lastHash = hash;
        input.health = HEALTH_STATUS.HEALTHY;
        input.error = null;
      }
    }

    return input;
  }

  updateAudioTelemetry(uuid, { peakDb = -60.0, muted = false }) {
    const input = this.inputs.get(uuid);
    if (!input) throw new Error(`Entrada ${uuid} não encontrada`);

    input.audioPeakDb = Math.max(-60.0, Math.min(0.0, Number(peakDb) || -60.0));
    input.audioMuted = Boolean(muted);
    return input;
  }

  setSignalFailure(uuid, errorMessage = 'Sinal perdido') {
    const input = this.inputs.get(uuid);
    if (!input) throw new Error(`Entrada ${uuid} não encontrada`);

    input.health = HEALTH_STATUS.OFFLINE;
    input.error = String(errorMessage);
    this.log('WARN', `Falha de sinal isolada na entrada ${input.name}: ${errorMessage}`, { uuid });
    return input;
  }

  setMasterTally({ programUuid = null, previewUuid = null, overlayUuids = [] }) {
    this.programUuid = programUuid;
    this.previewUuid = previewUuid;
    this.activeOverlays = new Set(overlayUuids);

    for (const [uuid, input] of this.inputs.entries()) {
      if (uuid === this.programUuid) {
        input.tally = TALLY_STATE.PROGRAM;
      } else if (this.activeOverlays.has(uuid)) {
        input.tally = TALLY_STATE.OVERLAY;
      } else if (uuid === this.previewUuid) {
        input.tally = TALLY_STATE.PREVIEW;
      } else {
        input.tally = TALLY_STATE.STANDBY;
      }
    }
  }

  getCallTallyMessage(uuid) {
    const input = this.inputs.get(uuid);
    if (!input) return null;

    return {
      type: 'tally',
      uuid,
      state: input.tally,
      onAir: input.tally === TALLY_STATE.PROGRAM || input.tally === TALLY_STATE.OVERLAY,
      timestamp: Date.now()
    };
  }

  log(severity, message, metadata = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      severity: ['INFO', 'WARN', 'ERROR'].includes(severity) ? severity : 'INFO',
      message: String(message).slice(0, 500),
      metadata
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    return entry;
  }

  getSummary() {
    const values = [...this.inputs.values()];
    const total = values.length;
    const healthy = values.filter(i => i.health === HEALTH_STATUS.HEALTHY).length;
    const degraded = values.filter(i => i.health === HEALTH_STATUS.DEGRADED).length;
    const offline = values.filter(i => i.health === HEALTH_STATUS.OFFLINE).length;
    const stalled = values.filter(i => i.health === HEALTH_STATUS.STALLED).length;
    const error = values.filter(i => i.health === HEALTH_STATUS.ERROR).length;
    return {
      total,
      healthy,
      degraded,
      offline,
      stalled,
      error,
      healthyStatus: total === 0 || (degraded === 0 && offline === 0 && error === 0)
    };
  }

  getLogs(limit = 20) {
    return this.logs.slice(-Math.max(1, Math.min(this.maxLogs, Number(limit) || 20)));
  }

  getSnapshot() {
    return {
      timestamp: new Date().toISOString(),
      programUuid: this.programUuid,
      previewUuid: this.previewUuid,
      totalInputs: this.inputs.size,
      healthyInputs: [...this.inputs.values()].filter(i => i.health === HEALTH_STATUS.HEALTHY).length,
      degradedInputs: [...this.inputs.values()].filter(i => i.health === HEALTH_STATUS.DEGRADED).length,
      offlineInputs: [...this.inputs.values()].filter(i => i.health === HEALTH_STATUS.OFFLINE).length,
      inputs: [...this.inputs.values()].map(({ lastHash, ...rest }) => rest),
      recentLogs: this.logs.slice(-20)
    };
  }
}
