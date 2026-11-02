import { EventEmitter } from 'node:events';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * FreeMix Auxiliary Bus Router Engine (Broadcast Output Matrix)
 * Atende à Seção 7, Item 8 do PRODUCT-VISION.md:
 * "Output Engine livre: Qualquer Mix deve poder alimentar Stream, Record, DeckLink, SDI, NDI, OMT, SRT, RIST, clean feed, vertical, AUX."
 */

export const ALLOWED_SOURCE_TYPES = ['program', 'preview', 'clean', 'multiview', 'mix', 'input'];
export const ALLOWED_AUDIO_BUSES = ['master', 'busA', 'busB', 'follow_video'];
export const ALLOWED_FORMATS = ['16:9', '9:16', '1:1', 'passthrough'];
export const DEFAULT_AUX_BUSES = [
  { id: 'aux1', index: 1, name: 'AUX 1 (Telão / Master Feed)', sourceType: 'program', sourceId: '', sourceName: 'Programa', audioBus: 'master', format: '16:9', alpha: false, active: true },
  { id: 'aux2', index: 2, name: 'AUX 2 (Retorno Apresentador)', sourceType: 'preview', sourceId: '', sourceName: 'Preview', audioBus: 'follow_video', format: '16:9', alpha: false, active: true },
  { id: 'aux3', index: 3, name: 'AUX 3 (Clean Feed Internacional)', sourceType: 'clean', sourceId: '', sourceName: 'Clean Feed', audioBus: 'master', format: '16:9', alpha: false, active: true },
  { id: 'aux4', index: 4, name: 'AUX 4 (MultiView de Estúdio)', sourceType: 'multiview', sourceId: '', sourceName: 'MultiView', audioBus: 'busA', format: '16:9', alpha: false, active: true }
];

export const DEFAULT_OUTPUT_TARGETS = [
  // Correção (auditoria desta sessão): destinations[0..3] no motor real é Saída 2-5 (os 4 destinos extras
  // configuráveis em outputs_configure), não Saída 1 -- a Transmissão Principal não tem índice nesse array,
  // é outputs_start/main_active separadamente (confirmado em saidas-producao.mjs). Os nomes abaixo eram
  // pré-existentes a esta sessão e estavam incorretos; corrigidos para bater com o índice real.
  { targetId: 'dest_0', name: 'Saída 2 (destino extra 1)', boundType: 'aux', auxId: 'aux1' },
  { targetId: 'dest_1', name: 'Saída 3 (destino extra 2)', boundType: 'aux', auxId: 'aux2' },
  { targetId: 'dest_2', name: 'Saída 4 (destino extra 3)', boundType: 'aux', auxId: 'aux3' },
  { targetId: 'dest_3', name: 'Saída 5 (destino extra 4)', boundType: 'aux', auxId: 'aux4' },
  { targetId: 'ndi_0', name: 'NDI Sender 1', boundType: 'aux', auxId: 'aux1' },
  { targetId: 'ndi_1', name: 'NDI Sender 2', boundType: 'aux', auxId: 'aux2' },
  { targetId: 'ndi_2', name: 'NDI Sender 3', boundType: 'aux', auxId: 'aux3' },
  { targetId: 'ndi_3', name: 'NDI Sender 4', boundType: 'aux', auxId: 'aux4' },
  { targetId: 'omt_0', name: 'OMT Sender 1', boundType: 'aux', auxId: 'aux1' },
  { targetId: 'omt_1', name: 'OMT Sender 2', boundType: 'aux', auxId: 'aux2' },
  { targetId: 'omt_2', name: 'OMT Sender 3', boundType: 'aux', auxId: 'aux3' },
  { targetId: 'omt_3', name: 'OMT Sender 4', boundType: 'aux', auxId: 'aux4' },
  { targetId: 'sdi_0', name: 'SDI / DeckLink Out', boundType: 'aux', auxId: 'aux3' }
];

export class AuxOutputRouter extends EventEmitter {
  constructor(options = {}) {
    super();
    this.root = options.root || process.cwd();
    this.p = options.production || null; // optional: only quickCut() uses it, to apply the bus's resolved signal to real active outputs
    this.storagePath = options.storagePath || join(this.root, 'config', 'obs-studio', 'plugin_config', 'freemix-aux', 'aux-matrix.json');
    this.auxBuses = new Map();
    this.outputBindings = new Map();
    this.logs = [];
    this.maxLogs = options.maxLogs || 100;
    this.saveTail = Promise.resolve();

    this.initDefaults();
  }

  initDefaults() {
    this.auxBuses.clear();
    for (const bus of DEFAULT_AUX_BUSES) {
      this.auxBuses.set(bus.id, { ...bus });
    }
    this.outputBindings.clear();
    for (const target of DEFAULT_OUTPUT_TARGETS) {
      this.outputBindings.set(target.targetId, { ...target });
    }
  }

  getAuxBus(auxId) {
    const bus = this.auxBuses.get(auxId);
    if (!bus) {
      throw new Error(`Barramento AUX inválido ou desconhecido: ${auxId}`);
    }
    return { ...bus };
  }

  getAllAuxBuses() {
    return Array.from(this.auxBuses.values()).map(bus => ({ ...bus }));
  }

  getOutputBinding(targetId) {
    const binding = this.outputBindings.get(targetId);
    if (!binding) {
      throw new Error(`Destino de saída não cadastrado: ${targetId}`);
    }
    return { ...binding };
  }

  getAllOutputBindings() {
    return Array.from(this.outputBindings.values()).map(b => ({ ...b }));
  }

  setAuxBusConfig(auxId, patch = {}) {
    const current = this.auxBuses.get(auxId);
    if (!current) {
      throw new Error(`Barramento auxiliar não encontrado: ${auxId}`);
    }

    const updated = { ...current };

    if (patch.name !== undefined) {
      const name = String(patch.name).trim();
      if (!name || name.length > 60) {
        throw new Error('Nome do barramento AUX deve ter entre 1 e 60 caracteres');
      }
      updated.name = name;
    }

    if (patch.sourceType !== undefined) {
      if (!ALLOWED_SOURCE_TYPES.includes(patch.sourceType)) {
        throw new Error(`Tipo de fonte inválido para AUX: ${patch.sourceType}. Permitidos: ${ALLOWED_SOURCE_TYPES.join(', ')}`);
      }
      updated.sourceType = patch.sourceType;
      if (patch.sourceType === 'program') {
        updated.sourceId = '';
        updated.sourceName = 'Programa';
      } else if (patch.sourceType === 'preview') {
        updated.sourceId = '';
        updated.sourceName = 'Preview';
      } else if (patch.sourceType === 'clean') {
        updated.sourceId = '';
        updated.sourceName = 'Clean Feed';
      } else if (patch.sourceType === 'multiview') {
        updated.sourceId = '';
        updated.sourceName = 'MultiView';
      }
    }

    if (patch.sourceId !== undefined) {
      updated.sourceId = String(patch.sourceId).trim();
    }

    if (patch.sourceName !== undefined) {
      updated.sourceName = String(patch.sourceName).trim().slice(0, 60);
    }

    if (patch.audioBus !== undefined) {
      const audio = String(patch.audioBus).trim();
      if (!ALLOWED_AUDIO_BUSES.includes(audio) && !audio.startsWith('bus:')) {
        throw new Error(`Barramento de áudio inválido: ${audio}. Permitidos: ${ALLOWED_AUDIO_BUSES.join(', ')} ou bus:<uuid>`);
      }
      updated.audioBus = audio;
    }

    if (patch.format !== undefined) {
      if (!ALLOWED_FORMATS.includes(patch.format)) {
        throw new Error(`Formato/aspect ratio inválido para AUX: ${patch.format}. Permitidos: ${ALLOWED_FORMATS.join(', ')}`);
      }
      updated.format = patch.format;
    }

    if (patch.alpha !== undefined) {
      updated.alpha = Boolean(patch.alpha);
    }

    if (patch.active !== undefined) {
      updated.active = Boolean(patch.active);
    }

    const previous = { ...current };
    this.auxBuses.set(auxId, updated);

    this.recordLog('aux_config_update', `Barramento ${auxId} atualizado: ${updated.sourceType} (${updated.sourceName})`);
    this.emit('aux_source_change', {
      auxId,
      sourceType: updated.sourceType,
      sourceId: updated.sourceId,
      sourceName: updated.sourceName,
      previous,
      transition: 'cut',
      timestamp: Date.now()
    });

    return { ...updated };
  }

  async quickCut(auxId, targetConfig = {}) {
    const current = this.auxBuses.get(auxId);
    if (!current) {
      throw new Error(`Barramento auxiliar não encontrado: ${auxId}`);
    }

    const sourceType = targetConfig.sourceType || current.sourceType;
    if (!ALLOWED_SOURCE_TYPES.includes(sourceType)) {
      throw new Error(`Tipo de fonte inválido para corte AUX: ${sourceType}`);
    }

    let sourceId = targetConfig.sourceId !== undefined ? String(targetConfig.sourceId).trim() : current.sourceId;
    let sourceName = targetConfig.sourceName !== undefined ? String(targetConfig.sourceName).trim().slice(0, 60) : current.sourceName;

    if (sourceType === 'program') {
      sourceId = '';
      sourceName = 'Programa';
    } else if (sourceType === 'preview') {
      sourceId = '';
      sourceName = 'Preview';
    } else if (sourceType === 'clean') {
      sourceId = '';
      sourceName = 'Clean Feed';
    } else if (sourceType === 'multiview') {
      sourceId = '';
      sourceName = 'MultiView';
    } else if (sourceType === 'mix') {
      const mixId = Number(targetConfig.mixId || sourceId || 2);
      if (![2, 3, 4].includes(mixId)) {
        throw new Error('Corte para Mix requer Mix 2, 3 ou 4');
      }
      sourceId = String(mixId);
      sourceName = `Mix ${mixId}`;
    } else if (sourceType === 'input') {
      if (!sourceId) {
        throw new Error('Corte para entrada requer UUID/key válido');
      }
      if (!sourceName) {
        sourceName = `Input ${sourceId.slice(0, 8)}`;
      }
    }

    const previous = { ...current };
    const updated = {
      ...current,
      sourceType,
      sourceId,
      sourceName
    };

    if (targetConfig.audioBus !== undefined && (ALLOWED_AUDIO_BUSES.includes(targetConfig.audioBus) || String(targetConfig.audioBus).startsWith('bus:'))) {
      updated.audioBus = targetConfig.audioBus;
    }

    this.auxBuses.set(auxId, updated);

    this.recordLog('quick_cut', `Quick Cut no ${auxId} -> ${sourceType} (${sourceName})`);
    
    const affectedOutputs = this.getOutputsBoundToAux(auxId);

    // Real application to the engine: only destinations that are ALREADY active get the new signal pushed live
    // (never auto-starts a stopped output -- that would be the router silently starting a transmission). A
    // stopped destination's saved config is left as-is; its own panel decides when it starts, with whatever it
    // was last configured to carry. Each destination is applied independently; one failing never blocks others,
    // and every outcome (applied / skipped / failed) is reported back, never silently swallowed.
    const applied = this.p ? await this.applyBusToOutputs(updated, affectedOutputs) : affectedOutputs.map(o => ({ targetId: o.targetId, status: 'not-wired', detail: 'AuxOutputRouter sem referência a Production nesta instância' }));

    this.emit('aux_cut', {
      auxId,
      sourceType,
      sourceId,
      sourceName,
      previous,
      affectedOutputs: affectedOutputs.map(o => o.targetId),
      applied,
      transition: 'cut',
      timestamp: Date.now()
    });

    return { ...updated, affectedOutputs, applied };
  }

  // Translates a resolved AUX bus state into the real outputs_configure/outputs_network/outputs_sdi contract,
  // for each output target CURRENTLY ACTIVE and bound to this bus. Metadata-only buses (no production wired, or
  // a target this version does not yet translate) are reported, never silently dropped.
  async applyBusToOutputs(bus, targets) {
    const results = [];
    let destinations = null, networkState = null;
    for (const target of targets) {
      try {
        const [kind, rawIndex] = target.targetId.split('_');
        const index = Number(rawIndex);
        if (kind === 'dest') {
          if (!destinations) destinations = (await this.p.vendor('get_destinations', {}, 'freemix')).destinations || [];
          const current = destinations[index];
          if (!current) { results.push({ targetId: target.targetId, status: 'skipped', detail: 'Saída não encontrada' }); continue; }
          if (!current.active) { results.push({ targetId: target.targetId, status: 'skipped', detail: 'Saída parada; AUX não inicia transmissão/gravação automaticamente' }); continue; }
          const patch = this.busToDestinationConfig(bus, current, index);
          if (!patch) { results.push({ targetId: target.targetId, status: 'skipped', detail: 'Tipo de sinal AUX ainda não aplicável a esta saída' }); continue; }
          // outputs_configure requires the FULL config (name/width/height/bitrate/etc. are all validated); we
          // only ever change mode/mixId/sourceUuid, preserving every other field this destination already has,
          // key included -- the destination's own key is never resent (an empty key means "keep the saved one").
          await this.p.outputEngine.execute('outputs_configure', {
            index, name: current.name, server: current.server, protocol: current.protocol, enhancedRtmp: current.enhancedRtmp,
            encoder: current.encoder, fpsDivisor: current.fpsDivisor, overlaysMask: current.overlaysMask,
            stingerAudio: current.stingerAudio, width: current.width, height: current.height, bitrate: current.bitrate,
            audioTrack: current.audioTrack, audioSourceUuid: current.audioSourceUuid, fill: current.fill,
            enabled: current.enabled, autoStart: current.autoStart, input: current.sourceUuid, ...patch,
          });
          results.push({ targetId: target.targetId, status: 'applied', detail: patch.mode });
        } else if (kind === 'ndi' || kind === 'omt') {
          // Correção (auditoria desta sessão): a primeira versão chamava this.p.vendor('CallVendorRequest', ...)
          // -- vendor() JÁ envolve CallVendorRequest internamente (confirmado lendo controle-producao.mjs), e
          // 'network_output' não é sequer o vendor request real; a ação real do motor é outputs_network, uma
          // ação de Production/OutputEngine, igual a outputs_configure acima -- nunca testada antes de agora,
          // o erro só foi achado por releitura cética, não por execução.
          if (!networkState) networkState = await this.p.outputEngine.read();
          const protocol = kind.toUpperCase();
          const senders = networkState[kind]?.senders || [];
          const state = senders[index];
          if (!state?.active) { results.push({ targetId: target.targetId, status: 'skipped', detail: 'Sender parado; AUX não inicia envio de rede automaticamente' }); continue; }
          const config = this.busToNetworkConfig(bus);
          if (!config) { results.push({ targetId: target.targetId, status: 'skipped', detail: 'Tipo de sinal AUX ainda não aplicável a este sender' }); continue; }
          // 'start' (não 'restart'): start reconstrói do zero com o mode/config novos; restart preservaria o
          // estado ANTIGO do sender (confirmado lendo saidas-producao.mjs), o que não aplicaria o AUX de fato.
          await this.p.outputEngine.execute('outputs_network', { protocol, command: 'start', senderId: index, audioTrack: state.audioTrack, audioSourceUuid: state.audioSourceUuid, ...config });
          results.push({ targetId: target.targetId, status: 'applied', detail: config.mode });
        } else {
          results.push({ targetId: target.targetId, status: 'skipped', detail: 'Destino SDI/DeckLink ainda não aplicável por AUX nesta versão' });
        }
      } catch (e) {
        results.push({ targetId: target.targetId, status: 'failed', detail: e.message });
      }
    }
    return results;
  }

  // Shared source-type translation. Only program/preview/clean/mix map onto the Destination contract today
  // (multiview and raw input UUID forwarding are intentionally left unmapped: an AUX 'input' sourceId here is a
  // production.state.inputs key, not the Destination's own sourceUuid scene key -- conflating them without a
  // real lookup would risk silently pointing a live output at the wrong scene).
  busToDestinationConfig(bus, currentDestination, index) {
    if (bus.sourceType === 'program') return { mode: 'program', mixId: currentDestination.mixId || 2 };
    if (bus.sourceType === 'preview') return { mode: 'preview', mixId: currentDestination.mixId || 2 };
    if (bus.sourceType === 'clean') return { mode: 'clean', mixId: currentDestination.mixId || 2 };
    if (bus.sourceType === 'mix') return { mode: 'mix', mixId: Number(bus.sourceId) };
    return null;
  }
  busToNetworkConfig(bus) {
    if (bus.sourceType === 'program') return { mode: 'program' };
    return null; // network_output's 'source' mode needs a scene key, same unmapped-input caveat as above
  }

  routeOutput(targetId, routing = {}) {
    const current = this.outputBindings.get(targetId);
    if (!current) {
      throw new Error(`Destino de saída não cadastrado: ${targetId}`);
    }

    const boundType = routing.boundType || 'aux';
    if (!['aux', 'direct'].includes(boundType)) {
      throw new Error(`Tipo de vinculação de saída inválido: ${boundType}. Permitidos: 'aux' ou 'direct'`);
    }

    let auxId = current.auxId;
    if (boundType === 'aux') {
      auxId = routing.auxId || auxId;
      if (!this.auxBuses.has(auxId)) {
        throw new Error(`Barramento AUX inválido para vinculação: ${auxId}`);
      }
    } else {
      auxId = null;
    }

    const updated = {
      ...current,
      boundType,
      auxId,
      directSourceType: boundType === 'direct' ? (routing.directSourceType || 'program') : null,
      directSourceId: boundType === 'direct' ? (routing.directSourceId || '') : null
    };

    this.outputBindings.set(targetId, updated);

    this.recordLog('route_output', `Saída ${targetId} roteada para ${boundType === 'aux' ? auxId : 'direct'}`);
    this.emit('output_routed', {
      targetId,
      binding: { ...updated },
      timestamp: Date.now()
    });

    return { ...updated };
  }

  getOutputsBoundToAux(auxId) {
    if (!this.auxBuses.has(auxId)) {
      throw new Error(`Barramento AUX inexistente: ${auxId}`);
    }
    return Array.from(this.outputBindings.values())
      .filter(b => b.boundType === 'aux' && b.auxId === auxId)
      .map(b => ({ ...b }));
  }

  syncWithProduction(productionState = {}) {
    if (!productionState || typeof productionState !== 'object') {
      return;
    }

    const inputs = Array.isArray(productionState.inputs) ? productionState.inputs : [];
    const inputMap = new Map(inputs.map(i => [i.key, i.name || `Input ${i.number || i.key}`]));

    for (const [id, bus] of this.auxBuses.entries()) {
      if (bus.sourceType === 'input' && bus.sourceId) {
        if (inputMap.has(bus.sourceId)) {
          bus.sourceName = inputMap.get(bus.sourceId);
        } else {
          // Fallback gracioso se a entrada foi excluída
          bus.sourceType = 'program';
          bus.sourceId = '';
          bus.sourceName = 'Programa (Fallback)';
          this.recordLog('fallback_program', `Entrada do ${id} não localizada na produção; fallback aplicado para Programa`);
        }
      }
    }

    this.emit('matrix_sync', {
      timestamp: Date.now(),
      busesCount: this.auxBuses.size,
      bindingsCount: this.outputBindings.size
    });
  }

  getRoutingMatrix() {
    return {
      version: 1,
      timestamp: Date.now(),
      buses: this.getAllAuxBuses().map(bus => ({
        ...bus,
        boundOutputs: this.getOutputsBoundToAux(bus.id).map(o => ({ targetId: o.targetId, name: o.name }))
      })),
      outputs: this.getAllOutputBindings(),
      availableSourceTypes: [...ALLOWED_SOURCE_TYPES],
      availableAudioBuses: [...ALLOWED_AUDIO_BUSES],
      availableFormats: [...ALLOWED_FORMATS]
    };
  }

  recordLog(event, detail) {
    const entry = {
      timestamp: Date.now(),
      event,
      detail: String(detail).slice(0, 160)
    };
    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.length = this.maxLogs;
    }
  }

  getLogs(limit = 50) {
    return this.logs.slice(0, Math.max(1, Math.min(limit, this.maxLogs)));
  }

  async save() {
    const file = this.storagePath;
    const data = JSON.stringify({
      version: 1,
      auxBuses: Array.from(this.auxBuses.values()),
      outputBindings: Array.from(this.outputBindings.values())
    }, null, 2);

    const task = this.saveTail.then(async () => {
      await mkdir(join(file, '..'), { recursive: true });
      await writeFile(file + '.tmp', data);
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await rename(file + '.tmp', file);
          break;
        } catch (e) {
          if (attempt === 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) {
            throw e;
          }
          await new Promise(r => setTimeout(r, 50));
        }
      }
    });

    this.saveTail = task.catch(() => {});
    return task;
  }

  async load() {
    try {
      const content = await readFile(this.storagePath, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed && parsed.version === 1) {
        if (Array.isArray(parsed.auxBuses)) {
          this.auxBuses.clear();
          for (const bus of parsed.auxBuses) {
            if (bus && bus.id) {
              this.auxBuses.set(bus.id, { ...bus });
            }
          }
        }
        if (Array.isArray(parsed.outputBindings)) {
          this.outputBindings.clear();
          for (const binding of parsed.outputBindings) {
            if (binding && binding.targetId) {
              this.outputBindings.set(binding.targetId, { ...binding });
            }
          }
        }
      }
    } catch (e) {
      if (e.code !== 'ENOENT') {
        throw e;
      }
      this.initDefaults();
    }
  }

  destroy() {
    this.removeAllListeners();
    this.auxBuses.clear();
    this.outputBindings.clear();
    this.logs = [];
  }
}
