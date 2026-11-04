// Peak hold + clip hold para os medidores de áudio da mesa (vMix 30 "indicadores dinâmicos
// de pico"; nossos medidores já mostravam o nível instantâneo via onMeters()/--l, mas sem
// marca de pico retida nem indicação de clipping). Lógica pura, sem DOM e sem setInterval
// próprio: cada quadro chama update(nivel, agora) e lê peak()/clipped() depois -- o mesmo
// requestAnimationFrame/onMeters que já pinta --l também chama isto, sem segundo timer
// disputando o mesmo elemento.
//
// Unidade do nível: 0..1, igual ao --l que onMeters() já calcula (peak() de inputLevelsMul
// mapeado para 0..1 com referência -60..0 dBFS). Não inventa uma segunda escala.
(() => {
  'use strict';

  const CLIP_THRESHOLD = 0.995; // --l=1 é 0 dBFS exato; um pouco abaixo já conta como estourado, igual a consoles reais
  const DEFAULT_HOLD_MS = 1200; // tempo que o pico fica parado antes de começar a cair
  const DEFAULT_DECAY_PER_S = 1.1; // depois do hold, quanto o pico cai por segundo (mesma unidade 0..1)
  const DEFAULT_CLIP_HOLD_MS = 1500; // indicador de clipe fica vermelho por este tempo após o último estouro

  class PeakHoldMeter {
    constructor(options = {}) {
      this.holdMs = options.holdMs ?? DEFAULT_HOLD_MS;
      this.decayPerS = options.decayPerS ?? DEFAULT_DECAY_PER_S;
      this.clipHoldMs = options.clipHoldMs ?? DEFAULT_CLIP_HOLD_MS;
      this.peakValue = 0;
      this.peakAt = 0;
      this.clipAt = -Infinity;
    }

    // nivel: 0..1 (o mesmo valor que onMeters() já calcula para --l). agora: Date.now() do
    // chamador -- não lê o relógio aqui, para o teste poder controlar o tempo sem mocks globais.
    update(nivel, agora) {
      const v = Number.isFinite(nivel) ? Math.min(1, Math.max(0, nivel)) : 0;
      if (v >= this.peakValue) {
        this.peakValue = v;
        this.peakAt = agora;
      } else {
        const sinceHold = agora - this.peakAt - this.holdMs;
        if (sinceHold > 0) {
          const queda = (this.decayPerS * sinceHold) / 1000;
          this.peakValue = Math.max(v, this.peakValue - queda);
        }
      }
      if (v >= CLIP_THRESHOLD) this.clipAt = agora;
      return this.peakValue;
    }

    // Marca de pico atual, para desenhar como uma linha fina no topo do nível instantâneo.
    peak() {
      return this.peakValue;
    }

    // true enquanto o indicador de clipe deve continuar vermelho (durante o estouro e por
    // clipHoldMs depois do último). Nunca limpa sozinho fora de update(); reset() existe para
    // o operador confirmar "vi, pode apagar" sem esperar o tempo passar.
    clipped(agora) {
      return agora - this.clipAt <= this.clipHoldMs;
    }

    reset(agora = this.peakAt) {
      this.peakValue = 0;
      this.peakAt = agora;
      this.clipAt = -Infinity;
    }
  }

  window.PeakHoldMeter = { PeakHoldMeter, CLIP_THRESHOLD, DEFAULT_HOLD_MS, DEFAULT_DECAY_PER_S, DEFAULT_CLIP_HOLD_MS };
})();
