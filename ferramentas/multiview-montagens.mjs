// Montagens do Multiview: o que aparece em cada monitor, em que posição, em qual formato de tela.
// Arquivo próprio em config/, gravado de forma atômica e sempre validado: a página nunca escreve dados soltos no disco.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const MONITORES = { horizontal: [1920, 1080], vertical: [1080, 1920] };
const TIPOS = new Set(['programa', 'preview', 'auto', 'entrada', 'relogio', 'vazio']);
const FORMATOS = new Set(['16:9', '9:16', 'livre']);
const AJUSTES = new Set(['caber', 'preencher']);
const MODOS_RELOGIO = new Set(['hora', 'gravacao', 'transmissao', 'contagem']);
const MAX_MONTAGENS = 16, MAX_TILES = 48;

const texto = (v, max) => String(v ?? '').slice(0, max);
const numero = (v, min, max, padrao) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao; };
const opcao = (v, set, padrao) => (set.has(v) ? v : padrao);

function limparTile(t, W, H, i) {
  const w = numero(t?.w, 60, W, 480), h = numero(t?.h, 40, H, 270);
  const tipo = opcao(t?.tipo, TIPOS, 'vazio');
  const limpo = {
    id: texto(t?.id, 40) || 't' + i, tipo, entrada: tipo === 'entrada' ? texto(t?.entrada, 200) : '',
    x: numero(t?.x, 0, W - w, 0), y: numero(t?.y, 0, H - h, 0), w, h,
    formato: opcao(t?.formato, FORMATOS, '16:9'), ajuste: opcao(t?.ajuste, AJUSTES, 'preencher'),
    nome: t?.nome !== false, vu: t?.vu !== false,
  };
  if (tipo === 'relogio') {
    const r = t?.relogio || {};
    limpo.relogio = { modo: opcao(r.modo, MODOS_RELOGIO, 'hora'), fuso: numero(r.fuso, -14, 14, 0), ate: /^\d{2}:\d{2}$/.test(r.ate) ? r.ate : '', titulo: texto(r.titulo, 40) };
  }
  return limpo;
}

export function limparMontagens(raw) {
  const lista = Array.isArray(raw?.montagens) ? raw.montagens.slice(0, MAX_MONTAGENS) : [];
  if (!lista.length) throw new Error('Nenhuma montagem para salvar');
  const vistos = new Set();
  const montagens = lista.map((m, i) => {
    const monitor = m?.monitor === 'vertical' ? 'vertical' : 'horizontal';
    const [W, H] = MONITORES[monitor];
    let id = texto(m?.id, 40) || 'm' + i;
    if (vistos.has(id)) id += '-' + i;
    vistos.add(id);
    return { id, nome: texto(m?.nome, 60) || 'Montagem ' + (i + 1), monitor, guias: m?.guias === true, tiles: (Array.isArray(m?.tiles) ? m.tiles.slice(0, MAX_TILES) : []).map((t, n) => limparTile(t, W, H, n)) };
  });
  return { ativa: vistos.has(raw?.ativa) ? raw.ativa : montagens[0].id, montagens };
}

const arquivo = (root) => join(root, 'config', 'multiview-montagens.json');

export async function lerMontagens(root) {
  try { return limparMontagens(JSON.parse(await readFile(arquivo(root), 'utf8'))); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

export async function salvarMontagens(root, raw) {
  const limpo = limparMontagens(raw), destino = arquivo(root), temporario = destino + '.tmp';
  await mkdir(join(root, 'config'), { recursive: true });
  await writeFile(temporario, JSON.stringify(limpo, null, 2));
  await rename(temporario, destino);
  return limpo;
}
