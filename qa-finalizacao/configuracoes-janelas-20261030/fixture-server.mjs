// Offline fixture server for the 3Mix settings/external-outputs/recording/ISO/playout windows.
// It serves the real files from painel/remoto and answers the handful of API routes with a fixed production,
// so the pages can be exercised in a headless browser without the installed program or any real output.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const PANEL = path.resolve(import.meta.dirname, '../../painel/remoto');
const PORT = Number(process.argv[2] || 8791);

const native = (category, name, label, type, value, choices = '', min = 0, max = 0) => ({ category, name, label, type, value, choices, min, max, default: value });
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
      { id: 'obs_nvenc_hevc', label: 'NVIDIA NVENC HEVC', codec: 'hevc', protocols: ['rtmp', 'rtmps', 'hls'] },
    ],
    protocols: [{ id: 'rtmp', available: true }, { id: 'rtmps', available: true }, { id: 'hls', available: true }, { id: 'srt', available: false }],
    error: null,
  },
  nativePreferences: {
    error: null,
    fields: [
      native('audio', 'sampleRate', 'Taxa de amostragem (Hz)', 'string', '48000', '44100|48000'),
      native('audio', 'channels', 'Canais da produção', 'string', 'Stereo', 'Mono|Stereo|5.1'),
      native('audio', 'meterDecay', 'Decaimento dos medidores', 'number', 23.53, '', 1, 100),
      native('audio', 'lowLatency', 'Buffer de áudio com baixa latência', 'bool', false),
      native('general', 'snapDistance', 'Distância de encaixe (px)', 'number', 10, '', 0, 100),
      native('general', 'confirmExit', 'Confirmar ao fechar', 'bool', true),
      native('general', 'warnStartStream', 'Avisar ao iniciar transmissão', 'bool', true),
      native('general', 'warnStopRecord', 'Avisar ao parar gravação', 'bool', true),
      native('general', 'recordWhenStreaming', 'Gravar ao iniciar transmissão', 'bool', false),
      native('general', 'keepRecording', 'Continuar gravando ao parar transmissão', 'bool', false),
      native('general', 'replayWhileStreaming', 'Replay buffer ao transmitir', 'bool', false),
      native('general', 'keepReplay', 'Continuar buffer ao parar transmissão', 'bool', false),
      native('appearance', 'fontScale', 'Escala das fontes (motor)', 'integer', 10, '', -5, 50),
      native('appearance', 'density', 'Densidade dos controles', 'integer', 1, '', 0, 2),
      native('advanced', 'priority', 'Prioridade do processo', 'string', 'Normal', 'Normal|AboveNormal|High|BelowNormal|Idle'),
      native('advanced', 'colorFormat', 'Formato de cor', 'string', 'NV12', 'NV12|I420|I444|P010|BGRA'),
      native('advanced', 'colorSpace', 'Espaço de cor', 'string', '709', '601|709|sRGB|2100PQ|2100HLG'),
      native('advanced', 'colorRange', 'Faixa de cor', 'string', 'Partial', 'Partial|Full'),
      native('advanced', 'sdrWhiteLevel', 'Branco SDR (nits)', 'integer', 300, '', 80, 480),
      native('advanced', 'hdrPeakLevel', 'Pico nominal HDR (nits)', 'integer', 1000, '', 400, 10000),
      native('advanced', 'browserAcceleration', 'Aceleração de hardware do navegador', 'bool', true),
      native('advanced', 'hotkeyFocus', 'Atalhos conforme foco', 'string', 'NeverDisableHotkeys', 'NeverDisableHotkeys|DisableHotkeysInFocus|DisableHotkeysOutOfFocus'),
      native('performance', 'scaleType', 'Filtro de redução de imagem', 'string', 'bicubic', 'bilinear|bicubic|lanczos|area'),
      native('projectors', 'multiviewLayout', 'Layout do multiview', 'integer', 0, '', 0, 7),
      native('projectors', 'multiviewNames', 'Nomes no multiview', 'bool', true),
      native('files', 'filenamePattern', 'Padrão do nome do arquivo', 'text', '%CCYY-%MM-%DD %hh-%mm-%ss'),
      native('files', 'overwriteFiles', 'Sobrescrever arquivo existente', 'bool', false),
      native('files', 'autoRemux', 'Remux automático para MP4', 'bool', false),
      native('networkOutput', 'reconnectEnabled', 'Reconectar automaticamente', 'bool', true),
      native('networkOutput', 'reconnectDelay', 'Espera entre reconexões (s)', 'integer', 2, '', 1, 120),
      native('outputAdvanced', 'mode', 'Modo de saída', 'string', 'Simple', 'Simple|Advanced'),
      native('outputAdvanced', 'recordTracks', 'Trilhas da gravação (máscara)', 'integer', 3, '', 1, 63),
      native('outputAdvanced', 'recordSplit', 'Dividir arquivos da gravação', 'bool', true),
      native('outputAdvanced', 'recordSplitType', 'Divisão por', 'string', 'Time', 'Time|Size|Manual'),
      native('outputAdvanced', 'recordSplitMinutes', 'Novo arquivo a cada (min)', 'integer', 15, '', 1, 1440),
      native('outputAdvanced', 'recordSplitMegabytes', 'Tamanho por arquivo (MB)', 'integer', 2048, '', 1, 1048576),
      native('outputAdvanced', 'streamRescaleSize', 'Resolução da transmissão (LxA)', 'text', '1920x1080'),
      ...[1, 2, 3, 4, 5, 6].flatMap((n) => [native('audioTracks', `track${n}Name`, `Nome da trilha ${n}`, 'text', n === 1 ? 'Master' : n === 2 ? 'N-1' : ''), native('audioTracks', `track${n}Bitrate`, `Trilha ${n} · bitrate (kbps)`, 'string', '160', '96|128|160|192|256|320')]),
    ],
  },
  stats: { cpuUsage: 12.5, memoryUsage: 512.3, activeFps: 29.97, renderSkippedFrames: 0, renderTotalFrames: 12000, outputSkippedFrames: 1, outputTotalFrames: 11999, availableDiskSpace: 524288 },
  virtualCamera: false,
  preset: 'Futsal ao vivo',
};

const destinations = [0, 1, 2, 3].map((n) => ({
  name: n ? `Destino ${n + 1}` : 'Destino 1', server: n === 1 ? 'rtmp://live.example/app' : '', hasKey: false, protocol: 'auto', mode: 'program', mixId: 2,
  width: n === 1 ? 1280 : 1920, height: n === 1 ? 720 : 1080, bitrate: n === 1 ? 2500 : 6000, audioTrack: 0, audioSourceUuid: '', encoder: 'obs_x264',
  fpsDivisor: 1, overlaysMask: 0, fill: false, stingerAudio: true, enhancedRtmp: false, enabled: !!n, autoStart: false, active: false, state: 'idle', error: '',
}));
const outputs = {
  destinations,
  encoders: [{ id: 'obs_x264', name: 'x264', codec: 'h264' }, { id: 'obs_nvenc_h264', name: 'NVENC H.264', codec: 'h264' }],
  audioSources: [{ uuid: '11111111-1111-1111-1111-111111111111', name: 'Bus principal' }],
  ndi: { available: true, alphaSupported: false, fillKeySupported: false, senders: [] },
  omt: { available: true, alphaSupported: true, fillKeySupported: true, pa16Supported: true, senders: [] },
};
const scenes = ['CAM 1', 'CAM 2', 'VT 1', 'PLACAR', 'REPLAY A', 'FreeMix Barramentos'];
const iso = {
  rec: false, availableCams: scenes, recordOptions: { format: 'mpegts', directory: '', prefix: 'cam', encoder: 'default', crf: 23, audio: 'input', audioSourceUUID: '', splitSeconds: 0, width: 0, height: 0, fpsDivisor: 1, bitrate: 0, perInput: {} },
  audioChoices: [{ key: '11111111-1111-1111-1111-111111111111', name: 'CAM 1' }], audioBusSourceSupported: false,
  audioSourceLimit: 'Fonte direta exige folha pública com trilha 1 habilitada.', session: null,
};
const playoutItems = [
  { id: 'i1', title: 'Abertura', file: 'D:/midia/abertura.mp4', inMs: 0, outMs: 15000, durationMs: 15000, transitionIn: 'fade', transitionMs: 500, endBehavior: 'play_next', audioGainDb: 0 },
  { id: 'i2', title: 'VT Gols', file: 'D:/midia/gols.mp4', inMs: 2000, outMs: 42000, durationMs: 40000, transitionIn: 'cut', transitionMs: 500, endBehavior: 'freeze', audioGainDb: -3 },
  { id: 'i3', title: 'Encerramento', file: 'D:/midia/fim.mp4', inMs: 0, outMs: 0, durationMs: 8000, transitionIn: 'fade', transitionMs: 700, endBehavior: 'loop', audioGainDb: 0 },
];
const playout = {
  activeListId: 'l1',
  lists: [{ id: 'l1', name: 'Bloco 1', itemCount: 3, loop: false, autoAdvance: true }],
  activeList: { id: 'l1', name: 'Bloco 1', items: playoutItems, loop: false, autoAdvance: true, transition: 'fade', fadeMs: 500 },
  program: { item: null, status: 'stopped', positionMs: 0, durationMs: 0, remainingMs: 0, loop: false, endBehavior: 'play_next', audioGainDb: 0 },
  preview: { item: playoutItems[1], preloadState: 'ready', preloadDurationMs: 120, transition: 'fade', transitionMs: 500 },
  automation: { active: true, currentIndex: -1, autoAdvance: true },
};
const rundown = { running: false, automation: { armed: false, willAutoAdvance: false, currentMode: 'wait_operator' } };
const workspace = { revision: 3, cardWidth: 180, sideWidth: 320, audioLeft: false, modulesStacked: false };
let lastPlayoutCommands = [];

const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((resolve) => { let data = ''; req.on('data', (c) => { data += c; }); req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } }); });
const routes = { '/': 'hub.html', '/hub': 'hub.html', '/configuracoes': 'configuracoes.html', '/settings': 'configuracoes.html', '/gravar': 'gravar.html', '/externo': 'externo.html', '/iso': 'iso.html', '/multicorder': 'multicorder.html', '/playout': 'playout.html' };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const p = url.pathname;
  try {
    if (p === '/api/settings') return json(res, 200, { success: true, settings, preset: settings.preset });
    if (p === '/api/outputs') return json(res, 200, { success: true, outputs });
    if (p === '/api/workspace') {
      if (req.method === 'POST') { const d = await readBody(req); if (d.expectedRevision !== workspace.revision) return json(res, 409, { success: false, error: 'Conflito de revisão' }); Object.assign(workspace, { revision: workspace.revision + 1, cardWidth: d.cardWidth, sideWidth: d.sideWidth, audioLeft: d.audioLeft, modulesStacked: d.modulesStacked }); return json(res, 200, { success: true, workspace }); }
      return json(res, 200, { success: true, workspace });
    }
    if (p === '/api/json') return json(res, 200, { connected: true, preset: settings.preset, video: settings.video, program: 'CAM 1', inputs: [{ name: 'CAM 1', key: 'uuid-1', number: 1 }, { name: 'CAM 2', key: 'uuid-2', number: 2 }], scenes });
    if (p === '/fixture/rundown') { const on = url.searchParams.get('on') === '1'; rundown.running = on; rundown.automation = { armed: on, willAutoAdvance: on, currentMode: on ? 'media_end' : 'wait_operator' }; return json(res, 200, { success: true, rundown }); }
    if (p === '/fixture/last') return json(res, 200, { success: true, commands: lastPlayoutCommands });
    if (p === '/api/iso') {
      if (req.method === 'POST') {
        const d = await readBody(req);
        if (d.action === 'configure') Object.assign(iso.recordOptions, d.options || {});
        if (d.action === 'start') {
          if (Array.isArray(d.cams) && d.cams.includes('PLACAR')) return json(res, 400, { success: false, error: 'A câmera PLACAR não produziu vídeo no disco. Confira o codificador e a entrada.' });
          iso.rec = true; iso.session = { id: 's1', startedAt: Date.now(), dir: 'D:/gravacoes/iso/s1', cams: d.cams.map((name, i) => ({ name, file: `D:/gravacoes/iso/s1/cam-${i + 1}.ts`, options: iso.recordOptions })), options: iso.recordOptions };
        }
        if (d.action === 'stop') { iso.rec = false; }
        if (d.action === 'recover') { /* nothing */ }
      }
      return json(res, 200, { success: true, iso });
    }
    if (p === '/api/playout') {
      if (req.method === 'POST') {
        const d = await readBody(req);
        lastPlayoutCommands.push(d);
        if (d.action === 'playout_preview_clip') {
          const item = playoutItems.find((i) => i.id === d.itemId);
          if (item) playout.preview = { ...playout.preview, item, preloadState: 'ready', preloadDurationMs: 80 };
        }
        if (['playout_take', 'playout_next'].includes(d.action)) {
          const id = d.itemId || playoutItems[Math.min(playoutItems.length - 1, (playout.automation.currentIndex + 1))].id;
          const idx = playoutItems.findIndex((i) => i.id === id);
          playout.automation.currentIndex = idx;
          playout.program = { item: playoutItems[idx], status: 'playing', positionMs: 0, durationMs: playoutItems[idx].outMs - playoutItems[idx].inMs || playoutItems[idx].durationMs, remainingMs: 1000, loop: false, endBehavior: playoutItems[idx].endBehavior, audioGainDb: playoutItems[idx].audioGainDb, startedAt: Date.now() };
        }
        if (d.action === 'playout_stop') { playout.program = { item: null, status: 'stopped', positionMs: 0, durationMs: 0, remainingMs: 0, loop: false, endBehavior: 'play_next', audioGainDb: 0 }; }
        if (d.action === 'playout_item_update') { const item = playoutItems.find((i) => i.id === d.itemId); if (item) for (const k of ['endBehavior', 'inMs', 'outMs', 'audioGainDb', 'loop']) if (d[k] !== undefined) item[k] = d[k]; }
        if (d.action === 'playout_save_playlist' && d.items) playout.activeList.items = d.items;
      }
      return json(res, 200, { success: true, playout });
    }
    if (p === '/api/rundown') return json(res, 200, { success: true, ...rundown });
    if (p === '/api/effects-frame') { res.writeHead(404); return res.end(); }
    if (p === '/api/control') {
      const d = await readBody(req);
      if (d.action === 'outputs_get') return json(res, 200, { success: true, outputs });
      if (d.action === 'outputs_network') {
        const proto = String(d.protocol || '').toLowerCase(), senders = outputs[proto]?.senders || [];
        let sender = senders.find((s) => s.senderId === d.senderId);
        if (d.command === 'stop') { if (sender) { sender.active = false; sender.outputActive = false; } }
        else {
          if (!sender) { sender = { senderId: d.senderId }; senders.push(sender); }
          Object.assign(sender, { active: true, outputActive: true, networkName: d.name, mode: d.mode, width: 1920, height: 1080, alpha: !!d.alpha, fillKey: !!d.fillKey, precisionBits: d.precisionBits, groups: d.groups, connections: 1, capturedFrames: 240, sourceUuid: d.input, audioTrack: d.audioTrack, audioSourceUuid: d.audioSourceUuid });
        }
        return json(res, 200, { success: true, outputs });
      }
      if (d.action === 'settings_apply') {
        if (d.category === 'display') Object.assign(settings.video, { baseWidth: d.baseWidth, baseHeight: d.baseHeight, outputWidth: d.outputWidth, outputHeight: d.outputHeight });
        if (d.category === 'recording') { settings.recordDirectory = d.directory; Object.assign(settings.values, { RecFormat2: d.format, RecQuality: d.quality, RecEncoder: d.encoder }); }
        if (d.category === 'advanced') { for (const f of settings.nativePreferences.fields.filter((f) => f.category === 'advanced')) if (d[f.name] !== undefined) f.value = d[f.name]; return json(res, 200, { success: true, settings: { ...settings, requiresRestart: true } }); }
        return json(res, 200, { success: true, settings });
      }
      if (d.action === 'settings_defaults') return json(res, 200, { success: true, settings: { category: d.category, draft: d.category === 'display' ? { baseWidth: 1920, baseHeight: 1080, outputWidth: 1920, outputHeight: 1080, fps: 30, reflow: true } : {} } });
      if (d.action === 'settings_export') return json(res, 200, { success: true, settings: { document: { format: 'FreeMix Settings', schema: 1, category: d.category, values: {} } } });
      if (d.action === 'settings_import') return json(res, 200, { success: true, settings: { category: d.category, draft: d.document?.values || {} } });
      if (d.action === 'settings_encoder_read') return json(res, 200, { success: true, settings: { label: 'x264', encoder: 'obs_x264', revision: 'a'.repeat(64), advancedMode: true, fields: [{ name: 'rate_control', label: 'Controle de taxa', type: 'list', value: 'CBR', choices: [{ value: 'CBR', label: 'CBR' }, { value: 'VBR', label: 'VBR' }], enabled: true, visible: true, supported: true, group: 'Taxa' }] } });
      if (d.action === 'settings_native') return json(res, 200, { success: true });
      return json(res, 200, { success: true });
    }
    if (p === '/api/panel-open' || p === '/api/panel-close' || p === '/api/panel-title') return json(res, 200, { success: true });
    if (p === '/api/pair') return json(res, 200, { success: true });
    const file = routes[p] || p.replace(/^\//, '');
    const target = path.join(PANEL, file);
    if (!target.startsWith(PANEL)) { res.writeHead(403); return res.end(); }
    const data = await fs.readFile(target).catch(() => null);
    if (!data) { res.writeHead(404); return res.end('not found'); }
    let body = data;
    if (path.extname(target) === '.html') {
      // A fixture page is a QA page: its own title and an unmistakable test banner, injected only in this response.
      let html = data.toString('utf8');
      if (!html.includes('qa-ambiente-teste')) {
        html = html
          .replace(/<title>([^<]*)<\/title>/, (m, t) => `<title>3Mix QA — ${t.replace(/^3Mix QA — /, '')}</title>`)
          .replace('</head>', `<style>#qa-ambiente-teste{position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:2147483647;background:#dca900;color:#171717;font:800 10.5px/1.2 "Segoe UI",sans-serif;padding:3px 12px;border-radius:0 0 4px 4px;box-shadow:0 2px 8px rgba(0,0,0,.55);pointer-events:none;letter-spacing:.35px;white-space:nowrap}#qa-ambiente-teste b{font-weight:900}</style></head>`)
          .replace('</body>', `<script>(()=>{const add=()=>{if(!document.getElementById('qa-ambiente-teste')){const d=document.createElement('div');d.id='qa-ambiente-teste';d.innerHTML='<b>AMBIENTE DE TESTE</b> · fixture local · não é a instalação do operador';document.documentElement.appendChild(d);}const t=document.title.replace(/^3Mix QA — /,'');if(!document.title.startsWith('3Mix QA — '))document.title='3Mix QA — '+t;};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',add);else add();setInterval(add,800);})();</script></body>`);
      }
      body = Buffer.from(html, 'utf8');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch (e) { json(res, 500, { success: false, error: e.message }); }
});
server.listen(PORT, '127.0.0.1', () => console.log('FIXTURE_READY http://127.0.0.1:' + PORT));
