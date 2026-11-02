/**
 * FreeMix State Engine
 * Estado centralizado com revision + JSON Patch + resync
 * Usado por: UI local, Remote clients, Native C++ via IPC
 */

export class StateEngine {
  constructor() {
    this.state = {};
    this.rev = 0;
    this.history = []; // { rev, patch, timestamp }
    this.listeners = new Map(); // path -> Set<callback>
    this.commandHandlers = new Map(); // command -> handler
    this.maxHistory = 1000;
  }

  // ===== STATE ACCESS =====

  get(path = '') {
    if (!path) return this.state;
    return this._getPath(this.state, path);
  }

  set(path, value) {
    const oldValue = this._getPath(this.state, path);
    if (this._equals(oldValue, value)) return false;

    const patch = this._createPatch(path, oldValue, value);
    this._applyPatch(this.state, patch);
    this._commit(patch);
    return true;
  }

  // ===== COMMANDS =====

  registerCommand(name, handler) {
    this.commandHandlers.set(name, handler);
  }

  async execute(command, payload = {}) {
    const handler = this.commandHandlers.get(command);
    if (!handler) throw new Error(`Command not found: ${command}`);

    const result = await handler(payload, this);
    this._emitEvent({ type: 'command', command, payload, result, rev: this.rev });
    return result;
  }

  // ===== SUBSCRIPTIONS =====

  subscribe(path, callback) {
    if (!this.listeners.has(path)) this.listeners.set(path, new Set());
    this.listeners.get(path).add(callback);
    return () => this.listeners.get(path).delete(callback);
  }

  // ===== PATCH / SYNC =====

  getPatch(fromRev, toRev = this.rev) {
    if (fromRev >= toRev) return [];
    const patches = [];
    for (let i = fromRev; i < toRev && i < this.history.length; i++) {
      patches.push(this.history[i].patch);
    }
    return patches;
  }

  applyPatches(patches) {
    for (const patch of patches) {
      this._applyPatch(this.state, patch);
      this.rev++;
      this.history.push({ rev: this.rev, patch, timestamp: Date.now() });
      this._notifyListeners(patch);
    }
    this._trimHistory();
  }

  resync(clientRev) {
    if (clientRev >= this.rev) return { patches: [], rev: this.rev, state: this.state };
    const patches = this.getPatch(clientRev);
    return { patches, rev: this.rev, state: this.state };
  }

  // ===== SNAPSHOTS =====

  snapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

  restore(snapshot, newRev = null) {
    this.state = JSON.parse(JSON.stringify(snapshot));
    this.rev = newRev ?? this.rev + 1;
    this.history = [];
    this._notifyAllListeners();
  }

  // ===== INTERNAL =====

  _commit(patch) {
    this.rev++;
    this.history.push({ rev: this.rev, patch, timestamp: Date.now() });
    this._notifyListeners(patch);
    this._trimHistory();
  }

  _notifyListeners(patch) {
    const path = patch.path || '';
    for (const [listenPath, callbacks] of this.listeners) {
      if (this._pathMatches(listenPath, path)) {
        for (const cb of callbacks) cb(this.get(listenPath), patch, this.rev);
      }
    }
  }

  _notifyAllListeners() {
    for (const [path, callbacks] of this.listeners) {
      const value = this.get(path);
      for (const cb of callbacks) cb(value, null, this.rev);
    }
  }

  _emitEvent(event) {
    const callbacks = this.listeners.get('*') || new Set();
    for (const cb of callbacks) cb(event);
  }

  onEvent(callback) {
    if (!this.listeners.has('*')) this.listeners.set('*', new Set());
    this.listeners.get('*').add(callback);
    return () => this.listeners.get('*').delete(callback);
  }

  _trimHistory() {
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
  }

  // ===== PATH UTILS =====

  _getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
  }

  _setPath(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => {
      if (!o[k] || typeof o[k] !== 'object') o[k] = {};
      return o[k];
    }, obj);
    target[last] = value;
  }

  _createPatch(path, oldValue, newValue) {
    if (newValue === undefined) {
      return { op: 'remove', path };
    }
    if (oldValue === undefined) {
      return { op: 'add', path, value: newValue };
    }
    return { op: 'replace', path, value: newValue };
  }

  _applyPatch(obj, patch) {
    switch (patch.op) {
      case 'add':
      case 'replace':
        this._setPath(obj, patch.path, patch.value);
        break;
      case 'remove':
        this._removePath(obj, patch.path);
        break;
    }
  }

  _removePath(obj, path) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => o?.[k], obj);
    if (target) delete target[last];
  }

  _equals(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  _pathMatches(listenPath, eventPath) {
    if (listenPath === '' || listenPath === '*') return true;
    if (eventPath === '') return false;
    return eventPath.startsWith(listenPath + '.') || eventPath === listenPath;
  }
}

// ===== SINGLETON =====

let instance = null;
export function getStateEngine() {
  if (!instance) instance = new StateEngine();
  return instance;
}

export function createStateEngine() {
  return new StateEngine();
}

// ===== DOMAIN-SPECIFIC HELPERS =====

export const StatePaths = {
  inputs: 'inputs',
  input: (id) => `inputs.${id}`,
  audio: 'audio',
  bus: (busId) => `audio.buses.${busId}`,
  mixer: 'mixer',
  strip: (inputId) => `mixer.strips.${inputId}`,
  replay: 'replay',
  replayEvents: 'replay.events',
  calls: 'calls',
  call: (id) => `calls.${id}`,
  outputs: 'outputs',
  output: (id) => `outputs.${id}`,
  graphics: 'graphics',
  graphic: (id) => `graphics.${id}`,
  recording: 'recording',
  streaming: 'streaming',
  multiview: 'multiview',
  preview: 'preview',
  program: 'program',
  transition: 'transition',
  ftb: 'ftb',
  project: 'project',
  workspace: 'workspace',
};

export const Commands = {
  // Inputs
  'input.add': 'input.add',
  'input.remove': 'input.remove',
  'input.update': 'input.update',
  'input.setPreview': 'input.setPreview',
  'input.setProgram': 'input.setProgram',

  // Audio
  'audio.setGain': 'audio.setGain',
  'audio.setPan': 'audio.setPan',
  'audio.setMute': 'audio.setMute',
  'audio.setSolo': 'audio.setSolo',
  'audio.setBus': 'audio.setBus',
  'audio.setAFV': 'audio.setAFV',

  // Mixer
  'mixer.setStrip': 'mixer.setStrip',

  // Transition
  'transition.cut': 'transition.cut',
  'transition.auto': 'transition.auto',
  'transition.setType': 'transition.setType',
  'transition.setDuration': 'transition.setDuration',

  // FTB
  'ftb.toggle': 'ftb.toggle',

  // Replay
  'replay.record': 'replay.record',
  'replay.play': 'replay.play',
  'replay.pause': 'replay.pause',
  'replay.seek': 'replay.seek',
  'replay.setSpeed': 'replay.setSpeed',
  'replay.markIn': 'replay.markIn',
  'replay.markOut': 'replay.markOut',
  'replay.addEvent': 'replay.addEvent',

  // Calls
  'call.connect': 'call.connect',
  'call.disconnect': 'call.disconnect',
  'call.setN1': 'call.setN1',
  'call.setReturn': 'call.setReturn',

  // Outputs
  'output.start': 'output.start',
  'output.stop': 'output.stop',
  'output.configure': 'output.configure',

  // Recording/Streaming
  'recording.start': 'recording.start',
  'recording.stop': 'recording.stop',
  'streaming.start': 'streaming.start',
  'streaming.stop': 'streaming.stop',

  // Graphics
  'graphic.load': 'graphic.load',
  'graphic.play': 'graphic.play',
  'graphic.stop': 'graphic.stop',
  'graphic.update': 'graphic.update',

  // Workspace
  'workspace.save': 'workspace.save',
  'workspace.load': 'workspace.load',
  'workspace.setPanel': 'workspace.setPanel',
};

// ===== DEFAULT INITIAL STATE =====

export function createInitialState() {
  return {
    rev: 0,
    inputs: {},
    audio: { buses: { M: {}, A: {}, B: {} }, master: { gain: 0, mute: false } },
    mixer: { strips: {} },
    replay: { status: 'idle', events: [], timeline: [] },
    calls: {},
    outputs: {},
    graphics: {},
    recording: { status: 'idle' },
    streaming: { status: 'idle' },
    multiview: { layout: 'standard' },
    preview: { inputId: null },
    program: { inputId: null },
    transition: { type: 'cut', duration: 300, progress: 0 },
    ftb: { active: false },
    project: { name: 'Novo Projeto', modified: false },
    workspace: { layout: 'default', panels: {} },
  };
}