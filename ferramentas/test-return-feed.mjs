import assert from 'node:assert/strict';
import { ReturnFeedManager } from './return-feed-producao.mjs';

/**
 * Teste de Validação Empírica: Return Feed Manager (N-1 e Clean Feed)
 * 
 * Verifica:
 * 1. Inicialização do canal de retorno padrão SRT Listener.
 * 2. Configuração de vídeo Clean Feed (sem GC) e áudio N-1 automático.
 * 3. Inicialização e parada do feed com telemetria.
 * 4. Adição de múltiplos retornos independentes (Repórter, Estúdio B).
 */

console.log('--- Iniciando Teste de Validação: Return Feed Manager ---');

class MockProduction {
  constructor() {
    this.state = {
      program: 'Câmera 1',
      calls: { director: { name: 'Microfone Estúdio' } }
    };
  }
}

async function runTests() {
  const prod = new MockProduction();
  const manager = new ReturnFeedManager(prod, { basePort: 9998 });

  // 1. Verifica estado inicial
  const summary1 = manager.summary();
  assert.equal(summary1.feeds.length, 1);
  assert.equal(summary1.feeds[0].port, 9998);
  assert.equal(summary1.feeds[0].videoSource, 'clean');
  assert.equal(summary1.feeds[0].audioMode, 'n-1');
  console.log('✓ Teste 1 PASS: Feed padrão configurado em Clean Feed com áudio N-1');

  // 2. Iniciar feed
  const startRes = await manager.execute('return_feed_start', { feedId: 'return-1' });
  assert.equal(startRes.success, true);
  assert.equal(startRes.feed.status, 'running');
  assert.equal(startRes.feed.nMinusExclude, 'Microfone Estúdio', 'Deve excluir automaticamente a fonte de áudio do estúdio para N-1');
  console.log('✓ Teste 2 PASS: Retorno iniciado com isolamento N-1 de microfone para evitar eco');

  // 3. Adicionar segundo retorno para Estúdio B
  manager.configureFeed('return-studio-b', {
    name: 'Retorno Estúdio B',
    videoSource: 'program',
    audioMode: 'master',
    port: 9999
  });
  const summary2 = manager.summary();
  assert.equal(summary2.feeds.length, 2);
  const feedB = summary2.feeds.find(f => f.id === 'return-studio-b');
  assert.equal(feedB.port, 9999);
  assert.equal(feedB.videoSource, 'program');
  console.log('✓ Teste 3 PASS: Segundo canal de retorno (Estúdio B) criado na porta 9999');

  // 4. Parar feed
  const stopRes = await manager.execute('return_feed_stop', { feedId: 'return-1' });
  assert.equal(stopRes.success, true);
  assert.equal(stopRes.feed.status, 'stopped');
  console.log('✓ Teste 4 PASS: Encerramento limpo do canal de retorno');

  console.log('\n======================================================');
  console.log('TODOS OS TESTES DE RETURN FEED MANAGER PASSARAM COM SUCESSO!');
  console.log('======================================================');
}

runTests().catch(err => {
  console.error('FALHA NOS TESTES DE RETURN FEED:', err);
  process.exit(1);
});

