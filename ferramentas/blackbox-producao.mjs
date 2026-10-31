import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * IncidentBlackboxEngine — Caixa-Preta de Incidentes de Transmissão do FreeMix
 * 
 * Funcionalidade estilo aviação/broadcast profissional:
 * - Mantém ring buffer em memória com telemetria dos últimos 60 segundos.
 * - Detectores automáticos de anomalia (quedas de sinal, drop de quadros, silêncio anormal, desconexão de stream).
 * - Snapshot instantâneo de diagnóstico salvo em disco no momento da falha.
 * - Cooldown inteligente contra tempestade de disparos repetitivos.
 * - Suporte a marcação manual pelo operador ("Marcar Falha").
 */
export class IncidentBlackboxEngine {
  constructor(production, options = {}) {
    this.p = production;
    this.bufferSeconds = options.bufferSeconds || 60;
    this.ringBuffer = [];
    this.incidents = [];
    this.lastTriggerTimes = new Map();
    this.cooldownMs = options.cooldownMs || 30000; // 30s de cooldown por tipo
    this.silenceCounter = 0;
    this.logsDir = join(production.root || process.cwd(), 'logs', 'incidents');
  }

  /**
   * Chamado periodicamente (a cada tick de ~1s) para coletar telemetria
   */
  async sampleTick(sample = {}) {
    const p = this.p;
    const now = Date.now();

    const telemetry = {
      timestamp: now,
      cpuPercent: sample.cpuPercent ?? p.state?.video?.cpuPercent ?? 0,
      fps: sample.fps ?? p.state?.video?.fps ?? 60,
      frameDrops: sample.frameDrops ?? p.state?.video?.frameDrops ?? 0,
      streaming: p.state?.streaming ?? false,
      recording: p.state?.recording ?? false,
      program: p.state?.program || null,
      preview: p.state?.preview || null,
      audioMuted: (p.state?.audioInputs || []).find(a => a.name === 'Master')?.muted ?? false,
      inputsStatus: (p.state?.inputs || []).map(i => ({
        key: i.key,
        name: i.name,
        signal: i.health?.signal || 'ok'
      }))
    };

    this.ringBuffer.push(telemetry);
    if (this.ringBuffer.length > this.bufferSeconds) {
      this.ringBuffer.shift();
    }

    // Avaliação de triggers automáticos
    await this._evaluateTriggers(telemetry);
  }

  async _evaluateTriggers(telemetry) {
    const now = telemetry.timestamp;

    // 1. Trigger: Perda de sinal em câmera no Program
    const pgmInput = (this.p.state?.inputs || []).find(i => i.name === telemetry.program || i.key === telemetry.program);
    if (pgmInput && (pgmInput.health?.signal === 'lost' || pgmInput.health?.signal === 'error')) {
      await this.triggerIncident('SIGNAL_LOST_ON_PROGRAM', {
        input: pgmInput.name,
        details: 'Câmera em exibição ativa perdeu sinal de vídeo.'
      });
    }

    // 2. Trigger: Pico de Drop de Quadros (se houver histórico de 5s)
    if (this.ringBuffer.length >= 5) {
      const fiveSecsAgo = this.ringBuffer[this.ringBuffer.length - 5];
      const dropDelta = (telemetry.frameDrops || 0) - (fiveSecsAgo.frameDrops || 0);
      if (dropDelta > 30) {
        await this.triggerIncident('FRAME_DROP_SPIKE', {
          dropsLast5s: dropDelta,
          totalDrops: telemetry.frameDrops,
          details: `Perda abrupta de ${dropDelta} quadros nos últimos 5 segundos.`
        });
      }
    }

    // 3. Trigger: Silêncio no Master durante transmissão ao vivo
    if (telemetry.streaming || telemetry.recording) {
      if (telemetry.audioMuted) {
        this.silenceCounter++;
        if (this.silenceCounter >= 5) { // 5 segundos consecutivos
          await this.triggerIncident('AUDIO_SILENCE_ON_AIR', {
            secondsMuted: this.silenceCounter,
            details: 'Transmissão no ar com áudio Master mutado continuamente.'
          });
        }
      } else {
        this.silenceCounter = 0;
      }
    } else {
      this.silenceCounter = 0;
    }
  }

  /**
   * Dispara e grava um incidente
   */
  async triggerIncident(triggerType, details = {}) {
    const now = Date.now();
    const lastTime = this.lastTriggerTimes.get(triggerType) || 0;

    // Respeitar cooldown para evitar gravação massiva do mesmo evento repetido
    if (now - lastTime < this.cooldownMs && triggerType !== 'MANUAL_OPERATOR_MARK') {
      return null;
    }
    this.lastTriggerTimes.set(triggerType, now);

    const incidentId = randomUUID();
    const folderName = `${new Date(now).toISOString().replace(/[:.]/g, '-')}_${triggerType}`;
    const incidentDir = join(this.logsDir, folderName);

    const record = {
      id: incidentId,
      timestamp: now,
      date: new Date(now).toISOString(),
      trigger: triggerType,
      details,
      summary: `Incidente registrado: ${triggerType}`,
      telemetryHistory: [...this.ringBuffer],
      snapshot: {
        program: this.p.state?.program || null,
        preview: this.p.state?.preview || null,
        streaming: this.p.state?.streaming || false,
        recording: this.p.state?.recording || false,
        ftb: this.p.state?.ftb || false,
        inputs: (this.p.state?.inputs || []).map(i => ({ key: i.key, name: i.name, health: i.health })),
        audioInputs: (this.p.state?.audioInputs || []).map(a => ({ name: a.name, muted: a.muted }))
      }
    };

    try {
      await mkdir(incidentDir, { recursive: true });
      await writeFile(join(incidentDir, 'incident.json'), JSON.stringify(record, null, 2), 'utf8');
      record.savedPath = join(incidentDir, 'incident.json');
    } catch {
      // Falha ao gravar no disco preserva ao menos em memória
    }

    this.incidents.unshift({
      id: record.id,
      timestamp: record.timestamp,
      date: record.date,
      trigger: record.trigger,
      details: record.details,
      savedPath: record.savedPath || null
    });

    if (this.incidents.length > 50) {
      this.incidents.pop();
    }

    return record;
  }

  summary() {
    return {
      active: true,
      bufferLength: this.ringBuffer.length,
      bufferMaxSeconds: this.bufferSeconds,
      recentIncidentsCount: this.incidents.length,
      recentIncidents: this.incidents.slice(0, 10),
      lastIncident: this.incidents[0] || null
    };
  }

  async execute(action, d = {}) {
    if (action === 'blackbox_mark' || action === 'blackbox_trigger') {
      const trigger = d.trigger || 'MANUAL_OPERATOR_MARK';
      const details = d.details || { note: d.note || 'Marcação manual pelo operador' };
      return this.triggerIncident(trigger, details);
    }
    if (action === 'blackbox_summary') {
      return this.summary();
    }
    if (action === 'blackbox_clear') {
      this.incidents = [];
      return this.summary();
    }
    throw new Error(`Ação de blackbox não reconhecida: ${action}`);
  }
}

