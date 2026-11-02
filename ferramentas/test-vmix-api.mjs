import assert from 'node:assert/strict';
import { createConnection } from 'node:net';
import { VmixTcpServer } from './vmix-tcp-api.mjs';

/**
 * Teste de Validação Empírica: Servidor vMix TCP API (Porta 8099 / Protocolo Oficial)
 * 
 * Verifica:
 * 1. Conexão TCP e recepção do banner 'VERSION OK 27.0.0.1'.
 * 2. Comando XML com tamanho de payload e estrutura padrão vMix.
 * 3. Comando TALLY refletindo estado de Program (1), Preview (2) e Inativo (0).
 * 4. Assinatura push SUBSCRIBE TALLY com recebimento imediato de estado.
 * 5. Execução de FUNCTION Cut via TCP e notificação em broadcast de Tally atualizado.
 * 6. Suporte à extensão de Adjust Gain (TriCaster DDR clip gain) via vMix FUNCTION.
 * 7. Fechamento amigável via QUIT.
 */

console.log('--- Iniciando Teste de Validação: vMix TCP API Server ---');

class MockProduction {
  constructor() {
    this.state = {
      program: 'Câmera 1',
      preview: 'Câmera 2',
      inputs: [
        { number: 1, name: 'Câmera 1', key: 'cam-1-uuid', type: 'Camera' },
        { number: 2, name: 'Câmera 2', key: 'cam-2-uuid', type: 'Camera' },
        { number: 3, name: 'VT Playout', key: 'vt-uuid', type: 'Media' }
      ]
    };
  }

  statusXml() {
    return `<?xml version="1.0" encoding="utf-8"?><vmix><version>27.0.0.1</version><edition>FreeMix</edition><preview>2</preview><active>1</active></vmix>`;
  }
}

async function runTests() {
  const prod = new MockProduction();
  const executedFunctions = [];

  const mockVmixHandler = async (fn, params) => {
    executedFunctions.push({ fn, params: Object.fromEntries(params.entries()) });
    if (fn.toLowerCase() === 'cut') {
      // Inverte Program e Preview
      const oldProg = prod.state.program;
      prod.state.program = prod.state.preview;
      prod.state.preview = oldProg;
    }
  };

  const tcpServer = new VmixTcpServer({
    production: prod,
    vmixHandler: mockVmixHandler,
    port: 8999,
    host: '127.0.0.1'
  });

  await tcpServer.start();
  console.log('Servidor vMix TCP iniciado em 127.0.0.1:8999');

  // Conectar cliente TCP de teste
  const client = createConnection({ port: 8999, host: '127.0.0.1' });
  const receivedLines = [];
  let resolver = null;

  client.on('data', chunk => {
    const lines = chunk.toString('utf8').split(/\r?\n/).filter(Boolean);
    receivedLines.push(...lines);
    if (resolver) {
      resolver();
      resolver = null;
    }
  });

  const waitForLine = async (predicate, timeoutMs = 2000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const match = receivedLines.find(predicate);
      if (match) return match;
      await new Promise(r => {
        resolver = r;
        setTimeout(r, 50);
      });
    }
    throw new Error(`Timeout aguardando linha esperada. Linhas recebidas: ${JSON.stringify(receivedLines)}`);
  };

  // 1. Handshake inicial
  const versionLine = await waitForLine(l => l.startsWith('VERSION OK'));
  assert.equal(versionLine, 'VERSION OK 27.0.0.1', 'Banner deve ser VERSION OK 27.0.0.1');
  console.log('✓ Teste 1 PASS: Handshake oficial recebido:', versionLine);

  // 2. Consulta de XML
  client.write('XML\r\n');
  const xmlHeader = await waitForLine(l => l.startsWith('XML '));
  assert(xmlHeader, 'Deve responder cabeçalho XML');
  const xmlContent = await waitForLine(l => l.includes('<vmix>'));
  assert(xmlContent.includes('<version>27.0.0.1</version>'), 'Conteúdo XML deve conter vMix 27');
  console.log('✓ Teste 2 PASS: Resposta XML formatada e validada');

  // 3. Consulta de TALLY inicial
  client.write('TALLY\r\n');
  const tallyLine = await waitForLine(l => l.startsWith('TALLY OK'));
  // Input 1 = PGM (1), Input 2 = PVW (2), Input 3 = OFF (0)
  assert.equal(tallyLine.slice(0, 12), 'TALLY OK 120', 'Tally deve iniciar com 120');
  console.log('✓ Teste 3 PASS: Consulta TALLY correta (Input 1 no PGM, Input 2 no PVW):', tallyLine);

  // 4. Assinatura SUBSCRIBE TALLY
  client.write('SUBSCRIBE TALLY\r\n');
  await waitForLine(l => l === 'SUBSCRIBE OK TALLY');
  console.log('✓ Teste 4 PASS: Assinatura SUBSCRIBE TALLY aceita pelo servidor');

  // 5. Execução de FUNCTION Cut
  receivedLines.length = 0; // Limpa para capturar novos eventos
  client.write('FUNCTION Cut\r\n');
  const fnRes = await waitForLine(l => l === 'FUNCTION OK Cut');
  assert(fnRes, 'Deve confirmar FUNCTION OK Cut');
  assert.equal(executedFunctions[0].fn, 'Cut');

  // Com o corte, Program virou Câmera 2 e Preview virou Câmera 1 -> Tally deve virar 210
  const pushedTally = await waitForLine(l => l.startsWith('TALLY OK 210'));
  assert(pushedTally, 'Deve receber push de Tally atualizado (210) sem polling');
  console.log('✓ Teste 5 PASS: FUNCTION Cut executada e Tally push enviado (210):', pushedTally);

  // 6. Extensão Adjust Gain (TriCaster DDR style) via vMix FUNCTION
  client.write('FUNCTION AdjustGain ItemId=clip-test Gain=3.5\r\n');
  const gainRes = await waitForLine(l => l === 'FUNCTION OK AdjustGain');
  assert(gainRes, 'Deve confirmar FUNCTION OK AdjustGain');
  assert.equal(executedFunctions[1].params.ItemId, 'clip-test');
  assert.equal(executedFunctions[1].params.Gain, '3.5');
  console.log('✓ Teste 6 PASS: FUNCTION AdjustGain com parâmetros recebida e executada');

  // 7. Comando QUIT
  client.write('QUIT\r\n');
  await waitForLine(l => l === 'BYE');
  console.log('✓ Teste 7 PASS: Encerramento amigável via QUIT (BYE)');

  client.destroy();
  await tcpServer.stop();
  console.log('\n======================================================');
  console.log('TODOS OS TESTES DO VMIX TCP SERVER PASSARAM COM SUCESSO!');
  console.log('======================================================');
}

runTests().catch(err => {
  console.error('FALHA NOS TESTES DO VMIX TCP:', err);
  process.exit(1);
});

