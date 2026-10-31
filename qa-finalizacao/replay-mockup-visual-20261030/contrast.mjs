import { chromium } from 'playwright-core';
const base = process.argv[2] || 'http://127.0.0.1:8795';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(base + '/replay', { waitUntil: 'networkidle' });
await page.waitForSelector('body.replay-operational-ready');
await page.waitForTimeout(1600);
await page.click('#events-list [data-event="e1"]');
await page.waitForTimeout(300);
await page.click('#events-list [data-event="e2"] .btn-load-b');
await page.waitForTimeout(1200);
const result = await page.evaluate(() => {
  const rgb = (v) => { const m = String(v).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
  const bgOf = (n) => { while (n) { const c = rgb(getComputedStyle(n).backgroundColor); if (c && c[3] > .5) return c; n = n.parentElement; } return [32, 32, 32, 1]; };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const check = (sel) => { const n = document.querySelector(sel); if (!n) return null; const fg = rgb(getComputedStyle(n).color), bg = bgOf(n); if (!fg) return null; const a = lum(fg) + .05, b = lum(bg) + .05; return { sel, ratio: Math.round((Math.max(a, b) / Math.min(a, b)) * 100) / 100, fg: getComputedStyle(n).color, bg: `rgb(${bg[0]},${bg[1]},${bg[2]})`, font: getComputedStyle(n).fontSize }; };
  return {
    loadedBadge: check('.badge-loaded[data-state="loaded"]'),
    onairBadge: check('.badge-loaded[data-state="onair"]'),
    deckSpeed: check('.deck-speed'),
    loadA: check('.btn-load-a'),
    loadB: check('.btn-load-b'),
    available: check('.ev-available.available'),
    markOut: check('.btn-mark-out'),
    markIn: check('.btn-mark-in'),
    saveRange: check('#history-save'),
    take: check('#take-replay'),
    angleLoadA: check('.angle-actions .btn-load-a'),
    angleState: check('.angle-state'),
    detailHead: check('.detail-head'),
  };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
