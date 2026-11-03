// /api/diagnostico: assistente de primeira execução e diagnóstico do computador. Só no computador do 3Mix.
// GET devolve o estado do assistente, o perfil medido e o teste em andamento; POST executa uma etapa.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { inventario, testarEncoders, testarDisco, testarRede, lerPerfil, salvarPerfil, precisaRevalidar, versaoInstalada, descobrirOnvif, controladoresConectados } from './diagnostico-maquina.mjs';
import { execFile } from 'node:child_process';
import { rm, stat } from 'node:fs/promises';
import { BenchmarkCapacidade, PERFIS } from './benchmark-capacidade.mjs';
import { conferirPacote, removerPacote, prepararPacote } from './midia-diagnostico.mjs';
import { setTimeout as sleep } from 'node:timers/promises';

export const ETAPAS = ['boas-vindas', 'integridade', 'inventario', 'encoders', 'disco', 'rede', 'equipamentos', 'capacidade', 'saidas', 'modulos', 'interface', 'teste-final', 'resumo'];
const arquivoEstado = (raiz) => join(raiz, 'config', '3mix-primeira-execucao.json');

export async function lerEstado(raiz) {
  try { return JSON.parse(await readFile(arquivoEstado(raiz), 'utf8')); } catch { return { etapas: {}, concluidoEm: null }; }
}
async function gravarEstado(raiz, estado) {
  await mkdir(join(raiz, 'config'), { recursive: true });
  await writeFile(arquivoEstado(raiz), JSON.stringify(estado, null, 1));
  return estado;
}


export const DEMO = 'Demo Futsal';
// Projeto de demonstração criado pelo próprio motor (nunca JSON montado à mão): 4 cenas de mídia, sem hardware.
// Os vídeos são os de teste gerados no computador; o placar é texto simples por cima das cenas de jogo.
export async function criarDemoFutsal(production, root) {
  const pacote = await prepararPacote(root, join(root, 'runtime', 'ffmpeg.exe'), { conjunto: 'basico' });
  const p = production;
  const repetir = async (fn) => { for (let i = 0; ; i++) { try { return await fn(); } catch (e) { if (!/207|not ready/i.test(e.message) || i > 60) throw e; await sleep(250); } } };
  const lista = await repetir(() => p.req('GetSceneCollectionList'));
  if (lista.sceneCollections.includes(DEMO)) throw new Error('O projeto ' + DEMO + ' já existe: abra-o pela lista de projetos.');
  const anterior = lista.currentSceneCollectionName;
  await repetir(() => p.req('CreateSceneCollection', { sceneCollectionName: DEMO }));
  for (let i = 0; i < 40 && (await repetir(() => p.req('GetSceneCollectionList'))).currentSceneCollectionName !== DEMO; i++) await sleep(250);
  if ((await repetir(() => p.req('GetSceneCollectionList'))).currentSceneCollectionName !== DEMO) throw new Error('O motor não abriu o projeto de demonstração.');
  await sleep(1000);
  const video = await repetir(() => p.req('GetVideoSettings'));
  const cenas = [['CAM 1 Quadra', 0], ['CAM 2 Gol', 1], ['CAM 3 Banco', 2], ['VT Abertura', 3]];
  for (const [nome, i] of cenas) {
    await repetir(() => p.req('CreateScene', { sceneName: nome }));
    const r = await repetir(() => p.req('CreateInput', { sceneName: nome, inputName: nome + ' (vídeo)', inputKind: 'ffmpeg_source', inputSettings: { local_file: pacote.arquivos[i].caminho, looping: true, restart_on_activate: false }, sceneItemEnabled: true }));
    await repetir(() => p.req('SetSceneItemTransform', { sceneName: nome, sceneItemId: r.sceneItemId, sceneItemTransform: { positionX: 0, positionY: 0, boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsWidth: video.baseWidth, boundsHeight: video.baseHeight, boundsAlignment: 0 } }));
  }
  const placar = await repetir(() => p.req('CreateInput', { sceneName: 'CAM 1 Quadra', inputName: 'Placar', inputKind: 'text_gdiplus_v3', inputSettings: { text: 'CASA 0 x 0 VISITANTE   1º TEMPO', font: { face: 'Arial', size: 48, style: 'Bold' }, bk_color: 4278190080, bk_opacity: 70 }, sceneItemEnabled: true }).catch(() => p.req('CreateInput', { sceneName: 'CAM 1 Quadra', inputName: 'Placar', inputKind: 'text_gdiplus', inputSettings: { text: 'CASA 0 x 0 VISITANTE   1º TEMPO' }, sceneItemEnabled: true })));
  await repetir(() => p.req('SetSceneItemTransform', { sceneName: 'CAM 1 Quadra', sceneItemId: placar.sceneItemId, sceneItemTransform: { positionX: 60, positionY: video.baseHeight - 120 } }));
  await repetir(() => p.req('CreateSceneItem', { sceneName: 'CAM 2 Gol', sourceName: 'Placar', sceneItemEnabled: true }));
  // A mesa do 3Mix trabalha sempre com Preview e Programa: projeto novo nasce sem esse modo.
  await repetir(() => p.req('SetStudioModeEnabled', { studioModeEnabled: true }));
  await sleep(500);
  await repetir(() => p.req('SetCurrentProgramScene', { sceneName: 'VT Abertura' }));
  await repetir(() => p.req('SetCurrentPreviewScene', { sceneName: 'CAM 1 Quadra' }));
  // Confere no motor o que foi criado, em vez de supor.
  const criadas = (await repetir(() => p.req('GetSceneList'))).scenes.map((s) => s.sceneName);
  const faltam = cenas.map(([n]) => n).filter((n) => !criadas.includes(n));
  if (faltam.length) throw new Error('O motor não confirmou as cenas: ' + faltam.join(', '));
  return { projeto: DEMO, anterior, cenas: cenas.map(([n]) => n) };
}

// Teste final antes de entrar na mesa: imagem real do Preview e do Programa, nível do Master e 3 s de gravação
// conferidos pelo ffprobe e apagados. Só com nada no ar.
async function quadroMedio(p, cena) {
  if (!cena) return { cena: null, imagem: false };
  const sh = await p.req('GetSourceScreenshot', { sourceName: cena, imageFormat: 'bmp', imageWidth: 32, imageHeight: 18 });
  const buf = Buffer.from(String(sh.imageData).split(',')[1], 'base64');
  const inicio = buf.readUInt32LE(10), passo = buf.readUInt16LE(28) / 8;
  let soma = 0, n = 0;
  for (let i = inicio; i + 2 < buf.length; i += passo) { soma += buf[i] + buf[i + 1] + buf[i + 2]; n++; }
  const media = n ? soma / (n * 3) : 0;
  return { cena, brilho: Math.round(media), imagem: media > 8 };
}

export async function testeFinal(production, root) {
  const p = production;
  const [s, g] = await Promise.all([p.req('GetStreamStatus'), p.req('GetRecordStatus')]);
  if (s.outputActive || g.outputActive) throw new Error('Pare a transmissão e a gravação antes do teste final.');
  const programa = (await p.req('GetCurrentProgramScene')).currentProgramSceneName;
  const preview = await p.req('GetCurrentPreviewScene').then((r) => r.currentPreviewSceneName).catch(() => null);
  const resultado = { programa: await quadroMedio(p, programa), preview: await quadroMedio(p, preview) };
  const master = (p.state?.audioInputs || []).find((a) => a.bus === 'M' || a.name === '3Mix Master');
  const pico = master ? Math.max(0, ...(master.levels || [])) : null;
  resultado.audio = !master ? { lido: false } : { lido: true, mudo: !!master.muted, picoDb: pico > 0 ? Math.round(20 * Math.log10(pico)) : null };
  await p.req('StartRecord');
  for (let i = 0; i < 40 && !(await p.req('GetRecordStatus')).outputActive; i++) await sleep(250);
  await sleep(3000);
  const parada = await p.req('StopRecord');
  const arquivo = parada.outputPath;
  for (let i = 0; i < 40 && (await p.req('GetRecordStatus')).outputActive; i++) await sleep(250);
  await sleep(800);
  const ffprobe = join(root, 'runtime', 'ffprobe.exe');
  const info = await new Promise((resolve) => execFile(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', arquivo], { timeout: 20000, windowsHide: true }, (e, out) => resolve(e ? null : JSON.parse(out))));
  const tamanho = (await stat(arquivo).catch(() => null))?.size || 0;
  resultado.gravacao = info ? { ok: Number(info.format?.duration) >= 2 && info.streams.some((x) => x.codec_type === 'video'), duracao: Number(Number(info.format?.duration).toFixed(1)), audio: info.streams.some((x) => x.codec_type === 'audio'), bytes: tamanho } : { ok: false, motivo: 'o arquivo não pôde ser lido' };
  await rm(arquivo, { force: true }).catch(() => {});
  resultado.arquivoApagado = !(await stat(arquivo).catch(() => null));
  return resultado;
}

let bench = null;
const benchmark = (production, raiz) => bench || (bench = new BenchmarkCapacidade(production, { ffmpeg: join(raiz, 'runtime', 'ffmpeg.exe'), raiz }));

export async function handleDiagnostico({ path, req, res, local, json, body, production, root }) {
  if (path !== '/api/diagnostico') return false;
  if (!local(req)) { json(res, 403, { success: false, error: 'O diagnóstico só roda no computador do 3Mix' }); return true; }
  try {
    if (req.method === 'GET') {
      const [estado, perfil, versao, pacote] = await Promise.all([lerEstado(root), lerPerfil(root), versaoInstalada(root), conferirPacote(root)]);
      json(res, 200, { success: true, etapas: ETAPAS, estado, perfil, versao, pacote, benchmark: benchmark(production, root).estado(), perfis: PERFIS });
      return true;
    }
    if (req.method !== 'POST') { json(res, 405, { success: false }); return true; }
    const d = await body(req);
    let result;
    switch (d.action) {
      case 'inventario': {
        const inv = await inventario();
        await salvarPerfil(root, { inventario: inv });
        result = { inventario: inv, revalidar: await precisaRevalidar(root, inv) };
        break;
      }
      case 'encoders': {
        const lista = await testarEncoders(join(root, 'runtime', 'ffmpeg.exe'));
        let motor = [];
        try { motor = (await production.vendor('get_destinations', {}, 'freemix')).encoders || []; } catch { /* motor fora */ }
        result = { testados: lista, doMotor: motor.map((e) => ({ id: e.id, nome: e.name || e.label || e.id })) };
        await salvarPerfil(root, { encoders: result });
        break;
      }
      case 'disco': {
        const pasta = d.pasta || (await production.req('GetRecordDirectory')).recordDirectory;
        const mb = Math.min(2048, Math.max(64, Number(d.mb) || 512));
        result = await testarDisco(pasta, { mb });
        await salvarPerfil(root, { disco: result });
        break;
      }
      case 'rede':
        result = await testarRede({ externo: d.externo === true });
        await salvarPerfil(root, { rede: result });
        break;
      case 'capacidade_iniciar':
        result = benchmark(production, root).iniciar({ perfis: d.perfis, aquecimentoS: d.aquecimentoS, medicaoS: d.medicaoS });
        break;
      case 'capacidade_cancelar':
        result = benchmark(production, root).cancelar();
        break;
      case 'equipamentos': {
        const [onvif, controladores] = await Promise.all([descobrirOnvif(), controladoresConectados()]);
        const cadastrados = production.ptzManager?.summary?.().devices || [];
        result = { onvif, ptzCadastradas: cadastrados.map((d) => ({ nome: d.name, protocolo: d.protocol, host: d.host, conectada: d.connected })), controladores };
        await salvarPerfil(root, { equipamentos: { em: new Date().toISOString(), cameras: onvif.cameras.length, ptz: cadastrados.length, controladores: controladores.map((c) => c.nome) } });
        break;
      }
      case 'teste_final':
        result = await testeFinal(production, root);
        break;
      case 'demo_futsal':
        result = await criarDemoFutsal(production, root);
        break;
      case 'midia_remover':
        result = await removerPacote(root);
        break;
      case 'etapa': {
        if (!ETAPAS.includes(d.etapa)) throw new Error('Etapa desconhecida');
        const estado = await lerEstado(root);
        estado.etapas[d.etapa] = { situacao: d.adiada ? 'adiada' : 'feita', em: new Date().toISOString() };
        result = await gravarEstado(root, estado);
        break;
      }
      case 'concluir': {
        const estado = await lerEstado(root);
        estado.concluidoEm = new Date().toISOString();
        estado.equipamentoValidado = estado.etapas.capacidade?.situacao === 'feita';
        result = await gravarEstado(root, estado);
        break;
      }
      case 'reiniciar':
        result = await gravarEstado(root, { etapas: {}, concluidoEm: null });
        break;
      default:
        throw new Error('Ação de diagnóstico desconhecida');
    }
    json(res, 200, { success: true, result });
  } catch (e) {
    json(res, 400, { success: false, error: e.message });
  }
  return true;
}
