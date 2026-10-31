import { chromium } from 'playwright-core';
const base = process.argv[2] || 'http://127.0.0.1:8795';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(base + '/replay', { waitUntil: 'networkidle' });
await page.waitForSelector('body.replay-operational-ready');
await page.waitForTimeout(1200);
await page.click('#events-list [data-event="e1"]');
await page.waitForTimeout(300);
const metrics = await page.evaluate(() => {
  const card = document.querySelector('.details-card');
  const detail = document.querySelector('#replay-event-detail');
  const importBox = document.querySelector('.import-box');
  const r = (n) => { if (!n) return null; const b = n.getBoundingClientRect(); return { y: Math.round(b.y), h: Math.round(b.height), sh: n.scrollHeight, ch: n.clientHeight, oy: getComputedStyle(n).overflowY, flex: getComputedStyle(n).flex }; };
  return {
    card: r(card), detail: r(detail), importBox: r(importBox),
    children: [...detail.children].map(n => ({ class: n.className, ...r(n) })),
    angles: [...document.querySelectorAll('.detail-angle')].map(n => r(n)),
  };
});
console.log(JSON.stringify(metrics, null, 2));
await browser.close();
