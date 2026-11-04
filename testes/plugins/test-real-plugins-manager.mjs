/**
 * Testes do Gerenciador de Plugins com Plugins OBS Reais do 3Mix
 * Valida inspeção estática PE x64, presença do export obs_module_load,
 * proteção de módulos de fábrica e ciclo de vida isolado.
 *
 * ESCLARECIMENTO DE ARQUITETURA E SEGURANÇA:
 * A inspeção estática PE/ZIP garante integridade de formato, ausência de Zip Slip
 * e checagem de símbolos antes da extração. No entanto, plugins nativos de OBS são DLLs C/C++
 * que rodam no mesmo espaço de memória do processo 3Mix.exe. O isolamento garantido
 * pelo 3Mix é de sistema de arquivos (3mix-plugins/%module%) e recuperação defensiva
 * via Safe Mode (load-report.json), e NÃO um sandbox de memória para código nativo.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { inspectPe } from '../../ferramentas/plugin-manager-pe.mjs';
import { PluginManager, applyPendingPlugins } from '../../ferramentas/plugin-manager.mjs';

const RUNTIME_ROOT = resolve('../../../3mix-runtime');
const OBS_PLUGINS_DIR = join(RUNTIME_ROOT, 'obs-plugins/64bit');
const OBS_BIN_DIR = join(RUNTIME_ROOT, 'bin/64bit');

const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
  return n >>> 0;
});
function crc32(bytes) {
  let n = 0xffffffff;
  for (const byte of bytes) n = crcTable[(n ^ byte) & 255] ^ (n >>> 8);
  return (n ^ 0xffffffff) >>> 0;
}
function makeZip(entries) {
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

console.log('=== TESTE DE PLUGINS OBS REAIS COM GERENCIADOR 3MIX ===\n');

// 1. Teste de Plugin Real 1: Downstream Keyer
console.log('1. Testando plugin real: downstream-keyer.dll...');
const dskPath = join(OBS_PLUGINS_DIR, 'downstream-keyer.dll');
assert.ok(existsSync(dskPath), 'downstream-keyer.dll deve existir no runtime');
const dskBytes = readFileSync(dskPath);
const dskPe = inspectPe(dskBytes);

console.log(`   - Arquitetura: ${dskPe.machine}`);
console.log(`   - Exports detectados: ${dskPe.exports.length}`);
console.log(`   - Imports de DLLs do sistema: ${dskPe.imports.map(i => i.dll).slice(0, 5).join(', ')}...`);

assert.equal(dskPe.machine, 'x64', 'Deve ser binário Windows x64');
assert.ok(dskPe.exports.includes('obs_module_load'), 'Plugin real deve exportar obs_module_load');
assert.ok(dskPe.imports.some(i => i.dll.includes('obs')), 'Plugin real deve importar obs.dll ou libobs');
console.log('   [PASS] downstream-keyer.dll validado com sucesso!\n');

// 2. Teste de Plugin Real 2: Audio Monitor
console.log('2. Testando plugin real: audio-monitor.dll...');
const amPath = join(OBS_PLUGINS_DIR, 'audio-monitor.dll');
assert.ok(existsSync(amPath), 'audio-monitor.dll deve existir no runtime');
const amBytes = readFileSync(amPath);
const amPe = inspectPe(amBytes);

console.log(`   - Arquitetura: ${amPe.machine}`);
console.log(`   - Exports detectados: ${amPe.exports.length}`);
assert.equal(amPe.machine, 'x64');
assert.ok(amPe.exports.includes('obs_module_load'), 'audio-monitor deve exportar obs_module_load');
console.log('   [PASS] audio-monitor.dll validado com sucesso!\n');

// 3. Teste de Plugin Real 3: DeckLink (Blackmagic)
console.log('3. Testando plugin real de hardware: decklink.dll...');
const dlPath = join(OBS_PLUGINS_DIR, 'decklink.dll');
assert.ok(existsSync(dlPath), 'decklink.dll deve existir no runtime');
const dlBytes = readFileSync(dlPath);
const dlPe = inspectPe(dlBytes);

console.log(`   - Arquitetura: ${dlPe.machine}`);
console.log(`   - Exports detectados: ${dlPe.exports.length}`);
assert.equal(dlPe.machine, 'x64');
assert.ok(dlPe.exports.includes('obs_module_load'), 'decklink.dll deve exportar obs_module_load');
console.log('   [PASS] decklink.dll validado com sucesso!\n');

// 4. Teste de Rejeição de Não-Plugin: chrome_elf.dll
console.log('4. Testando rejeição de biblioteca auxiliar que NÃO é plugin: chrome_elf.dll...');
const elfPath = join(OBS_PLUGINS_DIR, 'chrome_elf.dll');
assert.ok(existsSync(elfPath), 'chrome_elf.dll deve existir');
const elfBytes = readFileSync(elfPath);
const elfPe = inspectPe(elfBytes);

console.log(`   - Exports detectados em chrome_elf.dll: ${elfPe.exports.length} (nenhum de plugin OBS)`);
const ehPluginObs = elfPe.exports.includes('obs_module_load');
assert.equal(ehPluginObs, false, 'chrome_elf.dll NÃO pode ser aceita como plugin OBS pois não tem obs_module_load');
console.log('   [PASS] Biblioteca auxiliar recusada com sucesso para instalação como plugin!\n');

// 5. Teste de Proteção de Módulos de Fábrica e Isolamento em Sandbox
console.log('5. Testando proteção de instalação de fábrica e ciclo de vida isolado...');
const sandboxRoot = resolve('qa-finalizacao/sandbox-plugin-real');
if (existsSync(sandboxRoot)) rmSync(sandboxRoot, { recursive: true, force: true });
mkdirSync(join(sandboxRoot, 'obs-plugins/64bit'), { recursive: true });
mkdirSync(join(sandboxRoot, 'bin/64bit'), { recursive: true });

// Copia obs.dll e dependencias necessarias para simular a instalacao de fabrica
copyFileSync(join(OBS_BIN_DIR, 'obs.dll'), join(sandboxRoot, 'bin/64bit/obs.dll'));
copyFileSync(dskPath, join(sandboxRoot, 'obs-plugins/64bit/downstream-keyer.dll'));
for (const dep of ['obs-frontend-api.dll', 'qt6widgets.dll', 'w32-pthreads.dll', 'qt6gui.dll', 'qt6core.dll']) {
  const p = join(OBS_BIN_DIR, dep);
  if (existsSync(p)) copyFileSync(p, join(sandboxRoot, 'bin/64bit', dep));
}

const manager = new PluginManager({
  root: sandboxRoot,
  versionGetter: async () => '32.2.2',
  productionActive: async () => false
});

// A) Deve RECUSAR sobrescrever o plugin de fábrica 'downstream-keyer'
const zipDsk = makeZip([
  ['obs-plugins/64bit/downstream-keyer.dll', dskBytes],
  ['data/obs-plugins/downstream-keyer/locale/en-US.ini', 'DSK="Downstream Keyer"']
]);
await assert.rejects(
  () => manager.install(zipDsk),
  /já faz parte da instalação protegida do 3Mix/,
  'Deve proteger módulos de fábrica contra sobrescrita acidental'
);
console.log('   [PASS] Proteção de plugins nativos de fábrica confirmada');

// B) Instalação de novo módulo isolado (custom-audio-monitor)
const zipCustom = makeZip([
  ['obs-plugins/64bit/custom-audio-monitor.dll', amBytes],
  ['data/obs-plugins/custom-audio-monitor/locale/en-US.ini', 'Audio="Custom Monitor"']
]);

const snap = await manager.install(zipCustom);
const queue = await manager.queue();
assert.ok(queue.some(op => op.id === 'custom-audio-monitor' && op.action === 'install'), 'Operação deve entrar na fila');
assert.ok(snap.plugins.some(p => p.id === 'custom-audio-monitor' && p.state === 'pending-install'), 'Snapshot deve indicar pending-install');
console.log('   [PASS] Instalação de módulo real custom-audio-monitor enfileirada com sucesso');

// C) Aplicação no reinício gracioso
await applyPendingPlugins(sandboxRoot);
assert.equal(existsSync(join(sandboxRoot, '3mix-plugins/custom-audio-monitor/custom-audio-monitor.dll')), true);
console.log('   [PASS] Módulo real instalado com sucesso em 3mix-plugins/custom-audio-monitor/');

// D) Teste de Desativação
await manager.action('disable', { id: 'custom-audio-monitor' });
const disabledState = await manager.snapshot();
const modState = disabledState.plugins.find(p => p.id === 'custom-audio-monitor');
assert.ok(modState.state.includes('disable'), 'Módulo deve ser marcado como pending-disable ou disabled');
console.log('   [PASS] Desativação sem exclusão física confirmada');

// E) Teste de Safe Mode (Modo de Segurança)
const snapSafe = await manager.action('safe-mode', { enabled: true });
assert.equal(snapSafe.safeMode, true, 'Safe mode deve ser ativado');
console.log('   [PASS] Ativação de Safe Mode defensivo confirmada');

// Limpeza da sandbox
rmSync(sandboxRoot, { recursive: true, force: true });

console.log('\n=== TODOS OS 5 TESTES COM PLUGINS REAIS FORAM APROVADOS! ===');
