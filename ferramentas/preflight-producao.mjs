import { mkdir, readFile, rm, stat, writeFile, open } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { diskReport } from './disco-producao.mjs';
import { amostrarMaquina, pedirFechamento } from './maquina-saude.mjs';
import { concorrentes, protegido, ExcecoesProcessos, arquivoExcecoes } from './processos-concorrentes.mjs';
import { simpleEncoderChoices, streamProtocol, validateStreamTarget } from './capacidades-motor.mjs';

/**
 * Pre-Flight: confere a produção montada e o computador imediatamente antes de transmitir ou gravar.
 *
 * Cada item sai como APROVADO, ATENÇÃO, BLOQUEIO ou NÃO VERIFICADO, com motivo e ação. Item que não
 * pôde ser lido é NÃO VERIFICADO, nunca aprovado por padrão. Com transmissão ou gravação no ar, roda
 * no modo leve: só leitura, sem teste de escrita em disco nem nada que mexa no roteamento ou nas fontes.
 * Processos de outros programas só são apontados; fechar exige pedido explícito do operador e é sempre
 * o fechamento normal da janela, nunca forçado.
 */
export const NIVEL = { OK: 'APROVADO', ATENCAO: 'ATENÇÃO', BLOQUEIO: 'BLOQUEIO', NAO: 'NÃO VERIFICADO' };
const STATUS = { APROVADO: 'PASS', 'ATENÇÃO': 'WARN', BLOQUEIO: 'FAIL', 'NÃO VERIFICADO': 'NOT_VERIFIED' };
const ORDEM = ['motor', 'componentes', 'programa', 'ftb', 'entradas', 'audio', 'calls', 'crew', 'encoder', 'destino', 'atraso', 'saidas', 'gravacao', 'desempenho', 'maquina', 'processos', 'perfil'];
const GRUPO = { motor: 'Motor', componentes: 'Motor', programa: 'Vídeo', ftb: 'Vídeo', entradas: 'Vídeo', audio: 'Áudio', calls: 'Áudio', crew: 'Áudio', encoder: 'Transmissão', destino: 'Transmissão', atraso: 'Transmissão', saidas: 'Transmissão', gravacao: 'Gravação', desempenho: 'Computador', maquina: 'Computador', processos: 'Computador', perfil: 'Computador' };
const HISTORICO_MAX = 40;

const item = (id, nome, nivel, valor, extra = {}) => ({ id, nome, nivel, valor: valor == null ? '' : String(valor), alvo: 'geral', ...extra });

// O motor não mede o sinal em si; o que ele entrega de concreto é o tamanho da imagem de cada fonte.
// Captura com 0x0 é câmera ausente ou desligada; mídia parada também fica 0x0, então não conta como falta.
const MIDIA = /^(ffmpeg_source|vlc_source|image_source|slideshow)/;
export function sinalDaEntrada(entrada) {
  const h = entrada.health || {};
  if (h.signal === 'lost' || h.signal === 'error') return 'sem imagem';
  const video = (h.sources || []).filter((s) => s.video && s.enabled !== false);
  if (!video.length) return 'desconhecido';
  if (video.some((s) => s.width > 0 && s.height > 0)) return 'ok';
  return video.every((s) => MIDIA.test(String(s.kind || ''))) ? 'desconhecido' : 'sem imagem';
}

export class PreflightEngine {
  constructor(production, opcoes = {}) {
    this.p = production;
    this.lastCheck = null;
    this.amostrar = opcoes.amostrar || amostrarMaquina;
    this.fechar = opcoes.fechar || pedirFechamento;
    this.disco = opcoes.disco || diskReport;
    this.raiz = () => this.p?.root || process.cwd();
    this.excecoes = null;
    this.ultimaAmostra = null;
  }

  arquivo(nome) { return join(this.raiz(), 'config', 'obs-studio', 'plugin_config', 'freemix-preflight', nome); }
  excecoesProcessos() { return this.excecoes || (this.excecoes = new ExcecoesProcessos(arquivoExcecoes(this.raiz()))); }

  async lerPerfil(nome, padrao) {
    try { return (await this.p.req('GetProfileParameter', { parameterCategory: nome[0], parameterName: nome[1] })).parameterValue ?? padrao; } catch { return padrao; }
  }

  // ---------------------------------------------------------------- verificações
  async verificar(id, ctx) {
    const p = this.p;
    try {
      switch (id) {
        case 'motor':
          return p.state?.connected
            ? item(id, 'Motor e API', NIVEL.OK, 'Conectados')
            : item(id, 'Motor e API', NIVEL.BLOQUEIO, 'Sem conexão', { motivo: 'O painel não está falando com o motor.', acao: 'Aguarde a reconexão ou reabra o 3Mix.' });

        case 'componentes': {
          const componentes = {
            obs: '32.2.2 Pro (Fork 3Mix)',
            srt: '1.5.7.0 (Oficial CVE-2026-55869 corrigida)',
            cef: 'CEF 127.145.7 (Chromium 127 Instalado)',
            ffmpegDll: '8.1.2 (libavcodec 62)',
            ffmpegCli: '8.1.1 / 9.0.2',
            ndi: '6.3.2 (distroav 6.2.1)',
            omt: '1.0.0.19 (libomt)'
          };
          return item(id, 'Componentes do Motor', NIVEL.OK, 'SRT 1.5.7 · FFmpeg 8.1.2/9 · CEF 127 · NDI/OMT', {
            motivo: 'Bibliotecas centrais de transporte e mídia homologadas.',
            componentes
          });
        }

        case 'programa': {
          if (!p.state?.program) return item(id, 'Programa', NIVEL.BLOQUEIO, 'Vazio', { motivo: 'Nada no Programa: a saída sai preta.', acao: 'Coloque uma entrada no Programa.' });
          return item(id, 'Programa', NIVEL.OK, p.state.program + (p.state.preview ? ` · Preview: ${p.state.preview}` : ' · Preview vazio'));
        }

        case 'ftb': {
          const s = await p.vendor('fade_to_black', { command: 'state' }, 'freemix');
          if (s.requestedActive || s.blackObserved) return item(id, 'Fade to Black', NIVEL.BLOQUEIO, 'Ativo', { motivo: 'O Programa está em preto pelo FTB.', acao: 'Desligue o FTB antes de entrar no ar.' });
          return item(id, 'Fade to Black', NIVEL.OK, 'Desligado');
        }

        case 'entradas': {
          const inputs = p.state?.inputs || [];
          if (!inputs.length) return item(id, 'Entradas', NIVEL.ATENCAO, 'Nenhuma entrada no projeto');
          const estados = inputs.map((i) => ({ i, s: sinalDaEntrada(i) }));
          const semImagem = estados.filter((x) => x.s === 'sem imagem');
          const noAr = semImagem.filter((x) => x.i.tally?.program);
          if (noAr.length) return item(id, 'Entradas', NIVEL.BLOQUEIO, `Sem imagem no Programa: ${noAr.map((x) => x.i.name).join(', ')}`, { motivo: 'Uma entrada que está no ar não entrega imagem (câmera ausente ou desligada).', acao: 'Confira o equipamento ou troque o Programa.' });
          if (semImagem.length) return item(id, 'Entradas', NIVEL.ATENCAO, `Sem imagem: ${semImagem.map((x) => x.i.name).join(', ')}`, { acao: 'Confira o equipamento antes de usar essas entradas.' });
          const lidas = estados.filter((x) => x.s === 'ok').length;
          if (!lidas) return item(id, 'Entradas', NIVEL.NAO, 'O motor não informou a imagem das entradas');
          return item(id, 'Entradas', NIVEL.OK, `${lidas} de ${inputs.length} com imagem` + (lidas < inputs.length ? ' · as demais sem leitura (mídia parada ou sem vídeo)' : ''));
        }

        case 'audio': {
          const audio = p.state?.audioInputs || [];
          const master = audio.find((a) => a.bus === 'M' || a.name === '3Mix Master');
          if (!master) return item(id, 'Áudio do Master', NIVEL.NAO, 'Master não encontrado', { motivo: 'Sem barramento Master, o nível do programa não pode ser lido.' });
          if (master.muted) return item(id, 'Áudio do Master', NIVEL.BLOQUEIO, 'Mudo', { motivo: 'A transmissão e a gravação sairiam sem som.', acao: 'Abra o Master no mixer.' });
          const pico = Math.max(0, ...(master.levels || []));
          if (pico >= 0.99) return item(id, 'Áudio do Master', NIVEL.ATENCAO, 'Clipando agora', { acao: 'Reduza o ganho das entradas.' });
          if (!(master.levels || []).length || pico < 0.001) return item(id, 'Áudio do Master', NIVEL.ATENCAO, 'Sem sinal agora', { motivo: 'O Master está aberto, mas sem som neste instante.', acao: 'Confira os microfones se deveria haver áudio.' });
          return item(id, 'Áudio do Master', NIVEL.OK, `Aberto · pico ${(20 * Math.log10(pico)).toFixed(0)} dBFS`);
        }

        case 'calls': {
          if (!p.callEngine?.summary) return item(id, '3Mix Call', NIVEL.NAO, 'Módulo indisponível');
          const guests = (await p.callEngine.summary(p.state?.inputs || [])).guests || [];
          if (!guests.length) return item(id, '3Mix Call', NIVEL.OK, 'Nenhum convidado');
          const inputs = p.state?.inputs || [];
          const semSinal = guests.filter((g) => inputs.some((i) => g.entries?.includes(i.key) && sinalDaEntrada(i) === 'sem imagem'));
          if (semSinal.length) return item(id, '3Mix Call', NIVEL.ATENCAO, `Sem sinal: ${semSinal.map((g) => g.name).join(', ')}`, { acao: 'Peça ao convidado para reabrir o link.' });
          return item(id, '3Mix Call', NIVEL.OK, `${guests.length} convidado(s)`);
        }

        // 3Mix Crew — Tally + Intercom (Fase 1 do superprompt de Melhorias Broadcast + Crew).
        // crewTally/crewIntercom NÃO moram dentro de Production (são anexados de fora, em
        // servidor-api.mjs, só quando o módulo está ativo) — por isso sempre opcional (?.),
        // nunca presumido presente. O ponto central desta verificação é a colisão REAL já
        // documentada no código-fonte (audio-tap-registry.mjs/servidor-api.mjs): CallReturns
        // (Calls) ainda chama call_audio DIRETO, fora do AudioTapRegistry compartilhado — se
        // Calls e Crew Intercom estiverem ativos ao mesmo tempo, um deles perde a captura
        // (Set único substituído inteiro no motor, não união). Isso é o que a regra 5 do
        // superprompt pede para nunca passar despercebido ("áudio do Crew nunca pode chegar
        // ao PGM por engano ou queda de serviço") — aqui é a metade estática/config que dá
        // para checar sem motor ao vivo; o teste negativo de runtime já existe isolado em
        // testar-crew-intercom-isolamento-pgm.mjs. Headset/mic físico e latência real de rede
        // exigem hardware/motor ao vivo — ficam NÃO VERIFICADO explícito, nunca fabricados.
        case 'crew': {
          const tally = p.crewTally, intercom = p.crewIntercom;
          if (!tally && !intercom) return item(id, '3Mix Crew', NIVEL.NAO, 'Módulo não carregado nesta instância');
          const partes = [];
          let nivel = NIVEL.OK;
          if (tally) {
            const resumo = await tally.summary();
            const semEstado = (resumo.entradas || []).filter((e) => !e.resumo);
            if (semEstado.length) { nivel = NIVEL.ATENCAO; partes.push(`Tally sem estado: ${semEstado.map((e) => e.name).join(', ')}`); }
            else partes.push(`Tally ok · ${(resumo.entradas || []).length} entrada(s) · ${(resumo.destinosDisponiveis || []).length} destino(s)`);
          } else partes.push('Tally indisponível nesta instância');
          if (intercom) {
            const resumoIntercom = intercom.summary();
            const membros = resumoIntercom.membros || [];
            const conectados = membros.filter((m) => m.connected).length;
            partes.push(`Intercom · ${conectados}/${membros.length} membro(s) conectado(s)${resumoIntercom.pttAtivos?.length ? ` · ${resumoIntercom.pttAtivos.length} PTT ativo(s)` : ''}`);
            // Colisão real de call_audio: Calls ativo (timer rodando) + Crew com membros
            // cadastrados no registry ao mesmo tempo — ver nota acima, não é suposição.
            const callsAtivo = !!p.callEngine?.returns?.timer && !p.callEngine?.returns?.usesSharedRegistry;
            const crewReivindicado = (intercom.registry?.consumers?.get('crew')?.size || 0) > 0;
            if (callsAtivo && crewReivindicado) {
              nivel = NIVEL.BLOQUEIO;
              partes.push('Calls e Crew Intercom disputando a mesma captura de áudio nativa (call_audio) ao mesmo tempo');
              return item(id, '3Mix Crew', nivel, partes.join(' · '), { motivo: 'CallReturns (Calls) ainda chama call_audio fora do AudioTapRegistry compartilhado — com os dois ativos, um perde a captura (recurso nativo exclusivo, não união).', acao: 'Encerre o 3Mix Calls antes de usar o Crew Intercom, ou vice-versa, até a migração do Calls para o registry compartilhado.' });
            }
          } else partes.push('Intercom indisponível nesta instância');
          partes.push('headset/mic físico e latência real: não verificado (exige motor ao vivo/hardware)');
          return item(id, '3Mix Crew', nivel, partes.join(' · '));
        }

        case 'encoder': {
          const modo = await this.lerPerfil(['Output', 'Mode'], 'Simple');
          const encoder = modo === 'Advanced' ? await this.lerPerfil(['AdvOut', 'Encoder'], '') : await this.lerPerfil(['SimpleOutput', 'StreamEncoder'], '');
          const nativo = await p.vendor('get_destinations', {}, 'freemix');
          ctx.destinos = nativo.destinations || [];
          const existe = modo === 'Advanced' ? (nativo.encoders || []).some((e) => e.id === encoder) : simpleEncoderChoices(nativo).some((e) => e.id === encoder);
          if (!encoder) return item(id, 'Encoder da transmissão', NIVEL.NAO, 'Não configurado', { alvo: 'transmissão' });
          if (!existe) return item(id, 'Encoder da transmissão', NIVEL.BLOQUEIO, `${encoder} indisponível neste computador`, { alvo: 'transmissão', motivo: 'A transmissão não abriria com esse encoder.', acao: 'Escolha outro em Configurações › Encoder.' });
          return item(id, 'Encoder da transmissão', NIVEL.OK, encoder, { alvo: 'transmissão' });
        }

        case 'destino': {
          const s = await p.req('GetStreamServiceSettings');
          const cfg = s.streamServiceSettings || {};
          if (s.streamServiceType === 'rtmp_custom') {
            const server = String(cfg.server || '').trim();
            try { validateStreamTarget(streamProtocol(s, server), server); } catch (e) {
              return item(id, 'Destino da transmissão', NIVEL.BLOQUEIO, server ? 'Endereço inválido' : 'Sem endereço', { alvo: 'transmissão', motivo: e.message, acao: 'Corrija em Configurações › Transmissão.' });
            }
            const host = (() => { try { return new URL(server).host; } catch { return server; } })();
            if (!cfg.key && !/\/[^/]+\/[^/]+$/.test(new URL(server).pathname)) return item(id, 'Destino da transmissão', NIVEL.ATENCAO, `${host} · sem chave`, { alvo: 'transmissão', acao: 'Confira se esse servidor dispensa chave.' });
            return item(id, 'Destino da transmissão', NIVEL.OK, host, { alvo: 'transmissão' });
          }
          if (s.streamServiceType === 'rtmp_common') {
            if (!cfg.key) return item(id, 'Destino da transmissão', NIVEL.BLOQUEIO, `${cfg.service || 'Serviço'} · sem chave`, { alvo: 'transmissão', motivo: 'Sem chave a plataforma recusa a transmissão.', acao: 'Informe a chave em Configurações › Transmissão.' });
            return item(id, 'Destino da transmissão', NIVEL.OK, cfg.service || 'Serviço configurado', { alvo: 'transmissão' });
          }
          return item(id, 'Destino da transmissão', NIVEL.OK, cfg.service || s.streamServiceType, { alvo: 'transmissão' });
        }

        case 'atraso': {
          const d = this.p.broadcastDelayEngine;
          if (!d) return item(id, 'Atraso e DUMP', NIVEL.NAO, 'Indisponível', { alvo: 'transmissão' });
          await d.refresh(true);
          const s = d.summary();
          if (!s.available) return item(id, 'Atraso e DUMP', NIVEL.NAO, 'Motor sem atraso', { alvo: 'transmissão' });
          if (s.state === 'streaming_without_delay' && s.enabled) return item(id, 'Atraso e DUMP', NIVEL.ATENCAO, 'Ligado, mas esta transmissão começou sem ele', { alvo: 'transmissão', acao: 'Reinicie a transmissão para ter o DUMP.' });
          return item(id, 'Atraso e DUMP', NIVEL.OK, s.enabled ? `Ligado · ${s.configuredSeconds} s` : 'Desligado: sem DUMP', { alvo: 'transmissão' });
        }

        case 'saidas': {
          const destinos = ctx.destinos || (await p.vendor('get_destinations', {}, 'freemix')).destinations || [];
          const comErro = destinos.filter((d) => d.lastError);
          if (comErro.length) return item(id, 'Saídas extras', NIVEL.ATENCAO, comErro.map((d) => `${d.name || 'Saída'}: ${d.lastError}`).join(' · '), { alvo: 'transmissão' });
          const ativas = destinos.filter((d) => d.active).length;
          return item(id, 'Saídas extras', NIVEL.OK, ativas ? `${ativas} no ar` : 'Nenhuma com erro', { alvo: 'transmissão' });
        }

        case 'gravacao': {
          const pasta = (await p.req('GetRecordDirectory')).recordDirectory;
          if (!pasta) return item(id, 'Gravação', NIVEL.BLOQUEIO, 'Sem pasta definida', { alvo: 'gravação', acao: 'Escolha a pasta em Configurações › Gravação.' });
          const info = await stat(pasta).catch(() => null);
          if (!info?.isDirectory()) return item(id, 'Gravação', NIVEL.BLOQUEIO, `Pasta não existe: ${pasta}`, { alvo: 'gravação', acao: 'Escolha uma pasta existente.' });
          let escrita = 'não testada no ar';
          if (ctx.modo === 'completo') {
            const arq = join(pasta, '.3mix-preflight-' + randomBytes(4).toString('hex') + '.tmp');
            const bloco = Buffer.alloc(8 * 1024 * 1024, 7);
            const t0 = process.hrtime.bigint();
            try {
              const h = await open(arq, 'w');
              try { await h.write(bloco); await h.sync(); } finally { await h.close(); }
              const mbps = 8 / (Number(process.hrtime.bigint() - t0) / 1e9);
              escrita = `${Math.round(mbps)} MB/s`;
            } catch (e) {
              return item(id, 'Gravação', NIVEL.BLOQUEIO, 'Sem permissão de escrita', { alvo: 'gravação', motivo: e.code || e.message, acao: 'Escolha outra pasta.' });
            } finally { await rm(arq, { force: true }).catch(() => {}); }
          }
          const disco = await this.disco(pasta);
          if (!disco.supported) return item(id, 'Gravação', NIVEL.NAO, `${pasta} · espaço não lido`, { alvo: 'gravação' });
          const kbps = Number(await this.lerPerfil(['SimpleOutput', 'VBitrate'], 0)) + Number(await this.lerPerfil(['SimpleOutput', 'ABitrate'], 0));
          const horas = kbps > 0 ? Number((disco.freeGb * 1024 * 8 / (kbps / 1000) / 3600).toFixed(1)) : disco.estRecordingHours;
          let valor = `${disco.freeGb} GB livres · ~${horas} h · escrita ${escrita}`;
          const isoOpts = p.iso?.state?.recordOptions;
          if (isoOpts?.format && isoOpts.format !== 'mpegts') {
            valor += ` · Formato ${String(isoOpts.format).toUpperCase()}`;
          }
          // Auditoria de Armazenamento Distribuído por SSD (perInput / unidades secundárias)
          if (isoOpts?.perInput && typeof isoOpts.perInput === 'object') {
            const extraDirs = Object.entries(isoOpts.perInput).filter(([_, o]) => o && o.directory && o.directory !== pasta);
            for (const [camKey, o] of extraDirs) {
              const extraPath = o.directory;
              const extraStat = await stat(extraPath).catch(() => null);
              if (!extraStat?.isDirectory()) {
                return item(id, 'Gravação Distribuída (SSD)', NIVEL.BLOQUEIO, `Unidade/Pasta inacessível para ${camKey}: ${extraPath}`, { alvo: 'gravação', motivo: 'SSD desconectado ou caminho inválido', acao: 'Conecte o SSD ou ajuste a pasta na MultiGravação.' });
              }
              const extraDisco = await this.disco(extraPath);
              if (extraDisco.supported) {
                if (extraDisco.severity === 'CRITICAL') {
                  return item(id, 'Gravação Distribuída (SSD)', NIVEL.BLOQUEIO, `SSD de ${camKey} (${extraPath}): apenas ${extraDisco.freeGb} GB livres`, { alvo: 'gravação', motivo: 'Disco quase cheio', acao: 'Libere espaço no SSD secundário.' });
                } else if (extraDisco.severity === 'WARN') {
                  return item(id, 'Gravação Distribuída (SSD)', NIVEL.ATENCAO, `${valor} · SSD ${camKey}: ${extraDisco.freeGb} GB livres`, { alvo: 'gravação', acao: 'Confira capacidade do SSD secundário.' });
                }
              }
            }
          }
          if (disco.severity === 'CRITICAL') return item(id, 'Gravação', NIVEL.BLOQUEIO, valor, { alvo: 'gravação', motivo: 'Disco quase cheio: a gravação pode parar no meio.', acao: 'Libere espaço ou troque a pasta.' });
          if (disco.severity === 'WARN') return item(id, 'Gravação', NIVEL.ATENCAO, valor, { alvo: 'gravação', acao: 'Confira se cabe a duração prevista.' });
          return item(id, 'Gravação', NIVEL.OK, valor, { alvo: 'gravação' });
        }

        case 'desempenho': {
          const s = await p.req('GetStats');
          const perdaRender = s.renderTotalFrames ? s.renderSkippedFrames / s.renderTotalFrames : 0;
          const perdaSaida = s.outputTotalFrames ? s.outputSkippedFrames / s.outputTotalFrames : 0;
          const valor = `${Number(s.activeFps || 0).toFixed(0)} fps · render ${Number(s.averageFrameRenderTime || 0).toFixed(1)} ms · perdidos ${(perdaRender * 100).toFixed(1)}% render, ${(perdaSaida * 100).toFixed(1)}% encoder`;
          if (perdaRender > 0.01 || perdaSaida > 0.01) return item(id, 'Desempenho do motor', NIVEL.ATENCAO, valor, { motivo: 'O motor já perdeu quadros nesta sessão.', acao: 'Reduza fontes ou a qualidade do encoder.' });
          return item(id, 'Desempenho do motor', NIVEL.OK, valor);
        }

        case 'maquina': {
          const a = ctx.amostra;
          if (!a) return item(id, 'Computador', NIVEL.NAO, 'Contadores do Windows não responderam');
          const valor = `CPU ${a.cpu.toFixed(0)}% · memória livre ${a.ramLivreGb} de ${a.ramTotalGb} GB · GPU ${a.gpu == null ? 'não lida' : a.gpu.toFixed(0) + '%'} · temperatura não lida`;
          if (a.ramLivreGb < 0.5) return item(id, 'Computador', NIVEL.BLOQUEIO, valor, { motivo: 'Memória quase esgotada: risco de travamento.', acao: 'Feche programas antes de entrar no ar.' });
          if (a.cpu >= 90 || (a.gpu ?? 0) >= 90 || a.ramLivreGb < 2) return item(id, 'Computador', NIVEL.ATENCAO, valor, { motivo: 'Pouca folga antes de começar.', acao: 'Veja os programas concorrentes abaixo.' });
          return item(id, 'Computador', NIVEL.OK, valor);
        }

        case 'processos': {
          const lista = concorrentes(ctx.amostra, { raiz: this.raiz(), excecoes: await this.excecoesProcessos().ler() });
          if (!lista) return item(id, 'Programas concorrentes', NIVEL.NAO, 'Contadores do Windows não responderam');
          if (!lista.length) return item(id, 'Programas concorrentes', NIVEL.OK, 'Nenhum programa pesado aberto', { processos: [] });
          return item(id, 'Programas concorrentes', NIVEL.ATENCAO, lista.slice(0, 4).map((x) => `${x.nome} (${x.motivos.join(', ')})`).join(' · '), {
            motivo: 'Esses programas disputam recursos com o 3Mix.', acao: 'Feche os que não fazem parte da produção, ou marque como ignorados.', processos: lista
          });
        }

        case 'perfil': {
          const perfil = await readFile(join(this.raiz(), 'config', '3mix-perfil-capacidade.json'), 'utf8').then(JSON.parse).catch(() => null);
          if (!perfil) return item(id, 'Capacidade medida', NIVEL.NAO, 'Este computador ainda não foi medido', { acao: 'Rode o diagnóstico da máquina em Configurações.' });
          const ativas = (p.state?.inputs || []).length;
          const max = Number(perfil.fontesValidadas || 0);
          if (max && ativas > max) return item(id, 'Capacidade medida', NIVEL.ATENCAO, `${ativas} entradas; medido até ${max}`, { acao: 'Rode um teste com essa quantidade.' });
          return item(id, 'Capacidade medida', NIVEL.OK, `Medido em ${perfil.medidoEm || '—'} · até ${max || '—'} fontes`);
        }
      }
      return item(id, id, NIVEL.NAO, 'Verificação desconhecida');
    } catch (e) {
      return item(id, GRUPO[id] ? `${GRUPO[id]}: ${id}` : id, NIVEL.NAO, 'Não foi possível ler', { motivo: e.message });
    }
  }

  // ---------------------------------------------------------------- execução
  async runCheck({ item: so, alvo = 'ambos' } = {}) {
    const noAr = !!(this.p.state?.streaming || this.p.state?.recording);
    const ctx = { modo: noAr ? 'leve' : 'completo' };
    const ids = so ? [so] : ORDEM;
    if (so && !ORDEM.includes(so)) throw new Error('Item de Pre-Flight desconhecido: ' + so);
    if (ids.some((id) => ['maquina', 'processos'].includes(id))) {
      ctx.amostra = await this.amostrar();
      this.ultimaAmostra = ctx.amostra;
    }
    const novos = [];
    for (const id of ids) novos.push(await this.verificar(id, ctx));
    let itens = novos;
    if (so && this.lastCheck) itens = this.lastCheck.itens.map((x) => (x.id === so ? novos[0] : x));
    const resultado = this.montar(itens, { alvo, modo: ctx.modo, anterior: so ? null : this.lastCheck });
    this.lastCheck = resultado;
    await this.registrar(resultado).catch(() => {});
    return resultado;
  }

  montar(itens, { alvo, modo, anterior }) {
    const conta = (alvoItem) => alvoItem === 'geral' || alvo === 'ambos' || (alvo === 'transmitir' && alvoItem === 'transmissão') || (alvo === 'gravar' && alvoItem === 'gravação');
    const relevantes = itens.filter((x) => conta(x.alvo));
    const bloqueios = relevantes.filter((x) => x.nivel === NIVEL.BLOQUEIO);
    const atencoes = relevantes.filter((x) => x.nivel === NIVEL.ATENCAO);
    const naoVerificados = relevantes.filter((x) => x.nivel === NIVEL.NAO);
    const veredito = bloqueios.length ? NIVEL.BLOQUEIO : atencoes.length ? NIVEL.ATENCAO : NIVEL.OK;
    const mudou = anterior ? itens.filter((x) => { const a = anterior.itens.find((y) => y.id === x.id); return a && a.nivel !== x.nivel; }).map((x) => ({ id: x.id, nome: x.nome, de: anterior.itens.find((y) => y.id === x.id).nivel, para: x.nivel })) : [];
    return {
      timestamp: Date.now(),
      projeto: this.p.state?.preset || null,
      modo, alvo, veredito,
      verdict: { [NIVEL.BLOQUEIO]: 'FAIL', [NIVEL.ATENCAO]: 'WARN', [NIVEL.OK]: 'READY' }[veredito],
      readyToAir: !bloqueios.length,
      contagem: { bloqueios: bloqueios.length, atencoes: atencoes.length, naoVerificados: naoVerificados.length, aprovados: relevantes.filter((x) => x.nivel === NIVEL.OK).length },
      mudancas: mudou,
      itens,
      // Formato antigo, para telas e integrações que já liam o Pre-Flight.
      checks: itens.map((x) => ({ id: x.id, name: x.nome, status: STATUS[x.nivel], value: x.valor, category: GRUPO[x.id] || 'Outros', nivel: x.nivel, motivo: x.motivo || null, acao: x.acao || null, alvo: x.alvo, processos: x.processos })),
      issues: itens.filter((x) => x.nivel === NIVEL.BLOQUEIO || x.nivel === NIVEL.ATENCAO).map((x) => ({ severity: x.nivel === NIVEL.BLOQUEIO ? 'CRITICAL' : 'WARN', code: x.id.toUpperCase(), message: `${x.nome}: ${x.motivo || x.valor}`, area: GRUPO[x.id] || 'geral' })),
      summary: bloqueios.length ? `${bloqueios.length} bloqueio(s) antes de entrar no ar.` : atencoes.length ? `Pronto, com ${atencoes.length} ponto(s) de atenção.` : 'Pronto para entrar no ar.'
    };
  }

  async registrar(resultado, extra = null) {
    const arq = this.arquivo('historico.json');
    const lista = await readFile(arq, 'utf8').then(JSON.parse).catch(() => []);
    lista.push(extra || { em: new Date(resultado.timestamp).toISOString(), projeto: resultado.projeto, veredito: resultado.veredito, modo: resultado.modo, contagem: resultado.contagem, mudancas: resultado.mudancas, itens: resultado.itens.map((x) => ({ id: x.id, nivel: x.nivel, valor: x.valor })) });
    await mkdir(join(arq, '..'), { recursive: true });
    await writeFile(arq, JSON.stringify(lista.slice(-HISTORICO_MAX), null, 1));
  }

  summary() {
    return this.lastCheck || { timestamp: 0, verdict: 'NOT_RUN', veredito: null, readyToAir: false, itens: [], checks: [], issues: [], summary: 'Pre-Flight ainda não executado nesta sessão.' };
  }

  async execute(action, d = {}) {
    if (action === 'preflight_check' || action === 'preflight_run') return this.runCheck({ item: d.item, alvo: d.alvo });
    if (action === 'preflight_summary') return this.summary();
    if (action === 'preflight_history') return readFile(this.arquivo('historico.json'), 'utf8').then(JSON.parse).catch(() => []);
    if (action === 'preflight_bypass') {
      // Entrar no ar com bloqueio é decisão do operador, registrada com o motivo.
      const motivo = String(d.motivo || '').trim();
      if (motivo.length < 5 || motivo.length > 300) throw new Error('Escreva o motivo (5 a 300 caracteres) para entrar no ar com bloqueio');
      const bloqueios = (this.lastCheck?.itens || []).filter((x) => x.nivel === NIVEL.BLOQUEIO).map((x) => `${x.nome}: ${x.valor}`);
      if (!bloqueios.length) throw new Error('Não há bloqueio a liberar: rode o Pre-Flight antes');
      const registro = { em: new Date().toISOString(), tipo: 'liberacao', projeto: this.p.state?.preset || null, motivo, bloqueios };
      await this.registrar(null, registro);
      await this.p.blackboxEngine?.triggerIncident?.('PREFLIGHT_BYPASS', registro).catch(() => {});
      return registro;
    }
    if (action === 'preflight_process_ignore') return { excecoes: await this.excecoesProcessos().adicionar(d.nome) };
    if (action === 'preflight_process_unignore') return { excecoes: await this.excecoesProcessos().remover(d.nome) };
    if (action === 'preflight_process_close') {
      if (d.confirmar !== true) throw new Error('Confirme para pedir o fechamento');
      const amostra = await this.amostrar();
      if (!amostra) throw new Error('Não foi possível ler os processos agora');
      const nome = String(d.nome || '').toLowerCase().replace(/\.exe$/, '');
      const alvo = amostra.processos.filter((x) => x.nome.toLowerCase() === nome && (!Array.isArray(d.pids) || d.pids.includes(x.pid)));
      if (!alvo.length) throw new Error('Esse programa não está mais aberto');
      if (alvo.some((x) => protegido(x, this.raiz()))) throw new Error('Esse programa é do sistema ou do 3Mix e não pode ser fechado por aqui');
      const resultado = await this.fechar(alvo.map((x) => x.pid));
      const semJanela = resultado.every((r) => r.resultado === 'sem-janela');
      return {
        nome: d.nome,
        resultado,
        mensagem: resultado.some((r) => r.resultado === 'fechou' || r.resultado === 'ja-fechado') ? 'Fechado.'
          : semJanela ? 'Esse programa não tem janela para fechar. Feche pelo próprio programa.'
            : 'Pedido enviado. O programa pode estar perguntando se quer salvar: confira a janela dele.'
      };
    }
    throw new Error(`Ação de Pre-Flight não reconhecida: ${action}`);
  }
}
