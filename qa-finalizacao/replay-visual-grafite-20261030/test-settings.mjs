// Tabs, fields and colors of the Replay settings page, standalone and embedded.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const base = process.argv[2] || 'http://127.0.0.1:8810';
const out = path.resolve(import.meta.dirname, 'after-settings');
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/api/replay', async (route) => {
  if (route.request().method() !== 'GET') return route.continue();
  const response = await route.fetch();
  const json = await response.json();
  if (json.replay) json.replay.sync = null;
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
});

const ids = ['session-dir', 'rec-banner', 'rec-status-text', 'rec-timer-text', 'btn-toggle-rec', 'cam-slot-1', 'cam-slot-2', 'cam-slot-3', 'cam-slot-4', 'cam-slot-5', 'cam-slot-6', 'cam-slot-7', 'cam-slot-8', 'retention-enabled', 'retention-minutes', 'btn-save-retention', 'btn-toggle-audio', 'audio-cam-select', 'audio-record-source', 'audio-gain', 'audio-muted', 'camera-offset', 'btn-save-cam-audio', 'btn-auto-align', 'sync-status-msg', 'sync-desc', 'btn-refresh', 'btn-close', 'status-msg'];

async function assertTabs(frame, prefix) {
  const labels = await frame.$$eval('.vd-tab-btn', (nodes) => nodes.map((n) => n.textContent.trim()));
  assert.deepEqual(labels, ['Sessão', 'Armazenamento', 'Áudio e Sincronia']);
  const missing = await frame.evaluate((list) => list.filter((id) => !document.getElementById(id)), ids);
  assert.deepEqual(missing, [], prefix + ': IDs ausentes');
  await frame.click('#tab-btn-storage');
  await frame.waitForTimeout(200);
  assert.equal(await frame.locator('#tab-storage').isVisible(), true, prefix + ': Armazenamento visível');
  assert.equal(await frame.locator('#tab-session').isVisible(), false, prefix + ': Sessão oculta');
  await frame.page().screenshot({ path: path.join(out, `${prefix}-armazenamento.png`) });
  await frame.click('#tab-btn-audio');
  await frame.waitForTimeout(200);
  assert.equal(await frame.locator('#tab-audio').isVisible(), true, prefix + ': Áudio visível');
  assert.equal(await frame.locator('#tab-storage').isVisible(), false, prefix + ': Armazenamento oculto');
  await frame.page().screenshot({ path: path.join(out, `${prefix}-audio.png`) });
  await frame.click('#tab-btn-session');
  await frame.waitForTimeout(150);
}

await page.goto(base + '/replay?view=settings', { waitUntil: 'networkidle' });
await page.waitForSelector('.vd-app-window');
await page.waitForTimeout(1200);
const standalone = page.mainFrame();
await assertTabs(standalone, 'standalone');

const hue = await standalone.evaluate(() => {
  const hsl = (v) => {
    const m = String(v).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    let [r, g, b] = [+m[1] / 255, +m[2] / 255, +m[3] / 255];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0, s = 0, l = (mx + mn) / 2;
    if (d) { s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; }
    return { h, s: s * 100, a: m[4] === undefined ? 1 : +m[4] };
  };
  const hits = [];
  for (const n of document.querySelectorAll('body *')) {
    const r = n.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    const st = getComputedStyle(n); if (st.display === 'none' || st.visibility === 'hidden') continue;
    for (const prop of ['color', 'backgroundColor', 'borderTopColor']) {
      const c = hsl(st[prop]); if (!c || c.a < .5) continue;
      if (c.s > 22 && c.h > 75 && c.h < 255) hits.push({ tag: n.tagName, id: n.id, cls: String(n.className).slice(0, 30), prop, value: st[prop] });
    }
  }
  return hits.slice(0, 20);
});
assert.deepEqual(hue, [], 'standalone: nenhuma cor verde/azul visível');

await page.goto(base + '/configuracoes?category=replay', { waitUntil: 'networkidle' });
await page.waitForSelector('#settings-embed-frame');
await page.waitForTimeout(2200);
const frame = page.frames().find((f) => f.url().includes('/replay?view=settings'));
assert.ok(frame, 'iframe do Replay carregado');
await frame.waitForSelector('.vd-app-window');
await assertTabs(frame, 'central');

await page.screenshot({ path: path.join(out, 'central-sessao.png') });
console.log(JSON.stringify({ ok: true, errors, tabs: 3, ids: ids.length, standaloneHueHits: hue.length }, null, 2));
await browser.close();
