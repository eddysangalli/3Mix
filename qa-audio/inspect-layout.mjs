import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import WebSocket from 'ws';

const profile = join(process.env.TEMP || '.', 'opencode', 'chrome-audio-inspect');
await rm(profile, { recursive: true, force: true }).catch(() => {});
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--window-size=1360,850', '--force-device-scale-factor=1',
  '--remote-debugging-port=9334', '--user-data-dir=' + profile, '--remote-allow-origins=*',
  'http://127.0.0.1:8777/audio.html'
], { stdio: 'ignore' });
const wait = ms => new Promise(done => setTimeout(done, ms));
let page;
for (let i = 0; i < 40 && !page; i++) {
  try {
    const list = await (await fetch('http://127.0.0.1:9334/json/list')).json();
    page = list.find(item => item.type === 'page' && item.url.includes('audio.html'));
  } catch { /* subindo */ }
  if (!page) await wait(250);
}
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => socket.once('open', resolve));
let id = 1;
const waiting = new Map();
socket.on('message', raw => {
  const m = JSON.parse(String(raw));
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
});
const send = (method, params = {}) => new Promise(resolve => { const n = id++; waiting.set(n, resolve); socket.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Runtime.enable');
for (let i = 0; i < 40; i++) { if (await evaluate(`!!document.querySelector('#audio-input-strips .channel-strip')`)) break; await wait(250); }
await evaluate(`document.querySelector('#audio-input-strips .channel-strip [data-act="processing"]').click()`);
await wait(900);
const info = await evaluate(`JSON.stringify((() => {
  const view=document.getElementById('view-mixer'), drawer=document.getElementById('channel-drawer'), bank=document.getElementById('mixer-bank');
  const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,top:r.top,bottom:r.bottom}};
  return {
    viewport:[innerWidth,innerHeight],
    scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],
    view:rect(view), bank:rect(bank), drawer:rect(drawer),
    drawerPosition:getComputedStyle(drawer).position,
    drawerRight:getComputedStyle(drawer).right,
    drawerWidth:getComputedStyle(drawer).width,
    drawerTransform:getComputedStyle(drawer).transform,
    bodyOverflow:getComputedStyle(document.body).overflow
  };
})())`);
console.log(info);
socket.close();
chrome.kill();
