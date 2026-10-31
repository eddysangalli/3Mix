// Diagnóstico rápido do painel de Áudio via CDP.
// Uso: node inspect.mjs "<expressão JS>"
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import WebSocket from 'ws';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = join(process.env.TEMP || '.', 'opencode', 'chrome-audio-inspect');
const port = 9335;
const base = 'http://127.0.0.1:8777/audio.html';
await rm(profile, { recursive: true, force: true }).catch(() => {});
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  '--window-size=1440,900', '--force-device-scale-factor=1',
  '--remote-debugging-port=' + port, '--user-data-dir=' + profile, '--remote-allow-origins=*', base
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
if (!page) { console.error('sem página'); chrome.kill(); process.exit(1); }
const socket = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 16 * 1024 * 1024 });
await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
let nextId = 1;
const waiting = new Map();
socket.on('message', raw => {
  const message = JSON.parse(String(raw));
  if (message.id && waiting.has(message.id)) {
    const { resolve, reject } = waiting.get(message.id);
    waiting.delete(message.id);
    if (message.error) reject(Error(message.error.message)); else resolve(message.result);
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  waiting.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
await send('Runtime.enable');
await wait(2500);
const expression = process.argv[2] || 'document.title';
const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
console.log(JSON.stringify(result.result?.value ?? result.exceptionDetails, null, 2));
socket.close();
chrome.kill();
