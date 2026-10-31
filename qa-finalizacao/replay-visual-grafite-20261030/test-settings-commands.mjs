// Command wiring of Replay settings: start/stop, retention, audio and camera options.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const base = process.argv[2] || 'http://127.0.0.1:8810';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], posts = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));

let state = {
  rec: false,
  availableCams: ['CAM 1', 'CAM 2', 'CAM 3'],
  cameraOptions: { 'CAM 1': { recordAudio: 'input', gainDb: 0, muted: false, offsetFrames: 0 } },
  session: null,
  retention: { enabled: false, minutes: 30 },
  audioEnabled: true,
  players: {},
  program: '',
  sync: null,
  activePlayer: 'A',
};

await page.route('**/api/replay', async (route) => {
  if (route.request().method() === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, replay: state }) });
  }
  const body = route.request().postDataJSON();
  posts.push(body);
  if (body.action === 'start') state = { ...state, rec: true, session: { id: 'qa', startedAt: Date.now() - 65000, dir: 'D:/gravacoes/replay', cams: (body.cams || []).map((name) => ({ name })) } };
  if (body.action === 'stop') state = { ...state, rec: false };
  if (body.action === 'retention') state = { ...state, retention: { enabled: !!body.enabled, minutes: body.minutes } };
  if (body.action === 'audio') state = { ...state, audioEnabled: !!body.enabled };
  if (body.action === 'camera-options') state = { ...state, cameraOptions: { ...state.cameraOptions, [body.cam]: body.options } };
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, replay: state }) });
});

await page.goto(base + '/replay?view=settings', { waitUntil: 'networkidle' });
await page.waitForSelector('.vd-app-window');
await page.waitForTimeout(1200);

// Start / stop recording with a selected camera.
await page.selectOption('#cam-slot-1', 'CAM 1');
await page.waitForTimeout(100);
await page.click('#btn-toggle-rec');
await page.waitForTimeout(350);
assert.equal(posts.at(-1).action, 'start');
assert.deepEqual(posts.at(-1).cams, ['CAM 1']);
assert.match(await page.getAttribute('#btn-toggle-rec', 'class'), /vd-air/);
assert.match(await page.textContent('#rec-status-text'), /Andamento/);

await page.click('#btn-toggle-rec');
await page.waitForTimeout(350);
assert.equal(posts.at(-1).action, 'stop');
assert.match(await page.getAttribute('#btn-toggle-rec', 'class'), /vd-on/);

// Retention.
await page.click('#tab-btn-storage');
await page.check('#retention-enabled');
await page.fill('#retention-minutes', '45');
await page.click('#btn-save-retention');
await page.waitForTimeout(350);
assert.equal(posts.at(-1).action, 'retention');
assert.equal(posts.at(-1).enabled, true);
assert.equal(posts.at(-1).minutes, 45);

// Audio master.
await page.click('#tab-btn-audio');
await page.click('#btn-toggle-audio');
await page.waitForTimeout(350);
assert.equal(posts.at(-1).action, 'audio');
assert.equal(posts.at(-1).enabled, false);
assert.match(await page.getAttribute('#btn-toggle-audio', 'class'), /vd-dim/);

// Per-camera options.
await page.fill('#audio-gain', '-3');
await page.fill('#camera-offset', '2');
await page.click('#btn-save-cam-audio');
await page.waitForTimeout(350);
assert.equal(posts.at(-1).action, 'camera-options');
assert.equal(posts.at(-1).cam, 'CAM 1');
assert.equal(posts.at(-1).options.gainDb, -3);
assert.equal(posts.at(-1).options.offsetFrames, 2);
assert.deepEqual(errors, [], errors.join(' | '));

console.log(JSON.stringify({ ok: true, errors, actions: posts.map((p) => p.action), last: posts.at(-1) }, null, 2));
await browser.close();
