'use strict';

/* 3Mix · Áudio — estado do roteamento, conexão e comandos reais.
   Toda alteração usa os controladores existentes: /api/audio-routing e
   /api/control. O desenho do mixer e do inspetor fica em
   audio-mixer-workspace.js; aqui ficam apenas estado e comandos. */

const E = id => document.getElementById(id);
const AUDIO = window.AudioDesk = window.AudioDesk || {};

const fields = {
  eq: {
    low: ['Grave 800 Hz (dB)', -20, 20, 0.1],
    mid: ['Médio (dB)', -20, 20, 0.1],
    high: ['Agudo 5 kHz (dB)', -20, 20, 0.1]
  },
  gate: {
    open_threshold: ['Abrir (dB)', -60, 0, 1],
    close_threshold: ['Fechar (dB)', -60, 0, 1],
    attack_time: ['Ataque (ms)', 0, 10000, 1],
    hold_time: ['Hold (ms)', 0, 10000, 1],
    release_time: ['Release (ms)', 0, 10000, 1]
  },
  compressor: {
    ratio: ['Razão', 1, 32, 0.5],
    threshold: ['Threshold (dB)', -60, 0, 1],
    attack_time: ['Ataque (ms)', 1, 100, 1],
    release_time: ['Release (ms)', 1, 1000, 1],
    output_gain: ['Ganho de saída (dB)', -30, 30, 0.1]
  },
  limiter: {
    threshold: ['Threshold (dB)', -60, 0, 1],
    release_time: ['Release (ms)', 1, 1000, 1]
  },
  rnnoise: {},
  nvidia: { intensity: ['Intensidade NVIDIA', 0, 1, 0.05] },
  expander: {
    ratio: ['Razão', 1, 32, 0.5],
    threshold: ['Threshold (dB)', -60, 0, 1],
    attack_time: ['Ataque (ms)', 1, 100, 1],
    release_time: ['Release (ms)', 1, 1000, 1],
    output_gain: ['Ganho de saída (dB)', -30, 30, 0.1]
  }
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTERNAL_NAME = /^(?:FreeMix|3Mix)\s+(?:Master|Bus|Retorno|N1|Barramentos)(?:\s|$)/i;
const requestedInput = new URL(location.href).searchParams.get('input');

let state = null;
let key = null;
let busy = false;
let dirty = false;
let audioConnected = false;
let directorName = '';
let toastTimer = 0;
const subscribers = new Set();

/* ------------------------------------------------------------------ */
/* Classificação real dos canais                                       */
/* ------------------------------------------------------------------ */

function sourceClass(source) {
  if (!source) return 'unknown';
  const name = String(source.name || '').trim();
  const kind = String(source.kind || '');
  if (kind === 'mix-track-to-source' || kind === 'freemix_audio_bus' || /^(?:FreeMix|3Mix)\s+(?:Master|Bus [A-Z])\s*$/i.test(name) || /^FreeMix Audio Bus\b/i.test(name)) return 'output';
  if (/^(?:FreeMix|3Mix)\s+(?:N1|Retorno)\b/i.test(name) || INTERNAL_NAME.test(name)) return 'return';
  if (directorName && name === directorName) return 'private';
  if (UUID.test(name) || /^[0-9a-f-]{30,}$/i.test(name)) return 'internal';
  if (!String(source.key || '').trim()) return 'internal';
  return 'input';
}

function isEditableChannel(source) {
  const kind = sourceClass(source);
  return kind === 'input' || kind === 'private';
}

function categoryOf(source) {
  const declared = String(source?.category || '');
  if (declared && declared !== 'other') return declared;
  const name = String(source?.name || '').toLowerCase();
  if (/mic|microfone|fone|audio|áudio|voz/.test(name)) return 'mic';
  if (/vt|video|vídeo|clip|player|trilha|media/.test(name)) return 'media';
  if (/call|web|srt|remoto|browser/.test(name)) return 'web';
  if (/cam|câmera|camera/.test(name)) return 'camera';
  return 'other';
}

const CATEGORY_LABEL = { mic: 'MIC', media: 'MED', web: 'CALL', camera: 'CAM', other: 'CH' };

/* ------------------------------------------------------------------ */
/* Estado e comandos                                                   */
/* ------------------------------------------------------------------ */

AUDIO.onChange = fn => { subscribers.add(fn); return () => subscribers.delete(fn); };
AUDIO.getState = () => state;
AUDIO.getKey = () => key;
AUDIO.getDetails = () => state?.details || null;
AUDIO.poll = poll;
AUDIO.sourceClass = sourceClass;
AUDIO.categoryOf = categoryOf;
AUDIO.categoryLabel = source => CATEGORY_LABEL[categoryOf(source)] || 'CH';
AUDIO.isEditableChannel = isEditableChannel;
AUDIO.isConnected = () => audioConnected;
AUDIO.send = send;
AUDIO.command = command;
AUDIO.inspectKey = inspectKey;
AUDIO.selectSource = selectSource;
AUDIO.openDrawer = openDrawer;
AUDIO.renderFilterForm = filterForm;
AUDIO.setDirector = name => {
  const next = String(name || '');
  if (next === directorName) return;
  directorName = next;
  notify();
};

function notify() {
  for (const fn of subscribers) {
    try { fn(); } catch (error) { console.warn('audio listener', error); }
  }
  document.dispatchEvent(new CustomEvent('audio:state'));
}

function toast(text, tone = 'info') {
  const box = E('audio-toast');
  if (!box) return;
  box.textContent = text;
  box.dataset.tone = tone;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, 4200);
}
AUDIO.toast = toast;

function setAudioConnection(connected) {
  audioConnected = connected;
  document.body.classList.toggle('audio-disconnected', !connected);
  const led = E('status-led');
  if (led) led.classList.toggle('offline', !connected);
  const connection = E('connection');
  if (connection) {
    connection.classList.toggle('offline', !connected);
    if (!connected) connection.textContent = 'Sem conexão com o motor 3Mix';
  }
  notify();
}

async function send(action, data = {}) {
  if (!audioConnected) throw Error('Sem conexão com o motor 3Mix');
  const response = await fetch('/api/control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...data }),
    signal: AbortSignal.timeout(20000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw Error(result.error || 'Comando não confirmado pelo motor');
  return result;
}

function openDrawer(open) {
  const drawer = E('channel-drawer');
  if (!drawer) return;
  drawer.classList.toggle('open', open);
  drawer.setAttribute('aria-hidden', String(!open));
  document.body.classList.toggle('inspector-open', open);
  document.dispatchEvent(new CustomEvent('audio:drawer', { detail: { open } }));
}

function selectSource(nextKey) {
  if (!nextKey) return;
  const source = (state?.sources || []).find(item => item.key === nextKey || item.name === nextKey);
  key = source?.key || nextKey;
  dirty = false;
  openDrawer(true);
  document.dispatchEvent(new CustomEvent('audio:selected', { detail: { key } }));
  poll(true);
}

/* Inspecta um canal no motor e devolve os detalhes reais (delay + filtros). */
async function inspectKey(nextKey) {
  if (!nextKey) return null;
  try {
    const response = await fetch('/api/audio-routing?key=' + encodeURIComponent(nextKey), { signal: AbortSignal.timeout(6000) });
    const data = await response.json().catch(() => ({}));
    const routed = data.audioRouting || data;
    if (!routed.details) return null;
    state = { ...state, ...routed, details: routed.details };
    if (nextKey === key) notify();
    return routed.details;
  } catch {
    return null;
  }
}

async function poll(force = false) {
  if (busy) return;
  try {
    const url = '/api/audio-routing' + (key ? '?key=' + encodeURIComponent(key) : '');
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw Error(data.error || 'Áudio indisponível');
    state = data.audioRouting || data;
    setAudioConnection(true);
    const connection = E('connection');
    if (connection) {
      connection.textContent = 'Motor 3Mix conectado';
      connection.title = state.scope ? 'Escopo: ' + state.scope : 'Motor 3Mix conectado';
    }
    if (!key && requestedInput) {
      key = (state.sources || []).find(s => s.key === requestedInput || s.name === requestedInput)?.key || null;
    }
    if (!key) {
      const first = (state.sources || []).find(s => isEditableChannel(s));
      if (first) key = first.key;
    }
    if (key && state.details?.key !== key) await inspectKey(key);
    notify();
    if (state.error) toast(state.error, 'warn');
  } catch (error) {
    setAudioConnection(false);
    if (!state) {
      const connection = E('connection');
      if (connection) connection.textContent = 'Sem conexão com o motor 3Mix';
    }
    document.dispatchEvent(new CustomEvent('audio:offline'));
  }
}

async function command(action, data) {
  if (!key) { toast('Selecione um canal de entrada.', 'warn'); return false; }
  if (busy || !audioConnected) return false;
  busy = true;
  E('channel-drawer')?.classList.add('busy');
  try {
    await send(action, { key, ...data });
    toast('Ajuste confirmado no motor 3Mix.', 'ok');
    dirty = false;
    return true;
  } catch (error) {
    toast(error.message, 'error');
    return false;
  } finally {
    busy = false;
    E('channel-drawer')?.classList.remove('busy');
    await poll(true);
  }
}

/* ------------------------------------------------------------------ */
/* Rack DSP (formulário do inspetor)                                   */
/* ------------------------------------------------------------------ */

function filterForm() {
  const type = E('filter')?.value;
  const filter = state?.details?.filters?.[type];
  const box = E('filter-fields');
  if (!box) return;
  box.replaceChildren();
  const status = E('filter-status');
  const enabled = E('filter-enabled');
  if (!filter) {
    if (status) status.textContent = 'Sem dados do canal.';
    if (enabled) enabled.disabled = true;
    return;
  }
  if (status) status.textContent = filter.supported
    ? (filter.exists ? (filter.enabled ? 'Ativo neste canal.' : 'Adicionado e desligado.') : 'Ainda não adicionado.')
    : 'Indisponível neste motor.';
  if (enabled) {
    enabled.checked = !!filter.enabled;
    enabled.disabled = !filter.supported;
  }
  for (const [name, [title, min, max, step]] of Object.entries(fields[type] || {})) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    label.textContent = title;
    input.type = 'number';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = filter.settings?.[name] ?? 0;
    input.dataset.param = name;
    input.disabled = !filter.supported;
    label.append(input);
    box.append(label);
  }
  const save = E('save-filter');
  if (save) save.disabled = !filter.supported;
  const remove = E('remove-filter');
  if (remove) remove.disabled = !filter.exists;
}

/* ------------------------------------------------------------------ */
/* Handlers do rack DSP e presets                                      */
/* ------------------------------------------------------------------ */

E('filter')?.addEventListener('change', () => { dirty = false; filterForm(); });

E('save-filter')?.addEventListener('click', () => command('audio_routing_filter', {
  type: E('filter').value,
  enabled: E('filter-enabled').checked,
  settings: Object.fromEntries([...(E('filter-fields')?.querySelectorAll('input') || [])].map(input => [input.dataset.param, Number(input.value)]))
}));

E('remove-filter')?.addEventListener('click', () => command('audio_routing_filter', {
  type: E('filter').value,
  remove: true
}));

E('open-native-filters')?.addEventListener('click', () => command('audio_routing_open_filters', {}));

E('drawer-close')?.addEventListener('click', () => openDrawer(false));

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.body.classList.contains('inspector-open')) openDrawer(false);
});

function applyAudioAiPreset(preset) {
  if (!key) { toast('Selecione um canal de entrada.', 'warn'); return; }
  toast(`Aplicando preset: ${preset}…`, 'info');

  if (preset === 'rnnoise') {
    command('audio_routing_filter', { type: 'rnnoise', enabled: true, settings: {} });
  } else if (preset === 'broadcast') {
    command('audio_routing_filter', { type: 'rnnoise', enabled: true, settings: {} });
    setTimeout(() => command('audio_routing_filter', {
      type: 'compressor', enabled: true,
      settings: { ratio: 3, threshold: -18, attack_time: 6, release_time: 60, output_gain: 1 }
    }), 200);
    setTimeout(() => command('audio_routing_filter', {
      type: 'limiter', enabled: true, settings: { threshold: -2, release_time: 60 }
    }), 400);
  } else if (preset === 'noisy') {
    command('audio_routing_filter', { type: 'rnnoise', enabled: true, settings: {} });
    setTimeout(() => command('audio_routing_filter', {
      type: 'gate', enabled: true,
      settings: { open_threshold: -28, close_threshold: -34, attack_time: 20, hold_time: 150, release_time: 120 }
    }), 200);
  } else if (preset === 'podcast') {
    command('audio_routing_filter', {
      type: 'expander', enabled: true,
      settings: { ratio: 2, threshold: -36, attack_time: 10, release_time: 50, output_gain: 0 }
    });
    setTimeout(() => command('audio_routing_filter', {
      type: 'compressor', enabled: true,
      settings: { ratio: 2, threshold: -16, attack_time: 8, release_time: 80, output_gain: 0 }
    }), 200);
  } else if (preset === 'reset') {
    for (const type of ['rnnoise', 'nvidia', 'eq', 'gate', 'compressor', 'limiter', 'expander']) {
      command('audio_routing_filter', { type, enabled: false });
    }
  }
}

for (const [id, preset] of [
  ['ai-preset-broadcast', 'broadcast'],
  ['ai-preset-rnnoise', 'rnnoise'],
  ['ai-preset-noisy', 'noisy'],
  ['ai-preset-podcast', 'podcast'],
  ['ai-preset-reset', 'reset']
]) {
  E(id)?.addEventListener('click', () => applyAudioAiPreset(preset));
}

/* ------------------------------------------------------------------ */
/* Ciclo                                                               */
/* ------------------------------------------------------------------ */

poll();
setInterval(() => { if (!document.hidden) poll(); }, 1500);
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(true); });
