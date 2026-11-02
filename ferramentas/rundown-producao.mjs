import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * RundownEngine — Roteiro → Blocos → Passos.
 *
 * Regras de segurança que este motor aplica:
 * - Selecionar não executa; preparar não altera Programa, áudio ou DSK no ar.
 * - Executar aplica somente o passo preparado e só marca como executado depois
 *   de confirmar o resultado real no motor (Programa/DSK/áudio/mídia).
 * - Falha parcial registra o que ocorreu, suspende a automação e nunca repete
 *   o passo inteiro automaticamente.
 * - O roteiro salvo é persistido por projeto e o histórico de execução fica em
 *   arquivo separado. Após reiniciar, o roteiro volta, mas a automação não.
 * - Avanço automático só existe com sessão armada explicitamente. Fim de mídia
 *   exige evento real do player (MediaInputPlaybackEnded) corroborado pelo estado.
 */

export const RUNDOWN_SCHEMA_VERSION = 2;
export const RUNDOWN_HISTORY_VERSION = 1;

export const STEP_TYPES = Object.freeze({
  camera: { label: 'Câmera', requiresSource: true },
  video: { label: 'Vídeo / VT', requiresSource: true, media: true },
  playlist: { label: 'Playlist', requiresSource: true, media: true },
  graphics: { label: 'Gráfico / GC', requiresSource: true },
  call: { label: 'Chamada', requiresSource: true },
  manual: { label: 'Passagem / Manual', requiresSource: false },
  note: { label: 'Nota', requiresSource: false }
});

export const END_BEHAVIORS = Object.freeze({
  wait_operator: 'Aguardar operador (manual)',
  after_time: 'Avançar após o tempo',
  media_end: 'Avançar no fim real da mídia'
});

export const DSK_ACTIONS = Object.freeze(['keep', 'prepare', 'enter', 'exit']);
export const AUDIO_ACTIONS = Object.freeze(['keep', 'mute', 'unmute', 'volume']);

const MAX_BLOCKS = 200;
const MAX_STEPS = 1000;
const MAX_PLANNED_SECONDS = 86400; // 24 h; mantém timers e exibição previsíveis
const MAX_HISTORY = 200;
const MAX_RECEIPTS = 100;
const MAX_VALIDATION_ITEMS = 400;

const nowISO = () => new Date().toISOString();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function finite(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cleanText(value, max = 400) {
  return String(value ?? '').replace(/\u0000/g, '').slice(0, max).trim();
}

function cleanId(value) {
  const id = cleanText(value, 120);
  return id || randomUUID();
}

function normalizeTransition(value) {
  const transition = String(value ?? 'cut').trim().toLowerCase();
  return transition === 'fade' ? 'fade' : transition === 'cut' ? 'cut' : transition;
}

function normalizeEndBehavior(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return 'wait_operator';
  if (['wait_operator', 'manual', 'operador', 'operator', 'wait'].includes(raw)) return 'wait_operator';
  if (['after_time', 'auto', 'tempo', 'time', 'advance_after_time'].includes(raw)) return 'after_time';
  if (['media_end', 'advance_media_end', 'fim_da_midia', 'media', 'end_of_media'].includes(raw)) return 'media_end';
  return raw;
}

function normalizeDurationMode(value, seconds) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (['fixed', 'fixa', 'fixed_duration'].includes(raw)) return 'fixed';
  if (['media', 'midia', 'da_midia'].includes(raw)) return 'media';
  if (['none', 'sem', 'sem_duracao', 'no_duration'].includes(raw)) return 'none';
  if (raw) return raw;
  return seconds === null ? 'fixed' : 'fixed';
}

function normalizeDsk(raw) {
  let list = raw;
  if (!list && Array.isArray(raw?.actions)) list = raw.actions;
  if (!Array.isArray(list)) list = [];
  return list.slice(0, 32).map(action => {
    const channel = finite(action?.channel ?? action?.number, null);
    return {
      channel: channel === null ? null : Math.trunc(channel),
      action: String(action?.action ?? 'keep').trim().toLowerCase(),
      scene: cleanText(action?.scene ?? action?.source ?? '', 200)
    };
  });
}

function normalizeAudio(raw) {
  let list = raw;
  if (!list && Array.isArray(raw?.actions)) list = raw.actions;
  if (!Array.isArray(list)) list = [];
  return list.slice(0, 32).map(action => {
    const volume = finite(action?.value ?? action?.volume, null);
    return {
      targetKey: cleanText(action?.targetKey ?? action?.inputKey ?? '', 120) || null,
      targetName: cleanText(action?.targetName ?? action?.inputName ?? action?.target ?? '', 200) || null,
      action: String(action?.action ?? 'keep').trim().toLowerCase(),
      value: volume === null ? null : clamp(volume, 0, 100)
    };
  });
}

function normalizeType(value) {
  const raw = String(value ?? 'camera').trim().toLowerCase();
  const aliases = {
    camera: 'camera', 'câmera': 'camera', cam: 'camera',
    video: 'video', vt: 'video', 'vídeo': 'video', media: 'video',
    playlist: 'playlist', lista: 'playlist',
    graphics: 'graphics', gc: 'graphics', grafico: 'graphics', 'gráfico': 'graphics',
    call: 'call', chamada: 'call', manual: 'manual', passagem: 'manual', note: 'note', nota: 'note'
  };
  return aliases[raw] || raw;
}

export function normalizeStep(raw = {}, index = 0) {
  const legacyDuration = finite(raw.expectedDurationSec ?? raw.durationSec ?? raw.plannedDurationSec, null);
  const durationMode = normalizeDurationMode(raw.durationMode, legacyDuration);
  const durationSec = finite(raw.durationSec ?? raw.expectedDurationSec ?? raw.plannedDurationSec, durationMode === 'fixed' ? 60 : null);
  const sourceInputKey = cleanText(raw.sourceInputKey ?? raw.inputKey ?? raw.sourceKey ?? raw.programInputKey ?? '', 120) || null;
  const sourceName = cleanText(raw.sourceName ?? raw.inputName ?? raw.programInput ?? raw.scene ?? raw.videoInput ?? '', 240) || null;
  const legacyOverlays = Array.isArray(raw.overlays)
    ? raw.overlays.map(o => ({ channel: o?.channel ?? o?.number, action: 'enter', scene: o?.scene ?? o?.source ?? '' }))
    : null;
  const type = normalizeType(raw.type);
  return {
    id: cleanId(raw.id),
    title: cleanText(raw.title, 200) || `Passo ${index + 1}`,
    type,
    notes: cleanText(raw.notes ?? raw.note, 4000),
    sourceInputKey,
    sourceName,
    transition: normalizeTransition(raw.transition),
    transitionMs: finite(raw.transitionMs, 500) ?? 500,
    durationMode,
    durationSec,
    endBehavior: normalizeEndBehavior(raw.endBehavior ?? raw.advanceBehavior),
    loadPreview: raw.loadPreview !== false,
    dsk: normalizeDsk(raw.dsk ?? raw.dskActions ?? legacyOverlays),
    audio: normalizeAudio(raw.audio ?? raw.audioActions),
    captured: raw.captured === true
  };
}

function normalizeBlock(raw = {}, index = 0) {
  return {
    id: cleanId(raw.id),
    title: cleanText(raw.title ?? raw.name, 160) || `Bloco ${index + 1}`,
    notes: cleanText(raw.notes, 2000),
    steps: (Array.isArray(raw.steps) ? raw.steps : []).slice(0, MAX_STEPS).map((step, i) => normalizeStep(step, i))
  };
}

export function normalizeScript(raw = {}, fallbackName = 'Roteiro Principal') {
  if (Array.isArray(raw)) raw = { steps: raw };
  if (!raw || typeof raw !== 'object') raw = {};
  let blocksRaw;
  if (Array.isArray(raw.blocks)) blocksRaw = raw.blocks;
  else if (Array.isArray(raw.steps)) blocksRaw = [{ id: raw.blockId, title: raw.blockTitle || 'Bloco 1', steps: raw.steps }];
  else blocksRaw = [];

  const blockIds = new Set();
  const stepIds = new Set();
  const blocks = blocksRaw.slice(0, MAX_BLOCKS).map((block, index) => {
    const normalized = normalizeBlock(block, index);
    if (blockIds.has(normalized.id)) normalized.id = randomUUID();
    blockIds.add(normalized.id);
    normalized.steps = normalized.steps.map((step, stepIndex) => {
      if (stepIds.has(step.id)) step.id = randomUUID();
      stepIds.add(step.id);
      return step;
    });
    return normalized;
  });

  return {
    schemaVersion: RUNDOWN_SCHEMA_VERSION,
    id: cleanId(raw.id),
    name: cleanText(raw.name, 160) || fallbackName,
    revision: Math.max(1, Math.trunc(finite(raw.revision, 1) ?? 1)),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : nowISO(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : nowISO(),
    blocks
  };
}

export function stepFingerprint(step) {
  const payload = {
    id: step.id,
    title: step.title,
    type: step.type,
    notes: step.notes,
    sourceInputKey: step.sourceInputKey,
    sourceName: step.sourceName,
    transition: step.transition,
    transitionMs: step.transitionMs,
    durationMode: step.durationMode,
    durationSec: step.durationSec,
    endBehavior: step.endBehavior,
    loadPreview: step.loadPreview,
    dsk: step.dsk,
    audio: step.audio
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24);
}

function publicReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object') return null;
  return {
    operationId: receipt.operationId,
    stepId: receipt.stepId,
    outcome: receipt.outcome,
    confirmed: receipt.confirmed === true,
    auto: receipt.auto === true,
    startedAt: receipt.startedAt || null,
    finishedAt: receipt.finishedAt || null,
    error: receipt.error || null,
    actions: (receipt.actions || []).map(action => ({
      type: action.type,
      label: action.label,
      status: action.status,
      at: action.at || null,
      error: action.error || null
    }))
  };
}

function historyRecord(entry) {
  return {
    id: randomUUID(),
    at: Date.now(),
    rundownId: entry.rundownId,
    revision: entry.revision,
    version: `v${entry.revision}`,
    blockId: entry.blockId || null,
    stepId: entry.stepId || null,
    stepTitle: entry.stepTitle || null,
    outcome: entry.outcome,
    reason: entry.reason || null,
    error: entry.error || null,
    actions: (entry.actions || []).map(action => ({
      type: action.type,
      label: action.label,
      status: action.status,
      error: action.error || null
    })),
    startedAt: entry.startedAt || null,
    finishedAt: entry.finishedAt || null
  };
}

export class RundownEngine {
  constructor(production) {
    this.p = production;
    this.scope = null;
    this.folder = null;
    this.file = null;
    this.historyFile = null;
    this.script = normalizeScript({ name: 'Roteiro Principal' });
    this.runtime = new Map();
    this.selectedStepId = null;
    this.preparedStepId = null;
    this.currentStepId = null;
    this.executingStepId = null;
    this.ended = false;
    this.endedAt = 0;
    this.armed = false;
    this.armedAt = 0;
    this.suspended = false;
    this.suspendedReason = null;
    this.autoWarning = null;
    this.autoTimer = null;
    this.autoAdvancePending = null;
    this.mediaWatch = null;
    this.mediaEvent = null;
    this.receipts = new Map();
    this.history = [];
    this.captureDraft = null;
    this.lastExecution = null;
    this.loadedAt = 0;
    this.persistedAt = 0;
    this.loadError = null;
    this.saveError = null;
    this.historyError = null;
    this.contextEpoch = 0;
    this._saveTail = Promise.resolve();
    this._historyTail = Promise.resolve();
  }

  // ---------------------------------------------------------------------------
  // Persistência e escopo
  // ---------------------------------------------------------------------------

  async setScope(scope) {
    const next = cleanText(scope, 240) || null;
    if (next === this.scope) return this.summary();
    this.contextEpoch++;
    this._clearAutomation('project_change');
    this._clearTimers();
    this.runtime = new Map();
    this.selectedStepId = null;
    this.preparedStepId = null;
    this.currentStepId = null;
    this.executingStepId = null;
    this.ended = false;
    this.endedAt = 0;
    this.captureDraft = null;
    this.lastExecution = null;
    this.script = normalizeScript({ name: 'Roteiro Principal' });
    this.loadedAt = 0;
    this.persistedAt = 0;
    this.loadError = null;
    this.saveError = null;
    this.history = [];
    this.scope = next;
    this.folder = null;
    this.file = null;
    this.historyFile = null;
    if (!next) return this.summary();

    this.folder = join(this.p.root, 'config', 'obs-studio', 'plugin_config', 'freemix-rundown');
    const hash = createHash('sha256').update(next).digest('hex').slice(0, 24);
    this.file = join(this.folder, `${hash}.json`);
    this.historyFile = join(this.folder, `${hash}.historico.json`);
    await this._load();
    return this.summary();
  }

  async _load() {
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8'));
      const raw = parsed?.script && typeof parsed.script === 'object' ? parsed.script : parsed;
      if (Number(raw?.schemaVersion || parsed?.schemaVersion || RUNDOWN_SCHEMA_VERSION) > RUNDOWN_SCHEMA_VERSION) {
        throw new Error(`Roteiro salvo em versão mais nova (${raw?.schemaVersion || parsed?.schemaVersion})`);
      }
      this.script = normalizeScript(raw, 'Roteiro Principal');
      this.loadedAt = Date.now();
      this.loadError = null;
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.loadedAt = Date.now();
        this.loadError = null;
      } else {
        this.loadError = error.message;
        this.loadedAt = Date.now();
        this.script = normalizeScript({ name: 'Roteiro Principal' });
      }
    }
    await this._loadHistory();
    return this.summary();
  }

  async _loadHistory() {
    this.history = [];
    if (!this.historyFile) return;
    try {
      const parsed = JSON.parse(await readFile(this.historyFile, 'utf8'));
      const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
      this.history = entries
        .filter(entry => entry && typeof entry === 'object')
        .slice(-MAX_HISTORY)
        .map(entry => ({ ...entry }));
      this.historyError = null;
    } catch (error) {
      if (error.code === 'ENOENT') this.historyError = null;
      else this.historyError = error.message;
    }
  }

  async _persist() {
    if (!this.file) return false;
    const file = this.file;
    const data = JSON.stringify({
      schemaVersion: RUNDOWN_SCHEMA_VERSION,
      savedAt: nowISO(),
      script: this.script
    }, null, 2);
    const task = this._saveTail.then(async () => {
      await mkdir(this.folder, { recursive: true });
      await writeFile(file + '.tmp', data);
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await rename(file + '.tmp', file);
          break;
        } catch (error) {
          if (attempt === 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
          await sleep(50);
        }
      }
      this.persistedAt = Date.now();
      this.saveError = null;
    });
    this._saveTail = task.catch(() => {});
    try {
      await task;
      return true;
    } catch (error) {
      this.saveError = error.message;
      return false;
    }
  }

  async _persistHistory() {
    if (!this.historyFile) return false;
    const file = this.historyFile;
    const entries = this.history.slice(-MAX_HISTORY);
    const data = JSON.stringify({
      schemaVersion: RUNDOWN_HISTORY_VERSION,
      rundownId: this.script.id,
      updatedAt: nowISO(),
      entries
    }, null, 2);
    const task = this._historyTail.then(async () => {
      await mkdir(this.folder, { recursive: true });
      await writeFile(file + '.tmp', data);
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await rename(file + '.tmp', file);
          break;
        } catch (error) {
          if (attempt === 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
          await sleep(50);
        }
      }
      this.historyError = null;
    });
    this._historyTail = task.catch(() => {});
    try {
      await task;
      return true;
    } catch (error) {
      this.historyError = error.message;
      return false;
    }
  }

  async _appendHistory(entry) {
    const record = historyRecord({
      ...entry,
      rundownId: this.script.id,
      revision: this.script.revision
    });
    this.history.push(record);
    if (this.history.length > MAX_HISTORY) this.history = this.history.slice(-MAX_HISTORY);
    await this._persistHistory();
    return record;
  }

  _touchScript() {
    this.script.revision++;
    this.script.updatedAt = nowISO();
  }

  // ---------------------------------------------------------------------------
  // Estrutura e utilidades
  // ---------------------------------------------------------------------------

  _allSteps() {
    const list = [];
    let index = 0;
    for (const block of this.script.blocks) {
      for (const step of block.steps) list.push({ block, step, index: index++ });
    }
    return list;
  }

  _findStep(stepId) {
    if (!stepId) return null;
    for (const block of this.script.blocks) {
      const step = block.steps.find(item => item.id === stepId);
      if (step) return { block, step, index: this._allSteps().find(entry => entry.step.id === stepId)?.index ?? -1 };
    }
    return null;
  }

  _runtime(stepId) {
    let runtime = this.runtime.get(stepId);
    if (!runtime) {
      runtime = { status: 'pending', preparation: null, execution: null, skippedAt: 0, failure: null };
      this.runtime.set(stepId, runtime);
    }
    return runtime;
  }

  _nextPendingAfter(stepId = null) {
    const flat = this._allSteps();
    let start = 0;
    if (stepId) {
      const at = flat.findIndex(entry => entry.step.id === stepId);
      start = at >= 0 ? at + 1 : 0;
    }
    for (let i = start; i < flat.length; i++) {
      const runtime = this._runtime(flat[i].step.id);
      if (runtime.status === 'done' || runtime.status === 'skipped') continue;
      if (flat[i].step.id === this.currentStepId) continue;
      return flat[i];
    }
    return null;
  }

  _context() {
    const state = this.p?.state || {};
    const inputs = Array.isArray(state.inputs) ? state.inputs : [];
    const sourceInputs = Array.isArray(state.sourceInputs) ? state.sourceInputs : [];
    const audioInputs = Array.isArray(state.audioInputs) ? state.audioInputs : [];
    const media = Array.isArray(state.media) ? state.media : [];
    const scenes = [...new Set([
      ...(Array.isArray(state.scenes) ? state.scenes : []),
      ...inputs.map(input => input.name).filter(Boolean)
    ])];
    return {
      connected: state.connected !== false,
      program: state.program || null,
      preview: state.preview || null,
      overlays: Array.isArray(state.overlays) ? state.overlays : [],
      inputs,
      sourceInputs,
      audioInputs,
      media,
      scenes,
      transitions: Array.isArray(state.transitions) ? state.transitions : []
    };
  }

  _resolveSource(step, context) {
    const warnings = [];
    let input = null;
    if (step.sourceInputKey) input = context.inputs.find(item => item.key === step.sourceInputKey) || null;
    if (!input && step.sourceName) {
      input = context.inputs.find(item => item.name === step.sourceName) || null;
      if (input && step.sourceInputKey) warnings.push('UUID da fonte não encontrado neste projeto; a preparação usou o nome como fallback.');
      else if (input && !step.sourceInputKey) warnings.push('Fonte referenciada por nome. Fixe o UUID no editor para estabilidade entre renomeações.');
    }
    if (!input && step.sourceInputKey && !step.sourceName) {
      const byInput = context.sourceInputs.find(item => item.key === step.sourceInputKey);
      if (byInput) warnings.push('A referência aponta para uma fonte OBS, não para uma cena do Programa.');
    }
    return {
      input,
      sourceKey: input?.key || step.sourceInputKey || null,
      sourceName: input?.name || step.sourceName || null,
      warnings
    };
  }

  _resolveMedia(step, resolved, context) {
    if (!resolved.input) return null;
    let media = context.media.find(item => item.name === resolved.input.media) || null;
    if (!media && resolved.sourceName) media = context.media.find(item => item.name === resolved.sourceName) || null;
    if (!media) return null;
    const durationMs = finite(media.duration, 0) || finite(media.durationMs, 0) || 0;
    return {
      name: media.name,
      kind: media.kind || '',
      state: media.state || null,
      durationSec: durationMs > 0 ? durationMs / 1000 : null
    };
  }

  _resolveAudioAction(action, context) {
    let source = null;
    if (action.targetKey) {
      source = context.sourceInputs.find(item => item.key === action.targetKey)
        || context.audioInputs.find(item => item.key === action.targetKey)
        || context.inputs.find(item => item.key === action.targetKey)
        || null;
    }
    const name = source?.name || action.targetName || null;
    const audio = name ? context.audioInputs.find(item => item.name === name) || null : null;
    return { name, audio };
  }

  _resolvePlanDuration(step, resolved, context) {
    if (step.durationMode === 'fixed') return finite(step.durationSec, null);
    if (step.durationMode === 'media') return this._resolveMedia(step, resolved, context)?.durationSec ?? null;
    return null;
  }

  _validateStep(step, context, { forPrepare = false } = {}) {
    const items = [];
    const push = (severity, message, code = '', field = '') => items.push({ severity, message, code, field });
    const type = STEP_TYPES[step.type];
    const resolved = this._resolveSource(step, context);
    const media = this._resolveMedia(step, resolved, context);
    const planDuration = this._resolvePlanDuration(step, resolved, context);

    if (!step.title) push('error', 'Título do passo é obrigatório.', 'title', 'title');
    if (!type) push('error', `Tipo de passo desconhecido: ${step.type}.`, 'type', 'type');
    if (!['cut', 'fade'].includes(step.transition)) push('error', 'Transição deve ser cut ou fade.', 'transition', 'transition');
    if (step.transition === 'fade' && (!(step.transitionMs >= 50) || step.transitionMs > 20000)) {
      push('error', 'Fade exige duração entre 50 e 20000 ms.', 'transitionMs', 'transitionMs');
    }
    if (!['fixed', 'media', 'none'].includes(step.durationMode)) {
      push('error', 'Duração planejada deve ser fixa, da mídia ou sem duração.', 'durationMode', 'durationMode');
    }
    if (step.durationMode === 'fixed' && !(step.durationSec > 0)) {
      push('error', 'Duração fixa precisa ser maior que zero.', 'durationSec', 'durationSec');
    }
    if (step.durationMode === 'fixed' && step.durationSec > MAX_PLANNED_SECONDS) {
      push('error', 'Duração fixa limitada a 24 horas por passo.', 'durationSec', 'durationSec');
    }
    if (step.durationMode === 'media' && !type?.media) {
      push('error', 'Duração da mídia exige um passo de vídeo ou playlist.', 'media_duration', 'durationMode');
    }
    if (step.durationMode === 'media' && resolved.input && context.connected && !media) {
      push('error', 'A fonte preparada não tem mídia com duração identificável.', 'media', 'durationMode');
    }
    if (!Object.prototype.hasOwnProperty.call(END_BEHAVIORS, step.endBehavior)) {
      push('error', `Comportamento ao terminar desconhecido: ${step.endBehavior}.`, 'endBehavior', 'endBehavior');
    }
    if (step.endBehavior === 'after_time' && !(planDuration > 0)) {
      push('error', 'Avançar após tempo exige duração resolvida (fixa ou da mídia).', 'after_time', 'endBehavior');
    }
    if (step.endBehavior === 'after_time' && planDuration > MAX_PLANNED_SECONDS) {
      push('error', 'Avanço automático limitado a 24 horas por passo.', 'after_time_duration', 'endBehavior');
    }
    if (step.endBehavior === 'media_end') {
      if (!type?.media) push('error', 'Avançar no fim da mídia exige um passo de vídeo ou playlist.', 'media_end', 'endBehavior');
      if (resolved.input && context.connected && !media) push('error', 'Avançar no fim da mídia exige uma fonte de mídia válida.', 'media_end_source', 'sourceInputKey');
    }

    if (type?.requiresSource && !resolved.input) {
      push('error', 'Este tipo de passo exige uma fonte/cena válida por UUID.', 'source', 'sourceInputKey');
    }
    if (resolved.input && step.sourceInputKey && resolved.input.key !== step.sourceInputKey) {
      push('warning', 'O UUID gravado não foi encontrado; a fonte foi resolvida pelo nome.', 'source_fallback', 'sourceInputKey');
    }
    if (resolved.warnings.length) for (const warning of resolved.warnings) push('warning', warning, 'source_ref', 'sourceInputKey');
    if (resolved.input && step.sourceName && resolved.input.name !== step.sourceName) {
      push('warning', `A fonte agora se chama "${resolved.input.name}" (nome gravado: "${step.sourceName}").`, 'source_renamed', 'sourceInputKey');
    }
    if (type?.media && resolved.input && context.connected && !media) {
      push('error', 'Um passo de vídeo/playlist exige uma fonte de mídia com player.', 'media_missing', 'sourceInputKey');
    }

    if (step.loadPreview && resolved.input && context.program === resolved.input.name) {
      push('warning', 'Esta fonte já está no Programa; a preparação não vai recarregar o PVW.', 'preview_program', 'loadPreview');
    }

    const channels = new Set();
    for (const action of step.dsk) {
      const channel = Number(action.channel);
      const label = Number.isFinite(channel) ? `DSK ${channel}` : 'DSK';
      if (!Number.isInteger(channel) || channel < 1 || channel > 8) {
        push('error', 'Canal de DSK inválido (use 1 a 8).', 'dsk_channel', 'dsk');
        continue;
      }
      if (channels.has(channel)) push('error', `${label} aparece mais de uma vez no mesmo passo.`, 'dsk_duplicate', 'dsk');
      channels.add(channel);
      if (!DSK_ACTIONS.includes(action.action)) {
        push('error', `${label}: ação inválida "${action.action}".`, 'dsk_action', 'dsk');
        continue;
      }
      if (['prepare', 'enter'].includes(action.action) && !action.scene) {
        push('error', `${label}: informe a cena para ${action.action === 'enter' ? 'entrar' : 'preparar'}.`, 'dsk_scene', 'dsk');
      }
      if (['prepare', 'enter'].includes(action.action) && action.scene && context.connected && context.scenes.length && !context.scenes.includes(action.scene)) {
        push('error', `${label}: a cena "${action.scene}" não existe neste projeto.`, 'dsk_missing_scene', 'dsk');
      }
      if (action.action === 'exit' && action.scene) {
        push('warning', `${label}: a cena é ignorada em uma ação de saída.`, 'dsk_exit_scene', 'dsk');
      }
    }

    const targets = new Set();
    for (const action of step.audio) {
      if (!AUDIO_ACTIONS.includes(action.action)) {
        push('error', `Ação de áudio inválida: "${action.action}".`, 'audio_action', 'audio');
        continue;
      }
      if (action.action === 'keep') continue;
      if (!action.targetKey && !action.targetName) {
        push('error', 'Ação de áudio exige um destino explícito.', 'audio_target', 'audio');
        continue;
      }
      const key = action.targetKey || `name:${action.targetName}`;
      if (targets.has(key)) push('error', `O mesmo destino de áudio aparece mais de uma vez: ${action.targetName || action.targetKey}.`, 'audio_duplicate', 'audio');
      targets.add(key);
      if (action.action === 'volume' && !(action.value >= 0 && action.value <= 100)) {
        push('error', 'Volume de áudio deve ficar entre 0 e 100.', 'audio_volume', 'audio');
      }
      if (context.connected && context.audioInputs.length) {
        const target = this._resolveAudioAction(action, context);
        if (!target.name) push('error', 'Destino de áudio não encontrado neste projeto.', 'audio_missing', 'audio');
        else if (!target.audio) push('error', `"${target.name}" não tem áudio controlável.`, 'audio_uncontrolled', 'audio');
      }
    }

    if (forPrepare && step.loadPreview && !resolved.input) {
      push('warning', 'Sem fonte definida, o PVW não será carregado.', 'preview_none', 'loadPreview');
    }

    return items;
  }

  _validateScript(context) {
    const items = [];
    const byStep = {};
    let errors = 0;
    let warnings = 0;
    if (!this.script.blocks.length) {
      items.push({ severity: 'warning', message: 'O roteiro ainda não tem blocos.', code: 'empty_script', blockId: null, stepId: null, field: '' });
      warnings++;
    }
    for (const block of this.script.blocks) {
      if (!block.title) {
        items.push({ severity: 'warning', message: 'Bloco sem título.', code: 'block_title', blockId: block.id, stepId: null, field: 'title' });
        warnings++;
      }
      if (!block.steps.length) {
        items.push({ severity: 'warning', message: `O bloco "${block.title}" não tem passos.`, code: 'empty_block', blockId: block.id, stepId: null, field: '' });
        warnings++;
      }
      for (const step of block.steps) {
        const validation = this._validateStep(step, context, { forPrepare: true });
        const view = { errors: [], warnings: [] };
        for (const item of validation) {
          const enriched = { ...item, blockId: block.id, stepId: step.id };
          items.push(enriched);
          if (item.severity === 'error') {
            errors++;
            view.errors.push(enriched);
          } else {
            warnings++;
            view.warnings.push(enriched);
          }
        }
        byStep[step.id] = view;
      }
    }
    return {
      valid: errors === 0,
      errors,
      warnings,
      items: items.slice(0, MAX_VALIDATION_ITEMS),
      truncated: items.length > MAX_VALIDATION_ITEMS,
      byStep
    };
  }

  _stepStatus(step, runtime, validation) {
    if (this.executingStepId === step.id) return 'executing';
    if (this.currentStepId === step.id) return runtime.status === 'failed' ? 'failed' : 'current';
    if (runtime.status === 'skipped') return 'skipped';
    if (runtime.status === 'done') return 'done';
    if (runtime.preparation && !runtime.preparation.consumedAt) return 'prepared';
    if (runtime.status === 'failed') return 'failed';
    return 'pending';
  }

  _stepView(entry, validation) {
    const { step, block } = entry;
    const runtime = this._runtime(step.id);
    const preparation = runtime.preparation;
    const execution = runtime.execution;
    const viewValidation = validation.byStep[step.id] || { errors: [], warnings: [] };
    return {
      ...step,
      blockId: block.id,
      blockTitle: block.title,
      status: this._stepStatus(step, runtime, validation),
      rawStatus: runtime.status,
      prepared: !!(preparation && !preparation.consumedAt),
      preparation: preparation ? {
        at: preparation.at,
        fingerprint: preparation.fingerprint,
        scope: preparation.scope,
        planDurationSec: preparation.planDurationSec ?? null,
        warnings: [...(preparation.warnings || [])],
        preview: preparation.preview ? { ...preparation.preview } : null,
        consumedAt: preparation.consumedAt || null,
        resolved: preparation.resolved ? { ...preparation.resolved } : null
      } : null,
      execution: execution ? {
        operationId: execution.operationId,
        startedAt: execution.startedAt,
        finishedAt: execution.finishedAt || null,
        confirmed: execution.confirmed === true,
        partial: execution.partial === true,
        error: execution.error || null,
        planDurationSec: execution.planDurationSec ?? null,
        programName: execution.programName || null,
        dskAfter: execution.dskAfter ? { ...execution.dskAfter } : {},
        audioAfter: execution.audioAfter ? { ...execution.audioAfter } : {},
        mediaName: execution.mediaName || null,
        actions: (execution.actions || []).map(action => ({
          type: action.type,
          label: action.label,
          status: action.status,
          error: action.error || null
        }))
      } : null,
      failure: runtime.failure ? { ...runtime.failure } : null,
      validation: {
        errors: viewValidation.errors.map(item => item.message),
        warnings: viewValidation.warnings.map(item => item.message)
      }
    };
  }

  _currentTiming(currentView) {
    if (!currentView || !currentView.execution?.startedAt) {
      return { elapsedSec: null, durationSec: null, remainingSec: null, overdueSec: null };
    }
    const durationSec = currentView.execution.planDurationSec ?? null;
    const elapsedSec = Math.max(0, (Date.now() - currentView.execution.startedAt) / 1000);
    const remainingSec = durationSec !== null ? Math.max(0, durationSec - elapsedSec) : null;
    const overdueSec = durationSec !== null ? Math.max(0, elapsedSec - durationSec) : null;
    return { elapsedSec, durationSec, remainingSec, overdueSec };
  }

  _divergence(currentView, preparedView) {
    const context = this._context();
    const items = [];
    if (!context.connected) {
      return { active: false, at: Date.now(), items: [] };
    }
    if (currentView?.execution?.confirmed && currentView.execution.programName && context.program && context.program !== currentView.execution.programName) {
      items.push({
        type: 'program',
        message: `O Programa está em "${context.program}", mas o passo em execução previa "${currentView.execution.programName}".`,
        expected: currentView.execution.programName,
        actual: context.program
      });
    }
    if (currentView?.execution?.confirmed) {
      const overlays = new Map(context.overlays.map(item => [Number(item.number), item.scene || '']));
      for (const [channel, expected] of Object.entries(currentView.execution.dskAfter || {})) {
        const actual = overlays.get(Number(channel)) || '';
        if ((expected || '') !== (actual || '')) {
          items.push({
            type: 'dsk',
            channel: Number(channel),
            message: `DSK ${channel} está em "${actual || 'fora'}", mas o passo previa "${expected || 'fora'}".`,
            expected,
            actual
          });
        }
      }
      const audio = new Map(context.audioInputs.map(item => [item.name, item]));
      for (const [name, expected] of Object.entries(currentView.execution.audioAfter || {})) {
        const actualAudio = audio.get(name);
        if (!actualAudio) continue;
        if (expected.muted !== undefined && !!actualAudio.muted !== !!(expected.muted)) {
          items.push({
            type: 'audio',
            target: name,
            message: `Áudio de "${name}" foi alterado manualmente após a execução.`,
            expected,
            actual: { muted: !!actualAudio.muted }
          });
        }
        if (expected.volume !== undefined) {
          const volume = Math.round((Number(actualAudio.volumeMul) || 0) * 100);
          if (Math.abs(volume - Number(expected.volume)) > 2) {
            items.push({
              type: 'audio',
              target: name,
              message: `Volume de "${name}" está em ${volume}%, mas o passo previa ${expected.volume}%.`,
              expected,
              actual: { volume }
            });
          }
        }
      }
      if (currentView.execution.mediaName) {
        const expectedState = currentView.execution.mediaState || 'OBS_MEDIA_STATE_PLAYING';
        const media = context.media.find(item => item.name === currentView.execution.mediaName);
        if (media && media.state && media.state !== expectedState) {
          items.push({
            type: 'media',
            target: currentView.execution.mediaName,
            message: `A mídia "${currentView.execution.mediaName}" não está mais em reprodução confirmada.`,
            expected: expectedState,
            actual: media.state
          });
        }
      }
    }
    if (preparedView?.preparation?.preview?.loaded && preparedView.preparation.resolved?.sourceName && context.preview && context.preview !== preparedView.preparation.resolved.sourceName) {
      items.push({
        type: 'preview',
        message: `O PVW está em "${context.preview}", mas a preparação carregou "${preparedView.preparation.resolved.sourceName}". Prepare novamente.`,
        expected: preparedView.preparation.resolved.sourceName,
        actual: context.preview
      });
    }
    return { active: items.length > 0, at: Date.now(), items };
  }

  summary() {
    // A API pode cair e voltar com o mesmo projeto. Não deixe o aviso de "conexão
    // perdida" preso depois que o motor voltou; uma suspensão pedida pelo operador
    // continua valendo.
    if (this.p?.state?.connected && this.suspended && this.suspendedReason === 'Conexão com o motor foi perdida') {
      this.suspended = false;
      this.suspendedReason = null;
    }
    const context = this._context();
    const validation = this._validateScript(context);
    const flat = this._allSteps();
    const stepViews = flat.map(entry => this._stepView(entry, validation));
    const byId = new Map(stepViews.map(step => [step.id, step]));
    const currentView = this.currentStepId ? byId.get(this.currentStepId) || null : null;
    const preparedView = this.preparedStepId ? byId.get(this.preparedStepId) || null : null;
    const nextEntry = this.ended ? null : this._nextPendingAfter(this.currentStepId);
    const nextView = nextEntry ? byId.get(nextEntry.step.id) || null : null;
    const timing = this._currentTiming(currentView);

    let totalPlannedDurationSec = 0;
    let knownDurationSteps = 0;
    let unknownDurationSteps = 0;
    const blockViews = this.script.blocks.map(block => {
      const steps = block.steps.map(step => byId.get(step.id)).filter(Boolean);
      const duration = steps.reduce((sum, step) => {
        const value = step.execution?.planDurationSec
          ?? (step.durationMode === 'fixed' ? step.durationSec
            : step.durationMode === 'media' ? this._resolvePlanDuration(step, this._resolveSource(step, context), context) : null);
        if (value > 0) return sum + value;
        return sum;
      }, 0);
      const unknown = steps.filter(step => !(step.execution?.planDurationSec > 0)
        && !(step.durationMode === 'fixed' && step.durationSec > 0)
        && !(step.durationMode === 'media' && this._resolvePlanDuration(step, this._resolveSource(step, context), context) > 0)).length;
      totalPlannedDurationSec += duration;
      knownDurationSteps += steps.length - unknown;
      unknownDurationSteps += unknown;
      return {
        id: block.id,
        title: block.title,
        notes: block.notes,
        stepCount: steps.length,
        plannedDurationSec: duration,
        unknownDurationSteps: unknown,
        steps
      };
    });

    const counts = { pending: 0, prepared: 0, current: 0, done: 0, failed: 0, skipped: 0 };
    for (const step of stepViews) {
      const status = step.status === 'executing' ? 'current' : step.status;
      if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status]++;
    }
    const currentIndex = currentView ? flat.findIndex(entry => entry.step.id === currentView.id) : -1;
    const nextIndex = nextView ? flat.findIndex(entry => entry.step.id === nextView.id) : -1;
    const divergence = this._divergence(currentView, preparedView);
    const autoMode = currentView?.endBehavior || null;

    return {
      success: true,
      schemaVersion: RUNDOWN_SCHEMA_VERSION,
      id: this.script.id,
      name: this.script.name,
      revision: this.script.revision,
      version: `v${this.script.revision}`,
      createdAt: this.script.createdAt,
      updatedAt: this.script.updatedAt,
      blocks: blockViews,
      steps: stepViews,
      stepsCount: stepViews.length,
      totalPlannedDurationSec,
      totalDurationSec: totalPlannedDurationSec,
      knownDurationSteps,
      unknownDurationSteps,
      currentIndex,
      currentStepIndex: currentIndex,
      nextIndex,
      currentStep: currentView,
      nextStep: nextView,
      preparedStep: preparedView,
      selectedStep: this.selectedStepId ? byId.get(this.selectedStepId) || null : null,
      running: this.currentStepId !== null,
      ended: this.ended,
      endedAt: this.endedAt || null,
      elapsedSec: timing.elapsedSec,
      durationSec: timing.durationSec,
      remainingSec: timing.remainingSec,
      overdueSec: timing.overdueSec,
      selectedStepId: this.selectedStepId,
      preparedStepId: this.preparedStepId,
      currentStepId: this.currentStepId,
      executingStepId: this.executingStepId,
      counts,
      connected: context.connected,
      program: context.program,
      preview: context.preview,
      availableSources: context.inputs.map(input => ({
        key: input.key,
        name: input.name,
        type: input.type || null,
        media: input.media || null,
        mediaDurationSec: input.duration > 0 ? Number(input.duration) / 1000 : null,
        muted: input.muted ?? null
      })),
      availableScenes: [...context.scenes],
      availableAudio: (context.sourceInputs.length
        ? context.sourceInputs
          .filter(source => context.audioInputs.some(audio => audio.name === source.name))
          .map(source => {
            const audio = context.audioInputs.find(item => item.name === source.name);
            return { key: source.key, name: source.name, muted: !!audio?.muted, kind: source.kind || null };
          })
        : context.audioInputs.map(audio => ({ key: null, name: audio.name, muted: !!audio.muted, kind: audio.kind || null }))),
      validation: {
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
        items: validation.items,
        truncated: validation.truncated
      },
      divergence,
      automation: {
        armed: this.armed,
        suspended: this.suspended,
        suspendedReason: this.suspendedReason,
        armedAt: this.armedAt || null,
        currentMode: autoMode,
        willAutoAdvance: !!(this.armed && currentView && autoMode && autoMode !== 'wait_operator'),
        timerPending: !!this.autoTimer,
        mediaWatch: this.mediaWatch ? { ...this.mediaWatch } : null,
        warning: this.autoWarning
      },
      captureDraft: this.captureDraft ? {
        id: this.captureDraft.id,
        createdAt: this.captureDraft.createdAt,
        step: { ...this.captureDraft.step },
        capturedFrom: { ...this.captureDraft.capturedFrom },
        warnings: [...(this.captureDraft.warnings || [])]
      } : null,
      history: this.history.slice(-30).reverse().map(entry => ({ ...entry, actions: (entry.actions || []).map(action => ({ ...action })) })),
      lastExecution: this.lastExecution ? { ...this.lastExecution } : null,
      lastMediaEvent: this.mediaEvent ? { ...this.mediaEvent } : null,
      persistence: {
        schemaVersion: RUNDOWN_SCHEMA_VERSION,
        project: this.scope,
        loadedAt: this.loadedAt || null,
        persistedAt: this.persistedAt || null,
        loadError: this.loadError,
        saveError: this.saveError,
        historyError: this.historyError,
        revision: this.script.revision,
        historyCount: this.history.length
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Automação
  // ---------------------------------------------------------------------------

  _clearTimers() {
    if (this.autoTimer) clearTimeout(this.autoTimer);
    this.autoTimer = null;
  }

  _clearAutomation(reason, { suspended = false } = {}) {
    this.armed = false;
    this.armedAt = 0;
    this.mediaWatch = null;
    this.autoAdvancePending = null;
    this.autoWarning = null;
    this._clearTimers();
    if (suspended) {
      this.suspended = true;
      this.suspendedReason = reason || 'automação suspensa';
    }
  }

  _suspendAutomation(reason) {
    this._clearAutomation(reason, { suspended: true });
  }

  disconnected() {
    this.contextEpoch++;
    this._clearAutomation('Conexão com o motor foi perdida', { suspended: true });
    const running = this.executingStepId;
    if (running) {
      const runtime = this._runtime(running);
      if (runtime.status === 'executing') runtime.status = 'pending';
    }
    this.executingStepId = null;
    // Uma preparação feita antes da queda de conexão não é reutilizada: o
    // estado pode ter mudado. O operador prepara novamente de forma explícita.
    this.preparedStepId = null;
    for (const runtime of this.runtime.values()) runtime.preparation = null;
    return this.summary();
  }

  async arm() {
    if (this.ended) throw new Error('Roteiro encerrado; reabra o roteiro antes de armar a automação.');
    if (this.executingStepId) throw new Error('Há um passo em execução; aguarde a confirmação antes de armar a automação.');
    this.armed = true;
    this.armedAt = Date.now();
    this.suspended = false;
    this.suspendedReason = null;
    this.autoWarning = null;
    const entry = this.currentStepId ? this._findStep(this.currentStepId) : null;
    if (entry) this._scheduleAutoAdvance(entry.step, this._runtime(entry.step.id));
    return this.summary();
  }

  async suspend(reason = 'Suspensão solicitada pelo operador') {
    this._suspendAutomation(reason);
    return this.summary();
  }

  _scheduleAutoAdvance(step, runtime) {
    this._clearTimers();
    this.mediaWatch = null;
    this.autoWarning = null;
    if (!this.armed || this.ended || !runtime?.execution?.confirmed) return;
    if (step.endBehavior === 'wait_operator') return;
    if (step.endBehavior === 'media_end') {
      if (!runtime.execution.mediaName) {
        this.autoWarning = 'Fim de mídia sem player identificado; a automação não vai avançar.';
        return;
      }
      this.mediaWatch = { stepId: step.id, mediaName: runtime.execution.mediaName, armedAt: Date.now() };
      return;
    }
    if (step.endBehavior === 'after_time') {
      const durationMs = (Number(runtime.execution.planDurationSec) || 0) * 1000;
      if (!(durationMs > 0)) {
        this.autoWarning = 'Passo sem duração resolvida; a automação não vai avançar.';
        return;
      }
      const elapsed = Date.now() - runtime.execution.startedAt;
      const waitMs = Math.max(0, durationMs - elapsed);
      const stepId = step.id;
      const epoch = this.contextEpoch;
      this.autoTimer = setTimeout(() => {
        this.autoTimer = null;
        if (epoch !== this.contextEpoch) return;
        this._autoAdvance(stepId, 'after_time');
      }, waitMs);
    }
  }

  _autoAdvance(stepId, reason) {
    if (!this.armed || this.ended || this.executingStepId || this.currentStepId !== stepId) return;
    // MediaInputPlaybackEnded pode chegar repetido (ou junto de um timer).
    // Um único gatilho por passo evita que o segundo seja interpretado como
    // falha depois que o primeiro já avançou.
    if (this.autoAdvancePending === stepId) return;
    this.autoAdvancePending = stepId;
    const clear = () => { if (this.autoAdvancePending === stepId) this.autoAdvancePending = null; };
    if (typeof this.p?.runRundown === 'function') {
      this.p.runRundown('rundown_auto_advance', { stepId, reason }).then(clear, error => {
        clear();
        this._suspendAutomation(`Automação interrompida: ${error.message}`);
      });
      return;
    }
    this.autoAdvanceNow(stepId, reason).then(clear, error => {
      clear();
      this._suspendAutomation(`Automação interrompida: ${error.message}`);
    });
  }

  async autoAdvanceNow(stepId, reason = 'auto') {
    if (!this.armed || this.ended) return this.summary();
    if (this.executingStepId) throw new Error('Já existe um passo em execução.');
    if (stepId && this.currentStepId !== stepId) throw new Error('A automação foi cancelada porque o passo atual mudou.');
    const next = this._nextPendingAfter(stepId || this.currentStepId);
    if (!next) {
      await this.end(`automação: ${reason}`);
      return this.summary();
    }
    try {
      await this.prepare({ stepId: next.step.id });
      await this.executeStep({ stepId: next.step.id, operationId: randomUUID(), auto: true });
    } catch (error) {
      if (!this.suspended) this._suspendAutomation(`Falha na automação: ${error.message}`);
      throw error;
    }
    return this.summary();
  }

  onNativeEvent(type, data = {}) {
    if (type !== 'MediaInputPlaybackEnded') return;
    const inputName = String(data.inputName || data.input || data.sourceName || '');
    if (!inputName) return;
    this.mediaEvent = { type, inputName, at: Date.now() };
    if (!this.armed || this.ended || this.executingStepId || !this.currentStepId) return;
    const entry = this._findStep(this.currentStepId);
    if (!entry || entry.step.endBehavior !== 'media_end') return;
    const runtime = this._runtime(entry.step.id);
    if (runtime.execution?.mediaName !== inputName) return;
    const expectedStep = entry.step.id;
    this._confirmMediaEnded(inputName).then(ended => {
      if (!ended) return;
      if (!this.armed || this.ended || this.executingStepId || this.currentStepId !== expectedStep) return;
      this._autoAdvance(expectedStep, 'media_end');
    }).catch(error => {
      this._suspendAutomation(`Falha ao confirmar fim de mídia: ${error.message}`);
    });
  }

  async _confirmMediaEnded(inputName) {
    try {
      if (typeof this.p?.req === 'function') {
        const status = await this.p.req('GetMediaInputStatus', { inputName });
        return ['OBS_MEDIA_STATE_ENDED', 'OBS_MEDIA_STATE_STOPPED'].includes(status?.mediaState);
      }
    } catch { /* consulta direta indisponível; usa o snapshot */ }
    const media = (this.p?.state?.media || []).find(item => item.name === inputName);
    return ['OBS_MEDIA_STATE_ENDED', 'OBS_MEDIA_STATE_STOPPED'].includes(media?.state);
  }

  // ---------------------------------------------------------------------------
  // Preparação
  // ---------------------------------------------------------------------------

  _clearPreparation(stepId) {
    const runtime = this._runtime(stepId);
    runtime.preparation = null;
    if (this.preparedStepId === stepId) this.preparedStepId = null;
  }

  async _readPreview() {
    if (typeof this.p?.req === 'function') {
      try {
        const scenes = await this.p.req('GetSceneList');
        if (scenes && typeof scenes.currentPreviewSceneName === 'string') return scenes.currentPreviewSceneName;
      } catch { /* usa snapshot */ }
    }
    return this.p?.state?.preview ?? null;
  }

  async _readOverlay(channel) {
    if (typeof this.p?.vendor === 'function') {
      try {
        const result = await this.p.vendor('dsk_get_scene', { dsk_name: String(channel) });
        if (result && typeof result === 'object' && 'scene' in result) return String(result.scene || '');
      } catch { /* usa snapshot */ }
    }
    const overlay = (this.p?.state?.overlays || []).find(item => Number(item.number) === Number(channel));
    return String(overlay?.scene || '');
  }

  async _prepareDsk(channel, scene) {
    if (!Number.isInteger(Number(channel)) || Number(channel) < 1 || Number(channel) > 8) throw new Error('Canal de DSK inválido.');
    if (typeof this.p?.vendor !== 'function') throw new Error('O motor não oferece confirmação de DSK.');
    const name = String(channel);
    let keyers = await this.p.vendor('get_downstream_keyers');
    let list = Array.isArray(keyers?.downstream_keyers) ? keyers.downstream_keyers : [];
    if (!list.some(item => item.name === name)) {
      await this.p.vendor('add_downstream_keyer', { dsk_name: name });
      await sleep(80);
      keyers = await this.p.vendor('get_downstream_keyers');
      list = Array.isArray(keyers?.downstream_keyers) ? keyers.downstream_keyers : [];
      if (!list.some(item => item.name === name)) throw new Error(`O canal DSK ${name} não foi confirmado pelo motor.`);
    }
    // Registra a cena na lista do keyer. Isto não muda o DSK que está no ar.
    await this.p.vendor('dsk_add_scene', { dsk_name: name, scene }).catch(() => {});
    return { channel: Number(channel), scene };
  }

  async prepare({ stepId } = {}) {
    if (this.ended) throw new Error('Roteiro encerrado; reabra o roteiro antes de preparar.');
    const explicit = stepId ? String(stepId) : null;
    const fallback = this.selectedStepId || this.preparedStepId || this._nextPendingAfter(this.currentStepId)?.step.id || null;
    const targetId = explicit || fallback;
    if (!targetId) throw new Error('Selecione um passo ou adicione passos ao roteiro.');
    if (this.executingStepId === targetId) throw new Error('Este passo já está em execução.');
    const entry = this._findStep(targetId);
    if (!entry) throw new Error('Passo não encontrado no roteiro.');
    const context = this._context();
    if (!context.connected) throw new Error('Motor desconectado: a preparação não usa um estado antigo. Reconecte e tente novamente.');

    const validation = this._validateStep(entry.step, context, { forPrepare: true });
    const errors = validation.filter(item => item.severity === 'error');
    if (errors.length) {
      this._clearPreparation(entry.step.id);
      const error = new Error(errors.map(item => item.message).join(' '));
      error.code = 'RUNDOWN_VALIDATION';
      error.validation = validation;
      throw error;
    }

    const warnings = validation.filter(item => item.severity === 'warning').map(item => item.message);
    const resolved = this._resolveSource(entry.step, context);
    const media = this._resolveMedia(entry.step, resolved, context);
    const planDurationSec = this._resolvePlanDuration(entry.step, resolved, context);
    const preparedDsk = [];

    // Carregar PVW é a única mudança visual permitida na preparação.
    const preview = { loaded: false, at: null, warning: null };
    if (entry.step.loadPreview && resolved.input && resolved.input.name !== context.program) {
      try {
        await this.p.execute('preview', { input: resolved.input.key });
        const actual = await this._readPreview();
        if (actual && actual !== resolved.input.name) throw new Error(`PVW não confirmou "${resolved.input.name}" (atual: "${actual}")`);
        preview.loaded = true;
        preview.at = Date.now();
      } catch (error) {
        preview.warning = `PVW não carregado: ${error.message}`;
        warnings.push(preview.warning);
      }
    } else if (entry.step.loadPreview && resolved.input && resolved.input.name === context.program) {
      warnings.push('A fonte já está no Programa; PVW não foi alterado.');
    }

    for (const action of entry.step.dsk) {
      if (action.action !== 'prepare' && action.action !== 'enter') continue;
      await this._prepareDsk(action.channel, action.scene);
      preparedDsk.push({ channel: Number(action.channel), scene: action.scene });
      try {
        const current = await this._readOverlay(action.channel);
        if (action.action === 'enter' && current === action.scene) warnings.push(`DSK ${action.channel} já está com a cena "${action.scene}".`);
        if (action.action === 'exit') warnings.push(`DSK ${action.channel} será retirado na execução.`);
      } catch { /* a confirmação de estado é apenas informativa aqui */ }
    }
    for (const action of entry.step.dsk) {
      if (action.action !== 'exit') continue;
      try {
        const current = await this._readOverlay(action.channel);
        if (!current) warnings.push(`DSK ${action.channel} já está fora; a saída será confirmada na execução.`);
      } catch { /* informativo */ }
    }

    const audioResolved = entry.step.audio
      .filter(action => action.action !== 'keep')
      .map(action => {
        const target = this._resolveAudioAction(action, context);
        return {
          targetKey: action.targetKey,
          targetName: action.targetName,
          name: target.name,
          action: action.action,
          value: action.value
        };
      });

    // Só existe uma preparação ativa por vez. Preparar outro passo deixa claro
    // qual passo o comando EXECUTAR vai aplicar e evita preparações antigas
    // concorrendo com a decisão do operador.
    for (const [id, other] of this.runtime) {
      if (id !== entry.step.id) other.preparation = null;
    }
    const runtime = this._runtime(entry.step.id);
    runtime.preparation = {
      at: Date.now(),
      fingerprint: stepFingerprint(entry.step),
      scope: this.scope,
      planDurationSec,
      warnings,
      preview,
      preparedDsk,
      consumedAt: 0,
      resolved: {
        sourceKey: resolved.sourceKey,
        sourceName: resolved.sourceName,
        mediaName: media?.name || null,
        mediaDurationSec: media?.durationSec ?? null,
        audio: audioResolved
      }
    };
    runtime.status = 'pending';
    runtime.failure = null;
    this.preparedStepId = entry.step.id;
    return this.summary();
  }

  // ---------------------------------------------------------------------------
  // Execução confirmada
  // ---------------------------------------------------------------------------

  async _confirmProgram(name, epoch) {
    if (epoch !== this.contextEpoch) throw new Error('Projeto ou conexão mudou durante a execução.');
    let actual = null;
    if (typeof this.p?.req === 'function') {
      const scenes = await this.p.req('GetSceneList');
      actual = scenes?.currentProgramSceneName ?? null;
    }
    if (actual === null) actual = this.p?.state?.program ?? null;
    if (actual !== name) throw new Error(`Programa não confirmado em "${name}" (atual: "${actual || 'desconhecido'}").`);
  }

  async _confirmOverlay(channel, scene, epoch) {
    if (epoch !== this.contextEpoch) throw new Error('Projeto ou conexão mudou durante a execução.');
    let actual;
    if (typeof this.p?.vendor === 'function') {
      const result = await this.p.vendor('dsk_get_scene', { dsk_name: String(channel) });
      actual = String(result?.scene || '');
    } else {
      const overlay = (this.p?.state?.overlays || []).find(item => Number(item.number) === Number(channel));
      actual = String(overlay?.scene || '');
    }
    if ((actual || '') !== (scene || '')) throw new Error(`DSK ${channel} não confirmou "${scene || 'fora'}" (atual: "${actual || 'fora'}").`);
  }

  async _confirmAudio(action, targetName, epoch) {
    if (epoch !== this.contextEpoch) throw new Error('Projeto ou conexão mudou durante a execução.');
    if (typeof this.p?.req === 'function') {
      if (action.action === 'mute' || action.action === 'unmute') {
        const expected = action.action === 'mute';
        const result = await this.p.req('GetInputMute', { inputName: targetName });
        if (!!result?.inputMuted !== expected) throw new Error(`Mute de "${targetName}" não confirmado.`);
        return;
      }
      if (action.action === 'volume') {
        const expected = Number(action.value) / 100;
        const result = await this.p.req('GetInputVolume', { inputName: targetName });
        if (Math.abs(Number(result?.inputVolumeMul) - expected) > 0.005) throw new Error(`Volume de "${targetName}" não confirmado.`);
        return;
      }
    }
    const audio = (this.p?.state?.audioInputs || []).find(item => item.name === targetName);
    if (!audio) throw new Error(`Áudio de "${targetName}" não encontrado para confirmação.`);
    if (action.action === 'mute' || action.action === 'unmute') {
      if (!!audio.muted !== (action.action === 'mute')) throw new Error(`Mute de "${targetName}" não confirmado.`);
    }
    if (action.action === 'volume') {
      const actual = Math.round((Number(audio.volumeMul) || 0) * 100);
      if (Math.abs(actual - Number(action.value)) > 2) throw new Error(`Volume de "${targetName}" não confirmado.`);
    }
  }

  async _mediaStatus(inputName) {
    if (typeof this.p?.req === 'function') {
      const status = await this.p.req('GetMediaInputStatus', { inputName });
      if (status && typeof status === 'object') return status;
    }
    return (this.p?.state?.media || []).find(item => item.name === inputName) || null;
  }

  _rememberReceipt(receipt) {
    this.receipts.set(receipt.operationId, receipt);
    if (this.receipts.size > MAX_RECEIPTS) {
      const first = this.receipts.keys().next().value;
      this.receipts.delete(first);
    }
  }

  _receiptError(receipt) {
    const partial = receipt.outcome === 'partial';
    const error = new Error(partial
      ? `Falha parcial no passo (${receipt.error || 'erro não detalhado'}). A automação foi suspensa.`
      : `O passo não foi executado: ${receipt.error || 'erro não detalhado'}.`);
    error.code = partial ? 'RUNDOWN_PARTIAL' : 'RUNDOWN_REJECTED';
    error.result = publicReceipt(receipt);
    error.summary = this.summary();
    return error;
  }

  async _runAction(receipt, type, label, fn) {
    const action = { type, label, status: 'running', at: Date.now(), error: null };
    receipt.actions.push(action);
    try {
      await fn();
      action.status = 'confirmed';
      action.at = Date.now();
      return action;
    } catch (error) {
      action.status = 'failed';
      action.error = error.message;
      action.at = Date.now();
      throw error;
    }
  }

  async executeStep({ stepId, operationId, auto = false } = {}) {
    const targetId = stepId ? String(stepId) : this.preparedStepId;
    if (!targetId) throw new Error('Prepare um passo antes de executar.');
    if (!operationId || !/^[A-Za-z0-9_-]{1,120}$/.test(String(operationId))) {
      throw new Error('Execução exige operationId para impedir duplicidade por clique repetido ou reconexão.');
    }
    const opId = String(operationId);
    const previous = this.receipts.get(opId);
    if (previous) {
      if (previous.stepId !== targetId) throw new Error('operationId já usado para outro passo.');
      if (previous.outcome === 'confirmed') {
        return { ...this.summary(), operationReplay: true, receipt: publicReceipt(previous) };
      }
      throw this._receiptError(previous);
    }
    if (this.executingStepId) throw new Error('Já existe um passo em execução. Aguarde a confirmação antes de executar outro.');
    if (this.ended) throw new Error('Roteiro encerrado; reabra o roteiro antes de executar.');

    const entry = this._findStep(targetId);
    if (!entry) throw new Error('Passo não encontrado no roteiro.');
    const runtime = this._runtime(entry.step.id);
    const preparation = runtime.preparation;
    if (!preparation) throw new Error('Este passo não foi preparado. Use PREPARAR antes de executar.');
    if (preparation.consumedAt) throw new Error('Este passo já foi executado com esta preparação. Prepare novamente para repetir.');
    if (preparation.scope !== this.scope) throw new Error('A preparação pertence a outro projeto. Prepare novamente.');
    if (preparation.fingerprint !== stepFingerprint(entry.step)) {
      this._clearPreparation(entry.step.id);
      throw new Error('O passo foi editado depois de preparado. Prepare novamente.');
    }

    const context = this._context();
    if (!context.connected) throw new Error('Motor desconectado: a execução não usa um estado antigo. Reconecte e prepare novamente.');
    const validation = this._validateStep(entry.step, context, { forPrepare: true });
    const errors = validation.filter(item => item.severity === 'error');
    if (errors.length) {
      this._clearPreparation(entry.step.id);
      const error = new Error(errors.map(item => item.message).join(' '));
      error.code = 'RUNDOWN_VALIDATION';
      error.validation = validation;
      throw error;
    }

    const resolved = this._resolveSource(entry.step, context);
    const media = this._resolveMedia(entry.step, resolved, context);
    const receipt = {
      operationId: opId,
      stepId: entry.step.id,
      outcome: 'pending',
      confirmed: false,
      auto: auto === true,
      startedAt: Date.now(),
      finishedAt: null,
      error: null,
      actions: []
    };
    this._rememberReceipt(receipt);
    this.executingStepId = entry.step.id;
    const epoch = this.contextEpoch;
    const dskBefore = {};
    for (const overlay of context.overlays) dskBefore[Number(overlay.number)] = overlay.scene || '';
    const audioBefore = {};
    for (const audio of context.audioInputs) audioBefore[audio.name] = { muted: !!audio.muted, volume: Math.round((Number(audio.volumeMul) || 0) * 100) };
    const execution = {
      operationId: opId,
      startedAt: receipt.startedAt,
      finishedAt: null,
      confirmed: false,
      partial: false,
      error: null,
      planDurationSec: preparation.planDurationSec ?? null,
      programBefore: context.program,
      programKey: resolved.input?.key || null,
      programName: resolved.input?.name || null,
      dskBefore,
      dskAfter: {},
      audioBefore,
      audioAfter: {},
      mediaName: (entry.step.type === 'video' || entry.step.type === 'playlist') ? media?.name || null : null,
      mediaState: null,
      actions: receipt.actions
    };
    runtime.execution = execution;
    runtime.status = 'executing';
    runtime.failure = null;
    preparation.consumedAt = Date.now();

    try {
      if (resolved.input) {
        await this._runAction(receipt, 'program', `Programa → ${resolved.input.name}`, async () => {
          await this.p.execute(entry.step.transition === 'fade' ? 'fade' : 'cut', {
            input: resolved.input.key,
            duration: entry.step.transitionMs
          });
          await this._confirmProgram(resolved.input.name, epoch);
        });
      }

      for (const action of entry.step.dsk) {
        if (action.action === 'keep') continue;
        const channel = Number(action.channel);
        if (action.action === 'prepare') {
          await this._runAction(receipt, 'dsk', `DSK ${channel} preparar ${action.scene}`, async () => {
            await this._prepareDsk(channel, action.scene);
          });
          execution.dskAfter[channel] = dskBefore[channel] || '';
          continue;
        }
        const scene = action.action === 'enter' ? action.scene : '';
        await this._runAction(receipt, 'dsk', `DSK ${channel} ${action.action === 'enter' ? 'entrar' : 'sair'}${scene ? ` (${scene})` : ''}`, async () => {
          await this.p.execute('overlay', { channel, input: scene });
          await this._confirmOverlay(channel, scene, epoch);
        });
        execution.dskAfter[channel] = scene;
      }

      for (const action of entry.step.audio) {
        if (action.action === 'keep') continue;
        const target = this._resolveAudioAction(action, context);
        if (!target.name) throw new Error('Destino de áudio não encontrado.');
        await this._runAction(receipt, 'audio', `Áudio ${target.name}: ${action.action}${action.action === 'volume' ? ` ${action.value}%` : ''}`, async () => {
          if (action.action === 'mute' || action.action === 'unmute') {
            await this.p.execute('audio_mute', { input: target.name, muted: action.action === 'mute' });
            execution.audioAfter[target.name] = { muted: action.action === 'mute' };
          } else if (action.action === 'volume') {
            await this.p.execute('audio_volume', { input: target.name, volume: action.value });
            execution.audioAfter[target.name] = { volume: Number(action.value) };
          }
          await this._confirmAudio(action, target.name, epoch);
        });
      }

      if (resolved.input && (entry.step.type === 'video' || entry.step.type === 'playlist')) {
        await this._runAction(receipt, 'media', `Mídia ${media?.name || resolved.input.name}: reiniciar e reproduzir`, async () => {
          await this.p.execute('media', { input: resolved.input.key, command: 'RESTART' });
          await this.p.execute('media', { input: resolved.input.key, command: 'PLAY' });
          const status = await this._mediaStatus(media?.name || resolved.input.name);
          if (status?.mediaState && status.mediaState !== 'OBS_MEDIA_STATE_PLAYING') {
            throw new Error(`Player não confirmou reprodução (estado: ${status.mediaState}).`);
          }
          if (Number(status?.mediaDuration) > 0) execution.planDurationSec = Number(status.mediaDuration) / 1000;
          execution.mediaState = status?.mediaState || 'OBS_MEDIA_STATE_PLAYING';
        });
      }

      if (epoch !== this.contextEpoch) throw new Error('Projeto ou conexão mudou durante a execução.');
      execution.confirmed = true;
      execution.finishedAt = Date.now();
      receipt.outcome = 'confirmed';
      receipt.confirmed = true;
      receipt.finishedAt = execution.finishedAt;
      if (this.currentStepId && this.currentStepId !== entry.step.id) {
        const previousRuntime = this._runtime(this.currentStepId);
        if (previousRuntime.status === 'current' || previousRuntime.status === 'executing') previousRuntime.status = 'done';
      }
      this.currentStepId = entry.step.id;
      runtime.status = 'current';
      this.preparedStepId = null;
      this.lastExecution = publicReceipt(receipt);
      // Libera o lock antes de agendar o próximo avanço: um passo "após tempo"
      // já vencido pode disparar imediatamente e não deve ser descartado.
      if (epoch === this.contextEpoch) this.executingStepId = null;
      this._scheduleAutoAdvance(entry.step, runtime);
      await this._appendHistory({
        blockId: entry.block.id,
        stepId: entry.step.id,
        stepTitle: entry.step.title,
        outcome: 'confirmed',
        actions: receipt.actions,
        startedAt: receipt.startedAt,
        finishedAt: receipt.finishedAt
      });
      return { ...this.summary(), receipt: publicReceipt(receipt) };
    } catch (error) {
      if (epoch !== this.contextEpoch) {
        const contextError = new Error('Projeto ou conexão mudou durante a execução; o resultado não foi aplicado ao roteiro.');
        contextError.code = 'RUNDOWN_CONTEXT_CHANGED';
        receipt.outcome = 'rejected';
        receipt.error = contextError.message;
        receipt.finishedAt = Date.now();
        this._rememberReceipt(receipt);
        throw contextError;
      }
      const performed = receipt.actions.filter(action => action.status === 'confirmed');
      execution.confirmed = false;
      execution.partial = performed.length > 0;
      execution.error = error.message;
      execution.finishedAt = Date.now();
      receipt.error = error.message;
      receipt.finishedAt = execution.finishedAt;
      receipt.outcome = performed.length > 0 ? 'partial' : 'rejected';
      if (performed.length > 0) {
        this.currentStepId = entry.step.id;
        runtime.status = 'failed';
      } else {
        // Nada foi confirmado no motor: a preparação continua válida para revisão.
        preparation.consumedAt = 0;
        runtime.status = 'failed';
      }
      runtime.failure = {
        at: Date.now(),
        error: error.message,
        partial: performed.length > 0,
        actions: receipt.actions.map(action => ({
          type: action.type,
          label: action.label,
          status: action.status,
          error: action.error || null
        }))
      };
      this._suspendAutomation(performed.length > 0
        ? `Falha parcial em "${entry.step.title}": ${error.message}`
        : `Falha ao executar "${entry.step.title}": ${error.message}`);
      this.lastExecution = publicReceipt(receipt);
      this._rememberReceipt(receipt);
      await this._appendHistory({
        blockId: entry.block.id,
        stepId: entry.step.id,
        stepTitle: entry.step.title,
        outcome: performed.length > 0 ? 'partial' : 'rejected',
        error: error.message,
        actions: receipt.actions,
        startedAt: receipt.startedAt,
        finishedAt: receipt.finishedAt
      });
      if (epoch === this.contextEpoch) this.executingStepId = null;
      const failure = new Error(performed.length > 0
        ? `Falha parcial em "${entry.step.title}": ${error.message}. A automação foi suspensa; confira o motor antes de seguir.`
        : `O passo "${entry.step.title}" não foi executado: ${error.message}`);
      failure.code = performed.length > 0 ? 'RUNDOWN_PARTIAL' : 'RUNDOWN_REJECTED';
      failure.result = publicReceipt(receipt);
      failure.summary = this.summary();
      throw failure;
    } finally {
      if (epoch === this.contextEpoch) this.executingStepId = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Seleção, pulo, encerramento e edição
  // ---------------------------------------------------------------------------

  async select(stepId) {
    if (stepId === null || stepId === undefined || stepId === '') {
      this.selectedStepId = null;
      return this.summary();
    }
    const entry = this._findStep(String(stepId));
    if (!entry) throw new Error('Passo não encontrado no roteiro.');
    this.selectedStepId = entry.step.id;
    return this.summary();
  }

  async skip({ stepId } = {}) {
    if (this.executingStepId) throw new Error('Aguarde o passo em execução terminar antes de pular.');
    if (this.ended) throw new Error('Roteiro encerrado.');
    const explicit = stepId ? String(stepId) : null;
    const targetId = explicit || this.selectedStepId || this.currentStepId || this._nextPendingAfter(this.currentStepId)?.step.id;
    if (!targetId) throw new Error('Não há passo para pular.');
    const entry = this._findStep(targetId);
    if (!entry) throw new Error('Passo não encontrado no roteiro.');
    const runtime = this._runtime(entry.step.id);
    this._clearPreparation(entry.step.id);
    runtime.status = 'skipped';
    runtime.skippedAt = Date.now();
    if (this.currentStepId === entry.step.id) {
      this.currentStepId = null;
      this._clearAutomation('passo pulado', { suspended: false });
      this.suspended = false;
      this.suspendedReason = null;
    }
    if (this.selectedStepId === entry.step.id) this.selectedStepId = null;
    this.preparedStepId = null;
    await this._appendHistory({
      blockId: entry.block.id,
      stepId: entry.step.id,
      stepTitle: entry.step.title,
      outcome: 'skipped',
      reason: 'PULAR'
    });
    return this.summary();
  }

  async end(reason = 'encerramento solicitado pelo operador') {
    if (this.executingStepId) throw new Error('Aguarde o passo em execução terminar antes de encerrar.');
    this._clearAutomation(reason, { suspended: false });
    this.suspended = false;
    this.suspendedReason = null;
    if (this.currentStepId) {
      const runtime = this._runtime(this.currentStepId);
      if (runtime.status === 'current') runtime.status = 'done';
    }
    this.currentStepId = null;
    this.preparedStepId = null;
    for (const runtime of this.runtime.values()) runtime.preparation = null;
    this.ended = true;
    this.endedAt = Date.now();
    await this._appendHistory({ outcome: 'ended', reason });
    return this.summary();
  }

  async reopen() {
    if (this.executingStepId) throw new Error('Aguarde o passo em execução terminar antes de reabrir.');
    this._clearAutomation('roteiro reaberto', { suspended: false });
    this.suspended = false;
    this.suspendedReason = null;
    this.ended = false;
    this.endedAt = 0;
    this.currentStepId = null;
    this.selectedStepId = null;
    this.preparedStepId = null;
    this.runtime = new Map();
    this.captureDraft = null;
    await this._appendHistory({ outcome: 'reopened', reason: 'Reabertura explícita do roteiro' });
    return this.summary();
  }

  _protectedStepId() {
    return this.executingStepId || this.currentStepId || null;
  }

  _assertCanChange(stepId) {
    const protectedId = this._protectedStepId();
    if (protectedId && protectedId === stepId) {
      throw new Error('O passo em execução permanece estável. Avance ou encerre o roteiro antes de editá-lo.');
    }
  }

  async saveScript({ script, expectedRevision, force = false } = {}) {
    if (this.executingStepId) {
      const entry = this._findStep(this.executingStepId);
      if (entry) this._assertCanChange(entry.step.id);
    }
    if (!script || typeof script !== 'object') throw new Error('Roteiro inválido.');
    if (!force && expectedRevision !== undefined && expectedRevision !== null && Number(expectedRevision) !== this.script.revision) {
      const error = new Error(`O roteiro foi alterado por outra sessão (versão atual ${this.script.revision}). Recarregue antes de salvar.`);
      error.code = 'RUNDOWN_CONFLICT';
      throw error;
    }
    const rawBlocks = Array.isArray(script.blocks)
      ? script.blocks
      : Array.isArray(script.steps) ? [{ title: script.blockTitle || 'Bloco 1', steps: script.steps }] : [];
    const rawStepCount = rawBlocks.reduce((sum, block) => sum + (Array.isArray(block?.steps) ? block.steps.length : 0), 0);
    if (rawBlocks.length > MAX_BLOCKS) throw new Error(`Limite de ${MAX_BLOCKS} blocos.`);
    if (rawStepCount > MAX_STEPS) throw new Error(`Limite de ${MAX_STEPS} passos.`);
    const candidate = normalizeScript({
      ...script,
      id: script.id || this.script.id,
      name: script.name || this.script.name,
      createdAt: script.createdAt || this.script.createdAt,
      revision: this.script.revision
    }, this.script.name);
    if (candidate.blocks.length > MAX_BLOCKS) throw new Error(`Limite de ${MAX_BLOCKS} blocos.`);
    if (candidate.blocks.reduce((sum, block) => sum + block.steps.length, 0) > MAX_STEPS) throw new Error(`Limite de ${MAX_STEPS} passos.`);

    const protectedId = this._protectedStepId();
    if (protectedId) {
      const oldEntry = this._findStep(protectedId);
      const newEntry = candidate.blocks.flatMap(block => block.steps.map(step => ({ block, step }))).find(item => item.step.id === protectedId);
      if (!oldEntry || !newEntry) throw new Error('O passo em execução não pode ser removido do roteiro.');
      if (stepFingerprint(oldEntry.step) !== stepFingerprint(newEntry.step)) {
        throw new Error('O passo em execução permanece estável. Avance ou encerre o roteiro antes de editá-lo.');
      }
    }

    const oldById = new Map(this._allSteps().map(entry => [entry.step.id, entry.step]));
    for (const block of candidate.blocks) {
      for (const step of block.steps) {
        const old = oldById.get(step.id);
        if (old && stepFingerprint(old) !== stepFingerprint(step)) this._clearPreparation(step.id);
      }
    }
    const newIds = new Set(candidate.blocks.flatMap(block => block.steps.map(step => step.id)));
    for (const id of [...this.runtime.keys()]) if (!newIds.has(id)) this.runtime.delete(id);
    if (this.selectedStepId && !newIds.has(this.selectedStepId)) this.selectedStepId = null;
    if (this.preparedStepId && !newIds.has(this.preparedStepId)) this.preparedStepId = null;

    candidate.revision = this.script.revision + 1;
    candidate.updatedAt = nowISO();
    this.script = candidate;
    await this._persist();
    return this.summary();
  }

  async addBlock({ block, title } = {}) {
    if (this.script.blocks.length >= MAX_BLOCKS) throw new Error(`Limite de ${MAX_BLOCKS} blocos.`);
    const created = normalizeBlock(block && typeof block === 'object' ? block : { title }, this.script.blocks.length);
    created.steps = [];
    this.script.blocks.push(created);
    this._touchScript();
    await this._persist();
    return { ...this.summary(), createdBlockId: created.id };
  }

  async updateBlock({ blockId, title, notes } = {}) {
    const block = this.script.blocks.find(item => item.id === blockId);
    if (!block) throw new Error('Bloco não encontrado.');
    if (title !== undefined) block.title = cleanText(title, 160) || block.title;
    if (notes !== undefined) block.notes = cleanText(notes, 2000);
    this._touchScript();
    await this._persist();
    return this.summary();
  }

  async removeBlock({ blockId } = {}) {
    const block = this.script.blocks.find(item => item.id === blockId);
    if (!block) throw new Error('Bloco não encontrado.');
    if (block.steps.some(step => step.id === this._protectedStepId())) {
      throw new Error('O bloco contém o passo em execução e não pode ser removido.');
    }
    this.script.blocks = this.script.blocks.filter(item => item.id !== blockId);
    for (const step of block.steps) {
      this.runtime.delete(step.id);
      if (this.selectedStepId === step.id) this.selectedStepId = null;
      if (this.preparedStepId === step.id) this.preparedStepId = null;
    }
    this._touchScript();
    await this._persist();
    return this.summary();
  }

  async addStep({ blockId, step, index } = {}) {
    if (this._allSteps().length >= MAX_STEPS) throw new Error(`Limite de ${MAX_STEPS} passos.`);
    let block = this.script.blocks.find(item => item.id === blockId) || this.script.blocks[this.script.blocks.length - 1];
    if (!block) {
      block = normalizeBlock({ title: 'Bloco 1', steps: [] }, 0);
      this.script.blocks.push(block);
    }
    const created = normalizeStep(step && typeof step === 'object' ? step : {}, block.steps.length);
    const ids = new Set(this._allSteps().map(entry => entry.step.id));
    if (ids.has(created.id)) created.id = randomUUID();
    const at = Number.isInteger(index) ? clamp(index, 0, block.steps.length) : block.steps.length;
    block.steps.splice(at, 0, created);
    this._touchScript();
    await this._persist();
    return { ...this.summary(), createdStepId: created.id, createdBlockId: block.id };
  }

  async updateStep({ stepId, step, patch } = {}) {
    const entry = this._findStep(stepId);
    if (!entry) throw new Error('Passo não encontrado.');
    this._assertCanChange(entry.step.id);
    const base = { ...entry.step, ...(patch && typeof patch === 'object' ? patch : {}), ...(step && typeof step === 'object' ? step : {}) };
    const updated = normalizeStep(base, entry.index);
    updated.id = entry.step.id;
    const changed = stepFingerprint(entry.step) !== stepFingerprint(updated);
    const at = entry.block.steps.findIndex(item => item.id === entry.step.id);
    entry.block.steps[at] = updated;
    if (changed) this._clearPreparation(entry.step.id);
    this._touchScript();
    await this._persist();
    return this.summary();
  }

  async removeStep({ stepId, stepIndex } = {}) {
    let block = null;
    let at = -1;
    if (stepId) {
      block = this.script.blocks.find(item => item.steps.some(step => step.id === stepId)) || null;
      at = block ? block.steps.findIndex(step => step.id === stepId) : -1;
    } else if (Number.isInteger(stepIndex)) {
      const flat = this._allSteps()[stepIndex];
      if (flat) {
        block = flat.block;
        at = block.steps.findIndex(step => step.id === flat.step.id);
      }
    }
    if (!block || at < 0) throw new Error('Passo não encontrado.');
    const step = block.steps[at];
    if (step.id === this._protectedStepId()) throw new Error('O passo em execução não pode ser removido.');
    block.steps.splice(at, 1);
    this.runtime.delete(step.id);
    if (this.selectedStepId === step.id) this.selectedStepId = null;
    if (this.preparedStepId === step.id) this.preparedStepId = null;
    this._touchScript();
    await this._persist();
    return this.summary();
  }

  async setSteps(steps = [], name) {
    if (this.executingStepId) throw new Error('Aguarde o passo em execução terminar antes de substituir o roteiro.');
    this._clearAutomation('Roteiro substituído; prepare novamente antes de executar.', { suspended: true });
    const candidate = normalizeScript({
      name: name || this.script.name,
      blocks: [{ id: this.script.blocks[0]?.id, title: this.script.blocks[0]?.title || 'Bloco 1', steps: Array.isArray(steps) ? steps : [] }]
    }, this.script.name);
    candidate.id = this.script.id;
    candidate.createdAt = this.script.createdAt;
    candidate.revision = this.script.revision + 1;
    candidate.updatedAt = nowISO();
    this.script = candidate;
    this.runtime = new Map();
    this.selectedStepId = null;
    this.preparedStepId = null;
    this.currentStepId = null;
    this.ended = false;
    this.endedAt = 0;
    await this._persist();
    return this.summary();
  }

  async reload() {
    if (this.executingStepId) throw new Error('Aguarde o passo em execução terminar.');
    if (!this.file) throw new Error('Projeto não identificado.');
    this.runtime = new Map();
    this.selectedStepId = null;
    this.preparedStepId = null;
    this.currentStepId = null;
    this.ended = false;
    await this._load();
    return this.summary();
  }

  async clearHistory() {
    this.history = [];
    await this._persistHistory();
    return this.summary();
  }

  // ---------------------------------------------------------------------------
  // Captura de estado → rascunho
  // ---------------------------------------------------------------------------

  captureCurrentToStep(title = 'Passo capturado', expectedDurationSec = null) {
    const context = this._context();
    const programName = context.program || null;
    const input = programName ? context.inputs.find(item => item.name === programName) || null : null;
    const overlays = context.overlays.filter(item => item.scene).map(item => ({ channel: Number(item.number), scene: item.scene }));
    const media = input ? context.media.find(item => item.name === input.media) || null : null;
    const durationSec = finite(expectedDurationSec, null);
    const durationMode = durationSec !== null ? 'fixed' : media && Number(media.duration) > 0 ? 'media' : 'none';
    const type = !input ? 'manual'
      : input.type === 'Video' ? 'video'
        : input.type === 'VideoList' ? 'playlist'
          : input.type === 'Browser' ? 'graphics'
            : input.type === 'Camera' ? 'camera' : 'camera';
    const step = normalizeStep({
      title: title || 'Passo capturado',
      type,
      notes: 'Rascunho capturado do estado da mesa. Revise antes de aplicar; nada foi executado.',
      sourceInputKey: input?.key || null,
      sourceName: programName,
      transition: 'cut',
      transitionMs: 500,
      durationMode,
      durationSec: durationMode === 'fixed' ? durationSec : null,
      endBehavior: 'wait_operator',
      loadPreview: false,
      dsk: overlays.map(item => ({ channel: item.channel, action: 'enter', scene: item.scene })),
      audio: [],
      captured: true
    }, 0);
    const warnings = [];
    if (!input) warnings.push('O Programa atual não corresponde a uma entrada do projeto; a fonte do rascunho ficará em branco.');
    this.captureDraft = {
      id: randomUUID(),
      createdAt: Date.now(),
      step,
      capturedFrom: {
        programName,
        programKey: input?.key || null,
        overlays,
        at: Date.now()
      },
      warnings
    };
    return {
      success: true,
      draft: {
        id: this.captureDraft.id,
        createdAt: this.captureDraft.createdAt,
        step: { ...step },
        capturedFrom: { ...this.captureDraft.capturedFrom },
        warnings
      },
      step,
      totalSteps: this._allSteps().length,
      message: 'Rascunho criado. Nada foi alterado no roteiro nem executado.'
    };
  }

  async applyCapture({ draft, step, blockId, index } = {}) {
    const source = (step && typeof step === 'object' ? step : null)
      || (draft?.step && typeof draft.step === 'object' ? draft.step : null)
      || this.captureDraft?.step
      || null;
    if (!source) throw new Error('Não há rascunho de captura para aplicar.');
    let block = this.script.blocks.find(item => item.id === blockId) || this.script.blocks[this.script.blocks.length - 1];
    if (!block) {
      block = normalizeBlock({ title: 'Bloco Capturado', steps: [] }, 0);
      this.script.blocks.push(block);
    }
    const created = normalizeStep({ ...source, captured: true }, block.steps.length);
    const ids = new Set(this._allSteps().map(entry => entry.step.id));
    if (ids.has(created.id)) created.id = randomUUID();
    const at = Number.isInteger(index) ? clamp(index, 0, block.steps.length) : block.steps.length;
    block.steps.splice(at, 0, created);
    this.captureDraft = null;
    this._touchScript();
    await this._persist();
    return { ...this.summary(), createdStepId: created.id, createdBlockId: block.id };
  }

  discardCapture() {
    this.captureDraft = null;
    return this.summary();
  }

  // ---------------------------------------------------------------------------
  // Compatibilidade e despacho de ações
  // ---------------------------------------------------------------------------

  /**
   * Compatibilidade: seleciona o próximo passo pendente. Não executa nada.
   * A execução exige preparar e executar com operationId.
   */
  async nextStep() {
    const next = this._nextPendingAfter(this.currentStepId);
    if (!next) {
      return { success: true, finished: true, message: 'Não há próximo passo pendente.', currentIndex: -1, currentStep: null, nextStep: null };
    }
    this.selectedStepId = next.step.id;
    const flat = this._allSteps();
    const index = flat.findIndex(entry => entry.step.id === next.step.id);
    return {
      success: true,
      currentIndex: index,
      currentStep: next.step,
      nextStep: flat[index + 1]?.step || null,
      selectedStepId: this.selectedStepId,
      deprecated: 'rundown_next não executa. Use PREPARAR e EXECUTAR.'
    };
  }

  async execute(action, data = {}) {
    switch (action) {
      case 'rundown_summary':
      case 'rundown_get':
        return this.summary();
      case 'rundown_select':
      case 'rundown_jump':
        return this.select(data.stepId ?? data.id ?? (Number.isInteger(data.stepIndex) ? this._allSteps()[data.stepIndex]?.step.id : null));
      case 'rundown_prepare':
        return this.prepare({ stepId: data.stepId });
      case 'rundown_execute':
        return this.executeStep({ stepId: data.stepId, operationId: data.operationId, auto: data.auto === true });
      case 'rundown_auto_advance':
        return this.autoAdvanceNow(data.stepId, data.reason);
      case 'rundown_skip':
        return this.skip({ stepId: data.stepId });
      case 'rundown_arm':
        return this.arm();
      case 'rundown_suspend':
        return this.suspend(data.reason || 'Automação suspensa pelo operador');
      case 'rundown_end':
        return this.end(data.reason || 'Encerramento solicitado pelo operador');
      case 'rundown_reopen':
        return this.reopen();
      case 'rundown_save':
        return this.saveScript({ script: data.script || data, expectedRevision: data.expectedRevision, force: data.force === true });
      case 'rundown_add_block':
        return this.addBlock({ block: data.block, title: data.title });
      case 'rundown_update_block':
        return this.updateBlock({ blockId: data.blockId, title: data.title, notes: data.notes });
      case 'rundown_remove_block':
        return this.removeBlock({ blockId: data.blockId });
      case 'rundown_add_step':
        return this.addStep({ blockId: data.blockId, step: data.step, index: data.index });
      case 'rundown_update_step':
        return this.updateStep({ stepId: data.stepId, step: data.step, patch: data.patch });
      case 'rundown_remove_step':
        return this.removeStep({ stepId: data.stepId, stepIndex: data.stepIndex ?? data.index });
      case 'rundown_set_steps':
        return this.setSteps(data.steps, data.name);
      case 'rundown_capture':
      case 'rundown_capture_current':
        return this.captureCurrentToStep(data.title, data.expectedDurationSec ?? data.durationSec);
      case 'rundown_capture_apply':
        return this.applyCapture({ draft: data.draft, step: data.step, blockId: data.blockId, index: data.index });
      case 'rundown_capture_discard':
        return this.discardCapture();
      case 'rundown_reload':
        return this.reload();
      case 'rundown_clear_history':
        return this.clearHistory();
      case 'rundown_next':
      case 'rundown_go':
        return this.nextStep();
      default:
        throw new Error(`Ação de rundown não reconhecida: ${action}`);
    }
  }
}
