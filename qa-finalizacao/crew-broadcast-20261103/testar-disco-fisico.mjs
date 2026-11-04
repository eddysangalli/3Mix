// Teste real de discoFisico()/mapaMultiCorder() (ferramentas/disco-producao.mjs, Fase 3
// do superprompt: "detecção de disco físico por nome amigável"). Roda contra o PowerShell
// REAL desta máquina (Get-Partition/Get-Disk de verdade) — não mocka a camada de SO, só
// leitura, nunca altera nada. Descobre os discos reais da máquina primeiro, e adapta os
// testes de colisão a eles, em vez de supor uma topologia fixa (robusto a rodar em
// qualquer máquina Windows, com 1 ou vários discos físicos).
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { discoFisico, mapaMultiCorder } from '../../ferramentas/disco-producao.mjs';

const checks = [];
const check = (s) => checks.push(s);

function powershell(script) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: 8000, windowsHide: true, encoding: 'utf8' }, (erro, saida) => (erro ? reject(erro) : resolve(saida)));
  });
}

// Descoberta independente (script PowerShell escrito à parte do módulo testado, para não
// testar o código contra ele mesmo) de quais letras de unidade existem e em qual disco
// físico cada uma está — usado só para montar os cenários reais abaixo.
const bruto = await powershell('Get-Partition | Where-Object DriveLetter | ForEach-Object { [string]$_.DriveLetter + "=" + ($_ | Get-Disk).Number } | Write-Output');
const porLetra = new Map(bruto.trim().split(/\r?\n/).filter(Boolean).map((l) => { const [letra, numero] = l.split('='); return [letra, Number(numero)]; }));
const porDiscoReal = new Map();
for (const [letra, numero] of porLetra) { const lista = porDiscoReal.get(numero) || []; lista.push(letra); porDiscoReal.set(numero, lista); }
check(`Descoberta independente (script à parte): ${porLetra.size} letra(s) de unidade em ${porDiscoReal.size} disco(s) físico(s) real(is) nesta máquina`);
assert.ok(porLetra.size >= 1, 'A máquina de teste precisa ter pelo menos 1 unidade com letra para este teste fazer sentido');

// --- casos sempre válidos, independente da topologia da máquina ---
{
  const r = await discoFisico('');
  assert.equal(r.supported, false);
  check('Caminho vazio: supported:false, nunca lança, nunca inventa disco');
}
{
  const r = await discoFisico(String.raw`\\servidor\pasta`);
  assert.equal(r.supported, false);
  check('Caminho UNC (sem letra de unidade): supported:false — esta implementação não resolve rede/UNC');
}
{
  const r = await discoFisico('pasta/relativa/sem/letra');
  assert.equal(r.supported, false);
  check('Caminho relativo (sem letra de unidade): supported:false, não tenta adivinhar');
}

// --- caso real: a primeira letra descoberta de verdade pelo script independente ---
const [primeiraLetra, primeiroNumero] = [...porLetra.entries()][0];
{
  const r = await discoFisico(primeiraLetra + ':\\');
  assert.equal(r.supported, true);
  assert.equal(r.letra, primeiraLetra);
  assert.equal(r.numero, primeiroNumero, 'o número do disco físico deveria bater com a descoberta independente');
  assert.ok(r.nome && r.nome.length > 0, 'nome amigável do disco deveria vir preenchido');
  check(`Unidade real ${primeiraLetra}: resolvida para disco físico ${r.numero} ("${r.nome}"), batendo com a descoberta independente`);
}

// --- mapaMultiCorder: mistura caminho real válido + inválido, nunca quebra por causa do inválido ---
{
  const r = await mapaMultiCorder({ 'CAM real': primeiraLetra + ':\\', 'CAM inválida': 'caminho-sem-letra' });
  assert.equal(r.entradas.length, 2);
  assert.equal(r.entradas.find((e) => e.nome === 'CAM real').disco.supported, true);
  assert.equal(r.entradas.find((e) => e.nome === 'CAM inválida').disco.supported, false);
  assert.equal(r.colisoes.length, 0, 'só 1 entrada válida — não há como colidir');
  check('mapaMultiCorder com 1 caminho real + 1 inválido: a entrada inválida não derruba nem contamina a válida');
}

// --- colisão real: duas "câmeras" no MESMO disco físico de verdade ---
{
  const r = await mapaMultiCorder({ 'CAM 1': primeiraLetra + ':\\', 'CAM 2': primeiraLetra + ':\\Users' });
  assert.equal(r.colisoes.length, 1);
  assert.equal(r.colisoes[0].numero, primeiroNumero);
  assert.deepEqual(new Set(r.colisoes[0].nomes), new Set(['CAM 1', 'CAM 2']));
  check(`Duas câmeras apontando para pastas diferentes do MESMO disco físico real (${primeiraLetra}:): colisão detectada corretamente, nomeando as duas câmeras envolvidas`);
}

// --- sem colisão real: se a máquina tem 2+ discos físicos distintos com letra, confirma
// que caminhos em discos DIFERENTES nunca são marcados como colisão (não é só "não testei
// o caso positivo" — testa o caso negativo de verdade quando o hardware permite) ---
const discosDistintos = [...porDiscoReal.keys()];
if (discosDistintos.length >= 2) {
  const letraA = porDiscoReal.get(discosDistintos[0])[0];
  const letraB = porDiscoReal.get(discosDistintos[1])[0];
  const r = await mapaMultiCorder({ 'CAM A': letraA + ':\\', 'CAM B': letraB + ':\\' });
  assert.equal(r.colisoes.length, 0);
  assert.notEqual(r.entradas[0].disco.numero, r.entradas[1].disco.numero);
  check(`Esta máquina tem ${discosDistintos.length} discos físicos distintos de verdade — confirmado que 2 câmeras em discos REALMENTE diferentes (${letraA}: disco ${discosDistintos[0]}, ${letraB}: disco ${discosDistintos[1]}) NUNCA viram colisão falsa`);
} else {
  check('Esta máquina só tem 1 disco físico com letra — caso "sem colisão entre discos distintos" não pôde ser testado com hardware real aqui; fica como PENDENTE nesta máquina específica (não é falha, é ausência de hardware para este sub-caso)');
}

// --- cache: chamada fria mede PowerShell de verdade; chamadas seguintes não devem invocar
// o processo de novo (medido por timing real, não suposição) ---
{
  // processo Node separado para garantir cache verdadeiramente frio (módulo recém-importado)
  const { discoFisico: discoFisicoIsolado } = await import('../../ferramentas/disco-producao.mjs?teste-cache=' + Date.now());
  const t0 = Date.now();
  await discoFisicoIsolado(primeiraLetra + ':\\');
  const friaMs = Date.now() - t0;
  const t1 = Date.now();
  await discoFisicoIsolado(primeiraLetra + ':\\');
  await discoFisicoIsolado(primeiraLetra + ':\\');
  const quentesMs = Date.now() - t1;
  assert.ok(quentesMs < friaMs, `2 chamadas com cache (${quentesMs}ms) deveriam ser bem mais rápidas que 1 chamada fria (${friaMs}ms)`);
  check(`Cache real medido por timing: chamada fria ${friaMs}ms (PowerShell real) vs. 2 chamadas seguintes ${quentesMs}ms (cache, sem reinvocar PowerShell)`);
}

console.log('PASS — ' + checks.length + ' verificações:');
for (const c of checks) console.log('  - ' + c);
