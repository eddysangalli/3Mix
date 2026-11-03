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
  if (kind === 'mix-track-to-source' || kind === 'freemix_audio_bus' || /^(?:FreeMix|3Mix)\s+(?:Master|Bus [A-Z])\s*$/i.test(name) || /^3Mix Audio Bus\b/i.test(name)) return 'output';
  if (/^(?:FreeMix|3Mix)\s+(?:N1|Retorno)\b/i.test(name) || INTERNAL_NAME.test(name)) return 'return';
  if (directorName && name === directorName) return 'private';
  if (UUID.test(name) || /^[0-9a-f-]{30,}$/i.test(name)) return 'internal';
  if (!String(source.key || '').trim()) return 'internal';
  return 'input';
}

function isEditableChannel(source) {
  // Mic privado (director), retornos e barramentos não têm roteamento editável
  // nesta API; o servidor responde 400. Só entradas normais entram no inspetor.
  return sourceClass(source) === 'input';
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
  if (source && !isEditableChannel(source)) {
    toast('Mic privado, retorno e barramentos não têm roteamento editável aqui.', 'warn');
    return;
  }
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
      key = (state.sources || []).find(s => (s.key === requestedInput || s.name === requestedInput) && isEditableChannel(s))?.key || null;
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
  const enabled = E('filter-enabled');
  paintFx();
  if (!filter) {
    if (enabled) enabled.disabled = true;
    return;
  }
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
}

/* Efeitos do canal, na ordem real do motor. A lista só é refeita quando muda, para não atrapalhar o clique durante a atualização periódica. */
const FX_NAMES = { eq: 'EQ 3 bandas', gate: 'Gate de ruído', compressor: 'Compressor', limiter: 'Limiter de pico', expander: 'Expansor', rnnoise: 'Limpeza neural (RNNoise)', nvidia: 'Limpeza NVIDIA', pp_track: 'PodcastPlugins Track', pp_master: 'PodcastPlugins Master', master_me: 'master_me' };
const FX_PROCESSORS = ['eq', 'gate', 'compressor', 'limiter', 'expander', 'rnnoise', 'nvidia'], FX_PLUGINS = ['pp_track', 'pp_master', 'master_me'];
let fxEditing = null, fxPainted = '';
const fxEditor = E('fx-editor');

function fxOption(value, text, disabled) { const o = new Option(text, value); o.disabled = !!disabled; return o; }

function paintFx() {
  const detail = state?.details, chain = detail?.chain || [], filters = detail?.filters || {}, installed = state?.vst3Installed || [];
  if (fxEditing && !chain.some((row) => row.type === fxEditing)) fxEditing = null;
  const mark = JSON.stringify([detail?.key, chain, installed, fxEditing, FX_PROCESSORS.concat(FX_PLUGINS).map((type) => filters[type]?.supported)]);
  if (mark === fxPainted) return;
  fxPainted = mark;
  const box = E('fx-rows'), pick = E('fx-pick');
  if (!box || !pick) return;
  const active = chain.filter((row) => row.enabled).length;
  E('fx-count').textContent = chain.length ? active + (active === chain.length ? '' : ' de ' + chain.length) : '';
  fxEditor.hidden = true;
  box.replaceChildren(...chain.map((row) => {
    const line = document.createElement('div');
    line.className = 'a-fx-row' + (row.enabled ? ' is-on' : '') + (fxEditing && row.type === fxEditing ? ' is-editing' : '');
    const label = document.createElement('label');
    label.className = 'a-fx-name';
    const on = document.createElement('input');
    on.type = 'checkbox';
    on.checked = !!row.enabled;
    on.title = row.enabled ? 'Desligar' : 'Ligar';
    on.addEventListener('change', () => command('audio_routing_chain', { op: on.checked ? 'on' : 'off', filter: row.filter }));
    const name = document.createElement('span');
    name.textContent = (FX_NAMES[row.type] || row.label) + (row.missing ? ' (não instalado)' : '');
    name.title = row.filter;
    label.append(on, name);
    line.append(label);
    const button = (text, title, click, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.className = 'a-fx-btn ' + cls; b.textContent = text; b.title = title; b.addEventListener('click', click); line.append(b); };
    if (['vst_filter', 'vst3_filter'].includes(row.kind)) button('Abrir', 'Abrir a janela do plugin', () => command('audio_routing_chain', { op: 'open', filter: row.filter }));
    else if (row.type && Object.keys(fields[row.type] || {}).length) button('Ajustar', 'Ajustar este efeito', () => { fxEditing = fxEditing === row.type ? null : row.type; dirty = false; E('filter').value = row.type; filterForm(); });
    button('×', 'Remover este efeito', () => command('audio_routing_chain', { op: 'remove', filter: row.filter }), 'is-remove');
    return line;
  }));
  if (fxEditing) {
    const target = [...box.children][chain.findIndex((row) => row.type === fxEditing)];
    fxEditor.hidden = false;
    target?.after(fxEditor);
  }
  const chosen = pick.value, applied = new Set(chain.map((row) => row.type));
  const group = (title, items) => { const g = document.createElement('optgroup'); g.label = title; g.append(...items); return g; };
  const processors = FX_PROCESSORS.filter((type) => !applied.has(type)).map((type) => fxOption('f:' + type, FX_NAMES[type], filters[type] && !filters[type].supported));
  const plugins = FX_PLUGINS.filter((type) => !applied.has(type)).map((type) => fxOption('p:' + type, FX_NAMES[type], filters[type] && !filters[type].supported));
  pick.replaceChildren(fxOption('', 'Escolher efeito…'));
  if (processors.length) pick.append(group('Processadores', processors));
  if (plugins.length) pick.append(group('Plugins do 3Mix', plugins));
  if (installed.length) pick.append(group('VST3 instalados', installed.map((plugin) => fxOption('v:' + plugin.path, plugin.name))));
  if ([...pick.options].some((o) => o.value === chosen && !o.disabled)) pick.value = chosen;
}
AUDIO.paintFx = paintFx;

E('fx-add')?.addEventListener('click', async () => {
  const value = E('fx-pick')?.value || '', kind = value.slice(0, 2), target = value.slice(2);
  if (!target) return;
  if (kind === 'f:') { if (await command('audio_routing_filter', { type: target, enabled: true, settings: {} })) { fxEditing = Object.keys(fields[target] || {}).length ? target : null; E('filter').value = target; filterForm(); } }
  else if (kind === 'p:') await command('audio_routing_plugin', { type: target, op: 'on' });
  else await command('audio_routing_vst3', { op: 'add', path: target });
  if (E('fx-pick')) E('fx-pick').value = '';
});

/* ------------------------------------------------------------------ */
/* Handlers do rack DSP e presets                                      */
/* ------------------------------------------------------------------ */

E('filter')?.addEventListener('change', () => { dirty = false; filterForm(); });

E('save-filter')?.addEventListener('click', () => command('audio_routing_filter', {
  type: E('filter').value,
  enabled: E('filter-enabled').checked,
  settings: Object.fromEntries([...(E('filter-fields')?.querySelectorAll('input') || [])].map(input => [input.dataset.param, Number(input.value)]))
}));

E('open-native-filters')?.addEventListener('click', () => command('audio_routing_open_filters', {}));

// Plugins embutidos. No canal seguem o canal escolhido; o master_me do MAIN independe da seleção.
const MAIN_BUS = '3Mix Master';
let masterMeOn = false;
async function pluginNoMain(op) {
  try { await send('audio_routing_plugin', { key: MAIN_BUS, type: 'master_me', op }); return true; }
  catch (error) { toast(error.message, 'warn'); return false; }
}
E('plugin-master-toggle')?.addEventListener('click', async () => {
  if (await pluginNoMain(masterMeOn ? 'off' : 'on')) {
    masterMeOn = !masterMeOn;
    E('plugin-master-toggle').classList.toggle('on', masterMeOn);
    toast(masterMeOn ? 'master_me ligado no MAIN' : 'master_me desligado no MAIN');
  }
});
E('plugin-master-open')?.addEventListener('click', async () => {
  if (await pluginNoMain('open')) { masterMeOn = true; E('plugin-master-toggle').classList.add('on'); }
});

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

fetch('/api/update', { cache: 'no-store' }).then((r) => r.json()).then((d) => {
  const m = String(d.update?.currentVersion || '').match(/^(\d+\.\d+\.\d+)-(alpha|beta)$/);
  if (m && E('a-versao')) E('a-versao').textContent = (m[2] === 'alpha' ? 'Alpha ' : 'Beta ') + m[1];
}).catch(() => {});
poll();
setInterval(() => { if (!document.hidden) poll(); }, 1500);
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(true); });
