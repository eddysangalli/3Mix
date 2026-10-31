// Operational states of Replay settings: REC active and audio master muted.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const base = process.argv[2] || 'http://127.0.0.1:8810';
const out = path.resolve(import.meta.dirname, 'after-settings');
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));

const recState = {
  rec: true,
  availableCams: ['CAM 1', 'CAM 2', 'CAM 3', 'CAM 4'],
  cameraOptions: {
    'CAM 1': { recordAudio: 'master', gainDb: -3, muted: false, offsetFrames: 2 },
    'CAM 2': { recordAudio: 'input', gainDb: 0, muted: true, offsetFrames: 0 },
  },
  session: { id: 'qa-rec', startedAt: Date.now() - 3723000, dir: 'D:/gravacoes/replay', cams: [{ name: 'CAM 1' }, { name: 'CAM 2' }] },
  retention: { enabled: true, minutes: 30 },
  audioEnabled: false,
  players: {},
  program: '',
  sync: null,
  activePlayer: 'A',
};

await page.route('**/api/replay', async (route) => {
  if (route.request().method() !== 'GET') return route.continue();
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, replay: recState }) });
});

await page.goto(base + '/replay?view=settings', { waitUntil: 'networkidle' });
await page.waitForSelector('.vd-app-window');
await page.waitForTimeout(1400);
await page.screenshot({ path: path.join(out, 'standalone-gravando.png') });

const state = await page.evaluate(() => {
  const cls = (id) => document.getElementById(id)?.className || '';
  const style = (sel) => { const n = document.querySelector(sel); const s = getComputedStyle(n); return { bg: s.backgroundColor, color: s.color, border: s.borderColor, h: Math.round(n.getBoundingClientRect().height) }; };
  return {
    bannerClass: document.getElementById('rec-banner')?.className,
    banner: style('#rec-banner'),
    recButtonClass: cls('btn-toggle-rec'),
    recButton: style('#btn-toggle-rec'),
    audioButtonClass: cls('btn-toggle-audio'),
    audioButtonText: document.getElementById('btn-toggle-audio')?.textContent,
    retentionDisabled: document.getElementById('retention-enabled')?.disabled,
    minutesDisabled: document.getElementById('retention-minutes')?.disabled,
    camDisabled: document.getElementById('cam-slot-1')?.disabled,
    status: document.getElementById('status-msg')?.textContent,
  };
});
assert.match(state.bannerClass, /vd-banner-rec/);
assert.match(state.recButtonClass, /vd-air/);
assert.match(state.audioButtonClass, /vd-dim/);
assert.equal(state.audioButtonText, 'Áudio Master Silenciado');
assert.equal(state.retentionDisabled, true);
assert.equal(state.minutesDisabled, true);
assert.equal(state.camDisabled, true);
assert.equal(state.recButton.h, 36);
assert.equal(errors.length, 0, errors.join(' | '));

await page.click('#tab-btn-audio');
await page.waitForTimeout(250);
await page.screenshot({ path: path.join(out, 'standalone-gravando-audio.png') });
const audio = await page.evaluate(() => {
  const n = document.getElementById('btn-toggle-audio'), s = getComputedStyle(n);
  return { cls: n.className, bg: s.backgroundColor, color: s.color, text: n.textContent, width: Math.round(n.getBoundingClientRect().width), height: Math.round(n.getBoundingClientRect().height) };
});
assert.match(audio.cls, /vd-dim/);
assert.equal(errors.length, 0, errors.join(' | '));

console.log(JSON.stringify({ ok: true, errors, state, audio }, null, 2));
await browser.close();
