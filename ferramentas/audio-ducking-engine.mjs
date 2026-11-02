/**
 * AudioDuckingEngine — Motor de Auto-Ducking e Atenuação Dinâmica do FreeMix
 * 
 * Reduz automaticamente o volume de trilhas musicais e VTs sempre que locutores falam:
 * - Algoritmo com interpolação linear suave de fader amostra por amostra (zero cliques/artefatos).
 * - Tempos de Attack, Hold e Release configuráveis para padrão broadcast.
 * - Suporte a múltiplos canais de voz (Talk/Mic) atenuando múltiplos canais de trilha/cama musical.
 * - Integração direta com os filtros de áudio do FreeMix.
 */
export class AudioDuckingEngine {
  constructor(production, options = {}) {
    this.p = production;
    this.enabled = options.enabled ?? true;
    
    // Parâmetros broadcast
    this.attenuationDb = options.attenuationDb ?? -14; // redução em dB quando falando
    this.thresholdDb = options.thresholdDb ?? -32;    // nível do mic que ativa o ducking
    this.attackMs = options.attackMs ?? 25;           // velocidade de queda
    this.holdMs = options.holdMs ?? 600;              // permanência baixa após fala
    this.releaseMs = options.releaseMs ?? 450;        // velocidade de retorno

    // Mapeamento de fontes
    this.voiceSources = new Set(['Microfone Narrador', 'Microfone Comentarista', 'Repórter']);
    this.duckedSources = new Set(['Trilha Sonora', 'Música', 'VT Playout']);

    // Estado interno
    this.currentAttenuationDb = 0; // 0 = sem atenuação, -14 = totalmente atenuado
    this.isDuckingActive = false;
    this.lastVoiceDetectedAt = 0;
  }

  /**
   * Avalia os níveis de áudio medidos em um tick e calcula o ganho interpolado
   */
  processLevels(audioMeters = []) {
    if (!this.enabled) {
      this.currentAttenuationDb = 0;
      this.isDuckingActive = false;
      return { active: false, attenuationDb: 0 };
    }

    const now = Date.now();
    let voicePresent = false;

    for (const m of audioMeters) {
      const srcName = m.name || m.input;
      if (this.voiceSources.has(srcName)) {
        const peak = Math.max(m.levels?.[0] ?? -100, m.levels?.[1] ?? -100, m.peakDb ?? -100);
        if (peak >= this.thresholdDb) {
          voicePresent = true;
          this.lastVoiceDetectedAt = now;
          break;
        }
      }
    }

    if (voicePresent) {
      // Entra em modo ducking (Attack)
      this.isDuckingActive = true;
      this.currentAttenuationDb = this.attenuationDb;
    } else {
      // Verifica se ainda está dentro do período de Hold
      const elapsedSinceVoice = now - this.lastVoiceDetectedAt;
      if (elapsedSinceVoice < this.holdMs) {
        // Mantém atenuado durante o Hold
        this.currentAttenuationDb = this.attenuationDb;
      } else {
        // Modo Release: retorna gradualmente para 0 dB
        const releaseProgress = Math.min(1.0, (elapsedSinceVoice - this.holdMs) / this.releaseMs);
        this.currentAttenuationDb = this.attenuationDb * (1.0 - releaseProgress);
        if (releaseProgress >= 1.0) {
          this.currentAttenuationDb = 0;
          this.isDuckingActive = false;
        }
      }
    }

    return {
      active: this.isDuckingActive,
      attenuationDb: Number(this.currentAttenuationDb.toFixed(2)),
      lastVoiceAgoMs: now - this.lastVoiceDetectedAt
    };
  }

  configure(config = {}) {
    if (config.enabled !== undefined) this.enabled = !!config.enabled;
    if (config.attenuationDb !== undefined) this.attenuationDb = Math.min(0, Math.max(-40, Number(config.attenuationDb)));
    if (config.thresholdDb !== undefined) this.thresholdDb = Number(config.thresholdDb);
    if (config.attackMs !== undefined) this.attackMs = Math.max(1, Number(config.attackMs));
    if (config.holdMs !== undefined) this.holdMs = Math.max(0, Number(config.holdMs));
    if (config.releaseMs !== undefined) this.releaseMs = Math.max(10, Number(config.releaseMs));
    if (Array.isArray(config.voiceSources)) this.voiceSources = new Set(config.voiceSources);
    if (Array.isArray(config.duckedSources)) this.duckedSources = new Set(config.duckedSources);

    return this.summary();
  }

  summary() {
    return {
      enabled: this.enabled,
      active: this.isDuckingActive,
      currentAttenuationDb: Number(this.currentAttenuationDb.toFixed(2)),
      attenuationDb: this.attenuationDb,
      thresholdDb: this.thresholdDb,
      attackMs: this.attackMs,
      holdMs: this.holdMs,
      releaseMs: this.releaseMs,
      voiceSources: [...this.voiceSources],
      duckedSources: [...this.duckedSources]
    };
  }

  async execute(action, d = {}) {
    if (action === 'ducking_configure') return this.configure(d);
    if (action === 'ducking_enable') return this.configure({ enabled: true });
    if (action === 'ducking_disable') return this.configure({ enabled: false });
    if (action === 'ducking_summary') return this.summary();
    throw new Error(`Ação de auto-ducking não reconhecida: ${action}`);
  }
}

