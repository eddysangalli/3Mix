// Teste real e isolado do CrewIntercomEngine (classe REAL, import direto) + AudioTapRegistry
// REAL, contra um production mock que gera pacotes PCM sinteticos (tons diferentes por
// membro, para distinguir quem foi ouvido de verdade). Cobre: grupos, PTT individual e
// coletivo, prioridade da direcao, e a prova negativa de isolamento do PGM.
import { AudioTapRegistry } from '../../ferramentas/audio-tap-registry.mjs';
import { CrewIntercomEngine } from '../../ferramentas/crew-intercom-producao.mjs';

const resultados = [];
function check(nome, cond, detalhe) { resultados.push(cond); console.log((cond ? 'PASS' : 'FAIL') + ' - ' + nome + (detalhe ? ' :: ' + detalhe : '')); }

// Gera um pacote PCM real (float32 estereo-compativel, mono replicado) com uma amplitude
// constante distinta por "voz" (0.1 para A, 0.2 para B, 0.3 para C) para eu confirmar
// DEPOIS DE MIXADO quem contribuiu, lendo os bytes de volta -- nao so confiar que a funcao
// "deveria" ter funcionado.
function pacote(uuid, amplitude, timestampNs, rateHz = 48000, frames = 480) {
  const pcm = Buffer.alloc(frames * 1 * 4); // 1 canal (mixReturn promove para estereo lendo o mesmo canal 2x)
  for (let f = 0; f < frames; f++) pcm.writeFloatLE(amplitude, f * 4);
  return { uuid, timestamp: BigInt(timestampNs), frames, rate: rateHz, channels: 1, pcm: pcm.toString('base64') };
}
function amplitudeDoMix(buffer) {
  // formato do mixReturn: header de 12 bytes (rate,channels,frames), depois PCM estereo.
  if (!buffer || buffer.length <= 12) return 0;
  return buffer.readFloatLE(12); // primeiro sample do canal 0 -- amplitude constante nesta sintese, basta 1 amostra
}

let proximoBatch = { packets: [] };
const productionFake = { async vendor(name, data) { if (data.action === 'drain') return proximoBatch; return {}; }, async optional() { return {}; } };

const registry = new AudioTapRegistry(productionFake);
const intercom = new CrewIntercomEngine(registry);

// mixReturn é desenhado para um FLUXO CONTÍNUO (áudio chegando a cada ~20-50ms, igual ao
// CallReturns.pump() real em produção) — um pacote isolado não necessariamente cai dentro
// da janela que cursorFor calcula na ressincronização. Este helper simula um fluxo
// realista: N pacotes consecutivos da mesma voz, 20ms de frames cada, entregues um por vez
// via drainOnce() (mesmo ritmo real), e devolve TODOS os valores de amplitude recebidos
// por um listener (não só o primeiro) para o teste verificar que o valor certo apareceu
// EM ALGUM MOMENTO do fluxo, do jeito que aconteceria de verdade.
async function falarPorUmTempo(uuid, amplitude, duracaoMs = 300) {
  const rate = 48000, framesPorPacote = Math.round(rate * 0.02); // 20ms por pacote, como áudio real chegaria
  const n = Math.round(duracaoMs / 20);
  let t = Date.now() * 1e6; // ns arbitrário, só precisa ser crescente e consistente entre pacotes desta chamada
  for (let i = 0; i < n; i++) {
    proximoBatch = { packets: [pacote(uuid, amplitude, t, rate, framesPorPacote)] };
    await registry.drainOnce();
    t += Math.round(framesPorPacote / rate * 1e9);
  }
}
function limparEstadoDeMixagem() {
  intercom.lastPackets = [];
  intercom.cursors.clear();
}

const diretor = intercom.registerMember({ name: 'Diretor', sourceUuid: 'uuid-diretor', role: 'director' });
const camA = intercom.registerMember({ name: 'Câmera A', sourceUuid: 'uuid-camA', role: 'crew' });
const camB = intercom.registerMember({ name: 'Câmera B', sourceUuid: 'uuid-camB', role: 'crew' });
const repC = intercom.registerMember({ name: 'Repórter C', sourceUuid: 'uuid-repC', role: 'crew' });
await intercom.syncRegistry();

const grupoCameras = intercom.createGroup({ name: 'Câmeras' });
intercom.setMemberGroups(camA, [grupoCameras]);
intercom.setMemberGroups(camB, [grupoCameras]);

// Acumula TODOS os valores de amplitude recebidos por cada listener durante um fluxo
// (não só o último) — reflete como um dispositivo real receberia uma sequência de
// pacotes `mix` enquanto alguém fala, não uma única mensagem isolada.
const recebido = {}; // memberId -> array de amplitudes recebidas
intercom.on('mix', (memberId, buf) => { (recebido[memberId] ??= []).push(amplitudeDoMix(buf)); });
const algumPerto = (memberId, valor) => (recebido[memberId] || []).some((a) => Math.abs(a - valor) < 0.01);

// 1. PTT INDIVIDUAL: Câmera A fala só para Repórter C (não para Câmera B).
limparEstadoDeMixagem();
for (const k of Object.keys(recebido)) delete recebido[k];
intercom.startPtt(camA, [repC]);
await falarPorUmTempo('uuid-camA', 0.3);
check('PTT individual: Repórter C recebe a voz da Câmera A (amplitude real 0.3 no mix, em algum pacote do fluxo)', algumPerto(repC, 0.3));
check('PTT individual: Câmera B NÃO recebe nada (não era o alvo)', !recebido[camB]?.length);
intercom.stopPtt(camA);

// 2. PTT COLETIVO (grupo): Repórter C fala para o grupo "Câmeras" -- A e B recebem, ninguém mais.
limparEstadoDeMixagem();
for (const k of Object.keys(recebido)) delete recebido[k];
intercom.startPtt(repC, [grupoCameras]);
await falarPorUmTempo('uuid-repC', 0.4);
check('PTT coletivo (grupo): Câmera A recebe a voz do Repórter C (amplitude 0.4)', algumPerto(camA, 0.4));
check('PTT coletivo (grupo): Câmera B também recebe (está no mesmo grupo)', algumPerto(camB, 0.4));
intercom.stopPtt(repC);

// 3. PRIORIDADE DA DIREÇÃO: Câmera A fala para TODOS ao mesmo tempo que o Diretor fala
//    para TODOS -- quem ouve deve receber SÓ o diretor, nunca os dois misturados (0.3+0.7
//    jamais apareceria como amplitude única nesta síntese: cada voz tem um canal próprio
//    de pacotes, então "misturado" apareceria como 1.0 se ambos fossem somados).
limparEstadoDeMixagem();
for (const k of Object.keys(recebido)) delete recebido[k];
const todos = [diretor, camA, camB, repC];
intercom.startPtt(camA, todos);
intercom.startPtt(diretor, todos);
// Pacotes das duas vozes intercalados no mesmo fluxo de tempo (simula as duas falando ao
// mesmo tempo de verdade).
{
  const rate = 48000, framesPorPacote = Math.round(rate * 0.02);
  let t = Date.now() * 1e6;
  for (let i = 0; i < 15; i++) {
    proximoBatch = { packets: [pacote('uuid-camA', 0.3, t, rate, framesPorPacote), pacote('uuid-diretor', 0.7, t, rate, framesPorPacote)] };
    await registry.drainOnce();
    t += Math.round(framesPorPacote / rate * 1e9);
  }
}
check('Prioridade da direção: Repórter C ouve o diretor (0.7) em algum momento do fluxo', algumPerto(repC, 0.7));
check('Prioridade da direção: Repórter C NUNCA ouve a Câmera A enquanto o diretor fala (sem 0.3 nem soma 1.0)', !algumPerto(repC, 0.3) && !algumPerto(repC, 1.0));
intercom.stopPtt(camA); intercom.stopPtt(diretor);

// 4. Própria voz nunca volta para quem fala (mixReturn já garante isso -- confirmar que o
//    Intercom não quebra essa garantia ao passar `own`).
limparEstadoDeMixagem();
for (const k of Object.keys(recebido)) delete recebido[k];
intercom.startPtt(camA, todos); // inclui o próprio camA na lista de alvos, por engano do operador
await falarPorUmTempo('uuid-camA', 0.3);
check('Própria voz nunca retorna ao próprio falante, mesmo se incluído na lista de alvos por engano', !recebido[camA]?.length);
intercom.stopPtt(camA);

// 5. Watchdog de PTT: sem ping, expira sozinho após o TTL (fail-safe real, não teórico).
intercom.startPtt(camA, [repC]);
check('PTT ativo imediatamente após start', intercom.activePtt.has(camA));
await new Promise((r) => setTimeout(r, 1700)); // TTL é 1500ms + watchdog roda a cada 150ms
check('PTT expira sozinho após o TTL sem ping (watchdog real)', !intercom.activePtt.has(camA));

// 6. PROVA NEGATIVA DE ISOLAMENTO DO PGM (regra 5 do superprompt, obrigatória): confirmar
//    por INSPEÇÃO DO CÓDIGO-FONTE (não só por não ter testado o contrário) que não existe
//    NENHUMA chamada ao motor nativo de produção/vídeo nesta classe.
const fs = await import('node:fs/promises');
const fonte = await fs.readFile(new URL('../../ferramentas/crew-intercom-producao.mjs', import.meta.url), 'utf8');
const codigoSemComentarios = fonte.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
check('Prova negativa: ZERO chamadas a production.run()/req() no código real (fora de comentários) do Intercom', !/production\.(run|req)\(/.test(codigoSemComentarios));
check('Prova negativa: ZERO referência a bus M/A/B ou PGM/Programa no código real do Intercom', !/\b(busA|busB|PGM|Programa|program)\b/.test(codigoSemComentarios));

await intercom.close();
console.log('\nRESULTADO: ' + resultados.filter(Boolean).length + '/' + resultados.length + ' PASS');
process.exit(resultados.every(Boolean) ? 0 : 1);
