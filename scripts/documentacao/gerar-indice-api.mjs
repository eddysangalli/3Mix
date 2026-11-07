// Gera docs/api/indice-acoes.json a partir do código: rotas HTTP, páginas, ações de /api/control
// (por módulo e prefixo), ações aceitas por rotas próprias, funções da compatibilidade vMix
// (HTTP e TCP), mensagens do WebSocket e vendor requests do motor nativo.
//
// Uso:
//   node scripts/documentacao/gerar-indice-api.mjs                      grava docs/api/indice-acoes.json
//   node scripts/documentacao/gerar-indice-api.mjs --atualizar-manual   também reescreve o índice gerado dentro de docs/API.md
//   node scripts/documentacao/gerar-indice-api.mjs --stdout             só imprime o JSON
//
// Nada aqui executa o servidor ou fala com o motor: só lê arquivos-fonte.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FERR = join(RAIZ, 'ferramentas');
export const MOTOR = resolve(process.env.FREEMIX_MOTOR_SRC || join(RAIZ, '../3mix-engine'));
export const ARQ_INDICE = join(RAIZ, 'docs/api/indice-acoes.json');
export const ARQ_MANUAL = join(RAIZ, 'docs/API.md');
export const MARCA_INICIO = '<!-- indice-gerado:inicio -->';
export const MARCA_FIM = '<!-- indice-gerado:fim -->';

const ler = (f) => {
  const bytes = readFileSync(f);
  return bytes[0] === 0xff && bytes[1] === 0xfe
    ? bytes.toString('utf16le')
    : bytes.toString('utf8');
};
const rel = (f) => relative(RAIZ, f).replaceAll('\\', '/');
const unicos = (lista) => [...new Set(lista)].sort();
const todos = (texto, re, grupo = 1) => [...texto.matchAll(re)].map((m) => m[grupo]);
const strings = (trecho) => todos(trecho, /['"]([^'"]+)['"]/g);

/* ---------- Rotas HTTP ---------- */
function extrairRotas() {
  const arquivos = ['servidor-api.mjs', 'mix-effects-http.mjs', 'settings-read-http.mjs', 'workspace-config.mjs', 'projetos/runtime-admission.mjs', 'projetos/project-api-adapter.mjs'];
  const rotas = new Map();
  for (const nome of arquivos) {
    const f = join(FERR, nome);
    if (!existsSync(f)) continue;
    for (const r of todos(ler(f), /['"](\/api(?:\/[A-Za-z0-9._-]*)*\/?|\/ws)['"]/g)) {
      const caminho = r === '/api/' ? '/api' : r;
      if (!rotas.has(caminho)) rotas.set(caminho, rel(f));
    }
  }
  return [...rotas].map(([path, arquivo]) => ({ path, prefixo: path.endsWith('/') && path !== '/api', arquivo })).sort((a, b) => a.path.localeCompare(b.path));
}

function extrairPaginas() {
  const t = ler(join(FERR, 'servidor-api.mjs'));
  const bloco = /const routes=\{([^}]*)\}/.exec(t)?.[1] || '';
  return todos(bloco, /'(\/[^']*)':'([^']*)'/g).sort();
}

/* ---------- /api/control ---------- */
function importsDe(texto) {
  const mapa = {};
  for (const m of texto.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/([^']+)'/g))
    for (const nome of m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()).filter(Boolean)) mapa[nome] = m[2];
  return mapa;
}

function literaisComPrefixo(texto, prefixos) {
  const achados = [];
  for (const p of prefixos) {
    const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Literal usado só como nome de vendor request (vendor('call_audio',...)) não é ação.
    const literais = [...texto.matchAll(new RegExp(`(vendor\\(\\s*|requestType:\\s*)?['"](${esc}[a-z0-9_-]*)['"]`, 'g'))];
    const comoAcao = new Set(literais.filter((m) => !m[1]).map((m) => m[2]));
    achados.push(...comoAcao);
    achados.push(...todos(texto, new RegExp(`[{,\\s](${esc}[a-z0-9_]*)\\s*:\\s*(?:async\\s*)?\\(`, 'g')));
    // Ações montadas: action.slice('prefixo_'.length); if(![...].includes(...)) → prefixo_ + item.
    for (const m of texto.matchAll(new RegExp(`slice\\('(${esc}[a-z0-9_]*)'\\.length\\);if\\(!\\[([^\\]]*)\\]\\.includes`, 'g')))
      achados.push(...strings(m[2]).map((s) => m[1] + s));
  }
  // Normalização por prefixo: replace(/^playout_|^queue_/,'') seguido de act === 'x'.
  const norm = /replace\(\/\^([a-z]+_)\|\^([a-z]+_)\/,\s*''\)/.exec(texto);
  if (norm && prefixos.some((p) => p === norm[1] || p === norm[2]))
    for (const a of unicos(todos(texto, /act === '([a-z_0-9]+)'/g))) achados.push(norm[1] + a, norm[2] + a);
  return unicos(achados).filter((a) => !a.endsWith('_') && prefixos.some((p) => a.startsWith(p)));
}

function extrairControle() {
  const fonte = join(FERR, 'controle-producao.mjs');
  const t = ler(fonte);
  const imp = importsDe(t);
  // this.algo=new Classe(...) → arquivo
  const classes = {};
  for (const m of t.matchAll(/this\.(\w+)=new (\w+)\(/g)) classes[m[1]] = m[2];
  const corpoExecute = t.slice(t.indexOf('async execute(action,d)'), t.indexOf('statusXml()'));
  const acoes = [];
  const add = (action, modulo, arquivo, prefixo = null) => acoes.push({ action, modulo, arquivo, prefixo });

  // Despacho por prefixo.
  for (const linha of corpoExecute.split('\n')) {
    const prefixos = todos(linha, /action\.startsWith\('([a-z_]+)'\)/g);
    if (!prefixos.length) continue;
    const exatos = todos(linha, /action==='([a-z_]+)'/g).filter((a) => !prefixos.some((p) => a.startsWith(p)));
    const motor = /this\.(\w+)\.execute\(/.exec(linha)?.[1];
    const classe = classes[motor];
    const arquivo = classe && imp[classe] ? join(FERR, imp[classe]) : null;
    if (!arquivo) continue;
    let texto = ler(arquivo);
    // Um nível de módulos importados pelo motor (ex.: barramentos de áudio, operações de efeitos).
    for (const dep of Object.values(importsDe(texto))) { const f = join(dirname(arquivo), dep); if (existsSync(f)) texto += '\n' + ler(f); }
    for (const a of literaisComPrefixo(texto, prefixos)) add(a, classe, rel(arquivo), prefixos.join('|'));
    for (const a of exatos) add(a, classe, rel(arquivo), null);
  }
  // Ações diretas do switch e do caminho em tempo real.
  for (const a of todos(corpoExecute, /case '([a-z_]+)'/g)) add(a, 'Production', rel(fonte));
  const tempoReal = /if\(\[([^\]]*)\]\.includes\(action\)\)return this\.runRealtime/.exec(t);
  for (const a of strings(tempoReal?.[1] || '')) if (!acoes.some((x) => x.action === a)) add(a, 'Production (tempo real)', rel(fonte));
  // update_* é interceptado pelo servidor antes do Production.
  const srv = ler(join(FERR, 'servidor-api.mjs'));
  if (srv.includes("String(d.action).startsWith('update_')")) {
    const f = join(FERR, 'atualizacao-online.mjs');
    for (const a of literaisComPrefixo(ler(f), ['update_'])) add(a, 'OnlineUpdateEngine', rel(f), 'update_');
  }
  // Regras de "só neste computador" (HTTP e WebSocket), lidas do próprio servidor.
  const regraHttp = regraLocal(srv, /if\(path==='\/api\/control'&&req\.method==='POST'\)\{const d=await body\(req\);.*?if\((\(String\(d\.action\).*?)&&!local\(req\)\)return json\(res,403/s, 'd');
  const regraWs = regraLocal(srv, /m=JSON\.parse\(String\(raw\)\);if\((\(String\(m\.action\).*?)&&!local\(request\)\)throw/s, 'm');
  const updateLocal = /startsWith\('update_'\)\)\{if\(!local\(req\)\)/.test(srv);
  const vistos = new Map();
  for (const a of acoes) if (!vistos.has(a.action)) vistos.set(a.action, a);
  return [...vistos.values()].map((a) => ({
    ...a,
    somenteLocalHttp: (a.action.startsWith('update_') && updateLocal) || regraHttp(a.action),
    somenteLocalWs: regraWs(a.action),
    viaWebSocket: !a.action.startsWith('update_')
  })).sort((x, y) => x.action.localeCompare(y.action));
}

function regraLocal(srv, re, v) {
  const cond = re.exec(srv)?.[1] || '';
  const prefixos = todos(cond, new RegExp(`String\\(${v}\\.action\\)\\.startsWith\\('([a-z_]+)'\\)(?!&&!)`, 'g'));
  const excecoes = {};
  for (const m of cond.matchAll(new RegExp(`\\(String\\(${v}\\.action\\)\\.startsWith\\('([a-z_]+)'\\)&&!\\[([^\\]]*)\\]\\.includes`, 'g'))) excecoes[m[1]] = strings(m[2]);
  const exatos = [...todos(cond, new RegExp(`${v}\\.action==='([a-z_]+)'`, 'g'))];
  for (const m of cond.matchAll(new RegExp(`\\[([^\\]]*)\\]\\.includes\\(${v}\\.action\\)`, 'g'))) if (!/!\[/.test(cond.slice(Math.max(0, m.index - 2), m.index + 1))) exatos.push(...strings(m[1]));
  return (action) => exatos.includes(action) || prefixos.some((p) => action.startsWith(p)) || Object.entries(excecoes).some(([p, fora]) => action.startsWith(p) && !fora.includes(action));
}

/* ---------- Ações aceitas por rotas próprias ---------- */
function extrairAcoesPorRota() {
  const t = ler(join(FERR, 'servidor-api.mjs'));
  const porRota = {};
  const marcas = [...t.matchAll(/path==='(\/api[^']*)'/g)].map((m) => ({ i: m.index, path: m[1] }));
  for (const m of t.matchAll(/d\.action==='([a-z_]+)'/g)) {
    const dono = marcas.filter((x) => x.i < m.index).pop();
    if (!dono || dono.path === '/api/control') continue;
    (porRota[dono.path] ||= []).push(m[1]);
  }
  const iso = /if\(path==='\/api\/iso'\).*?if\(!\[([^\]]*)\]\.includes\(action\)\)/s.exec(t);
  if (iso) porRota['/api/iso'] = strings(iso[1]);
  const rep = ler(join(FERR, 'replay-disco.mjs'));
  const cmd = rep.slice(rep.indexOf('command(action, data = {})'), rep.indexOf('async status()'));
  porRota['/api/replay'] = unicos([...todos(cmd, /case "([a-z-]+)"/g), ...todos(cmd, /action==='([a-z-]+)'/g)]);
  const delay = ler(join(FERR, 'broadcast-delay.mjs'));
  porRota['/api/delay'] = unicos(todos(delay, /action === '([a-z_]+)'/g));
  const prefixoRota = { '/api/blackbox': ['blackbox-producao.mjs', 'blackbox_'], '/api/ducking': ['audio-ducking-engine.mjs', 'ducking_'], '/api/return-feeds': ['return-feed-producao.mjs', 'return_feed_'], '/api/overlays': ['overlays-producao.mjs', 'overlay_'], '/api/rundown': ['rundown-producao.mjs', 'rundown_'], '/api/preflight': ['preflight-producao.mjs', 'preflight_'] };
  for (const [rota, [arq, p]] of Object.entries(prefixoRota)) porRota[rota] = literaisComPrefixo(ler(join(FERR, arq)), [p]);
  porRota['/api/playout'] = literaisComPrefixo(ler(join(FERR, 'media-playout-engine.mjs')), ['playout_', 'queue_']);
  for (const k of Object.keys(porRota)) porRota[k] = unicos(porRota[k]);
  return Object.fromEntries(Object.entries(porRota).sort());
}

/* ---------- vMix ---------- */
function extrairVmix() {
  const t = ler(join(FERR, 'servidor-api.mjs'));
  const corpo = t.slice(t.indexOf('async function vmix('), t.indexOf('const routes='));
  const nomes = [];
  for (const m of corpo.matchAll(/\[([^\]]*)\]\.includes\(name\)/g)) nomes.push(...strings(m[1]));
  nomes.push(...todos(corpo, /name==='([a-z0-9]+)'/g));
  if (/\^overlayinput\[1-8\]\(in\|out\)\?\$/.test(corpo)) for (let n = 1; n <= 8; n++) nomes.push(`overlayinput${n}`, `overlayinput${n}in`, `overlayinput${n}out`);
  const replay = /const a=\{([^}]*)\}\[name\]/.exec(corpo);
  if (replay) nomes.push(...todos(replay[1], /(\w+):/g));
  const tcp = ler(join(FERR, 'vmix-tcp-api.mjs'));
  return {
    funcoes: unicos(nomes),
    tcpComandos: unicos(todos(tcp, /cmd === '([A-Z]+)'/g)),
    tcpAssinaturas: unicos(todos(tcp, /subType === '([A-Z]+)'/g))
  };
}

/* ---------- WebSocket do painel ---------- */
function extrairWs() {
  const t = ler(join(FERR, 'servidor-api.mjs'));
  return {
    servidorEnvia: unicos([...todos(t, /broadcast\(\{type:'([a-z_]+)'/g), ...todos(t, /send\(JSON\.stringify\(\{type:'([a-z_]+)'/g)]),
    acaoEspecial: unicos(todos(t, /m\.action==='([a-z_]+)'\?/g))
  };
}

/* ---------- Vendor requests do motor ---------- */
function arquivosFonte(dir, saida = []) {
  if (!existsSync(dir)) return saida;
  for (const nome of readdirSync(dir)) {
    if (/^(build|deps|\.deps|example|test|tests|docs|cmake|data)$/i.test(nome)) continue;
    const f = join(dir, nome);
    let s; try { s = statSync(f); } catch { continue; }
    if (s.isDirectory()) arquivosFonte(f, saida);
    else if (/\.(c|cpp|cc|mm)$/i.test(nome)) saida.push(f);
  }
  return saida;
}

function extrairVendor() {
  const lista = [];
  const subacoes = {};
  for (const f of [...arquivosFonte(join(MOTOR, 'frontend')), ...arquivosFonte(join(MOTOR, 'plugins'))]) {
    const t = ler(f);
    if (!t.includes('obs_websocket_register_vendor(')) continue;
    const vendor = /obs_websocket_register_vendor\(\s*"([^"]+)"\s*\)/.exec(t)?.[1];
    // Vendor de autoteste do próprio obs-websocket (test_register_vendor) não é API do 3Mix.
    if (!vendor || vendor === 'obs-websocket-test') continue;
    const reqs = todos(t, /obs_websocket_vendor_register_request\(\s*\w+\s*,\s*"([^"]+)"/g);
    for (const r of unicos(reqs)) lista.push({ vendor, request: r, arquivo: relative(join(MOTOR, '..'), f).replaceAll('\\', '/') });
    if (reqs.length === 1 && reqs[0] === 'control') subacoes[vendor] = unicos(todos(t, /action\s*[!=]=\s*"([a-z_]+)"/g));
  }
  lista.sort((a, b) => (a.vendor + a.request).localeCompare(b.vendor + b.request));
  return { requests: lista, subacoesControl: subacoes };
}

export function gerarIndice() {
  const controle = extrairControle();
  const porModulo = {};
  for (const a of controle) (porModulo[a.arquivo] ||= []).push(a.action);
  return {
    formato: 'indice-api-3mix',
    versao: 1,
    observacao: 'Gerado por scripts/documentacao/gerar-indice-api.mjs a partir do código. Não edite à mão.',
    rotas: extrairRotas(),
    paginas: extrairPaginas(),
    controle: { total: controle.length, acoes: controle, porArquivo: porModulo },
    acoesPorRota: extrairAcoesPorRota(),
    vmix: extrairVmix(),
    websocket: extrairWs(),
    vendor: extrairVendor()
  };
}

/** Markdown do índice completo, inserido entre as marcas em docs/API.md. */
export function indiceMarkdown(ind) {
  const l = [];
  l.push(MARCA_INICIO, '', `> Gerado automaticamente a partir do código (${ind.controle.total} ações de /api/control, ${ind.rotas.length} rotas, ${ind.vendor.requests.length} vendor requests). Atualize com \`node scripts/documentacao/gerar-indice-api.mjs --atualizar-manual\`.`, '');
  l.push('#### Ações de `/api/control` por arquivo-fonte', '', 'Legenda: **L** = só no computador do 3Mix pelo HTTP; **Lw** = só no computador do 3Mix pelo WebSocket `/ws`; **—** = aceito também de dispositivo pareado.', '');
  for (const [arq, lista] of Object.entries(ind.controle.porArquivo).sort()) {
    l.push(`- \`${arq}\`: ` + lista.sort().map((a) => {
      const x = ind.controle.acoes.find((y) => y.action === a);
      const marca = [x.somenteLocalHttp ? 'L' : '', x.somenteLocalWs ? 'Lw' : ''].filter(Boolean).join('/');
      return '`' + a + '`' + (marca ? ` (${marca})` : '');
    }).join(', '));
  }
  l.push('', '#### Ações aceitas por rotas próprias (campo `action` do corpo)', '');
  for (const [rota, lista] of Object.entries(ind.acoesPorRota)) l.push(`- \`${rota}\`: ` + lista.map((a) => '`' + a + '`').join(', '));
  l.push('', '#### Rotas HTTP encontradas no código', '');
  l.push(ind.rotas.map((r) => '`' + r.path + (r.prefixo ? '*' : '') + '`').join(', '));
  l.push('', 'Páginas do painel servidas pela mesma porta (HTML, não JSON): ' + ind.paginas.map((p) => '`' + p + '`').join(', ') + '.');
  l.push('', `Mensagens que o servidor envia pelo \`/ws\`: ${ind.websocket.servidorEnvia.map((t) => '`' + t + '`').join(', ')}. Ação especial do \`/ws\`: ${ind.websocket.acaoEspecial.map((t) => '`' + t + '`').join(', ')} (usa o campo \`cmd\`).`);
  l.push('', '#### Funções vMix aceitas (minúsculas; o nome não diferencia maiúsculas)', '');
  l.push(ind.vmix.funcoes.map((f) => '`' + f + '`').join(', '));
  l.push('', `Comandos TCP: ${ind.vmix.tcpComandos.map((c) => '`' + c + '`').join(', ')}. Assinaturas: ${ind.vmix.tcpAssinaturas.map((c) => '`' + c + '`').join(', ')}.`);
  l.push('', '#### Vendor requests do motor', '');
  const porVendor = {};
  for (const r of ind.vendor.requests) (porVendor[r.vendor] ||= []).push(r);
  for (const [v, reqs] of Object.entries(porVendor)) l.push(`- \`${v}\` (\`${reqs[0].arquivo}\`): ` + reqs.map((r) => '`' + r.request + '`').join(', ') + (ind.vendor.subacoesControl[v] ? `; ações de \`control\`: ${ind.vendor.subacoesControl[v].map((a) => '`' + a + '`').join(', ')}` : ''));
  l.push('', MARCA_FIM);
  return l.join('\n');
}

const cli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (cli) {
  const ind = gerarIndice();
  const json = JSON.stringify(ind, null, 2) + '\n';
  if (process.argv.includes('--stdout')) process.stdout.write(json);
  else {
    mkdirSync(dirname(ARQ_INDICE), { recursive: true });
    writeFileSync(ARQ_INDICE, json);
    console.log(`Índice gravado: ${rel(ARQ_INDICE)} · ${ind.rotas.length} rotas · ${ind.controle.total} ações de /api/control · ${ind.vmix.funcoes.length} funções vMix · ${ind.vendor.requests.length} vendor requests`);
  }
  if (process.argv.includes('--atualizar-manual')) {
    const md = ler(ARQ_MANUAL);
    const i = md.indexOf(MARCA_INICIO), f = md.indexOf(MARCA_FIM);
    if (i < 0 || f < 0) throw Error('Marcas do índice não encontradas em docs/API.md');
    writeFileSync(ARQ_MANUAL, md.slice(0, i) + indiceMarkdown(ind) + md.slice(f + MARCA_FIM.length));
    console.log('Índice do manual atualizado: ' + rel(ARQ_MANUAL));
  }
}
