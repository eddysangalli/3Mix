// O manual da API (docs/API.md) não pode envelhecer calado.
// Roda o gerador do índice (scripts/documentacao/gerar-indice-api.mjs), grava docs/api/indice-acoes.json
// e FALHA se alguma rota, ação de /api/control, ação de rota própria, função vMix ou vendor request
// existente no código não aparecer no manual, ou se o índice gerado dentro do manual estiver desatualizado.
// Uso: runtime/node.exe ferramentas/test-manual-api.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { gerarIndice, indiceMarkdown, ARQ_INDICE, ARQ_MANUAL, MARCA_INICIO, MARCA_FIM, RAIZ } from '../scripts/documentacao/gerar-indice-api.mjs';

let falhas = 0;
const ok = (nome, condicao, detalhe = '') => { if (!condicao) falhas++; console.log((condicao ? 'PASSOU ' : 'FALHOU ') + nome + (detalhe ? ' · ' + detalhe : '')); };

const indice = gerarIndice();
mkdirSync(dirname(ARQ_INDICE), { recursive: true });
writeFileSync(ARQ_INDICE, JSON.stringify(indice, null, 2) + '\n');

// --manual <arquivo> permite conferir uma cópia (usado para provar que o teste falha quando falta algo).
const posManual = process.argv.indexOf('--manual');
const manual = posManual > 0 ? process.argv[posManual + 1] : ARQ_MANUAL;
ok('Manual existe', existsSync(manual), manual);
const md = existsSync(manual) ? readFileSync(manual, 'utf8') : '';
const mdMinusculo = md.toLowerCase();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Nome entre crases e sem continuar em outro identificador (evita `dump` casar com `delay_dump`).
const citado = (nome, texto = md) => new RegExp('`' + esc(nome) + '`').test(texto) || new RegExp('(^|[^A-Za-z0-9_-])' + esc(nome) + '(?![A-Za-z0-9_])', 'm').test(texto);

ok('Gerador encontrou rotas', indice.rotas.length >= 50, `${indice.rotas.length} rotas`);
ok('Gerador encontrou ações de /api/control', indice.controle.total >= 250, `${indice.controle.total} ações`);
ok('Gerador encontrou funções vMix', indice.vmix.funcoes.length >= 40, `${indice.vmix.funcoes.length} funções`);
ok('Gerador encontrou vendor requests', indice.vendor.requests.length >= 40, `${indice.vendor.requests.length} requests`);

const faltando = (lista, teste) => lista.filter((x) => !teste(x));
const rotas = faltando(indice.rotas.map((r) => r.path), (p) => md.includes('`' + p) || md.includes(p + '`') || md.includes(p + ' '));
ok('Toda rota HTTP do código está no manual', !rotas.length, rotas.join(', '));
const acoes = faltando(indice.controle.acoes.map((a) => a.action), (a) => citado(a));
ok('Toda ação de /api/control está no manual', !acoes.length, acoes.join(', '));
const porRota = Object.entries(indice.acoesPorRota).flatMap(([rota, lista]) => lista.filter((a) => !citado(a)).map((a) => rota + ':' + a));
ok('Toda ação de rota própria está no manual', !porRota.length, porRota.join(', '));
const vmix = faltando(indice.vmix.funcoes, (f) => mdMinusculo.includes(f.toLowerCase()));
ok('Toda função vMix está no manual', !vmix.length, vmix.join(', '));
const tcp = faltando([...indice.vmix.tcpComandos, ...indice.vmix.tcpAssinaturas], (c) => md.includes(c));
ok('Todo comando vMix TCP está no manual', !tcp.length, tcp.join(', '));
const vendor = faltando(indice.vendor.requests, (r) => citado(r.request) && md.includes(r.vendor)).map((r) => r.vendor + '/' + r.request);
ok('Todo vendor request do motor está no manual', !vendor.length, vendor.join(', '));
const ws = faltando(indice.websocket.servidorEnvia, (t) => citado(t));
ok('Toda mensagem do /ws está no manual', !ws.length, ws.join(', '));

// O índice gerado dentro do manual precisa bater com o código de agora (pega ação removida ou renomeada).
const i = md.indexOf(MARCA_INICIO), f = md.indexOf(MARCA_FIM);
ok('Manual tem as marcas do índice gerado', i >= 0 && f > i);
if (i >= 0 && f > i) {
  const atual = md.slice(i, f + MARCA_FIM.length).replace(/\r\n/g, '\n');
  ok('Índice gerado do manual está atualizado', atual === indiceMarkdown(indice), 'rode: node scripts/documentacao/gerar-indice-api.mjs --atualizar-manual e revise o manual');
}

// Versão curta para IAs aponta para o manual completo.
const llms = RAIZ + '/docs/api/llms.txt';
ok('docs/api/llms.txt existe e aponta para API.md', existsSync(llms) && readFileSync(llms, 'utf8').includes('API.md'));

console.log(falhas ? `FALHAS: ${falhas}` : 'TODOS PASSARAM');
process.exit(falhas ? 1 : 0);
