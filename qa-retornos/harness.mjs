// QA da janela Retornos de Externa SRT & N-1 — servidor de prévia com API simulada.
// Não é motor: replica fielmente o contrato real de /api/return-feeds
// (ReturnFeedManager.summary + execute), capturado em qa-audio/fixtures, e
// confirma comandos para validar a interface. Não grava em disco (o motor real
// persiste; aqui o estado vive só em memória do processo QA).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const panelRoot = join(here, '..', 'painel');
const PORT = Number(process.env.RET_QA_PORT || 8779);
process.on('uncaughtException', error => console.error('QA exceção:', error.message));

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8'
};

const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

/* Estado de retorno — mesma forma do motor real:
   ReturnFeedManager.summary() => { activeFeedsCount, feeds: [{id,name,videoSource,
   audioMode,nMinusExclude,port,status,connectedClients,stats{rttMs,packetLossPercent,
   sendRateMbps,uptimeSeconds}}] }
   valores reais de videoSource: 'clean'|'program'|'preview'|'input'
   valores reais de audioMode:  'n-1'|'master'|'bus_a'|'bus_b'
   status reais: 'stopped'|'running' (o motor hoje não emite 'error'; o feed
   return-4 existe apenas para exercer o visual de erro). */
const feeds = new Map([
  ['return-1', {
    id: 'return-1', name: 'Retorno 1 (Repórter Principal)', videoSource: 'clean',
    videoInput: null, audioMode: 'n-1', nMinusExclude: null, protocol: 'srt',
    mode: 'listener', port: 9998, latencyMs: 300, bitrateKbps: 2500, fps: 30,
    status: 'stopped', connectedClients: 0,
    stats: { rttMs: 0, packetLossPercent: 0, sendRateMbps: 0, uptimeSeconds: 0 }
  }],
  ['return-2', {
    id: 'return-2', name: 'Retorno 2 (Repórter Táxi)', videoSource: 'program',
    videoInput: null, audioMode: 'master', nMinusExclude: null, protocol: 'srt',
    mode: 'listener', port: 9999, latencyMs: 120, bitrateKbps: 2500, fps: 30,
    status: 'running', connectedClients: 1,
    stats: { rttMs: 34, packetLossPercent: 0, sendRateMbps: 2.4, uptimeSeconds: 812 }
  }],
  ['return-3', {
    id: 'return-3', name: 'Retorno 3 (Estúdio B)', videoSource: 'clean',
    videoInput: null, audioMode: 'n-1', nMinusExclude: 'Retorno 3 (Estúdio B)', protocol: 'srt',
    mode: 'listener', port: 9002, latencyMs: 150, bitrateKbps: 2500, fps: 30,
    status: 'running', connectedClients: 2,
    stats: { rttMs: 21, packetLossPercent: 0.2, sendRateMbps: 2.5, uptimeSeconds: 1440 }
  }],
  ['return-4', {
    id: 'return-4', name: 'Retorno 4 (Convidado Externo)', videoSource: 'program',
    videoInput: null, audioMode: 'master', nMinusExclude: null, protocol: 'srt',
    mode: 'listener', port: 9003, latencyMs: 120, bitrateKbps: 2500, fps: 30,
    status: 'error', connectedClients: 0,
    stats: { rttMs: 0, packetLossPercent: 0, sendRateMbps: 0, uptimeSeconds: 0 }
  }]
]);

// RTT vivo em QA apenas para exercer o texto; o painel lê de stats como no motor.
function animateStats() {
  const t = Date.now() / 1000;
  for (const feed of feeds.values()) {
    if (feed.status === 'running' && feed.stats.rttMs > 0) {
      feed.stats.rttMs = Math.round(18 + 14 * (0.5 + 0.5 * Math.sin(t * 0.9 + feed.port)));
    }
  }
}

const summary = () => ({
  activeFeedsCount: [...feeds.values()].filter(f => f.status === 'running').length,
  feeds: [...feeds.values()].map(f => ({
    id: f.id, name: f.name, videoSource: f.videoSource, audioMode: f.audioMode,
    nMinusExclude: f.nMinusExclude, port: f.port, status: f.status,
    connectedClients: f.connectedClients, stats: f.stats
  }))
});

/* Comportamento idêntico ao ReturnFeedManager.execute do motor. */
function execute(action, d = {}) {
  const feedId = d.feedId || d.id || 'return-1';
  if (action === 'return_feed_start') {
    const feed = feeds.get(feedId);
    if (!feed) throw Error(`Canal de retorno não encontrado: ${feedId}`);
    feed.status = 'running';
    feed.connectedClients = 1;
    feed.stats.rttMs = feed.stats.rttMs || 30;
    return { success: true, message: `Retorno "${feed.name}" ativo em srt://127.0.0.1:${feed.port}?mode=listener`, feed };
  }
  if (action === 'return_feed_stop') {
    const feed = feeds.get(feedId);
    if (!feed) throw Error(`Canal de retorno não encontrado: ${feedId}`);
    feed.status = 'stopped';
    feed.connectedClients = 0;
    feed.stats = { rttMs: 0, packetLossPercent: 0, sendRateMbps: 0, uptimeSeconds: 0 };
    return { success: true, feed };
  }
  if (action === 'return_feed_configure') {
    let feed = feeds.get(feedId);
    if (!feed) {
      feed = {
        id: feedId,
        name: d.name || `Retorno ${feeds.size + 1}`,
        videoSource: d.videoSource || 'clean',
        videoInput: d.videoInput || null,
        audioMode: d.audioMode || 'n-1',
        nMinusExclude: d.nMinusExclude || null,
        protocol: 'srt', mode: 'listener',
        port: Number(d.port || (9998 + feeds.size)),
        latencyMs: Number(d.latencyMs || 300),
        bitrateKbps: Number(d.bitrateKbps || 2500),
        fps: Number(d.fps || 30),
        status: 'stopped', connectedClients: 0,
        stats: { rttMs: 0, packetLossPercent: 0, sendRateMbps: 0, uptimeSeconds: 0 }
      };
      feeds.set(feedId, feed);
    } else {
      if (d.name !== undefined) feed.name = d.name;
      if (d.videoSource !== undefined) feed.videoSource = d.videoSource;
      if (d.videoInput !== undefined) feed.videoInput = d.videoInput;
      if (d.audioMode !== undefined) feed.audioMode = d.audioMode;
      if (d.nMinusExclude !== undefined) feed.nMinusExclude = d.nMinusExclude;
      if (d.port !== undefined) feed.port = Number(d.port);
      if (d.latencyMs !== undefined) feed.latencyMs = Number(d.latencyMs);
    }
    return { success: true, feed };
  }
  if (action === 'return_feed_summary') return summary();
  throw Error(`Ação de return feed não reconhecida: ${action}`);
}

const commands = [];

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  let body = '';
  if (req.method === 'POST') {
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) return send(res, 413, { success: false, error: 'corpo grande' });
    }
  }
  try {
    if (url.pathname === '/api/return-feeds') {
      if (req.method === 'GET') { animateStats(); return send(res, 200, { success: true, ...summary() }); }
      if (req.method === 'POST') {
        let d = {};
        try { d = JSON.parse(body || '{}'); } catch { return send(res, 400, { success: false, error: 'JSON inválido' }); }
        commands.push({ action: d.action, data: d, at: new Date().toISOString() });
        const result = execute(d.action, d);
        return send(res, 200, { success: true, result, ...summary() });
      }
      return send(res, 405, { success: false, error: 'Método não suportado' });
    }
    if (url.pathname === '/api/json') return send(res, 200, { connected: true, preset: 'Externa · QA', returnFeeds: summary() });
    if (url.pathname === '/api/panel-title') return send(res, 200, { success: true });
    if (url.pathname === '/api/panel-close') return send(res, 200, { success: true });
    if (url.pathname === '/api/qa-state') return send(res, 200, { commands, returnFeeds: summary() });
    if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }

    let path = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!path) path = 'remoto/retornos.html';
    if (!path.includes('/')) path = 'remoto/' + path;
    if (!extname(path)) path += '.html';
    if (path.includes('..')) return send(res, 403, 'forbidden', 'text/plain');
    // A linha de base serve a cópia original da página (backup em qa-retornos).
    if (path === 'remoto/retornos-antes.html') path = 'retornos.orig.anteshash.html';
    const file = path.startsWith('retornos.orig')
      ? join(here, path)
      : join(panelRoot, path);
    let data = await readFile(file);
    // Marca visível para nunca ser confundida com a instalação do operador.
    if (path.endsWith('retornos.html')) {
      let html = data.toString('utf8');
      html = html.replace(/<title>[^<]*<\/title>/, '<title>3Mix QA — Retornos (motor simulado)</title>');
      html = html.replace('</head>', '<style>.qa-badge{position:fixed;bottom:50px;left:8px;z-index:99;display:inline-flex;height:20px;padding:0 8px;align-items:center;border:1px solid #7a642c;background:#2f2815;color:#e6cf8a;border-radius:3px;font:700 10px "Segoe UI";letter-spacing:.6px}</style></head>');
      html = html.replace('</body>', '<span class="qa-badge" aria-hidden="true">AMBIENTE DE TESTE</span></body>');
      data = Buffer.from(html, 'utf8');
    }
    return send(res, 200, data, types[extname(file)] || 'application/octet-stream');
  } catch (error) {
    return send(res, 400, { success: false, error: error.message });
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`QA Retornos 3Mix em http://127.0.0.1:${PORT}/retornos.html`);
});
