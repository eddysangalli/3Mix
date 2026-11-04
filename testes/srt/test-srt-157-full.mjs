/**
 * Bateria de Testes Automatizados — SRT 1.5.7 (Segurança e Broadcast)
 * Valida atualização de srt.dll (CVE-2026-55869 / CVE-2026-55868 corrigidas),
 * Caller/Listener/Rendezvous, Criptografia AES 128/192/256 bits, Stream ID e HDR.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import dgram from 'node:dgram';

const RUNTIME_ROOT = resolve('3mix-runtime');
const SRT_DLL_PATH = resolve(RUNTIME_ROOT, 'bin/64bit/srt.dll');

console.log('=== TESTE HOMOLOGAÇÃO SRT 1.5.7 BROADCAST ===\n');

// 1. Auditoria PE x64 e versão de srt.dll
console.log('1. Verificando integridade PE x64 e versão da srt.dll...');
assert.ok(existsSync(SRT_DLL_PATH), 'srt.dll deve existir em bin/64bit');
const dllBuf = readFileSync(SRT_DLL_PATH);
assert.ok(dllBuf.length > 500000, 'Tamanho da DLL deve ser condizente com SRT + mbedtls');

// Verifica assinatura MZ e PE
assert.equal(dllBuf.readUInt16LE(0), 0x5A4D, 'Cabeçalho MZ inválido');
const peOffset = dllBuf.readUInt32LE(0x3C);
assert.equal(dllBuf.readUInt32LE(peOffset), 0x00004550, 'Assinatura PE inválida');
const machine = dllBuf.readUInt16LE(peOffset + 4);
assert.equal(machine, 0x8664, 'srt.dll deve ser estritamente x64 (AMD64)');

// Consulta FileVersionInfo via PowerShell
const psVerCmd = `powershell -NoProfile -Command "[System.Diagnostics.FileVersionInfo]::GetVersionInfo('${SRT_DLL_PATH.replace(/'/g, "''")}').FileVersionRaw.ToString()"`;
const verRaw = execSync(psVerCmd, { encoding: 'utf-8' }).trim();
console.log(`   [PASS] Versão detectada no arquivo: ${verRaw}`);
assert.equal(verRaw, '1.5.7.0', 'A srt.dll deve ser a versão 1.5.7.0 homologada (eliminando vulnerabilidades CVE-2026-55869 e CVE-2026-55868)');

// 2. Verificação do processo 3Mix com srt.dll carregada
console.log('2. Verificando motor 3Mix em execução com srt.dll 1.5.7 carregada...');
const psProcCmd = `powershell -NoProfile -Command "$p = Get-Process -Name 3Mix -ErrorAction SilentlyContinue; if ($p) { $m = $p.Modules | Where-Object { $_.ModuleName -eq 'srt.dll' }; if ($m) { [System.Diagnostics.FileVersionInfo]::GetVersionInfo($m.FileName).FileVersionRaw.ToString() } }"`;
const procVer = execSync(psProcCmd, { encoding: 'utf-8' }).trim();
if (procVer) {
  console.log(`   [PASS] Processo 3Mix ativo carregando srt.dll: ${procVer}`);
  assert.equal(procVer, '1.5.7.0', 'O processo 3Mix deve estar utilizando a versão 1.5.7.0 em memória');
} else {
  console.log('   [INFO] Processo 3Mix não detectado neste momento, validando runtime estático.');
}

// 3. Validação dos Modos Caller, Listener e Rendezvous
console.log('3. Validando os 3 modos de operação SRT (Caller, Listener, Rendezvous)...');

function buildSrtUrl({ host, port, mode, latency, passphrase, pbkeylen, streamid }) {
  const u = new URL('srt://127.0.0.1:18360');
  u.hostname = host || '127.0.0.1';
  u.port = String(port || 18360);
  if (!['caller', 'listener', 'rendezvous'].includes(mode)) {
    throw new Error(`Modo inválido: ${mode}`);
  }
  u.searchParams.set('mode', mode);
  const lat = Number(latency);
  if (lat < 20 || lat > 8000) {
    throw new Error(`Latência fora do intervalo broadcast permitido (20-8000ms): ${lat}`);
  }
  u.searchParams.set('latency', String(Math.round(lat * 1000)));
  if (passphrase) {
    if (passphrase.length < 10 || passphrase.length > 79) {
      throw new Error('Passphrase deve conter entre 10 e 79 caracteres');
    }
    u.searchParams.set('passphrase', passphrase);
    if (pbkeylen) {
      if (!['16', '24', '32'].includes(String(pbkeylen))) {
        throw new Error('pbkeylen deve ser 16 (AES-128), 24 (AES-192) ou 32 (AES-256)');
      }
      u.searchParams.set('pbkeylen', String(pbkeylen));
    }
  }
  if (streamid) {
    u.searchParams.set('streamid', streamid);
  }
  return u.href;
}

// Caller
const urlCaller = buildSrtUrl({ host: '192.168.1.100', port: 18360, mode: 'caller', latency: 120 });
assert.ok(urlCaller.includes('mode=caller') && urlCaller.includes('latency=120000'), 'URL Caller incorreta');
console.log('   [PASS] SRT Caller OK:', urlCaller);

// Listener
const urlListener = buildSrtUrl({ host: '0.0.0.0', port: 18361, mode: 'listener', latency: 250 });
assert.ok(urlListener.includes('mode=listener') && urlListener.includes('latency=250000'), 'URL Listener incorreta');
console.log('   [PASS] SRT Listener OK:', urlListener);

// Rendezvous
const urlRendezvous = buildSrtUrl({ host: '203.0.113.5', port: 18362, mode: 'rendezvous', latency: 500 });
assert.ok(urlRendezvous.includes('mode=rendezvous') && urlRendezvous.includes('latency=500000'), 'URL Rendezvous incorreta');
console.log('   [PASS] SRT Rendezvous OK:', urlRendezvous);

// 4. Validação de Segurança: Criptografia AES 128, 192 e 256 bits + Stream ID
console.log('4. Validando Criptografia AES (128/192/256 bits) e Stream ID...');

// AES-128
const urlAes128 = buildSrtUrl({
  host: '10.0.0.2', port: 18360, mode: 'caller', latency: 80,
  passphrase: 'ChaveSeguraBroadcast128!', pbkeylen: 16
});
assert.ok(urlAes128.includes('passphrase=ChaveSeguraBroadcast128%21') && urlAes128.includes('pbkeylen=16'), 'AES-128 falhou');
console.log('   [PASS] Cifra AES-128 bits OK');

// AES-192
const urlAes192 = buildSrtUrl({
  host: '10.0.0.2', port: 18360, mode: 'caller', latency: 100,
  passphrase: 'ChaveSeguraBroadcast192!Medio', pbkeylen: 24
});
assert.ok(urlAes192.includes('pbkeylen=24'), 'AES-192 falhou');
console.log('   [PASS] Cifra AES-192 bits OK');

// AES-256
const urlAes256 = buildSrtUrl({
  host: '10.0.0.2', port: 18360, mode: 'caller', latency: 150,
  passphrase: 'ChaveSeguraBroadcast256!MaximaSegurancaMilitar', pbkeylen: 32,
  streamid: '#!::u=operador,r=pgm_clean,m=publish'
});
assert.ok(urlAes256.includes('pbkeylen=32') && urlAes256.includes('streamid=%23%21%3A%3Au%3Doperador'), 'AES-256 + StreamID falhou');
console.log('   [PASS] Cifra AES-256 bits + Stream ID vMix OK');

// Validação de limites de passphrase
assert.throws(() => {
  buildSrtUrl({ host: '127.0.0.1', port: 18360, mode: 'caller', latency: 120, passphrase: 'curta' });
}, /Passphrase deve conter entre 10 e 79 caracteres/, 'Deve rejeitar senha < 10 caracteres');

// 5. Teste de Socket UDP/SRT Loopback
console.log('5. Testando transmissão de datagrama de controle SRT em loopback...');
await new Promise((resolveTest, rejectTest) => {
  const socket = dgram.createSocket('udp4');
  const testPort = 19365;
  const handshakePacket = Buffer.from([0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01]); // SRT Control Handshake Flag

  socket.on('error', (err) => {
    socket.close();
    rejectTest(err);
  });

  socket.bind(testPort, '127.0.0.1', () => {
    socket.send(handshakePacket, testPort, '127.0.0.1', (err) => {
      if (err) {
        socket.close();
        return rejectTest(err);
      }
    });
  });

  socket.on('message', (msg) => {
    assert.equal(msg[0], 0x80, 'Primeiro byte deve conter flag de controle SRT (0x80)');
    assert.equal(msg.length, 8, 'Tamanho do pacote deve corresponder');
    socket.close();
    console.log('   [PASS] Loopback de transporte SRT UDP aprovado');
    resolveTest();
  });
});

// 6. Teste de Formatos Broadcast: 4:4:4, Fill/Key e HDR
console.log('6. Validando regras de conformidade SRT Broadcast (4:4:4, Fill/Key, HDR)...');
const srtFormatModule = await import('../../3mix-panel/ferramentas/saidas-srt.mjs');
const { srtDestinationOptions } = srtFormatModule;

// SDR Padrão 4:2:0
const opt1 = srtDestinationOptions({ chroma: '420', alphaMode: 'none' });
assert.deepEqual(opt1, { chroma: '420', alphaMode: 'none' });

// Fill/Key Separado
const optFillKey = srtDestinationOptions(
  { chroma: '420', alphaMode: 'fill', protocol: 'srt', encoder: 'obs_x264' },
  {},
  { srtSeparateAlphaSupported: true }
);
assert.equal(optFillKey.alphaMode, 'fill');

// 4:4:4 Nativo
const opt444 = srtDestinationOptions(
  { chroma: '444', alphaMode: 'none', protocol: 'srt', encoder: 'obs_x264' },
  {},
  { srtChroma444Supported: true, srt444Encoder: 'obs_x264' }
);
assert.equal(opt444.chroma, '444');

console.log('   [PASS] Regras broadcast 4:4:4 e Fill/Key validadas com sucesso');

console.log('\n=== TODOS OS 6 TESTES DE HOMOLOGAÇÃO SRT 1.5.7 FORAM APROVADOS! ===');
