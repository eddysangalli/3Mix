// Offline fixture for the settings central's inline pages. Serves the real files from painel/remoto and answers the
// handful of API routes used by Replay/DSK/Multiview/Atalhos/Hub/Macros/Recuperação/Diagnóstico/Atualizações, so the
// pages can be exercised headless without the installed program and without starting any real output.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { WebSocketServer } from 'ws';

const PANEL = path.resolve(import.meta.dirname, '../../painel/remoto');
const PORT = Number(process.argv[2] || 8793);
const ORIGIN = `http://127.0.0.1:${PORT}`;

const native = (category, name, label, type, value, choices = '', min = 0, max = 0) => ({ category, name, label, type, value, choices, min, max, default: value });
const scenes = ['CAM 1', 'CAM 2', 'VT 1', 'PLACAR', 'REPLAY A', 'FreeMix Barramentos'];
const settings = {
  video: { baseWidth: 1920, baseHeight: 1080, outputWidth: 1920, outputHeight: 1080, fpsNumerator: 30000, fpsDenominator: 1001 },
  values: { RecFormat2: 'hybrid_mp4', RecQuality: 'HQ', RecEncoder: 'obs_x264', StreamEncoder: 'obs_x264', VBitrate: '6000', ABitrate: '160' },
  recordDirectory: 'D:/gravacoes',
  server: 'rtmp://a.rtmp.youtube.com/live2',
  hasKey: true,
  protocol: 'rtmp',
  mode: 'Simple',
  capabilities: {
    recordingFormats: ['mkv', 'mp4', 'hybrid_mp4', 'mov', 'hybrid_mov'],
    simpleEncoders: [
      { id: 'obs_x264', label: 'x264', codec: 'h264', protocols: ['rtmp', 'rtmps', 'hls'] },
      { id: 'obs_nvenc_h264', label: 'NVIDIA NVENC H.264', codec: 'h264', protocols: ['rtmp', 'rtmps', 'hls'] },
    ],
    protocols: [{ id: 'rtmp', available: true }, { id: 'rtmps', available: true }, { id: 'hls', available: true }],
    error: null,
  },
  nativePreferences: {
    error: null,
    fields: [
      native('audio', 'sampleRate', 'Taxa de amostragem (Hz)', 'string', '48000', '44100|48000'),
      native('audio', 'channels', 'Canais da produção', 'string', 'Stereo', 'Mono|Stereo'),
      native('general', 'snapDistance', 'Distância de encaixe (px)', 'number', 10, '', 0, 100),
      native('general', 'warnStartStream', 'Avisar ao iniciar transmissão', 'bool', true),
      native('general', 'warnStopRecord', 'Avisar ao parar gravação', 'bool', true),
      native('appearance', 'fontScale', 'Escala das fontes (motor)', 'integer', 10, '', -5, 50),
      native('appearance', 'density', 'Densidade dos controles', 'integer', 1, '', 0, 2),
      native('advanced', 'priority', 'Prioridade do processo', 'string', 'Normal', 'Normal|AboveNormal|High|BelowNormal|Idle'),
      native('advanced', 'colorFormat', 'Formato de cor', 'string', 'NV12', 'NV12|I420|I444|P010|BGRA'),
      native('advanced', 'colorSpace', 'Espaço de cor', 'string', '709', '601|709|sRGB|2100PQ|2100HLG'),
      native('advanced', 'colorRange', 'Faixa de cor', 'string', 'Partial', 'Partial|Full'),
      native('advanced', 'sdrWhiteLevel', 'Branco SDR (nits)', 'integer', 300, '', 80, 480),
      native('advanced', 'hdrPeakLevel', 'Pico nominal HDR (nits)', 'integer', 1000, '', 400, 10000),
      native('performance', 'scaleType', 'Filtro de redução de imagem', 'string', 'bicubic', 'bilinear|bicubic|lanczos|area'),
      native('projectors', 'multiviewLayout', 'Layout do multiview', 'integer', 0, '', 0, 7),
      native('files', 'filenamePattern', 'Padrão do nome do arquivo', 'text', '%CCYY-%MM-%DD %hh-%mm-%ss'),
      native('files', 'overwriteFiles', 'Sobrescrever arquivo existente', 'bool', false),
      native('networkOutput', 'reconnectEnabled', 'Reconectar automaticamente', 'bool', true),
      native('outputAdvanced', 'mode', 'Modo de saída', 'string', 'Simple', 'Simple|Advanced'),
      native('outputAdvanced', 'recordTracks', 'Trilhas da gravação (máscara)', 'integer', 3, '', 1, 63),
      ...[1, 2, 3].flatMap((n) => [native('audioTracks', `track${n}Name`, `Nome da trilha ${n}`, 'text', n === 1 ? 'Master' : `Trilha ${n}`), native('audioTracks', `track${n}Bitrate`, `Trilha ${n} · bitrate (kbps)`, 'string', '160', '96|128|160|192')]),
    ],
  },
  stats: { cpuUsage: 12.5, memoryUsage: 512.3, activeFps: 29.97, renderSkippedFrames: 0, renderTotalFrames: 12000, outputSkippedFrames: 1, outputTotalFrames: 11999, availableDiskSpace: 524288 },
  virtualCamera: false,
  preset: 'Futsal ao vivo',
};
const workspace = { revision: 3, cardWidth: 180, sideWidth: 320, audioLeft: false, modulesStacked: false };
const outputs = {
  destinations: [0, 1, 2, 3].map((n) => ({ name: `Destino ${n + 1}`, server: '', hasKey: false, protocol: 'auto', mode: 'program', active: false, state: 'idle', error: '' })),
  encoders: [{ id: 'obs_x264', name: 'x264', codec: 'h264' }],
  audioSources: [{ uuid: '11111111-1111-1111-1111-111111111111', name: 'Bus principal' }],
  ndi: { available: true, senders: [] }, omt: { available: true, senders: [] },
};
const replay = {
  rec: false, availableCams: scenes, cameraOptions: {}, session: null, retention: { enabled: true, minutes: 30 },
  audioEnabled: true, players: {}, program: '', sync: {}, activePlayer: 'A',
};
const overlays = {
  channels: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: String(i + 1), scene: '', transition: i === 0 ? 'Cut' : 'Fade', transitionDuration: i === 0 ? 0 : 500, transitionType: 'match', hideAfter: 0, tie: false, stinger: { enabled: false, name: 'Stinger 1', cutPointMs: 250, audio: true }, dve: { preset: 'fullscreen', x: 0, y: 0, width: 1920, height: 1080, opacity: 1 } })),
  inputs: scenes,
};
const state = {
  connected: true, preset: settings.preset, program: 'CAM 1', preview: 'CAM 2', recording: false, streaming: false,
  inputs: scenes.map((name, i) => ({ name, number: i + 1, key: `uuid-${i + 1}` })), scenes,
  macros: { items: [{ id: 'm1', name: 'Abertura' }], events: ['program'], triggers: [], triggerStatus: {}, conditions: { fields: [] }, job: null, recording: null },
  controllers: { items: [], activators: [] }, globalHotkeys: { available: true }, gcLibrary: { items: [] },
};
const clients = new Set();
const broadcast = (message) => { for (const client of clients) if (client.readyState === 1) client.send(JSON.stringify(message)); };

const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((resolve) => { let data = ''; req.on('data', (c) => { data += c; }); req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } }); });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const routes = {
  '/': 'hub.html', '/hub': 'hub.html', '/configuracoes': 'configuracoes.html', '/settings': 'settings.html',
  '/replay': 'replay.html', '/overlays': 'overlays.html', '/multiview': 'multiview.html', '/atalhos': 'atalhos.html',
  '/macros': 'macros.html', '/recuperacao': 'recuperacao.html', '/diagnosticos': 'diagnosticos.html', '/atualizacao': 'atualizacao.html',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, ORIGIN);
  const p = url.pathname;
  try {
    if (p === '/api/settings') return json(res, 200, { success: true, settings, preset: settings.preset });
    if (p === '/api/outputs') return json(res, 200, { success: true, outputs });
    if (p === '/api/workspace') return json(res, 200, { success: true, workspace });
    if (p === '/api/json') return json(res, 200, { ...state, video: settings.video });
    if (p === '/api/replay') return json(res, 200, { success: true, replay });
    if (p === '/api/overlays') return json(res, 200, { success: true, ...overlays });
    if (p === '/api/multiview') return json(res, 200, { success: true, activeLayout: 'horizontal_16_9_standard', safeZones: { enabled: true } });
    if (p === '/api/diagnostics' && req.method === 'POST') return json(res, 200, { success: true, id: 'qa', name: '3mix-qa.zip', size: 2097152, report: { logs: ['api.log', 'engine.log'] } });
    if (p === '/api/diagnostics/preview') return json(res, 200, { success: true, text: 'Prévia de teste local. Nenhum log real do operador.' });
    if (p === '/api/diagnostics/download') { res.writeHead(200, { 'Content-Type': 'application/zip' }); return res.end('PK'); }
    if (p === '/api/effects-frame') { res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' }); return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#101418"/><rect x="24" y="24" width="592" height="312" fill="none" stroke="#39434d"/><text x="320" y="184" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="20" fill="#7f8a95">PRÉVIA SIMULADA · QA</text></svg>'); }
    if (p === '/api/preview') { res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' }); return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#101418"/></svg>'); }
    if (p === '/api/control') {
      const d = await readBody(req);
      if (d.action === 'update_read' || d.action === 'update_configure' || d.action === 'update_check' || d.action === 'update_download') {
        return json(res, 200, { success: true, update: { status: 'unconfigured', message: 'Nenhum feed configurado nesta fixture.', url: '', currentVersion: '0.0.0-qa' } });
      }
      if (String(d.action).startsWith('recovery_')) {
        const recovery = d.action === 'recovery_list' ? { items: [], session: { enabled: true, intervalSeconds: 60, retention: 20 } } : { enabled: true, intervalSeconds: 60, retention: 20 };
        return json(res, 200, { success: true, recovery });
      }
      if (String(d.action).startsWith('settings_')) return json(res, 200, { success: true, settings });
      return json(res, 200, { success: true, state, recovery: { items: [], session: {} } });
    }
    if (p === '/api/panel-open' || p === '/api/panel-close' || p === '/api/panel-title') return json(res, 200, { success: true });
    if (p === '/api/pair') return json(res, 200, { success: true });
    if (p === '/api/access') return json(res, 200, { success: true, pin: '123456', urls: [`${ORIGIN}/`] });
    if (p === '/api/qr.svg') { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#fff"/><rect x="8" y="8" width="80" height="80" fill="#111"/></svg>'); }
    if (p === '/fixture/state') {
      const recording = url.searchParams.get('recording') === '1';
      state.recording = recording;
      broadcast({ type: 'state', data: state });
      return json(res, 200, { success: true, state });
    }
    if (p === '/favicon.ico') { res.writeHead(204); return res.end(); }

    const file = p === '/replay' && url.searchParams.get('view') === 'settings'
      ? 'replay-settings.html'
      : routes[p] || p.replace(/^\//, '');
    const target = path.resolve(PANEL, file);
    if (!target.startsWith(PANEL)) { res.writeHead(403); return res.end(); }
    let data = await fs.readFile(target).catch(() => null);
    if (!data) { res.writeHead(404); return res.end('not found'); }
    if (path.extname(target) === '.html' && ['/configuracoes', '/settings'].includes(p)) {
      let html = data.toString('utf8');
      html = html.replace('</head>', `<style>#qa-ambiente-teste{position:fixed;top:0;right:0;z-index:2147483647;background:#dca900;color:#171717;font:800 10px/1.2 "Segoe UI",sans-serif;padding:3px 8px;border-radius:0 0 0 4px;pointer-events:none;letter-spacing:.3px}</style></head>`)
        .replace('</body>', `<div id="qa-ambiente-teste">AMBIENTE DE TESTE</div></body>`);
      data = Buffer.from(html, 'utf8');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch (e) { json(res, 500, { success: false, error: e.message }); }
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, ORIGIN).pathname !== '/ws') { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: 'init', data: state }));
    ws.on('close', () => clients.delete(ws));
  });
});
server.listen(PORT, '127.0.0.1', () => console.log('FIXTURE_READY ' + ORIGIN));
