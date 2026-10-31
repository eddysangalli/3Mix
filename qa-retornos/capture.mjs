// Captura headless da janela Retornos de Externa SRT & N-1 em três tamanhos.
// Uso: node capture.mjs <antes|depois>
// Requer harness.mjs em http://127.0.0.1:8779/retornos.html (API simulada).
// CDP direto no Chrome headless (mesma técnica de qa-audio/redesign-20261030).
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const here = dirname(fileURLToPath(import.meta.url));
const phase = (process.argv[2] || 'depois') === 'antes' ? 'antes' : 'depois';
const base = phase === 'antes'
  ? 'http://127.0.0.1:8779/retornos-antes.html'
  : 'http://127.0.0.1:8779/retornos.html';
const outDir = join(here, phase);
const profile = join(process.env.TEMP || '.', 'opencode', 'chrome-retornos-' + phase);
const port = phase === 'antes' ? 9441 : 9442;
const oldUi = phase === 'antes';
const cardSel = oldUi ? '.feed-card' : '.ret-card';
const stateSel = oldUi ? '.feed-status' : '.ret-state';
const topbarSel = oldUi ? '.retornos-header' : '.ret-top';
const footerSel = oldUi ? 'footer.minimal' : '.ret-footer';
const headSel = oldUi ? '.retornos-header' : '.ret-pagehead';
const sizes = [
  { name: '900x600-janela-padrao', width: 900, height: 600 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1600x1000', width: 1600, height: 1000 }
];

await mkdir(outDir, { recursive: true });
await rm(profile, { recursive: true, force: true }).catch(() => {});

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  '--force-device-scale-factor=1', '--remote-debugging-port=' + port,
  '--user-data-dir=' + profile, '--remote-allow-origins=*', base
], { stdio: 'ignore' });

const wait = ms => new Promise(done => setTimeout(done, ms));

async function target() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find(item => item.type === 'page' && item.url.includes('retornos'));
      if (page) return page;
    } catch { /* subindo */ }
    await wait(250);
  }
  throw Error('Chrome não expôs a página');
}

const page = await target();
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
const shot = async file => {
  const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(file, Buffer.from(capture.data, 'base64'));
};
const until = async expression => {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await evaluate(expression)) return true;
    await wait(200);
  }
  return false;
};
const q2 = el => el ? [Math.round(el.getBoundingClientRect().height), Math.round(el.getBoundingClientRect().width)] : null;

await send('Runtime.enable');
await send('Page.enable');
await send('Log.enable');
for (let attempt = 0; attempt < 60; attempt++) {
  if (await evaluate(`document.readyState === 'complete'`)) break;
  await wait(200);
}
const rendered = await until(`document.querySelectorAll('${cardSel}').length >= 4`);
if (!rendered) errors.push('Cartões de retorno não renderizaram');
await wait(700);

/* Inventário de IDs e handlers globais (contrato público da página). */
const inventory = JSON.parse(await evaluate(`JSON.stringify({
  ids: Object.fromEntries(
    ${JSON.stringify(['feeds-grid', 'btn-add-feed', 'project-name', 'status-led', 'connection', 'win-close', 'close-btn', 'transport-state', 'ret-toast'])}
      .map(id => [id, !!document.getElementById(id)])
  ),
  globals: Object.fromEntries(
    ${JSON.stringify(['fetchFeeds', 'renderFeeds', 'toggleFeed', 'toggleCleanFeed'])}
      .map(name => [name, typeof window[name]])
  ),
  cards: document.querySelectorAll('${cardSel}').length,
  toggleHandlers: document.body.innerHTML.split('toggleFeed(').length - 1,
  cleanHandlers: document.body.innerHTML.split('toggleCleanFeed(').length - 1,
  connection: (document.getElementById('connection') || {}).textContent || null
})`));

/* Métricas por viewport + tela. */
const report = [];
for (const size of sizes) {
  await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: false });
  await wait(500);
  const metrics = JSON.parse(await evaluate(`JSON.stringify((() => {
    const doc = document.documentElement;
    const q = el => el ? [Math.round(el.getBoundingClientRect().height), Math.round(el.getBoundingClientRect().width)] : null;
    return {
      viewport: [innerWidth, innerHeight],
      horizontalOverflow: doc.scrollWidth > doc.clientWidth,
      docScrollWidth: doc.scrollWidth,
      docClientWidth: doc.clientWidth,
      topbar: q(document.querySelector('${topbarSel}')),
      footer: q(document.querySelector('${footerSel}')),
      pagehead: q(document.querySelector('${headSel}')),
      addBtn: q(document.getElementById('btn-add-feed')),
      cards: document.querySelectorAll('${cardSel}').length
    };
  })())`));
  report.push({ ...size, ...metrics });
  await shot(join(outDir, `retornos-${size.name}.png`));
}

/* Depois: interação real contra a API simulada (cliques + comandos). */
const interaction = { phase };
if (!oldUi) {
  const steps = [];
  const cardTexts = async () => JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('.ret-card')].map(c => ({
    name: (c.querySelector('.ret-name') || {}).textContent || '',
    state: ((c.querySelector('.ret-state') || {}).textContent || '').trim(),
    chips: [...c.querySelectorAll('.ret-chip')].map(x => x.textContent.trim()),
    buttons: [...c.querySelectorAll('.ret-btn')].map(b => b.textContent.trim())
  })))`));

  // 1) Parar um canal em execução (primeiro cartão ● ATIVO).
  await until(`document.body.textContent.includes('● ATIVO')`);
  let texts = await cardTexts();
  const runningIndex = texts.findIndex(c => c.state.includes('ATIVO'));
  await evaluate(`[...document.querySelectorAll('.ret-card')][${runningIndex}].querySelectorAll('.ret-btn')[0].click()`);
  await until(`[...document.querySelectorAll('.ret-card')][${runningIndex}].textContent.includes('● PARADO')`);
  texts = await cardTexts();
  steps.push({
    step: 'parar canal ativo',
    antes: texts[runningIndex].buttons[0],
    depois: texts[runningIndex].state,
    ok: texts[runningIndex].state.includes('● PARADO')
  });

  // 2) Clean feed → program (primeiro cartão com chip CLEAN).
  const cleanIndex = texts.findIndex(c => c.chips.some(chip => chip.includes('CLEAN')));
  await evaluate(`[...document.querySelectorAll('.ret-card')][${cleanIndex}].querySelectorAll('.ret-btn')[1].click()`);
  await until(`[...document.querySelectorAll('.ret-card')][${cleanIndex}].textContent.includes('PROGRAM COMPLETO')`);
  texts = await cardTexts();
  steps.push({
    step: 'alternar clean feed → program',
    button: texts[cleanIndex].buttons[1],
    chips: texts[cleanIndex].chips,
    ok: texts[cleanIndex].chips.some(chip => chip.includes('PROGRAM COMPLETO'))
  });

  // 3) Adicionar canal (prompts do navegador simulados; fluxo real da página).
  await evaluate(`window.__qaPrompts = [];
    window.prompt = function (mensagem, padrao) {
      window.__qaPrompts.push(String(mensagem));
      if (window.__qaPrompts.length === 1) return 'Retorno QA Simulado';
      if (window.__qaPrompts.length === 2) return '9101';
      return null;
    };`);
  const before = texts.length;
  await evaluate(`document.getElementById('btn-add-feed').click()`);
  const added = await until(`document.querySelectorAll('.ret-card').length > ${before}`);
  texts = await cardTexts();
  const qaCard = texts.find(c => c.name.includes('QA Simulado'));
  steps.push({
    step: 'adicionar canal via prompts',
    antes: before, depois: texts.length, ok: added && !!qaCard,
    card: qaCard || null,
    prompts: JSON.parse(await evaluate(`JSON.stringify(window.__qaPrompts || [])`))
  });

  // 4) Topbar e rodapé refletindo o transporte real.
  steps.push({
    step: 'topbar/rodapé conectados',
    connection: await evaluate(`document.getElementById('connection').textContent`),
    transport: await evaluate(`(document.getElementById('transport-state') || {}).textContent || ''`),
    project: await evaluate(`document.getElementById('project-name').textContent`),
    ok: true
  });

  // 5) Comandos efetivamente recebidos pela API simulada (o que é REAL).
  const qaState = await (await fetch('http://127.0.0.1:8779/api/qa-state')).json();
  steps.push({
    step: 'comandos disparados pela página',
    commands: qaState.commands.map(c => ({ action: c.action, data: c.data })),
    ok: qaState.commands.length > 0 && qaState.commands.every(c => String(c.action).startsWith('return_feed_'))
  });
  interaction.steps = steps;

  // Tons visuais: primário grafite, verde do sistema no ativar, sem azul/roxo.
  interaction.palette = {
    addBtn: await evaluate(`(() => { const s = getComputedStyle(document.getElementById('btn-add-feed')); return { bg: s.backgroundColor, border: s.borderColor, color: s.color }; })()`),
    chipRunning: await evaluate(`(() => { const card = [...document.querySelectorAll('.ret-card')].find(c => c.textContent.includes('● ATIVO')); const chip = card && card.querySelector('.ret-chip'); return chip ? getComputedStyle(chip).backgroundColor : null; })()`),
    chipStopped: await evaluate(`(() => { const card = [...document.querySelectorAll('.ret-card')].find(c => c.textContent.includes('● PARADO')); const chip = card && card.querySelector('.ret-chip'); return chip ? getComputedStyle(chip).backgroundColor : null; })()`)
  };
}

const relatorio = { at: new Date().toISOString(), phase, base, sizes: report, inventory, interaction, consoleErrors: errors };
await writeFile(join(outDir, 'relatorio.json'), JSON.stringify(relatorio, null, 2));
console.log(JSON.stringify(relatorio, null, 2));
socket.close();
chrome.kill();
