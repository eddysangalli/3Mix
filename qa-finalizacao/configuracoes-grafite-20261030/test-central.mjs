// Headless verification of the Configurações central: embedded pages in graphite identity, Saídas externas embedded,
// and the Transmissão category listing every destination. Runs against the offline fixture above (real panel files,
// mocked read API) and never touches the operator's installation or starts any output.
//   node test-central.mjs <port> antes    -> evidence of the current behaviour (before the change)
//   node test-central.mjs <port> depois   -> acceptance checks + evidence after the change
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/eddyr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const HERE = import.meta.dirname;
const PORT = Number(process.argv[2] || 8811);
const MODE = (process.argv[3] || 'depois').toLowerCase();
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(HERE, 'evidencias', MODE);

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

const report = { mode: MODE, checks: [], measurements: {}, screenshots: [], console: [], warnings: [], errors: [] };
const check = (name, condition, detail = '') => {
  if (MODE !== 'depois') return;
  assert.ok(condition, name + (detail ? ' — ' + detail : ''));
  report.checks.push(name + (detail ? ' — ' + detail : ''));
};
const measure = (key, value) => { report.measurements[key] = value; };

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

  const shot = async (name) => { await page.screenshot({ path: path.join(SHOTS, name), fullPage: false }); report.screenshots.push(name); };

  // Reading the embedded document's real computed styles (colour, type scale, state chips).
  const inside = (fn, arg) => page.evaluate(new Function('arg', `
    const doc = document.getElementById('settings-embed-frame')?.contentDocument;
    if (!doc) return null;
    return (${fn})(doc, arg);
  `), arg);
  const styleOf = (doc, selector) => {
    const el = doc.querySelector(selector);
    if (!el) return { selector, missing: true };
    const cs = getComputedStyle(el);
    return {
      selector,
      background: cs.backgroundColor,
      backgroundImage: cs.backgroundImage,
      border: cs.borderColor,
      color: cs.color,
      fontSize: cs.fontSize,
      height: el.getBoundingClientRect().height,
      text: (el.textContent || '').trim().slice(0, 60),
    };
  };
  const central = () => page.evaluate(() => ({
    title: document.getElementById('title')?.textContent,
    navCount: document.querySelectorAll('#categories button[data-category]').length,
    navLabels: [...document.querySelectorAll('#categories button[data-category]')].map((b) => b.textContent.trim().replace(/[↗●]/g, '').trim()),
    subtabs: [...document.querySelectorAll('.settings-subtabs button')].map((b) => b.textContent),
    embedRoute: document.querySelector('.settings-embed')?.dataset.route || '',
    embedCategory: document.querySelector('.settings-embed')?.dataset.category || '',
    hasEmbed: !!document.getElementById('settings-embed-frame'),
    fallbackWindow: !!document.querySelector('.settings-embed [data-open-window]'),
    hasOpenCard: /janela própria/i.test(document.getElementById('content')?.textContent || ''),
    destRows: [...document.querySelectorAll('#content .dest-row')].map((r) => ({
      name: r.querySelector('.dest-name')?.textContent || '',
      target: r.querySelector('.dest-target')?.textContent || '',
      proto: r.querySelector('.dest-proto')?.textContent || '',
      state: r.querySelector('.dest-state')?.textContent || '',
      tone: r.querySelector('.dest-state')?.dataset.tone || '',
    })),
    footer: ['apply', 'ok', 'cancel', 'import', 'export'].map((id) => ({ id, present: !!document.getElementById(id), label: document.getElementById(id)?.textContent?.trim() || '' })),
    production: document.getElementById('settings-current-production')?.textContent || '',
    pageScrollWidth: document.documentElement.scrollWidth,
    viewportWidth: innerWidth,
    bodyBg: getComputedStyle(document.body).backgroundColor,
  }));

  const waitEmbed = async (category) => {
    await page.waitForFunction((cat) => {
      const embed = document.querySelector('.settings-embed');
      const frame = document.getElementById('settings-embed-frame');
      if (!embed || embed.dataset.category !== cat || !frame) return false;
      const doc = frame.contentDocument;
      return !!doc && doc.readyState === 'complete' && doc.documentElement.classList.contains('embed-3mix');
    }, category, { timeout: 15000 });
    await sleep(400);
  };
  const select = async (category) => {
    await page.click(`#categories button[data-category="${category}"]`);
    await waitEmbed(category);
  };
  const subtab = async (id) => {
    await page.click(`.settings-subtabs button[data-subtab="${id}"]`);
    await sleep(250);
  };
  const commands = async () => (await (await fetch(ORIGIN + '/fixture/commands')).json()).commands;
  const resetCommands = async () => { await fetch(ORIGIN + '/fixture/commands/reset'); };

  // ---------------------------------------------------------------- central shell
  await page.goto(ORIGIN + '/configuracoes?category=dsk', { waitUntil: 'domcontentloaded' });
  await waitEmbed('dsk');
  await shot('00-central-1280x800.png');
  let info = await central();
  check('18 categorias na árvore preservadas', info.navCount === 18, String(info.navCount));
  check('rodapé Aplicar / Aplicar e fechar / Cancelar preservado', info.footer.every((f) => f.present) && info.footer.some((f) => f.id === 'ok' && /Aplicar e fechar/.test(f.label)));
  check('Importar / Exportar preservados', info.footer.some((f) => f.id === 'import') && info.footer.some((f) => f.id === 'export'));
  check('painel Produção atual preservado', /1920 × 1080/.test(info.production), info.production);
  measure('nav', info.navLabels.join(' | '));

  // search preserved
  await page.fill('#settings-search', 'chave');
  await sleep(300);
  const searchVisible = await page.evaluate(() => !document.getElementById('settings-search-results').hidden && !!document.querySelector('#settings-search-results button'));
  check('busca preservada', searchVisible);
  await page.fill('#settings-search', '');
  await sleep(200);

  // ---------------------------------------------------------------- 1. DSK (overlays)
  await select('dsk');
  info = await central();
  check('DSK embute a página real', info.embedRoute.startsWith('/overlays?'), info.embedRoute);
  const dsk = {
    body: await inside(styleOf, 'body'),
    section: await inside(styleOf, 'main section'),
    h2: await inside(styleOf, 'h2'),
    label: await inside(styleOf, '.form label'),
    field: await inside(styleOf, '#channel-transition'),
    kill: await inside(styleOf, '#btn-kill-all'),
    take: await inside(styleOf, '#btn-channel-take'),
    off: await inside(styleOf, '#btn-channel-off'),
    save: await inside(styleOf, '#btn-channel-apply'),
    tabActive: await inside(styleOf, '.channel-tabs button.active'),
    dveActive: await inside(styleOf, '.dve-grid button.active'),
    badgeOn: await inside(styleOf, '.badge-on'),
    badgeOff: await inside(styleOf, '.badge-off'),
  };
  measure('dsk', dsk);
  if (MODE === 'depois') {
    check('DSK base grafite #111318', dsk.body.background === 'rgb(17, 19, 24)', dsk.body.background);
    check('DSK painel #14171c', dsk.section.background === 'rgb(20, 23, 28)', dsk.section.background);
    check('DSK texto #e8ebef', dsk.body.color === 'rgb(232, 235, 239)', dsk.body.color);
    check('DSK título de seção 16 px', dsk.h2.fontSize === '16px', dsk.h2.fontSize);
    check('DSK corpo 14 px', dsk.body.fontSize === '14px', dsk.body.fontSize);
    check('DSK label 13 px', dsk.label.fontSize === '13px', dsk.label.fontSize);
    check('DSK campo 36 px', Math.round(dsk.field.height) === 36, String(dsk.field.height));
  }
  const neutral = (s) => { const m = /rgba?\((\d+), (\d+), (\d+)/.exec(s || ''); if (!m) return false; const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])]; return Math.max(r, g, b) - Math.min(r, g, b) <= 16; };
  measure('dsk.cores.botoes', { kill: dsk.kill.background, take: dsk.take.background, off: dsk.off.background, save: dsk.save.background, tabActive: dsk.tabActive.background, dveActive: dsk.dveActive.background, badgeOn: dsk.badgeOn.background });
  if (MODE === 'depois') {
    for (const [name, s] of [['Desarmar Todos', dsk.kill], ['Colocar no Ar (TAKE)', dsk.take], ['Retirar do Ar (OFF)', dsk.off]]) {
      check('DSK ação "' + name + '" em grafite/neutro', neutral(s.background), s.background);
    }
    check('DSK seleção de canal em grafite (não verde)', neutral(dsk.tabActive.background), dsk.tabActive.background);
    check('DSK preset DVE selecionado em grafite (não verde)', neutral(dsk.dveActive.background), dsk.dveActive.background);
    check('DSK chip NO AR mantém vermelho de estado', !neutral(dsk.badgeOn.background), dsk.badgeOn.background);
    check('DSK chip FORA DO AR neutro', neutral(dsk.badgeOff.background), dsk.badgeOff.background);
  }
  // controls preserved: 8 channels, matrix of 8 DSKs, channel switch keeps working
  const dskControls = await page.evaluate(() => {
    const doc = document.getElementById('settings-embed-frame').contentDocument;
    return {
      tabs: doc.querySelectorAll('#channel-tabs button').length,
      dve: doc.querySelectorAll('.dve-grid button').length,
      rows: doc.querySelectorAll('#matrix-tbody tr').length,
      heading: doc.getElementById('channel-heading')?.textContent || '',
      hasInputs: !!doc.getElementById('channel-input') && !!doc.getElementById('channel-duration') && !!doc.getElementById('channel-tie'),
    };
  });
  measure('dsk.controles', dskControls);
  check('DSK matriz dos 8 canais presente', dskControls.rows === 8, String(dskControls.rows));
  check('DSK 8 abas de canal e 8 presets DVE', dskControls.tabs === 8 && dskControls.dve === 8, JSON.stringify(dskControls));
  await page.frameLocator('#settings-embed-frame').locator('#channel-tabs button[data-channel="3"]').click();
  await page.waitForTimeout(200);
  const dskHeading = await inside((doc) => doc.getElementById('channel-heading').textContent);
  check('DSK troca de canal responde', /DSK 3/.test(dskHeading || ''), String(dskHeading));
  await shot('01-dsk-1280x800.png');

  // ---------------------------------------------------------------- 2. Multiview
  await select('multiview');
  const mv = {
    header: await inside(styleOf, 'body > header'),
    btn: await inside(styleOf, '.mv-btn'),
    btnActive: await inside(styleOf, '.mv-btn.active'),
    safe: await inside(styleOf, '#btn-safe'),
    tagPgm: await inside(styleOf, '.tag-pgm'),
  };
  measure('multiview', mv);
  if (MODE === 'depois') {
    check('Multiview botão comum em grafite', neutral(mv.btn.background), mv.btn.background);
    check('Multiview "16:9 Standard" selecionado em grafite (não verde)', neutral(mv.btnActive.background), mv.btnActive.background);
    check('Multiview "Safe Areas" em grafite (não verde)', neutral(mv.safe.background), mv.safe.background);
    check('Multiview tally PROGRAM · NO AR mantém vermelho de estado', !neutral(mv.tagPgm.background), mv.tagPgm.background);
  }
  const mvControls = await page.evaluate(() => {
    const doc = document.getElementById('settings-embed-frame').contentDocument;
    return { layouts: doc.querySelectorAll('.mv-btn[data-layout]').length, tiles: doc.querySelectorAll('#multiview-stage .mv-box').length, safe: !!doc.getElementById('btn-safe'), full: !!doc.getElementById('btn-full') };
  });
  measure('multiview.controles', mvControls);
  check('Multiview presets e Safe Areas preservados', mvControls.layouts === 5 && mvControls.safe && mvControls.full, JSON.stringify(mvControls));
  await page.frameLocator('#settings-embed-frame').locator('.mv-btn[data-layout="quad_split"]').click();
  await page.waitForTimeout(300);
  const mvLayout = await inside((doc) => doc.body.className);
  check('Multiview preset de layout aplica', /quad_split/.test(mvLayout || ''), String(mvLayout));
  await shot('02-multiview-1280x800.png');

  // ---------------------------------------------------------------- 3. Remoto (hub)
  await select('remote');
  const remote = {
    card: await inside(styleOf, '.grid a.card'),
    cardModular: await inside(styleOf, '.grid a.card[href="/modular"]'),
    h2: await inside(styleOf, 'h2'),
  };
  measure('remote', remote);
  if (MODE === 'depois') {
    check('Remoto cards em grafite', neutral(remote.card.background), remote.card.background);
    check('Remoto chip "3Mix Modular Studio" sem azul', neutral(remote.cardModular.border), remote.cardModular.border);
  }
  const hub = await page.evaluate(() => {
    const doc = document.getElementById('settings-embed-frame').contentDocument;
    return {
      cards: doc.querySelectorAll('.grid a.card').length,
      pin: doc.getElementById('pin')?.textContent || '',
      qr: doc.querySelectorAll('img.qr').length,
      pairing: !!doc.getElementById('pairing'),
    };
  });
  measure('remote.controles', hub);
  check('Remoto QR e código do operador preservados', hub.pairing && hub.pin.length >= 4 && hub.qr >= 1, JSON.stringify(hub));
  check('Remoto cards do hub preservados', hub.cards >= 17, String(hub.cards));
  await shot('03-remote-1280x800.png');

  // ---------------------------------------------------------------- 4. Automação (macros)
  await select('automation');
  await sleep(2600);   // the macro list is painted by the page's own 2 s state poll
  const auto = {
    novo: await inside(styleOf, '#new'),
    salvar: await inside(styleOf, '#save'),
    excluir: await inside(styleOf, '#remove'),
    parar: await inside(styleOf, '#stop'),
    input: await inside(styleOf, '#name'),
  };
  measure('automation', auto);
  if (MODE === 'depois') {
    for (const [name, s] of [['Nova Macro', auto.novo], ['Salvar', auto.salvar], ['Excluir Macro', auto.excluir], ['Parar', auto.parar]]) {
      check('Automação "' + name + '" em grafite/neutro', neutral(s.background), s.background);
    }
    check('Automação campo 36 px', Math.round(auto.input.height) === 36, String(auto.input.height));
  }
  const macros = await page.evaluate(() => {
    const doc = document.getElementById('settings-embed-frame').contentDocument;
    return {
      items: doc.querySelectorAll('#items button').length,
      steps: !!doc.getElementById('steps'),
      triggers: !!doc.getElementById('triggers'),
      actions: doc.getElementById('action')?.options?.length || 0,
      save: !!doc.getElementById('save') && !!doc.getElementById('run') && !!doc.getElementById('remove'),
    };
  });
  measure('automation.controles', macros);
  check('Automação macros/gatilhos/paços preservados', macros.items >= 2 && macros.steps && macros.triggers && macros.actions >= 10 && macros.save, JSON.stringify(macros));
  await page.frameLocator('#settings-embed-frame').locator('#new').click();
  await page.waitForTimeout(250);
  const macroName = await inside((doc) => doc.getElementById('name').value);
  check('Automação "Nova Macro" continua funcionando', macroName === '', String(macroName));
  await shot('04-automation-1280x800.png');

  // ---------------------------------------------------------------- 5. Saídas externas (outputs)
  await resetCommands();
  await page.click('#categories button[data-category="outputs"]');
  await sleep(400);
  info = await central();
  measure('outputs.abertura', { hasEmbed: info.hasEmbed, route: info.embedRoute, openCard: info.hasOpenCard, fallback: info.fallbackWindow });
  if (MODE === 'depois') {
    check('Saídas externas embute a página real', info.embedRoute.startsWith('/externo?') && info.hasEmbed, info.embedRoute);
    await waitEmbed('outputs');
    check('Saídas externas mantém atalho de janela própria', info.fallbackWindow);
    const out = {
      body: await inside(styleOf, 'body'),
      protoActive: await inside(styleOf, '#type-ndi'),
      start: await inside(styleOf, '#start-one'),
      state: await inside(styleOf, '#sender-state'),
      input: await inside(styleOf, '#net-name'),
    };
    measure('outputs.estilos', out);
    check('Saídas externas base grafite', out.body.background === 'rgb(17, 19, 24)', out.body.background);
    check('Saídas externas protocolo selecionado em grafite (não verde)', neutral(out.protoActive.background), out.protoActive.background);
    check('Saídas externas "Iniciar saída" em grafite/neutro', neutral(out.start.background), out.start.background);
    check('Saídas externas campo 36 px', Math.round(out.input.height) === 36, String(out.input.height));
    const outControls = await page.evaluate(() => {
      const doc = document.getElementById('settings-embed-frame').contentDocument;
      return {
        slots: doc.querySelectorAll('#nums button').length,
        types: ['type-ndi', 'type-omt', 'type-srt'].map((id) => !!doc.getElementById(id)),
        virtual: !!doc.getElementById('virtual-toggle'),
        save: !!doc.getElementById('save-close') && !!doc.getElementById('start-all') && !!doc.getElementById('view-status'),
      };
    });
    measure('outputs.controles', outControls);
    check('Saídas externas controles preservados (4 saídas · NDI/OMT/SRT)', outControls.slots === 4 && outControls.types.every(Boolean) && outControls.save, JSON.stringify(outControls));
    await shot('05-outputs-1280x800.png');
  } else {
    await shot('05-outputs-1280x800.png');
  }
  const outputCommands = await commands();
  measure('outputs.comandos', outputCommands.map((c) => c.action));
  const started = outputCommands.filter((c) => /start|_network|stream|record|virtual|projector/i.test(c.action));
  check('abrir Saídas externas não inicia saída nem transmissão', started.length === 0, started.map((c) => c.action).join(','));

  // ---------------------------------------------------------------- 6. Transmissão (streaming)
  await resetCommands();
  await page.click('#categories button[data-category="streaming"]');
  await sleep(600);
  info = await central();
  measure('streaming.abertura', { subtabs: info.subtabs, destRows: info.destRows });
  check('Transmissão ganha abas MultiStream e Saídas externas', MODE === 'antes' ? true : info.subtabs.includes('MultiStream') && info.subtabs.includes('Saídas externas'), JSON.stringify(info.subtabs));
  if (MODE === 'depois') {
    const names = info.destRows.map((r) => r.name);
    check('Transmissão lista todas as destinações (principal + MultiStream + externas)',
      names.some((n) => /principal/i.test(n)) && names.some((n) => /Backup YouTube/.test(n)) && names.some((n) => /Retorno Externa/.test(n)) && names.some((n) => /NDI/.test(n)) && names.some((n) => /OMT/.test(n)),
      names.join(' | '));
    const states = info.destRows.map((r) => r.state + '/' + r.tone).join(' | ');
    measure('streaming.estados', states);
    check('estados reais por destinação (ativo/parado)', info.destRows.every((r) => /no ar|parado|enviando|erro|gravando/.test(r.state)), states);
  }
  await shot('06-streaming-1280x800.png');
  await page.evaluate(() => document.querySelector('.dest-list')?.scrollIntoView({ block: 'center' }));
  await sleep(250);
  await shot('06b-streaming-destinos-1280x800.png');

  if (MODE === 'depois') {
    // MultiStream tab embeds the real window behind Mesa's "Abrir MultiStream…"
    await subtab('streamMultistream');
    await waitEmbed('streamMultistream');
    info = await central();
    check('aba MultiStream embute a página real', info.embedRoute.startsWith('/transmitir?'), info.embedRoute);
    const multi = await page.evaluate(() => {
      const doc = document.getElementById('settings-embed-frame').contentDocument;
      return {
        slots: doc.querySelectorAll('#nums button').length,
        provider: !!doc.getElementById('provider') && !!doc.getElementById('url') && !!doc.getElementById('key') && !!doc.getElementById('quality'),
        bar: !!doc.getElementById('start-all') && !!doc.getElementById('view-status') && !!doc.getElementById('save-close'),
      };
    });
    measure('streaming.multistream.controles', multi);
    check('MultiStream preserva 5 destinos e controles reais', multi.slots === 5 && multi.provider && multi.bar, JSON.stringify(multi));
    await shot('07-streaming-multistream-1280x800.png');

    await subtab('streamExternal');
    await waitEmbed('streamExternal');
    info = await central();
    check('aba Saídas externas embute a página real', info.embedRoute.startsWith('/externo?'), info.embedRoute);
    await shot('08-streaming-externo-1280x800.png');
    await subtab('streaming');
    await sleep(300);
  }

  const streamCommands = await commands();
  measure('streaming.comandos', streamCommands.map((c) => c.action));
  const streamStarted = streamCommands.filter((c) => /start|_network|stream|record|virtual|projector|configure/i.test(c.action));
  check('abrir Transmissão não inicia saída nem transmissão', streamStarted.length === 0, streamStarted.map((c) => c.action).join(','));

  // state colours with a live destination (fixture flips one destination and one NDI sender on)
  await fetch(ORIGIN + '/fixture/outputs?live=1');
  await page.goto(ORIGIN + '/configuracoes?category=streaming', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('title')?.textContent === 'Transmissão');
  await sleep(900);
  const liveRows = (await central()).destRows;
  measure('streaming.estados-ao-vivo', liveRows.map((r) => r.name + '=' + r.state + '/' + r.tone).join(' | '));
  if (MODE === 'depois') {
    check('estado "no ar"/"enviando" aparece nas destinações ativas', liveRows.some((r) => r.tone === 'live'), JSON.stringify(liveRows));
  }
  await page.evaluate(() => document.querySelector('.dest-list')?.scrollIntoView({ block: 'center' }));
  await sleep(250);
  await shot('09-streaming-estados-1280x800.png');
  await fetch(ORIGIN + '/fixture/outputs?live=0');

  // ---------------------------------------------------------------- 7. regression of the field categories
  await page.goto(ORIGIN + '/configuracoes?category=files', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('title')?.textContent === 'Gravação');
  info = await central();
  check('sub-abas de Gravação preservadas', JSON.stringify(info.subtabs) === JSON.stringify(['Básico', 'Arquivos', 'Trilhas', 'Ao iniciar/parar', 'Avançado']), JSON.stringify(info.subtabs));
  await page.goto(ORIGIN + '/configuracoes?category=streaming', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('title')?.textContent === 'Transmissão');
  await page.waitForTimeout(500);
  info = await central();
  measure('streaming.subtabs', info.subtabs);
  await page.goto(ORIGIN + '/configuracoes?category=outputs', { waitUntil: 'domcontentloaded' });
  await sleep(700);
  info = await central();
  check('rota ?category=outputs abre Saídas externas embutida', info.embedCategory === 'outputs' || MODE === 'antes', info.embedCategory);
  await page.goto(ORIGIN + '/configuracoes?category=display', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('title')?.textContent === 'Vídeo da produção');
  check('rota antiga ?category=display abre Vídeo', true);

  // embeds outside this front's scope keep mounting untouched (the paint layer never reaches them)
  for (const [cat, route] of [['replay', '/replay?'], ['updates', '/atualizacao?']]) {
    await page.goto(ORIGIN + '/configuracoes?category=' + cat, { waitUntil: 'domcontentloaded' });
    await waitEmbed(cat);
    info = await central();
    check(cat + ' embutido preservado', info.embedRoute.startsWith(route), info.embedRoute);
  }

  // ---------------------------------------------------------------- 8. viewports
  for (const viewport of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1600, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await page.goto(ORIGIN + '/configuracoes?category=dsk', { waitUntil: 'domcontentloaded' });
    await waitEmbed('dsk');
    info = await central();
    check(`sem overflow horizontal em ${viewport.width}×${viewport.height}`, info.pageScrollWidth <= info.viewportWidth + 1, `${info.pageScrollWidth}/${info.viewportWidth}`);
    await shot(`10-dsk-${viewport.width}x${viewport.height}.png`);
    await page.goto(ORIGIN + '/configuracoes?category=streaming', { waitUntil: 'domcontentloaded' });
    await sleep(700);
    info = await central();
    check(`Transmissão sem overflow em ${viewport.width}×${viewport.height}`, info.pageScrollWidth <= info.viewportWidth + 1, `${info.pageScrollWidth}/${info.viewportWidth}`);
    await shot(`11-streaming-${viewport.width}x${viewport.height}.png`);
    await page.goto(ORIGIN + '/configuracoes?category=outputs', { waitUntil: 'domcontentloaded' });
    await sleep(700);
    await shot(`12-outputs-${viewport.width}x${viewport.height}.png`);
  }
  await page.setViewportSize({ width: 1280, height: 800 });

  // ---------------------------------------------------------------- console
  report.warnings = [...new Set(consoleWarnings)];
  report.errors = [...new Set(consoleErrors)];
  report.knownPreExisting = report.errors.filter((entry) => entry.includes('esc is not defined'));
  report.unexpectedErrors = report.errors.filter((entry) => !entry.includes('esc is not defined'));
  measure('console.erros', report.errors);
  if (MODE === 'depois') {
    check('console limpo (sem erros)', report.errors.length === 0, report.errors.join(' | '));
  } else {
    check('sem erros novos além do esc pré-existente', report.unexpectedErrors.length === 0, report.unexpectedErrors.join(' | '));
  }
  await browser.close();
  browser = null;
  await fs.writeFile(path.join(HERE, 'relatorio-' + MODE + '.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ mode: MODE, checks: report.checks.length, screenshots: report.screenshots.length, errors: report.errors, measurements: report.measurements }, null, 2));
}

main().catch(async (error) => {
  console.error('QA_FAIL', error.stack || error.message);
  console.error(JSON.stringify({ checks: report.checks, measurements: report.measurements, errors: consoleErrors }, null, 2));
  await fs.writeFile(path.join(HERE, 'relatorio-' + MODE + '.json'), JSON.stringify({ ...report, failed: error.message }, null, 2)).catch(() => {});
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close().catch(() => {});
  fixture.kill();
});
