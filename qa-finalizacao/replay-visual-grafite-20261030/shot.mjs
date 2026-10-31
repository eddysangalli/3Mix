// Headless capture + layout/contrast audit for the Replay visual pass.
// Usage: node shot.mjs <before|after|run> [baseUrl]
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';

const label = process.argv[2] || 'run';
const base = process.argv[3] || 'http://127.0.0.1:8793';
const out = path.resolve(import.meta.dirname, label);
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const consoleErrors = [], pageErrors = [], failedRequests = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('requestfailed', (r) => failedRequests.push(r.url() + ' ' + (r.failure()?.errorText || '')));

await page.goto(base + '/replay', { waitUntil: 'networkidle' });
await page.waitForSelector('body.replay-operational-ready', { timeout: 15000 });
await page.waitForTimeout(2200);
await page.screenshot({ path: path.join(out, 'replay-1440x900.png') });

const collect = () => {
  const px = (v) => Math.round(parseFloat(v) * 10) / 10;
  const info = (sel) => {
    const n = document.querySelector(sel);
    if (!n) return null;
    const s = getComputedStyle(n), r = n.getBoundingClientRect();
    return { sel, text: (n.textContent || '').trim().slice(0, 70), font: px(s.fontSize), weight: s.fontWeight, color: s.color, bg: s.backgroundColor, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
  };
  const rgb = (value) => {
    const m = String(value).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
  };
  const bgOf = (node) => {
    while (node) {
      const c = rgb(getComputedStyle(node).backgroundColor);
      if (c && c[3] > 0.5) return c;
      node = node.parentElement;
    }
    return [32, 32, 32, 1];
  };
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
    return .2126 * f(r) + .7152 * f(g) + .0722 * f(b);
  };
  const contrast = (sel) => {
    const n = document.querySelector(sel);
    if (!n) return null;
    const fg = rgb(getComputedStyle(n).color), bg = bgOf(n);
    if (!fg) return null;
    const a = lum(fg) + .05, b = lum(bg) + .05;
    return { sel, ratio: Math.round((Math.max(a, b) / Math.min(a, b)) * 100) / 100, fg: getComputedStyle(n).color, bg: `rgb(${bg[0]}, ${bg[1]}, ${bg[2]})` };
  };
  const card = document.querySelector('.events-card'), wrap = document.querySelector('.events-table-wrap');
  const cr = card?.getBoundingClientRect(), wr = wrap?.getBoundingClientRect();
  const rows = [...document.querySelectorAll('#events-list .ev-row')];
  return {
    viewport: [innerWidth, innerHeight],
    bodyFont: getComputedStyle(document.body).fontFamily,
    bodySize: px(getComputedStyle(document.body).fontSize),
    docScroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    main: (() => { const n = document.querySelector('.replay-main'); const r = n.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), scrollH: n.scrollHeight, clientH: n.clientHeight, scrollW: n.scrollWidth, clientW: n.clientWidth }; })(),
    title: info('.workspace-brand'), nav: info('.ws-tab'), section: info('.panel-heading strong'), label: info('.history-head label'),
    body14: info('.events-table'), button: info('#take-replay'), small: info('#replay-shortcuts'), status: info('#quad-status'), deck: info('.player-deck'), quad: info('.quad-card'), history: info('.history-nav'), detail: info('.details-card'),
    events: cr && wr ? { cardH: Math.round(cr.height), wrapH: Math.round(wr.height), tableScrollH: wrap.scrollHeight, rowH: rows[0] ? Math.round(rows[0].getBoundingClientRect().height) : null, visibleRows: rows.filter((r) => r.getBoundingClientRect().bottom <= wr.bottom + 1).length, totalRows: rows.length } : null,
    contrast: ['.panel-heading strong', '.events-table td', '.ev-category', '#quad-status', '#history-status', '#message', '#replay-shortcuts', '.player-source', '.deck-state'].map(contrast),
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    counts: { buttons: document.querySelectorAll('button').length, ids: ['deck-a-card', 'deck-b-card', 'quad-grid', 'history-seek', 'take-replay', 'return-live', 'events-list'].filter((id) => document.getElementById(id)).length },
    disabledCommands: document.querySelectorAll('[data-rp-command]:disabled').length,
  };
};
const audit = await page.evaluate(collect);

for (const [w, h] of [[1600, 1000], [1280, 800], [1152, 720], [1067, 667], [960, 600]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, `replay-${w}x${h}.png`) });
  audit['viewport_' + w + 'x' + h] = await page.evaluate(collect);
}
await fs.writeFile(path.join(out, 'audit.json'), JSON.stringify({ audit, consoleErrors, pageErrors, failedRequests }, null, 2));
await browser.close();
console.log(JSON.stringify({ out, consoleErrors, pageErrors, failedRequests, audit: { ...audit, viewport_1440x900: undefined } }, null, 2));
