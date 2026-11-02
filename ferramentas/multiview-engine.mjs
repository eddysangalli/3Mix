import { EventEmitter } from 'node:events';

export const MULTIVIEW_LAYOUTS = Object.freeze({
  HORIZONTAL_16_9_STANDARD: 'horizontal_16_9_standard',
  HORIZONTAL_16_9_STUDIO12: 'horizontal_16_9_studio12',
  VERTICAL_9_16_MOBILE: 'vertical_9_16_mobile',
  VERTICAL_9_16_SOCIAL_FEED: 'vertical_9_16_social_feed',
  QUAD_SPLIT: 'quad_split'
});

export const SAFE_ZONE_TYPES = Object.freeze({
  NONE: 'none',
  BROADCAST_STANDARD: 'broadcast_standard',
  SOCIAL_VERTICAL_9_16: 'social_vertical_9_16'
});

export class MultiViewEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxSlots = options.maxSlots || 32;
    this.maxLogs = options.maxLogs || 150;
    
    this.activeLayout = options.defaultLayout || MULTIVIEW_LAYOUTS.HORIZONTAL_16_9_STANDARD;
    this.safeZones = {
      enabled: options.safeZonesEnabled ?? true,
      type: options.safeZoneType || SAFE_ZONE_TYPES.BROADCAST_STANDARD,
      titleSafePct: 80,
      actionSafePct: 90,
      socialMargins: {
        topPct: 12,
        bottomPct: 22,
        rightPct: 18,
        leftPct: 6
      }
    };
    
    this.slots = new Map();
    this.logs = [];
    this.clockMode = options.clockMode || 'smpte_local';
    
    this.initLayout(this.activeLayout);
  }

  getPresets() {
    return [
      {
        id: MULTIVIEW_LAYOUTS.HORIZONTAL_16_9_STANDARD,
        name: 'Horizontal 16:9 Padrão (2 Master + 8 Entradas)',
        aspectRatio: '16:9',
        masterCount: 2,
        inputSlotsCount: 8,
        description: 'Layout tradicional broadcast com Preview e Program em destaque superior e 8 câmeras inferiores.'
      },
      {
        id: MULTIVIEW_LAYOUTS.HORIZONTAL_16_9_STUDIO12,
        name: 'Horizontal 16:9 Estúdio 12 (2 Master + 12 Entradas)',
        aspectRatio: '16:9',
        masterCount: 2,
        inputSlotsCount: 12,
        description: 'Matriz estendida para estúdios com até 12 fontes simultâneas (Câmeras, VTs, Calls, Replay e GCs).'
      },
      {
        id: MULTIVIEW_LAYOUTS.VERTICAL_9_16_MOBILE,
        name: 'Vertical 9:16 Nativo Mobile (Preview/Program Vertical + 4/8 Entradas)',
        aspectRatio: '9:16',
        masterCount: 2,
        inputSlotsCount: 8,
        description: 'Layout nativo para transmissões verticais (TikTok, Reels, Shorts), com proporção 9:16 e guias de segurança de interface mobile.'
      },
      {
        id: MULTIVIEW_LAYOUTS.VERTICAL_9_16_SOCIAL_FEED,
        name: 'Vertical 9:16 Feed Social (Program Vertical Dominante + 4 Câmeras)',
        aspectRatio: '9:16',
        masterCount: 1,
        inputSlotsCount: 4,
        description: 'Visão otimizada com feed vertical do Program em alta escala e monitoramento auxiliar lateral.'
      },
      {
        id: MULTIVIEW_LAYOUTS.QUAD_SPLIT,
        name: 'Quad Split 4x4 (4 Telas Iguais)',
        aspectRatio: '16:9',
        masterCount: 0,
        inputSlotsCount: 4,
        description: 'Matriz quad-split simétrica com 4 monitores de dimensões idênticas para estúdio ou retorno.'
      }
    ];
  }

  initLayout(layoutId) {
    if (!Object.values(MULTIVIEW_LAYOUTS).includes(layoutId)) {
      throw new Error(`Layout MultiView desconhecido: ${layoutId}`);
    }

    this.activeLayout = layoutId;
    this.slots.clear();

    const isVertical = layoutId === MULTIVIEW_LAYOUTS.VERTICAL_9_16_MOBILE || layoutId === MULTIVIEW_LAYOUTS.VERTICAL_9_16_SOCIAL_FEED;
    const defaultAspectRatio = isVertical ? '9:16' : '16:9';

    if (layoutId === MULTIVIEW_LAYOUTS.HORIZONTAL_16_9_STANDARD) {
      this._createSlot(1, 'master_preview', 'PREVIEW (PRÉVIA)', defaultAspectRatio, 'preview');
      this._createSlot(2, 'master_program', 'PROGRAM (NO AR)', defaultAspectRatio, 'program');
      for (let i = 1; i <= 8; i++) {
        this._createSlot(i + 2, 'input', `INPUT ${i}`, defaultAspectRatio, 'standby');
      }
    } else if (layoutId === MULTIVIEW_LAYOUTS.HORIZONTAL_16_9_STUDIO12) {
      this._createSlot(1, 'master_preview', 'PREVIEW (PRÉVIA)', defaultAspectRatio, 'preview');
      this._createSlot(2, 'master_program', 'PROGRAM (NO AR)', defaultAspectRatio, 'program');
      for (let i = 1; i <= 12; i++) {
        this._createSlot(i + 2, 'input', `INPUT ${i}`, defaultAspectRatio, 'standby');
      }
    } else if (layoutId === MULTIVIEW_LAYOUTS.VERTICAL_9_16_MOBILE) {
      this._createSlot(1, 'master_preview', 'PREVIEW 9:16', '9:16', 'preview');
      this._createSlot(2, 'master_program', 'PROGRAM 9:16 NO AR', '9:16', 'program');
      for (let i = 1; i <= 8; i++) {
        this._createSlot(i + 2, 'input', `CAM ${i} 9:16`, '9:16', 'standby');
      }
      this.safeZones.type = SAFE_ZONE_TYPES.SOCIAL_VERTICAL_9_16;
    } else if (layoutId === MULTIVIEW_LAYOUTS.VERTICAL_9_16_SOCIAL_FEED) {
      this._createSlot(1, 'master_program', 'PROGRAM 9:16 FEED', '9:16', 'program');
      this._createSlot(2, 'master_preview', 'PREVIEW 9:16', '9:16', 'preview');
      for (let i = 1; i <= 4; i++) {
        this._createSlot(i + 2, 'input', `CÂMERA ${i}`, '9:16', 'standby');
      }
      this.safeZones.type = SAFE_ZONE_TYPES.SOCIAL_VERTICAL_9_16;
    } else if (layoutId === MULTIVIEW_LAYOUTS.QUAD_SPLIT) {
      for (let i = 1; i <= 4; i++) {
        this._createSlot(i, 'input', `QUAD ${i}`, '16:9', 'standby');
      }
    }

    this.log('INFO', `Layout MultiView ativado: ${layoutId}`, { layoutId, slotsCount: this.slots.size });
    this.emit('layout_change', { layoutId, slots: this.getSlotsArray() });
    return this.getMultiviewSnapshot();
  }

  _createSlot(index, role, defaultLabel, aspectRatio, defaultTally = 'standby') {
    const slot = {
      index,
      role,
      label: defaultLabel,
      aspectRatio,
      tally: defaultTally,
      health: 'healthy',
      assignedInputId: null,
      assignedInputName: null,
      audioLevelDb: -60.0,
      audioMuted: false,
      videoStalled: false,
      safeZonesVisible: this.safeZones.enabled
    };
    this.slots.set(index, slot);
    return slot;
  }

  setLayout(layoutId, options = {}) {
    if (!layoutId) throw new Error('ID de layout obrigatório');
    const res = this.initLayout(layoutId);
    if (options.safeZoneType) {
      this.configureSafeZones({ type: options.safeZoneType, enabled: options.safeZonesEnabled });
    }
    return res;
  }

  getActiveLayout() {
    return this.activeLayout;
  }

  configureSafeZones(options = {}) {
    if (typeof options.enabled === 'boolean') {
      this.safeZones.enabled = options.enabled;
    }
    if (options.type && Object.values(SAFE_ZONE_TYPES).includes(options.type)) {
      this.safeZones.type = options.type;
    }
    if (typeof options.titleSafePct === 'number') {
      this.safeZones.titleSafePct = Math.max(50, Math.min(95, options.titleSafePct));
    }
    if (typeof options.actionSafePct === 'number') {
      this.safeZones.actionSafePct = Math.max(60, Math.min(98, options.actionSafePct));
    }
    if (options.socialMargins && typeof options.socialMargins === 'object') {
      this.safeZones.socialMargins = {
        topPct: Math.max(0, Math.min(30, Number(options.socialMargins.topPct) || 12)),
        bottomPct: Math.max(0, Math.min(40, Number(options.socialMargins.bottomPct) || 22)),
        rightPct: Math.max(0, Math.min(30, Number(options.socialMargins.rightPct) || 18)),
        leftPct: Math.max(0, Math.min(20, Number(options.socialMargins.leftPct) || 6))
      };
    }

    // Atualiza visibilidade nos slots
    for (const slot of this.slots.values()) {
      slot.safeZonesVisible = this.safeZones.enabled;
    }

    this.log('INFO', 'Configuração de Safe Zones atualizada', { safeZones: this.safeZones });
    this.emit('safe_zones_change', this.safeZones);
    return this.safeZones;
  }

  getSafeZones() {
    return { ...this.safeZones };
  }

  assignSlot(slotIndex, inputData = {}) {
    const slot = this.slots.get(Number(slotIndex));
    if (!slot) {
      throw new Error(`Slot #${slotIndex} inexistente no layout ativo`);
    }

    slot.assignedInputId = inputData.id || inputData.uuid || null;
    slot.assignedInputName = inputData.name || null;
    if (inputData.label) {
      slot.label = String(inputData.label).slice(0, 40);
    } else if (inputData.name) {
      slot.label = String(inputData.name).slice(0, 40);
    }

    if (inputData.aspectRatio) {
      slot.aspectRatio = inputData.aspectRatio === '9:16' ? '9:16' : '16:9';
    }

    this.emit('slot_update', { slotIndex: slot.index, slot });
    return slot;
  }

  clearSlot(slotIndex) {
    const slot = this.slots.get(Number(slotIndex));
    if (!slot) return false;
    slot.assignedInputId = null;
    slot.assignedInputName = null;
    slot.tally = 'standby';
    slot.health = 'healthy';
    slot.audioLevelDb = -60.0;
    slot.audioMuted = false;
    slot.videoStalled = false;
    this.emit('slot_update', { slotIndex: slot.index, slot });
    return true;
  }

  getSlot(slotIndex) {
    const slot = this.slots.get(Number(slotIndex));
    return slot ? { ...slot } : null;
  }

  getSlotsArray() {
    return Array.from(this.slots.values()).map(s => ({ ...s }));
  }

  syncWithProduction(productionState = {}, inputHealthSummary = {}) {
    const programInputName = productionState.active || productionState.program || null;
    const previewInputName = productionState.preview || null;
    const inputsList = Array.isArray(productionState.inputs) ? productionState.inputs : [];
    const healthInputs = inputHealthSummary?.inputs || {};

    // Atualiza slots master
    for (const slot of this.slots.values()) {
      if (slot.role === 'master_program') {
        slot.tally = 'program';
        slot.assignedInputName = programInputName || 'PROGRAM';
      } else if (slot.role === 'master_preview') {
        slot.tally = 'preview';
        slot.assignedInputName = previewInputName || 'PREVIEW';
      } else if (slot.role === 'input') {
        // Se houver inputs mapeados por posição relativa
        const relativeIdx = slot.index - (this.slots.get(1)?.role.startsWith('master') ? 2 : 0) - 1;
        if (relativeIdx >= 0 && relativeIdx < inputsList.length) {
          const inp = inputsList[relativeIdx];
          slot.assignedInputId = inp.uuid || inp.id || null;
          slot.assignedInputName = inp.name || `INPUT ${relativeIdx + 1}`;
          slot.label = inp.name || slot.label;
          
          // Tally
          if (inp.name === programInputName || (inp.uuid && inp.uuid === productionState.programUuid)) {
            slot.tally = 'program';
          } else if (inp.name === previewInputName || (inp.uuid && inp.uuid === productionState.previewUuid)) {
            slot.tally = 'preview';
          } else {
            slot.tally = 'standby';
          }

          // Saúde e Telemetria
          const h = healthInputs[inp.uuid] || healthInputs[inp.name];
          if (h) {
            slot.health = h.status || 'healthy';
            slot.videoStalled = h.videoStalled === true || h.status === 'stalled';
            slot.audioLevelDb = typeof h.audioPeakDbfs === 'number' ? h.audioPeakDbfs : -60.0;
            slot.audioMuted = h.audioMuted === true;
          } else {
            slot.health = 'healthy';
            slot.videoStalled = false;
          }
        }
      }
    }

    this.emit('sync', { layoutId: this.activeLayout, timestamp: Date.now() });
    return this.getMultiviewSnapshot();
  }

  updateAudioMeters(metersMap = {}) {
    for (const slot of this.slots.values()) {
      const inputRef = slot.assignedInputName || slot.assignedInputId;
      if (inputRef && metersMap[inputRef]) {
        const m = metersMap[inputRef];
        slot.audioLevelDb = typeof m.levelDb === 'number' ? m.levelDb : -60.0;
        slot.audioMuted = m.muted === true;
      }
    }
  }

  getMultiviewSnapshot() {
    return {
      activeLayout: this.activeLayout,
      preset: this.getPresets().find(p => p.id === this.activeLayout) || null,
      safeZones: { ...this.safeZones },
      totalSlots: this.slots.size,
      slots: this.getSlotsArray(),
      timestamp: Date.now()
    };
  }

  log(level, message, details = {}) {
    const entry = {
      level,
      message,
      details,
      timestamp: new Date().toISOString()
    };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  getLogs(limit = 50) {
    return this.logs.slice(-Math.min(limit, this.maxLogs));
  }

  destroy() {
    this.removeAllListeners();
    this.slots.clear();
    this.logs = [];
  }
}
