// QA do mockup v2 · Áudio 3Mix — comandos reais confirmados, teclado nos knobs,
// layout nas três resoluções e 0 erros de console. Chrome headless por CDP.
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, 'depois');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = join(process.env.TEMP || '.', 'opencode', 'chrome-audio-verify-v2');
const port = 9339;
const base = process.env.QA_AUDIO_BASE || 'http://127.0.0.1:8791/audio.html';
const qaApi = base.replace(/\/audio\.html$/, '') + '/api/qa-state';
await mkdir(shots, { recursive: true });
await rm(profile, { recursive: true, force: true }).catch(() => {});

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail).slice(0, 500) }); };

const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  '--window-size=1440,900', '--force-device-scale-factor=1',
  '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
  '--remote-allow-origins=*', base
], { stdio: 'ignore' });

const wait = ms => new Promise(done => setTimeout(done, ms));
async function targets() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
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
const errors = [];
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

const qaState = async () => (await fetch(qaApi)).json();
const commandsAfter = (before, filter = {}) => qaState().then(state => state.commands.slice(before.commands.length).filter(cmd =>
  (!filter.action || cmd.action === filter.action) &&
  (!filter.input || cmd.data?.input === filter.input) &&
  (!filter.key || cmd.data?.key === filter.key)));

await send('Runtime.enable');
await send('Page.enable');
await send('Log.enable');
const ready = await waitFor(`document.readyState === 'complete'`, 15000);
check('página carregou', ready, base);
const built = await waitFor(`document.querySelectorAll('#audio-input-strips .a-strip').length >= 11 && document.querySelectorAll('#audio-output-strips .a-out').length >= 4`, 20000);
check('banco de canais construído', built, await evaluate(`document.querySelectorAll('#audio-input-strips .a-strip').length`));
await wait(1200);

/* 1. Estrutura do banco conforme o mockup */
const bank = JSON.parse(await evaluate(`JSON.stringify((() => {
  const strips=[...document.querySelectorAll('#audio-input-strips .a-strip')];
  const first=strips[0];
  return {
    strips: strips.length,
    badges: strips.map(s=>s.querySelector('.a-strip-num')?.textContent).join(','),
    names: strips.map(s=>s.querySelector('.a-strip-name')?.textContent).join(' | '),
    devices: strips.map(s=>({v:s.querySelector('[data-device] option')?.textContent, d:s.querySelector('[data-device]')?.disabled})),
    gains: strips.filter(s=>s.querySelector('[data-knob="gain"]')).length,
    pans: strips.filter(s=>s.querySelector('[data-knob="pan"]')).length,
    gainChips: strips.filter(s=>/dB/.test(s.querySelector('[data-gain-chip]')?.textContent||'—')).length,
    panChips: strips.filter(s=>s.querySelector('[data-pan-chip]')).length,
    scales: first?.querySelectorAll('.a-scale span').length,
    bars: first?.querySelectorAll('.a-meter-bar').length,
    peaks: first?.querySelectorAll('.a-meter-peak').length,
    lr: strips.filter(s=>s.querySelectorAll('.a-meter-lr span').length===2).length,
    rails: first?.querySelector('.a-fader-rail') !== null,
    faderMin: first?.querySelector('.a-fader')?.min,
    faderMax: first?.querySelector('.a-fader')?.max,
    faderChips: strips.filter(s=>/dB|∞/.test(s.querySelector('[data-fader-chip]')?.textContent||'')).length,
    mutes: strips.filter(s=>s.querySelector('[data-act="mute"]')).length,
    mutesOn: strips.filter(s=>s.querySelector('[data-act="mute"]')?.classList.contains('on')).length,
    solos: strips.filter(s=>s.querySelector('[data-act="solo"]')).length,
    afvs: strips.filter(s=>s.querySelector('[data-act="afv"]')).length,
    mons: strips.filter(s=>s.querySelector('[data-act="mon"]')).length,
    sends: strips.filter(s=>s.querySelectorAll('[data-bus]').length===3).length,
    mainChips: strips.filter(s=>s.querySelector('[data-bus="M"]')?.textContent==='MAIN').length,
    colorHeads: strips.map(s=>getComputedStyle(s.querySelector('.a-strip-head')).backgroundImage!=='none').filter(Boolean).length
  };
})())`));
check('banco com 11 canais reais', bank.strips === 11, bank.strips);
check('badges numéricos 01…11', bank.badges === '01,02,03,04,05,06,07,08,09,10,11', bank.badges);
check('nomes reais nos cabeçalhos', bank.names.split(' | ').length === 11 && bank.names.includes('VT áudio'), bank.names);
check('linha Dispositivo em todos os canais', bank.devices.length === 11, JSON.stringify(bank.devices));
check('cabeçalhos coloridos ligados por padrão', bank.colorHeads >= 9, bank.colorHeads);
check('knobs Ganho e Pan em todos os canais', bank.gains === 11 && bank.pans === 11, `${bank.gains}/${bank.pans}`);
check('chips de valor no Ganho e no Pan', bank.gainChips === 11 && bank.panChips === 11, `${bank.gainChips}/${bank.panChips}`);
check('escala compacta 0…-…-inf no bloco alto', bank.scales === 5, bank.scales);
check('medidor L/R com pico em todos', bank.bars === 2 && bank.peaks === 2 && bank.lr === 11, `${bank.bars}/${bank.peaks}/${bank.lr}`);
check('fader metálico com trilho ao lado', bank.rails && bank.faderMin === '-60' && bank.faderMax === '0', `${bank.faderMin}..${bank.faderMax}`);
check('chip numérico do fader', bank.faderChips === 11, bank.faderChips);
check('MUTE e SOLO grandes em todos os canais', bank.mutes === 11 && bank.solos === 11, `${bank.mutes}/${bank.solos}`);
check('MUTE vermelho apenas nos mudos reais', bank.mutesOn === 6, `${bank.mutesOn}/11`);
check('AFV e MON preservados', bank.afvs === 11 && bank.mons === 11, `${bank.afvs}/${bank.mons}`);
check('linha de envios MAIN/A/B em todos', bank.sends === 11 && bank.mainChips === 11, `${bank.sends}/${bank.mainChips}`);

/* 1b. Duas linhas de canais compactos */
const rowsInfo = JSON.parse(await evaluate(`JSON.stringify((() => {
  const rows=[...document.querySelectorAll('#audio-input-strips .a-strip-row')];
  const strip=document.querySelector('#audio-input-strips .a-strip')?.getBoundingClientRect();
  const bank=document.getElementById('mixer-bank').getBoundingClientRect();
  return {
    rows: rows.length,
    perRow: rows.map(r=>r.querySelectorAll('.a-strip').length),
    stripH: Math.round(strip?.height ?? 0),
    bankH: Math.round(bank.height),
    order: rows.map(r=>[...r.querySelectorAll('.a-strip-num')].map(b=>b.textContent).join('-'))
  };
})())`));
check('banco dividido em duas linhas', rowsInfo.rows === 2, JSON.stringify(rowsInfo));
check('primeira linha com os canais 01–05 e segunda com 06–11 (a partir do 11ª rola)', rowsInfo.perRow[0] === Math.floor(11 / 2) && rowsInfo.perRow[1] === 11 - Math.floor(11 / 2) && rowsInfo.order[0] === '01-02-03-04-05' && rowsInfo.order[1] === '06-07-08-09-10-11', JSON.stringify(rowsInfo.perRow));
check('strip compacto (≈ metade da altura anterior, sem cortar conteúdo)', rowsInfo.stripH <= Math.round(rowsInfo.bankH * 0.62) && rowsInfo.stripH >= 220, `strip ${rowsInfo.stripH}px de ${rowsInfo.bankH}px`);

/* 2. Dispositivo nunca mentido (Player sem dispositivo físico) */
const vtDevice = JSON.parse(await evaluate(`JSON.stringify((() => {
  const strip=document.querySelector('#audio-input-strips .a-strip[data-name="VT áudio"]');
  const sel=strip.querySelector('[data-device]');
  return { label: sel.querySelector('option')?.textContent, disabled: sel.disabled };
})())`));
check('dispositivo VT declarado como origem, não hardware físico', vtDevice.label === 'Player' && vtDevice.disabled === true, JSON.stringify(vtDevice));

/* 3. Coluna SAÍDAS / MESTRE */
const outs = JSON.parse(await evaluate(`JSON.stringify((() => {
  const outs=[...document.querySelectorAll('#audio-output-strips .a-out')];
  return {
    count: outs.length,
    names: outs.map(o=>o.querySelector('.a-out-name')?.textContent).join(' | '),
    visuals: outs.map(o=>o.dataset.visual).join(','),
    bars: outs.map(o=>o.querySelectorAll('.a-meter-bar').length).join(','),
    faders: outs.map(o=>({min:o.querySelector('.a-fader')?.min, max:o.querySelector('.a-fader')?.max, disabled:o.querySelector('.a-fader')?.disabled})),
    chips: outs.map(o=>o.querySelector('[data-out-chip]')?.textContent).join(' | '),
    mons: outs.filter(o=>o.querySelector('[data-act="mon"]')).length,
    mutes: outs.filter(o=>o.querySelector('[data-act="mute"]')).length,
    lr: outs.filter(o=>o.querySelectorAll('.a-meter-lr span').length===2).length
  };
})())`));
check('quatro blocos MAIN/BUS A/BUS B/HEADPHONES', outs.count === 4 && outs.names === 'MAIN | BUS A | BUS B | HEADPHONES', outs.names);
check('blocos coloridos verde/azul/roxo/laranja', outs.visuals === 'main,a,b,hp', outs.visuals);
check('medidores com L R nos blocos', outs.lr === 4 && outs.bars === '2,2,2,2', outs.bars);
check('fader metálico em cada bloco', outs.faders.every(f => f.min === '-60' && f.max === '0'), JSON.stringify(outs.faders));
check('chips numéricos reais nas saídas', outs.chips === '0 dB | 0 dB | -20.1 dB | —', outs.chips);
check('HEADPHONES sem fader inventado', outs.faders[3].disabled === true, JSON.stringify(outs.faders[3]));
check('MON em todos os blocos de saída', outs.mons === 4, outs.mons);
check('MUTE real nas três saídas de mix', outs.mutes === 3, outs.mutes);

/* 4. Inspetor fixo com campos na ordem do mockup */
const insp = JSON.parse(await evaluate(`JSON.stringify((() => {
  const drawer=document.getElementById('channel-drawer');
  const title=document.getElementById('insp-title')?.textContent;
  const fields=[...drawer.querySelectorAll('.a-insp-scroll .a-field > span')].map(node=>node.textContent);
  return {
    open: drawer.classList.contains('open'),
    title,
    name: document.getElementById('insp-name')?.value,
    device: document.getElementById('insp-device')?.selectedOptions?.[0]?.textContent,
    gear: !!document.getElementById('insp-device-gear'),
    gainKnob: !!drawer.querySelector('[data-knob="insp-gain"]'),
    gainChip: document.getElementById('insp-gain-value')?.value,
    panKnob: !!drawer.querySelector('[data-knob="insp-pan"]'),
    panCenter: document.getElementById('insp-pan-center')?.textContent,
    delayKnob: !!drawer.querySelector('[data-knob="insp-delay"]'),
    delayChip: document.getElementById('insp-delay-value')?.value,
    delayReset: document.getElementById('insp-delay-reset')?.textContent,
    main: document.getElementById('insp-main')?.value,
    notes: !!document.getElementById('insp-notes'),
    fields
  };
})())`));
check('inspetor aberto com título do canal', insp.open && /INSPECTOR - VT áudio/i.test(insp.title), insp.title);
check('nome real no campo', insp.name === 'VT áudio', insp.name);
check('dispositivo no inspetor é o real', insp.device === 'Player' && insp.gear, `${insp.device} / gear:${insp.gear}`);
check('ganho com knob e chip', insp.gainKnob && insp.gainChip !== undefined, `${insp.gainKnob}/${insp.gainChip}`);
check('panorama com knob e botão Centro (C)', insp.panKnob && insp.panCenter === 'Centro (C)', insp.panCenter);
check('delay com knob, chip e botão 0 ms', insp.delayKnob && insp.delayChip === '0' && insp.delayReset === '0 ms', `${insp.delayChip}/${insp.delayReset}`);
check('destino principal real', insp.main === 'M', insp.main);
check('notas locais presentes', insp.notes, insp.notes);

/* 5. Comandos reais confirmados pelo motor simulado */
const c0 = await qaState();

// fader de canal → audio_volume em dB→linear
await evaluate(`(() => {
  const strip=document.querySelector('#audio-input-strips .a-strip[data-name="VT áudio"]');
  const fader=strip.querySelector('.a-fader');
  fader.value='-6'; fader.dispatchEvent(new Event('change',{bubbles:true}));
})()`);
await wait(800);
const faderCmd = (await commandsAfter(c0, { action: 'audio_volume', input: 'VT áudio' })).at(-1);
check('fader envia audio_volume linear real (−6 dB → 50)', faderCmd?.data?.volume === 50, JSON.stringify(faderCmd));
const faderChipNow = await evaluate(`document.querySelector('#audio-input-strips .a-strip[data-name="VT áudio"] [data-fader-chip]')?.textContent`);
check('chip do fader mostra dB', faderChipNow === '-6 dB', faderChipNow);
await evaluate(`(() => {
  const strip=document.querySelector('#audio-input-strips .a-strip[data-name="VT áudio"]');
  const fader=strip.querySelector('.a-fader');
  fader.value='0'; fader.dispatchEvent(new Event('change',{bubbles:true}));
})()`);
await wait(700);

// knob de ganho por teclado → audio_routing_filter gain
let c1 = await qaState();
await evaluate(`(() => {
  const knob=document.querySelector('#audio-input-strips .a-strip[data-name="VT áudio"] [data-knob="gain"]');
  knob.focus();
  knob.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
})()`);
  const states = [];
for (let i = 0; i < 18; i++) {
  const state = await evaluate(`JSON.stringify({
    knob: document.querySelector('#audio-input-strips .a-strip[data-name="VT áudio"] [data-knob="gain"]')?._knobValue,
    pending: document.querySelector('#audio-input-strips .a-strip[data-name="VT áudio"] [data-knob="gain"]')?._pendingEdit,
    chip: document.querySelector('#audio-input-strips .a-strip[data-name="VT áudio"] [data-gain-chip]')?.textContent
  })`);
  states.push(`${i * 80}ms ${state}`);
  await wait(80);
}
const cmds = (await commandsAfter(c1, { action: 'audio_routing_filter' }));
check('teclado no knob de ganho envia filtro gain real', cmds.length === 1 && Math.abs(Number(cmds[0]?.data?.settings?.db) - 0.1) < 0.001, JSON.stringify({ cmds, estados: states }).slice(0, 480));

// knob de pan por teclado → audio_balance
c1 = await qaState();
await evaluate(`(() => {
  const knob=document.querySelector('#audio-input-strips .a-strip[data-name="VT áudio"] [data-knob="pan"]');
  knob.focus();
  knob.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
})()`);
await wait(700);
const panCmd = (await commandsAfter(c1, { action: 'audio_balance', input: 'VT áudio' })).at(-1);
check('teclado no knob de pan envia balance real', panCmd?.data?.balance > 0.5 && panCmd?.data?.balance < 0.6, JSON.stringify(panCmd));

// MUTE / MON / AFV no strip
c1 = await qaState();
await evaluate(`document.querySelector('#audio-input-strips .a-strip[data-name="VT áudio"] [data-act="mute"]').click()`);
await waitFor(`document.querySelector('#audio-input-strips .a-strip[data-name="VT áudio"] [data-act="mute"]')?.classList.contains('on')`);
await wait(600);
const muteCmd = (await commandsAfter(c1, { action: 'audio_mute', input: 'VT áudio' })).at(-1);
check('MUTE envia estado real e acende', muteCmd?.data?.muted === true, JSON.stringify(muteCmd));
await evaluate(`document.querySelector('#audio-input-strips .a-strip[data-name="VT áudio"] [data-act="mute"]').click()`);
await waitFor(`!document.querySelector('#audio-input-strips .a-strip[data-name="VT áudio"] [data-act="mute"]')?.classList.contains('on')`);
await wait(500);

c1 = await qaState();
await evaluate(`document.querySelector('#audio-input-strips .a-strip[data-name="VT áudio"] [data-act="mon"]').click()`);
await wait(700);
const monCmd = (await commandsAfter(c1, { action: 'audio_monitor', input: 'VT áudio' })).at(-1);
check('MON envia escuta local real', monCmd?.data?.enabled === true, JSON.stringify(monCmd));
await evaluate(`document.querySelector('#audio-input-strips .a-strip[data-name="VT áudio"] [data-act="mon"]').click()`);
await wait(600);

c1 = await qaState();
await evaluate(`document.querySelector('#audio-input-strips .a-strip[data-name="VT áudio"] [data-act="afv"]').click()`);
await wait(700);
const afvCmd = (await commandsAfter(c1, { action: 'audio_routing_afv' })).at(-1);
check('AFV envia estado real', afvCmd?.data?.enabled === true, JSON.stringify(afvCmd));
await evaluate(`document.querySelector('#audio-input-strips .a-strip[data-name="VT áudio"] [data-act="afv"]').click()`);
await wait(600);

// envios MAIN/A/B → audio_bus. Estado inicial real por canal (fixture):
// VT/TITLE/CAM/AUDIO com M · B; WEB/Replay/… com M; sem input → sem rota.
for (const [bus, input, expectOn] of [['M', 'VT áudio', false], ['A', 'VT áudio', true], ['B', 'VT áudio', false], ['B', 'TITLE 25 (fonte)', false]]) {
  const before = await qaState();
  const selector = `#audio-input-strips .a-strip[data-name="${input}"] [data-bus="${bus}"]`;
  await evaluate(`document.querySelector(${JSON.stringify(selector)})?.click()`);
  await wait(700);
  const busCmd = (await commandsAfter(before, { action: 'audio_bus', input })).at(-1);
  check(`envio para barramento ${bus} (${input}) confirma audio_bus`, busCmd && busCmd.data.bus === bus && busCmd.data.enabled === expectOn, JSON.stringify(busCmd));
  await evaluate(`document.querySelector(${JSON.stringify(selector)})?.click()`);
  await wait(600);
}
// restaura rota B do TITLE 25 (fixture original roteava M · B)
await evaluate(`document.querySelector('#audio-input-strips .a-strip[data-name="TITLE 25 (fonte)"] [data-bus="B"]')?.click()`);
await wait(500);

// SOLO → audio_monitor de todos os canais; sair restaura
let c2 = await qaState();
await evaluate(`document.querySelector('#audio-input-strips .a-strip[data-name="VT áudio"] [data-act="solo"]').click()`);
await waitFor(`document.querySelector('#audio-input-strips .a-strip[data-name="VT áudio"] [data-act="solo"]')?.classList.contains('on')`);
await wait(1100);
const soloCmds = await commandsAfter(c2, { action: 'audio_monitor' });
check('SOLO usa escuta local no motor', soloCmds.some(cmd => cmd.data.input === 'VT áudio' && cmd.data.enabled === true), `${soloCmds.length} comando(s)`);
await evaluate(`document.querySelector('#audio-input-strips .a-strip[data-name="VT áudio"] [data-act="solo"]').click()`);
await waitFor(`!document.querySelector('#audio-input-strips .a-strip[data-name="VT áudio"] [data-act="solo"]')?.classList.contains('on')`);
await wait(1100);
const soloOff = await commandsAfter(c2, { action: 'audio_monitor' });
check('SOLO restaura a escuta ao sair', soloOff.some(cmd => cmd.data.input === 'VT áudio' && cmd.data.enabled === false), `${soloOff.length} comando(s)`);

// fones (MON do Master) → audio_monitor no Master
c2 = await qaState();
await evaluate(`document.querySelector('#audio-output-strips .a-out[data-bus="HP"] [data-act="mon"]').click()`);
await wait(700);
const hpCmd = (await commandsAfter(c2, { action: 'audio_monitor', input: 'FreeMix Master' })).at(-1);
check('MON nos fones monitora o Master real', hpCmd?.data?.enabled === true, JSON.stringify(hpCmd));
await evaluate(`document.querySelector('#audio-output-strips .a-out[data-bus="HP"] [data-act="mon"]').click()`);
await wait(600);

// inspetor: delay por teclado e botão 0 ms
c2 = await qaState();
await evaluate(`(() => {
  const knob=document.querySelector('#channel-drawer [data-knob="insp-delay"]');
  knob.focus();
  knob.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
})()`);
await wait(700);
const delayCmd = (await commandsAfter(c2, { action: 'audio_routing_delay' })).at(-1);
check('delay do inspetor aplica milissegundos reais', delayCmd?.data?.delayMs === 1, JSON.stringify(delayCmd));
c2 = await qaState();
await evaluate(`document.getElementById('insp-delay-reset').click()`);
await wait(700);
const delayResetCmd = (await commandsAfter(c2, { action: 'audio_routing_delay' })).at(-1);
check('botão 0 ms zera o delay real', delayResetCmd?.data?.delayMs === 0, JSON.stringify(delayResetCmd));

// botão Centro (C) → balance 0.5
c2 = await qaState();
await evaluate(`document.getElementById('insp-pan-center').click()`);
await wait(700);
const panCenterCmd = (await commandsAfter(c2, { action: 'audio_balance', input: 'VT áudio' })).at(-1);
check('Centro (C) devolve balance 0.5', Math.abs(panCenterCmd?.data?.balance - 0.5) < 0.001, JSON.stringify(panCenterCmd));

/* 6. Aplicar alterações (pendência real) e Descartar */
await evaluate(`document.querySelector('.a-page-tab[data-view="routing"]').click()`);
await waitFor(`document.getElementById('view-routing')?.classList.contains('selected')`);
const routingRows = await evaluate(`document.querySelectorAll('#routing-inputs-body tr[data-channel]').length`);
check('aba Roteamento lista as 11 entradas', routingRows === 11, routingRows);

/* 6b. Hierarquia da aba: buses e ASIO colapsados; saídas por fonte ocultas */
const routed = JSON.parse(await evaluate(`JSON.stringify((() => {
  const busesAcc=document.getElementById('buses-acc');
  const asioAcc=document.getElementById('asio-acc');
  const view=document.getElementById('view-routing');
  const sourceRow=view.querySelector('#routing-outputs-body tr[data-group="source"]');
  const mixRow=view.querySelector('#routing-outputs-body tr[data-group="mix"]');
  return {
    heroFirst: view.querySelector('.panel')?.id === '' && /Entradas/.test(view.querySelector('.panel .panel-head h2')?.textContent || ''),
    busesClosed: !busesAcc.open,
    busesCount: document.getElementById('buses-count')?.textContent,
    asioClosed: !asioAcc.open,
    sourcesHidden: view.classList.contains('sources-hidden'),
    sourceRowHidden: !sourceRow || sourceRow.offsetParent === null,
    mixRows: [...view.querySelectorAll('#routing-outputs-body tr[data-group="mix"]')].filter(tr=>tr.offsetParent!==null).length,
    sourceCountLabel: document.getElementById('physical-source-count')?.textContent,
    hintM: /Master de produção/.test(view.querySelector('.panel-head+.panel-note')?.textContent || '')
  };
})())`));
check('hero Entradas → Buses primeiro e sempre visível', routed.heroFirst && routed.hintM, JSON.stringify({heroFirst: routed.heroFirst, hint: routed.hintM}));
check('buses colapsado com contagem no título', routed.busesClosed === true && /nenhum|bus/.test(routed.busesCount), routed.busesCount);
check('ASIO avançado colapsado no fim da aba', routed.asioClosed === true, routed.asioClosed);
check('saídas por fonte ocultas por padrão; só Master/Bus A/Bus B visíveis', routed.sourcesHidden && routed.sourceRowHidden && routed.mixRows === 3, JSON.stringify({hidden: routed.sourcesHidden, src: routed.sourceRowHidden, mix: routed.mixRows}));
check('saídas por fonte declarada com contagem (n)', /^\(1[01]\)$/.test(routed.sourceCountLabel), routed.sourceCountLabel);

await evaluate(`(() => {
  document.querySelector('.a-page-tab[data-view="routing"]').classList.add('x');
  document.getElementById('buses-acc').open = true;
  document.getElementById('physical-toggle').click();
})()`);
await wait(250);
const routedOpen = JSON.parse(await evaluate(`JSON.stringify((() => {
  const view=document.getElementById('view-routing');
  const sourceRow=view.querySelector('#routing-outputs-body tr[data-group="source"]');
  const busCreate=document.getElementById('bus-create');
  return {
    busCreateVisible: !!busCreate && busCreate.offsetParent !== null,
    sourceRowVisible: !!sourceRow && sourceRow.offsetParent !== null,
    allSwitch: document.getElementById('show-physical-all')?.checked
  };
})())`));
check('abrir buses mostra a criação outros buses', routedOpen.busCreateVisible === true, routedOpen.busCreateVisible);
check('abrir saídas por fonte mantém tudo editável', routedOpen.sourceRowVisible === true, routedOpen.sourceRowVisible);
check('barra de saídas sincroniza o switch Mostrar todas', routedOpen.allSwitch === true, routedOpen.allSwitch);

/* colapsa de novo e testa o switch isolado */
await evaluate(`(() => {
  document.getElementById('physical-toggle').click();
  document.getElementById('show-physical-all').click();
})()`);
await wait(250);
const routedSwitch = JSON.parse(await evaluate(`JSON.stringify((() => {
  const view=document.getElementById('view-routing');
  const sourceRow=view.querySelector('#routing-outputs-body tr[data-group="source"]');
  return { expanded: !view.classList.contains('sources-hidden'), visible: !!sourceRow && sourceRow.offsetParent !== null, aria: document.getElementById('physical-toggle')?.getAttribute('aria-expanded') };
})())`));
check('switch Mostrar todas revela as saídas por fonte', routedSwitch.expanded && routedSwitch.visible, JSON.stringify(routedSwitch));

await evaluate(`(() => {
  document.getElementById('show-physical-all').click();
  document.querySelector('.a-page-tab[data-view="routing"]').classList.remove('x');
})()`);
await wait(200);

c2 = await qaState();
await evaluate(`document.querySelector('#routing-inputs-body tr[data-channel="TITLE 25 (fonte)"] [data-route-bus="A"]')?.click()`);
await waitFor(`!document.getElementById('pending-count')?.hidden`);
const pending = await evaluate(`JSON.stringify({count: document.getElementById('pending-count')?.textContent, applyDisabled: document.getElementById('apply-changes')?.disabled})`);
check('pendência aparece no Aplicar', JSON.parse(pending).count === '1' && JSON.parse(pending).applyDisabled === false, pending);
await evaluate(`document.getElementById('apply-changes').click()`);
await waitFor(`document.getElementById('pending-count')?.hidden`);
await wait(700);
const busApply = await commandsAfter(c2, { action: 'audio_bus', input: 'TITLE 25 (fonte)' });
check('Aplicar grava no controlador real', busApply.some(cmd => cmd.data.bus === 'A' && cmd.data.enabled === true), JSON.stringify(busApply.at(-1)));

c2 = await qaState();
await evaluate(`document.querySelector('#routing-inputs-body tr[data-channel="TITLE 25 (fonte)"] [data-route-bus="A"]')?.click()`);
await waitFor(`!document.getElementById('pending-count')?.hidden`);
await evaluate(`document.getElementById('discard-changes')?.click()`);
await wait(400);
const discarded = await qaState();
check('Descartar limpa a pendência sem enviar comando', await evaluate(`document.getElementById('pending-count')?.hidden === true`) && discarded.commands.length === c2.commands.length, '');

/* 7. Retornos / N-1 preservados */
await evaluate(`document.querySelector('.a-page-tab[data-view="returns"]').click()`);
await waitFor(`document.getElementById('view-returns')?.classList.contains('selected')`);
const returnsState = JSON.parse(await evaluate(`JSON.stringify({cards: document.querySelectorAll('.return-card').length, flag: document.getElementById('returns-availability')?.textContent})`));
check('aba Retornos preservada', returnsState.cards >= 1, JSON.stringify(returnsState));

/* 8. Dispositivos reais + rodapé */
await evaluate(`document.querySelector('.a-page-tab[data-view="devices"]').click()`);
await waitFor(`document.getElementById('view-devices')?.classList.contains('selected')`);
const footerBefore = JSON.parse(await evaluate(`JSON.stringify({rate: document.getElementById('footer-rate')?.textContent, buffer: document.getElementById('footer-buffer')?.textContent, device: document.getElementById('footer-device')?.textContent})`));
check('rodapé não inventa taxa/buffer/dispositivo', footerBefore.rate === '—' && footerBefore.buffer === '—' && /não consultado/.test(footerBefore.device), JSON.stringify(footerBefore));
c2 = await qaState();
await evaluate(`document.getElementById('devices-refresh').click()`);
await waitFor(`document.querySelectorAll('#devices-render-body tr').length === 2`, 15000);
await wait(900);
const afterDevices = JSON.parse(await evaluate(`JSON.stringify({rows: document.querySelectorAll('#devices-render-body tr').length, asio: document.querySelectorAll('#devices-asio-body tr').length, device: document.getElementById('footer-device')?.textContent})`));
check('consulta de dispositivos é real no controlador', afterDevices.rows === 2 && afterDevices.asio === 2, JSON.stringify(afterDevices));
check('rodapé mostra inventário consultado', /2 interface/.test(afterDevices.device), afterDevices.device);

// ASIO em operação: taxa/buffer reais só quando o motor reporta
await evaluate(`window.AudioDesk.send('audio_routing_asio_output_start')`);
await waitFor(`document.getElementById('footer-rate')?.textContent === '48.0 kHz'`, 12000);
const asioFooter = JSON.parse(await evaluate(`JSON.stringify({rate: document.getElementById('footer-rate')?.textContent, buffer: document.getElementById('footer-buffer')?.textContent})`));
check('rodapé mostra taxa/buffer ASIO reais', asioFooter.rate === '48.0 kHz' && /512 amostras/.test(asioFooter.buffer), JSON.stringify(asioFooter));
await evaluate(`window.AudioDesk.send('audio_routing_asio_output_stop')`);
await waitFor(`document.getElementById('footer-rate')?.textContent === '—'`, 12000);
check('ASIO parado volta a \u2014', await evaluate(`document.getElementById('footer-rate')?.textContent === '—'`), '');

/* 9. Cores de cabeçalho podem desligar (checkbox Cores) */
await evaluate(`document.querySelector('.a-page-tab[data-view="mixer"]').click()`);
await waitFor(`document.getElementById('view-mixer')?.classList.contains('selected')`);
await wait(1200);
await evaluate(`document.getElementById('header-colors').click()`);
await wait(300);
const colorsOff = await evaluate(`(() => {
  const head=document.querySelector('#audio-input-strips .a-strip[data-name="VT áudio"] .a-strip-head');
  const cs=getComputedStyle(head);
  return { body: !document.body.classList.contains('header-colors'), bg: cs.backgroundImage, checked: document.getElementById('header-colors')?.checked };
})()`);
check('Cores desliga os cabeçalhos coloridos', colorsOff.body && (colorsOff.bg === 'none' || colorsOff.bg === ''), JSON.stringify(colorsOff));
await shot('90-mixer-sem-cores.png');
await evaluate(`document.getElementById('header-colors').click()`);
await wait(300);
const colorsOn = await evaluate(`getComputedStyle(document.querySelector('#audio-input-strips .a-strip[data-name="VT áudio"] .a-strip-head')).backgroundImage !== 'none'`);
check('Cores religa os cabeçalhos coloridos', colorsOn, colorsOn);

/* 10. Layout nas três resoluções: só o banco rola, nada cortado */
const sizes = [
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1600x1000', width: 1600, height: 1000 }
];
for (const size of sizes) {
  await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: false });
  await wait(500);
  const layout = JSON.parse(await evaluate(`JSON.stringify((() => {
    const doc=document.documentElement;
    const bank=document.getElementById('mixer-bank');
    const outputs=document.querySelector('.a-outputs')?.getBoundingClientRect();
    const inspector=document.getElementById('channel-drawer').getBoundingClientRect();
    const footer=document.querySelector('.a-footer').getBoundingClientRect();
    const faders=[...document.querySelectorAll('#audio-input-strips .a-fader, #audio-output-strips .a-fader')];
    const strip=document.querySelector('#audio-input-strips .a-strip')?.getBoundingClientRect();
    return {
      width: innerWidth, height: innerHeight,
      docScroll: [doc.scrollWidth, doc.scrollHeight],
      client: [doc.clientWidth, doc.clientHeight],
      bankScroll: [bank.scrollWidth, bank.clientWidth],
      rows: [...document.querySelectorAll('#audio-input-strips .a-strip-row')].map(r => ({
        strips: r.querySelectorAll('.a-strip').length,
        gw: r.scrollWidth, cw: r.clientWidth,
        sh: Math.round(r.scrollHeight), ch: Math.round(r.clientHeight),
        stripH: Math.round(r.querySelector('.a-strip')?.getBoundingClientRect().height ?? 0)
      })),
      outputsRight: Math.round(outputs?.right ?? -1),
      outputsH: Math.round(outputs?.height ?? -1),
      inspectorRight: Math.round(inspector.right),
      footerTop: Math.round(footer.top),
      footerBottom: Math.round(footer.bottom),
      stripW: Math.round(strip?.width ?? 0),
      faderCount: faders.length,
      faderRects: faders.map(f=>({l:Math.round(f.getBoundingClientRect().left), b:Math.round(f.getBoundingClientRect().bottom), h:Math.round(f.getBoundingClientRect().height), r:Math.round(f.getBoundingClientRect().right)}))
    };
  })())`));
  const okNoScroll = layout.docScroll[0] <= layout.client[0] && layout.docScroll[1] <= layout.client[1];
  const rows = layout.rows || [];
  const okRows = rows.length === 2 && rows.every(r => r.strips > 0) && rows.every(r => r.sh <= r.ch + 2);
  const okBank = layout.bankScroll[0] <= layout.bankScroll[1] + 2 && rows.every(r => r.cw <= layout.width + 2);
  const okColumn = layout.outputsRight <= layout.width && layout.inspectorRight <= layout.width;
  const faderFail = layout.faderRects.filter(r => r.l < layout.width && (r.b > layout.footerTop || r.h < 44));
  check(`sem rolagem horizontal/vertical da página em ${size.name}`, okNoScroll, `${layout.docScroll}/${layout.client}`);
  check(`duas linhas de canais sem empilhar terceira em ${size.name}`, okRows, JSON.stringify(rows));
  check(`rollo horizontal só dentro das linhas em ${size.name}`, okBank, JSON.stringify({ bank: layout.bankScroll, rows: rows.map(r => [r.gw, r.cw]) }));
  check(`Saídas e Inspetor visíveis em ${size.name}`, okColumn && layout.outputsH >= 380, `out:${layout.outputsRight}/${layout.outputsH} insp:${layout.inspectorRight}`);
  check(`faders nunca cortados em ${size.name}`, faderFail.length === 0, JSON.stringify({ footerTop: layout.footerTop, fail: faderFail, menorAltura: layout.faderRects.reduce((min, r) => Math.min(min, r.h), 999) }).slice(0, 200));
  await shot(`91-mixer-${size.name}.png`);
}

/* 11. Sem erros de console */
check('0 erros de console', errors.length === 0, errors.join(' | '));

/* Resultado */
const report = {
  harness: 'qa-audio/harness.mjs',
  base,
  round: 'mockup-v2-20261030',
  at: new Date().toISOString(),
  simulatedEngine: true,
  notes: [
    'Comandos confirmados pelo harness em memória (fixtures reais): audio_volume, audio_mute, audio_bus, audio_monitor, audio_balance, audio_routing_filter (gain), audio_routing_delay, audio_routing_afv, return_feed_*, audio_routing_* (aplicar).',
    'Níveis de medidor animados pelo harness (QA) em canais abertos; o painel lê levels de /api/json como no motor.',
    'Campos que o motor não expõe: fader/nível dos fones (—), taxa e buffer WASAPI por endpoint (—), nome do dispositivo das fontes sem captura física (tipo real).'
  ],
  results,
  consoleErrors: errors,
  shots: sizes.map(size => `depois/91-mixer-${size.name}.png`),
  passed: results.filter(item => item.ok).length,
  failed: results.filter(item => !item.ok).length
};
await writeFile(join(here, 'relatorio-verificacao.json'), JSON.stringify(report, null, 2));
await writeFile(join(dirname(here), 'resultado.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, failed: report.failed, failures: results.filter(item => !item.ok) }, null, 2));

socket.close();
chrome.kill();
process.exit(report.failed ? 1 : 0);
