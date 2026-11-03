// Teste de capacidade progressivo: 4, 8, 12 e 16 fontes de vídeo reais (arquivos diferentes) no motor,
// com aquecimento, medição, critérios explícitos e restauração do estado anterior.
// Roda numa coleção de cenas própria ("3Mix Diagnóstico"); o projeto do operador não é tocado.
// Recusa começar com transmissão, gravação, câmera virtual ou saída extra no ar. Para no primeiro perfil
// que falhar (não força a máquina além do limite) e pode ser cancelado a qualquer momento.
import { rm } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { prepararPacote } from './midia-diagnostico.mjs';
import { amostrarMaquina } from './maquina-saude.mjs';
import { nvidiaSmi, salvarPerfil } from './diagnostico-maquina.mjs';

export const COLECAO = '3Mix Diagnóstico';
export const PERFIS = [
  { fontes: 4, nome: 'Básico', transicoes: false, gravar: false },
  { fontes: 8, nome: 'Profissional', transicoes: true, gravar: true },
  { fontes: 12, nome: 'Intensivo', transicoes: true, gravar: true },
  { fontes: 16, nome: 'Extremo', transicoes: true, gravar: true }
];
export const LIMIARES = { renderAprovado: 0.6, renderAtencao: 0.9, perdaAprovado: 0.005, perdaAtencao: 0.02, fpsMinimo: 0.98, cpuAprovado: 85 };

/** Classifica uma medição. Exportado para teste. */
export function avaliar(m, orcamentoMs, limiares = LIMIARES) {
  const motivos = [];
  const renderRel = m.renderMedioMs / orcamentoMs;
  const perda = Math.max(m.perdaRender, m.perdaEncoder ?? 0);
  if (renderRel > limiares.renderAtencao) motivos.push(`render ${m.renderMedioMs.toFixed(1)} ms de ${orcamentoMs.toFixed(1)} ms por quadro`);
  if (perda > limiares.perdaAtencao) motivos.push(`${(perda * 100).toFixed(1)}% de quadros perdidos`);
  if (m.fpsMedio < limiares.fpsMinimo * m.fpsAlvo) motivos.push(`${m.fpsMedio.toFixed(1)} de ${m.fpsAlvo} fps`);
  if (motivos.length) return { resultado: 'FALHA', motivos };
  if (renderRel > limiares.renderAprovado || perda > limiares.perdaAprovado || (m.cpuMaquina ?? 0) > limiares.cpuAprovado) {
    return { resultado: 'ATENÇÃO', motivos: [`render ${Math.round(renderRel * 100)}% do tempo do quadro`, `${(perda * 100).toFixed(2)}% perdidos`, m.cpuMaquina != null ? `CPU ${m.cpuMaquina}%` : null].filter(Boolean) };
  }
  return { resultado: 'APROVADO', motivos: [] };
}

export class BenchmarkCapacidade {
  constructor(production, { ffmpeg, raiz, amostrar = amostrarMaquina } = {}) {
    // Durante a troca de coleção o motor responde 207 ("ainda não está pronto"): espera e repete.
    this.p = Object.create(production);
    this.p.req = async (tipo, dados) => {
      for (let i = 0; ; i++) {
        try { return await production.req(tipo, dados); } catch (e) {
          if (!/\b207\b|not ready/i.test(e.message) || i >= 60) throw e;
          await sleep(250);
        }
      }
    };
    this.ffmpeg = ffmpeg; this.raiz = raiz; this.amostrar = amostrar;
    this.job = null; this.controle = null;
  }

  estado() { return this.job ? { ...this.job } : { estado: 'parado' }; }

  cancelar() {
    if (!this.controle) return { cancelado: false, motivo: 'Nenhum teste em andamento' };
    this.controle.abort();
    return { cancelado: true };
  }

  async conferirLivre() {
    const r = (t) => this.p.req(t).catch(() => null);
    const [s, g, v] = await Promise.all([r('GetStreamStatus'), r('GetRecordStatus'), r('GetVirtualCamStatus')]);
    const destinos = (await this.p.vendor('get_destinations', {}, 'freemix').catch(() => ({ destinations: [] }))).destinations || [];
    const ocupado = [s?.outputActive && 'transmissão', g?.outputActive && 'gravação', v?.outputActive && 'câmera virtual', destinos.some((d) => d.active) && 'saída extra'].filter(Boolean);
    if (ocupado.length) throw new Error('Pare antes de testar: ' + ocupado.join(', ') + '. O teste nunca roda com algo no ar.');
  }

  iniciar(opcoes = {}) {
    if (this.job?.estado === 'rodando') throw new Error('Já há um teste em andamento');
    const perfis = PERFIS.filter((x) => (opcoes.perfis || [4, 8, 12, 16]).includes(x.fontes));
    if (!perfis.length) throw new Error('Escolha ao menos um perfil: 4, 8, 12 ou 16 fontes');
    this.controle = new AbortController();
    this.job = { id: Date.now().toString(36), estado: 'rodando', etapa: 'Preparando', inicio: new Date().toISOString(), perfis: [], log: [] };
    this.executar(perfis, opcoes, this.controle.signal).catch(() => {});
    return this.estado();
  }

  passo(texto) { this.job.etapa = texto; this.job.log.push(`${new Date().toISOString().slice(11, 19)} ${texto}`); }

  async executar(perfis, opcoes, sinal) {
    const p = this.p;
    const aquecer = Number(opcoes.aquecimentoS ?? 8), medir = Number(opcoes.medicaoS ?? 20);
    let colecaoOriginal = null, gravando = false, arquivoGravado = null, final = 'erro';
    try {
      await this.conferirLivre();
      const precisaCompleto = perfis.some((x) => x.fontes > 4);
      const pacote = await prepararPacote(this.raiz, this.ffmpeg, { conjunto: precisaCompleto ? 'completo' : 'basico', sinal, aoProgresso: (m) => this.passo(m) });
      const video = await p.req('GetVideoSettings');
      const fpsAlvo = video.fpsNumerator / video.fpsDenominator, orcamento = 1000 / fpsAlvo;
      this.job.video = { largura: video.baseWidth, altura: video.baseHeight, fps: Number(fpsAlvo.toFixed(2)) };

      const lista = await p.req('GetSceneCollectionList');
      colecaoOriginal = lista.currentSceneCollectionName;
      this.job.colecaoOriginal = colecaoOriginal;
      this.passo('Abrindo a coleção de teste');
      if (lista.sceneCollections.includes(COLECAO)) await p.req('SetCurrentSceneCollection', { sceneCollectionName: COLECAO });
      else await p.req('CreateSceneCollection', { sceneCollectionName: COLECAO });
      for (let i = 0; i < 40 && (await p.req('GetSceneCollectionList')).currentSceneCollectionName !== COLECAO; i++) await sleep(250);
      // Sem a coleção de teste aberta, nada é criado: as fontes cairiam no projeto do operador.
      if ((await p.req('GetSceneCollectionList')).currentSceneCollectionName !== COLECAO) throw new Error('Não foi possível abrir a coleção de teste; nada foi alterado no projeto.');
      await sleep(1500);
      await this.desmontar();

      for (const perfil of perfis) {
        if (sinal.aborted) throw new Error('cancelado');
        this.passo(`${perfil.nome}: montando ${perfil.fontes} fontes`);
        const cenas = await this.montar(perfil, pacote.arquivos, video);
        if (perfil.gravar) {
          await p.req('StartRecord').catch(() => {});
          gravando = true;
        }
        let parar = false;
        const alternar = perfil.transicoes ? (async () => {
          const t = (await p.req('GetSceneTransitionList')).transitions.find((x) => x.transitionKind === 'fade_transition');
          if (t) await p.req('SetCurrentSceneTransition', { transitionName: t.transitionName }).catch(() => {});
          let i = 0;
          while (!parar && !sinal.aborted) { await sleep(3000); await p.req('SetCurrentProgramScene', { sceneName: cenas[++i % 2] }).catch(() => {}); }
        })() : null;

        this.passo(`${perfil.nome}: aquecendo ${aquecer} s`);
        await sleep(aquecer * 1000);
        if (sinal.aborted) throw new Error('cancelado');
        this.passo(`${perfil.nome}: medindo ${medir} s`);
        const ini = await p.req('GetStats');
        const serie = [];
        let maquina = null, gpu = null;
        for (let s = 0; s < medir; s++) {
          if (sinal.aborted) break;
          const st = await p.req('GetStats');
          serie.push({ fps: st.activeFps, renderMs: st.averageFrameRenderTime, cpuMotor: st.cpuUsage, memoriaMb: st.memoryUsage });
          if (s === Math.floor(medir / 2)) { [maquina, gpu] = await Promise.all([this.amostrar(), nvidiaSmi()]); } else await sleep(1000);
        }
        const fim = await p.req('GetStats');
        parar = true; await alternar;
        if (gravando) {
          const r = await p.req('StopRecord').catch(() => null);
          arquivoGravado = r?.outputPath || null; gravando = false;
          if (arquivoGravado) { await sleep(1500); await rm(arquivoGravado, { force: true }).catch(() => {}); }
        }
        const dRender = fim.renderTotalFrames - ini.renderTotalFrames, dEnc = fim.outputTotalFrames - ini.outputTotalFrames;
        const media = (k) => serie.reduce((t, x) => t + x[k], 0) / Math.max(1, serie.length);
        const medicao = {
          fontes: perfil.fontes, perfil: perfil.nome, fpsAlvo: Number(fpsAlvo.toFixed(2)),
          fpsMedio: Number(media('fps').toFixed(2)), renderMedioMs: Number(media('renderMs').toFixed(2)), renderMaxMs: Number(Math.max(...serie.map((x) => x.renderMs)).toFixed(2)),
          perdaRender: dRender > 0 ? (fim.renderSkippedFrames - ini.renderSkippedFrames) / dRender : 0,
          perdaEncoder: perfil.gravar && dEnc > 0 ? (fim.outputSkippedFrames - ini.outputSkippedFrames) / dEnc : null,
          cpuMotor: Number(media('cpuMotor').toFixed(1)), memoriaMotorMb: Math.round(media('memoriaMb')),
          cpuMaquina: maquina?.cpu ?? null, gpuMaquina: maquina?.gpu ?? null, ramLivreGb: maquina?.ramLivreGb ?? null,
          gpuNvidia: gpu?.[0] ? { uso: gpu[0].uso, temperatura: gpu[0].temperatura } : null,
          transicoes: perfil.transicoes, gravacao: perfil.gravar, arquivosDistintos: new Set(pacote.arquivos.slice(0, perfil.fontes).map((a) => a.sha256)).size,
          decodificacao: 'CPU (decodificação por hardware desligada nas fontes de teste)', serie
        };
        Object.assign(medicao, avaliar(medicao, orcamento, { ...LIMIARES, ...(opcoes.limiares || {}) }));
        this.job.perfis.push(medicao);
        this.passo(`${perfil.nome}: ${medicao.resultado}`);
        await this.desmontar(cenas);
        if (medicao.resultado === 'FALHA') { this.passo('Parado no primeiro perfil que falhou, para não forçar a máquina'); break; }
      }
      if (sinal.aborted) throw new Error('cancelado');
      const aprovados = this.job.perfis.filter((x) => x.resultado !== 'FALHA');
      const fontesValidadas = aprovados.length ? Math.max(...aprovados.map((x) => x.fontes)) : 0;
      this.job.fontesValidadas = fontesValidadas;
      await salvarPerfil(this.raiz, {
        fontesValidadas, medidoEm: new Date().toISOString().slice(0, 10),
        benchmark: { em: new Date().toISOString(), video: this.job.video, limiares: { ...LIMIARES, ...(opcoes.limiares || {}) }, aquecimentoS: aquecer, medicaoS: medir, perfis: this.job.perfis.map(({ serie, ...r }) => r) }
      });
      final = 'concluido';
    } catch (e) {
      final = e.message === 'cancelado' ? 'cancelado' : 'erro';
      this.job.erro = e.message === 'cancelado' ? null : e.message;
    } finally {
      // Restauração sempre: para a gravação de teste, apaga o arquivo e volta ao projeto do operador.
      if (gravando) { const r = await p.req('StopRecord').catch(() => null); if (r?.outputPath) { await sleep(1500); await rm(r.outputPath, { force: true }).catch(() => {}); } }
      try { await this.desmontar(); } catch { /* coleção já fora */ }
      if (colecaoOriginal) {
        this.passo('Voltando ao projeto ' + colecaoOriginal);
        await p.req('SetCurrentSceneCollection', { sceneCollectionName: colecaoOriginal }).catch((e) => { this.job.erroRestauracao = e.message; });
        for (let i = 0; i < 40; i++) { const c = (await p.req('GetSceneCollectionList').catch(() => null))?.currentSceneCollectionName; if (c === colecaoOriginal) { this.job.restaurado = true; break; } await sleep(250); }
      }
      this.job.fim = new Date().toISOString();
      this.controle = null;
      // Só agora o estado final aparece: quem consulta nunca vê "concluído" antes da restauração.
      this.job.estado = final;
    }
  }

  async montar(perfil, arquivos, video) {
    if ((await this.p.req('GetSceneCollectionList')).currentSceneCollectionName !== COLECAO) throw new Error('A coleção de teste não está aberta; nada foi criado.');
    const p = this.p, n = perfil.fontes, cols = Math.ceil(Math.sqrt(n)), linhas = Math.ceil(n / cols);
    const w = video.baseWidth / cols, h = video.baseHeight / linhas;
    const cenas = ['Diagnóstico A', 'Diagnóstico B'];
    for (const c of cenas) await p.req('CreateScene', { sceneName: c }).catch(() => {});
    this.criados = [];
    for (let i = 0; i < n; i++) {
      const a = arquivos[i % arquivos.length], nome = `Diagnóstico ${n}f fonte ${i + 1}`;
      const r = await p.req('CreateInput', { sceneName: cenas[0], inputName: nome, inputKind: 'ffmpeg_source', inputSettings: { local_file: a.caminho, looping: true, restart_on_activate: false, hw_decode: false, close_when_inactive: false }, sceneItemEnabled: true });
      this.criados.push(nome);
      await p.req('SetSceneItemTransform', { sceneName: cenas[0], sceneItemId: r.sceneItemId, sceneItemTransform: { positionX: (i % cols) * w, positionY: Math.floor(i / cols) * h, boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsWidth: w, boundsHeight: h, boundsAlignment: 0 } });
      // A cena B mostra as mesmas fontes em ordem inversa: a transição troca a composição, sem duplicar decodificação.
      const b = await p.req('CreateSceneItem', { sceneName: cenas[1], sourceName: nome, sceneItemEnabled: true });
      const j = n - 1 - i;
      await p.req('SetSceneItemTransform', { sceneName: cenas[1], sceneItemId: b.sceneItemId, sceneItemTransform: { positionX: (j % cols) * w, positionY: Math.floor(j / cols) * h, boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsWidth: w, boundsHeight: h, boundsAlignment: 0 } });
    }
    await p.req('SetCurrentProgramScene', { sceneName: cenas[0] });
    return cenas;
  }

  async desmontar() {
    const p = this.p;
    if ((await p.req('GetSceneCollectionList')).currentSceneCollectionName !== COLECAO) return;
    // Remove também sobras de um teste cancelado, e espera o motor terminar de liberar as fontes.
    const sobras = (await p.req('GetInputList')).inputs.map((i) => i.inputName).filter((n) => /^Diagnóstico \d+f fonte /.test(n));
    for (const nome of new Set([...(this.criados || []), ...sobras])) await p.req('RemoveInput', { inputName: nome }).catch(() => {});
    for (let i = 0; i < 40; i++) {
      if (!(await p.req('GetInputList')).inputs.some((x) => /^Diagnóstico \d+f fonte /.test(x.inputName))) break;
      await sleep(250);
    }
    this.criados = [];
  }
}
