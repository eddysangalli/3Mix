import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { PluginManager, applyPendingPlugins, inspectPluginZip, readPluginMultipart } from '../../ferramentas/plugin-manager.mjs';

const qa = dirname(fileURLToPath(import.meta.url));
const panel = resolve(qa, '../..');
const workspace = [resolve(panel, '..'), resolve(panel, '../..')].find((candidate) => existsSync(join(candidate, '3mix-runtime/obs-plugins/64bit/obs-shaderfilter.dll')));
const runtime = workspace ? join(workspace, '3mix-runtime') : null;
const filter = runtime ? await readFile(join(runtime, 'obs-plugins/64bit/obs-shaderfilter.dll')) : null;
const qaTest = runtime ? test : (name, fn) => test(name, { skip: 'Requer o 3mix-runtime canônico ao lado do checkout ou da worktree.' }, fn);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
  return n >>> 0;
});
function crc32(bytes) {
  let n = 0xffffffff;
  for (const byte of bytes) n = crcTable[(n ^ byte) & 255] ^ (n >>> 8);
  return (n ^ 0xffffffff) >>> 0;
}
function zip(entries) {
  const local = [], central = [];
  let offset = 0;
  for (const [name, raw] of entries) {
    const n = Buffer.from(name), bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    const crc = crc32(bytes);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x800, 6);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(bytes.length, 18);
    head.writeUInt32LE(bytes.length, 22);
    head.writeUInt16LE(n.length, 26);
    local.push(head, n, bytes);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x800, 8);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(bytes.length, 20);
    c.writeUInt32LE(bytes.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, n);
    offset += head.length + n.length + bytes.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
const oldZip = (id, data = 'v1') => zip([
  [`obs-plugins/64bit/${id}.dll`, filter],
  [`data/obs-plugins/${id}/locale/en-US.ini`, data],
]);
const newZip = (id, data = 'v1') => zip([
  [`plugins/${id}/${id}.dll`, filter],
  [`plugins/${id}/data/locale/en-US.ini`, data],
]);
function multipart(parts, boundary = '3MixQaBoundary') {
  const chunks = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"${part.filename ? `; filename="${part.filename}"` : ''}\r\n\r\n`));
    chunks.push(Buffer.isBuffer(part.value) ? part.value : Buffer.from(part.value));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(chunks), request = Readable.from([body]);
  request.headers = { 'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': String(body.length) };
  return request;
}
async function sandbox() {
  const root = join(qa, 'runs', randomUUID());
  assert.ok(root.startsWith(join(qa, 'runs') + '\\'));
  await mkdir(join(root, 'bin/64bit'), { recursive: true });
  await copyFile(join(runtime, 'bin/64bit/obs.dll'), join(root, 'bin/64bit/obs.dll'));
  await mkdir(join(root, 'config/obs-studio/basic/profiles/Operador'), { recursive: true });
  await writeFile(join(root, 'config/obs-studio/basic/profiles/Operador/basic.ini'), 'preservar=sim\n');
  return root;
}
const manager = (root, productionActive = async () => false) => new PluginManager({
  root, versionGetter: async () => '32.2.2', productionActive,
});
const snapshotPlugin = async (m, id) => (await m.snapshot()).plugins.find(p => p.id === id);

qaTest('reconhece ZIP legado e formato OBS 33 sem executar o módulo', () => {
  const legacy = inspectPluginZip(oldZip('qa-filter'));
  const modern = inspectPluginZip(newZip('qa-filter'));
  assert.equal(legacy.id, 'qa-filter');
  assert.equal(modern.id, 'qa-filter');
  assert.equal(legacy.data.get('locale/en-US.ini').toString(), 'v1');
  assert.equal(modern.data.get('locale/en-US.ini').toString(), 'v1');
  assert.equal(modern.bin.get('qa-filter.dll').length, filter.length);
});
qaTest('recusa traversal, DLL x86, CRC adulterado e colisão com módulo protegido', async () => {
  assert.throws(() => inspectPluginZip(zip([['../escape.dll', filter]])), /caminho|zip|não permitido/i);
  const x86 = Buffer.from(filter);
  x86.writeUInt16LE(0x14c, x86.readUInt32LE(0x3c) + 4);
  assert.throws(() => inspectPluginZip(zip([['obs-plugins/64bit/qa-x86.dll', x86]])), /x64/i);
  const tampered = Buffer.from(oldZip('qa-corrupt'));
  tampered[60] ^= 0xff;
  assert.throws(() => inspectPluginZip(tampered), /zip|integridade|checksum|crc/i);
  const root = await sandbox();
  await mkdir(join(root, 'obs-plugins/64bit'), { recursive: true });
  await writeFile(join(root, 'obs-plugins/64bit/qa-core.dll'), filter);
  await assert.rejects(manager(root).install(oldZip('qa-core')), /protegido|parte da instalação/i);
  await mkdir(join(root, 'plugins/QA-Modern'), { recursive: true });
  await writeFile(join(root, 'plugins/QA-Modern/qa-modern.dll'), filter);
  await assert.rejects(manager(root).install(newZip('qa-modern')), /protegido|parte da instalação/i);
});

qaTest('endurece ZIP e multipart contra colisões, scripts e arquivos duplicados', async () => {
  assert.throws(() => inspectPluginZip(zip([
    ['obs-plugins/64bit/qa-duplicate.dll', filter],
    ['OBS-PLUGINS/64BIT/QA-DUPLICATE.DLL', filter],
  ])), /colidem|zip/i);
  assert.throws(() => inspectPluginZip(zip([
    ['obs-plugins/64bit/qa-script.dll', filter],
    ['obs-plugins/64bit/configure.ps1', 'Write-Output unsafe'],
  ])), /executável|script/i);
  assert.throws(() => inspectPluginZip(zip([
    ['obs-plugins/64bit/qa-one.dll', filter],
    ['obs-plugins/64bit/qa-two.dll', filter],
  ])), /exatamente um módulo/i);

  const archive = oldZip('qa-upload'), parsed = await readPluginMultipart(multipart([
    { name: 'id', value: 'qa-upload' },
    { name: 'file', filename: 'qa-upload.zip', value: archive },
  ]));
  assert.equal(parsed.id, 'qa-upload');
  assert.deepEqual(parsed.file, archive);

  await assert.rejects(readPluginMultipart(multipart([
    { name: 'file', filename: 'one.zip', value: archive },
    { name: 'file', filename: 'two.zip', value: archive },
  ])), /somente um arquivo|inválido/i);

  const oversized = Readable.from([]);
  oversized.headers = { 'content-type': 'multipart/form-data; boundary=3MixQaBoundary', 'content-length': String(257 * 1024 * 1024) };
  await assert.rejects(readPluginMultipart(oversized), /excede 256 MB/i);
});

qaTest('instala, aplica no reinício simulado, alterna, atualiza, reverte e remove sem apagar o perfil', async () => {
  const root = await sandbox(), m = manager(root), id = 'qa-lifecycle';
  await m.install(oldZip(id, 'primeiro'));
  assert.equal((await m.queue()).length, 1);
  assert.equal(existsSync(join(root, '3mix-plugins', id, `${id}.dll`)), false);
  assert.equal((await snapshotPlugin(m, id)).state, 'pending-install');
  assert.deepEqual((await applyPendingPlugins(root)).applied.map(x => x.action), ['install']);
  assert.equal((await m.queue()).length, 0);
  assert.equal((await readFile(join(root, '3mix-plugins', id, 'data/locale/en-US.ini'), 'utf8')), 'primeiro');
  assert.equal((await snapshotPlugin(m, id)).backupAvailable, false, 'instalação inicial não deve criar backup vazio');
  const initialHash = sha(await readFile(join(root, '3mix-plugins', id, `${id}.dll`)));
  await m.action('disable', { id });
  assert.equal((await snapshotPlugin(m, id)).state, 'pending-disable');
  await m.action('enable', { id });
  assert.equal((await snapshotPlugin(m, id)).state, 'pending-enable');
  await m.install(newZip(id, 'segundo'), id);
  assert.equal((await snapshotPlugin(m, id)).state, 'pending-update');
  await applyPendingPlugins(root);
  assert.equal((await readFile(join(root, '3mix-plugins', id, 'data/locale/en-US.ini'), 'utf8')), 'segundo');
  assert.equal(sha(await readFile(join(root, '3mix-plugins', id, `${id}.dll`))), initialHash);
  assert.equal((await snapshotPlugin(m, id)).backupAvailable, true);
  await m.action('rollback', { id });
  await applyPendingPlugins(root);
  assert.equal((await readFile(join(root, '3mix-plugins', id, 'data/locale/en-US.ini'), 'utf8')), 'primeiro');
  await m.action('remove', { id });
  await applyPendingPlugins(root);
  assert.equal(existsSync(join(root, '3mix-plugins', id, `${id}.dll`)), false);
  assert.equal(await readFile(join(root, 'config/obs-studio/basic/profiles/Operador/basic.ini'), 'utf8'), 'preservar=sim\n');
});

qaTest('processa duas operações pendentes sem reintroduzir a primeira e bloqueia produção ativa', async () => {
  const root = await sandbox(), m = manager(root);
  await m.install(oldZip('qa-a'));
  await m.install(oldZip('qa-b'));
  assert.equal((await m.queue()).length, 2);
  assert.equal((await applyPendingPlugins(root)).applied.length, 2);
  assert.equal((await m.queue()).length, 0);
  assert.equal(existsSync(join(root, '3mix-plugins/qa-a/qa-a.dll')), true);
  assert.equal(existsSync(join(root, '3mix-plugins/qa-b/qa-b.dll')), true);
  const active = manager(root, async () => true);
  await assert.rejects(active.install(oldZip('qa-c')), /produção|saída ativa/i);
  await assert.rejects(active.action('remove', { id: 'qa-a' }), /produção|saída ativa/i);
  await assert.rejects(active.action('safe-mode', { enabled: true }), /produção|saída ativa/i);
  assert.equal((await m.queue()).length, 0);
});

qaTest('recusa estado e fila corrompidos e protege o processamento com trava de launcher', async () => {
  const corruptState = await sandbox(), stateManager = manager(corruptState);
  await mkdir(join(corruptState, 'config/3mix-plugin-manager'), { recursive: true });
  await writeFile(join(corruptState, 'config/3mix-plugin-manager/state.json'), JSON.stringify({ format: 1, safeMode: 'sim', plugins: {} }));
  await assert.rejects(stateManager.snapshot(), /estado do gerenciador inválido/i);

  const corruptQueue = await sandbox();
  await mkdir(join(corruptQueue, 'config/3mix-plugin-manager'), { recursive: true });
  await writeFile(join(corruptQueue, 'config/3mix-plugin-manager/queue.json'), JSON.stringify([{ id: '../escape', opId: 'qa-op', action: 'remove' }]));
  await assert.rejects(applyPendingPlugins(corruptQueue), /identificador|fila|operação/i);

  const locked = await sandbox();
  const lockDir = join(locked, 'config/3mix-plugin-manager');
  await mkdir(lockDir, { recursive: true });
  await writeFile(join(lockDir, 'apply.lock'), JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
  await assert.rejects(applyPendingPlugins(locked), /outro launcher|fila.*processada/i);

  await writeFile(join(lockDir, 'apply.lock'), JSON.stringify({ pid: 2147483647, at: '2000-01-01T00:00:00.000Z' }));
  assert.deepEqual(await applyPendingPlugins(locked), { applied: [] });
  assert.equal(existsSync(join(lockDir, 'apply.lock')), false);
});

qaTest('conclui rollback interrompido depois da troca física sem repetir a movimentação', async () => {
  const root = await sandbox(), m = manager(root), id = 'qa-crash-rollback';
  await m.install(oldZip(id, 'anterior'));
  await applyPendingPlugins(root);
  await m.install(newZip(id, 'atual'), id);
  await applyPendingPlugins(root);
  await m.action('rollback', { id });
  const [operation] = await m.queue();
  assert.ok(operation.restoreOperationId);

  const current = join(root, '3mix-plugins', id);
  const rollbackBackup = join(root, '3mix-plugins/.backups', id, operation.opId, 'plugin');
  const restoreSource = join(root, '3mix-plugins/.backups', id, operation.backup, 'plugin');
  await mkdir(dirname(rollbackBackup), { recursive: true });
  await rename(current, rollbackBackup);
  await rename(restoreSource, current);

  assert.equal(await readFile(join(current, 'data/locale/en-US.ini'), 'utf8'), 'anterior');
  assert.deepEqual((await applyPendingPlugins(root)).applied, [{ id, action: 'rollback' }]);
  assert.equal((await m.queue()).length, 0);
  assert.equal(await readFile(join(current, 'data/locale/en-US.ini'), 'utf8'), 'anterior');
  assert.equal((await snapshotPlugin(m, id)).backupAvailable, true);
});

qaTest('limita estado e fila e rotaciona o histórico de operações', async () => {
  const root = await sandbox(), m = manager(root), config = join(root, 'config/3mix-plugin-manager');
  await mkdir(config, { recursive: true });

  await writeFile(join(config, 'state.json'), JSON.stringify({ format: 2, safeMode: false, plugins: {} }));
  await assert.rejects(m.state(), /estado do gerenciador inválido/i);

  const oversizedQueue = Array.from({ length: 257 }, (_, index) => ({ id: `qa-${index}`, opId: `op-${index}`, action: 'remove' }));
  await writeFile(join(config, 'queue.json'), JSON.stringify(oversizedQueue));
  await assert.rejects(m.queue(), /excede o limite/i);

  await writeFile(join(config, 'operations.jsonl'), 'x'.repeat(1024 * 1024 + 1));
  await m.log('qa-log-rotation', 'qa-plugin');
  assert.equal(existsSync(join(config, 'operations.jsonl.1')), true);
  assert.match(await readFile(join(config, 'operations.jsonl'), 'utf8'), /qa-log-rotation/);
});

qaTest('isola catálogo e relatório inválidos e distingue motor indisponível', async () => {
  const root = await sandbox(), m = manager(root), config = join(root, 'config/3mix-plugin-manager');
  await mkdir(config, { recursive: true });
  await writeFile(join(config, 'load-report.json'), JSON.stringify({ phase: 'complete', at: new Date().toISOString(), plugins: {} }));
  await writeFile(join(root, 'config/plugin-catalog.json'), JSON.stringify([{ id: 'qa-catalog', obsVersions: ['32.2.2'], sourceUrl: 'http://inseguro.invalid/plugin' }]));
  const broken = await m.snapshot();
  assert.deepEqual(broken.catalog, []);
  assert.equal(broken.diagnostics.some(item => item.code === 'REPORT_INVALID'), true);
  assert.equal(broken.diagnostics.some(item => item.code === 'CATALOG_INVALID'), true);

  const offlineRoot = await sandbox();
  const offline = new PluginManager({ root: offlineRoot, productionActive: async () => false });
  const offlineSnapshot = await offline.snapshot();
  assert.equal(offlineSnapshot.plugins.length, 0);
  assert.equal(offlineSnapshot.diagnostics.some(item => item.code === 'ENGINE_UNAVAILABLE'), true);

  const catalogRoot = await sandbox();
  const currentCatalog = new PluginManager({
    root: catalogRoot,
    catalogPath: join(workspace, '3mix-panel/config/plugin-catalog.json'),
    versionGetter: async () => '32.2.2',
    productionActive: async () => false,
  });
  const catalogSnapshot = await currentCatalog.snapshot();
  assert.equal(catalogSnapshot.catalog.length, 5);
  assert.equal(catalogSnapshot.catalog.every(item => item.installable === false), true);
  assert.equal(catalogSnapshot.diagnostics.some(item => item.code === 'CATALOG_INVALID'), false);
});

qaTest('lista módulo carregado informado somente pelo relatório nativo e o mantém protegido', async () => {
  const root = await sandbox(), m = manager(root), id = 'qa-integrated';
  await mkdir(join(root, 'obs-plugins/64bit'), { recursive: true });
  await writeFile(join(root, 'obs-plugins/64bit', id + '.dll'), filter);
  await mkdir(join(root, 'config/3mix-plugin-manager'), { recursive: true });
  await writeFile(join(root, 'config/3mix-plugin-manager/load-report.json'), JSON.stringify({
    phase: 'complete', at: new Date().toISOString(), libobsVersion: '32.2.2',
    plugins: [{ id, status: 'loaded', name: 'QA Integrated', version: '1.0', author: 'QA', sourceTypes: ['qa_input'], outputs: [], encoders: [], services: [] }],
  }));
  const result = await m.snapshot(), plugin = result.plugins.find(item => item.id === id);
  assert.ok(plugin);
  assert.equal(plugin.state, 'active');
  assert.equal(plugin.compatibility, 'verified');
  assert.equal(plugin.protected, true);
  assert.equal(plugin.managed, false);
  assert.deepEqual(plugin.resources.inputs, ['qa_input']);
});

qaTest('recusa staging adulterado ou ausente antes de afastar a versão ativa', async () => {
  const tamperedRoot = await sandbox(), tamperedManager = manager(tamperedRoot), id = 'qa-stage-tamper';
  await tamperedManager.install(oldZip(id, 'versao-ativa'));
  await applyPendingPlugins(tamperedRoot);
  await tamperedManager.install(newZip(id, 'versao-nova'), id);
  const [tamperedOperation] = await tamperedManager.queue();
  const tamperedStage = join(tamperedRoot, '3mix-plugins/.staging', tamperedOperation.stage);
  await writeFile(join(tamperedStage, 'data/locale/en-US.ini'), 'conteudo-adulterado');
  await assert.rejects(applyPendingPlugins(tamperedRoot), /integridade.*alterada/i);
  assert.equal(await readFile(join(tamperedRoot, '3mix-plugins', id, 'data/locale/en-US.ini'), 'utf8'), 'versao-ativa');
  assert.equal((await tamperedManager.queue()).length, 1);

  const missingRoot = await sandbox(), missingManager = manager(missingRoot), missingId = 'qa-stage-missing';
  await missingManager.install(oldZip(missingId, 'continua-ativa'));
  await applyPendingPlugins(missingRoot);
  await missingManager.install(newZip(missingId, 'nao-aplicar'), missingId);
  const [missingOperation] = await missingManager.queue();
  const missingStage = join(missingRoot, '3mix-plugins/.staging', missingOperation.stage);
  await rename(missingStage, missingStage + '.ausente');
  await assert.rejects(applyPendingPlugins(missingRoot), /staging.*ausente|incompleto/i);
  assert.equal(await readFile(join(missingRoot, '3mix-plugins', missingId, 'data/locale/en-US.ini'), 'utf8'), 'continua-ativa');
  assert.equal((await missingManager.queue()).length, 1);
});

qaTest('recusa backup adulterado antes de substituir a versão ativa no rollback', async () => {
  const root = await sandbox(), m = manager(root), id = 'qa-backup-tamper';
  await m.install(oldZip(id, 'backup-original'));
  await applyPendingPlugins(root);
  await m.install(newZip(id, 'versao-ativa'), id);
  await applyPendingPlugins(root);
  await m.action('rollback', { id });
  const [operation] = await m.queue();
  const backupData = join(root, '3mix-plugins/.backups', id, operation.backup, 'plugin/data/locale/en-US.ini');
  await writeFile(backupData, 'backup-adulterado');
  await assert.rejects(applyPendingPlugins(root), /backup.*inválido/i);
  assert.equal(await readFile(join(root, '3mix-plugins', id, 'data/locale/en-US.ini'), 'utf8'), 'versao-ativa');
  assert.equal((await m.queue()).length, 1);
});
