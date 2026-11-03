import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PreflightEngine, NIVEL } from './preflight-producao.mjs';

// Pre-Flight com um motor falso: cada cenário muda uma coisa e confere o nível do item certo.
const pasta = mkdtempSync(join(tmpdir(), '3mix-preflight-'));
const raiz = mkdtempSync(join(tmpdir(), '3mix-raiz-'));
const amostraLimpa = { cpu: 20, nucleos: 8, ramLivreGb: 20, ramTotalGb: 32, gpu: 10, processos: [{ pid: 4000, nome: 'notepad', cpu: 0, ramMb: 20, gpu: 0, caminho: 'C:/Windows/notepad.exe' }] };

function producao(mudar = {}) {
  const base = {
    root: raiz,
    state: { connected: true, preset: 'Teste', program: 'CAM 1', preview: 'CAM 2', streaming: false, recording: false,
      inputs: [{ key: 'a', name: 'CAM 1', tally: { program: true }, health: { signal: 'unknown', sources: [{ video: true, enabled: true, kind: 'dshow_input', width: 1920, height: 1080 }] } }, { key: 'b', name: 'CAM 2', tally: { program: false }, health: { signal: 'unknown', sources: [{ video: true, enabled: true, kind: 'dshow_input', width: 1280, height: 720 }] } }],
      audioInputs: [{ name: '3Mix Master', muted: false, levels: [0.2, 0.2] }] },
    perfil: { 'Output/Mode': 'Simple', 'SimpleOutput/StreamEncoder': 'x264', 'SimpleOutput/VBitrate': '6000', 'SimpleOutput/ABitrate': '160' },
    servico: { streamServiceType: 'rtmp_custom', streamServiceSettings: { server: 'rtmp://live.exemplo.com/app', key: 'segredo' } },
    ftb: { requestedActive: false, blackObserved: false },
    encoders: [{ id: 'obs_x264', name: 'x264' }],
    stats: { activeFps: 30, averageFrameRenderTime: 2, renderSkippedFrames: 0, renderTotalFrames: 1000, outputSkippedFrames: 0, outputTotalFrames: 1000 },
    incidentes: []
  };
  const p = { ...base, ...mudar, state: { ...base.state, ...(mudar.state || {}) } };
  p.req = async (tipo, dados) => {
    if (tipo === 'GetProfileParameter') return { parameterValue: p.perfil[`${dados.parameterCategory}/${dados.parameterName}`] ?? null };
    if (tipo === 'GetStreamServiceSettings') return p.servico;
    if (tipo === 'GetRecordDirectory') return { recordDirectory: p.pastaGravacao ?? pasta };
    if (tipo === 'GetStats') return p.stats;
    throw new Error('não esperado: ' + tipo);
  };
  p.vendor = async (tipo) => {
    if (tipo === 'fade_to_black') return p.ftb;
    if (tipo === 'get_destinations') return { encoders: p.encoders, destinations: p.destinos || [] };
    throw new Error('não esperado: ' + tipo);
  };
  p.blackboxEngine = { triggerIncident: async (t, d) => { p.incidentes.push({ t, d }); } };
  return p;
}
const motor = (p, opcoes = {}) => new PreflightEngine(p, { amostrar: async () => opcoes.amostra === undefined ? amostraLimpa : opcoes.amostra, fechar: opcoes.fechar, disco: opcoes.disco || (async () => ({ supported: true, freeGb: 500, totalGb: 1000, estRecordingHours: 80, severity: 'OK' })) });
const nivel = (r, id) => r.itens.find((x) => x.id === id).nivel;

let ok = 0;
const teste = async (nome, fn) => { await fn(); ok++; console.log('PASSOU ' + nome); };

await teste('Produção em ordem: aprovado, sem bloqueio', async () => {
  const r = await motor(producao()).runCheck();
  assert.equal(r.veredito, NIVEL.OK, JSON.stringify(r.itens.filter((x) => x.nivel !== NIVEL.OK)));
  assert.equal(r.contagem.bloqueios, 0);
  assert.equal(nivel(r, 'gravacao'), NIVEL.OK);
  assert.match(r.itens.find((x) => x.id === 'gravacao').valor, /MB\/s/);
  assert.equal(nivel(r, 'perfil'), NIVEL.NAO, 'sem perfil medido não pode ser aprovado');
  assert.equal(readdirSync(pasta).length, 0, 'o arquivo de teste de escrita tem de ser apagado');
});

await teste('Câmera do Programa sem sinal bloqueia', async () => {
  const p = producao({ state: { inputs: [{ key: 'a', name: 'CAM 1', tally: { program: true }, health: { signal: 'unknown', sources: [{ video: true, enabled: true, kind: 'dshow_input', width: 0, height: 0 }] } }] } });
  const r = await motor(p).runCheck();
  assert.equal(nivel(r, 'entradas'), NIVEL.BLOQUEIO);
  assert.equal(r.readyToAir, false);
});

await teste('Câmera fora do ar sem imagem é só atenção; mídia parada não conta como falta', async () => {
  const fora = producao({ state: { inputs: [
    { key: 'a', name: 'CAM 1', tally: { program: true }, health: { signal: 'unknown', sources: [{ video: true, enabled: true, kind: 'dshow_input', width: 1920, height: 1080 }] } },
    { key: 'b', name: 'CAM 2', tally: { program: false }, health: { signal: 'unknown', sources: [{ video: true, enabled: true, kind: 'dshow_input', width: 0, height: 0 }] } },
    { key: 'c', name: 'VT', tally: { program: false }, health: { signal: 'unknown', sources: [{ video: true, enabled: true, kind: 'ffmpeg_source', width: 0, height: 0 }] } }] } });
  const r = await motor(fora).runCheck();
  assert.equal(nivel(r, 'entradas'), NIVEL.ATENCAO);
  assert.match(r.itens.find((x) => x.id === 'entradas').valor, /CAM 2/);
  assert.doesNotMatch(r.itens.find((x) => x.id === 'entradas').valor, /VT/);
});

await teste('Sem leitura de imagem de nenhuma entrada: não verificado, nunca aprovado', async () => {
  const r = await motor(producao({ state: { inputs: [{ key: 'a', name: 'CAM 1', tally: { program: true }, health: { signal: 'unknown', freeze: 'unknown' } }] } })).runCheck();
  assert.equal(nivel(r, 'entradas'), NIVEL.NAO);
});

await teste('Programa vazio bloqueia', async () => {
  const r = await motor(producao({ state: { program: null } })).runCheck();
  assert.equal(nivel(r, 'programa'), NIVEL.BLOQUEIO);
});

await teste('Áudio do Master mudo bloqueia', async () => {
  const r = await motor(producao({ state: { audioInputs: [{ name: '3Mix Master', muted: true, levels: [0.3] }] } })).runCheck();
  assert.equal(nivel(r, 'audio'), NIVEL.BLOQUEIO);
});

await teste('Master ausente fica não verificado, nunca aprovado', async () => {
  const r = await motor(producao({ state: { audioInputs: [] } })).runCheck();
  assert.equal(nivel(r, 'audio'), NIVEL.NAO);
});

await teste('Disco quase cheio bloqueia a gravação, não a transmissão', async () => {
  const p = producao();
  const r = await motor(p, { disco: async () => ({ supported: true, freeGb: 2, totalGb: 1000, estRecordingHours: 0.3, severity: 'CRITICAL' }) }).runCheck({ alvo: 'transmitir' });
  assert.equal(nivel(r, 'gravacao'), NIVEL.BLOQUEIO);
  assert.equal(r.readyToAir, true, 'só transmitir: bloqueio de gravação não conta');
  const r2 = await motor(p, { disco: async () => ({ supported: true, freeGb: 2, totalGb: 1000, estRecordingHours: 0.3, severity: 'CRITICAL' }) }).runCheck({ alvo: 'gravar' });
  assert.equal(r2.readyToAir, false);
});

await teste('Encoder indisponível bloqueia a transmissão', async () => {
  const r = await motor(producao({ perfil: { 'Output/Mode': 'Simple', 'SimpleOutput/StreamEncoder': 'nvenc' } })).runCheck();
  assert.equal(nivel(r, 'encoder'), NIVEL.BLOQUEIO);
});

await teste('Destino de transmissão inválido bloqueia', async () => {
  const sem = await motor(producao({ servico: { streamServiceType: 'rtmp_custom', streamServiceSettings: { server: '' } } })).runCheck();
  assert.equal(nivel(sem, 'destino'), NIVEL.BLOQUEIO);
  const lixo = await motor(producao({ servico: { streamServiceType: 'rtmp_custom', streamServiceSettings: { server: 'meu servidor' } } })).runCheck();
  assert.equal(nivel(lixo, 'destino'), NIVEL.BLOQUEIO);
  const semChave = await motor(producao({ servico: { streamServiceType: 'rtmp_common', streamServiceSettings: { service: 'YouTube - RTMPS', key: '' } } })).runCheck();
  assert.equal(nivel(semChave, 'destino'), NIVEL.BLOQUEIO);
  assert.ok(!JSON.stringify(sem).includes('segredo'), 'a chave nunca sai no resultado');
});

await teste('FTB ativo bloqueia', async () => {
  const r = await motor(producao({ ftb: { requestedActive: true } })).runCheck();
  assert.equal(nivel(r, 'ftb'), NIVEL.BLOQUEIO);
});

await teste('Programa pesado aparece como atenção, com PID e motivo', async () => {
  const amostra = { ...amostraLimpa, processos: [...amostraLimpa.processos, { pid: 5100, nome: 'Resolve', cpu: 40, ramMb: 6000, gpu: 30, caminho: 'C:/Program Files/Blackmagic Design/DaVinci Resolve/Resolve.exe' }, { pid: 900, nome: 'svchost', cpu: 50, ramMb: 3000, gpu: 0, caminho: 'C:/Windows/System32/svchost.exe' }, { pid: 901, nome: 'FreeMix', cpu: 60, ramMb: 3000, gpu: 50, caminho: raiz + '/bin/64bit/FreeMix.exe' }] };
  const r = await motor(producao(), { amostra }).runCheck();
  const it = r.itens.find((x) => x.id === 'processos');
  assert.equal(it.nivel, NIVEL.ATENCAO);
  assert.equal(it.processos.length, 1, 'sistema e 3Mix nunca aparecem');
  assert.equal(it.processos[0].nome, 'Resolve');
  assert.deepEqual(it.processos[0].pids, [5100]);
});

await teste('Ignorar um programa tira ele da lista nas próximas verificações', async () => {
  const amostra = { ...amostraLimpa, processos: [{ pid: 5100, nome: 'Resolve', cpu: 40, ramMb: 6000, gpu: 30, caminho: 'C:/x/Resolve.exe' }] };
  const e = motor(producao(), { amostra });
  await e.execute('preflight_process_ignore', { nome: 'Resolve' });
  const r = await e.runCheck({ item: 'processos' });
  assert.equal(nivel(r, 'processos'), NIVEL.OK);
  await e.execute('preflight_process_unignore', { nome: 'Resolve' });
});

await teste('Fechar exige confirmação, nunca mexe em sistema e só pede fechamento normal', async () => {
  const pedidos = [];
  const amostra = { ...amostraLimpa, processos: [{ pid: 5100, nome: 'Resolve', cpu: 40, ramMb: 6000, gpu: 30, caminho: 'C:/x/Resolve.exe' }, { pid: 900, nome: 'svchost', cpu: 1, ramMb: 10, gpu: 0, caminho: 'C:/Windows/System32/svchost.exe' }] };
  const e = motor(producao(), { amostra, fechar: async (pids) => { pedidos.push(...pids); return pids.map((pid) => ({ pid, resultado: 'aberto' })); } });
  await assert.rejects(() => e.execute('preflight_process_close', { nome: 'Resolve' }), /Confirme/);
  await assert.rejects(() => e.execute('preflight_process_close', { nome: 'svchost', confirmar: true }), /sistema ou do 3Mix/);
  const r = await e.execute('preflight_process_close', { nome: 'Resolve', confirmar: true });
  assert.deepEqual(pedidos, [5100]);
  assert.match(r.mensagem, /perguntando se quer salvar/);
});

await teste('No ar: modo leve, sem teste de escrita em disco', async () => {
  const r = await motor(producao({ state: { streaming: true } })).runCheck();
  assert.equal(r.modo, 'leve');
  assert.match(r.itens.find((x) => x.id === 'gravacao').valor, /não testada no ar/);
});

await teste('Contadores do Windows sem resposta: máquina e processos não verificados', async () => {
  const r = await motor(producao(), { amostra: null }).runCheck();
  assert.equal(nivel(r, 'maquina'), NIVEL.NAO);
  assert.equal(nivel(r, 'processos'), NIVEL.NAO);
});

await teste('Reverificar um item mantém os outros e registra o que mudou', async () => {
  const p = producao({ ftb: { requestedActive: true } });
  const e = motor(p);
  const r1 = await e.runCheck();
  assert.equal(nivel(r1, 'ftb'), NIVEL.BLOQUEIO);
  p.ftb = { requestedActive: false };
  const r2 = await e.runCheck({ item: 'ftb' });
  assert.equal(nivel(r2, 'ftb'), NIVEL.OK);
  assert.equal(r2.itens.length, r1.itens.length);
  const r3 = await e.runCheck();
  assert.deepEqual(r3.mudancas, []);
  const hist = await e.execute('preflight_history');
  assert.ok(hist.length >= 3);
});

await teste('Entrar no ar com bloqueio exige motivo e fica registrado', async () => {
  const p = producao({ ftb: { requestedActive: true } });
  const e = motor(p);
  await e.runCheck();
  await assert.rejects(() => e.execute('preflight_bypass', { motivo: 'ok' }), /motivo/);
  const reg = await e.execute('preflight_bypass', { motivo: 'Preto proposital na abertura' });
  assert.equal(reg.bloqueios.length, 1);
  assert.equal(p.incidentes[0].t, 'PREFLIGHT_BYPASS');
});

await teste('Motor desconectado bloqueia', async () => {
  const r = await motor(producao({ state: { connected: false } })).runCheck();
  assert.equal(nivel(r, 'motor'), NIVEL.BLOQUEIO);
});

rmSync(pasta, { recursive: true, force: true });
rmSync(raiz, { recursive: true, force: true });
console.log(`TODOS OS ${ok} TESTES DO PRE-FLIGHT PASSARAM`);
