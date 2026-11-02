import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * ModulosConfig — seleção de módulos opcionais em standby.
 *
 * Guarda, por instalação (não por projeto/cena), quais módulos avançados o
 * operador decidiu usar. Um módulo desligado não deve pollar o motor nem
 * aparecer na mesa (integração com controle-producao.mjs/servidor-api.mjs/
 * mesa.html é trabalho futuro, pendente de decisão + QA; ver
 * qa-beta/recibos/design-modulos-standby.md secao 5).
 *
 * Padrão de arquivo: mesmo princípio de config/3mix-workspace.json
 * (workspace-config.mjs) — JSON plano em config/, escrita atômica via
 * arquivo temporário + rename, ausência do arquivo = comportamento atual
 * preservado (aqui, todos os módulos ativos, igual a hoje).
 *
 * Esta ferramenta não é importada por servidor-api.mjs, controle-producao.mjs
 * nem por nenhuma tela do painel. Fica pronta e testada, mas desconectada do
 * runtime em produção até uma decisão explícita de integração.
 */

export const MODULOS_SCHEMA_VERSION = 1;

// Metadados em linguagem de operador, reaproveitáveis por uma futura tela de
// Configurações (painel) ou pela tela de módulos do instalador (Setup.cs).
export const MODULOS_DEFINICAO = Object.freeze({
  replay: {
    rotulo: 'Replay',
    descricao: 'Replay com marcação IN/OUT e volta ao vivo. Desligado, o motor deixa de ser consultado todo segundo pelo ticker de status.'
  },
  rundown: {
    rotulo: 'Rundown',
    descricao: 'Roteiro de produção em blocos e passos. Desligado, some o botão Roteiro e a tela correspondente.'
  },
  calls: {
    rotulo: 'Calls e Retornos N-1',
    descricao: 'Chamada de vídeo com retorno mix-minus para repórteres e convidados. Desligado, somem as telas de Calls e Retornos SRT/N-1.'
  },
  multiview: {
    rotulo: 'Multiview',
    descricao: 'Grade com todas as câmeras numa tela só. Desligado, o resumo de multiview deixa de ser calculado e enviado a cada atualização de estado.'
  },
  iso: {
    rotulo: 'ISO (multigravação por entrada)',
    descricao: 'Gravação isolada de cada entrada. Desligado, o motor deixa de ser consultado todo segundo pelo ticker de status.'
  },
  dataSources: {
    rotulo: 'Fontes de Dados',
    descricao: 'Planilhas e feeds externos ligados a títulos e placares. Desligado, nenhuma consulta HTTP de fonte de dados roda em segundo plano.'
  },
  srtHdr: {
    rotulo: 'SRT/NDI avançado (HDR)',
    descricao: 'Transmissão HDR (PQ/HLG) sobre SRT/OMT/NDI. Desligado, some a complexidade de seleção de encoder HEVC e transferência HDR.'
  },
  blackbox: {
    rotulo: 'Caixa-Preta de Incidentes',
    descricao: 'Registro forense dos últimos 60 segundos antes de uma falha. Desligado, some o botão/tela; nenhuma telemetria extra é retida.'
  },
  broadcastDelay: {
    rotulo: 'Broadcast Delay',
    descricao: 'Atraso de segurança com corte imediato (DUMP) para censura ao vivo. Desligado, nenhum buffer de pacotes é mantido.'
  }
});

export const MODULOS_IDS = Object.freeze(Object.keys(MODULOS_DEFINICAO));

function valoresPadrao() {
  return Object.fromEntries(MODULOS_IDS.map(id => [id, true]));
}

function arquivoModulos(root) {
  return join(root, 'config', 'modulos-ativos.json');
}

/**
 * Valida um objeto de módulos ativos: só aceita as chaves conhecidas, cada
 * valor deve ser booleano. Lança erro explícito em vez de ignorar chave
 * desconhecida ou tipo errado (mesmo padrão de workspace-config.mjs).
 */
export function validarModulos(valores) {
  if (!valores || typeof valores !== 'object' || Array.isArray(valores)) {
    throw new Error('Seleção de módulos inválida');
  }
  const chavesInvalidas = Object.keys(valores).filter(k => !MODULOS_IDS.includes(k));
  if (chavesInvalidas.length) {
    throw new Error('Módulo desconhecido: ' + chavesInvalidas.join(', '));
  }
  for (const id of MODULOS_IDS) {
    if (id in valores && typeof valores[id] !== 'boolean') {
      throw new Error('Módulo ' + id + ': valor deve ser true ou false');
    }
  }
  return { ...valoresPadrao(), ...valores };
}

/**
 * Devolve o objeto de módulos ativos ({ replay: true, rundown: false, ... }).
 * Se o arquivo ainda não existir, devolve todos os módulos ativos — ninguém
 * perde funcionalidade que já tinha hoje só porque este arquivo passou a
 * existir no projeto.
 */
export async function modulosAtivos(root) {
  if (!root || typeof root !== 'string') throw new Error('Raiz da instalação não informada');
  const file = arquivoModulos(root);
  let dados;
  try {
    dados = JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return valoresPadrao();
    throw new Error('Não foi possível ler a seleção de módulos salva; o arquivo foi preservado.');
  }
  if (dados.schema !== MODULOS_SCHEMA_VERSION || !dados.modulos) {
    throw new Error('Formato de seleção de módulos inválido em ' + file);
  }
  return validarModulos(dados.modulos);
}

/**
 * Grava a seleção de módulos ativos. Escrita atômica (arquivo temporário +
 * rename), mesmo padrão usado em fila-producao.mjs, controlador-producao.mjs
 * e clonar-preset.mjs.
 */
export async function salvarModulosAtivos(root, valores) {
  if (!root || typeof root !== 'string') throw new Error('Raiz da instalação não informada');
  const modulos = validarModulos(valores);
  const dir = join(root, 'config');
  const file = arquivoModulos(root);
  const registro = {
    schema: MODULOS_SCHEMA_VERSION,
    modulos,
    atualizadoEm: new Date().toISOString()
  };
  await mkdir(dir, { recursive: true });
  const temporario = file + '.tmp';
  await writeFile(temporario, JSON.stringify(registro, null, 2));
  await rename(temporario, file);
  return registro;
}

/**
 * Atalho de leitura só do mapa de metadados (rótulo/descrição), para uma
 * futura tela de instalador/Configurações listar os módulos sem precisar
 * reimplementar os textos.
 */
export function listarDefinicaoModulos() {
  return MODULOS_IDS.map(id => ({ id, ...MODULOS_DEFINICAO[id] }));
}
