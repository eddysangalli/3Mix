// Headless click/read test of the settings and operational windows against the offline fixture engine.
// No installed program, no certificate, no real output: the pages are served from the repository and the API is fake.
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';

const here = import.meta.dirname, shots = path.join(here, 'retratos');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 12000) => { for (const end = Date.now() + ms; Date.now() < end;) { const v = await fn().catch(() => null); if (v) return v; await sleep(200); } return null; };
const freePort = async () => { const s = net.createServer(); await new Promise((r) => s.listen(0, '127.0.0.1', r)); const n = s.address().port; await new Promise((r) => s.close(r)); return n; };

let pass = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (ok) pass++; console.log(`${ok ? 'OK   ' : 'FALHA'} ${name}${detail ? '  (' + String(detail).slice(0, 240) + ')' : ''}`); return ok; };

const serverPort = await freePort();
const fixture = spawn(process.execPath, [path.join(here, 'fixture-server.mjs'), String(serverPort)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = ''; fixture.stdout.on('data', (b) => { serverLog += b; }); fixture.stderr.on('data', (b) => { serverLog += b; });
if (!await until(async () => serverLog.includes('FIXTURE_READY'), 15000)) { console.error('fixture não subiu:\n' + serverLog); process.exit(1); }
const base = 'http://127.0.0.1:' + serverPort;

const profile = path.join(here, 'perfil-borda'); await fs.rm(profile, { recursive: true, force: true }); await fs.mkdir(profile, { recursive: true });
const debugPort = await freePort();
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--window-size=1280,820', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const version = await until(async () => (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json(), 20000);
if (!version) { console.error('Edge não abriu'); process.exit(1); }
const socket = new WebSocket(version.webSocketDebuggerUrl); await new Promise((r) => { socket.onopen = r; });
let id = 0; const pending = new Map(), problems = [];
const cdp = (method, params = {}, sessionId) => new Promise((resolve) => { const n = ++id; pending.set(n, resolve); socket.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) })); });
socket.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result ?? d); pending.delete(d.id); return; }
  if (d.method === 'Runtime.exceptionThrown') { const t = d.params.exceptionDetails; problems.push(String(t?.exception?.description || t?.text).slice(0, 300)); }
};
const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
for (const d of ['Page', 'Runtime', 'Log']) await cdp(d + '.enable', {}, sessionId);
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false }, sessionId);
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: 'window.confirm = () => true; window.close = () => { window.__closed = true; };' }, sessionId);
const ev = async (expression) => { const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || 'erro na página'); return r.result?.value; };
const open = async (route) => { await cdp('Page.navigate', { url: base + route }, sessionId); await sleep(900); };
const resize = async (width, height) => { await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId); await sleep(200); };
const inViewport = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; const r = e.getBoundingClientRect(); return r.top >= -1 && r.bottom <= innerHeight + 1 && r.width > 0; })()`);
const shot = async (name) => { await fs.mkdir(shots, { recursive: true }); await fs.writeFile(path.join(shots, name + '.png'), Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' }, sessionId)).data, 'base64')); };
const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return 'sem elemento'; e.click(); return 'ok'; })()`);
const text = (sel) => ev(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
const value = (sel) => ev(`document.querySelector(${JSON.stringify(sel)})?.value ?? null`);
const set = (sel, v) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return 'sem elemento'; e.focus(); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); e.blur(); return 'ok'; })()`);
const shown = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })()`);
const settings = async () => (await (await fetch(base + '/api/settings')).json()).settings;

try {
  // ---------------- Configurações ----------------
  await open('/configuracoes');
  await until(() => ev(`document.querySelectorAll('.settings-nav-group').length === 5`), 8000);
  check('Configurações abre com as cinco áreas', await ev(`document.querySelectorAll('.settings-nav-group').length`) === 5, await ev(`[...document.querySelectorAll('.settings-nav-title')].map(e=>e.textContent).join(' / ')`));
  check('página de teste se identifica como QA', (await ev(`document.title`)).startsWith('3Mix QA — ') && !!(await ev(`document.getElementById('qa-ambiente-teste')`)), await ev(`document.title`));
  check('nenhum item "undefined" na navegação', !(await ev(`document.querySelector('.settings-nav').textContent`)).includes('undefined'), await ev(`document.querySelector('.settings-nav').textContent.trim()`));
  check('Multiview aparece com nome', (await text('.settings-nav')).includes('Multiview'));
  check('quadro da produção e tamanho de saída separados', (await text('#content')).includes('Quadro da produção') && (await text('#content')).includes('Tamanho enviado às saídas'));
  check('presets com Personalizado', await ev(`[...document.querySelectorAll('.settings-presets button')].map(b=>b.textContent).join('|')`) === '720p|1080p|4K UHD|Vertical|Personalizado', await ev(`[...document.querySelectorAll('.settings-presets button')].map(b=>b.textContent).join('|')`));
  check('campos de escolha são selects reais', await ev(`document.querySelector('#f-video-fps')?.tagName`) === 'SELECT', await ev(`document.querySelector('#f-video-fps')?.outerHTML?.slice(0,80)`));
  check('resoluções reais por saída', (await text('#content')).includes('Saída principal') && (await text('#content')).includes('Destino adicional 3'), await text('#content'));
  await click('.settings-presets button[data-size="1280x720"]'); await sleep(300);
  check('preset mostra atual → novo', (await text('#settings-diff')).includes('1280') && (await text('#settings-diff')).includes('1920'), await text('#settings-diff'));
  check('rodapé Cancelar / Aplicar / Aplicar e fechar', await ev(`['cancel','apply','ok'].map(id=>document.getElementById(id).textContent).join(' | ')`) === 'Cancelar | Aplicar | Aplicar e fechar', await ev(`['cancel','apply','ok'].map(id=>document.getElementById(id).textContent).join(' | ')`));
  await set('#settings-search', 'branco SDR'); await sleep(300);
  check('busca encontra campo, não só categoria', (await text('#settings-search-results')).includes('Branco SDR (nits)'), await text('#settings-search-results'));
  await click('#settings-search-results button'); await sleep(500);
  check('resultado abre a categoria Cor no campo', (await text('#title')) === 'Cor' && (await value('#f-color-sdrWhiteLevel')) === '300', await text('#title'));
  check('campo mostra valor atual', (await text('#content')).includes('Atual: 300'));
  await click('#preview-toggle'); await sleep(200);
  check('prévia recolhe', await ev(`document.getElementById('settings-layout').classList.contains('preview-off')`));
  await click('#preview-toggle'); await sleep(200);
  check('prévia volta', !(await ev(`document.getElementById('settings-layout').classList.contains('preview-off')`)));
  await click('.settings-presets button[data-size="1280x720"]').catch(() => {});
  await open('/configuracoes'); await until(() => ev(`document.querySelectorAll('.settings-presets button').length > 0`), 8000);
  await click('.settings-presets button[data-size="1280x720"]'); await sleep(200);
  await click('#apply'); await sleep(1200);
  const applied = await settings();
  check('Aplicar grava o novo quadro no motor', applied.video.baseWidth === 1280 && applied.video.baseHeight === 720 && applied.video.outputWidth === 1920, `${applied.video.baseWidth}x${applied.video.baseHeight} · saída ${applied.video.outputWidth}x${applied.video.outputHeight}`);
  await shot('1-configuracoes');

  // Workspace and native preferences are separate write paths
  await open('/configuracoes?category=workspace'); await until(() => ev(`!!document.getElementById('f-workspace-cardWidth')`), 8000);
  await set('#f-workspace-cardWidth', '220'); await sleep(200);
  await click('#apply'); await sleep(1200);
  const ws = await (await fetch(base + '/api/workspace')).json();
  check('Aplicar grava o layout da mesa', ws.workspace.cardWidth === 220, JSON.stringify(ws.workspace));
  await open('/configuracoes?category=color'); await until(() => ev(`!!document.getElementById('f-color-sdrWhiteLevel')`), 8000);
  await set('#f-color-sdrWhiteLevel', '203'); await sleep(200);
  await click('#apply'); await sleep(1200);
  const nativeApplied = (await settings()).nativePreferences.fields.find((f) => f.name === 'sdrWhiteLevel')?.value;
  check('preferência nativa grava e avisa reinício', Number(nativeApplied) === 203 && (await text('#message')).includes('Reinicie'), `${nativeApplied} · ${await text('#message')}`);

  // ---------------- Gravação ----------------
  await resize(760, 560);
  await open('/gravar');
  await until(() => ev(`document.querySelectorAll('#formats button').length > 0`), 8000);
  check('gravação tem pasta com Procurar', await shown('#browse') && (await value('#directory')) === 'D:/gravacoes');
  check('gravação mostra espaço livre', (await text('#space')).includes('GB'), await text('#space'));
  check('gravação explica trilhas e divisão no avançado recolhido', await ev(`!document.getElementById('advanced-panel').open`) && (await text('#tracks-list')).includes('Master') && (await text('#split-summary')).includes('Divide'), `${await text('#tracks-list')} · ${await text('#split-summary')}`);
  check('gravação não usa área branca (fundo grafite)', await ev(`getComputedStyle(document.querySelector('.vd-card')).backgroundColor`) !== 'rgb(238, 241, 245)');
  check('gravação 760×560 com cabeçalho e rodapé visíveis', await ev(`innerWidth === 760 && innerHeight === 560`) && await inViewport('.vd-strip') && await inViewport('.vd-bar'), `${await ev('innerWidth')}x${await ev('innerHeight')}`);
  check('encoder define GPU/CPU, sem controle redundante', !(await ev(`!!document.getElementById('hardware')`)) && (await ev(`[...document.getElementById('encoder').options].some(o=>/GPU/.test(o.textContent))`)));
  check('só o corpo da gravação rola', await ev(`getComputedStyle(document.querySelector('.vd-body')).overflowY`) === 'auto' && await ev(`getComputedStyle(document.body).overflowY`) === 'hidden');
  await ev(`document.getElementById('quality').value='Stream'; document.getElementById('quality').dispatchEvent(new Event('change',{bubbles:true}))`); await sleep(300);
  check('"Igual à transmissão" mostra parâmetros e encoder', (await text('#quality-help')).includes('kbps') && (await text('#quality-help')).includes('encoder'), await text('#quality-help'));
  check('estimativa usa bitrate real e espaço livre', (await text('#estimate')).includes('MB/min') && (await text('#estimate-help')).includes('bitrate real'), await text('#estimate'));
  await ev(`document.getElementById('quality').value='HQ'; document.getElementById('quality').dispatchEvent(new Event('change',{bubbles:true}))`); await sleep(300);
  await click('#formats button[data-container="mp4"]'); await sleep(200);
  check('MP4 mostra tolerância a falhas', await shown('#tolerant-row') && (await text('#tolerant-help')).length > 10, await text('#tolerant-help'));
  if (!(await ev(`document.getElementById('tolerant').checked`))) { await click('#tolerant'); await sleep(200); }
  check('tolerância muda para MP4 recuperável', (await text('#format-help')).toLowerCase().includes('recuperável'), await text('#format-help'));
  await set('#quality', 'HQ'); await sleep(200);
  check('qualidade mostra explicação', (await text('#quality-help')).length > 10);
  await click('#ok'); await sleep(1200);
  const rec = await settings();
  check('Aplicar grava gravação confirmada', rec.values.RecQuality === 'HQ' && /hybrid_mp4|fragmented_mp4/.test(rec.values.RecFormat2), rec.values.RecFormat2);
  await shot('2-gravacao');

  // ---------------- Saídas externas ----------------
  await resize(900, 620);
  await open('/externo');
  await until(() => ev(`document.querySelectorAll('#video-source option').length > 0`), 8000);
  check('nome padrão 3Mix NDI 1', (await value('#net-name')) === '3Mix NDI 1', await value('#net-name'));
  check('estado "Saída 1 · NDI · Parada"', (await text('#sender-state')) === 'Saída 1 · NDI · Parada', await text('#sender-state'));
  check('transparência escondida quando não suportada', !(await shown('#alpha-row')) && (await text('#alpha-note')).includes('não informa suporte'));
  check('câmera virtual e tela cheia fora do formulário de rede', await ev(`document.getElementById('virtual-toggle').closest('details') !== null`));
  check('externo 900×620 com rodapé fixo e status no corpo', await ev(`innerWidth === 900 && innerHeight === 620`) && await inViewport('.vd-bar') && await ev(`!!document.getElementById('status').closest('.vd-body')`), `${await ev('innerWidth')}x${await ev('innerHeight')}`);
  await set('#net-name', 'Câmera principal NDI');
  const beforeStarts = JSON.parse(await (await fetch(base + '/api/outputs')).text()).outputs.ndi.senders.length;
  check('digitar só marca rascunho', (await text('#msg')).includes('não aplicadas') && beforeStarts === 0, await text('#msg'));
  await click('#start-one'); await sleep(1600);
  check('iniciar é explícito e confirma no ar', (await text('#start-one')) === 'Parar saída 1' && (await text('#sender-state')).includes('No ar'), await text('#sender-state'));
  check('nome personalizado preservado', (await value('#net-name')) === 'Câmera principal NDI');
  await click('#save-close'); await sleep(400);
  check('fechar não para a saída', (await (await fetch(base + '/api/outputs')).json()).outputs.ndi.senders[0].active === true);
  await open('/externo'); await until(() => ev(`document.querySelectorAll('#video-source option').length > 0`), 8000);
  check('ao reabrir, saída continua no ar', (await text('#sender-state')).includes('No ar'));
  await click('#start-one'); await sleep(1600);
  check('parar é explícito', (await text('#start-one')) === 'Iniciar saída 1' && (await text('#sender-state')).includes('Parada'));
  await set('#net-name', 'Só configuração');
  await click('#save-close'); await sleep(400);
  check('salvar configuração não inicia saída', (await (await fetch(base + '/api/outputs')).json()).outputs.ndi.senders.every((s) => !s.active));
  await shot('3-externo');

  // ---------------- Multigravação ----------------
  await resize(1040, 680);
  await open('/iso');
  await until(() => ev(`document.querySelectorAll('#iso-rows tr.eligible').length > 0`), 8000);
  check('entradas elegíveis primeiro', await ev(`[...document.querySelectorAll('#iso-rows tr')].filter(r=>r.classList.contains('eligible')).length`) === 4, await ev(`[...document.querySelectorAll('#iso-rows tr')].filter(r=>r.classList.contains('eligible')).length`));
  check('Replay e barramentos ficam fora', (await text('#iso-rows')).includes('Fora da multigravação') && !(await ev(`[...document.querySelectorAll('#iso-rows tr.eligible')].some(r=>/REPLAY|Barramentos/.test(r.textContent))`)));
  check('Aplicar separado de Iniciar/Parar', await ev(`['iso-save','iso-start','iso-stop'].every(id=>document.getElementById(id))`) && (await text('#iso-foot-note')).includes('não inicia'));
  check('multigravação 1040×680, rodapé e rolagem só no corpo', await ev(`innerWidth === 1040 && innerHeight === 680`) && await inViewport('.vd-bar') && (await ev(`getComputedStyle(document.querySelector('.iso-table-wrap')).overflowY`)) === 'hidden' && (await ev(`getComputedStyle(document.querySelector('.iso-body')).overflowY`)) === 'auto', `${await ev('innerWidth')}x${await ev('innerHeight')}`);
  // Per-entry overrides are applied without starting
  await ev(`(() => { const row = document.querySelector('tr[data-name="CAM 1"]');
    const set = (sel, value) => { const e = row.querySelector(sel); e.value = value; e.dispatchEvent(new Event('change', { bubbles: true })); };
    set('select[data-row="audio"]', 'master'); set('select[data-row="format"]', 'mkv'); set('input[data-row="split"]', '5'); set('input[data-row="prefix"]', 'c1');
    return 'ok'; })()`); await sleep(300);
  await click('#iso-save'); await sleep(1000);
  const isoApplied = (await (await fetch(base + '/api/iso')).json()).iso.recordOptions.perInput['CAM 1'];
  check('opções por entrada são aplicadas sem iniciar', isoApplied?.audio === 'master' && isoApplied?.format === 'mkv' && isoApplied?.splitSeconds === 300 && isoApplied?.prefix === 'c1', JSON.stringify(isoApplied));
  await ev(`(() => { const c = document.querySelectorAll('[data-pick]'); c[0].click(); c[1].click(); return 'ok'; })()`); await sleep(200);
  check('seleção múltipla conta as entradas', (await text('#iso-count')).includes('2 selecionadas'), await text('#iso-count'));
  await set('#iso-filter', 'VT'); await sleep(200);
  check('filtro reduz a lista', await ev(`document.querySelectorAll('#iso-rows tr.eligible').length`) === 1, await ev(`document.querySelectorAll('#iso-rows tr.eligible').length`));
  await set('#iso-filter', ''); await sleep(200);
  const perRow = await ev(`[...document.querySelectorAll('#iso-rows tr.eligible select[data-row="audio"]')].length`);
  check('áudio, formato e duração por entrada', perRow >= 3 && await ev(`document.querySelectorAll('#iso-rows tr.eligible input[data-row="split"]').length`) >= 3);
  await click('#iso-start'); await sleep(1500);
  check('iniciar grava somente as selecionadas', (await text('#iso-state-text')).includes('Gravando') && (await ev(`document.querySelectorAll('#iso-rows tr.eligible .rec').length`)) === 2, await text('#iso-state-text'));
  await click('#iso-close'); await sleep(400);
  check('fechar mantém a gravação', (await (await fetch(base + '/api/iso')).json()).iso.rec === true);
  await open('/iso'); await until(() => ev(`document.querySelectorAll('#iso-rows tr.eligible').length > 0`), 8000);
  await until(() => ev(`document.getElementById('iso-state-text').textContent.includes('Gravando')`), 5000);
  check('ao reabrir, gravação segue e botões travados', (await text('#iso-state-text')).includes('Gravando') && await ev(`document.getElementById('iso-save').disabled`), await text('#iso-state-text'));
  await click('#iso-stop'); await sleep(1200);
  check('parar e finalizar encerra', (await text('#iso-state-text')).includes('Parada'));

  // A failing entry is isolated and the others can be retried without it
  await click('#iso-clear'); await sleep(200);
  await ev(`(() => { document.querySelector('input[data-pick="CAM 1"]').click(); document.querySelector('input[data-pick="PLACAR"]').click(); return 'ok'; })()`); await sleep(200);
  await click('#iso-start'); await sleep(1500);
  const failedRow = await ev(`document.querySelector('tr[data-name="PLACAR"]')?.classList.contains('has-error')`);
  check('falha individual é atribuída à entrada', failedRow === true && !!(await ev(`document.querySelector('[data-retry="PLACAR"]')`)), await text('#iso-message'));
  await click('[data-retry="PLACAR"]'); await sleep(2400);
  check('tentar sem a entrada que falhou inicia as demais', (await text('#iso-state-text')).includes('Gravando'), await text('#iso-message'));
  await click('#iso-stop'); await sleep(1200);

  await open('/multicorder'); await until(() => ev(`document.querySelectorAll('#iso-rows tr.eligible').length > 0`), 8000);
  check('rota antiga /multicorder abre a multigravação nova', (await ev(`location.pathname`)) === '/iso' && (await text('#iso-state-text')) !== null, await ev(`location.pathname`));
  await shot('4-multigravacao');

  // ---------------- Playlist ----------------
  await resize(1200, 760);
  await open('/playout');
  await until(() => ev(`document.querySelectorAll('#pl-tbody tr').length >= 3`), 8000);
  const head = await ev(`document.querySelector('.player-title:nth-of-type(1)')?.textContent`);
  check('PROGRAM sem "NO AR" quando parado', (await ev(`[...document.querySelectorAll('.player-title')].map(e=>e.textContent).join('|')`)).includes('PROGRAM') && !(await ev(`[...document.querySelectorAll('.player-title')].some(e=>e.textContent.includes('NO AR'))`)));
  check('badge do programa parado', (await text('#pgm-badge')) === 'PARADO');
  check('três comandos distintos', (await text('#btn-load-selected')).startsWith('Carregar selecionado') && (await text('#btn-take')).startsWith('Reproduzir') && (await text('#btn-take-next')).startsWith('Executar próximo'), `${await text('#btn-load-selected')} | ${await text('#btn-take')} | ${await text('#btn-take-next')}`);
  check('um único controle por clipe', await ev(`[...document.querySelectorAll('#pl-tbody tr')].every(r=>r.querySelector('select[data-end]')) && !!document.getElementById('pgm-end')`) && !(await ev(`!!document.getElementById('opt-autonext')`)));
  check('IN/OUT em timecode', (await value('#pv-in')) === '00:00:02.000' && (await value('#pv-out')) === '00:00:42.000', `${await value('#pv-in')} / ${await value('#pv-out')}`);
  check('ganho em dB por clipe', await ev(`document.querySelector('#pl-tbody tr[data-id="i2"] input.gain-input')?.value`) === '-3', await ev(`document.querySelector('#pl-tbody tr[data-id="i2"] input.gain-input')?.value`));
  await click('#btn-take-next'); await sleep(1200);
  check('executar próximo coloca no ar com transição', (await text('#pgm-badge')) === 'NO AR', await text('#pgm-badge'));
  await set('#pv-in', '00:00:03.500'); await sleep(700);
  check('IN em timecode aceito', (await value('#pv-in')) === '00:00:03.500', await value('#pv-in'));
  await click('#pl-tbody tr[data-id="i3"]'); await sleep(200);
  await click('#btn-load-selected'); await sleep(1200);
  check('carregar selecionado arma só o Preview', (await text('#pv-title')) === 'Encerramento' && (await text('#pgm-title')) === 'Abertura', `${await text('#pv-title')} / ${await text('#pgm-title')}`);
  await click('#btn-take'); await sleep(1300);
  check('reproduzir leva o preparado ao ar', (await text('#pgm-title')) === 'Encerramento' && (await text('#pgm-badge')) === 'NO AR', `${await text('#pgm-title')} / ${await text('#pgm-badge')}`);
  check('playlist 1200×760, cabeçalho e rodapé visíveis', await ev(`innerWidth === 1200 && innerHeight === 760`) && await inViewport('.vd-strip') && await inViewport('.vd-bar'), `${await ev('innerWidth')}x${await ev('innerHeight')}`);
  await ev(`document.getElementById('pgm-end').value='freeze'; document.getElementById('pgm-end').dispatchEvent(new Event('change',{bubbles:true}))`); await sleep(700);
  check('controle do programa grava o comportamento do clipe', (await (await fetch(base + '/api/playout')).json()).playout.program.item.endBehavior === 'freeze');
  await shot('5-playout');

  // Rundown no comando: a playlist não disputa o avanço automático
  await fetch(base + '/fixture/rundown?on=1');
  await open('/playout'); await until(() => ev(`document.querySelectorAll('#pl-tbody tr').length >= 3`), 8000);
  await until(() => ev(`!document.getElementById('rundown-note').hidden`), 6000);
  check('Rundown no comando aparece e suspende o avanço', (await text('#rundown-note')).includes('Rundown no comando') && (await text('#pl-mode-note')).includes('suspenso'), await text('#rundown-note'));
  await click('#pl-save'); await sleep(900);
  const last = await (await fetch(base + '/fixture/last')).json();
  const saved = [...last.commands].reverse().find((c) => c.action === 'playout_save_playlist');
  check('salvar playlist não reativa o avanço com Rundown', !!saved && saved.autoAdvance === false, JSON.stringify(saved));
  await fetch(base + '/fixture/rundown?on=0');

  check('nenhum erro de script nas páginas', problems.length === 0, problems.join(' | '));
} catch (e) {
  check('execução sem exceção no teste', false, e.message);
} finally {
  await cdp('Browser.close').catch(() => {});
  await sleep(500);
  edge.kill();
  fixture.kill();
  await fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  console.log(`\n${pass}/${total} verificações passaram`);
  process.exit(pass === total ? 0 : 1);
}
