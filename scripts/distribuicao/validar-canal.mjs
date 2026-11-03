// Valida o que vai para o site do canal, antes de publicar. Roda no GitHub Actions e localmente, sem dependências.
// Recusa arquivo fora do canal, manifesto sem assinatura válida e versão de teste no estável. A chave privada nunca entra aqui.
import { createPublicKey, verify } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const raiz = resolve(process.argv[2] || join(repo, 'canal-atualizacoes')), chave = createPublicKey(readFileSync(process.argv[3] || join(repo, 'update-public.pem')));
const erros = [];
const PERMITIDOS = /^(index\.html|(stable|beta)\/(feed\.json|historico\.json|APROVACAO\.json)|(stable|beta)\/releases\/[^/]+\/manifest\.(json|sig))$/;
function percorrer(d) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) percorrer(p); else { const r = relative(raiz, p).replaceAll('\\', '/'); if (!PERMITIDOS.test(r)) erros.push('Arquivo não permitido no site: ' + r); } } }
percorrer(raiz);
const RELEASE = 'https://github.com/eddysangalli/3Mix/releases/download/';
const resultado = {};
for (const canal of ['stable', 'beta']) {
  const feedPath = join(raiz, canal, 'feed.json');
  if (!existsSync(feedPath)) { erros.push(`Canal ${canal} sem feed.json`); continue; }
  const feed = JSON.parse(readFileSync(feedPath, 'utf8'));
  resultado[canal] = feed.version;
  if (feed.format !== 1 || feed.channel !== canal || typeof feed.version !== 'string') erros.push(`Feed de ${canal} inválido`);
  const suffixed = /-(alpha|beta)$/.test(feed.version || '');
  if (canal === 'stable' && suffixed) erros.push(`Versão de teste ${feed.version} no canal estável`);
  if (canal === 'beta' && !suffixed && feed.manifestUrl) erros.push(`Versão sem sufixo ${feed.version} no canal beta`);
  if (!feed.manifestUrl) continue;
  const pasta = join(raiz, canal, 'releases', feed.version);
  if (!existsSync(join(pasta, 'manifest.json')) || !existsSync(join(pasta, 'manifest.sig'))) { erros.push(`${canal}: manifesto de ${feed.version} ausente`); continue; }
  const bruto = readFileSync(join(pasta, 'manifest.json')), assinatura = readFileSync(join(pasta, 'manifest.sig'));
  if (!verify(null, bruto, chave, assinatura)) { erros.push(`${canal}: assinatura inválida em ${feed.version}`); continue; }
  const m = JSON.parse(bruto);
  if (m.version !== feed.version || m.channel !== canal) erros.push(`${canal}: manifesto diverge do feed`);
  if (!String(m.filesBaseUrl).startsWith(RELEASE + '3mix-v' + m.version + '/')) erros.push(`${canal}: arquivos fora da Release desta versão`);
  if (!Array.isArray(m.novidades) || !m.novidades.length) erros.push(`${canal}: versão sem novidades`);
  if (canal === 'stable') {
    const ap = join(raiz, 'stable', 'APROVACAO.json');
    const a = existsSync(ap) ? JSON.parse(readFileSync(ap, 'utf8')) : null;
    if (a?.versao !== feed.version || !a?.aprovadoPor) erros.push(`Estável ${feed.version} sem aprovação registrada`);
  }
}
console.log(JSON.stringify(resultado));
if (erros.length) { for (const e of erros) console.error('ERRO ' + e); process.exit(1); }
console.log('canal válido');
