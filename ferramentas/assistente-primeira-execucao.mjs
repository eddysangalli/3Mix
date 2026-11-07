/**
 * 3Mix Studio - Assistente de Primeira Execução
 * 
 * Módulo independente do instalador, reutiliza as APIs de diagnóstico existentes.
 * Fluxo: Boas-vindas → Diagnóstico → Módulos → Config AV → Primeiro Projeto → Pronto
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { 
  inventario, testarEncoders, testarDisco, testarRede, 
  descobrirOnvif, controladoresConectados,
  lerPerfil, salvarPerfil, precisaRevalidar
} from './diagnostico-maquina.mjs';

const ARQUIVO_ESTADO = (raiz) => join(raiz, 'config', '3mix-primeira-execucao.json');
const ETAPAS_ASSISTENTE = [
  'boas-vindas',
  'diagnostico', 
  'modulos',
  'config-av',
  'primeiro-projeto',
  'pronto'
];

export const ETAPAS_ASSISTENTE_LABELS = {
  'boas-vindas': 'Bem-vindo ao 3Mix',
  'diagnostico': 'Diagnóstico do Computador',
  'modulos': 'Módulos do 3Mix',
  'config-av': 'Configuração Audiovisual',
  'primeiro-projeto': 'Primeiro Projeto',
  'pronto': 'Pronto para Produzir'
};

const ARQUIVO_ESTADO_ASSISTENTE = (raiz) => join(raiz, 'config', '3mix-primeira-execucao.json');

async function lerEstado(raiz) {
  try { 
    const data = await import('node:fs/promises').then(m => m.readFile(join(raiz, 'config', '3mix-primeira-execucao.json'), 'utf8'));
    return JSON.parse(data);
  } catch { 
    return { etapas: {}, concluidoEm: null }; 
  }
}

async function gravarEstado(raiz, estado) {
  const { mkdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { writeFile } = await import('node:fs/promises');
  await mkdir(join(raiz, 'config'), { recursive: true });
  await writeFile(join(raiz, 'config', '3mix-primeira-execucao.json'), JSON.stringify(estado, null, 1));
  return estado;
}

export async function getEstadoAssistente(raiz) {
  return lerEstado(raiz);
}

export async function avancarEtapa(raiz, etapa, dados = {}) {
  const estado = await lerEstado(raiz);
  if (!estado.etapas) estado.etapas = {};
  estado.etapas[etapa] = { 
    situacao: 'feita', 
    em: new Date().toISOString(),
    dados
  };
  return gravarEstado(raiz, estado);
}

export async function pularEtapa(raiz, etapa) {
  const estado = await lerEstado(raiz);
  if (!estado.etapas) estado.etapas = {};
  estado.etapas[etapa] = { 
    situacao: 'adiada', 
    em: new Date().toISOString() 
  };
  return gravarEstado(raiz, estado);
}

export async function concluirAssistente(raiz) {
  const estado = await lerEstado(raiz);
  // Only mark equipment as validated if diagnostics were completed successfully
  const diagnosticoCompleto = estado.etapas?.diagnostico?.situacao === 'feita';
  if (!diagnosticoCompleto) {
    throw new Error('Não é possível concluir: diagnóstico não foi completado');
  }
  // Verify that diagnostic results were actually saved to profile
  const { lerPerfil } = await import('./diagnostico-maquina.mjs');
  const perfil = await lerPerfil(raiz);
  const temInventario = perfil?.inventario?.cpu?.nome;
  const temEncoders = Array.isArray(perfil?.encoders) && perfil.encoders.length > 0;
  const temDisco = perfil?.disco?.escritaMBs != null;
  const temRede = Array.isArray(perfil?.rede) && perfil.rede.length > 0;
  if (!temInventario || !temEncoders || !temDisco || !temRede) {
    throw new Error('Não é possível concluir: resultados do diagnóstico incompletos no perfil');
  }
  estado.concluidoEm = new Date().toISOString();
  estado.equipamentoValidado = true;
  return gravarEstado(raiz, estado);
}

export async function reiniciarAssistente(raiz) {
  return gravarEstado(raiz, { etapas: {}, concluidoEm: null });
}

export async function getStatusAssistente(raiz) {
  const estado = await lerEstado(raiz);
  return {
    concluido: !!estado.concluidoEm,
    concluidoEm: estado.concluidoEm,
    etapas: estado.etapas || {},
    equipamentoValidado: estado.equipamentoValidado || false
  };
}

export const ETAPAS_ASSISTENTE_LIST = [
  { id: 'boas-vindas', label: 'Bem-vindo ao 3Mix', obrigatoria: true },
  { id: 'diagnostico', label: 'Diagnóstico do Computador', obrigatoria: true },
  { id: 'modulos', label: 'Módulos do 3Mix', obrigatoria: true },
  { id: 'config-av', label: 'Configuração Audiovisual', obrigatoria: true },
  { id: 'primeiro-projeto', label: 'Primeiro Projeto', obrigatoria: true },
  { id: 'pronto', label: 'Pronto para Produzir', obrigatoria: true }
];

export async function executarDiagnosticoCompleto(raiz, production, { signal, aoProgresso } = {}) {
  const resultados = {};
  
  // 1. Inventário de hardware
  if (aoProgresso) aoProgresso('Coletando inventário de hardware...');
  const inv = await import('./diagnostico-maquina.mjs').then(m => m.inventario());
  await import('./diagnostico-maquina.mjs').then(m => m.salvarPerfil(raiz, { inventario: inv }));
  const revalidar = await import('./diagnostico-maquina.mjs').then(m => m.precisaRevalidar(raiz, inv));
  resultados.inventario = inv;
  resultados.revalidar = revalidar;

  // 2. Testar encoders
  if (signal?.aborted) throw new Error('cancelado');
  // Use the 3Mix runtime FFmpeg path
  const ffmpeg = join(raiz, 'runtime', 'ffmpeg.exe');
  const encoders = await import('./diagnostico-maquina.mjs').then(m => m.testarEncoders(ffmpeg, { signal, aoProgresso }));
  await import('./diagnostico-maquina.mjs').then(m => m.salvarPerfil(raiz, { encoders: encoders }));
  resultados.encoders = encoders;

  // 3. Disco - use a safe test directory under raiz
  if (signal?.aborted) throw new Error('cancelado');
  const testDir = join(raiz, 'diagnostico-temp');
  await mkdir(testDir, { recursive: true });
  const discoResult = await import('./diagnostico-maquina.mjs').then(m => m.testarDisco(testDir, { mb: 512, signal }));
  await import('./diagnostico-maquina.mjs').then(m => m.salvarPerfil(raiz, { disco: discoResult }));
  resultados.disco = discoResult;

  // 4. Rede
  if (signal?.aborted) throw new Error('cancelado');
  const redeResult = await import('./diagnostico-maquina.mjs').then(m => m.testarRede({ externo: false }));
  await import('./diagnostico-maquina.mjs').then(m => m.salvarPerfil(raiz, { rede: redeResult }));
  resultados.rede = redeResult;

  // 5. Equipamentos (ONVIF + controladores)
  if (signal?.aborted) throw new Error('cancelado');
  const [onvif, controladores] = await Promise.all([
    import('./diagnostico-maquina.mjs').then(m => m.descobrirOnvif({ ms: 3000 })),
    import('./diagnostico-maquina.mjs').then(m => m.controladoresConectados())
  ]);
  await import('./diagnostico-maquina.mjs').then(m => m.salvarPerfil(raiz, { equipamentos: { 
    em: new Date().toISOString(), 
    cameras: onvif.cameras?.length || 0, 
    ptz: 0, 
    controladores: controladores.map(c => c.nome) 
  }}));
  resultados.equipamentos = { onvif, controladores };

  return resultados;
}