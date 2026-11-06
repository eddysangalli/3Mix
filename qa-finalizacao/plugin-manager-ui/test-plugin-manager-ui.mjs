import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = await readFile(new URL('../../painel/remoto/plugin-manager-ui.js', import.meta.url), 'utf8');
const snapshot = {
  success: true, engine: { version: '32.2.2' }, productionActive: false, safeMode: false,
  plugins: [{ id: 'qa-plugin', name: '<img src=x onerror=alert(1)>', version: '1.0', developer: 'QA',
    state: 'active', compatibility: 'pending-test', managed: true, essential: false,
    backupAvailable: true, source: 'arquivo local', sha256: 'a'.repeat(64),
    signature: { status: 'Valid', signer: 'QA <Signer>' }, resources: { inputs: ['qa-input'] } },
  { id: 'qa-pending', name: 'QA Pending', version: '2.0', developer: 'QA', state: 'pending-update',
    compatibility: 'pending-test', managed: true, essential: false, backupAvailable: false, resources: {} },
  { id: 'qa-integrated', name: 'QA Integrated', version: '1.0', developer: 'QA', state: 'active',
    compatibility: 'verified', managed: false, protected: true, essential: false, backupAvailable: false, resources: {} }],
  catalog: [], diagnostics: [{ severity: 'warning', code: 'QA', pluginId: 'qa-plugin', message: 'Revisar dependência' }],
};

function fixture() {
  const calls = [];
  const handlers = {};
  const element = { isConnected: true, innerHTML: '', addEventListener(type, fn) { handlers[type] = fn; }, querySelector() { return { click() {} }; } };
  const sandbox = {
    window: {}, AbortSignal, FormData, confirm: () => true,
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ ...snapshot, plugins: snapshot.plugins.map((p) => ({ ...p })) }) };
    },
  };
  runInNewContext(source, sandbox);
  const click = (selector, dataset) => handlers.click({ target: { closest: (candidate) => candidate === selector ? { dataset, disabled: false } : null } });
  const changeFile = (file) => handlers.change({ target: { id: 'pm-file', files: [file] } });
  return { ui: sandbox.window.FreeMixPluginManager, element, calls, click, changeFile };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('four areas render, labels are escaped, and module actions use the API', async () => {
  const f = fixture();
  f.ui.mount(f.element);
  await flush();
  assert.match(f.element.innerHTML, /Instalados/);
  assert.match(f.element.innerHTML, /Catálogo/);
  assert.match(f.element.innerHTML, /Instalar arquivo/);
  assert.match(f.element.innerHTML, /Diagnóstico/);
  assert.doesNotMatch(f.element.innerHTML, /<img src=x onerror/);
  assert.match(f.element.innerHTML, /&lt;img src=x onerror/);
  f.click('[data-plugin-action]', { pluginAction: 'disable', pluginTarget: 'qa-plugin' });
  await flush();
  const operation = f.calls.find((c) => c.url === '/api/plugin-manager/disable');
  assert.deepEqual(JSON.parse(operation.options.body), { id: 'qa-plugin' });
  assert.equal(operation.options.headers['X-3Mix-Plugin-Manager'], '1');
  f.click('[data-plugin-tab]', { pluginTab: 'diagnostics' });
  assert.match(f.element.innerHTML, /Revisar dependência/);
});

test('production lock prevents mutations and ZIP upload uses multipart file field', async () => {
  const f = fixture();
  f.ui.mount(f.element);
  await flush();
  f.ui.mount(f.element, { productionActive: true });
  assert.match(f.element.innerHTML, /Produção ativa/);
  f.click('[data-plugin-action]', { pluginAction: 'disable', pluginTarget: 'qa-plugin' });
  assert.equal(f.calls.some((c) => c.url === '/api/plugin-manager/disable'), false);
  f.ui.mount(f.element, { productionActive: false });
  f.click('[data-plugin-tab]', { pluginTab: 'install' });
  f.changeFile(new File(['zip'], 'qa-plugin.zip', { type: 'application/zip' }));
  f.click('[data-plugin-action]', { pluginAction: 'install-file' });
  await flush();
  const upload = f.calls.find((c) => c.url === '/api/plugin-manager/install');
  assert.equal(upload.options.method, 'POST');
  assert.equal(upload.options.headers['X-3Mix-Plugin-Manager'], '1');
  assert.equal(upload.options.body.get('file')?.name, 'qa-plugin.zip');
});

test('installed cards expose provenance and friendly pending states without trusting metadata HTML', async () => {
  const f = fixture();
  f.ui.mount(f.element);
  await flush();
  assert.match(f.element.innerHTML, /Atualização preparada/);
  assert.match(f.element.innerHTML, /Origem: arquivo local/);
  assert.match(f.element.innerHTML, /Assinatura: Valid/);
  assert.match(f.element.innerHTML, /SHA-256: a{64}/);
  assert.match(f.element.innerHTML, /QA &lt;Signer&gt;/);
  assert.doesNotMatch(f.element.innerHTML, /QA <Signer>/);
  assert.match(f.element.innerHTML, /Integrado · protegido/);
});
