import { appendFile, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPluginArchiveBuffer, noGtLinks } from './plugin-manager-archive.mjs';
import { inspectPe } from './plugin-manager-pe.mjs';

const run = promisify(execFile);
const ID = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const QUEUED_ACTIONS = new Set(['install', 'update', 'remove', 'rollback']);
const APPLY_LOCK_STALE_MS = 10 * 60 * 1000;
const MAX_UPLOAD = 256 * 1024 * 1024 + 16 * 1024;
const SYSTEM_DLL = /^(?:api-ms-win-[\w-]+|ext-ms-[\w-]+|kernel32|user32|advapi32|gdi32|shell32|ole32|oleaut32|comdlg32|comctl32|ws2_32|winmm|secur32|crypt32|bcrypt|ntdll|shlwapi|version|dwmapi|uxtheme|rpcrt4|setupapi|imm32|iphlpapi|psapi|opengl32|d3d\w*|dxgi|mf\w*|avrt|msvcp\w*|vcruntime\w*|ucrtbase)\.dll$/i;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = async (path, fallback) => { try { return JSON.parse(await readFile(path, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; } };
const exists = async path => !!(await stat(path).catch(e => { if (e.code === 'ENOENT') return null; throw e; }));
const safeId = value => { const id = String(value ?? '').toLowerCase(); if (!ID.test(id) || id === '.' || id === '..') throw Error('Identificador de plugin inválido'); return id; };
const within = (base, child) => { const rel = relative(resolve(base), resolve(child)); if (!rel || rel.startsWith('..' + sep) || rel === '..' || rel.includes(':')) throw Error('Caminho do plugin fora da instalação'); noGtLinks(child); return child; };
const atomicJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); const temp = path + '.' + randomUUID() + '.tmp'; await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); await rename(temp, path); };

function validateQueue(value) {
  if (!Array.isArray(value)) throw Error('Fila de plugins inválida');
  const operationIds = new Set(), pluginIds = new Set();
  return value.map(operation => {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) throw Error('Operação pendente inválida');
    const id = safeId(operation.id), opId = safeId(operation.opId), action = String(operation.action || '');
    if (!QUEUED_ACTIONS.has(action)) throw Error('Ação pendente inválida');
    if (operationIds.has(opId) || pluginIds.has(id)) throw Error('Fila contém operações duplicadas');
    operationIds.add(opId); pluginIds.add(id);
    const normalized = { ...operation, id, opId, action };
    if (action === 'install' || action === 'update') normalized.stage = safeId(operation.stage);
    if (action === 'rollback') {
      normalized.backup = safeId(operation.backup);
      if (operation.restoreOperationId != null) normalized.restoreOperationId = safeId(operation.restoreOperationId);
    }
    return normalized;
  });
}

async function backupCandidate(pluginsRoot, id, name) {
  try { if (safeId(name) !== name) return null; } catch { return null; }
  try {
    const plugin = within(pluginsRoot, join(pluginsRoot, '.backups', id, name, 'plugin'));
    const info = await stat(plugin);
    if (!info.isDirectory() || !await exists(join(plugin, id + '.dll'))) return null;
    const marker = await readJson(join(plugin, '.3mix.json'), null);
    if (!marker || typeof marker !== 'object' || Array.isArray(marker) || safeId(marker.operationId) !== marker.operationId) return null;
    return { name, changedAt: info.mtimeMs, marker };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

async function acquireApplyLock(path) {
  await mkdir(dirname(path), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(path, 'wx');
      const token = randomUUID();
      try { await handle.writeFile(JSON.stringify({ pid: process.pid, token, at: new Date().toISOString() }) + '\n'); }
      catch (error) { await handle.close(); await rm(path, { force: true }); throw error; }
      return async () => {
        await handle.close();
        const owner = await readJson(path, null).catch(() => null);
        if (owner?.token === token) await rm(path, { force: true });
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = await readJson(path, null).catch(() => null);
      const info = await stat(path).catch(() => null);
      const recentUnknownLock = !Number.isSafeInteger(owner?.pid) && info && Date.now() - info.mtimeMs < APPLY_LOCK_STALE_MS;
      if (processIsAlive(owner?.pid) || recentUnknownLock || attempt > 0) throw Error('A fila de plugins já está sendo processada por outro launcher');
      await rm(path, { force: true });
    }
  }
  throw Error('Não foi possível adquirir a trava da fila de plugins');
}

export async function readPluginMultipart(req) {
  const type = String(req.headers['content-type'] || '');
  const match = /^multipart\/form-data;\s*boundary=(?:"([A-Za-z0-9'()+_,.\-/:=?]{1,70})"|([A-Za-z0-9'()+_,.\-/:=?]{1,70}))\s*$/i.exec(type);
  if (!match) throw Error('Envie um ZIP em formulário multipart');
  if (Number(req.headers['content-length'] || 0) > MAX_UPLOAD) throw Error('Arquivo ZIP excede 256 MB');
  const parts = []; let size = 0;
  for await (const part of req) { size += part.length; if (size > MAX_UPLOAD) throw Error('Arquivo ZIP excede 256 MB'); parts.push(part); }
  const bytes = Buffer.concat(parts), boundary = Buffer.from('--' + (match[1] || match[2]));
  if (!bytes.subarray(0, boundary.length).equals(boundary)) throw Error('Formulário multipart inválido');
  let offset = boundary.length, file = null, id = null;
  while (offset < bytes.length) {
    if (bytes.subarray(offset, offset + 2).equals(Buffer.from('--'))) break;
    if (!bytes.subarray(offset, offset + 2).equals(Buffer.from('\r\n'))) throw Error('Separador multipart inválido');
    offset += 2;
    const headersEnd = bytes.indexOf(Buffer.from('\r\n\r\n'), offset);
    if (headersEnd < 0 || headersEnd - offset > 4096) throw Error('Cabeçalhos multipart inválidos');
    const headers = bytes.toString('latin1', offset, headersEnd), disposition = /^content-disposition:\s*form-data;\s*name="(file|id)"(?:;\s*filename="([^"]{1,255})")?\s*$/im.exec(headers);
    if (!disposition) throw Error('Campo multipart não permitido');
    offset = headersEnd + 4;
    const next = bytes.indexOf(Buffer.concat([Buffer.from('\r\n'), boundary]), offset);
    if (next < 0) throw Error('Fim do formulário multipart ausente');
    const value = bytes.subarray(offset, next);
    if (disposition[1] === 'file') {
      if (file || !disposition[2] || extname(disposition[2]).toLowerCase() !== '.zip') throw Error('Selecione somente um arquivo .zip');
      file = value;
    } else {
      if (id || value.length > 80) throw Error('Identificador de atualização inválido');
      id = value.toString('utf8');
    }
    offset = next + 2 + boundary.length;
  }
  if (!file || !file.length) throw Error('Arquivo ZIP ausente');
  return { file, id };
}

function dataPath(name, id) {
  const parts = name.replaceAll('\\', '/').split('/'), lower = parts.map(s => s.toLowerCase());
  for (let i = 0; i < lower.length - 1; i++) {
    if (lower[i] === 'data' && lower[i + 1] === 'obs-plugins' && lower[i + 2] === id) return parts.slice(i + 3).join('/');
    if (lower[i] === 'data' && lower[i + 1] === id) return parts.slice(i + 2).join('/');
  }
  const module = lower.findIndex((part, i) => part === id && ['obs-plugins', 'plugins'].includes(lower[i - 1]));
  if (module >= 0 && lower[module + 1] === 'data') return parts.slice(module + 2).join('/');
  return null;
}

export function inspectPluginZip(bytes, targetId) {
  const archive = readPluginArchiveBuffer(bytes), dlls = [];
  for (const [name, content] of archive.entries) {
    if (/(^|\/)(?:32bit|x86|win32)(\/|$)/i.test(name)) continue;
    if (extname(name).toLowerCase() !== '.dll') continue;
    const info = inspectPe(content);
    dlls.push({ name, content, info });
  }
  const modules = dlls.filter(d => d.info.exports.includes('obs_module_load'));
  if (modules.length !== 1) throw Error('O ZIP precisa conter exatamente um módulo OBS Windows x64');
  const primary = modules[0], id = safeId(basename(primary.name, extname(primary.name)));
  if (targetId && id !== safeId(targetId)) throw Error('O ZIP não corresponde ao plugin selecionado para atualizar');
  const parent = dirname(primary.name).replaceAll('\\', '/');
  const bin = new Map(), data = new Map();
  for (const [name, content] of archive.entries) {
    const normalized = name.replaceAll('\\', '/');
    const relativeToModule = normalized.startsWith(parent + '/') ? normalized.slice(parent.length + 1) : null;
    const ownFile = relativeToModule && (dirname(normalized) === parent || relativeToModule.toLowerCase().startsWith(id + '/'));
    if (ownFile && normalized !== primary.name && !/(^|\/)(?:32bit|x86|win32)(\/|$)/i.test(normalized)) {
      const ext = extname(normalized).toLowerCase();
      if (['.exe', '.msi', '.bat', '.cmd', '.ps1', '.vbs', '.js'].includes(ext)) throw Error('Pacote contém executável ou script de terceiro: ' + normalized);
      if (ext === '.dll') inspectPe(content);
      bin.set(relativeToModule, content);
    }
    const rel = dataPath(normalized, id);
    if (rel) data.set(rel, content);
  }
  bin.set(id + '.dll', primary.content);
  const provided = new Set([...bin.keys()].map(n => basename(n).toLowerCase()));
  const missing = [], obsImports = [];
  for (const item of dlls.filter(d => dirname(d.name.replaceAll('\\', '/')) === parent)) {
    for (const imp of item.info.imports) {
      if (imp.dll === 'obs.dll') obsImports.push(...imp.symbols);
      else if (!provided.has(imp.dll) && !SYSTEM_DLL.test(imp.dll)) missing.push(imp.dll);
    }
  }
  if (!primary.info.imports.some(i => i.dll === 'obs.dll')) throw Error('Módulo não importa a libobs instalada');
  return { id, archiveHash: archive.sha256, bin, data, dependencies: [...new Set(missing)], obsImports: [...new Set(obsImports)], metadata: { name: id, version: null, developer: null, description: null, license: null, source: 'arquivo local', signature: null, dependencies: [...new Set(missing)] } };
}

async function signatureOf(path) {
  if (process.platform !== 'win32') return { status: 'NotChecked', signer: null };
  const script = fileURLToPath(new URL('./plugin-manager-signature.ps1', import.meta.url));
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, path], { windowsHide: true, timeout: 15000, maxBuffer: 8192 });
  return JSON.parse(stdout.trim());
}

export class PluginManager {
  constructor({ root, catalogPath, versionGetter = async () => null, productionActive = async () => false }) {
    this.root = resolve(root);
    this.dir = join(this.root, 'config/3mix-plugin-manager');
    this.plugins = join(this.root, '3mix-plugins');
    this.statePath = join(this.dir, 'state.json');
    this.queuePath = join(this.dir, 'queue.json');
    this.reportPath = join(this.dir, 'load-report.json');
    this.logPath = join(this.dir, 'operations.jsonl');
    this.catalogPath = catalogPath || join(this.root, 'config/plugin-catalog.json');
    this.versionGetter = versionGetter;
    this.productionActive = productionActive;
    this.lock = Promise.resolve();
  }
  exclusive(fn) { const task = this.lock.then(fn); this.lock = task.catch(() => {}); return task; }
  async state() {
    const state = await readJson(this.statePath, { format: 1, safeMode: false, plugins: {}, lastChangedPlugin: null });
    if (!state || typeof state !== 'object' || Array.isArray(state) || !state.plugins || typeof state.plugins !== 'object' || Array.isArray(state.plugins) || typeof state.safeMode !== 'boolean') throw Error('Estado do gerenciador inválido');
    for (const [id, plugin] of Object.entries(state.plugins)) if (safeId(id) !== id || !plugin || typeof plugin !== 'object' || Array.isArray(plugin)) throw Error('Estado do gerenciador contém plugin inválido');
    return state;
  }
  async queue() { return validateQueue(await readJson(this.queuePath, [])); }
  async log(action, id, detail = {}) { await mkdir(this.dir, { recursive: true }); await appendFile(this.logPath, JSON.stringify({ at: new Date().toISOString(), action, id, ...detail }) + '\n'); }
  async protectedIds() {
    const ids = new Set();
    const legacyPath = join(this.root, 'obs-plugins/64bit');
    const legacyFiles = await readdir(legacyPath).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
    for (const file of legacyFiles) if (extname(file).toLowerCase() === '.dll') ids.add(basename(file, extname(file)).toLowerCase());
    const modernPath = join(this.root, 'plugins');
    const modernEntries = await readdir(modernPath, { withFileTypes: true }).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
    for (const entry of modernEntries) {
      const id = entry.name.toLowerCase();
      if (!entry.isDirectory() || !ID.test(id)) continue;
      if (await exists(within(this.root, join(modernPath, entry.name, id + '.dll')))) ids.add(id);
    }
    return ids;
  }
  async assertIdle() { if (await this.productionActive()) throw Error('Há produção ou saída ativa. Aguarde o encerramento antes de preparar plugins.'); }
  async inspectCompatibility(zip) {
    const version = await this.versionGetter();
    if (!version) throw Error('Versão efetiva da libobs indisponível. Conecte o motor para conferir a compatibilidade.');
    const obsPath = join(this.root, 'bin/64bit/obs.dll');
    const exports = new Set(inspectPe(await readFile(obsPath)).exports);
    const absent = zip.obsImports.filter(name => !name.startsWith('#') && !exports.has(name));
    if (absent.length) throw Error('A libobs instalada não exporta recursos exigidos: ' + absent.slice(0, 8).join(', '));
    const dependencies = [];
    for (const name of zip.dependencies) {
      if (await exists(join(this.root, 'bin/64bit', name))) continue;
      dependencies.push(name);
    }
    if (dependencies.length) throw Error('Dependências ausentes: ' + dependencies.join(', '));
    return { obsVersion: version, staticCheck: 'passed', nativeLoad: 'pending' };
  }
  async install(bytes, targetId = null) { return this.exclusive(async () => {
    await this.assertIdle();
    const zip = inspectPluginZip(bytes, targetId);
    if ((await this.protectedIds()).has(zip.id)) throw Error('Este módulo já faz parte da instalação protegida do 3Mix');
    const queue = await this.queue();
    if (queue.some(op => op.id === zip.id)) throw Error('Já existe uma operação pendente para este plugin');
    const compat = await this.inspectCompatibility(zip);
    const state = await this.state(), id = zip.id, opId = randomUUID();
    const installed = await exists(join(this.plugins, id));
    if (targetId && !installed) throw Error('O plugin selecionado não está instalado no diretório gerenciado');
    const stage = within(this.plugins, join(this.plugins, '.staging', opId));
    await mkdir(join(stage, 'bin'), { recursive: true }); await mkdir(join(stage, 'data'), { recursive: true });
    try {
      for (const [name, content] of zip.bin) { const target = within(join(stage, 'bin'), join(stage, 'bin', ...name.split('/'))); await mkdir(dirname(target), { recursive: true }); await writeFile(target, content, { flag: 'wx' }); }
      for (const [name, content] of zip.data) { const target = within(join(stage, 'data'), join(stage, 'data', ...name.split('/'))); await mkdir(dirname(target), { recursive: true }); await writeFile(target, content, { flag: 'wx' }); }
      const signature = await signatureOf(join(stage, 'bin', id + '.dll'));
      if (!['Valid', 'NotSigned', 'NotChecked'].includes(signature.status)) throw Error('Assinatura digital inválida: ' + signature.status);
      const metadata = { ...zip.metadata, signature, sha256: zip.archiveHash, compatibility: compat, installedAt: new Date().toISOString(), operationId: opId };
      await atomicJson(join(stage, 'bin', '.3mix.json'), metadata);
      queue.push({ id, opId, action: installed ? 'update' : 'install', stage: opId, at: new Date().toISOString() });
      await atomicJson(this.queuePath, queue);
      state.plugins[id] = { ...(state.plugins[id] || {}), enabled: true, metadata };
      state.lastChangedPlugin = { id, action: installed ? 'update' : 'install', at: new Date().toISOString(), opId };
      await atomicJson(this.statePath, state);
      await this.log(installed ? 'update-queued' : 'install-queued', id, { opId, sha256: zip.archiveHash, signature: signature.status });
      return this.snapshot();
    } catch (error) { await rm(stage, { recursive: true, force: true }); throw error; }
  }); }
  async action(action, args = {}) { return this.exclusive(async () => {
    const state = await this.state(), queue = await this.queue();
    if (action === 'diagnose') return this.snapshot();
    if (action === 'safe-mode') {
      await this.assertIdle();
      if (typeof args.enabled !== 'boolean') throw Error('Informe enabled verdadeiro ou falso');
      state.safeMode = args.enabled;
      state.lastChangedPlugin = { id: null, action: args.enabled ? 'safe-mode-on' : 'safe-mode-off', at: new Date().toISOString() };
      await atomicJson(this.statePath, state); await this.log(state.lastChangedPlugin.action, null);
      return this.snapshot();
    }
    if (action === 'install-catalog') throw Error('Nenhum pacote do catálogo está aprovado para download automático nesta instalação');
    if (!['enable', 'disable', 'remove', 'rollback'].includes(action)) throw Error('Ação de plugin inválida');
    await this.assertIdle();
    const id = safeId(args.id);
    if ((await this.protectedIds()).has(id)) throw Error('Plugin integrado ao 3Mix é protegido');
    if (queue.some(op => op.id === id)) throw Error('Já existe uma operação pendente para este plugin');
    const installed = await exists(join(this.plugins, id));
    if (['enable', 'disable', 'remove'].includes(action) && !installed) throw Error('Plugin gerenciado não instalado');
    if (action === 'rollback') {
      const backupRoot = join(this.plugins, '.backups', id);
      const backups = await readdir(backupRoot, { withFileTypes: true }).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
      const candidates = (await Promise.all(backups.filter(e => e.isDirectory()).map(entry => backupCandidate(this.plugins, id, entry.name)))).filter(Boolean).sort((a, b) => a.changedAt - b.changedAt);
      const latest = candidates.at(-1)?.name;
      if (!latest) throw Error('Nenhuma versão anterior disponível para restauração');
      queue.push({ id, opId: randomUUID(), action, backup: latest, restoreOperationId: candidates.at(-1).marker.operationId, at: new Date().toISOString() });
    } else if (action === 'remove') queue.push({ id, opId: randomUUID(), action, at: new Date().toISOString() });
    else state.plugins[id] = { ...(state.plugins[id] || {}), enabled: action === 'enable', pendingAction: { action, at: new Date().toISOString() } };
    state.lastChangedPlugin = { id, action, at: new Date().toISOString(), opId: queue.at(-1)?.id === id ? queue.at(-1).opId : undefined };
    await atomicJson(this.queuePath, queue); await atomicJson(this.statePath, state);
    await this.log(action + '-queued', id);
    return this.snapshot();
  }); }
  async snapshot() {
    const state = await this.state(), queue = await this.queue();
    const report = await readJson(this.reportPath, null).catch(() => null);
    const version = await this.versionGetter().catch(() => null);
    const managedDir = this.plugins;
    const folders = (await readdir(managedDir, { withFileTypes: true }).catch(e => { if (e.code === 'ENOENT') return []; throw e; })).filter(e => e.isDirectory() && ID.test(e.name)).map(e => e.name.toLowerCase());
    const all = new Set([...folders, ...Object.keys(state.plugins), ...queue.map(op => op.id)]);
    const protectedIds = await this.protectedIds();
    const plugins = [];
    for (const id of all) {
      if (!ID.test(id) || protectedIds.has(id)) continue;
      const pending = queue.find(op => op.id === id), item = state.plugins[id] || {};
      const metadata = await readJson(join(managedDir, id, '.3mix.json'), item.metadata || {}).catch(() => item.metadata || {});
      const backupRoot = join(this.plugins, '.backups', id);
      const backups = await readdir(backupRoot).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
      const backupAvailable = (await Promise.all(backups.filter(name => !name.startsWith('.')).map(name => backupCandidate(this.plugins, id, name)))).some(Boolean);
      const loaded = Array.isArray(report?.plugins) ? report.plugins.find(m => String(m.id || '').toLowerCase() === id) : null;
      const reportFresh = report?.phase === 'complete' && Date.parse(report.at || 0) >= Date.parse(item.appliedAt || item.pendingAction?.at || 0);
      const pendingAction = item.pendingAction && !reportFresh ? item.pendingAction.action : null;
      const stateName = pending ? 'pending-' + pending.action : pendingAction ? 'pending-' + pendingAction : !folders.includes(id) ? 'removed' : reportFresh && loaded?.status === 'loaded' ? 'active' : reportFresh && loaded?.status === 'failed' ? 'failed' : item.enabled === false && reportFresh ? 'disabled' : 'unknown';
      const resources = loaded ? { inputs: loaded.sourceTypes || [], outputs: loaded.outputs || [], encoders: loaded.encoders || [], services: loaded.services || [] } : {};
      plugins.push({ id, name: loaded?.name || metadata.name || id, version: loaded?.version || metadata.version || 'Não informada', developer: loaded?.author || metadata.developer || 'Não informado', description: loaded?.description || metadata.description || '', state: stateName, compatibility: reportFresh && loaded?.status === 'loaded' ? 'verified' : metadata.compatibility?.staticCheck === 'passed' ? 'pending-test' : 'unknown', essential: false, managed: true, resources, dependencies: metadata.dependencies || [], license: metadata.license || 'Não informada', options: [], backupAvailable, updateAvailable: true, signature: metadata.signature || null, sha256: metadata.sha256 || null });
    }
    const catalog = (await readJson(this.catalogPath, []).catch(() => [])).map(c => ({ ...c, installable: c.installable === true && !!c.packageUrl && /^[a-f0-9]{64}$/i.test(c.sha256 || '') && Array.isArray(c.obsVersions) && c.obsVersions.includes(version) && !protectedIds.has(c.id) }));
    const diagnostics = [];
    if (report?.phase === 'loading') diagnostics.push({ severity: 'warning', code: 'LOAD_INCOMPLETE', pluginId: state.lastChangedPlugin?.id || null, message: 'A última inicialização não concluiu o relatório de plugins. Confira o motor e use o modo de segurança se necessário.' });
    for (const m of report?.plugins || []) if (m.status === 'failed' || m.status === 'missing') diagnostics.push({ severity: 'error', code: m.status === 'missing' ? 'MODULE_MISSING' : 'LOAD_FAILED', pluginId: m.id, message: 'O módulo ' + m.id + ' não carregou: ' + m.status });
    if (state.safeMode) diagnostics.push({ severity: 'info', code: 'SAFE_MODE', pluginId: null, message: 'Modo de segurança preparado: plugins de terceiros serão ignorados na próxima inicialização.' });
    const lines = (await readFile(this.logPath, 'utf8').catch(() => '')).trim().split(/\r?\n/).filter(Boolean).slice(-30);
    const operations = lines.flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }).reverse();
    return { success: true, engine: { version: version || report?.libobsVersion || null, path: join(this.root, 'bin/64bit/obs.dll'), reportPhase: report?.phase || null }, plugins, catalog, diagnostics, operations, lastChanged: state.lastChangedPlugin, safeMode: state.safeMode === true, productionActive: await this.productionActive() };
  }
}

export async function applyPendingPlugins(root) {
  root = resolve(root);
  const release = await acquireApplyLock(join(root, 'config/3mix-plugin-manager/apply.lock'));
  try {
    const manager = new PluginManager({ root });
    const queue = await manager.queue();
    if (!queue.length) return { applied: [] };
    let remaining = [...queue];
    const state = await manager.state(), applied = [];
    for (const op of queue) {
      const id = safeId(op.id);
      if ((await manager.protectedIds()).has(id)) throw Error('Operação pendente aponta para plugin protegido: ' + id);
      const bin = within(manager.plugins, join(manager.plugins, id));
      const data = join(bin, 'data');
      const backup = within(manager.plugins, join(manager.plugins, '.backups', id, op.opId));
      await mkdir(dirname(bin), { recursive: true });
      if (op.action === 'install' || op.action === 'update') {
        const stage = within(manager.plugins, join(manager.plugins, '.staging', op.stage));
        const stageBin = join(stage, 'bin'), stageData = join(stage, 'data');
        if (await exists(bin)) {
          const marker = await readJson(join(bin, '.3mix.json'), null).catch(() => null);
          if (marker?.operationId !== op.opId) { await mkdir(backup, { recursive: true }); await rename(bin, join(backup, 'plugin')); }
        }
        if (await exists(stageBin)) await rename(stageBin, bin);
        if (await exists(stageData) && !await exists(data)) await rename(stageData, data);
        const marker = await readJson(join(bin, '.3mix.json'), null);
        if (marker?.operationId !== op.opId) throw Error('Aplicação incompleta do plugin ' + id);
        await rm(stage, { recursive: true, force: true });
        state.plugins[id] = { ...(state.plugins[id] || {}), enabled: true, metadata: marker };
      } else if (op.action === 'remove') {
        await mkdir(backup, { recursive: true });
        if (await exists(bin)) await rename(bin, join(backup, 'plugin'));
        state.plugins[id] = { ...(state.plugins[id] || {}), enabled: false };
      } else if (op.action === 'rollback') {
        const old = within(manager.plugins, join(manager.plugins, '.backups', id, op.backup));
        const oldPlugin = join(old, 'plugin');
        if (await exists(oldPlugin)) {
          const restoreMarker = await readJson(join(oldPlugin, '.3mix.json'), null);
          if (!restoreMarker || (op.restoreOperationId && restoreMarker.operationId !== op.restoreOperationId)) throw Error('Backup de plugin inválido: ' + id);
          await mkdir(backup, { recursive: true });
          if (await exists(bin)) await rename(bin, join(backup, 'plugin'));
          await rename(oldPlugin, bin);
        } else {
          const currentMarker = await readJson(join(bin, '.3mix.json'), null).catch(() => null);
          if (!op.restoreOperationId || currentMarker?.operationId !== op.restoreOperationId) throw Error('Backup de plugin não encontrado: ' + id);
        }
        state.plugins[id] = { ...(state.plugins[id] || {}), enabled: true, metadata: await readJson(join(bin, '.3mix.json'), {}) };
      }
      state.plugins[id].appliedAt = new Date().toISOString();
      await atomicJson(manager.statePath, state);
      remaining = remaining.filter(item => item.opId !== op.opId);
      await atomicJson(manager.queuePath, remaining);
      await manager.log(op.action + '-applied', id, { opId: op.opId });
      applied.push({ id, action: op.action });
    }
    return { applied };
  } finally {
    await release();
  }
}
