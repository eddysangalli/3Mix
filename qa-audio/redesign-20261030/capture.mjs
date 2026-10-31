// Captura headless do painel de Áudio em três tamanhos de janela.
// Uso: node capture.mjs <pasta-de-saida>
// Requer qa-audio/harness.mjs em http://127.0.0.1:8777/audio.html.
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, process.argv[2] || 'capturas');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = join(process.env.TEMP || '.', 'opencode', 'chrome-audio-layout');
const port = 9334;
const base = 'http://127.0.0.1:8777/audio.html';
const sizes = [
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1600x1000', width: 1600, height: 1000 }
];
await mkdir(outDir, { recursive: true });
await rm(profile, { recursive: true, force: true }).catch(() => {});

const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  '--force-device-scale-factor=1', '--remote-debugging-port=' + port,
  '--user-data-dir=' + profile, '--remote-allow-origins=*', base
], { stdio: 'ignore' });

const wait = ms => new Promise(done => setTimeout(done, ms));

async function target() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find(item => item.type === 'page' && item.url.includes('audio.html'));
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

await send('Runtime.enable');
await send('Page.enable');
await send('Log.enable');
for (let attempt = 0; attempt < 60; attempt++) {
  if (await evaluate(`document.readyState === 'complete'`)) break;
  await wait(200);
}
for (let attempt = 0; attempt < 80; attempt++) {
  if (await evaluate(`document.querySelectorAll('#audio-input-strips .channel-strip').length >= 11`)) break;
  await wait(200);
}

const report = [];
for (const size of sizes) {
  await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: false });
  await wait(400);
  const metrics = JSON.parse(await evaluate(`JSON.stringify((() => {
    const doc = document.documentElement;
    const bank = document.getElementById('mixer-bank');
    const strips = document.getElementById('audio-input-strips');
    const drawer = document.getElementById('channel-drawer');
    const topbar = document.querySelector('.audio-topbar');
    const footer = document.querySelector('.audio-footer');
    return {
      viewport: [innerWidth, innerHeight],
      docScrollWidth: doc.scrollWidth,
      docClientWidth: doc.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      docScrollHeight: doc.scrollHeight,
      docClientHeight: doc.clientHeight,
      horizontalPageScroll: doc.scrollWidth > doc.clientWidth,
      verticalPageScroll: doc.scrollHeight > doc.clientHeight,
      bank: bank ? [bank.clientWidth, bank.clientHeight, bank.scrollWidth, bank.scrollHeight] : null,
      inputBank: strips ? [strips.clientWidth, strips.scrollWidth] : null,
      drawer: drawer ? [Math.round(drawer.getBoundingClientRect().left), Math.round(drawer.getBoundingClientRect().width)] : null,
      topbarHeight: topbar ? Math.round(topbar.getBoundingClientRect().height) : null,
      footerHeight: footer ? Math.round(footer.getBoundingClientRect().height) : null,
      strips: document.querySelectorAll('#audio-input-strips .channel-strip').length,
      outputs: document.querySelectorAll('#audio-output-strips .channel-strip').length
    };
  })())`));
  report.push({ ...size, ...metrics });
  await shot(join(outDir, `mixer-${size.name}.png`));
}
await evaluate(`document.querySelector('.audio-tab[data-view="routing"]').click()`);
await wait(300);
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await wait(300);
await shot(join(outDir, 'roteamento-1440x900.png'));
await evaluate(`document.querySelector('.audio-tab[data-view="returns"]').click()`);
await wait(300);
await shot(join(outDir, 'retornos-1440x900.png'));
await evaluate(`document.querySelector('.audio-tab[data-view="devices"]').click()`);
await wait(300);
await shot(join(outDir, 'dispositivos-1440x900.png'));
await evaluate(`document.querySelector('.audio-tab[data-view="mixer"]').click()`);

await writeFile(join(outDir, 'relatorio.json'), JSON.stringify({ at: new Date().toISOString(), sizes: report, consoleErrors: errors }, null, 2));
console.log(JSON.stringify({ outDir, sizes: report, consoleErrors: errors }, null, 2));
socket.close();
chrome.kill();
