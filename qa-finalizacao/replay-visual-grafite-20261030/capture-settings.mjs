// Capture the Replay settings page standalone and inside the Configurações central.
// Usage: node capture-settings.mjs <before|after> [baseUrl]
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';

const label = process.argv[2] || 'before';
const base = process.argv[3] || 'http://127.0.0.1:8810';
const out = path.resolve(import.meta.dirname, label + '-settings');
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const consoleErrors = [], pageErrors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(e.message));
// O fixture devolve sync:{}; a página real só recebe sync preenchido após calibrar.
// Para a captura, usa o estado "nenhum desvio calibrado" em vez de NaN no texto.
await page.route('**/api/replay', async (route) => {
  if (route.request().method() !== 'GET') return route.continue();
  const response = await route.fetch();
  const json = await response.json();
  if (json.replay) json.replay.sync = null;
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
});

const measure = (frame) => frame.evaluate(() => {
  const px = (v) => Math.round(parseFloat(v) * 10) / 10;
  const info = (sel) => {
    const n = document.querySelector(sel);
    if (!n) return null;
    const s = getComputedStyle(n), r = n.getBoundingClientRect();
    return { sel, text: (n.textContent || '').trim().slice(0, 60), font: px(s.fontSize), weight: s.fontWeight, color: s.color, bg: s.backgroundColor, border: s.borderColor, h: Math.round(r.height), w: Math.round(r.width) };
  };
  const app = document.querySelector('.vd-app-window'), content = document.querySelector('.vd-content-area');
  return {
    embed: document.documentElement.classList.contains('embed-3mix'),
    body: info('body'), app: info('.vd-app-window'), sidebar: info('.vd-sidebar'), header: info('.vd-sidebar-header'),
    activeTab: info('.vd-tab-btn.active'), idleTab: info('.vd-tab-btn:not(.active)'), rowLabel: info('.vd-row > span:first-child'),
    field: info('#session-dir'), select: info('#cam-slot-1'), button: info('#btn-toggle-rec'), note: info('.vd-field-hint'),
    title: info('.vd-title'), banner: info('#rec-banner'), footer: info('.vd-footer'), status: info('#status-msg'),
    badge: info('.cam-badge'), link: info('.vd-link-nav'),
    appSize: app ? { w: Math.round(app.getBoundingClientRect().width), h: Math.round(app.getBoundingClientRect().height) } : null,
    content: content ? { scrollH: content.scrollHeight, clientH: content.clientHeight, scrollW: content.scrollWidth, clientW: content.clientWidth } : null,
    tabs: [...document.querySelectorAll('.vd-tab-btn')].map((n) => n.textContent.trim()),
    ids: ['session-dir', 'rec-banner', 'btn-toggle-rec', 'cam-slot-1', 'cam-slot-8', 'retention-enabled', 'retention-minutes', 'btn-save-retention', 'btn-toggle-audio', 'audio-cam-select', 'audio-record-source', 'audio-gain', 'audio-muted', 'camera-offset', 'btn-save-cam-audio', 'btn-auto-align', 'sync-status-msg', 'btn-refresh', 'btn-close', 'status-msg'].filter((id) => document.getElementById(id)).length,
  };
});

async function standalone(w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(base + '/replay?view=settings', { waitUntil: 'networkidle' });
  await page.waitForSelector('.vd-app-window', { timeout: 15000 });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(out, `standalone-${w}x${h}.png`) });
  return measure(page.mainFrame());
}

async function central(w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(base + '/configuracoes?category=replay', { waitUntil: 'networkidle' });
  await page.waitForSelector('#settings-embed-frame', { timeout: 20000 });
  await page.waitForTimeout(2200);
  let frame = page.frames().find((f) => f.url().includes('/replay?view=settings'));
  if (!frame) frame = page.frames().find((f) => f.url().includes('replay-settings'));
  if (frame) await frame.waitForSelector('.vd-app-window', { timeout: 15000 }).catch(() => {});
  await page.screenshot({ path: path.join(out, `central-${w}x${h}.png`) });
  const iframe = await page.$('#settings-embed-frame');
  if (iframe) await iframe.screenshot({ path: path.join(out, `central-iframe-${w}x${h}.png`) });
  return frame ? measure(frame) : null;
}

const result = {};
result.standalone1440 = await standalone(1440, 900);
result.standalone1280 = await standalone(1280, 800);
result.central1440 = await central(1440, 900);
result.central1280 = await central(1280, 800);
result.central1152 = await central(1152, 720);
await fs.writeFile(path.join(out, 'audit.json'), JSON.stringify({ result, consoleErrors, pageErrors }, null, 2));
await browser.close();
console.log(JSON.stringify({ out, consoleErrors, pageErrors, result }, null, 2));
