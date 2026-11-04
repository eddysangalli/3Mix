// Teste real e isolado do AudioTapRegistry (classe REAL, import direto) contra um
// production mock que registra cada chamada vendor() -- confirma uniao de consumidores,
// demultiplexacao por consumidor, e que nao reconfigura o motor sem necessidade real.
import { AudioTapRegistry } from '../../ferramentas/audio-tap-registry.mjs';

const resultados = [];
function check(nome, cond, detalhe) { resultados.push(cond); console.log((cond ? 'PASS' : 'FAIL') + ' - ' + nome + (detalhe ? ' :: ' + detalhe : '')); }

let chamadasVendor = [];
let proximoBatch = { packets: [] };
const productionFake = {
  async vendor(name, data) { chamadasVendor.push({ name, data }); if (data.action === 'drain') return proximoBatch; return {}; },
  async optional(type, data) { chamadasVendor.push({ name: 'optional:' + type, data }); return {}; },
};

const registry = new AudioTapRegistry(productionFake);

// 1. "calls" reivindica 2 fontes -> motor configurado só com essas 2.
await registry.claim('calls', ['uuid-A', 'uuid-B']);
const configureCalls1 = chamadasVendor.filter(c => c.data?.action === 'configure');
check('1a reivindicacao: motor configurado com exatamente as 2 fontes de "calls"', configureCalls1.length === 1 && configureCalls1[0].data.sources.map(s => s.uuid).sort().join(',') === 'uuid-A,uuid-B');

// 2. "crew" reivindica uma fonte NOVA (uuid-C) -- motor deve ser reconfigurado com a UNIAO
//    (A, B, C), nunca substituindo as de "calls".
chamadasVendor = [];
await registry.claim('crew', ['uuid-C']);
const configureUniao = chamadasVendor.filter(c => c.data?.action === 'configure');
check('2a reivindicacao (consumidor diferente): motor reconfigurado com a UNIAO das fontes (A,B,C), nao so C', configureUniao.length === 1 && configureUniao[0].data.sources.map(s => s.uuid).sort().join(',') === 'uuid-A,uuid-B,uuid-C');

// 3. "calls" reivindica EXATAMENTE as mesmas 2 fontes de novo -- NAO deve reconfigurar o
//    motor (evita perder ~3s de buffer sem necessidade real).
chamadasVendor = [];
await registry.claim('calls', ['uuid-A', 'uuid-B']);
check('Reivindicacao idêntica (mesmo consumidor, mesmas fontes): NAO reconfigura o motor', chamadasVendor.filter(c => c.data?.action === 'configure').length === 0);

// 4. Demultiplexacao: um batch com pacotes de A, B e C deve emitir "packets" 2 vezes --
//    "calls" recebe so A+B, "crew" recebe so C. NUNCA um consumidor ve o pacote do outro.
proximoBatch = { packets: [{ uuid: 'uuid-A', frames: 10 }, { uuid: 'uuid-B', frames: 10 }, { uuid: 'uuid-C', frames: 10 }] };
const recebidoPor = {};
registry.on('packets', (nome, pacotes) => { recebidoPor[nome] = pacotes.map(p => p.uuid); });
await registry.drainOnce();
check('Demultiplexacao real: "calls" recebe so uuid-A e uuid-B (nunca C)', JSON.stringify(recebidoPor.calls?.sort()) === JSON.stringify(['uuid-A', 'uuid-B']));
check('Demultiplexacao real: "crew" recebe so uuid-C (nunca A ou B)', JSON.stringify(recebidoPor.crew) === JSON.stringify(['uuid-C']));

// 5. "crew" libera -- motor deve ser reconfigurado só com A,B (as de "calls"), nunca ficar
//    com C orfao nem ser desligado por completo enquanto "calls" ainda precisa.
chamadasVendor = [];
await registry.release('crew');
const configureAposLiberar = chamadasVendor.filter(c => c.data?.action === 'configure');
check('Após "crew" liberar: motor reconfigurado só com as fontes restantes de "calls" (A,B), sem parar', configureAposLiberar.length === 1 && configureAposLiberar[0].data.sources.map(s => s.uuid).sort().join(',') === 'uuid-A,uuid-B');

// 6. "calls" também libera -- agora SIM o motor deve ser parado (call_audio stop), nunca
//    deixado configurado com 0 fontes.
chamadasVendor = [];
await registry.release('calls');
const paradaFinal = chamadasVendor.find(c => c.name === 'optional:CallVendorRequest' && c.data?.requestData?.action === 'stop');
check('Após TODOS os consumidores liberarem: motor recebe call_audio stop explícito', !!paradaFinal);

console.log('\nRESULTADO: ' + resultados.filter(Boolean).length + '/' + resultados.length + ' PASS');
process.exit(resultados.every(Boolean) ? 0 : 1);
