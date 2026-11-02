// Copia o estado commitado do motor (freemix-app, com os submódulos) para motor/ neste repositório.
// Assim as fontes do painel e do motor ficam juntas. Só copia o que está em commit; recusa alteração pendente.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const origem = process.env.FREEMIX_ENGINE_SOURCE ? resolve(process.env.FREEMIX_ENGINE_SOURCE) : resolve(repo, '../freemix-app');
const destino = join(repo, 'motor');
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();

if (!existsSync(join(origem, '.git'))) throw Error('Motor não encontrado em ' + origem);
const pendente = git(origem, 'status', '--porcelain', '--untracked-files=no');
if (pendente) throw Error('O motor tem alteração sem commit; faça o commit antes:\n' + pendente);
const head = git(origem, 'rev-parse', 'HEAD');

// Em cada submódulo, o commit que o motor referencia.
const submodulos = git(origem, 'submodule', 'status').split('\n').filter(Boolean).map((linha) => {
  const [hash, caminho] = linha.trim().replace(/^[-+U]/, '').split(/\s+/);
  return { hash, caminho };
});

const temp = mkdtempSync(join(repo, '.motor-tmp-'));
function extrair(cwd, ref, alvo) {
  mkdirSync(alvo, { recursive: true });
  const tar = join(temp, 'parte.tar');
  execFileSync('git', ['-C', cwd, 'archive', '--format=tar', '-o', tar, ref], { maxBuffer: 16 * 1024 * 1024 });
  execFileSync('tar', ['-xf', tar.replace(/\\/g, '/'), '--force-local', '-C', alvo.replace(/\\/g, '/')], { maxBuffer: 16 * 1024 * 1024 });
  rmSync(tar);
}
try {
  const novo = join(temp, 'motor');
  extrair(origem, head, novo);
  for (const s of submodulos) extrair(join(origem, s.caminho), s.hash, join(novo, s.caminho));
  rmSync(join(novo, '.gitmodules'), { force: true });
  writeFileSync(join(novo, 'ORIGEM.txt'), [
    'Fontes do motor nativo do 3Mix, baseado em OBS Studio/libobs (GPL).',
    'Commit de origem: ' + head,
    ...submodulos.map((s) => s.caminho + ': ' + s.hash),
    'Atualizado por scripts/distribuicao/publicar-motor-no-repo.mjs.',
    '',
  ].join('\n'));
  rmSync(destino, { recursive: true, force: true });
  execFileSync('cmd', ['/c', 'move', novo, destino], { stdio: 'ignore' });
} finally {
  rmSync(temp, { recursive: true, force: true });
}
console.log(JSON.stringify({ head, submodulos: submodulos.length, destino }));
