// Interaction smoke test for the Replay skin: every original ID/state still works.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const base = process.argv[2] || 'http://127.0.0.1:8793';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(base + '/replay', { waitUntil: 'networkidle' });
await page.waitForSelector('body.replay-operational-ready');
await page.waitForTimeout(1800);

const ids = ['deck-a-card', 'deck-b-card', 'quad-grid', 'quad-prev', 'quad-next', 'history-seek', 'history-cursor', 'history-in', 'history-out', 'history-save', 'history-refresh', 'history-status', 'history-camera', 'history-audio', 'events-list', 'take-replay', 'return-live', 'replay-selected-player', 'rec-status', 'record-btn', 'speed-select', 'link-players', 'import-file', 'import-name', 'import-cam', 'import-btn', 'replay-settings', 'replay-path-dialog'];
const missing = await page.evaluate((list) => list.filter((id) => !document.getElementById(id)), ids);
assert.deepEqual(missing, [], 'all original IDs are present');

// Event selection and details.
await page.click('#events-list .ev-row');
await page.waitForTimeout(250);
assert.equal(await page.inputValue('#detail-name'), 'Gol de empate · 2º tempo');
assert.ok((await page.locator('.detail-angle').count()) >= 4, 'angles are rendered');
await page.screenshot({ path: 'after/replay-detalhe.png' });

// Missing-file locate dialog (Player B still points at a missing file).
await page.click('#missing-B [data-missing-locate]');
await page.waitForTimeout(250);
assert.equal(await page.getAttribute('#replay-path-dialog', 'open'), '');
await page.fill('#path-value', 'x');
await page.click('#path-confirm');
await page.waitForTimeout(150);
assert.match(await page.textContent('#path-help'), /caminho local absoluto/i);
await page.screenshot({ path: 'after/replay-arquivo-ausente.png' });
await page.click('#replay-path-dialog .panel-heading button');
await page.waitForTimeout(200);

// Load in A and B, select B, take air, return live.
await page.click('#events-list .ev-row .btn-load-a');
await page.click('#events-list .ev-row .btn-load-b');
await page.waitForTimeout(600);
await page.selectOption('#replay-selected-player', 'B');
await page.waitForTimeout(250);
assert.match(await page.textContent('#take-replay'), /Player B/);
await page.click('#take-replay');
await page.waitForTimeout(700);
assert.match(await page.textContent('#deck-state'), /NO AR · B/);
await page.click('#return-live');
await page.waitForTimeout(700);
assert.match(await page.textContent('#message'), /Operação confirmada|Mesa|Motor/i);

// Speed and A/B link commands.
await page.selectOption('#speed-select', '25');
await page.waitForTimeout(400);
await page.click('#link-players');
await page.waitForTimeout(400);

// Settings dialog and missing-file locate dialog.
await page.click('.replay-topbar .topbar-right button');
await page.waitForTimeout(250);
assert.equal(await page.getAttribute('#replay-settings', 'open'), '');
await page.screenshot({ path: 'after/replay-configuracoes.png' });
await page.click('#replay-settings .panel-heading button');
await page.waitForTimeout(250);

// Quadview angle selection, history seek and IN/OUT -> SALVAR LANCE.
await page.click('#quad-grid .quad-tile[data-cam="CAM 2 Lateral Dir"]');
await page.waitForTimeout(700);
assert.ok((await page.getAttribute('#quad-grid .quad-tile[data-cam="CAM 2 Lateral Dir"]', 'class')).includes('selected'), 'quad angle selected');
await page.evaluate(() => {
  const seek = document.getElementById('history-seek');
  seek.value = '580';
  seek.dispatchEvent(new Event('input', { bubbles: true }));
  seek.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(700);
await page.click('#history-in');
await page.evaluate(() => {
  const seek = document.getElementById('history-seek');
  seek.value = '585';
  seek.dispatchEvent(new Event('input', { bubbles: true }));
  seek.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(700);
await page.click('#history-out');
await page.waitForTimeout(250);
assert.equal(await page.isEnabled('#history-save'), true, 'SALVAR LANCE enabled after IN/OUT');
await page.click('#history-save');
await page.waitForTimeout(900);

const log = await (await fetch(base + '/fixture/commands')).json();
const actions = log.commands.map((c) => c.action);
for (const action of ['load', 'air', 'live', 'speed', 'link', 'capture-range']) assert.ok(actions.includes(action), 'command sent: ' + action);
assert.deepEqual(errors, [], 'no page or console errors');

console.log(JSON.stringify({ ok: true, actions, errors, screenshots: ['replay-detalhe.png', 'replay-configuracoes.png', 'replay-arquivo-ausente.png'] }, null, 2));
await browser.close();
