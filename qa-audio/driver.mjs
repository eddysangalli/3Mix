// QA automatizado do painel de Áudio via Chrome DevTools Protocol.
// Verifica abas, lista de entradas, pendências/aplicar, dispositivos e retornos.
// Simulado: a API é o harness.mjs (fixtures reais + comandos confirmados).
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const here = dirname(fileURLToPath(import.meta.url));
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = join(process.env.TEMP || '.', 'opencode', 'chrome-audio-cdp');
const port = 9333;
const base = 'http://127.0.0.1:8777/audio.html';
const shots = join(here, 'evidencias');
await mkdir(shots, { recursive: true });
await rm(profile, { recursive: true, force: true }).catch(() => {});

const results = [];
const errors = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail).slice(0, 400) }); };

const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  '--window-size=1360,850', '--force-device-scale-factor=1',
  '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
  '--remote-allow-origins=*', base
], { stdio: 'ignore' });

const wait = ms => new Promise(done => setTimeout(done, ms));

async function targets() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await r.json();
      const page = list.find(item => item.type === 'page' && item.url.includes('audio.html'));
      if (page) return page;
    } catch { /* chrome ainda subindo */ }
    await wait(250);
  }
  throw Error('Chrome não expôs a página de QA');
}

const page = await targets();
const socket = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 32 * 1024 * 1024 });
await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });

let nextId = 1;
const waiting = new Map();
socket.on('message', raw => {
  const message = JSON.parse(String(raw));
  if (message.id && waiting.has(message.id)) {
    const { resolve, reject } = waiting.get(message.id);
    waiting.delete(message.id);
    if (message.error) reject(Error(message.error.message)); else resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || 'exception');
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(arg => arg.value || arg.description).join(' '));
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry.text);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  waiting.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});

const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
};

const shot = async name => {
  const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(join(shots, name), Buffer.from(capture.data, 'base64'));
};

async function waitFor(expression, timeout = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if (await evaluate(expression)) return true; } catch { /* página carregando */ }
    await wait(200);
  }
  return false;
}

await send('Runtime.enable');
await send('Page.enable');
await send('Log.enable');
await waitFor(`document.readyState === 'complete'`);

/* 1. Banco de canais, resumo e inspetor */
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await wait(300);
const listed = await waitFor(`document.querySelectorAll('#audio-input-strips .channel-strip').length >= 11`);
check('banco de entradas preenchido', listed, await evaluate(`document.querySelectorAll('#audio-input-strips .channel-strip').length`));
const counts = await evaluate(`JSON.stringify({
  mixer: document.getElementById('mixer-input-count')?.textContent,
  strips: document.querySelectorAll('#audio-input-strips .channel-strip').length,
  outputs: document.querySelectorAll('#audio-output-strips .channel-strip').length,
  internal: document.querySelectorAll('#sources-internal .source-strip-btn').length,
  privateCount: document.querySelectorAll('.channel-strip.is-private').length,
  monitor: document.querySelectorAll('#monitor-strip').length,
  inspector: document.getElementById('channel-drawer')?.classList.contains('open'),
  overview: document.getElementById('drawer-overview')?.hidden === false,
  editorHidden: document.getElementById('editor')?.hidden
})`);
const c = JSON.parse(counts);
check('contador do banco de entradas', c.mixer === '11', c.mixer);
check('banco com 11 canais de entrada', c.strips === 11, c.strips);
check('master e buses separados', c.outputs === 3, c.outputs);
check('canal privado identificado', c.privateCount === 1, c.privateCount);
check('internos listados no inspetor', c.internal >= 5, c.internal);
check('coluna de fones presente', c.monitor === 1, c.monitor);
check('inspetor lateral aberto na visão geral', c.inspector === true && c.overview === true && c.editorHidden === true, counts);

/* AFV, destinos, fader em dB e knobs */
const stripState = await evaluate(`JSON.stringify((() => {
  const strips=[...document.querySelectorAll('#audio-input-strips .channel-strip')];
  const first=strips[0];
  const fader=first.querySelector('.channel-fader');
  return {
    afvButtons: strips.filter(s=>s.querySelector('[data-act="afv"]')).length,
    destRows: strips.filter(s=>s.querySelectorAll('[data-bus]').length===3).length,
    mainLabel: first.querySelector('[data-bus="M"]')?.textContent,
    muteOn: strips.filter(s=>s.querySelector('.mute-btn')?.classList.contains('on')).length,
    muteButtons: strips.length,
    dbReadouts: strips.filter(s=>/dB/.test(s.querySelector('.db-value')?.textContent||'')).length,
    pctReadouts: strips.filter(s=>/%/.test(s.querySelector('.pct-value')?.textContent||'')).length,
    gainKnobs: strips.filter(s=>s.querySelector('[data-knob="gain"]')).length,
    panKnobs: strips.filter(s=>s.querySelector('[data-knob="pan"]')).length,
    faderMin: fader?.min,
    faderMax: fader?.max,
    scaleLabels: first.querySelectorAll('.db-scale span').length,
    meterBars: first.querySelectorAll('.meter-bar').length
  };
})())`);
const s = JSON.parse(stripState);
check('AFV presente em todos os canais', s.afvButtons === 11, s.afvButtons);
check('envios MAIN/A/B presentes', s.destRows === 11 && s.mainLabel === 'MAIN', JSON.stringify(s));
check('MUTE vermelho apenas nos mudos', s.muteOn > 0 && s.muteOn < s.muteButtons, `${s.muteOn}/${s.muteButtons}`);
check('níveis em dB com % secundária', s.dbReadouts === 11 && s.pctReadouts === 11, JSON.stringify(s));
check('ganho e pan em knobs', s.gainKnobs === 11 && s.panKnobs === 11, `${s.gainKnobs}/${s.panKnobs}`);
check('fader vertical em dB real', s.faderMin === '-60' && s.faderMax === '0', `${s.faderMin}..${s.faderMax}`);
check('escala dB e medidor L/R', s.scaleLabels === 7 && s.meterBars === 2, `${s.scaleLabels}/${s.meterBars}`);

/* preferências locais: cores de cabeçalho e largura dos canais */
await evaluate(`document.getElementById('header-colors').click()`);
check('cores de cabeçalho são opcionais', await evaluate(`document.body.classList.contains('header-colors')`));
await shot('01b-mixer-cores.png');
await evaluate(`document.getElementById('header-colors').click()`);
await evaluate(`(() => { const w=document.getElementById('audio-strip-width'); w.value='140'; w.dispatchEvent(new Event('input',{bubbles:true})); })()`);
const width = await evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--audio-strip-width').trim()`);
const stripWidth = await evaluate(`document.querySelector('#audio-input-strips .channel-strip')?.getBoundingClientRect().width`);
check('largura dos canais ajustável', width === '140px' && Math.round(stripWidth) === 140, `${width} / ${stripWidth}`);
await evaluate(`(() => { const w=document.getElementById('audio-strip-width'); w.value='112'; w.dispatchEvent(new Event('input',{bubbles:true})); })()`);

/* filtro por categoria e busca do banco */
await evaluate(`document.querySelector('.cat-pill[data-filter="media"]').click()`);
await wait(250);
const mediaCount = await evaluate(`[...document.querySelectorAll('#audio-input-strips .channel-strip')].filter(s=>s.offsetParent!==null).length`);
check('filtro de categoria funciona', mediaCount > 0 && mediaCount < 11, mediaCount);
await evaluate(`document.querySelector('.cat-pill[data-filter="all"]').click()`);
await evaluate(`(() => { const s=document.getElementById('source-search'); s.value='replay'; s.dispatchEvent(new Event('input',{bubbles:true})); })()`);
await wait(250);
const searchCount = await evaluate(`[...document.querySelectorAll('#audio-input-strips .channel-strip')].filter(s=>s.offsetParent!==null).length`);
check('busca do banco funciona', searchCount >= 1 && searchCount < 11, searchCount);
await evaluate(`(() => { const s=document.getElementById('source-search'); s.value=''; s.dispatchEvent(new Event('input',{bubbles:true})); })()`);
await wait(200);

/* Rodapé não afirma prontidão antes de consultar dispositivos */
const footerBefore = await evaluate(`JSON.stringify({
  message: document.getElementById('message')?.textContent,
  rate: document.getElementById('footer-rate')?.textContent,
  buffer: document.getElementById('footer-buffer')?.textContent,
  device: document.getElementById('footer-device')?.textContent
})`);
const fb = JSON.parse(footerBefore);
check('prontidão não declarada antes da consulta', /não consultados|pendente/i.test(fb.message), fb.message);
check('rodapé declara taxa não exposta', fb.rate === 'não exposta', fb.rate);
check('rodapé não inventa buffer', fb.buffer === '—', fb.buffer);
check('rodapé não inventa dispositivo', fb.device === 'não consultado', fb.device);

await shot('01-mixer.png');

/* 1b. Controles reais do mixer: fader em dB, knob de ganho e pan */
const faderBefore = await (await fetch('http://127.0.0.1:8777/api/qa-state')).json();
await evaluate(`(() => {
  const strip=document.querySelector('#audio-input-strips .channel-strip[data-name="VT áudio"]');
  const fader=strip.querySelector('.channel-fader');
  fader.value='-6'; fader.dispatchEvent(new Event('change',{bubbles:true}));
})()`);
await wait(800);
const faderAfter = await (await fetch('http://127.0.0.1:8777/api/qa-state')).json();
const faderCmd = faderAfter.commands.slice(faderBefore.commands.length).find(cmd => cmd.action === 'audio_volume' && cmd.data.input === 'VT áudio');
check('fader em dB envia volume linear real', faderCmd && faderCmd.data.volume === 50, JSON.stringify(faderCmd));
const faderReadout = await evaluate(`document.querySelector('#audio-input-strips .channel-strip[data-name="VT áudio"] .db-value')?.textContent`);
check('leitura do fader mostra dB', /-6\.0 dB/.test(faderReadout), faderReadout);

const knobBefore = await (await fetch('http://127.0.0.1:8777/api/qa-state')).json();
await evaluate(`(() => {
  const knob=document.querySelector('#audio-input-strips .channel-strip[data-name="VT áudio"] [data-knob="gain"]');
  knob.focus();
  knob.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
})()`);
await wait(700);
const knobAfter = await (await fetch('http://127.0.0.1:8777/api/qa-state')).json();
const knobCmd = knobAfter.commands.slice(knobBefore.commands.length).find(cmd => cmd.action === 'audio_volume' && cmd.data.input === 'VT áudio');
check('knob de ganho responde ao teclado', knobCmd && knobCmd.data.volume > 0 && knobCmd.data.volume < 100, JSON.stringify(knobCmd));

const panBefore = await (await fetch('http://127.0.0.1:8777/api/qa-state')).json();
await evaluate(`(() => {
  const knob=document.querySelector('#audio-input-strips .channel-strip[data-name="VT áudio"] [data-knob="pan"]');
  knob.focus();
  knob.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
})()`);
await wait(700);
const panAfter = await (await fetch('http://127.0.0.1:8777/api/qa-state')).json();
const panCmd = panAfter.commands.slice(panBefore.commands.length).find(cmd => cmd.action === 'audio_balance' && cmd.data.input === 'VT áudio');
check('knob de pan envia balanço real', panCmd && panCmd.data.balance > 0.5 && panCmd.data.balance < 0.6, JSON.stringify(panCmd));

const muteBefore = await (await fetch('http://127.0.0.1:8777/api/qa-state')).json();
await evaluate(`document.querySelector('#audio-input-strips .channel-strip[data-name="VT áudio"] [data-act="mute"]').click()`);
await waitFor(`document.querySelector('#audio-input-strips .channel-strip[data-name="VT áudio"] .mute-btn')?.classList.contains('on')`);
await wait(700);
const muteAfter = await (await fetch('http://127.0.0.1:8777/api/qa-state')).json();
const muteCmd = muteAfter.commands.slice(muteBefore.commands.length).find(cmd => cmd.action === 'audio_mute' && cmd.data.input === 'VT áudio');
check('MUTE envia estado real e acende no canal', muteCmd && muteCmd.data.muted === true, JSON.stringify(muteCmd));
await evaluate(`document.querySelector('#audio-input-strips .channel-strip[data-name="VT áudio"] [data-act="mute"]').click()`);
await waitFor(`!document.querySelector('#audio-input-strips .channel-strip[data-name="VT áudio"] .mute-btn')?.classList.contains('on')`);

const afvBefore = await (await fetch('http://127.0.0.1:8777/api/qa-state')).json();
await evaluate(`document.querySelector('#audio-input-strips .channel-strip[data-name="VT áudio"] [data-act="afv"]').click()`);
await waitFor(`document.querySelector('#audio-input-strips .channel-strip[data-name="VT áudio"] [data-act="afv"]')?.classList.contains('on')`);
await wait(700);
const afvAfter = await (await fetch('http://127.0.0.1:8777/api/qa-state')).json();
const afvCmd = afvAfter.commands.slice(afvBefore.commands.length).find(cmd => cmd.action === 'audio_routing_afv');
check('AFV envia estado real e acende no canal', afvCmd && afvCmd.data.enabled === true, JSON.stringify(afvCmd));
await evaluate(`document.querySelector('#audio-input-strips .channel-strip[data-name="VT áudio"] [data-act="afv"]').click()`);
await waitFor(`!document.querySelector('#audio-input-strips .channel-strip[data-name="VT áudio"] [data-act="afv"]')?.classList.contains('on')`);

/* 2. Aba Roteamento */
await evaluate(`document.querySelector('.audio-tab[data-view="routing"]').click()`);
await waitFor(`document.getElementById('view-routing')?.classList.contains('selected')`);
const routing = await evaluate(`JSON.stringify({
  inputRows: document.querySelectorAll('#routing-inputs-body tr[data-channel]').length,
  outputRows: document.querySelectorAll('#routing-outputs-body tr[data-target]').length,
  locked: document.querySelectorAll('#routing-outputs-body tr[data-group="mix"]').length,
  deviceSelectDisabled: document.querySelector('#routing-outputs-body tr[data-group="source"] .device-select')?.disabled ?? null,
  capabilities: document.getElementById('routing-capabilities')?.textContent
})`);
const r = JSON.parse(routing);
check('roteamento lista entradas', r.inputRows === 11, r.inputRows);
check('roteamento lista saídas físicas', r.outputRows >= 13, r.outputRows);
check('Master/Bus A/B não fingem saída física', r.locked === 3, r.locked);
check('seletor de interface bloqueado sem inventário', r.deviceSelectDisabled === true, r.deviceSelectDisabled);
const resolved = await evaluate(`JSON.stringify({
  titleM: document.querySelector('#routing-inputs-body tr[data-channel="TITLE 15 (fonte)"] [data-route-bus="M"]')?.checked,
  titleB: document.querySelector('#routing-inputs-body tr[data-channel="TITLE 15 (fonte)"] [data-route-bus="B"]')?.checked,
  status: document.querySelector('#routing-inputs-body tr[data-channel="TITLE 15 (fonte)"] .row-status')?.textContent
})`);
const rs = JSON.parse(resolved);
check('rotas reais resolvidas pelo nome da fonte', rs.titleM === true && rs.titleB === true, resolved);

/* barramento independente: criação e aplicação de membros/volume/rotas */
await evaluate(`(() => { const input=document.getElementById('bus-name'); input.value='Teste QA'; document.getElementById('bus-create').click(); })()`);
const busAppeared = await waitFor(`document.querySelectorAll('#audio-output-strips .channel-strip').length === 4`, 10000);
const busLabels = await evaluate(`[...document.querySelectorAll('#audio-output-strips .strip-name')].map(node => node.textContent).join(' | ')`);
check('bus independente aparece como saída no mixer', busAppeared && /Teste QA/.test(busLabels), busLabels);
const busAsInput = await evaluate(`document.querySelectorAll('#routing-inputs-body tr[data-channel="FreeMix Audio Bus Teste QA"]').length`);
check('barramento não é tratado como entrada', busAsInput === 0, busAsInput);
await evaluate(`(() => { const select=document.getElementById('bus-select'); const option=[...select.options].find(item => item.textContent === 'Teste QA'); select.value=option?.value || ''; select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
await wait(300);
await evaluate(`(() => {
  const member=document.querySelector('#bus-members [data-member]');
  if (member) member.click();
  const gain=document.querySelector('#bus-members [data-member-gain]');
  if (gain) { gain.value='-3'; gain.dispatchEvent(new Event('change',{bubbles:true})); }
  const route=document.querySelector('#bus-routes [data-bus-route="A"]');
  if (route) route.click();
})()`);
await waitFor(`!document.getElementById('pending-count').hidden`);
const busBefore = await (await fetch('http://127.0.0.1:8777/api/qa-state')).json();
await evaluate(`document.getElementById('apply-changes').click()`);
await waitFor(`document.getElementById('pending-count').hidden`);
await wait(500);
const busAfter = await (await fetch('http://127.0.0.1:8777/api/qa-state')).json();
const busCommands = busAfter.commands.slice(busBefore.commands.length).map(cmd => cmd.action);
check('aplicar grava membros, volume e rotas do bus', ['audio_routing_bus_members', 'audio_routing_bus_volume', 'audio_routing_bus_route'].every(action => busCommands.includes(action)), JSON.stringify(busCommands));

await evaluate(`document.querySelector('.audio-tab[data-view="mixer"]').click()`);
await wait(300);
await shot('01b-mixer-bus.png');
await evaluate(`document.querySelector('.audio-tab[data-view="routing"]').click()`);
await shot('02-roteamento.png');

/* 3. Pendência + Aplicar alterações */
await evaluate(`document.querySelector('#routing-inputs-body tr[data-channel="VT áudio"] [data-route-bus="A"]').click()`);
await waitFor(`!document.getElementById('pending-count').hidden`);
const pending = await evaluate(`JSON.stringify({count: document.getElementById('pending-count').textContent, applyDisabled: document.getElementById('apply-changes').disabled, hint: document.getElementById('apply-hint').textContent})`);
const p = JSON.parse(pending);
check('alteração fica pendente', p.count === '1' && p.applyDisabled === false, JSON.stringify(p));
const beforeLog = await (await fetch('http://127.0.0.1:8777/api/qa-state')).json();
await evaluate(`document.getElementById('apply-changes').click()`);
await waitFor(`document.getElementById('pending-count').hidden`);
const afterLog = await (await fetch('http://127.0.0.1:8777/api/qa-state')).json();
const newCommands = afterLog.commands.slice(beforeLog.commands.length);
check('aplicar envia comando ao controlador', newCommands.some(cmd => cmd.action === 'audio_bus' && cmd.data.input === 'VT áudio' && cmd.data.bus === 'A' && cmd.data.enabled === true), JSON.stringify(newCommands));
check('pendência zerada após aplicar', await evaluate(`document.getElementById('pending-count').hidden === true`));

/* 4. Dispositivos: consulta explícita libera prontidão */
await evaluate(`document.querySelector('.audio-tab[data-view="devices"]').click()`);
await waitFor(`document.getElementById('view-devices')?.classList.contains('selected')`);
await shot('03-dispositivos-antes.png');
await evaluate(`document.getElementById('devices-refresh').click()`);
const ready = await waitFor(`/Pronto para operação/.test(document.getElementById('message')?.textContent || '')`, 15000);
const devices = await evaluate(`JSON.stringify({
  state: document.getElementById('devices-state')?.textContent,
  renderRows: document.querySelectorAll('#devices-render-body tr').length,
  asioRows: document.querySelectorAll('#devices-asio-body tr').length,
  message: document.getElementById('message')?.textContent,
  hid: document.querySelector('#devices-render-body tr td')?.textContent
})`);
const d = JSON.parse(devices);
check('dispositivos consultados liberam prontidão', ready, d.message);
check('interfaces WASAPI inventariadas', d.renderRows === 2, d.renderRows);
check('drivers ASIO inventariados', d.asioRows >= 2, d.asioRows);
await shot('04-dispositivos.png');

/* 4a. Rodapé mostra o formato real quando o ASIO reporta operação */
const deviceShown = await waitFor(`/2 interface/.test(document.getElementById('footer-device')?.textContent || '')`, 10000);
check('rodapé mostra inventário consultado', deviceShown, await evaluate(`document.getElementById('footer-device')?.textContent`));
await evaluate(`window.AudioDesk.send('audio_routing_asio_output_start')`);
const rateShown = await waitFor(`document.getElementById('footer-rate')?.textContent === '48.0 kHz'`, 12000);
const footerReal = await evaluate(`JSON.stringify({
  rate: document.getElementById('footer-rate')?.textContent,
  buffer: document.getElementById('footer-buffer')?.textContent,
  device: document.getElementById('footer-device')?.textContent
})`);
const fr = JSON.parse(footerReal);
check('rodapé mostra taxa ASIO real', rateShown && fr.rate === '48.0 kHz', footerReal);
check('rodapé mostra buffer ASIO real', fr.buffer === '512 frames', footerReal);
await evaluate(`window.AudioDesk.send('audio_routing_asio_output_stop')`);
const rateCleared = await waitFor(`document.getElementById('footer-rate')?.textContent === 'não exposta'`, 12000);
check('rodapé não mantém taxa de ASIO parado', rateCleared, await evaluate(`document.getElementById('footer-rate')?.textContent`));

/* 4b. Roteamento para a interface física descoberta */
await evaluate(`document.querySelector('.audio-tab[data-view="routing"]').click()`);
await waitFor(`document.querySelector('#routing-outputs-body tr[data-group="source"] .device-select:not(:disabled)')`);
await evaluate(`(() => {
  const row=[...document.querySelectorAll('#routing-outputs-body tr[data-target]')].find(tr => tr.querySelector('.cell-name')?.textContent === 'VT áudio');
  const device=row.querySelector('[data-device]');
  device.value=device.options[1]?.value || ''; device.dispatchEvent(new Event('change',{bubbles:true}));
  const level=row.querySelector('[data-level]'); level.value='-6'; level.dispatchEvent(new Event('change',{bubbles:true}));
  const delay=row.querySelector('[data-delay]'); delay.value='40'; delay.dispatchEvent(new Event('change',{bubbles:true}));
  const active=row.querySelector('[data-active]'); active.click();
})()`);
await waitFor(`!document.getElementById('pending-count').hidden`);
const directBefore = await (await fetch('http://127.0.0.1:8777/api/qa-state')).json();
await evaluate(`document.getElementById('apply-changes').click()`);
await waitFor(`document.getElementById('pending-count').hidden`);
await wait(600);
const directAfter = await (await fetch('http://127.0.0.1:8777/api/qa-state')).json();
const directCommand = directAfter.commands.slice(directBefore.commands.length).find(cmd => cmd.action === 'audio_routing_direct');
check('saída física envia interface, nível dB e atraso', directCommand && directCommand.data.device && directCommand.data.volume === 50 && directCommand.data.delayMs === 40 && directCommand.data.enabled === true, JSON.stringify(directCommand));
const physical = await evaluate(`JSON.stringify({
  status: [...document.querySelectorAll('#routing-outputs-body tr[data-target]')].find(tr => tr.querySelector('.cell-name')?.textContent === 'VT áudio')?.querySelector('.row-status')?.textContent,
  channel: [...document.querySelectorAll('#routing-outputs-body tr[data-target]')].find(tr => tr.querySelector('.cell-name')?.textContent === 'VT áudio')?.querySelector('.channel-pair')?.textContent
})`);
const physicalState = JSON.parse(physical);
check('interface física identificada com canal 1–2', /Interface USB Broadcast \(QA\) · 1–2/.test(physicalState.status) && physicalState.channel === '1–2', physical);
await shot('02b-roteamento-saida-fisica.png');
await evaluate(`document.querySelector('.audio-tab[data-view="devices"]').click()`);
await wait(250);
await shot('04b-dispositivos-em-uso.png');
await evaluate(`document.querySelector('.audio-tab[data-view="routing"]').click()`);

/* 5. Retornos / N-1 */
await evaluate(`document.querySelector('.audio-tab[data-view="returns"]').click()`);
await waitFor(`document.getElementById('view-returns')?.classList.contains('selected')`);
const ret = await evaluate(`JSON.stringify({
  cards: document.querySelectorAll('.return-card').length,
  exclusions: document.querySelectorAll('[data-return-exclude] option').length,
  chips: [...document.querySelectorAll('.sent-chips .chip')].map(chip => chip.textContent),
  flag: document.getElementById('returns-availability')?.textContent
})`);
const rr = JSON.parse(ret);
check('cartão de retorno presente', rr.cards === 1, rr.cards);
check('fonte excluída selecionável', rr.exclusions >= 10, rr.exclusions);
check('mistura enviada listada em canais de áudio', rr.chips.some(text => /VT áudio/.test(text)) || rr.chips.length > 0, JSON.stringify(rr.chips));
check('transporte declarado como não-SRT real', /socket SRT não aberto/i.test(rr.flag), rr.flag);

const retBefore = await (await fetch('http://127.0.0.1:8777/api/qa-state')).json();
await evaluate(`(() => {
  const card=document.querySelector('.return-card');
  const mode=card.querySelector('[data-return-mode]');
  mode.value='n-1'; mode.dispatchEvent(new Event('change',{bubbles:true}));
  const exclude=card.querySelector('[data-return-exclude]');
  exclude.value='VT áudio'; exclude.dispatchEvent(new Event('change',{bubbles:true}));
})()`);
await waitFor(`!document.getElementById('pending-count').hidden`);
await evaluate(`document.getElementById('apply-changes').click()`);
await waitFor(`document.getElementById('pending-count').hidden`);
await wait(600);
const retAfter = await (await fetch('http://127.0.0.1:8777/api/qa-state')).json();
const returnCommands = retAfter.commands.slice(retBefore.commands.length);
check('aplicar configura o retorno', returnCommands.some(cmd => cmd.action === 'return_feed_configure' && cmd.data.feedId === 'return-1' && cmd.data.audioMode === 'n-1' && cmd.data.nMinusExclude === 'VT áudio'), JSON.stringify(returnCommands));
const n1 = await evaluate(`JSON.stringify({
  excluded: document.querySelectorAll('.sent-chips .chip.excluded').length,
  excludedText: document.querySelector('.sent-chips .chip.excluded')?.textContent,
  hasExcludedAsIncluded: [...document.querySelectorAll('.sent-chips .chip:not(.excluded)')].some(chip => chip.textContent === 'VT áudio'),
  excludeDisabled: document.querySelector('[data-return-exclude]')?.disabled
})`);
const n1state = JSON.parse(n1);
check('N-1 mostra a fonte excluída e a remove da mistura', n1state.excluded === 1 && /VT áudio/.test(n1state.excludedText) && n1state.hasExcludedAsIncluded === false, n1);
await shot('05-retornos.png');

/* 6. Drawer de processamento abre no canal */
await evaluate(`document.querySelector('.audio-tab[data-view="mixer"]').click()`);
const dest = await evaluate(`JSON.stringify({
  titleM: document.querySelector('#audio-input-strips .channel-strip[data-name="TITLE 15 (fonte)"] [data-bus="M"]')?.classList.contains('on'),
  titleB: document.querySelector('#audio-input-strips .channel-strip[data-name="TITLE 15 (fonte)"] [data-bus="B"]')?.classList.contains('on')
})`);
check('destinos M/B refletem o motor', JSON.parse(dest).titleM === true && JSON.parse(dest).titleB === true, dest);

const soloBefore = await (await fetch('http://127.0.0.1:8777/api/qa-state')).json();
await evaluate(`document.querySelector('#audio-input-strips .channel-strip [data-act="solo"]').click()`);
await waitFor(`document.querySelector('#audio-input-strips .channel-strip [data-act="solo"]')?.classList.contains('on')`);
await wait(900);
const soloAfter = await (await fetch('http://127.0.0.1:8777/api/qa-state')).json();
const soloCommands = soloAfter.commands.slice(soloBefore.commands.length).filter(cmd => cmd.action === 'audio_monitor');
check('SOLO usa escuta local no motor', soloCommands.some(cmd => cmd.data.input === 'VT áudio' && cmd.data.enabled === true), JSON.stringify(soloCommands));
await evaluate(`document.querySelector('#audio-input-strips .channel-strip [data-act="solo"]').click()`);
await waitFor(`!document.querySelector('#audio-input-strips .channel-strip [data-act="solo"]')?.classList.contains('on')`);
await wait(900);
const soloEnd = await (await fetch('http://127.0.0.1:8777/api/qa-state')).json();
const soloOff = soloEnd.commands.slice(soloAfter.commands.length).filter(cmd => cmd.action === 'audio_monitor');
check('SOLO restaura a escuta ao sair', soloOff.some(cmd => cmd.data.input === 'VT áudio' && cmd.data.enabled === false), JSON.stringify(soloOff));

await evaluate(`document.querySelector('#audio-input-strips .channel-strip [data-act="processing"]').click()`);
await waitFor(`document.getElementById('channel-drawer')?.classList.contains('open')`);
await waitFor(`document.getElementById('source-name')?.textContent !== 'Visão geral' && document.getElementById('editor').hidden === false`);
await wait(450);
const drawer = await evaluate(`document.getElementById('channel-drawer')?.classList.contains('open')`);
const drawerState = await evaluate(`JSON.stringify({
  hiddenEditor: document.getElementById('editor').hidden,
  filters: document.querySelectorAll('#filter-fields label').length,
  delay: document.getElementById('delay')?.value,
  name: document.getElementById('source-name')?.textContent,
  docked: getComputedStyle(document.getElementById('channel-drawer')).position
})`);
const ds = JSON.parse(drawerState);
check('gaveta DSP abre no canal', drawer && ds.hiddenEditor === false && ds.name === 'VT áudio' && ds.filters > 0, drawerState);
check('inspetor é coluna fixa, não sobreposição', ds.docked === 'relative', ds.docked);
await shot('06-processamento.png');

await evaluate(`document.getElementById('drawer-close').click()`);
await wait(250);
check('inspetor fecha pelo botão', await evaluate(`document.getElementById('channel-drawer').classList.contains('open') === false`));
await evaluate(`document.getElementById('inspector-toggle').click()`);
await wait(250);
check('inspetor reabre pelo botão', await evaluate(`document.getElementById('channel-drawer').classList.contains('open') === true`));

/* 7. Layout responsivo: sem rolagem horizontal, master/inspetor/rodapé visíveis */
for (const size of [{ name: '1280x800', width: 1280, height: 800 }, { name: '1440x900', width: 1440, height: 900 }, { name: '1600x1000', width: 1600, height: 1000 }]) {
  await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: false });
  await wait(450);
  const layout = await evaluate(`JSON.stringify((() => {
    const doc=document.documentElement;
    const bank=document.getElementById('mixer-bank').getBoundingClientRect();
    const master=document.querySelector('#audio-output-strips .channel-strip').getBoundingClientRect();
    const inspector=document.getElementById('channel-drawer').getBoundingClientRect();
    const footer=document.querySelector('.audio-footer').getBoundingClientRect();
    const toolbar=document.querySelector('.mixer-toolbar').getBoundingClientRect();
    const fader=document.querySelector('#audio-input-strips .channel-fader').getBoundingClientRect();
    return {
      width: innerWidth, height: innerHeight,
      docWidth: doc.scrollWidth, clientWidth: doc.clientWidth,
      bankHeight: Math.round(bank.height),
      masterRight: Math.round(master.right),
      inspectorRight: Math.round(inspector.right),
      footerBottom: Math.round(footer.bottom),
      toolbarTop: Math.round(toolbar.top),
      faderBottom: Math.round(fader.bottom),
      footerTop: Math.round(footer.top)
    };
  })())`);
  const l = JSON.parse(layout);
  check(`sem rolagem horizontal em ${size.name}`, l.docWidth <= l.clientWidth, `${l.docWidth}/${l.clientWidth}`);
  check(`master e inspetor dentro da janela em ${size.name}`, l.masterRight <= l.width && l.inspectorRight <= l.width, JSON.stringify(l));
  check(`controles do mixer visíveis em ${size.name}`, l.bankHeight > 400 && l.toolbarTop >= 0 && l.faderBottom <= l.footerTop && l.footerBottom <= l.height, JSON.stringify(l));
  await shot(`07-mixer-${size.name}.png`);
}
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await wait(300);

check('sem erros de console', errors.length === 0, errors.join(' | '));

const report = {
  harness: 'qa-audio/harness.mjs',
  page: base,
  at: new Date().toISOString(),
  simulatedEngine: true,
  results,
  consoleErrors: errors,
  passed: results.filter(item => item.ok).length,
  failed: results.filter(item => !item.ok).length
};
await writeFile(join(here, 'resultado.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

socket.close();
chrome.kill();
process.exit(report.failed ? 1 : 0);
