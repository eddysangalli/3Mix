// Prepara uma versão no canal: manifesto assinado em canal-atualizacoes/<canal>/ (vai para o GitHub Pages) e arquivos por hash em --assets (vão para a Release).
// Uso: --package=PASTA_SELADA --base=MANIFESTO_DA_BASE --key=CHAVE_PRIVADA --channel=beta|stable [--canal=PASTA] [--assets=PASTA] [--files-base=URL]
// Estável exige --aprovar-estavel=VERSAO e --aprovado-por=NOME, e a mesma numeração já publicada no canal beta.
// O manifesto é cumulativo: quem está em qualquer versão anterior chega à nova com um único pacote, e o atualizador só baixa o que falta.
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)]; }));
for (const k of ['package', 'base', 'key', 'channel']) if (!args[k]) throw Error('Falta --' + k);
if (!['beta', 'stable'].includes(args.channel)) throw Error('Canal inválido');
const pkg = resolve(args.package), canalRaiz = resolve(args.canal || join(repo, 'canal-atualizacoes')), canal = join(canalRaiz, args.channel);
const SITE = (args.site || 'https://eddysangalli.github.io/3Mix').replace(/\/+$/, '');
const FORA = /^config\/|^gravacoes\/|^capturas\/|^originais\/|^painel\/local\.js$|^updates\/|^manifest\.(json|sig)$|^installation\.json$|^uninstall-files\.json$/i;

const novo = JSON.parse(await readFile(join(pkg, 'manifest.json'), 'utf8'));
const base = JSON.parse(await readFile(resolve(args.base), 'utf8'));
const versao = JSON.parse(await readFile(join(pkg, 'version.json'), 'utf8')).version;
if (versao !== novo.version) throw Error('version.json diverge do manifesto do pacote');
const estavel = /^\d+\.\d+\.\d+$/.test(versao);
if (args.channel === 'stable' && !estavel) throw Error(`${versao} é versão de teste e não pode ir para o canal estável`);
if (args.channel === 'beta' && estavel) throw Error(`${versao} não tem sufixo de teste; use o canal estável, com aprovação`);

// Promoção ao estável nunca é automática: aprovação nominal da versão exata, e a mesma numeração precisa já ter passado pelo beta.
let aprovacao = null;
if (args.channel === 'stable') {
  if (args['aprovar-estavel'] !== versao || !args['aprovado-por']) throw Error(`Promover ao estável exige --aprovar-estavel=${versao} e --aprovado-por=NOME`);
  const historico = join(canalRaiz, 'beta', 'historico.json');
  const passou = existsSync(historico) && JSON.parse(await readFile(historico, 'utf8')).some((h) => h.versao.split('-')[0] === versao);
  if (!passou) throw Error(`${versao} ainda não passou pelo canal beta`);
  aprovacao = { format: 1, versao, aprovadoPor: args['aprovado-por'], em: new Date().toISOString() };
}

const hashBase = new Map(base.files.map((f) => [f.path, f.sha256]));
// O que mudou contra a base, mais o que já esteve em um pacote anterior: um arquivo que volta ao conteúdo original também precisa chegar a quem recebeu a versão intermediária.
const historicoPath = join(canal, 'historico.json');
const historico = existsSync(historicoPath) ? JSON.parse(await readFile(historicoPath, 'utf8')) : [];
if (historico.some((h) => h.versao === versao)) throw Error(`${versao} já foi publicada neste canal. Toda entrega nova leva número novo.`);
const jaPublicados = new Set(historico.flatMap((h) => h.caminhos || []));
const arquivos = novo.files.filter((f) => !FORA.test(f.path) && (hashBase.get(f.path) !== f.sha256 || jaPublicados.has(f.path) || f.path.toLowerCase() === 'version.json'));
if (!arquivos.some((f) => f.path.toLowerCase() === 'version.json')) throw Error('Pacote sem version.json');

// Novidades vêm do changelog que já foi para o pacote. Vão assinadas junto do manifesto.
const textoNovidades = await readFile(join(pkg, 'painel/remoto/novidades.js'), 'utf8').catch(() => '');
const dados = textoNovidades ? JSON.parse(textoNovidades.replace(/^window\.NOVIDADES_3MIX = /, '').replace(/;\s*$/, '')) : { versoes: [] };
const novidades = dados.versoes.filter((v) => v.versao === versao);
if (!novidades.length) throw Error(`A versão ${versao} não tem seção no changelog do pacote`);

const tag = '3mix-v' + versao;
const filesBase = args['files-base'] || `https://github.com/eddysangalli/3Mix/releases/download/${tag}/`;
const manifesto = Buffer.from(JSON.stringify({ format: 1, version: versao, channel: args.channel, base: base.version, filesBaseUrl: filesBase, assetNaming: 'sha256', novidades, files: arquivos.map(({ path, size, sha256 }) => ({ path, size, sha256 })) }, null, 1));
const assinatura = sign(null, manifesto, createPrivateKey(await readFile(resolve(args.key))));
// Confere com a chave pública do próprio pacote antes de publicar: o que sai daqui é o que o programa aceita.
if (!verify(null, manifesto, createPublicKey(await readFile(join(pkg, 'update-public.pem'))), assinatura)) throw Error('A chave usada não corresponde a update-public.pem do pacote');

const assets = resolve(args.assets || join(repo, '..', 'entregas', 'canal-assets', tag));
// Validate every selected payload before changing existing publication assets.
for (const f of arquivos) {
  const bytes=await readFile(join(pkg,f.path));
  if(bytes.length!==f.size||createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw Error('Arquivo diverge do manifesto: '+f.path);
}
await mkdir(assets, { recursive: true });
for (const f of arquivos) {
  const bytes=await readFile(join(pkg,f.path));
  if(bytes.length!==f.size||createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw Error('Arquivo diverge do manifesto: '+f.path);
  await writeFile(join(assets,f.sha256),bytes,{flag:'wx'}).catch(async error=>{
    if(error.code!=='EEXIST')throw error;
    const existing=await readFile(join(assets,f.sha256));
    if(!existing.equals(bytes))throw Error('Asset existente diverge do hash: '+f.path);
  });
}

const pasta = join(canal, 'releases', versao);
await mkdir(join(canal, 'releases'), { recursive: true });
await mkdir(pasta); // Never remove previous releases or replace a pre-existing version.
await writeFile(join(pasta, 'manifest.json'), manifesto);
await writeFile(join(pasta, 'manifest.sig'), assinatura);
const u = `${SITE}/${args.channel}/releases/${versao}/`;
await writeFile(join(canal, 'feed.json'), JSON.stringify({ format: 1, channel: args.channel, version: versao, manifestUrl: u + 'manifest.json', signatureUrl: u + 'manifest.sig' }, null, 1) + '\n');
historico.push({ versao, em: new Date().toISOString(), caminhos: arquivos.map((f) => f.path) });
await writeFile(historicoPath, JSON.stringify(historico, null, 1) + '\n');
if (aprovacao) await writeFile(join(canal, 'APROVACAO.json'), JSON.stringify(aprovacao, null, 1) + '\n');

const total = arquivos.reduce((n, f) => n + f.size, 0);
console.log(JSON.stringify({ versao, canal: args.channel, tag, arquivos: arquivos.length, megabytes: +(total / 1048576).toFixed(1), assets }));
