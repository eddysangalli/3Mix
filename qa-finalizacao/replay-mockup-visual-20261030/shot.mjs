// Headless capture + layout/contrast audit for the Replay mockup visual pass.
// Usage: node shot.mjs <before|after> [baseUrl]
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';

const label = process.argv[2] || 'run';
const base = process.argv[3] || 'http://127.0.0.1:8795';
const out = path.resolve(import.meta.dirname, label);
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const consoleErrors = [], pageErrors = [], failedRequests = [], badResponses = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('requestfailed', (r) => failedRequests.push(r.url() + ' ' + (r.failure()?.errorText || '')));
page.on('response', (r) => { if (r.status() >= 400) badResponses.push(r.status() + ' ' + r.url()); });

await page.goto(base + '/replay', { waitUntil: 'networkidle' });
await page.waitForSelector('body.replay-operational-ready', { timeout: 15000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(out, 'replay-1440x900.png') });

const collect = () => {
  const px = (v) => Math.round(parseFloat(v) * 10) / 10;
  const info = (sel) => {
    const n = document.querySelector(sel);
    if (!n) return null;
    const s = getComputedStyle(n), r = n.getBoundingClientRect();
    return { sel, text: (n.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 90), font: px(s.fontSize), weight: s.fontWeight, color: s.color, bg: s.backgroundColor, border: s.borderColor, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
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
  const rect = (sel) => { const n = document.querySelector(sel); if (!n) return null; const r = n.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  return {
    viewport: [innerWidth, innerHeight],
    bodyFont: getComputedStyle(document.body).fontFamily,
    bodySize: px(getComputedStyle(document.body).fontSize),
    docScroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    main: (() => { const n = document.querySelector('.replay-main'); if (!n) return null; const r = n.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), scrollH: n.scrollHeight, clientH: n.clientHeight, scrollW: n.scrollWidth, clientW: n.clientWidth }; })(),
    title: info('.workspace-brand'), nav: info('.ws-tab'), section: info('.panel-heading strong'), label: info('.history-head label'),
    body14: info('.events-table'), button: info('#take-replay'), small: info('#replay-shortcuts'), status: info('#quad-status'), deck: info('.player-deck'), quad: info('.quad-card'), history: info('.history-nav'), detail: info('.details-card'),
    deckA: rect('#deck-a-card'), deckB: rect('#deck-b-card'), quadGrid: rect('#quad-grid'), historyTape: rect('#history-seek'), footer: rect('.replay-footer'), subbar: rect('.replay-subbar'), topbar: rect('.replay-topbar'),
    events: cr && wr ? { cardH: Math.round(cr.height), wrapH: Math.round(wr.height), tableScrollH: wrap.scrollHeight, rowH: rows[0] ? Math.round(rows[0].getBoundingClientRect().height) : null, visibleRows: rows.filter((r) => r.getBoundingClientRect().bottom <= wr.bottom + 1).length, totalRows: rows.length } : null,
    contrast: ['.panel-heading strong', '.events-table td', '.ev-category', '#quad-status', '#history-status', '#message', '#replay-shortcuts', '.player-source', '.deck-state'].map(contrast),
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    counts: { buttons: document.querySelectorAll('button').length, ids: ['deck-a-card', 'deck-b-card', 'quad-grid', 'history-seek', 'take-replay', 'return-live', 'events-list'].filter((id) => document.getElementById(id)).length, rpCommands: document.querySelectorAll('[data-rp-command]').length },
    requiredIds: (() => {
      const ids = ['rec-status','record-btn','replay-disk','speed-select','speed-lbl','link-players','sync-status','player-A','player-B','player-a-badge','player-b-badge','replay-frame-A','replay-frame-B','replay-empty-A','replay-empty-B','missing-A','missing-B','missing-A-text','missing-B-text','position-A','position-B','seek-A','seek-B','deck-a-card','deck-b-card','deck-a-speed','deck-b-speed','quad-timecode','quad-grid','quad-status','quad-angle','quad-prev','quad-next','history-video','history-image','history-timecode','history-status','history-camera','history-audio','history-refresh','history-start-label','history-now-label','history-end-label','history-seek','history-back-frame','history-prev-second','history-play','history-next-frame','history-next-second','history-follow','history-speed','history-cursor','history-range','history-in','history-out','history-save','history-range-band','history-in-mark','history-out-mark','history-playhead','history-duration','events-list','events-total','interruption','interruption-text','recover-in','replay-event-detail','detail-head','import-file','import-name','import-cam','import-btn','message','replay-shortcuts','replay-selected-player','deck-state','take-replay','return-live','return-source','replay-settings','cam-select','retention-enabled','retention-minutes','retention-save','replay-camera-audio','audio-cam','audio-record','audio-gain','audio-muted','camera-offset','replay-audio','replay-path-dialog','path-title','path-help','path-value','path-confirm','clock-txt','replay-project','save-project','open-replay-settings','deck-a-speed','deck-b-speed'];
      return { required: ids.length, missing: ids.filter((id) => !document.getElementById(id)) };
    })(),
    dynamicCommands: [...document.querySelectorAll('[data-rp-command]')].filter((button) => !button.getAttribute('onclick')).length,
    disabledCommands: document.querySelectorAll('[data-rp-command]:disabled').length,
    states: {
      aBadge: document.querySelector('#player-a-badge')?.textContent,
      bBadge: document.querySelector('#player-b-badge')?.textContent,
      footerState: document.querySelector('#deck-state')?.textContent,
      footerStateData: document.querySelector('#deck-state')?.dataset.state,
      take: document.querySelector('#take-replay')?.textContent,
      historyMarks: { in: !document.querySelector('#history-in-mark')?.hidden, out: !document.querySelector('#history-out-mark')?.hidden, range: document.querySelector('#history-range')?.textContent },
    },
  };
};
const audit = await page.evaluate(collect);

for (const [w, h] of [[1600, 1000], [1280, 800], [1152, 720], [960, 600]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(out, `replay-${w}x${h}.png`) });
  audit['viewport_' + w + 'x' + h] = await page.evaluate(collect);
}

// Operational state captures (same page, same controller state).
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(350);
await page.click('#events-list [data-event="e1"]');
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(out, 'replay-detalhe.png') });

await page.evaluate(() => {
  const s = document.querySelector('#history-seek');
  s.value = String(Math.max(0, Number(s.max) - 30));
  s.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(900);
await page.click('#history-in');
await page.evaluate(() => {
  const s = document.querySelector('#history-seek');
  s.value = String(Math.max(0, Number(s.max) - 20));
  s.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(900);
await page.click('#history-out');
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(out, 'replay-timeline-marcada.png') });
const marks = await page.evaluate(collect);

// The missing-file route still opens the same locate dialog and does not unload the player.
await page.click('[data-missing-locate][data-player="B"]');
await page.waitForTimeout(250);
await page.screenshot({ path: path.join(out, 'replay-localizar-arquivo.png') });
const missingDialog = await page.evaluate(() => document.getElementById('replay-path-dialog').open);
await page.evaluate(() => document.getElementById('replay-path-dialog').close());

await page.click('#events-list [data-event="e2"] .btn-load-b');
await page.waitForTimeout(1600);
await page.screenshot({ path: path.join(out, 'replay-player-b-pronto.png') });
const loaded = await page.evaluate(collect);

await page.click('#take-replay');
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(out, 'replay-no-ar.png') });
const onair = await page.evaluate(collect);

await page.click('#return-live');
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(out, 'replay-voltar-ao-vivo.png') });
const live = await page.evaluate(collect);

// Topbar actions and keyboard selection still hit the same controller.
await page.click('#save-project');
const saveMessage = await page.evaluate(() => document.getElementById('message')?.textContent || '');
await page.click('#open-replay-settings');
await page.waitForTimeout(350);
await page.screenshot({ path: path.join(out, 'replay-configuracoes.png') });
const settingsOpen = await page.evaluate(() => document.getElementById('replay-settings').open);
await page.evaluate(() => document.getElementById('replay-settings').close());

await page.keyboard.press('b');
await page.waitForTimeout(250);
const deckAfterB = await page.evaluate(() => document.getElementById('replay-selected-player').value);
await page.keyboard.press('a');
await page.waitForTimeout(250);
const deckAfterA = await page.evaluate(() => document.getElementById('replay-selected-player').value);
const finalAudit = await page.evaluate(collect);

await fs.writeFile(path.join(out, 'audit.json'), JSON.stringify({ audit, marks, loaded, onair, live, finalAudit, missingDialog, saveMessage, settingsOpen, deckAfterB, deckAfterA, consoleErrors, pageErrors, failedRequests, badResponses }, null, 2));
await browser.close();
console.log(JSON.stringify({
  out, consoleErrors, pageErrors, failedRequests, badResponses,
  missingDialog, saveMessage, settingsOpen, deckAfterB, deckAfterA,
  requiredIds: finalAudit.requiredIds, dynamicCommands: finalAudit.dynamicCommands,
  states: { default: audit.states, marks: marks.states, loaded: loaded.states, onair: onair.states, live: live.states },
}, null, 2));
