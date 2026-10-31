// Captura headless do mockup final de Áudio em três resoluções.
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, process.argv[2] || 'depois');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = join(process.env.TEMP || '.', 'opencode', 'chrome-audio-mockup-final');
const port = 9336;
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
let page;
for (let attempt = 0; attempt < 80; attempt++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    page = list.find(item => item.type === 'page' && item.url.includes('audio.html'));
    if (page) break;
  } catch { /* subindo */ }
  await wait(250);
}
if (!page) throw Error('Chrome não expôs a página');
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
for (let attempt = 0; attempt < 80; attempt++) {
  if (await evaluate(`document.querySelectorAll('#audio-input-strips .a-strip').length >= 11 && document.querySelectorAll('#audio-output-strips .a-out').length >= 4`)) break;
  await wait(200);
}

const report = [];
for (const size of sizes) {
  await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: false });
  await wait(450);
  const metrics = JSON.parse(await evaluate(`JSON.stringify((() => {
    const doc=document.documentElement;
    const bank=document.getElementById('mixer-bank').getBoundingClientRect();
    const outputs=document.querySelector('.a-outputs').getBoundingClientRect();
    const inspector=document.getElementById('channel-drawer').getBoundingClientRect();
    const footer=document.querySelector('.a-footer').getBoundingClientRect();
    const strip=document.querySelector('#audio-input-strips .a-strip').getBoundingClientRect();
    return {
      viewport:[innerWidth,innerHeight],
      docScrollWidth:doc.scrollWidth, docClientWidth:doc.clientWidth,
      docScrollHeight:doc.scrollHeight, docClientHeight:doc.clientHeight,
      bank:[Math.round(bank.width),Math.round(bank.height)],
      outputs:[Math.round(outputs.left),Math.round(outputs.width),Math.round(outputs.height)],
      inspector:[Math.round(inspector.left),Math.round(inspector.width),Math.round(inspector.height)],
      footerBottom:Math.round(footer.bottom),
      strip:[Math.round(strip.width),Math.round(strip.height)],
      strips:document.querySelectorAll('#audio-input-strips .a-strip').length,
      outs:document.querySelectorAll('#audio-output-strips .a-out').length,
      inspectorTitle:document.getElementById('insp-title')?.textContent,
      gain:document.getElementById('insp-gain-value')?.value,
      delay:document.getElementById('insp-delay-value')?.value,
      device:document.getElementById('insp-device')?.value,
      main:document.getElementById('insp-main')?.value,
      colors:document.body.classList.contains('header-colors')
    };
  })())`));
  report.push({ ...size, ...metrics });
  await shot(join(outDir, `mixer-${size.name}.png`));
}
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await wait(300);
for (const view of ['routing', 'returns', 'devices']) {
  await evaluate(`document.querySelector('.a-page-tab[data-view="${view}"]').click()`);
  await wait(350);
  await shot(join(outDir, `${view}-1440x900.png`));
}
await evaluate(`document.querySelector('.a-page-tab[data-view="mixer"]').click()`);
await wait(300);

await writeFile(join(outDir, 'relatorio.json'), JSON.stringify({ at: new Date().toISOString(), sizes: report, consoleErrors: errors }, null, 2));
console.log(JSON.stringify({ outDir, sizes: report, consoleErrors: errors }, null, 2));
socket.close();
chrome.kill();
