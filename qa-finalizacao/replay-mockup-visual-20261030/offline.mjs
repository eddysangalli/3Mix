import { chromium } from 'playwright-core';
import path from 'node:path';
const base = process.argv[2] || 'http://127.0.0.1:8795';
const out = path.resolve(import.meta.dirname, 'after');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], pageErrors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.route('**/api/replay', (route) => route.abort());
await page.route('**/api/json', (route) => route.abort());
await page.goto(base + '/replay', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('body.replay-operational-ready');
await page.waitForTimeout(2200);
await page.screenshot({ path: path.join(out, 'replay-sem-conexao.png') });
const state = await page.evaluate(() => ({
  rec: document.getElementById('rec-status')?.textContent,
  record: document.getElementById('record-btn')?.textContent,
  quad: document.getElementById('quad-status')?.textContent,
  history: document.getElementById('history-status')?.textContent,
  message: document.getElementById('message')?.textContent,
  events: document.getElementById('events-list')?.textContent.slice(0, 120),
  disabled: document.querySelectorAll('[data-rp-command]:disabled').length,
}));
console.log(JSON.stringify({ errors, pageErrors, state }, null, 2));
await browser.close();
