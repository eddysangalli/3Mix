// Offline fixture for the Replay main-window visual pass.
// Serves the real painel files (with the same root/remoto fallback as the
// production panel server) and answers Replay/JSON routes so every operational
// state can be inspected without the installed engine or capture hardware.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const PANEL = path.resolve(import.meta.dirname, '../../painel');
const PORT = Number(process.argv[2] || 8795);

const frame = (label, hue = 210, sub = '') => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue} 18% 20%)"/><stop offset="1" stop-color="hsl(${hue} 22% 10%)"/></linearGradient></defs>
  <rect width="640" height="360" fill="url(#g)"/>
  <g fill="none" stroke="#ffffff" stroke-opacity=".22" stroke-width="2">
    <rect x="28" y="28" width="584" height="304"/><line x1="320" y1="28" x2="320" y2="332"/><circle cx="320" cy="180" r="54"/>
  </g>
  <rect x="24" y="24" width="180" height="42" fill="#000" fill-opacity=".45"/>
  <text x="40" y="52" fill="#fff" font-family="Segoe UI, sans-serif" font-size="22" font-weight="700">${label}</text>
  <text x="600" y="52" text-anchor="end" fill="#fff" fill-opacity=".7" font-family="Segoe UI, sans-serif" font-size="16">${sub}</text>
</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
};

const clips = [
  { cam: 'CAM 1 Principal', file: 'D:/gravacoes/cam1.mp4', duration: 9.4, available: true },
  { cam: 'CAM 2 Lateral Dir', file: 'D:/gravacoes/cam2.mp4', duration: 9.4, available: true },
  { cam: 'CAM 3 Atrás Gol', file: 'D:/gravacoes/cam3.mp4', duration: 9.4, available: true },
  { cam: 'CAM 4 Lateral Esq', file: 'D:/gravacoes/cam4.mp4', duration: 9.4, available: true },
];
const events = [
  { id: 'e1', name: 'Gol de empate · 2º tempo', category: 'Gol', time: '19:29:42', dur: 9.4, cam: 'CAM 1 Principal', available: true, clips },
  { id: 'e2', name: 'Defesa do goleiro', category: 'Defesa', time: '19:27:10', dur: 6.2, cam: 'CAM 1 Principal', available: true, clips: clips.map(c => ({ ...c, duration: 6.2 })) },
  { id: 'e3', name: 'Falta lateral', category: 'Falta', time: '19:22:03', dur: 4.8, cam: 'CAM 3 Atrás Gol', clips: clips.map((c, i) => ({ ...c, duration: 4.8, available: i !== 3 })), available: true },
  { id: 'e4', name: 'Ataque pela direita', category: 'Lance', time: '19:18:55', dur: 12.1, cam: 'CAM 2 Lateral Dir', clips: clips.map(c => ({ ...c, duration: 12.1, available: false })), available: false },
];
const history = { sessionId: 'fixture-1', start: 0, end: 600.4, recording: true, cameras: ['CAM 1 Principal', 'CAM 2 Lateral Dir', 'CAM 3 Atrás Gol', 'CAM 4 Lateral Esq'], frameRate: '30000/1001' };
const commands = [];
const state = {
  rec: true,
  speed: 50,
  activePlayer: 'A',
  events,
  players: {
    A: { eventId: 'e1', cam: 'CAM 1 Principal', file: 'D:/gravacoes/cam1.mp4', duration: 9.4, available: true, mediaCursor: 3120, mediaDuration: 9400, mediaState: 'OBS_MEDIA_STATE_PAUSED' },
    B: { eventId: 'e2', cam: 'CAM 2 Lateral Dir', file: 'D:/gravacoes/cam-ausente.mp4', duration: 6.2, available: false, mediaCursor: 0, mediaDuration: 6200, mediaState: 'OBS_MEDIA_STATE_NONE' },
  },
  markIn: null,
  session: { id: 'fixture-1', startedAt: Date.now() - 1458000, cams: [{ name: 'CAM 1 Principal' }, { name: 'CAM 2 Lateral Dir' }, { name: 'CAM 3 Atrás Gol' }, { name: 'CAM 4 Lateral Esq' }] },
  back: 'CAM 1 Principal',
  linked: true,
  cameraOptions: {},
  audioEnabled: true,
  retention: { minutes: 30, segmentSeconds: 60, enabled: true },
  historySupported: true,
  historyPlaybackSupported: false,
  programAutoplaySupported: true,
  playerIds: ['A', 'B', 'C', 'D'],
  backTransition: { name: 'Fade', durationMs: 500 },
  backAvailable: true,
  program: 'REPLAY A',
  preview: 'CAM 1 Principal',
  availableCams: ['CAM 1 Principal', 'CAM 2 Lateral Dir', 'CAM 3 Atrás Gol', 'CAM 4 Lateral Esq'],
};

const timecode = (seconds) => {
  const whole = Math.max(0, Math.floor(seconds));
  const pad = (n) => String(n).padStart(2, '0');
  return [pad(whole / 3600), pad((whole % 3600) / 60), pad(whole % 60), '00'].join(':');
};
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((resolve) => { let data = ''; req.on('data', (c) => { data += c; }); req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } }); });
const routes = {
  '/': 'remoto/replay.html',
  '/replay': 'remoto/replay.html',
  '/configuracoes': 'remoto/configuracoes.html',
  '/audio': 'remoto/audio.html',
};
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const p = url.pathname;
  try {
    if (p === '/api/replay') {
      if (req.method === 'POST') {
        const d = await readBody(req);
        commands.push({ at: Date.now(), ...d });
        if (d.action === 'load') {
          const event = events.find(e => e.id === d.eventId);
          const clip = event?.clips?.find(c => c.cam === d.cam) || event?.clips?.[0];
          if (event && clip) state.players[d.player] = { eventId: event.id, cam: clip.cam, file: clip.file, duration: event.dur, available: clip.available !== false, mediaCursor: 0, mediaDuration: event.dur * 1000, mediaState: 'OBS_MEDIA_STATE_PAUSED' };
        }
        if (d.action === 'unload') delete state.players[d.player];
        if (d.action === 'air') { state.program = 'REPLAY ' + (d.player || 'A'); }
        if (d.action === 'live') { state.program = state.back || 'CAM 1 Principal'; }
        if (d.action === 'transport') {
          const media = state.players[d.player];
          if (media) media.mediaState = d.command === 'PLAY' ? 'OBS_MEDIA_STATE_PLAYING' : 'OBS_MEDIA_STATE_PAUSED';
        }
        if (d.action === 'speed') state.speed = Number(d.speed);
        if (d.action === 'link') state.linked = !!d.enabled;
        if (d.action === 'history') return json(res, 200, { success: true, replay: { ...state, history } });
        if (d.action === 'history-quad') {
          const frames = (d.cams || history.cameras).map((cam, i) => ({ cam, image: frame(cam.replace(/ .*/, ''), 200 + i * 18, 'QUADRO ' + timecode(Number(d.cursor) || 0)) }));
          return json(res, 200, { success: true, replay: { ...state, history: { ...history, start: 0, end: 600.4 }, historyFrames: { cursor: Number(d.cursor) || 0, frames } } });
        }
        if (d.action === 'history-frame') return json(res, 200, { success: true, replay: { ...state, historyFrame: { cursor: Number(d.cursor) || 0, cam: d.cam, image: frame((d.cam || 'CAM').replace(/ .*/, ''), 205, 'QUADRO') } } });
        return json(res, 200, { success: true, replay: state });
      }
      return json(res, 200, { success: true, replay: state });
    }
    if (p === '/api/json') {
      return json(res, 200, {
        connected: true, preset: 'Futsal ao vivo', program: state.program, scenes: state.availableCams,
        stats: { availableDiskSpace: 334848 },
        inputs: [{ name: 'REPLAY A', key: 'uuid-replay-a', number: 1 }, { name: 'REPLAY B', key: 'uuid-replay-b', number: 2 }],
      });
    }
    if (p === '/api/effects-frame') {
      const label = url.searchParams.get('key') === 'uuid-replay-b' ? 'PLAYER B' : 'PLAYER A';
      const svg = frame(label, label.endsWith('B') ? 30 : 205, 'PREVIA DO PLAYER');
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' }); return res.end(decodeURIComponent(svg.split(',')[1]));
    }
    if (p === '/api/panel-open' || p === '/api/panel-close' || p === '/api/panel-title' || p === '/api/pair') return json(res, 200, { success: true });
    if (p === '/fixture/commands') return json(res, 200, { success: true, commands });
    if (p === '/favicon.ico') { res.writeHead(204); return res.end(); }
    const file = routes[p] || p.replace(/^\//, '');
    let target = path.join(PANEL, file);
    let data = await fs.readFile(target).catch(() => null);
    if (!data) {
      target = path.join(PANEL, 'remoto', file);
      data = await fs.readFile(target).catch(() => null);
    }
    if (!data || !target.startsWith(PANEL)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch (e) { json(res, 500, { success: false, error: e.message }); }
});
server.listen(PORT, '127.0.0.1', () => console.log('FIXTURE_READY http://127.0.0.1:' + PORT));
