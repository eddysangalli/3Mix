// Headless verification of the settings central's inline pages. Runs against the offline fixture above (real panel
// files, mocked read API) and never touches the operator's installation or starts outputs.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/eddyr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const HERE = import.meta.dirname;
const PORT = Number(process.argv[2] || 8793);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(HERE, 'evidencias');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fixture = spawn(process.execPath, [path.join(HERE, 'fixture-server.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
let fixtureLog = '';
fixture.stdout.on('data', (data) => { fixtureLog += data; });
fixture.stderr.on('data', (data) => { fixtureLog += data; });
const waitFixture = async () => {
  for (let i = 0; i < 80; i++) {
    if (fixtureLog.includes('FIXTURE_READY')) return;
    await sleep(100);
  }
  throw new Error('fixture did not start: ' + fixtureLog);
};

const report = { checks: [], screenshots: [], errors: [], console: [], warnings: [] };
const check = (name, condition, detail = '') => {
  assert.ok(condition, name + (detail ? ' — ' + detail : ''));
  report.checks.push(name + (detail ? ' — ' + detail : ''));
};

const consoleErrors = [];
const consoleWarnings = [];
let browser = null;

async function main() {
  await fs.mkdir(SHOTS, { recursive: true });
  await waitFixture();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', (msg) => {
    const entry = msg.type() + ': ' + msg.text() + ' [' + (msg.location()?.url || '') + ']';
    if (msg.type() === 'error') consoleErrors.push(entry);
    else if (msg.type() === 'warning') consoleWarnings.push(entry);
    else report.console.push(entry);
  });
  page.on('pageerror', (error) => consoleErrors.push('pageerror: ' + error.message + ' @ ' + String(error.stack || '').split('\n')[1]?.trim()));

  const state = () => page.evaluate(() => {
    const frame = document.getElementById('settings-embed-frame');
    const doc = frame?.contentDocument;
    const content = document.querySelector('.settings-content');
    const embed = document.querySelector('.settings-embed');
    return {
      title: document.getElementById('title')?.textContent,
      description: document.getElementById('description')?.textContent,
      category: embed?.dataset.category,
      route: embed?.dataset.route,
      src: frame?.src || '',
      frameHeight: frame ? frame.getBoundingClientRect().height : 0,
      frameWidth: frame ? frame.getBoundingClientRect().width : 0,
      contentOverflow: content ? getComputedStyle(content).overflowY : '',
      contentScrollWidth: content?.scrollWidth || 0,
      contentClientWidth: content?.clientWidth || 0,
      pageScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      embeddedClass: !!doc?.documentElement.classList.contains('embed-3mix'),
      injectedStyle: !!doc?.getElementById('3mix-embed-chrome'),
      navCount: document.querySelectorAll('#categories button[data-category]').length,
      subtabs: [...document.querySelectorAll('.settings-subtabs button')].map((b) => b.textContent),
      inlineFallback: !!document.querySelector('.settings-embed [data-open-window]'),
      duplicateTitle: (() => {
        if (!doc) return 'no-document';
        for (const selector of ['body > header', '.vd-strip', '.vd-sidebar-header', '.mv-brand']) {
          const element = doc.querySelector(selector);
          if (element && getComputedStyle(element).display !== 'none') return selector;
        }
        return null;
      })(),
      headerDisplay: (() => { const h = doc?.querySelector('body > header'); return h ? getComputedStyle(h).display : 'absent'; })(),
      stripDisplay: (() => { const s = doc?.querySelector('.vd-strip'); return s ? getComputedStyle(s).display : 'absent'; })(),
      brandDisplay: (() => { const b = doc?.querySelector('.mv-brand'); return b ? getComputedStyle(b).display : 'absent'; })(),
    };
  });

  const waitEmbed = async (category) => {
    await page.waitForFunction((cat) => {
      const embed = document.querySelector('.settings-embed');
      const frame = document.getElementById('settings-embed-frame');
      if (!embed || embed.dataset.category !== cat || !frame) return false;
      const doc = frame.contentDocument;
      return !!doc && doc.readyState === 'complete' && doc.documentElement.classList.contains('embed-3mix');
    }, category, { timeout: 15000 });
    await sleep(350);
  };

  const select = async (category) => {
    await page.click(`#categories button[data-category="${category}"]`);
    await waitEmbed(category);
    return state();
  };

  // 1. Replay inline, real page, own tabs still working.
  await page.goto(ORIGIN + '/configuracoes?category=replay', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#settings-embed-frame');
  await waitEmbed('replay');
  let info = await state();
  check('18 categorias na navegação', info.navCount === 18, String(info.navCount));
  check('Replay usa iframe same-origin', info.route === '/replay?view=settings&embed=1' && info.src.includes('/replay?view=settings&embed=1'), info.src);
  check('título da central mantido', info.title === 'Replay' && !!info.description, info.title);
  check('CSS injetado no documento embutido', info.embeddedClass && info.injectedStyle);
  check('cabeçalho próprio do Replay oculto', info.duplicateTitle === null);
  check('iframe ocupa a área de conteúdo', info.frameHeight > 380 && info.frameWidth > 500, `${Math.round(info.frameWidth)}×${Math.round(info.frameHeight)}`);
  check('rolagem fica no conteúdo embutido', info.contentOverflow === 'hidden');
  check('botão discreto Abrir em janela presente', info.inlineFallback);
  const replayFrame = page.frameLocator('#settings-embed-frame');
  await replayFrame.locator('#tab-btn-storage').click();
  await page.waitForTimeout(150);
  const storageVisible = await page.evaluate(() => {
    const doc = document.getElementById('settings-embed-frame').contentDocument;
    return !doc.getElementById('tab-storage').hidden && doc.querySelector('#tab-btn-storage').classList.contains('active');
  });
  check('abas reais do Replay continuam funcionando', storageVisible);
  await page.screenshot({ path: path.join(SHOTS, '01-replay-1280x800.png'), fullPage: false });
  report.screenshots.push('01-replay-1280x800.png');

  // 2. DSK / overlays.
  info = await select('dsk');
  check('DSK embute a página real de overlays', info.route === '/overlays?embed=1' && info.src.includes('/overlays?embed=1'), info.src);
  check('cabeçalho duplicado do DSK oculto', info.headerDisplay === 'none');
  const dskFrame = page.frameLocator('#settings-embed-frame');
  await dskFrame.locator('#channel-tabs button[data-channel="2"]').click();
  await page.waitForTimeout(150);
  const dskHeading = await page.evaluate(() => document.getElementById('settings-embed-frame').contentDocument.getElementById('channel-heading').textContent);
  check('controles do DSK respondem dentro da central', dskHeading.includes('DSK 2'), dskHeading);
  await page.screenshot({ path: path.join(SHOTS, '02-dsk-1280x800.png'), fullPage: false });
  report.screenshots.push('02-dsk-1280x800.png');

  // The DSK page already throws "esc is not defined" when opened standalone; keep the proof so the central is not
  // blamed for a pre-existing page defect (the DSK file is owned by another front).
  const standalone = await context.newPage();
  const standaloneErrors = [];
  standalone.on('pageerror', (error) => standaloneErrors.push(error.message));
  await standalone.goto(ORIGIN + '/overlays', { waitUntil: 'domcontentloaded' });
  await sleep(1200);
  check('erro do DSK é pré-existente na página avulsa', standaloneErrors.some((message) => message.includes('esc is not defined')), standaloneErrors.join(' | '));
  await standalone.close();

  // 3. Multiview: its layout controls are content, only the duplicate brand goes away.
  info = await select('multiview');
  check('Multiview embute a página real', info.route === '/multiview?embed=1' && info.src.includes('/multiview?embed=1'), info.src);
  check('marca/título duplicado do Multiview oculto', info.brandDisplay === 'none');
  const mvStage = await page.evaluate(() => {
    const doc = document.getElementById('settings-embed-frame').contentDocument;
    return { controls: getComputedStyle(doc.querySelector('.mv-controls')).display, stage: doc.getElementById('multiview-stage').children.length };
  });
  check('controles de layout do Multiview preservados', mvStage.controls !== 'none' && mvStage.stage > 0, JSON.stringify(mvStage));
  await page.screenshot({ path: path.join(SHOTS, '03-multiview-1280x800.png'), fullPage: false });
  report.screenshots.push('03-multiview-1280x800.png');

  // 4. Shortcuts.
  info = await select('shortcuts');
  check('Atalhos embute a página real', info.route === '/atalhos?embed=1' && info.src.includes('/atalhos?embed=1'), info.src);
  check('barra de título própria dos Atalhos oculta', info.stripDisplay === 'none');
  const shortcuts = await page.evaluate(() => {
    const doc = document.getElementById('settings-embed-frame').contentDocument;
    return { rows: doc.querySelectorAll('#items tr').length, save: !!doc.getElementById('save') };
  });
  check('tabela e ações reais dos Atalhos preservadas', shortcuts.save, JSON.stringify(shortcuts));
  await page.screenshot({ path: path.join(SHOTS, '04-atalhos-1280x800.png'), fullPage: false });
  report.screenshots.push('04-atalhos-1280x800.png');

  // 5. All remaining inline categories.
  const remaining = [
    ['remote', '/hub?embed=1', 'Hub de Operadores'],
    ['automation', '/macros?embed=1', 'Macros e Automação'],
    ['recovery', '/recuperacao?embed=1', 'Recuperação e Segurança'],
    ['diagnostics', '/diagnosticos?embed=1', 'Diagnósticos e Logs para Suporte'],
    ['updates', '/atualizacao?embed=1', 'Atualizações Assinadas'],
  ];
  for (const [category, route, title] of remaining) {
    info = await select(category);
    check(category + ' embute a página real', info.route === route && info.src.includes(route), info.src);
    const titleInside = await page.evaluate(() => {
      const doc = document.getElementById('settings-embed-frame').contentDocument;
      const strip = doc.querySelector('.vd-strip');
      const header = doc.querySelector('body > header');
      return { title: doc.title, strip: strip ? getComputedStyle(strip).display : 'absent', header: header ? getComputedStyle(header).display : 'absent' };
    });
    check(category + ' sem cabeçalho duplicado', titleInside.strip === 'none' || titleInside.header === 'none', JSON.stringify(titleInside));
    await page.screenshot({ path: path.join(SHOTS, `05-${category}-1280x800.png`), fullPage: false });
    report.screenshots.push(`05-${category}-1280x800.png`);
  }

  // 6. Hub cards must not replace the embedded page: they open a real window route.
  await select('remote');
  const frameBefore = await page.evaluate(() => document.getElementById('settings-embed-frame').src);
  await page.frameLocator('#settings-embed-frame').locator('a[href="/corte"]').click();
  await sleep(500);
  const frameAfter = await page.evaluate(() => document.getElementById('settings-embed-frame').src);
  check('link do Hub não navega o iframe', frameBefore === frameAfter, frameAfter);

  // 7. Fallback button runs without navigating.
  const urlBefore = page.url();
  await page.locator('.settings-embed [data-open-window]').click();
  await sleep(300);
  check('Abrir em janela não troca a página da central', page.url() === urlBefore && (await page.locator('#settings-embed-frame').count()) === 1);

  // 8. The iframe survives an engine tick (no unnecessary reload).
  await select('replay');
  await page.evaluate(() => { document.getElementById('settings-embed-frame').contentWindow.__qaAlive = 'yes'; });
  await fetch(ORIGIN + '/fixture/state?recording=1');
  await sleep(2200);
  const alive = await page.evaluate(() => document.getElementById('settings-embed-frame')?.contentWindow?.__qaAlive || '');
  check('iframe não recarrega a cada leitura do motor', alive === 'yes', alive);
  await fetch(ORIGIN + '/fixture/state?recording=0');
  await sleep(600);

  // 9. Legacy routes and sub-tabs remain.
  await page.goto(ORIGIN + '/configuracoes?category=files', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('title')?.textContent === 'Gravação');
  info = await state();
  check('rota antiga ?category=files abre Gravação', info.title === 'Gravação');
  check('sub-abas de Gravação preservadas', JSON.stringify(info.subtabs) === JSON.stringify(['Básico', 'Arquivos', 'Trilhas', 'Ao iniciar/parar', 'Avançado']), JSON.stringify(info.subtabs));
  const filesOn = await page.evaluate(() => document.querySelector('.settings-subtabs button[data-subtab="files"]')?.classList.contains('on'));
  check('aba Arquivos marcada', filesOn);
  await page.goto(ORIGIN + '/configuracoes?category=appearance', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('title')?.textContent === 'Interface');
  info = await state();
  check('rota antiga ?category=appearance abre Interface', info.title === 'Interface' && info.subtabs.includes('Texto e densidade'));

  const parents = [
    ['recording', ['Básico', 'Arquivos', 'Trilhas', 'Ao iniciar/parar', 'Avançado']],
    ['streaming', ['Básico', 'Rede', 'Trilhas', 'Ao iniciar/parar', 'Avançado']],
    ['workspace', ['Layout da mesa', 'Texto e densidade', 'Janela e encaixe']],
    ['performance', ['Geral', 'Motor e prioridade']],
  ];
  for (const [category, tabs] of parents) {
    await page.goto(ORIGIN + '/configuracoes?category=' + category, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.getElementById('title')?.textContent !== 'Carregando…');
    info = await state();
    check('categoria ' + category + ' mantém sub-abas', JSON.stringify(info.subtabs) === JSON.stringify(tabs), JSON.stringify(info.subtabs));
  }
  await page.goto(ORIGIN + '/configuracoes?category=outputAdvanced&context=recording', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('title')?.textContent === 'Gravação');
  const advancedOn = await page.evaluate(() => document.querySelector('.settings-subtabs button[data-subtab="outputAdvanced"]')?.classList.contains('on'));
  check('rota antiga com context=recording abre Saída avançada', advancedOn);

  await page.goto(ORIGIN + '/settings?category=replay', { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/configuracoes\?category=replay/, { timeout: 10000 });
  await waitEmbed('replay');
  check('rota legada /settings redireciona para a central', new URL(page.url()).pathname === '/configuracoes', page.url());

  await page.goto(ORIGIN + '/configuracoes?category=display', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('title')?.textContent === 'Vídeo da produção');
  check('rota antiga ?category=display abre Vídeo', true);

  await page.goto(ORIGIN + '/configuracoes?category=about', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('title')?.textContent === 'Sobre');
  await waitEmbed('updates');
  check('rota antiga ?category=about abre Sobre', true);

  // 10. Central typography/density (not the embedded page): 14px body, 23px title, 17px section, 13.5px label,
  // 38px fields and 13px buttons, all in Segoe UI Variable/Segoe UI.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(ORIGIN + '/configuracoes?category=video', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#content .native-fields input'));
  const type = await page.evaluate(() => {
    const css = (element) => getComputedStyle(element);
    const field = document.querySelector('#content .native-fields input:not([type=checkbox])');
    const label = document.querySelector('#content .native-fields > label');
    const cardTitle = document.querySelector('#content .settings-card h2');
    const button = document.querySelector('.settings-footer button');
    return {
      body: css(document.body).fontSize,
      family: css(document.body).fontFamily,
      h1: css(document.querySelector('.content-header h1')).fontSize,
      cardTitle: cardTitle ? css(cardTitle).fontSize : 'no-card-title',
      label: label ? css(label).fontSize : 'no-label',
      description: css(document.querySelector('.content-header p')).fontSize,
      fieldHeight: field ? field.getBoundingClientRect().height : 0,
      buttonHeight: button ? button.getBoundingClientRect().height : 0,
      buttonFont: button ? css(button).fontSize : 'no-button',
    };
  });
  check('corpo da central em 14 px', type.body === '14px', type.body);
  check('família Segoe UI Variable/Segoe UI', /Segoe UI/.test(type.family), type.family);
  check('título da central em 23 px', type.h1 === '23px', type.h1);
  check('título de seção em 17 px', type.cardTitle === '17px', type.cardTitle);
  check('label em 13,5 px', type.label === '13.5px', type.label);
  check('campo com 38 px', type.fieldHeight >= 36 && type.fieldHeight <= 40, String(type.fieldHeight));
  check('botão com 36 px e 13 px de fonte', type.buttonHeight >= 36 && type.buttonHeight <= 40 && type.buttonFont === '13px', `${type.buttonHeight}/${type.buttonFont}`);

  // 11. Layout at 1280×800, 1024×640 (125%) and 853×533 (150%).
  for (const viewport of [{ width: 1280, height: 800 }, { width: 1024, height: 640 }, { width: 853, height: 533 }]) {
    await page.setViewportSize(viewport);
    await page.goto(ORIGIN + '/configuracoes?category=replay', { waitUntil: 'domcontentloaded' });
    await waitEmbed('replay');
    info = await state();
    check(`sem overflow horizontal em ${viewport.width}×${viewport.height}`, info.pageScrollWidth <= info.viewportWidth + 1, `${info.pageScrollWidth}/${info.viewportWidth}`);
    check(`iframe útil em ${viewport.width}×${viewport.height}`, info.frameHeight >= 180 && info.frameWidth >= 300, `${Math.round(info.frameWidth)}×${Math.round(info.frameHeight)}`);
    await page.screenshot({ path: path.join(SHOTS, `06-replay-${viewport.width}x${viewport.height}.png`), fullPage: false });
    report.screenshots.push(`06-replay-${viewport.width}x${viewport.height}.png`);
  }

  report.console = [...new Set(report.console)];
  report.warnings = [...new Set(consoleWarnings)];
  report.errors = [...new Set(consoleErrors)];
  report.knownPreExisting = report.errors.filter((entry) => entry.includes('esc is not defined'));
  report.unexpectedErrors = report.errors.filter((entry) => !entry.includes('esc is not defined'));
  check('sem erros de console novos no console da central', report.unexpectedErrors.length === 0, report.unexpectedErrors.join(' | '));
  await browser.close();
  browser = null;
  await fs.writeFile(path.join(HERE, 'relatorio.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch(async (error) => {
  console.error('QA_FAIL', error.stack || error.message);
  console.error(JSON.stringify({ checks: report.checks, screenshots: report.screenshots, errors: consoleErrors, warnings: consoleWarnings }, null, 2));
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close().catch(() => {});
  fixture.kill();
});
