// Gera painel/remoto/novidades.js a partir de docs/CHANGELOG.md, a única fonte do histórico que aparece em Sobre.
// Com --exigir=VERSAO, recusa a versão que não tem seção no changelog: nenhuma entrega sai sem estar documentada.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const exigir = process.argv.find((a) => a.startsWith('--exigir='))?.slice(9);
const LF = String.fromCharCode(10);
const linhas = readFileSync(join(repo, 'docs/CHANGELOG.md'), 'utf8').split(String.fromCharCode(13)).join('').split(LF);
const versoes = [];
let atual = null;
for (const linha of linhas) {
  const titulo = linha.match(/^## (Alpha|Beta) (\d+\.\d+\.\d+)(?: · (.+))?$/);
  if (titulo) {
    atual = { versao: `${titulo[2]}-${titulo[1].toLowerCase()}`, nome: `${titulo[1]} ${titulo[2]}`, data: titulo[3] || '', itens: [] };
    versoes.push(atual);
  } else if (linha.startsWith('## ')) atual = null;
  else if (atual && linha.startsWith('- ')) atual.itens.push(linha.slice(2).trim());
}
if (!versoes.length) throw Error('O changelog não tem nenhuma seção "## Alpha x.y.z"');
for (const v of versoes) if (!v.itens.length) throw Error(`${v.nome} está sem itens no changelog`);
if (exigir && !versoes.some((v) => v.versao === exigir)) throw Error(`A versão ${exigir} não tem seção no changelog. Documente antes de empacotar.`);
writeFileSync(join(repo, 'painel/remoto/novidades.js'), 'window.NOVIDADES_3MIX = ' + JSON.stringify({ versoes }, null, 1) + ';' + LF);
console.log(JSON.stringify({ versoes: versoes.map((v) => v.nome), itens: versoes.reduce((n, v) => n + v.itens.length, 0) }));
