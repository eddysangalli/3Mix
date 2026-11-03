// Pacote de mídia para o teste de capacidade, gerado no próprio computador pelo ffmpeg:
// barras, padrões, movimento, contador de quadros e tom de referência. Nada de terceiros, nada baixado.
// Cada clipe é um arquivo diferente (padrão e semente próprios), para que N fontes custem N decodificações.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const VERSAO_PACOTE = 1;
const PADROES = ['testsrc2', 'smptehdbars', 'mandelbrot', 'rgbtestsrc', 'cellauto', 'life', 'testsrc', 'pal100bars'];

/** Clipes do pacote: 'basico' (4 x 1080p30) e 'completo' (16, com 1080p60, 720p, HEVC e 4K). */
export function clipes(conjunto = 'basico') {
  const base = Array.from({ length: 4 }, (_, i) => ({ nome: `fhd30-h264-${i + 1}`, largura: 1920, altura: 1080, fps: 30, codec: 'h264', mbps: 8, padrao: PADROES[i] }));
  if (conjunto === 'basico') return base;
  const mais = [];
  for (let i = 0; i < 4; i++) mais.push({ nome: `fhd60-h264-${i + 1}`, largura: 1920, altura: 1080, fps: 60, codec: 'h264', mbps: 12, padrao: PADROES[(i + 4) % PADROES.length] });
  for (let i = 0; i < 4; i++) mais.push({ nome: `hd30-h264-${i + 1}`, largura: 1280, altura: 720, fps: 30, codec: 'h264', mbps: 5, padrao: PADROES[(i + 2) % PADROES.length] });
  for (let i = 0; i < 2; i++) mais.push({ nome: `fhd30-hevc-${i + 1}`, largura: 1920, altura: 1080, fps: 30, codec: 'hevc', mbps: 6, padrao: PADROES[(i + 5) % PADROES.length] });
  for (let i = 0; i < 2; i++) mais.push({ nome: `uhd30-h264-${i + 1}`, largura: 3840, altura: 2160, fps: 30, codec: 'h264', mbps: 35, padrao: PADROES[(i + 1) % PADROES.length] });
  return [...base, ...mais];
}

const fonteSistema = () => ['C:/Windows/Fonts/consola.ttf', 'C:/Windows/Fonts/arial.ttf'].find(existsSync) || null;

function argumentos(c, saida, segundos) {
  const tamanho = `${c.largura}x${c.altura}`;
  const fonte = fonteSistema();
  // Contador de quadros e nome queimados na imagem, para conferir sincronismo e queda de quadros.
  const texto = fonte ? `,drawtext=fontfile='${fonte.replace(':', '\\:')}':text='${c.nome} %{frame_num}':x=40:y=40:fontsize=${Math.round(c.altura / 14)}:fontcolor=white:box=1:boxcolor=black@0.6` : '';
  const caixa = `,drawbox=x='mod(t*${200 + c.fps * 3}\\,iw-160)':y=ih/2:w=160:h=160:color=white@0.8:t=fill`;
  const origem = c.padrao === 'life' || c.padrao === 'cellauto' ? `${c.padrao}=size=${tamanho}:rate=${c.fps}` : `${c.padrao}=size=${tamanho}:rate=${c.fps}`;
  return ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', origem,
    '-f', 'lavfi', '-i', `sine=frequency=${440 + c.nome.length * 37}:sample_rate=48000`,
    '-t', String(segundos),
    '-vf', `format=yuv420p${caixa}${texto}`,
    '-c:v', c.codec === 'hevc' ? 'libx265' : 'libx264', '-preset', 'veryfast', '-b:v', `${c.mbps}M`, '-maxrate', `${c.mbps}M`, '-bufsize', `${c.mbps * 2}M`, '-g', String(c.fps * 2),
    ...(c.codec === 'hevc' ? ['-tag:v', 'hvc1', '-x265-params', 'log-level=error'] : []),
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', saida];
}

const sha256 = (arq) => new Promise((resolve, reject) => { const h = createHash('sha256'); createReadStream(arq).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject); });

export const pastaPacote = (raiz) => join(raiz, 'diagnostico', 'midia');

/** Gera (ou reaproveita, se os hashes batem) o pacote. Cancela com sinal. */
export async function prepararPacote(raiz, ffmpeg, { conjunto = 'basico', segundos = 10, sinal, aoProgresso } = {}) {
  if (!existsSync(ffmpeg)) throw new Error('ffmpeg do 3Mix não encontrado em ' + ffmpeg + '. Reinstale o 3Mix.');
  const pasta = pastaPacote(raiz);
  await mkdir(pasta, { recursive: true });
  const manifestoArq = join(pasta, 'manifesto.json');
  const anterior = await readFile(manifestoArq, 'utf8').then(JSON.parse).catch(() => ({ arquivos: [] }));
  const lista = clipes(conjunto), arquivos = [];
  for (const [i, c] of lista.entries()) {
    if (sinal?.aborted) throw new Error('cancelado');
    const arq = join(pasta, c.nome + '.mp4');
    const visto = anterior.versao === VERSAO_PACOTE && anterior.arquivos.find((a) => a.nome === c.nome);
    if (visto && existsSync(arq) && (await sha256(arq)) === visto.sha256) { arquivos.push(visto); continue; }
    aoProgresso?.(`Gerando mídia ${i + 1} de ${lista.length}: ${c.nome}`);
    await new Promise((resolve, reject) => {
      const p = spawn(ffmpeg, argumentos(c, arq, segundos), { windowsHide: true });
      let erro = '';
      p.stderr.on('data', (d) => { erro += d; });
      const parar = () => p.kill();
      sinal?.addEventListener('abort', parar, { once: true });
      p.on('error', (e) => { sinal?.removeEventListener('abort', parar); reject(new Error('ffmpeg não abriu: ' + e.message)); });
      p.on('close', (code) => { sinal?.removeEventListener('abort', parar); code === 0 ? resolve() : reject(new Error(`ffmpeg falhou em ${c.nome}: ${erro.slice(0, 200)}`)); });
    });
    arquivos.push({ ...c, arquivo: c.nome + '.mp4', bytes: (await stat(arq)).size, sha256: await sha256(arq) });
  }
  const manifesto = { versao: VERSAO_PACOTE, conjunto, geradoEm: new Date().toISOString(), origem: 'Gerado localmente pelo ffmpeg (padrões lavfi); sem conteúdo de terceiros.', arquivos: [...arquivos, ...anterior.arquivos.filter((a) => !arquivos.some((b) => b.nome === a.nome))] };
  await writeFile(manifestoArq, JSON.stringify(manifesto, null, 1));
  return { pasta, arquivos: arquivos.map((a) => ({ ...a, caminho: join(pasta, a.arquivo) })), totalMb: Math.round(arquivos.reduce((s, a) => s + a.bytes, 0) / 1048576) };
}

/** Confere os hashes de todos os arquivos do pacote. */
export async function conferirPacote(raiz) {
  const pasta = pastaPacote(raiz);
  const manifesto = await readFile(join(pasta, 'manifesto.json'), 'utf8').then(JSON.parse).catch(() => null);
  if (!manifesto) return { existe: false };
  const falhas = [];
  for (const a of manifesto.arquivos) { const arq = join(pasta, a.arquivo); if (!existsSync(arq) || (await sha256(arq)) !== a.sha256) falhas.push(a.nome); }
  return { existe: true, arquivos: manifesto.arquivos.length, falhas, totalMb: Math.round(manifesto.arquivos.reduce((s, a) => s + a.bytes, 0) / 1048576) };
}

export async function removerPacote(raiz) {
  await rm(pastaPacote(raiz), { recursive: true, force: true });
  return { removido: true };
}
