// QA do painel de Áudio do 3Mix — servidor de prévia com API simulada.
// Não é motor: apenas reproduz os payloads reais capturados da instalação
// (qa-audio/fixtures) e confirma comandos para validar a interface.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const panelRoot = join(here, '..', 'painel');
const fixtures = join(here, 'fixtures');
const PORT = Number(process.env.AUDIO_QA_PORT || 8777);
process.on('uncaughtException', error => console.error('QA exceção:', error.message));

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8'
};

let jsonState = JSON.parse(await readFile(join(fixtures, 'estado-producao.json'), 'utf8'));
const audioSummary = JSON.parse(await readFile(join(fixtures, 'audio-routing.json'), 'utf8')).audioRouting;
const routing = audioSummary.routing;
const commands = [];
const started = new Date().toISOString();
const channelDetails = new Map();

// O fixture foi capturado desconectado; o QA simula o motor conectado.
jsonState.connected = true;
jsonState.preset = jsonState.preset || 'QA Áudio';
const director = jsonState.calls?.director?.name || '';

const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

const channel = name => (jsonState.audioInputs || []).find(item => item.name === name);
const programInput = name => (jsonState.inputs || []).find(item => item.name === name);

/* Simulação de sinal (apenas QA): níveis animados em canais abertos para
   exercer o desenho dos medidores. O painel continua lendo `levels` de
   /api/json como no motor — a tela não inventa nível por conta própria.
   Canais mudos e não listados seguem com levels vazio (real do fixture). */
const QA_SIGNAL = new Map([
  ['VT áudio', { floor: 0.11, ceiling: 0.30, phase: 0 }],
  ['FreeMix Master', { floor: 0.20, ceiling: 0.42, phase: 1.3 }],
  ['FreeMix Bus B', { floor: 0.05, ceiling: 0.12, phase: 2.4 }]
]);

function animateLevels() {
  const t = Date.now() / 1000;
  for (const item of jsonState.audioInputs || []) {
    const conf = QA_SIGNAL.get(item.name);
    if (!conf || item.muted) continue;
    const wobble = Math.max(0, Math.min(1, 0.5 + 0.5 * Math.sin(t * 2.1 + conf.phase) * Math.sin(t * 0.73 + conf.phase / 2)));
    const value = conf.floor + (conf.ceiling - conf.floor) * wobble;
    item.levels = [value, Math.max(0, value * (0.8 + 0.18 * Math.sin(t * 1.4 + conf.phase)))];
  }
}

function routeDirect(d) {
  const saved = (routing.directOut || []).find(entry => entry.key === d.key);
  const device = (routing.capabilities.renderDevices || []).find(item => item.id === d.device);
  const next = {
    key: d.key,
    device: d.device,
    deviceName: device?.name || d.device,
    volume: Number(d.volume ?? 80),
    delayMs: Number(d.delayMs ?? 0),
    enabled: d.enabled === true
  };
  if (saved) Object.assign(saved, next);
  else routing.directOut.push(next);
}

function control(action, d = {}) {
  commands.push({ action, data: d, at: new Date().toISOString() });
  const target = d.input && (channel(d.input) || (d.input === 'M' ? channel('FreeMix Master') : null));

  if (action === 'audio_routing_devices') {
    routing.capabilities.renderInventoryKnown = true;
    routing.capabilities.renderInventoryError = null;
    routing.capabilities.renderDevices = [
      { id: '{0.0.0.00000000}.{qa-interface-usb}', name: 'Interface USB Broadcast (QA)' },
      { id: '{0.0.0.00000000}.{qa-monitor}', name: 'Alto-falantes do estúdio (QA)' }
    ];
    routing.capabilities.asio = true;
    routing.capabilities.asioInventoryKnown = true;
    routing.capabilities.asioInventoryError = null;
    routing.capabilities.asioDrivers = [{ id: 'ASIO-QA-IN', name: 'Driver ASIO QA (captura)' }];
    routing.asioOutput.inventoryKnown = true;
    routing.asioOutput.supported = true;
    routing.asioOutput.drivers = [{ id: 'ASIO-QA-OUT', name: 'Driver ASIO QA (saída)' }];
  } else if (action === 'audio_volume' && target) {
    const volume = Math.max(0, Math.min(100, Number(d.volume))) / 100;
    target.volumeMul = volume;
    target.volumeDb = volume > 0 ? 20 * Math.log10(volume) : -100;
  } else if (action === 'audio_mute' && target) {
    target.muted = !!d.muted;
  } else if (action === 'audio_balance' && target) {
    target.balance = Number(d.balance);
  } else if (action === 'audio_monitor' && target) {
    target.monitor = d.enabled ? 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT' : 'OBS_MONITORING_TYPE_NONE';
  } else if (action === 'audio_bus') {
    const input = programInput(d.input);
    if (input) {
      const set = new Set(String(input.audioBuses || '').split(',').filter(Boolean));
      if (d.enabled) set.add(d.bus); else set.delete(d.bus);
      input.audioBuses = [...set].join(',');
    }
  } else if (action === 'audio_routing_afv') {
    const source = (audioSummary.sources || []).find(item => item.key === d.key);
    if (source) source.afv = d.enabled === true;
  } else if (action === 'audio_routing_filter') {
    if (d.key) {
      const detail = channelDetails.get(d.key) || { delayMs: 0, filters: {} };
      const current = detail.filters[d.type] || { supported: true, exists: false, enabled: false, settings: {} };
      if (d.remove === true) {
        detail.filters[d.type] = { ...current, exists: false, enabled: false };
      } else {
        detail.filters[d.type] = {
          ...current,
          exists: true,
          enabled: d.enabled !== false,
          settings: { ...(current.settings || {}), ...(d.settings || {}) }
        };
      }
      channelDetails.set(d.key, detail);
    }
  } else if (action === 'audio_routing_delay') {
    if (d.key) {
      const detail = channelDetails.get(d.key) || { delayMs: 0, filters: {} };
      detail.delayMs = Number(d.delayMs) || 0;
      channelDetails.set(d.key, detail);
    }
  } else if (action === 'audio_routing_open_filters') {
    /* O diálogo nativo é do programa; o QA apenas confirma o comando. */
  } else if (action === 'audio_routing_direct') {
    routeDirect(d);
  } else if (action === 'audio_routing_bus_create') {
    const name = 'FreeMix Audio Bus ' + d.name;
    routing.buses.push({ key: 'qa-bus-' + (routing.buses.length + 1), name, label: d.name, kind: 'freemix_audio_bus', members: [], routes: [], volumeDb: 0, directOut: null });
    jsonState.audioInputs.push({ name, kind: 'freemix_audio_bus', volumeMul: 1, volumeDb: 0, muted: false, tracks: { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false }, monitor: 'OBS_MONITORING_TYPE_NONE', balance: 0.5, levels: [], bus: null });
  } else if (action === 'audio_routing_bus_members') {
    const bus = routing.buses.find(item => item.key === d.key);
    if (bus) bus.members = (d.members || []).map(member => ({ key: member.key, gain: member.gain }));
  } else if (action === 'audio_routing_bus_volume') {
    const bus = routing.buses.find(item => item.key === d.key);
    if (bus) {
      bus.volumeDb = Number(d.volumeDb);
      const input = jsonState.audioInputs.find(item => item.name === bus.name);
      if (input) {
        input.volumeDb = Number(d.volumeDb);
        input.volumeMul = Number(d.volumeDb) > -60 ? Math.pow(10, Number(d.volumeDb) / 20) : 0;
      }
    }
  } else if (action === 'audio_routing_bus_route') {
    const bus = routing.buses.find(item => item.key === d.key);
    if (bus) bus.routes = [...(d.routes || [])];
  } else if (action === 'audio_routing_bus_remove') {
    const bus = routing.buses.find(item => item.key === d.key);
    routing.buses = routing.buses.filter(item => item.key !== d.key);
    if (bus) jsonState.audioInputs = jsonState.audioInputs.filter(item => item.name !== bus.name);
  } else if (action === 'audio_routing_asio_output_configure') {
    routing.asioOutput.configured = true;
    routing.asioOutput.driverId = d.driverId;
    routing.asioOutput.configuredBufferFrames = Number(d.bufferFrames || 0);
    routing.asioOutput.routes = (d.routes || []).map(route => ({ uuid: route.key, left: route.left, right: route.right, gain: route.gain }));
  } else if (action === 'audio_routing_asio_output_start') {
    routing.asioOutput.running = true;
    routing.asioOutput.sampleRate = 48000;
    routing.asioOutput.bufferFrames = routing.asioOutput.configuredBufferFrames || 512;
    routing.asioOutput.outputChannels = 8;
    routing.asioOutput.outputLatencyMs = 10.7;
  } else if (action === 'audio_routing_asio_output_stop') {
    routing.asioOutput.running = false;
  } else if (action === 'return_feed_configure') {
    const feed = jsonState.returnFeeds?.feeds?.find(item => item.id === d.feedId);
    if (feed) {
      if (d.audioMode !== undefined) feed.audioMode = d.audioMode;
      if (d.nMinusExclude !== undefined) feed.nMinusExclude = d.nMinusExclude;
      if (d.latencyMs !== undefined) feed.latencyMs = Number(d.latencyMs);
    }
  } else if (action === 'return_feed_start' || action === 'return_feed_stop') {
    const feed = jsonState.returnFeeds?.feeds?.find(item => item.id === d.feedId);
    if (feed) {
      feed.status = action === 'return_feed_start' ? 'running' : 'stopped';
      feed.connectedClients = feed.status === 'running' ? 1 : 0;
    }
  }
  return { success: true };
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  let body = '';
  if (req.method === 'POST') {
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) { send(res, 413, { success: false, error: 'corpo grande' }); return; }
    }
  }

  if (url.pathname === '/api/json') { animateLevels(); return send(res, 200, jsonState); }
  if (url.pathname === '/api/audio-routing') {
    const key = url.searchParams.get('key');
    if (key) {
      const source = (audioSummary.sources || []).find(item => item.key === key);
      if (!source) return send(res, 200, { success: false, error: 'Fonte ausente no fixture de QA' });
      const defaults = {
        gain: { db: 0 },
        gate: { open_threshold: -26, close_threshold: -32, attack_time: 25, hold_time: 200, release_time: 150 },
        compressor: { ratio: 4, threshold: -18, attack_time: 6, release_time: 60, output_gain: 0 },
        limiter: { threshold: -6, release_time: 60 },
        rnnoise: {},
        expander: { ratio: 2, threshold: -40, attack_time: 10, release_time: 50, output_gain: 0 }
      };
      const filters = {};
      for (const [type, settings] of Object.entries(defaults)) filters[type] = { supported: true, exists: false, enabled: false, settings };
      const stored = channelDetails.get(key);
      if (stored) {
        for (const [type, value] of Object.entries(stored.filters || {})) {
          filters[type] = { ...filters[type], ...value, supported: true, settings: { ...(filters[type]?.settings || {}), ...(value.settings || {}) } };
        }
      }
      return send(res, 200, { success: true, audioRouting: { ...audioSummary, details: { key, name: source.name, delayMs: stored?.delayMs ?? 0, filters, filterOrder: [] } } });
    }
    return send(res, 200, { success: true, audioRouting: audioSummary });
  }
  if (url.pathname === '/api/control' && req.method === 'POST') {
    let data = {};
    try { data = JSON.parse(body || '{}'); } catch { return send(res, 400, { success: false, error: 'JSON inválido' }); }
    return send(res, 200, control(data.action, data));
  }
  if (url.pathname === '/api/qa-state') return send(res, 200, { started, commands, routing, audioInputs: jsonState.audioInputs, returnFeeds: jsonState.returnFeeds });
  if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (url.pathname === '/api/qa-reset') return send(res, 405, { success: false });
  if (url.pathname === '/api/panel-title' || url.pathname === '/api/panel-close') return send(res, 200, { success: true });
  if (url.pathname === '/api/health') return send(res, 200, { success: true, qa: true });

  let path = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (!path) path = 'remoto/audio.html';
  if (!path.includes('/')) path = 'remoto/' + path;
  if (!extname(path)) path += '.html';
  if (path.includes('..')) return send(res, 403, 'forbidden', 'text/plain');
  const file = join(panelRoot, path);
  try {
    let data = await readFile(file);
    // O QA serve o painel atual diretamente. A página de teste recebe uma
    // marca visível para nunca ser confundida com a instalação do operador.
    if (path.endsWith('audio.html')) {
      let html = data.toString('utf8');
      html = html.replace(/<title>[^<]*<\/title>/, '<title>3Mix QA — Áudio (motor simulado)</title>');
      html = html.replace('<div class="a-top-right">', '<div class="a-top-right"><span class="qa-environment-badge">AMBIENTE DE TESTE</span>');
      html = html.replace('</head>', `<style>
        .qa-environment-badge{display:inline-flex;align-items:center;height:22px;padding:0 8px;border:1px solid #7a642c;background:#2f2815;color:#e6cf8a;border-radius:3px;font:700 10px 'Segoe UI';letter-spacing:.6px;white-space:nowrap}
      </style></head>`);
      data = Buffer.from(html, 'utf8');
    }
    send(res, 200, data, types[extname(file)] || 'application/octet-stream');
  } catch {
    send(res, 404, 'não encontrado', 'text/plain; charset=utf-8');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`QA Áudio 3Mix em http://127.0.0.1:${PORT}/audio.html`);
});
