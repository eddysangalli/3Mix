import { execFile } from 'node:child_process';
// Multi-M/E (mix-effects) is still in qualification and may not exist in the installed
// runtime yet. The import is optional so copying this controller file to a runtime that
// lacks the module cannot break the API boot; the route is simply not registered.
let handleMixEffects = null;
import { handleDiagnostico } from './diagnostico-http.mjs';
import { copySceneCollectionOnDisk, listProjectTemplates, saveProjectTemplate, getProjectTemplate, deleteProjectTemplate, applyProjectTemplateToCollection } from './projetos-copia.mjs';
try { ({ handleMixEffects } = await import('./mix-effects-http.mjs')); } catch { }
// Frente 3MIX STUDIO & SOCIAL (chroma, estúdio virtual, social). Mesmo contrato opcional:
// um runtime sem estes arquivos sobe normalmente, apenas sem as três trilhas.
let handleStudioSocial = null;
try { ({ handleStudioSocial } = await import('./studio-social-http.mjs')); } catch { }
import { createProjectHttpDispatcher, readProjectBody, admitProjectNativeEvent, admitProjectSocketMessage } from './projetos/runtime-admission.mjs';
import { readOutputsSnapshot } from './read-outputs-snapshot.mjs';
import { handleSettingsRead } from './settings-read-http.mjs';
import { handleWorkspaceRequest } from './workspace-config.mjs';
import { modulosAtivos, salvarModulosAtivos, validarModulos, listarDefinicaoModulos } from './modulos-config.mjs';
import { TickerAckBroker, readTickerAckRequest } from './gtzip-ticker-ack.mjs';
// 3Mix control bridge. Commands use confirmed production operations.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { randomBytes, randomInt, timingSafeEqual, createHash } from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { connect } from './obsws.mjs';
import { DiskReplay } from './replay-disco.mjs';
import { Production, xml } from './controle-producao.mjs';
import { OnlineUpdateEngine } from './atualizacao-online.mjs';
import { DiagnosticCollector, registrarErroPainel } from './diagnostico-producao.mjs';
import { diskReport, mapaMultiCorder, estimativaMultiCorder, testeEscritaConcorrente, BROADCAST_PROFILES } from './disco-producao.mjs';
import { readDiagnosticZip } from './diagnostico-zip.mjs';
import { servePreviewMedia } from './midia-preview-http.mjs';
import { InputHealthEngine } from './telemetria-saude.mjs';
import { OutputWatchdogEngine } from './saidas-watchdog.mjs';
import { MultiViewEngine } from './multiview-engine.mjs';
import { AuxOutputRouter } from './aux-output-router.mjs';
import { VmixTcpServer } from './vmix-tcp-api.mjs';
import { ThumbsEngine } from './thumbs-engine.mjs';
import { CrewTallyEngine } from './crew-tally-producao.mjs';
import { AudioTapRegistry } from './audio-tap-registry.mjs';
import { CrewIntercomEngine } from './crew-intercom-producao.mjs';
import { CrewIntercomWsTransport } from './crew-intercom-transport-ws.mjs';
import { lerMontagens, salvarMontagens } from './multiview-montagens.mjs';
import { SlideEngine } from './apresentacao-slides.mjs';
import { LiveLanDistribution } from './livelan-distribuicao.mjs';

const ROOT = process.env.FREEMIX_ROOT || fileURLToPath(new URL('../', import.meta.url));
const PANEL = process.env.FREEMIX_PANEL_DIR || join(ROOT, 'painel'), PORT = Number(process.env.FREEMIX_API_PORT || 8088);
const installationId = createHash('sha256').update(resolve(ROOT).toLowerCase()).digest('hex');
const ips = () => Object.values(networkInterfaces()).flat().filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address);
const local = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const equal = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && timingSafeEqual(x, y); };
const token = randomBytes(32).toString('base64url'), pin = String(randomInt(100000, 1000000)), sessions = new Map(), attempts = new Map();
const accessDir = join(ROOT, 'config', 'obs-studio', 'plugin_config', 'freemix-control');
await mkdir(accessDir, { recursive: true }); await writeFile(join(accessDir, 'acesso.json'), JSON.stringify({ apiToken: token, pin, startedAt: Date.now() }), { mode: 0o600 });
let obs = null, reconnectTimer = null, stopping = false, connecting = false, connectionGeneration = 0, connectionReady = false, pollingGeneration = null;
const connectionErrors = {};
function connectionError(component, error) { const message = String(error?.message || error).replace(/(password|key|secret|token)\s*[:=]\s*[^\s,]+/gi, '$1=[omitido]').slice(0, 500), previous = connectionErrors[component]; connectionErrors[component] = { message, at: Date.now() }; if (previous?.message !== message || Date.now() - previous.at > 30000) console.error(`3Mix: ${component}: ${message}`); }
// Errors shown to the operator use the 3Mix page, never the browser's default error screen.
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function sendErrorPage(res, status, requestUrl, detail) {
  try {
    const template = await readFile(join(ROOT, 'ferramentas', 'pagina-erro.html'), 'utf8');
    const page = template.replace(/%%ERROR_URL%%/g, escapeHtml(requestUrl)).replace(/%%ERROR_CODE%%/g, escapeHtml(detail));
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(page);
  } catch (e) {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('3Mix: ' + (detail || 'página indisponível') + '\n' + String(requestUrl || ''));
  }
}
const wantsHtml = req => String(req.headers?.accept || '').includes('text/html');
function scheduleConnection() { if (!stopping && !reconnectTimer) reconnectTimer = setTimeout(() => { reconnectTimer = null; startConnection(); }, 2000); }
const clients = new Set();
const broadcast = msg => { const s = JSON.stringify(msg); for (const c of clients) if (c.readyState === WebSocket.OPEN) c.send(s); if (msg?.type === 'state' && typeof vmixTcp !== 'undefined') vmixTcp.notifyTallyChange(); };
const production = new Production({ root: ROOT, panel: PANEL, getObs: () => obs, publish: data => broadcast({ type: 'state', data: clean(data) }), publishRaw: broadcast });
production.tryReq = (...args) => production.optional(...args);
production.gtTickerAck = new TickerAckBroker({ endpoint: 'http://127.0.0.1:' + PORT + '/api/ticker-ack' });
const slideEngine = new SlideEngine({ root: ROOT, production });
const liveLanDistribution = new LiveLanDistribution({ port: PORT });
const onlineUpdate = new OnlineUpdateEngine(ROOT);
const diagnostics = new DiagnosticCollector(ROOT);
// Retrato leve do programa para o pacote: valores simples, listas viram contagem.
const reduzirEstado = (v, nivel = 0) => { if (Array.isArray(v)) return v.length; if (v && typeof v === 'object') { if (nivel >= 2) return undefined; return Object.fromEntries(Object.entries(v).slice(0, 80).map(([k, x]) => [k, reduzirEstado(x, nivel + 1)]).filter(([, x]) => x !== undefined)); } return typeof v === 'string' ? v.slice(0, 200) : v; };
async function estadoParaDiagnostico() { const ler = async rota => { try { const r = await fetch('http://127.0.0.1:' + PORT + rota, { signal: AbortSignal.timeout(2500) }); return r.ok ? reduzirEstado(await r.json()) : { status: r.status }; } catch (e) { return { erro: String(e?.message || e).slice(0, 200) }; } }; return { saude: await ler('/api/health'), programa: await ler('/api/json'), saidas: await ler('/api/outputs') }; }
let errosPainelMinuto = 0; setInterval(() => { errosPainelMinuto = 0; }, 60000).unref();
// Toda tela do painel registra os próprios erros; GC e páginas que vão ao ar ficam de fora.
const TELA_COM_REGISTRO = /^(?:remoto[\\/][^\\/]+|[^\\/]+)\.html$/i;
function comRegistroDeErros(data) { const inicio = data.indexOf('<head'); if (inicio < 0) return data; const fim = data.indexOf('>', inicio); if (fim < 0) return data; return Buffer.concat([data.subarray(0, fim + 1), Buffer.from('<script src="/registro-erros.js"></script>'), data.subarray(fim + 1)]); }
const replay = new DiskReplay({ root: ROOT, getObs: () => obs, onChange: data => broadcast({ type: 'replay_state', data }) });
const iso = new DiskReplay({ root: ROOT, getObs: () => obs, filter: 'Gravação ISO', namespace: 'freemix-iso', recordingFolder: 'iso', onChange: data => broadcast({ type: 'iso_state', data }) });
const inputHealth = new InputHealthEngine();
const thumbsEngine = new ThumbsEngine(production);
const outputWatchdog = new OutputWatchdogEngine();
const multiviewEngine = new MultiViewEngine();
production.inputHealth = inputHealth;
production.outputWatchdog = outputWatchdog;
production.multiviewEngine = multiviewEngine;
const auxOutputRouter = new AuxOutputRouter({ root: ROOT, production });
await auxOutputRouter.load().catch(() => { });
auxOutputRouter.on('aux_source_change', data => broadcast({ type: 'aux_source_change', data }));
auxOutputRouter.on('aux_cut', data => broadcast({ type: 'aux_cut', data }));
auxOutputRouter.on('output_routed', data => broadcast({ type: 'output_routed', data }));
production.auxOutputRouter = auxOutputRouter;
let lastDevicesCache = { video: [], audio: [], monitors: [], windows: [] };
// 3Mix Crew — Tally (Fase 1 do superprompt de Melhorias Broadcast + Crew). Engine
// SOMENTE LEITURA (nunca muta o motor); clientes de Tally entram por um WebSocket próprio
// (/api/crew/tally), nunca pelo /ws principal, para nenhum dispositivo de Tally conseguir
// mandar um comando de produção mesmo por engano/bug de cliente.
const crewTally = new CrewTallyEngine(production);
const crewTallyClients = new Set();
// 3Mix Crew — Intercom (áudio). AudioTapRegistry é o ÚNICO chamador de call_audio nativo
// (recurso exclusivo por desenho — ver audio-tap-registry.mjs); CallEngine/CallReturns
// continuam chamando call_audio diretamente por enquanto (migração para o registry
// compartilhado NÃO feita nesta rodada, para não arriscar regressão em produção sem QA
// dedicado) — ou seja, hoje Calls e Crew Intercom NÃO podem usar call_audio ao mesmo tempo
// sem colidir; isso é uma limitação real registrada no STATUS, não escondida.
const crewAudioRegistry = new AudioTapRegistry(production);
const crewIntercom = new CrewIntercomEngine(crewAudioRegistry);
const crewIntercomTransport = new CrewIntercomWsTransport(crewIntercom);
// Anexados em `production` (mesmo padrão já usado por auxOutputRouter/multiviewEngine/
// inputHealth acima) para o Pre-Flight (preflight-producao.mjs, item 'crew', instanciado
// DENTRO de Production antes destes engines existirem) conseguir ler o estado real do
// Crew sem o acoplamento inverso (Production nunca importa nada de servidor-api.mjs).
production.crewTally = crewTally;
production.crewIntercom = crewIntercom;
production.audioTapRegistry = crewAudioRegistry;
const TCP_PORT = Number(process.env.FREEMIX_VMIX_TCP_PORT || 8099);
// Decisão do dono (03/11/2026): o 3Mix não segue com a ponte vMix TCP como API principal
// de automação/controladoras — a API própria (REST+WebSocket, já com PIN/token fora do
// loopback) é o caminho oficial daqui para frente. A ponte continua existindo só para quem
// já depende dela hoje (Companion/Stream Deck/Tally físico com o módulo vMix), mas passa a
// ser DESLIGADA por padrão (era ligada por padrão em 0.0.0.0, sem nenhuma autenticação —
// ver docs/MATRIZ-INVENTARIO-CREW-BROADCAST.md). Quem precisar dela liga explicitamente com
// FREEMIX_ENABLE_VMIX_TCP=1, e por padrão só em loopback (bind explícito via
// FREEMIX_VMIX_TCP_HOST para expor na LAN, nunca automático).
const vmixTcp = new VmixTcpServer({ production, vmixHandler: vmix, port: TCP_PORT, host: process.env.FREEMIX_VMIX_TCP_HOST || '127.0.0.1' });
if (process.env.FREEMIX_ENABLE_VMIX_TCP === '1') { vmixTcp.start().then(() => { console.log(`3Mix: vMix TCP Server (compatibilidade, desligado por padrão) ativo na porta ${TCP_PORT}.`); }).catch(err => { console.warn(`3Mix: Falha ao iniciar vMix TCP na porta ${TCP_PORT}: ${err.message}`); }); }
const projectBinding = production.installProjectHost({ replay, iso, onlineUpdate, diagnostics });
onlineUpdate.apiPort = PORT;
onlineUpdate.guard = async () => { const s = production.state; if (s.streaming || s.recording) return 'Pare a transmissão e a gravação antes de atualizar.'; const list = await production.req('GetOutputList').catch(() => null); if (list?.outputs?.some(o => o.outputActive)) return 'Há uma saída no ar. Pare antes de atualizar.'; const out = await production.outputEngine.read().catch(() => null); if (out?.sdi?.slots?.some(r => r.active) || out?.destinations?.some(d => d.active) || out?.ndi?.active || out?.omt?.active) return 'Há uma saída no ar. Pare antes de atualizar.'; return null; };
onlineUpdate.beforeApply = async () => { await production.vendor('save_preset', {}, 'freemix').catch(() => { }); };
onlineUpdate.startAutoCheck();
production.recoveryEngine.guard = () => !!(replay.state.rec || iso.state.rec || production.callEngine.returns.timer);
// Módulos opcionais em standby (item "INSTALADOR EMPRESARIAL + MÓDULOS EM STANDBY" do
// qa-beta/STATUS-BETA.md). Cache em memória lido no início e invalidado só quando
// POST /api/modulos grava um novo arquivo — nenhuma rota de leitura por requisição faz
// I/O de disco. Ausência do arquivo = todos os módulos ativos (modulosAtivos já trata
// isso); nenhuma tela ou módulo some até o operador desligar explicitamente algo.
let modulosCache = await modulosAtivos(ROOT).catch(() => null);
const moduloAtivo = id => modulosCache ? modulosCache[id] !== false : true;
production.moduloAtivo = moduloAtivo;

function publicOperation(receipt) {
  if (!receipt || typeof receipt !== 'object') return undefined;
  const { id, action, scope, targetKey, targetName, receivedAt, startedAt, engineConfirmedAt, finishedAt, stage, replayed } = receipt;
  const error = receipt.error ? String(receipt.error).replace(/(password|key|secret|token)\s*[:=]\s*[^\s,]+/gi, '$1=[omitido]').slice(0, 500) : undefined;
  return { id, action, scope, targetKey, targetName, receivedAt, startedAt, engineConfirmedAt, finishedAt, stage, ...(receipt.confirmation ? { confirmation: receipt.confirmation, reconciledAt: receipt.reconciledAt, originalStage: receipt.originalStage } : {}), ...(replayed !== undefined ? { replayed } : {}), ...(error ? { error } : {}) };
}

const clean = (s = production.state) => ({ ...s, operation: publicOperation(s.operation), operationReceipts: (s.operationReceipts || []).map(publicOperation).filter(Boolean), replay: replay.state, iso: iso.state, ips: ips(), inputHealth: typeof inputHealth?.getSummary === 'function' ? inputHealth.getSummary() : {}, outputWatchdog: typeof outputWatchdog?.getSummary === 'function' ? outputWatchdog.getSummary() : {}, multiview: moduloAtivo('multiview') && typeof multiviewEngine?.getMultiviewSnapshot === 'function' ? multiviewEngine.getMultiviewSnapshot() : {}, auxMatrix: typeof auxOutputRouter?.getRoutingMatrix === 'function' ? auxOutputRouter.getRoutingMatrix() : {} });
function originAllowed(req) {
  const o = req.headers.origin; if (!o) return true; if (o === 'null') return local(req);
  try { return new URL(o).host === req.headers.host; } catch { return false; }
}
function authorized(req) {
  if (!originAllowed(req)) return false; if (local(req)) return true;
  if (equal(req.headers.authorization?.replace(/^Bearer /i, ''), token)) return true;
  const c = /(?:^|;\s*)freemix_session=([A-Za-z0-9_-]+)/.exec(req.headers.cookie || ''); return !!c && sessions.get(c[1]) > Date.now();
}
const json = (res, code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
async function body(req) { let s = ''; for await (const b of req) { s += b; if (s.length > 7 * 1024 * 1024) throw new Error('Pedido muito grande'); } return JSON.parse(s || '{}'); }
async function startConnection() {
  if (stopping || obs || connecting || projectBinding.gate.shouldSkipBackground()) return; connecting = true; const generation = ++connectionGeneration; let candidate = null;
  try {
    const connected = projectBinding.wrapConnection(await connect({
      root: ROOT, events: 1 | 2 | 4 | 8 | 16 | 64 | 128 | 256 | 512 | 65536,
      onEvent: (type, data) => { try { if (generation !== connectionGeneration) return; if (!projectBinding.gate.acceptNativeEvent(type)) return; if (type === 'ExitStarted') { production.sessionRecovery.finish('normal').catch(() => { }); return; } if (type === 'VendorEvent' && data.vendorName === 'freemix-hotkeys') { if (data.eventType === 'hotkey') production.globalHotkeys.event(data.eventData); if (data.eventType === 'bindings_reset') production.globalHotkeys.disconnected(); return; } if (type === 'MediaInputPlaybackEnded') { try { production.rundownEngine?.onNativeEvent?.(type, data); } catch (error) { console.error('3Mix: rundown-event: ' + error.message); } } production.sessionRecovery.onNativeEvent(type, data); if (type === 'CurrentProgramSceneChanged' && obs) replay.onProgramChanged(data.sceneName)?.catch(e => connectionError('replay-autoplay', e)); if (type === 'InputVolumeMeters') { production.onMeters(data.inputs); broadcast({ type: 'meters', inputs: data.inputs }); } } catch (e) { connectionError('native-event', e); } },
      onClose: () => { if (generation !== connectionGeneration) return; connectionGeneration++; obs = null; connectionReady = false; production.disconnected(); scheduleConnection(); }
    }));
    candidate = connected; if (stopping || generation !== connectionGeneration) { connected.close(); return; } obs = connected;
    const motor = (await connected.req('CallVendorRequest', { vendorName: 'freemix', requestType: 'get_interface', requestData: {} })).responseData;
    await production.sessionRecovery.start({ motorIdentity: motor.pid ? motor.pid + ':' + motor.executable : null }); await production.tick();
    if (obs !== connected || generation !== connectionGeneration) return; connectionReady = production.state.connected === true; delete connectionErrors.production;
    // Replay/ISO diagnostics are independent of the confirmed production snapshot.
    for (const [name, component] of [['replay', replay], ['iso', iso]]) try { await component.command('status'); delete connectionErrors[name]; } catch (e) { if (obs === connected) connectionError(name, e); }
    if (obs === connected && generation === connectionGeneration) console.log('3Mix: motor conectado.');
  } catch (e) { if (generation === connectionGeneration) { connectionReady = false; if (obs === candidate) { obs = null; candidate?.close(); } production.disconnected(); connectionError('production', e); } }
  finally { connecting = false; if (!obs) scheduleConnection(); }
}
async function vmix(fn, p) {
  const get = k => p.get(k) ?? p.get(k.toLowerCase()), input = get('Input'), value = get('Value'), name = String(fn).toLowerCase(); let action, data = { input };
  if (['cut', 'fade', 'previewinput', 'activeinput', 'cutdirect'].includes(name)) { action = { previewinput: 'preview', activeinput: 'active', cutdirect: 'active' }[name] || name; data.duration = get('Duration') ?? 500; }
  else if (name === 'fadetoblack') { action = 'ftb'; }
  else if (['playouttake', 'takenext'].includes(name)) { action = 'playout_take'; data = { itemId: get('ItemId') || undefined }; }
  else if (name === 'playoutnext') { action = 'playout_next'; }
  else if (['playoutprevious', 'playoutprev'].includes(name)) { action = 'playout_previous'; }
  else if (['playoutclipgain', 'adjustgain'].includes(name)) { action = 'playout_item_update'; data = { itemId: get('ItemId') || production.playoutEngine?.state?.program?.item?.id, audioGainDb: Number(value ?? get('Gain') ?? 0) }; }
  else if (name === 'preflightcheck') { action = 'preflight_check'; }
  else if (name === 'blackboxmark') { action = 'blackbox_mark'; data = { note: get('Note') || 'Marcação via vMix API' }; }
  else if (name === 'setvolume') { action = 'audio_volume'; data.volume = value; }
  else if (['audio', 'audioon', 'audiooff', 'masteraudio', 'setmastervolume'].includes(name)) { action = name === 'setmastervolume' ? 'audio_volume' : 'audio_mute'; if (name.startsWith('master') || name === 'setmastervolume') data.input = 'M'; if (name === 'audioon') data.muted = false; if (name === 'audiooff') data.muted = true; data.volume = value; }
  else if (['startrecording', 'stoprecording', 'startstreaming', 'stopstreaming'].includes(name)) { action = name.endsWith('recording') ? 'record' : 'stream'; data.active = name.startsWith('start'); }
  else if (['play', 'pause', 'restart', 'nextitem', 'previousitem'].includes(name)) { action = 'media'; data.command = { nextitem: 'NEXT', previousitem: 'PREVIOUS' }[name] || name.toUpperCase(); }
  else if (name === 'setposition') { action = 'media_seek'; data.position = value; }
  else if (name === 'setspeed') { action = 'media_settings'; data.speed = value; }
  else if (/^overlayinput[1-8](in|out)?$/.test(name)) { action = 'overlay'; data.channel = Number(name[12]); if (name.endsWith('out')) data.input = ''; else if (!name.endsWith('in')) { const s = production.scene(input).name; if (production.state.overlays.some(o => o.number === data.channel && o.scene === s)) data.input = ''; } }
  else if (name === 'gcupdate') { action = 'gc'; data = { kind: 'lower', data: { title: get('title') ?? '', subtitle: get('subtitle') ?? '' } }; }
  else if (name === 'scoregoal') { action = 'score'; data = { team: get('team'), delta: value ?? 1 }; }
  else if (name.startsWith('replay')) {
    const targetPlayer = input || (['a', 'b'].includes(String(value).toLowerCase()) ? String(value).toUpperCase() : replay.state.activePlayer);
    if (name === 'replayplay') {
      await replay.command('transport', { player: targetPlayer, command: 'PLAY' });
    } else if (name === 'replaypause') {
      await replay.command('transport', { player: targetPlayer, command: 'PAUSE' });
    } else if (['replayplaypause', 'replaytoggleplayforward'].includes(name)) {
      await replay.command('play-pause', { player: targetPlayer });
    } else if (name === 'replaylive') {
      await replay.command('live', {});
    } else if (['replaysetspeed', 'replayplaybackspeed'].includes(name)) {
      const spd = Number(value);
      await replay.command('speed', { speed: spd > 1 ? spd : Math.round(spd * 100) });
    } else if (name === 'replaysetspeedchannela' || name === 'replayplaybackspeedchannela') {
      const spd = Number(value);
      await replay.command('speed', { speed: spd > 1 ? spd : Math.round(spd * 100), player: 'A' });
    } else if (name === 'replaysetspeedchannelb' || name === 'replayplaybackspeedchannelb') {
      const spd = Number(value);
      await replay.command('speed', { speed: spd > 1 ? spd : Math.round(spd * 100), player: 'B' });
    } else if (name === 'replayjumpframes') {
      await replay.command('jump', { player: targetPlayer, frames: Number(value || 0) });
    } else if (name === 'replayjumpseconds') {
      await replay.command('jump', { player: targetPlayer, seconds: Number(value || 0) });
    } else if (name === 'replayjumptonow') {
      await replay.command('jump-to-now', { player: targetPlayer });
    } else if (['replayswap', 'replayswapchannel', 'replayswapchannels'].includes(name)) {
      await replay.command('swap', {});
    } else if (name === 'replayselectchannela') {
      replay.state.activePlayer = 'A'; await replay.save();
    } else if (name === 'replayselectchannelb') {
      replay.state.activePlayer = 'B'; await replay.save();
    } else if (name === 'replayselectchannel') {
      const ch = String(value || input || 'A').toUpperCase();
      if (['A', 'B'].includes(ch)) { replay.state.activePlayer = ch; await replay.save(); }
    } else if (name === 'replayselectcamera') {
      await replay.command('select-camera', { player: targetPlayer, camIndex: Number(value || 1) });
    } else if (/^replayselectcamera[1-4]$/.test(name)) {
      const camIdx = Number(name.replace('replayselectcamera', ''));
      await replay.command('select-camera', { player: targetPlayer, camIndex: camIdx });
    } else if (name === 'replaymarkin') {
      await replay.command('mark-in', {});
    } else if (name === 'replaymarkout') {
      await replay.command('mark-out', {});
    } else if (['replaymarkinout', 'replaymarkinoutlive'].includes(name)) {
      await replay.command('mark-in-out', { seconds: Number(value || 10) });
    } else if (name === 'replayselectfirstevent') {
      await replay.command('select-event', { offset: 'first', player: targetPlayer });
    } else if (name === 'replayselectlastevent') {
      await replay.command('select-event', { offset: 'last', player: targetPlayer });
    } else if (name === 'replayselectnextevent') {
      await replay.command('select-event', { offset: 'next', player: targetPlayer });
    } else if (name === 'replayselectpreviousevent') {
      await replay.command('select-event', { offset: 'prev', player: targetPlayer });
    } else if (name === 'replayselectevent') {
      await replay.command('select-event', { index: Number.isInteger(Number(value)) ? Number(value) : undefined, eventId: !Number.isInteger(Number(value)) ? value : undefined, player: targetPlayer });
    } else if (name === 'replayplayevent') {
      await replay.command('play-event', { eventId: value, index: Number.isInteger(Number(value)) ? Number(value) : undefined, player: targetPlayer, toOutput: false });
    } else if (name === 'replayplayselectedevent') {
      await replay.command('play-event', { eventId: replay.state.selectedEventId, player: targetPlayer, toOutput: false });
    } else if (name === 'replayplayselectedeventtooutput' || name === 'replayplayeventstooutput') {
      await replay.command('play-event', { eventId: replay.state.selectedEventId, player: targetPlayer, toOutput: true });
    } else if (name === 'replaystartrecording') {
      if (!replay.state.rec) await replay.command('start', {});
    } else if (name === 'replaystoprecording') {
      if (replay.state.rec) await replay.command('stop', {});
    } else if (name === 'replaystartstoprecording') {
      await replay.command(replay.state.rec ? 'stop' : 'start', {});
    } else if (name === 'replaydeleteevent') {
      await replay.command('delete', { eventId: value || replay.state.selectedEventId });
    } else if (name === 'replaysetselectedeventcategory') {
      await replay.command('update-event', { eventId: replay.state.selectedEventId || replay.state.events[0]?.id, category: value });
    } else if (name === 'replaysetselectedeventtext') {
      await replay.command('update-event', { eventId: replay.state.selectedEventId || replay.state.events[0]?.id, name: value });
    } else {
      throw new Error('Comando de replay vMix não implementado: ' + fn);
    }
    return;
  } else throw new Error('Comando não implementado: ' + fn);
  await production.run(action, data);
}
const routes = { '/novo-projeto/': 'novo-projeto/index', '/': 'hub', '/hub': 'hub', '/corte': 'corte', '/playout': 'playout', '/playout-monitor': 'playout-monitor', '/gc-html': 'gc-html', '/gc': 'gc', '/audio': 'audio', '/replay': 'replay', '/iso': 'iso', '/multicorder': 'multicorder', '/dados': 'dados', '/compor': 'compor', '/chroma': 'chroma', '/estudio': 'estudio', '/social': 'social', '/settings': 'settings', '/configuracoes': 'configuracoes', '/calls': 'calls', '/crew': 'crew', '/macros': 'macros', '/recuperacao': 'recuperacao', '/saidas': 'saidas', '/externo': 'externo', '/gravar': 'gravar', '/transmitir': 'transmitir', '/srt-hdr': 'srt-hdr', '/rede': 'rede', '/atalhos': 'atalhos', '/efeitos': 'efeitos', '/sinais': 'sinais', '/atualizacao': 'atualizacao', '/diagnosticos': 'diagnosticos', '/overlays': 'overlays', '/multiview': 'multiview', '/aux': 'aux-router', '/me': 'me', '/central-saidas': 'central-saidas', '/patch': 'patch-registry', '/primeira-transmissao': 'checklist-primeira-transmissao', '/rundown': 'rundown', '/retornos': 'retornos', '/blackbox': 'blackbox', '/preflight': 'preflight', '/primeira-execucao': 'primeira-execucao', '/modular': 'modular', '/modulos': 'modulos', '/ptz': 'ptz', '/color': 'color', '/slides': 'slides' };
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.bmp': 'image/bmp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };

function controlReceipt(request) {
  if (!request || typeof request.id !== 'string' || typeof request.scope !== 'string') return undefined;
  const receipt = production.operationReceipts?.get(request.scope + ':' + request.id);
  if (!receipt || receipt.id !== request.id || receipt.scope !== request.scope) return undefined;
  return publicOperation(receipt);
}

// QR só de endereço desta máquina: um IP real, esta porta, a raiz ou uma página conhecida do painel.
function qrPermitido(address) { try { const a = new URL(address); const searchOk = !a.search || (a.pathname === '/crew' && /^\?member=[\w.-]{1,40}$/.test(a.search)); return a.protocol === 'http:' && ips().includes(a.hostname) && a.port === String(PORT) && searchOk && !a.hash && (a.pathname === '/' || Object.hasOwn(routes, a.pathname) || /^\/docs\/[\w./-]+\.html$/.test(a.pathname)); } catch { return false; } }
async function handleHttp(req, res) {
  let controlOperation;
  try {
    const u = new URL(req.url, 'http://localhost'), path = u.pathname;
    if (path === '/novo-projeto' || path.startsWith('/novo-projeto/') || path.startsWith('/remoto/novo-projeto/')) { if (!local(req) || !originAllowed(req)) return json(res, 403, { success: false, error: 'Novo projeto disponível somente neste computador' }); if (path === '/novo-projeto') { res.writeHead(303, { Location: '/novo-projeto/' }); res.end(); return; } }
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    // Health is read by the local file-based CEF desk too. Apply the same
    // restricted origin policy before returning from this early route.
    if (originAllowed(req) && req.headers.origin) { res.setHeader('Access-Control-Allow-Origin', req.headers.origin); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); }
    if (path === '/api/health') {
      if (!local(req) || !originAllowed(req)) return json(res, 403, { success: false });
      // Fase 3.3 ("mensagens acionáveis para: disco cheio"): health é a rota consultada na
      // PRIMEIRA execução/conexão (estudio-dock.html, painel/estudio/js/ponte.js), antes de
      // qualquer projeto estar aberto — o Pre-Flight operacional (mesma lógica, via
      // disco-producao.mjs) só roda depois, com o motor já conectado. Campo aditivo; nunca
      // derruba a rota se statfs falhar por qualquer motivo (leitura best-effort).
      const disk = await diskReport(ROOT).catch(() => ({ supported: false }));
      return json(res, 200, { success: true, app: 'FreeMix', brand: '3Mix', appName: '3Mix', protocol: 1, installationId, pid: process.pid, connected: !!obs && connectionReady && production.state.connected === true, projectTransaction: projectBinding.gate.status(), transportConnected: !!obs, connectionErrors, port: PORT, disk });
    }
    if (path === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    if (path === '/settings') { res.writeHead(302, { Location: '/configuracoes' + u.search }); res.end(); return; }
    if (req.method === 'OPTIONS') { res.writeHead(originAllowed(req) ? 204 : 403).end(); return; }
    if (path === '/api/pair' && req.method === 'POST') {
      if (!originAllowed(req)) return json(res, 403, { success: false, error: 'Origem recusada' });
      const addr = req.socket.remoteAddress, rate = attempts.get(addr) || { count: 0, until: Date.now() + 60000 }; if (rate.until < Date.now()) { rate.count = 0; rate.until = Date.now() + 60000; } attempts.set(addr, rate);
      if (++rate.count > 10) return json(res, 429, { success: false, error: 'Aguarde um minuto para tentar novamente' });
      const d = await body(req); if (!equal(d.pin, pin)) return json(res, 401, { success: false, error: 'Código incorreto' });
      const id = randomBytes(24).toString('base64url'); sessions.set(id, Date.now() + 12 * 60 * 60 * 1000); res.setHeader('Set-Cookie', `freemix_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`); return json(res, 200, { success: true });
    }
    if (path === '/api/network-enable') {
      if (req.method !== 'POST') return json(res, 405, { success: false });
      if (!local(req) || !originAllowed(req)) return json(res, 403, { success: false, error: 'Só no computador do 3Mix' });
      const configurador = join(ROOT, 'runtime', 'freemix-network-setup.exe');
      if (!existsSync(configurador)) return json(res, 404, { success: false, error: 'Configurador de rede ausente nesta instalação' });
      // Regra de firewall só para a sub-rede local, e o Windows pede a confirmação do operador. Vale ao reabrir o 3Mix.
      const resultado = await new Promise(ok => execFile(configurador, ['--root', ROOT, '--port', String(PORT), '--control-lan', '--apply', '--elevate'], { timeout: 120000, windowsHide: true }, (erro, saida, falha) => ok({ erro, falha: String(falha || '') })));
      if (resultado.erro) return json(res, 400, { success: false, error: (resultado.falha || 'A confirmação do Windows foi cancelada').trim().slice(0, 300) });
      return json(res, 200, { success: true, reabrir: true });
    }
    if (path === '/api/access') { if (!local(req) || !originAllowed(req)) return json(res, 403, { success: false, error: 'Abra este controle no computador do 3Mix' }); return json(res, 200, { pin, expires: 'ao fechar o 3Mix', urls: ips().map(ip => `http://${ip}:${PORT}/`), redes: Object.entries(networkInterfaces()).flatMap(([nome, lista]) => lista.filter(i => i.family === 'IPv4' && !i.internal).map(i => ({ nome: nome.replace(/\s*\[[^\]]*\]\s*$/, '').replace(/^vEthernet.*/, 'Virtual').trim().slice(0, 30), url: `http://${i.address}:${PORT}/` }))) }); }
    if (path === '/api/qr.svg') {
      if (!local(req)) return json(res, 403, { success: false }); const address = u.searchParams.get('address'); if (!qrPermitido(address)) throw new Error('Endereço de QR inválido');
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(await QRCode.toString(address, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 })); return;
    }
    if (path.startsWith('/api/') || path === '/api' || path === '/ws') {
      if (!authorized(req)) return json(res, 401, { success: false, error: 'Autorize este dispositivo com o código do computador 3Mix' });
      if (await handleWorkspaceRequest({ path, req, res, root: ROOT, local, body, json, production })) return;
      if (path === '/api/modulos') {
        if (!local(req)) return json(res, 403, { success: false, error: 'Seleção de módulos disponível somente neste computador' });
        if (req.method === 'GET') return json(res, 200, { success: true, modulos: modulosCache ?? await modulosAtivos(ROOT), definicao: listarDefinicaoModulos() });
        if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return json(res, 405, { success: false, error: 'Método inválido' }); }
        const data = await body(req), valores = validarModulos(data.modulos ?? data);
        const registro = await salvarModulosAtivos(ROOT, valores);
        modulosCache = registro.modulos;
        return json(res, 200, { success: true, modulos: registro.modulos });
      }
      if (path.startsWith('/api/replay-preview/')) {
        if (!local(req)) return json(res, 403, { success: false, error: 'Prévia do histórico disponível somente neste computador' });
        if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); return json(res, 405, { success: false, error: 'Método inválido' }); }
        const previewToken = path.slice('/api/replay-preview/'.length);
        if (!/^[0-9a-f]{32}$/.test(previewToken)) return json(res, 404, { success: false, error: 'Prévia inválida' });
        let lease;
        try { lease = await replay.previewFile(previewToken); } catch { return json(res, 404, { success: false, error: 'Prévia expirada; atualize o histórico' }); }
        return await servePreviewMedia(req, res, lease);
      }
      if (path === '/api/ticker-ack') { if (req.method !== 'POST' || !local(req) || !originAllowed(req)) return json(res, 403, { success: false }); const data = await readTickerAckRequest(req); const accepted = production.gtTickerAck.accept(data); return json(res, accepted ? 200 : 409, { success: accepted }); }
      if (path === '/api/panel-log') {
        if (req.method !== 'POST') return json(res, 405, { success: false });
        const dados = await body(req); if (++errosPainelMinuto <= 120) await registrarErroPainel(ROOT, dados && typeof dados === 'object' ? dados : {});
        return json(res, 200, { success: true });
      }
      if (path.startsWith('/api/diagnostics')) {
        if (!local(req)) return json(res, 403, { success: false, error: 'Diagnóstico disponível somente neste computador' });
        if (path === '/api/diagnostics' && req.method === 'POST') { const data = await body(req); if (typeof data.note !== 'undefined' && typeof data.note !== 'string' || typeof data.machineName !== 'undefined' && typeof data.machineName !== 'string') throw Error('Dados inválidos'); await diagnostics.generate({ note: data.note, machineName: data.machineName, relato: data.relato, estado: await estadoParaDiagnostico() }); return json(res, 200, diagnostics.summary()); }
        if (path === '/api/diagnostics/reveal' && req.method === 'POST') { await diagnostics.revelar(); return json(res, 200, { success: true }); }
        if (path === '/api/diagnostics' && req.method === 'GET') return json(res, 200, await diagnostics.situacao());
        if (['/api/diagnostics/download', '/api/diagnostics/preview'].includes(path) && req.method === 'GET') { const zip = await diagnostics.download(u.searchParams.get('id')); if (path.endsWith('/preview')) { const files = await readDiagnosticZip(zip); let text = 'Prévia: até 4 KB de cada log. O ZIP preserva o conteúdo limitado descrito no manifesto.\n'; for (const [name, data] of files) { const snippet = name.startsWith('logs/') ? data.subarray(0, 4096) : data; text += '\n--- ' + name + ' ---\n' + snippet.toString('utf8') + (snippet.length < data.length ? '\n[prévia reduzida; restante no ZIP]' : '') + '\n'; } return json(res, 200, { success: true, text }); } res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="' + diagnostics.last.name + '"', 'Content-Length': zip.length }); res.end(zip); return; }
        return json(res, 404, { success: false, error: 'Operação de diagnóstico inválida' });
      }
      if (path === '/api/update' && req.method === 'GET') { if (!local(req)) return json(res, 403, { success: false, error: 'Atualização disponível somente neste computador' }); await onlineUpdate.execute('update_read', {}); return json(res, 200, { success: true, update: onlineUpdate.last }); }
      if (path === '/api/effects-frame' && req.method === 'GET') {
        if (!local(req)) return json(res, 403, { success: false, error: 'Efeitos disponíveis somente neste computador' });
        const key = u.searchParams.get('key') || '';
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) throw Error('Entrada inválida');
        const data = await production.effectsEngine.frame(key);
        if (typeof data !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data) || data.length > 12 * 1024 * 1024) throw Error('Imagem indisponível');
        const png = Buffer.from(data.slice('data:image/png;base64,'.length), 'base64');
        if (png.length < 8 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw Error('Imagem inválida');
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }); res.end(png); return;
      }
      if (path === '/api/composition-frame' && req.method === 'GET') {
        const input = u.searchParams.get('input') || '';
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input)) throw new Error('Composição inválida');
        const data = await production.inputEngine.frame(input);
        if (typeof data !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data) || data.length > 12 * 1024 * 1024) throw new Error('Imagem da composição indisponível');
        const png = Buffer.from(data.slice('data:image/png;base64,'.length), 'base64');
        if (png.length < 8 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Imagem da composição inválida');
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }); res.end(png); return;
      }
      if (path === '/api/effects' && req.method === 'GET') { if (!local(req)) return json(res, 403, { success: false, error: 'Efeitos disponíveis somente neste computador' }); return json(res, 200, { success: true, effects: await production.effectsEngine.summary(u.searchParams.get('key') || undefined) }); }
      if (path === '/api/audio-routing' && req.method === 'GET') { if (!local(req)) return json(res, 403, { success: false, error: 'Áudio disponível somente neste computador' }); return json(res, 200, { success: true, audioRouting: await production.audioRoutingEngine.read(u.searchParams.get('key') || undefined) }); }
      if (path === '/api/operation-check') {
        if (req.method !== 'GET') return json(res, 405, { success: false });
        const checked = await production.checkOperation({ id: u.searchParams.get('id'), scope: u.searchParams.get('scope') });
        return json(res, 200, { success: true, ...checked, operation: publicOperation(checked.operation) });
      }
      if (path === '/api/final-program-gate') {
        if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return json(res, 405, { success: false, error: 'Use GET somente para consultar' }); }
        if (!local(req)) return json(res, 403, { success: false, error: 'Consulta do beta Master disponível somente neste computador' });
        if ([...u.searchParams.keys()].some(k => k !== 'mixId') || u.searchParams.getAll('mixId').length > 1 || (u.searchParams.get('mixId') ?? '0') !== '0') return json(res, 400, { success: false, error: 'Consulta disponível somente para Mix1/Master; nenhuma opção habilita o beta' });
        return json(res, 200, { success: true, finalProgramGate: await production.readFinalProgramGate() });
      }
      if (await handleSettingsRead({ req, res, u, local, authorized, originAllowed, json, production })) return;
      if (path === '/api/outputs') { if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return json(res, 405, { success: false, error: 'Use GET somente para consultar' }); } if (!local(req)) return json(res, 403, { success: false, error: 'Consulta de saídas disponível somente neste computador' }); if (u.searchParams.size) return json(res, 400, { success: false, error: 'Consulta não recebe configuração' }); res.setHeader('Cache-Control', 'no-store'); return json(res, 200, await readOutputsSnapshot(production)); }
      // 3Mix Crew — Tally: leitura pontual (dispositivo que prefere fazer polling em vez de
      // WebSocket) ou o handshake inicial de quem vai abrir /api/crew/tally/ws. Mesma
      // autenticação do /ws (local OU sessão pareada por PIN) — nunca exposto sem pareamento,
      // mesmo sendo só leitura: um Tally público revelaria o que está no ar antes do público.
      if (path === '/api/crew/tally') { if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return json(res, 405, { success: false, error: 'Use GET somente para consultar' }); } if (!authorized(req)) return json(res, 401, { success: false, error: 'Autorize este dispositivo com o código do computador 3Mix' }); const watching = u.searchParams.get('watching'); res.setHeader('Cache-Control', 'no-store'); return json(res, 200, { success: true, ...(watching ? await crewTally.forDevice(watching) : await crewTally.summary()) }); }
      // 3Mix Crew — Intercom: GET lê o estado (membros/grupos/PTT ativos); POST executa
      // ações. Cadastro de membro/grupo (quem é cada pessoa, qual fonte de áudio) é SÓ
      // LOCAL (decisão do operador no computador do 3Mix, mesmo padrão de /api/control
      // seção 7.2) — PTT (falar/parar de falar) é aceito de QUALQUER dispositivo pareado
      // (celular na operação), igual ações de corte/transição já são hoje.
      if (path === '/api/crew/intercom') {
        if (req.method === 'GET') { if (!authorized(req)) return json(res, 401, { success: false, error: 'Autorize este dispositivo com o código do computador 3Mix' }); res.setHeader('Cache-Control', 'no-store'); return json(res, 200, { success: true, ...crewIntercom.summary() }); }
        if (req.method !== 'POST') return json(res, 405, { success: false });
        const d = await body(req);
        const ACOES_LOCAIS = ['register_member', 'remove_member', 'create_group', 'set_member_groups'];
        if (ACOES_LOCAIS.includes(d.action) && !local(req)) return json(res, 403, { success: false, error: 'Cadastro de membros/grupos do Crew só no computador do 3Mix' });
        if (!authorized(req)) return json(res, 401, { success: false, error: 'Autorize este dispositivo com o código do computador 3Mix' });
        if (d.action === 'register_member') { const memberId = crewIntercom.registerMember(d); await crewIntercom.syncRegistry(); return json(res, 200, { success: true, memberId, ...crewIntercom.summary() }); }
        if (d.action === 'remove_member') { crewIntercom.removeMember(d.memberId); await crewIntercom.syncRegistry(); return json(res, 200, { success: true, ...crewIntercom.summary() }); }
        if (d.action === 'create_group') { const groupId = crewIntercom.createGroup(d); return json(res, 200, { success: true, groupId, ...crewIntercom.summary() }); }
        if (d.action === 'set_member_groups') { crewIntercom.setMemberGroups(d.memberId, d.groupIds || []); return json(res, 200, { success: true, ...crewIntercom.summary() }); }
        if (d.action === 'ptt_start') { const result = crewIntercom.startPtt(d.memberId, d.targets || []); return json(res, 200, { success: true, ...result }); }
        if (d.action === 'ptt_ping') { crewIntercom.pingPtt(d.memberId, d.lease); return json(res, 200, { success: true }); }
        if (d.action === 'ptt_stop') { crewIntercom.stopPtt(d.memberId, d.lease); return json(res, 200, { success: true }); }
        return json(res, 400, { success: false, error: 'Ação de Intercom desconhecida' });
      }
      if (path === '/api/devices/video' && req.method === 'GET') {
        try {
          const list = await production.tryReq('GetInputList', {});
          const dshow = (list?.inputs || []).filter(i => i.inputKind === 'dshow_input');
          let target = dshow[0]?.inputName, tempCreated = false;
          if (!target) {
            tempCreated = true;
            target = '__3mix_probe_dshow__';
            await production.req('CreateScene', { sceneName: '__3mix_probe_scene__' });
            await production.req('CreateInput', { sceneName: '__3mix_probe_scene__', inputName: target, inputKind: 'dshow_input', inputSettings: {} });
          }
          const props = await production.tryReq('GetInputPropertiesListPropertyItems', { inputName: target, propertyName: 'video_device_id' });
          if (tempCreated) {
            await production.tryReq('RemoveInput', { inputName: target });
            await production.tryReq('RemoveScene', { sceneName: '__3mix_probe_scene__' });
          }
          const devices = (props?.propertyItems || []).map(p => ({ name: p.itemName, value: p.itemValue, enabled: p.itemEnabled }));
          if (devices.length) lastDevicesCache.video = devices;
          return json(res, 200, { success: true, devices: devices.length ? devices : lastDevicesCache.video });
        } catch (err) {
          return json(res, 200, { success: true, devices: lastDevicesCache.video || [], error: err.message });
        }
      }
      if (path === '/api/devices/all' && req.method === 'GET') {
        try {
          const result = {
            video: [...(lastDevicesCache.video || [])],
            audio: [...(lastDevicesCache.audio || [])],
            monitors: [...(lastDevicesCache.monitors || [])],
            windows: [...(lastDevicesCache.windows || [])]
          };
          const inputList = await production.tryReq('GetInputList', {});
          const inputs = inputList?.inputs || [];
          const uid = Math.random().toString(36).slice(2, 8);
          const probeScene = '__3mix_probe_' + uid;
          let sceneCreated = false;
          const ensureProbeScene = async () => {
            if (!sceneCreated) {
              await production.req('CreateScene', { sceneName: probeScene });
              sceneCreated = true;
            }
          };
          try {
            // Video (dshow_input)
            const exVid = inputs.find(i => i.inputKind === 'dshow_input');
            let vidTarget = exVid?.inputName, vidTemp = false;
            if (!vidTarget) {
              vidTemp = true;
              vidTarget = '__3mix_p_vid_' + uid;
              await ensureProbeScene();
              await production.req('CreateInput', { sceneName: probeScene, inputName: vidTarget, inputKind: 'dshow_input', inputSettings: {} });
            }
            const pVid = await production.tryReq('GetInputPropertiesListPropertyItems', { inputName: vidTarget, propertyName: 'video_device_id' });
            if (pVid?.propertyItems?.length) {
              result.video = pVid.propertyItems.map(p => ({ name: p.itemName, value: p.itemValue, enabled: p.itemEnabled }));
              lastDevicesCache.video = result.video;
            }
            if (vidTemp) await production.tryReq('RemoveInput', { inputName: vidTarget });

            // Windows (window_capture)
            const exWin = inputs.find(i => i.inputKind === 'window_capture');
            let winTarget = exWin?.inputName, winTemp = false;
            if (!winTarget) {
              winTemp = true;
              winTarget = '__3mix_p_win_' + uid;
              await ensureProbeScene();
              await production.req('CreateInput', { sceneName: probeScene, inputName: winTarget, inputKind: 'window_capture', inputSettings: {} });
            }
            const pWin = await production.tryReq('GetInputPropertiesListPropertyItems', { inputName: winTarget, propertyName: 'window' });
            if (pWin?.propertyItems?.length) {
              result.windows = pWin.propertyItems.filter(p => p.itemValue).map(p => ({ name: p.itemName, value: p.itemValue, enabled: p.itemEnabled }));
              lastDevicesCache.windows = result.windows;
            }
            if (winTemp) await production.tryReq('RemoveInput', { inputName: winTarget });

            // Monitors (monitor_capture)
            const exMon = inputs.find(i => i.inputKind === 'monitor_capture');
            let monTarget = exMon?.inputName, monTemp = false;
            if (!monTarget) {
              monTemp = true;
              monTarget = '__3mix_p_mon_' + uid;
              await ensureProbeScene();
              await production.req('CreateInput', { sceneName: probeScene, inputName: monTarget, inputKind: 'monitor_capture', inputSettings: {} });
            }
            const pMon = (await production.tryReq('GetInputPropertiesListPropertyItems', { inputName: monTarget, propertyName: 'monitor' }))
              || (await production.tryReq('GetInputPropertiesListPropertyItems', { inputName: monTarget, propertyName: 'monitor_id' }));
            if (pMon?.propertyItems?.length) {
              result.monitors = pMon.propertyItems.filter(p => p.itemValue !== 'DUMMY').map(p => ({ name: p.itemName, value: p.itemValue, enabled: p.itemEnabled }));
              lastDevicesCache.monitors = result.monitors;
            }
            if (monTemp) await production.tryReq('RemoveInput', { inputName: monTarget });

            // Audio (wasapi_input_capture)
            const exAud = inputs.find(i => i.inputKind === 'wasapi_input_capture');
            let audTarget = exAud?.inputName, audTemp = false;
            if (!audTarget) {
              audTemp = true;
              audTarget = '__3mix_p_aud_' + uid;
              await ensureProbeScene();
              await production.req('CreateInput', { sceneName: probeScene, inputName: audTarget, inputKind: 'wasapi_input_capture', inputSettings: {} });
            }
            const pAud = await production.tryReq('GetInputPropertiesListPropertyItems', { inputName: audTarget, propertyName: 'device_id' });
            if (pAud?.propertyItems?.length) {
              result.audio = pAud.propertyItems.map(p => ({ name: p.itemName, value: p.itemValue, enabled: p.itemEnabled }));
              lastDevicesCache.audio = result.audio;
            }
            if (audTemp) await production.tryReq('RemoveInput', { inputName: audTarget });
          } finally {
            if (sceneCreated) {
              await production.tryReq('RemoveScene', { sceneName: probeScene });
            }
          }
          return json(res, 200, { success: true, ...result });
        } catch (err) {
          return json(res, 200, { success: true, ...lastDevicesCache, error: err.message });
        }
      }
      if (path === '/api/srt-hdr') { if (req.method !== 'GET') return json(res, 405, { success: false }); if (!local(req)) return json(res, 403, { success: false, error: 'Consulta HDR disponível somente neste computador' }); const id = u.searchParams.get('senderId') ?? '0'; if (!/^[0-3]$/.test(id)) throw Error('Envio HDR inválido'); return json(res, 200, { success: true, outputs: await production.outputEngine.readSrtHdr(Number(id)) }); }
      if (path === '/api/network' && req.method === 'GET') { if (!local(req)) return json(res, 403, { success: false, error: 'Rede disponível somente neste computador' }); return json(res, 200, await production.networkEngine.read()); }
      if (path === '/api/gc-compatible' && req.method === 'GET') { if (!local(req)) return json(res, 403, { success: false, error: 'Editor HTML apenas local' }); return json(res, 200, { success: true, gcCompatible: await production.gcCompatible.summary() }); }
      if ((path === '/gc-html' || path === '/gc-html.html') && !local(req)) return json(res, 403, { success: false, error: 'Editor HTML apenas local' });
      if (path === '/api/control' && req.method === 'POST') { const d = await body(req); if (String(d.action).startsWith('update_')) { if (!local(req)) return json(res, 403, { success: false, error: 'Atualização disponível somente neste computador' }); await onlineUpdate.execute(d.action, d); return json(res, 200, { success: true, state: clean(), update: onlineUpdate.last }); } if ((String(d.action).startsWith('gc_html_') || d.action === 'data_file' || ['gc_library_save', 'gc_library_duplicate', 'gc_library_remove','gc_library_style_many','gc_library_reorder','gc_library_remove_many', 'gc_library_import', 'gc_library_export', 'gc_library_asset', 'gc_library_variant', 'gc_library_unlink', 'gc_library_clock_restart'].includes(d.action) || String(d.action).startsWith('settings_') || String(d.action).startsWith('call_') || String(d.action).startsWith('recovery_') || (String(d.action).startsWith('macro_') && !['macro_run', 'macro_cancel'].includes(d.action)) || String(d.action).startsWith('outputs_') || String(d.action).startsWith('network_') || String(d.action).startsWith('audio_routing_') || String(d.action).startsWith('effects_') || String(d.action).startsWith('ptz_') || d.action === 'signal_configure' || d.action === 'patch_set' || d.action === 'mix_audio_set' || ['controller_save', 'controller_remove', 'controller_enable', 'controller_osc_configure', 'controller_osc_start', 'controller_osc_stop', 'delay_set', 'delay_enable', 'delay_disable', 'preflight_bypass', 'preflight_process_close', 'preflight_process_ignore', 'preflight_process_unignore', 'blackbox_clear'].includes(d.action)) && !local(req)) return json(res, 403, { success: false, error: 'Configuração local só no computador do 3Mix' }); controlOperation = { id: d.operationId, scope: d.expectedScope }; const state = await production.run(d.action, d); return json(res, 200, { success: true, state: clean(state), ...(String(d.action).startsWith('effects_') ? { effects: production.effectsResult } : {}), ...(String(d.action).startsWith('ptz_') ? { ptz: production.ptzResult } : {}), ...(String(d.action).startsWith('signal_') ? { signals: production.signalEngine.last } : {}), ...(String(d.action).startsWith('call_') ? { call: production.callResult } : {}), ...(String(d.action).startsWith('gc_html_') ? { gcCompatible: { last: production.gcCompatible.last } } : {}), ...(String(d.action).startsWith('gc_library_') ? { gcLibrary: production.gcLibrary.last } : {}), ...(String(d.action).startsWith('audio_routing_') ? { audioRouting: production.audioRoutingEngine.last } : {}), ...(String(d.action).startsWith('settings_') ? { settings: production.settingsEngine.last } : {}), ...(String(d.action).startsWith('recovery_') ? { recovery: production.recoveryResult } : {}), ...(String(d.action).startsWith('outputs_') ? { outputs: production.outputEngine.last } : {}), ...(String(d.action).startsWith('network_') ? { network: production.networkEngine.last } : {}), ...(String(d.action).startsWith('controller_') ? { controllers: production.controllerEngine.last } : {}), ...(String(d.action).startsWith('overlay_') ? { overlays: production.overlayResult || production.overlayEngine.summary() } : {}) }); }
            if (path === '/livelan') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(liveLanDistribution.renderViewerPage());
      }
      if (path === '/api/livelan/status') {
        return json(res, 200, { success: true, ...liveLanDistribution.getStatus() });
      }
      if (path === '/api/slides') {
        if (req.method === 'GET') return json(res, 200, { success: true, ...slideEngine.summary() });
        if (req.method === 'POST') {
          const d = await body(req);
          if (d.action === 'import_pptx') {
            const src = d.bufferBase64 ? Buffer.from(d.bufferBase64, 'base64') : d.filePath;
            await slideEngine.importPptx(src, d.name);
          }
          else if (d.action === 'import_images') await slideEngine.importImages(d.images, d.name);
          else if (d.action === 'prepare_slide') slideEngine.prepareSlide(d.deckId, d.slideIndex);
          else if (d.action === 'present_slide') await slideEngine.presentSlide(d.deckId, d.slideIndex);
          else if (d.action === 'next_slide') slideEngine.nextSlide(d.deckId);
          else if (d.action === 'previous_slide') slideEngine.previousSlide(d.deckId);
          else if (d.action === 'next_animation') await slideEngine.nextAnimation(d.deckId);
          else if (d.action === 'previous_animation') await slideEngine.previousAnimation(d.deckId);
          else if (d.action === 'play_video') await slideEngine.playVideo(d.deckId);
          else if (d.action === 'pause_video') await slideEngine.pauseVideo(d.deckId);
          else if (d.action === 'restart_video') await slideEngine.restartVideo(d.deckId);
          else if (d.action === 'seek_video') await slideEngine.seekVideo(d.deckId, d.time);
          return json(res, 200, { success: true, ...slideEngine.summary() });
        }
        return json(res, 405, { success: false });
      }
      if (path === '/api/slides/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });
        res.write('data: {"connected":true}\n\n');
        const onEvent = (data) => {
          try { res.write('data: ' + JSON.stringify(data) + '\n\n'); } catch {}
        };
        slideEngine.on('event', onEvent);
        req.on('close', () => {
          slideEngine.off('event', onEvent);
        });
        return;
      }
      if (path === '/api/slides/view' || path.startsWith('/api/slides/view/')) {
        const deckId = path.replace('/api/slides/view/', '').replace('/api/slides/view', '').split('?')[0] || null;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(slideEngine.renderViewerPage(deckId));
      }
      if (path.startsWith('/api/slides/media/')) {
        const parts = path.replace('/api/slides/media/', '').split('/');
        const deckId = parts[0], fileName = parts[1];
        let filePath = join(ROOT, 'downloads/slides_cache', deckId, fileName);
        if (!existsSync(filePath)) {
          const alt1 = join(ROOT, '../3mix-panel/downloads/slides_cache', deckId, fileName);
          const alt2 = join(ROOT, '../3mix-runtime/downloads/slides_cache', deckId, fileName);
          if (existsSync(alt1)) filePath = alt1;
          else if (existsSync(alt2)) filePath = alt2;
        }
        if (!existsSync(filePath)) return json(res, 404, { error: 'Arquivo não encontrado' });
        const ext = extname(fileName).toLowerCase();
        const contentType = mime[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        return res.end(await readFile(filePath));
      }
      if (path === '/api/overlays') { if (req.method === 'GET') { try { await production.overlayEngine.refreshScenes(); } catch { } return json(res, 200, { success: true, ...production.overlayEngine.summary(), inputs: production.state.inputs.map(i => i.name) }); } if (req.method === 'POST') { const d = await body(req); const result = await production.overlayEngine.execute(d.action, d); return json(res, 200, { success: true, result, ...production.overlayEngine.summary() }); } return json(res, 405, { success: false }); }
      if (path === '/api/replay') { if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { success: false }); const d = req.method === 'POST' ? await body(req) : {}; const result = await replay.command(req.method === 'GET' ? 'status' : d.action, d); return json(res, 200, { success: true, replay: result }); }
      if (path === '/api/playout') { if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { success: false }); const d = req.method === 'POST' ? await body(req) : {}; if (req.method === 'POST' && !local(req)) return json(res, 403, { success: false, error: 'Controle de playout só no computador do 3Mix' }); const result = req.method === 'GET' ? production.playoutEngine.summary() : await production.playoutEngine.execute(d.action || 'playout_take', d); return json(res, 200, { success: true, playout: result }); }
      // A page shown in a window of the program asks for that window to be closed (it cannot close itself).
      if (path === '/api/panel-open') {
        if (req.method !== 'POST') return json(res, 405, { success: false }); if (!local(req)) return json(res, 403, { success: false, error: 'Só no computador do 3Mix' }); const d = await body(req); const known = {
          '/transmitir': ['Configurações de streaming', 700, 445],
          '/gravar': ['Configuração de gravação', 760, 560],
          '/externo': ['Saídas externas', 900, 620],
          '/multicorder': ['MultiGravação', 1040, 680],
          '/iso': ['MultiGravação', 1040, 680],
          '/calls': ['Chamada de Vídeo', 700, 540],
          '/replay': ['Replay', 1440, 900],
          '/settings': ['Configurações', 1280, 800],
          '/configuracoes': ['Configurações', 1280, 800],
          '/audio': ['Áudio · Mixer e processamento', 1360, 850],
          '/atalhos': ['Atalhos', 700, 500],
          '/playout': ['Media & Playout Engine', 1200, 760],
          '/playout-monitor': ['Playout Monitor', 900, 500],
          '/overlays': ['Controle de Overlays (DSK 1 a 8)', 920, 620],
          '/multiview': ['Multiview', 1280, 720],
          '/multiview-montagem.html': ['Montagem do Multiview', 1280, 800],
          '/sobre.html': ['Sobre e suporte', 1100, 800],
          '/docs/manual.html': ['3Mix · Manual Completo', 1280, 840],
          '/docs/usuario/manual-operador.html': ['3Mix · Manual do Operador', 1280, 840],
          '/docs/api.html': ['3Mix · Manual da API e Integrações', 1280, 840],
          '/docs/srt-alpha.html': ['3Mix · Guia SRT 4:4:4 com Alpha', 1180, 820],
          '/rundown': ['Roteiro de Produção (Rundown)', 1100, 720],
          '/retornos': ['Retornos de Externa SRT & N-1', 900, 600],
          '/blackbox': ['Caixa-Preta de Incidentes (Blackbox)', 1160, 820],
          '/primeira-execucao': ['Configurar este computador', 1180, 820],
          '/preflight': ['Pre-Flight ? Checklist de seguran?a', 1120, 820],
          '/modular': ['3Mix Modular Studio', 1280, 800],
          '/modulos': ['Módulos em standby', 700, 620],
          '/ptz': ['PTZ', 1280, 800],
          '/me': ['M/E', 1440, 900],
          '/color': ['Color Studio 3Mix', 1440, 900],
          '/chroma': ['3Mix Chroma Key Studio', 1280, 800],
          '/estudio': ['3Mix Virtual Studio 2.5D', 1360, 850],
          '/social': ['3Mix Social & Moderação', 1280, 820],
          '/novo-projeto/': ['Novo Projeto 3Mix', 800, 600],
          '/dados': ['Fontes de Dados & GC', 850, 600],
          '/compor': ['Composições e Multi-Box', 900, 640],
          '/macros': ['Automações e Macros', 850, 600],
          '/recuperacao': ['Recuperação de Sessão', 800, 500],
          '/diagnosticos': ['Diagnósticos e Relatórios', 900, 650],
          '/saidas': ['Central de Saídas Broadcast', 950, 650],
          '/rede': ['Rede Multipath', 1100, 800],
          '/hub': ['Hub de Produção 3Mix', 1050, 700],
          '/': ['3Mix Pro']
        }[String(d.route).split(/[?#]/)[0]]; if (!known || String(d.route).length > 600) return json(res, 400, { success: false, error: 'Janela desconhecida' }); const [title, width, height] = known; const rundownWindow = String(d.route).split(/[?#]/)[0] === '/rundown'; const nativeUrl = 'http://127.0.0.1:' + PORT + d.route + (rundownWindow ? (String(d.route).includes('?') ? '&' : '?') + 'janela=3mix' : ''); const r = await production.optional('CallVendorRequest', { vendorName: 'freemix', requestType: 'open_panel', requestData: { url: nativeUrl, title, ...(width ? { width, height } : {}) } }); return json(res, 200, { success: r?.responseData?.success === true });
      }
      if (path === '/api/panel-title') {
        if (req.method !== 'POST') return json(res, 405, { success: false });
        if (!local(req)) return json(res, 403, { success: false, error: 'Só no computador do 3Mix' });
        const d = await body(req), url = String(d.url || ''), title = String(d.title || '').trim();
        if (url.length > 600 || !/^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}\//.test(url)) return json(res, 400, { success: false, error: 'Janela inválida' });
        if (!title || title.length > 100 || /[\x00-\x1f]/.test(title)) return json(res, 400, { success: false, error: 'Título inválido' });
        const result = await production.optional('CallVendorRequest', { vendorName: 'freemix', requestType: 'set_panel_title', requestData: { url, title } });
        return json(res, 200, { success: result?.responseData?.success === true });
      }
      if (path === '/api/panel-close') { if (req.method !== 'POST') return json(res, 405, { success: false }); if (!local(req)) return json(res, 403, { success: false, error: 'Só no computador do 3Mix' }); const d = await body(req), url = String(d.url || ''); if (url.length > 600 || !/^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}\//.test(url)) return json(res, 400, { success: false, error: 'Janela inválida' }); let success = false; for (let attempt = 0; attempt < 5; attempt++) { const r = await production.optional('CallVendorRequest', { vendorName: 'freemix', requestType: 'close_panel', requestData: { url } }); if (r?.responseData?.success === true) { success = true; break; } await new Promise(done => setTimeout(done, 200)); } return json(res, 200, { success }); }
      if (path === '/api/thumbs') { if (req.method !== 'GET') return json(res, 405, { success: false }); return json(res, 200, { thumbs: await thumbsEngine.snapshot() }); }
      if (path === '/api/video-settings') {
        if (req.method !== 'GET') return json(res, 405, { success: false });
        if (!local(req)) return json(res, 403, { success: false, error: 'Configuração de vídeo somente neste computador' });
        try { return json(res, 200, { success: true, video: await production.req('GetVideoSettings') }); }
        catch (error) { return json(res, 503, { success: false, error: error.message }); }
      }
      if (path === '/api/color/frame') {
        if (req.method !== 'GET') return json(res, 405, { success: false });
        if (!local(req)) return json(res, 403, { success: false, error: 'Color Studio disponível somente neste computador' });
        const key = u.searchParams.get('input') || '';
        if (!/^[A-Za-z0-9_-]{4,80}$/.test(key)) return json(res, 400, { success: false, error: 'Input inválido' });
        const data = await thumbsEngine.preview(key);
        if (!data) return json(res, 404, { success: false, error: 'Sem quadro para este Input' });
        const comma = data.indexOf(',');
        if (comma < 0) return json(res, 502, { success: false, error: 'Quadro inválido' });
        const buf = Buffer.from(data.slice(comma + 1), 'base64');
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store', 'Content-Length': buf.length });
        res.end(buf);
        return;
      }
      if (path === '/api/ptz/preview') {
        if (req.method !== 'GET') return json(res, 405, { success: false });
        if (!local(req)) return json(res, 403, { success: false, error: 'Preview PTZ disponível somente neste computador' });
        const key = u.searchParams.get('input') || '';
        if (!/^[A-Za-z0-9_-]{4,80}$/.test(key)) return json(res, 400, { success: false, error: 'Input inválido' });
        const data = await thumbsEngine.preview(key);
        if (!data) return json(res, 404, { success: false, error: 'Sem quadro para este Input' });
        const comma = data.indexOf(',');
        if (comma < 0) return json(res, 502, { success: false, error: 'Quadro inválido' });
        const buf = Buffer.from(data.slice(comma + 1), 'base64');
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store', 'Content-Length': buf.length });
        res.end(buf);
        return;
      }
      if (path === '/api/inputs-health') {
        if (req.method === 'GET') return json(res, 200, { success: true, summary: inputHealth.getSummary(), inputs: inputHealth.getSnapshot(), logs: inputHealth.getLogs(20) });
        if (req.method === 'POST') {
          if (!local(req)) return json(res, 403, { success: false, error: 'Telemetria local' });
          const d = await body(req);
          if (d.action === 'register') return json(res, 200, { success: true, input: inputHealth.registerInput(d.uuid, d.name, d.type) });
          if (d.action === 'unregister') return json(res, 200, { success: inputHealth.unregisterInput(d.uuid) });
          if (d.action === 'frame') return json(res, 200, { success: true, input: inputHealth.updateFrameTelemetry(d.uuid, d) });
          if (d.action === 'audio') return json(res, 200, { success: true, input: inputHealth.updateAudioTelemetry(d.uuid, d) });
          if (d.action === 'tally') return json(res, 200, { success: true, inputs: inputHealth.setTally(d.programUuid, d.previewUuid, d.overlays) });
          return json(res, 400, { success: false, error: 'Ação de telemetria inválida' });
        }
        return json(res, 405, { success: false });
      }
      if (path === '/api/multiview-montagens') {
        if (req.method === 'GET') return json(res, 200, { success: true, montagens: await lerMontagens(ROOT) });
        if (req.method === 'POST') {
          if (!local(req)) return json(res, 403, { success: false, error: 'Montagem do Multiview somente neste computador' });
          const d = await body(req);
          return json(res, 200, { success: true, montagens: await salvarMontagens(ROOT, d.montagens) });
        }
        return json(res, 405, { success: false });
      }
      if (path === '/api/multiview') {
        if (req.method === 'GET') return json(res, 200, multiviewEngine.syncWithProduction(clean(), inputHealth.getSummary()));
        if (req.method === 'POST') {
          if (!local(req)) return json(res, 403, { success: false, error: 'MultiView local' });
          const d = await body(req);
          if (d.action === 'set_layout') return json(res, 200, { success: true, snapshot: multiviewEngine.setLayout(d.layoutId, d) });
          if (d.action === 'safe_zones') return json(res, 200, { success: true, safeZones: multiviewEngine.configureSafeZones(d) });
          if (d.action === 'assign_slot') return json(res, 200, { success: true, slot: multiviewEngine.assignSlot(d.slotIndex, d) });
          if (d.action === 'clear_slot') return json(res, 200, { success: multiviewEngine.clearSlot(d.slotIndex) });
          return json(res, 400, { success: false, error: 'Ação de multiview inválida' });
        }
        return json(res, 405, { success: false });
      }
      if (await handleDiagnostico({ path, req, res, local, json, body, production, root: ROOT })) return;
      if (path === '/api/projects-copy') {
        if (!local(req)) return json(res, 403, { success: false, error: 'Gerenciamento de projetos somente neste computador' });
        if (req.method === 'GET') return json(res, 200, { success: true, templates: await listProjectTemplates(ROOT) });
        if (req.method === 'POST') {
          const d = await body(req);
          if (d.action === 'saveas') return json(res, 200, await copySceneCollectionOnDisk(ROOT, d.from, d.name));
          if (d.action === 'save_template') return json(res, 200, { success: true, ...(await saveProjectTemplate(ROOT, d)) });
          if (d.action === 'get_template') return json(res, 200, { success: true, template: await getProjectTemplate(ROOT, d.templateId) });
          if (d.action === 'delete_template') return json(res, 200, { success: true, ...(await deleteProjectTemplate(ROOT, d.templateId)) });
          if (d.action === 'apply_template') return json(res, 200, { success: true, ...(await applyProjectTemplateToCollection(ROOT, d)) });
          return json(res, 400, { success: false, error: 'Ação de projeto inválida' });
        }
        return json(res, 405, { success: false });
      }
      if (handleMixEffects && await handleMixEffects({ req, res, path, local, authorized, originAllowed, json, body, mixes: production.outputEngine.mixes })) return;
      if (handleStudioSocial && await handleStudioSocial({ req, res, path, local, authorized, originAllowed, json, body, production })) return;
      if (path === '/api/mix-audio') {
        if (req.method !== 'GET') return json(res, 405, { success: false });
        return json(res, 200, { success: true, ...production.mixAudio.summary() });
      }
      if (path === '/api/patch') {
        if (req.method !== 'GET') return json(res, 405, { success: false });
        return json(res, 200, { success: true, ...production.patchRegistry.summary() });
      }
      if (path === '/api/signals') {
        if (req.method !== 'GET') return json(res, 405, { success: false });
        return json(res, 200, { success: true, ...(await production.signalRegistry.summary()) });
      }
      if (path === '/api/ptz') {
        if (req.method !== 'GET') return json(res, 405, { success: false });
        if (!local(req)) return json(res, 403, { success: false, error: 'PTZ disponível somente neste computador' });
        return json(res, 200, { success: true, ptz: production.ptzManager.summary() });
      }
      if (path === '/api/aux-routing') {
        if (req.method === 'GET') return json(res, 200, { success: true, matrix: auxOutputRouter.getRoutingMatrix(), logs: auxOutputRouter.getLogs(20) });
        if (req.method === 'POST') {
          if (!local(req)) return json(res, 403, { success: false, error: 'Roteamento AUX local' });
          const d = await body(req);
          if (d.action === 'configure') { const resAux = auxOutputRouter.setAuxBusConfig(d.auxId, d); await auxOutputRouter.save().catch(() => { }); return json(res, 200, { success: true, bus: resAux, matrix: auxOutputRouter.getRoutingMatrix() }); }
          if (d.action === 'cut') { const resCut = await auxOutputRouter.quickCut(d.auxId, d); await auxOutputRouter.save().catch(() => { }); return json(res, 200, { success: true, cut: resCut, matrix: auxOutputRouter.getRoutingMatrix() }); }
          if (d.action === 'route') { const resRoute = auxOutputRouter.routeOutput(d.targetId, d); await auxOutputRouter.save().catch(() => { }); return json(res, 200, { success: true, binding: resRoute, matrix: auxOutputRouter.getRoutingMatrix() }); }
          if (d.action === 'reset') { auxOutputRouter.initDefaults(); await auxOutputRouter.save().catch(() => { }); return json(res, 200, { success: true, matrix: auxOutputRouter.getRoutingMatrix() }); }
          return json(res, 400, { success: false, error: 'Ação de roteamento AUX inválida' });
        }
        return json(res, 405, { success: false });
      }
      if (path === '/api/outputs-watchdog') {
        if (req.method === 'GET') return json(res, 200, { success: true, summary: outputWatchdog.getSummary(), outputs: outputWatchdog.getSnapshot(), logs: outputWatchdog.getLogs(20) });
        if (req.method === 'POST') {
          if (!local(req)) return json(res, 403, { success: false, error: 'Watchdog local' });
          const d = await body(req);
          if (d.action === 'register') return json(res, 200, { success: true, output: outputWatchdog.registerOutput(d.id, d) });
          if (d.action === 'start') return json(res, 200, { success: true, output: outputWatchdog.onStreamStarted(d.id) });
          if (d.action === 'stop') return json(res, 200, { success: true, output: outputWatchdog.onStreamStopped(d.id, d) });
          if (d.action === 'drop') return json(res, 200, { success: true, output: outputWatchdog.onStreamDrop(d.id, d) });
          if (d.action === 'telemetry') return json(res, 200, { success: true, output: outputWatchdog.updateTelemetry(d.id, d) });
          if (d.action === 'reset') return json(res, 200, { success: true, output: outputWatchdog.resetCircuit(d.id) });
          return json(res, 400, { success: false, error: 'Ação de watchdog inválida' });
        }
        return json(res, 405, { success: false });
      }
      if (path === '/api/preflight') {
        if (!production.preflightEngine) return json(res, 503, { success: false, error: 'Pre-Flight indisponível neste painel' });
        if (req.method === 'GET') {
          const result = await production.preflightEngine.runCheck({ item: u.searchParams.get('item') || undefined, alvo: u.searchParams.get('alvo') || undefined });
          return json(res, 200, { success: true, verdict: result.verdict, ...result, preflight: result });
        }
        if (req.method === 'POST') { const d = await body(req); if (!String(d.action || '').startsWith('preflight_')) return json(res, 400, { success: false, error: 'Informe uma ação preflight_' }); if (!['preflight_check', 'preflight_run', 'preflight_summary', 'preflight_history'].includes(d.action) && !local(req)) return json(res, 403, { success: false, error: 'Fechar programas e liberar bloqueios só no computador do 3Mix' }); return json(res, 200, { success: true, result: await production.preflightEngine.execute(d.action, d) }); }
        return json(res, 405, { success: false });
      }
      if (path === '/api/blackbox') {
        if (req.method === 'GET') return json(res, 200, { success: true, ...production.blackboxEngine.summary() });
        if (req.method === 'POST') { const d = await body(req); const result = await production.blackboxEngine.execute(d.action || 'blackbox_mark', d); return json(res, 200, { success: true, result, ...production.blackboxEngine.summary() }); }
        return json(res, 405, { success: false });
      }
      if (path === '/api/delay') {
        if (req.method === 'GET') { await production.broadcastDelayEngine.refresh(true); return json(res, 200, { success: true, ...production.broadcastDelayEngine.summary() }); }
        if (req.method === 'POST') { const d = await body(req); if (!d.action) return json(res, 400, { success: false, error: 'Informe a ação: dump, delay_set, delay_enable ou delay_disable' }); if (d.action !== 'dump' && d.action !== 'delay_dump' && d.action !== 'delay_summary' && !local(req)) return json(res, 403, { success: false, error: 'A configuração do atraso só pode ser mudada no computador do 3Mix' }); const result = await production.broadcastDelayEngine.execute(d.action, d); return json(res, 200, { success: true, result, ...production.broadcastDelayEngine.summary() }); }
        return json(res, 405, { success: false });
      }
      if (path === '/api/return-feeds') {
        if (req.method === 'GET') return json(res, 200, { success: true, ...production.returnFeedManager.summary() });
        if (req.method === 'POST') { const d = await body(req); const result = await production.returnFeedManager.execute(d.action, d); return json(res, 200, { success: true, result, ...production.returnFeedManager.summary() }); }
        return json(res, 405, { success: false });
      }
      if (path === '/api/rundown') {
        const rundownSummary = () => { try { return production.rundownEngine?.summary?.() || { success: false, error: 'Motor de Rundown indisponível nesta instalação' }; } catch (error) { return { success: false, error: error.message }; } };
        if (req.method === 'GET') return json(res, 200, { success: true, ...rundownSummary() });
        if (req.method === 'POST') {
          const d = await body(req), action = String(d.action || 'rundown_summary');
          const liveActions = new Set(['rundown_prepare', 'rundown_execute', 'rundown_auto_advance', 'rundown_skip', 'rundown_arm', 'rundown_suspend', 'rundown_end', 'rundown_reopen']);
          try {
            if (typeof production.rundownEngine?.execute !== 'function') throw Error('Motor de Rundown indisponível nesta instalação');
            const dispatched = liveActions.has(action) && typeof production.runRundown === 'function' ? await production.runRundown(action, d) : await production.rundownEngine.execute(action, d);
            const result = dispatched && typeof dispatched === 'object' && 'result' in dispatched && 'state' in dispatched ? dispatched.result : dispatched;
            return json(res, 200, { success: true, result, ...(dispatched?.refreshError ? { warning: 'Comando confirmado; a atualização visual falhou: ' + dispatched.refreshError } : {}), ...rundownSummary() });
          } catch (error) {
            const summary = rundownSummary();
            const code = error.code === 'RUNDOWN_CONFLICT' ? 409 : error.code === 'RUNDOWN_PARTIAL' ? 409 : 400;
            return json(res, code, { success: false, error: error.message, code: error.code || null, result: error.result || null, validation: error.validation || null, summary });
          }
        }
        return json(res, 405, { success: false });
      }
      if (path === '/api/ducking') {
        if (req.method === 'GET') return json(res, 200, { success: true, ...production.audioDuckingEngine.summary() });
        if (req.method === 'POST') { const d = await body(req); const result = await production.audioDuckingEngine.execute(d.action, d); return json(res, 200, { success: true, result, ...production.audioDuckingEngine.summary() }); }
        return json(res, 405, { success: false });
      }
      if (path === '/api/iso') { if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { success: false }); const d = req.method === 'POST' ? await body(req) : {}; const action = req.method === 'GET' ? 'status' : d.action; if (!['status', 'start', 'stop', 'configure'].includes(action)) throw new Error('Ação ISO inválida'); if ((action === 'configure' || d.options) && !local(req)) return json(res, 403, { success: false, error: 'Opções de gravação só no computador do 3Mix' }); return json(res, 200, { success: true, iso: await iso.command(action, d) }); }
      // MultiCorder (Fase 3): disco físico real por câmera + colisão (duas câmeras no
      // MESMO disco físico, não só pastas diferentes). Só leitura do sistema de arquivos
      // (statfs/PowerShell Get-Partition), nunca chama o motor — funciona mesmo sem
      // conexão nativa, ao contrário de /api/iso. Câmera sem override explícito de pasta
      // (perInput[x].directory vazio) usa o diretório padrão do motor, que esta rota não
      // resolve sem GetRecordDirectory — reportada como supported:false com o motivo, nunca
      // inventando um caminho.
      if (path === '/api/multicorder/discos' && req.method === 'GET') {
        if (!authorized(req)) return json(res, 401, { success: false, error: 'Autorize este dispositivo com o código do computador 3Mix' });
        const options = iso.state?.recordOptions || {};
        const porNome = {};
        for (const input of production.state?.inputs || []) {
          const dir = options.perInput?.[input.name]?.directory || options.perInput?.[input.key]?.directory;
          if (dir) porNome[input.name] = dir;
        }
        const resultado = await mapaMultiCorder(porNome);
        const semOverride = (production.state?.inputs || []).map((i) => i.name).filter((n) => !(n in porNome));
        const camsCount = Math.max(1, Object.keys(porNome).length || (production.state?.inputs || []).length || 1);
        const reportGeral = options.directory ? await diskReport(options.directory) : null;
        const estimativa = estimativaMultiCorder({
          format: options.format || 'mpegts',
          encoder: options.encoder || 'default',
          crf: options.crf ?? 23,
          camsCount,
          broadcastProfile: options.broadcastProfile || null,
          freeGb: reportGeral?.freeGb ?? null
        });
        return json(res, 200, { success: true, ...resultado, semOverrideDePasta: semOverride, estimativa, perfisBroadcast: BROADCAST_PROFILES });
      }
      if (path === '/api/multicorder/benchmark' && req.method === 'POST') {
        if (!local(req)) return json(res, 403, { success: false, error: 'Benchmark de gravação restrito ao computador local' });
        const b = await body(req);
        const options = iso.state?.recordOptions || {};
        const dirs = Array.isArray(b.diretorios) && b.diretorios.length ? b.diretorios : (options.directory ? [options.directory] : []);
        const bench = await testeEscritaConcorrente(dirs);
        return json(res, 200, bench);
      }
      if (['/api', '/api/', '/api/json'].includes(path)) {
        const fn = u.searchParams.get('Function') || u.searchParams.get('function');
        if (fn) { try { await vmix(fn, u.searchParams); if (path === '/api/json') return json(res, 200, { success: true }); res.writeHead(200, { 'Content-Type': 'text/xml' }); res.end('<Function result="Success"/>'); } catch (e) { if (path === '/api/json') return json(res, 400, { success: false, error: e.message }); res.writeHead(400, { 'Content-Type': 'text/xml' }); res.end(`<Function result="Error" message="${xml(e.message)}"/>`); } return; }
        if (path === '/api/json') return json(res, 200, clean()); res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' }); res.end(production.statusXml()); return;
      }
      return json(res, 404, { success: false, error: 'API não encontrada' });
    }
    let file;
    // Dispositivo novo caindo direto no link de um módulo: pede o código no Hub e volta para o módulo.
    if (routes[path] && path !== '/' && path !== '/hub' && req.method === 'GET' && wantsHtml(req) && !authorized(req)) { res.writeHead(302, { Location: '/hub?next=' + encodeURIComponent(path + u.search) }); res.end(); return; }
    if (routes[path]) file = join(PANEL, 'remoto', (path === '/replay' && u.searchParams.get('view') === 'settings' ? 'replay-settings' : routes[path]) + '.html');
    else if (path === '/efeitos/srt-packed-alpha.shader') { res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="srt-packed-alpha.shader"'); const shader = await readFile(join(PANEL, 'efeitos/srt-packed-alpha.shader')); res.writeHead(200); res.end(shader); return; }
    else {
      const decoded = decodeURIComponent(path); if (decoded.includes('\\') || decoded.includes('\0')) throw new Error('Caminho inválido');
      const rel = decoded.replace(/^\/+/, ''), target = resolve(PANEL, rel); if (relative(PANEL, target).startsWith('..') || relative(PANEL, target) === '') throw new Error('Caminho inválido');
      if (/(^|\/)(local\.js|.*\.ini|.*\.salvo|.*\.bak)$/i.test(rel) && !local(req)) return json(res, 403, { success: false, error: 'Arquivo privado' });
      file = [resolve(PANEL, 'remoto', rel), target].find(f => !relative(PANEL, f).startsWith('..') && ['.html', '.js', '.mjs', '.css', '.png', '.gif', '.jpg', '.webp', '.bmp', '.svg', '.woff2', '.woff', '.ttf', '.otf', '.json', '.txt', '.md'].includes(extname(f)) && existsSync(f));
    }
    if (!file) { if (wantsHtml(req)) return sendErrorPage(res, 404, req.url, 'HTTP 404 · página não encontrada nesta instalação'); res.writeHead(404).end('Não encontrado'); return; }
    try { let data = await readFile(file); if (TELA_COM_REGISTRO.test(relative(PANEL, file))) data = comRegistroDeErros(data); res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }); res.end(data); } catch (e) { if (e.code === 'ENOENT') { if (wantsHtml(req)) return sendErrorPage(res, 404, req.url, 'HTTP 404 · arquivo da página ausente'); res.writeHead(404).end('Não encontrado'); } else throw e; }
  } catch (e) { const operation = controlReceipt(controlOperation); if (wantsHtml(req) && !res.headersSent) return sendErrorPage(res, req.method === 'GET' || req.method === 'HEAD' ? 500 : 400, req.url, e.message); json(res, 400, { success: false, error: e.message, ...(operation ? { operation } : {}) }); }
}
const server = createServer(createProjectHttpDispatcher({ binding: projectBinding, handler: handleHttp, local, authorized, originAllowed, readBody: readProjectBody, json }));
const wss = new WebSocketServer({ noServer: true, maxPayload: 32768 });
const callWss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
// 3Mix Crew — Tally: WebSocket próprio, nunca o /ws principal. maxPayload baixo (1KB) e
// nenhum listener de 'message' é registrado (ver conexão abaixo) — um dispositivo de Tally
// não tem NENHUM jeito de mandar um comando por esse canal, nem por bug de cliente.
const crewTallyWss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
// 3Mix Crew — Intercom: WebSocket de áudio, somente saída (buffers PCM de mixReturn, sem
// framing extra — mesmo formato binário que /api/calls/audio já envia). maxPayload baixo
// (4KB, suficiente só para o eventual handshake inicial; o canal nunca aceita payload
// grande do cliente porque nunca processa nada que o cliente mande).
const crewIntercomWss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
server.on('upgrade', (req, socket, head) => {
  if (projectBinding.gate.shouldSkipBackground()) { socket.write('HTTP/1.1 409 Conflict\r\n\r\n'); socket.destroy(); return; } const u = new URL(req.url, 'http://localhost'); if (u.pathname === '/api/calls/audio') {
    if (!local(req) || !originAllowed(req) || !equal(u.searchParams.get('token'), production.callEngine.returns.token)) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
    callWss.handleUpgrade(req, socket, head, ws => production.callEngine.returns.accept(ws, u.searchParams.get('key'))); return;
  } if (u.pathname === '/api/crew/tally/ws') {
    if (!authorized(req) || !originAllowed(req)) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
    const watching = u.searchParams.get('watching') || 'main';
    crewTallyWss.handleUpgrade(req, socket, head, async ws => { crewTallyClients.add({ ws, watching }); ws.send(JSON.stringify(await crewTally.forDevice(watching).catch(() => null))); ws.on('close', () => { for (const c of crewTallyClients) if (c.ws === ws) crewTallyClients.delete(c); }); ws.on('message', () => { }); });
    return;
  } if (u.pathname === '/api/crew/intercom/ws') {
    // Canal de ÁUDIO puro, somente saída (ver crew-intercom-transport-ws.mjs). O memberId
    // precisa já estar cadastrado (register_member, local) — conectar com um memberId
    // desconhecido é recusado, nunca cria um membro implícito por engano.
    if (!authorized(req) || !originAllowed(req)) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
    const memberId = u.searchParams.get('member') || '';
    if (!crewIntercom.members.has(memberId)) { socket.write('HTTP/1.1 404 Not Found\r\n\r\n'); socket.destroy(); return; }
    crewIntercomWss.handleUpgrade(req, socket, head, ws => crewIntercomTransport.attach(memberId, ws));
    return;
  } if (u.pathname !== '/ws' || !authorized(req)) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; } wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});
wss.on('connection', (ws, request) => {
  clients.add(ws); ws.send(JSON.stringify({ type: 'init', data: clean() })); ws.on('close', () => clients.delete(ws));
  ws.on('message', async raw => { let m; try { await admitProjectSocketMessage(projectBinding, async () => { m = JSON.parse(String(raw)); if ((String(m.action).startsWith('gc_html_') || m.action === 'data_file' || ['gc_library_save', 'gc_library_duplicate', 'gc_library_remove','gc_library_style_many','gc_library_reorder','gc_library_remove_many', 'gc_library_import', 'gc_library_export', 'gc_library_asset', 'gc_library_variant', 'gc_library_unlink', 'gc_library_clock_restart'].includes(m.action) || String(m.action).startsWith('settings_') || String(m.action).startsWith('call_') || String(m.action).startsWith('recovery_') || (String(m.action).startsWith('macro_') && !['macro_run', 'macro_cancel'].includes(m.action)) || String(m.action).startsWith('outputs_') || String(m.action).startsWith('network_') || String(m.action).startsWith('audio_routing_') || String(m.action).startsWith('effects_') || m.action === 'signal_configure' || ['controller_save', 'controller_remove', 'controller_enable', 'controller_osc_configure', 'controller_osc_start', 'controller_osc_stop', 'delay_set', 'delay_enable', 'delay_disable', 'preflight_bypass', 'preflight_process_close', 'preflight_process_ignore', 'preflight_process_unignore', 'blackbox_clear'].includes(m.action)) && !local(request)) throw new Error('Configuração local só no computador do 3Mix'); const data = m.action === 'replay' ? await replay.command(m.cmd, m) : await production.run(m.action, m); ws.send(JSON.stringify({ type: 'ack', id: m.id, success: true, data })); }); } catch (e) { ws.send(JSON.stringify({ type: 'ack', id: m?.id, success: false, error: e.message })); } });
});
const ticker = setInterval(async () => {
  if (!obs || connecting || pollingGeneration !== null || projectBinding.gate.shouldSkipBackground()) return; const current = obs, generation = connectionGeneration; pollingGeneration = generation;
  try {
    await production.tick(); if (obs !== current || generation !== connectionGeneration) return; connectionReady = production.state.connected === true; delete connectionErrors.production; production.sessionRecovery.tick();
    for (const [name, component] of [['iso', iso], ['replay', replay]]) { if (obs !== current || generation !== connectionGeneration) return; if (!moduloAtivo(name)) continue; try { await component.command('status'); delete connectionErrors[name]; } catch (e) { if (obs === current && generation === connectionGeneration) connectionError(name, e); } }
  } catch (e) { if (obs === current && generation === connectionGeneration) { connectionReady = false; production.disconnected(); connectionError('production', e); } }
  finally { if (pollingGeneration === generation) pollingGeneration = null; }
}, 1000);
// 3Mix Crew — Tally: ticker PRÓPRIO, separado do ticker principal acima. Só faz o trabalho
// de meTally() (GetSceneItemList por M/E ativo) quando existe pelo menos um dispositivo de
// Tally conectado — nenhum custo extra de fundo quando ninguém está olhando o Tally. Cada
// cliente recebe só o que monitora (forDevice), nunca o estado cru de outro destino.
const crewTallyTicker = setInterval(async () => {
  if (!crewTallyClients.size) return;
  const porDestino = new Map();
  for (const { ws, watching } of crewTallyClients) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    if (!porDestino.has(watching)) porDestino.set(watching, await crewTally.forDevice(watching).catch(() => null));
    const payload = porDestino.get(watching); if (payload) ws.send(JSON.stringify(payload));
  }
}, 1000); crewTallyTicker.unref();
server.on('error', e => {
  // Fase 3.3 ("mensagens acionáveis para: porta ocupada"): sem isto, EADDRINUSE
  // derrubava o processo com um stack trace cru no console, sem dizer ao
  // operador o que fazer. Mensagem só em pt-BR amigável, sem alterar nenhum
  // outro comportamento — o processo ainda encerra (correto: não dá para
  // seguir sem a porta), só com uma causa clara em vez de um crash mudo.
  if (e?.code === 'EADDRINUSE') { console.error(`3Mix: a porta ${PORT} já está em uso por outro programa (ou por uma instância anterior do 3Mix que não fechou direito). Feche o outro programa, ou reinicie pelo DESLIGAR-3MIX.cmd seguido de INICIAR-3MIX.cmd, e tente de novo.`); process.exit(1); }
  if (e?.code === 'EACCES') { console.error(`3Mix: sem permissão para abrir a porta ${PORT}. Tente executar como administrador, ou verifique se um antivírus/firewall está bloqueando.`); process.exit(1); }
  console.error('3Mix: falha ao iniciar o servidor da API:', e?.message || e); process.exit(1);
});
server.listen(PORT, process.env.FREEMIX_API_HOST || '127.0.0.1', () => { console.log(`3Mix: API e consoles na porta ${PORT}.`); startConnection(); });
function stop() { if (stopping) return; stopping = true; production.gtTickerAck.dispose(); connectionGeneration++; connectionReady = false; production.sessionRecovery.finish('api-restart').catch(() => { }); clearInterval(ticker); clearTimeout(reconnectTimer); for (const c of clients) c.close(); vmixTcp?.stop().catch(() => { }); production.callEngine.returns.stop().catch(() => { }); production.networkEngine.stop().catch(() => { }); replay.dispose().catch(e => connectionError('replay-preview-close', e)); iso.dispose().catch(e => connectionError('iso-preview-close', e)); crewIntercomTransport.close(); crewIntercom.close().catch(() => { }); obs?.close(); wss.close(); callWss.close(); crewTallyWss.close(); crewIntercomWss.close(); server.close(); }
process.on('SIGTERM', stop); process.on('SIGINT', stop);
// One bad native event or panel request must not take every open window offline.
// The failure is recorded in api-error.log and the control API keeps serving.
process.on('uncaughtException', error => connectionError('uncaught', error));
process.on('unhandledRejection', error => connectionError('unhandled-rejection', error));
