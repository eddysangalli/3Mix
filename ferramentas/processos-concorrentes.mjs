// Programas que disputam CPU, GPU ou memória com o 3Mix. Só informa: nada é encerrado sem o operador pedir,
// e mesmo assim só com pedido de fechamento normal (como o X da janela), nunca forçado.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// Sistema, drivers, segurança e o próprio 3Mix: nunca aparecem como candidatos a fechar.
const PROTEGIDOS = new Set(['system', 'registry', 'smss', 'csrss', 'wininit', 'services', 'lsass', 'lsaiso', 'svchost', 'winlogon', 'dwm', 'explorer',
  'fontdrvhost', 'memory compression', 'audiodg', 'spoolsv', 'sihost', 'taskhostw', 'ctfmon', 'runtimebroker', 'searchhost', 'searchindexer',
  'startmenuexperiencehost', 'shellexperiencehost', 'textinputhost', 'securityhealthservice', 'securityhealthsystray', 'msmpeng', 'nissrv',
  'mpdefendercoreservice', 'smartscreen', 'wmiprvse', 'conhost', 'dllhost', 'wudfhost', 'dashost', 'lsm', 'powershell', 'pwsh', 'cmd',
  'freemix', '3mix', 'obs-browser-page', 'obs-ffmpeg-mux', 'freemix-network-setup']);
const PREFIXOS_PROTEGIDOS = ['nv', 'nvidia', 'amd', 'radeon', 'atiesrxx', 'atieclxx', 'igfx', 'intel', 'rtk', 'realtek', 'msedgewebview2', 'windows'];

const CONHECIDOS = [
  [/^vmix/i, 'Switcher de vídeo (vMix)'], [/^obs(64|32)?$/i, 'Outro OBS'], [/^adobe premiere pro$/i, 'Editor de vídeo (Premiere)'],
  [/^afterfx$/i, 'After Effects'], [/^resolve$/i, 'DaVinci Resolve'], [/^adobe media encoder$/i, 'Exportação de vídeo (Media Encoder)'],
  [/^handbrake/i, 'Conversão de vídeo (HandBrake)'], [/^blender$/i, 'Renderização 3D (Blender)'], [/^(chrome|msedge|firefox|brave|opera)$/i, 'Navegador'],
  [/^ffmpeg$/i, 'Codificação de vídeo (ffmpeg)'], [/^(steam|epicgameslauncher)$/i, 'Jogos'], [/^(onedrive|dropbox|googledrivefs)$/i, 'Sincronização de arquivos']
];
const PROGRAMAS_DE_VIDEO = /^(vmix|obs(64|32)?$|adobe premiere pro|afterfx|resolve|adobe media encoder|handbrake|blender|ffmpeg)/i;

export const LIMITES = { cpu: 15, gpu: 15, ramMb: 2000, videoCpu: 5, videoGpu: 5 };

const normal = (nome) => String(nome || '').toLowerCase().replace(/\.exe$/, '');

/** Processo do próprio 3Mix ou essencial: nunca oferecer encerramento. */
export function protegido(processo, raiz) {
  const nome = normal(processo.nome);
  if (PROTEGIDOS.has(nome) || PREFIXOS_PROTEGIDOS.some((p) => nome.startsWith(p))) return true;
  const caminho = String(processo.caminho || '').replace(/\\/g, '/').toLowerCase();
  if (raiz && caminho.startsWith(String(raiz).replace(/\\/g, '/').toLowerCase())) return true;
  if (!caminho && processo.pid <= 4) return true;
  return caminho.includes('/windows/system32/') || caminho.includes('/windows/syswow64/');
}

/** Agrupa por programa e devolve só o que pode atrapalhar, com o motivo. */
export function concorrentes(amostra, { raiz, excecoes = [] } = {}) {
  if (!amostra) return null;
  const ignorados = new Set(excecoes.map(normal));
  const grupos = new Map();
  for (const p of amostra.processos) {
    const nome = normal(p.nome);
    if (protegido(p, raiz) || ignorados.has(nome)) continue;
    // Mesmo nome com executáveis diferentes são programas diferentes.
    const chave = nome + '|' + String(p.caminho || '').toLowerCase();
    const g = grupos.get(chave) || { nome: p.nome, pids: [], cpu: 0, gpu: 0, ramMb: 0, caminho: p.caminho };
    g.pids.push(p.pid); g.cpu += p.cpu; g.gpu = Math.min(100, g.gpu + p.gpu); g.ramMb += p.ramMb;
    grupos.set(chave, g);
  }
  const lista = [];
  for (const g of grupos.values()) {
    const video = PROGRAMAS_DE_VIDEO.test(g.nome);
    const motivos = [];
    if (g.cpu >= (video ? LIMITES.videoCpu : LIMITES.cpu)) motivos.push(`CPU ${g.cpu.toFixed(0)}%`);
    if (g.gpu >= (video ? LIMITES.videoGpu : LIMITES.gpu)) motivos.push(`GPU ${g.gpu.toFixed(0)}%`);
    if (g.ramMb >= LIMITES.ramMb) motivos.push(`${(g.ramMb / 1024).toFixed(1)} GB de memória`);
    if (!motivos.length) continue;
    lista.push({
      nome: g.nome,
      tipo: CONHECIDOS.find(([re]) => re.test(g.nome))?.[1] || 'Programa',
      pids: g.pids.sort((a, b) => a - b),
      cpu: Number(g.cpu.toFixed(1)), gpu: Number(g.gpu.toFixed(1)), ramMb: g.ramMb,
      caminho: g.caminho || null,
      motivos
    });
  }
  return lista.sort((a, b) => (b.cpu + b.gpu) - (a.cpu + a.gpu) || b.ramMb - a.ramMb);
}

/** Exceções do operador: programas legítimos da produção que não devem ser apontados. */
export class ExcecoesProcessos {
  constructor(arquivo) { this.arquivo = arquivo; this.lista = null; }
  async ler() {
    if (this.lista) return this.lista;
    try { this.lista = JSON.parse(await readFile(this.arquivo, 'utf8')).excecoes || []; } catch { this.lista = []; }
    return this.lista;
  }
  async adicionar(nome) {
    const n = String(nome || '').trim();
    if (!n || n.length > 120 || /[\\/:*?"<>|]/.test(n)) throw new Error('Nome de programa inválido');
    const lista = await this.ler();
    if (!lista.some((x) => normal(x) === normal(n))) lista.push(n);
    await mkdir(dirname(this.arquivo), { recursive: true });
    await writeFile(this.arquivo, JSON.stringify({ excecoes: lista }, null, 1));
    return lista;
  }
  async remover(nome) {
    this.lista = (await this.ler()).filter((x) => normal(x) !== normal(nome));
    await mkdir(dirname(this.arquivo), { recursive: true });
    await writeFile(this.arquivo, JSON.stringify({ excecoes: this.lista }, null, 1));
    return this.lista;
  }
}

export const arquivoExcecoes = (raiz) => join(raiz, 'config', 'obs-studio', 'plugin_config', 'freemix-preflight', 'excecoes-processos.json');
