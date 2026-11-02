import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  modulosAtivos,
  salvarModulosAtivos,
  validarModulos,
  listarDefinicaoModulos,
  MODULOS_IDS,
  MODULOS_SCHEMA_VERSION
} from './modulos-config.mjs';

/**
 * Teste manual de FreeMix/ferramentas/modulos-config.mjs.
 *
 * Roda isolado, sem motor nem API: cria uma pasta temporária dentro de
 * qa-beta/runtime-teste/, exercita leitura/escrita/validação do arquivo de
 * módulos ativos e confirma o comportamento combinado nesta sessão:
 *   1. Sem arquivo -> todos os módulos ativos (comportamento atual preservado).
 *   2. Salvar uma seleção parcial -> reler devolve exatamente o que foi salvo.
 *   3. Chave desconhecida ou valor não-booleano -> erro explícito, nada gravado.
 *   4. listarDefinicaoModulos() cobre todos os MODULOS_IDS com rótulo e descrição.
 *
 * Uso: node ferramentas/test-modulos-config.mjs
 */

const WORKSPACE = fileURLToPath(new URL('../../', import.meta.url));
const QA_ROOT = join(WORKSPACE, 'qa-beta', 'runtime-teste');

async function testSemArquivoTudoAtivo(root) {
  const modulos = await modulosAtivos(root);
  for (const id of MODULOS_IDS) assert.equal(modulos[id], true, 'módulo ' + id + ' deveria começar ativo');
  console.log('OK 1/4 — sem arquivo, todos os ' + MODULOS_IDS.length + ' módulos vêm ativos (nada quebra para quem já usa o 3Mix hoje)');
}

async function testSalvarEReler(root) {
  const parcial = { replay: true, rundown: false, calls: false, multiview: true, iso: false, dataSources: true, srtHdr: false, blackbox: false, broadcastDelay: false };
  const gravado = await salvarModulosAtivos(root, parcial);
  assert.equal(gravado.schema, MODULOS_SCHEMA_VERSION);
  assert.ok(gravado.atualizadoEm);

  const relido = await modulosAtivos(root);
  for (const id of MODULOS_IDS) assert.equal(relido[id], parcial[id], 'módulo ' + id + ' deveria refletir a seleção salva');

  const bruto = JSON.parse(await readFile(join(root, 'config', 'modulos-ativos.json'), 'utf8'));
  assert.equal(bruto.schema, 1);
  assert.equal(typeof bruto.atualizadoEm, 'string');
  console.log('OK 2/4 — seleção parcial salva de forma atômica (tmp+rename) e relida igual ao que foi gravado');
}

async function testValidacaoRejeitaEntradaInvalida(root) {
  assert.throws(() => validarModulos({ moduloInexistente: true }), /desconhecido/i);
  assert.throws(() => validarModulos({ replay: 'sim' }), /true ou false/i);
  assert.throws(() => validarModulos(null));
  assert.throws(() => validarModulos([]));

  // Nenhuma tentativa inválida deve ter alterado o arquivo já salvo no teste anterior.
  const aindaValido = await modulosAtivos(root);
  assert.equal(aindaValido.rundown, false, 'estado salvo não deve ter sido afetado por tentativas inválidas');
  console.log('OK 3/4 — chave desconhecida e valor não-booleano são rejeitados sem tocar o arquivo salvo');
}

function testDefinicaoCompleta() {
  const definicao = listarDefinicaoModulos();
  assert.equal(definicao.length, MODULOS_IDS.length);
  for (const item of definicao) {
    assert.ok(MODULOS_IDS.includes(item.id), 'id inesperado em listarDefinicaoModulos: ' + item.id);
    assert.ok(item.rotulo && typeof item.rotulo === 'string', 'módulo ' + item.id + ' sem rótulo');
    assert.ok(item.descricao && typeof item.descricao === 'string', 'módulo ' + item.id + ' sem descrição');
  }
  console.log('OK 4/4 — listarDefinicaoModulos() cobre os ' + MODULOS_IDS.length + ' módulos com rótulo e descrição (pronto para uma futura tela de instalador/Configurações)');
}

async function run() {
  await mkdir(QA_ROOT, { recursive: true });
  const tempRoot = await mkdtemp(join(QA_ROOT, 'modulos-config-'));
  try {
    console.log('--- Teste manual: modulos-config.mjs ---');
    console.log('Pasta temporária: ' + tempRoot);
    await testSemArquivoTudoAtivo(tempRoot);
    await testSalvarEReler(tempRoot);
    await testValidacaoRejeitaEntradaInvalida(tempRoot);
    testDefinicaoCompleta();
    console.log('\nTODOS OS TESTES DE MODULOS-CONFIG PASSARAM.');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error('FALHA NO TESTE DE MODULOS-CONFIG:', error);
  process.exitCode = 1;
});
