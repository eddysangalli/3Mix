import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mapaMultiCorder } from '../../../3mix-panel/ferramentas/disco-producao.mjs';

test('1. MultiCorder: Detecção de Múltiplos Discos e Colisões Físicas', async () => {
  // Teste com unidades simuladas
  const resultado = await mapaMultiCorder({
    'Câmera 1': 'D:\\Producao\\CAM1',
    'Câmera 2': 'D:\\Producao\\CAM2',
    'Câmera 3': 'C:\\Gravacoes\\CAM3',
  });

  assert.ok(resultado.entradas, 'Deve retornar a lista de entradas');
  assert.equal(resultado.entradas.length, 3, 'Deve conter as 3 entradas mapeadas');

  // No Windows real desta máquina, D: e C: são discos NVMe reconhecidos
  const cam1 = resultado.entradas.find((e) => e.nome === 'Câmera 1');
  const cam2 = resultado.entradas.find((e) => e.nome === 'Câmera 2');
  const cam3 = resultado.entradas.find((e) => e.nome === 'Câmera 3');

  if (cam1.disco.supported && cam2.disco.supported) {
    assert.equal(cam1.disco.letra, 'D', 'CAM 1 deve estar no drive D:');
    assert.equal(cam2.disco.letra, 'D', 'CAM 2 deve estar no drive D:');
    assert.equal(cam1.disco.numero, cam2.disco.numero, 'CAM 1 e CAM 2 devem estar no mesmo disco físico');
    
    // Deve apontar a colisão
    const colD = resultado.colisoes.find((c) => c.numero === cam1.disco.numero);
    assert.ok(colD, 'Deve relatar colisão para o disco compartilhado');
    assert.ok(colD.nomes.includes('Câmera 1') && colD.nomes.includes('Câmera 2'), 'Colisão deve listar CAM 1 e CAM 2');
  }

  if (cam3.disco.supported) {
    assert.equal(cam3.disco.letra, 'C', 'CAM 3 deve estar no drive C:');
  }
});

test('2. Interface de MultiCorder e Tags de Disco no DOM/JS', () => {
  const html = readFileSync('3mix-panel/painel/remoto/iso.html', 'utf8');
  assert.ok(html.includes('iso-disk-tag'), 'iso.html deve ter a classe .iso-disk-tag');
  assert.ok(html.includes('iso-disk-collision'), 'iso.html deve ter a classe .iso-disk-collision');
  assert.ok(html.includes('id="iso-disk-summary"'), 'iso.html deve ter a div #iso-disk-summary');

  const js = readFileSync('3mix-panel/painel/remoto/iso-avancado.js', 'utf8');
  assert.ok(js.includes('/api/multicorder/discos'), 'iso-avancado.js deve consultar /api/multicorder/discos');
  assert.ok(js.includes('updateDisks'), 'iso-avancado.js deve ter a rotina updateDisks');
  assert.ok(js.includes('iso-disk-collision'), 'iso-avancado.js deve renderizar aviso de colisão');
});

test('3. Interface 3Mix Crew: QR Code Dedicado e Pareamento por PIN', () => {
  const html = readFileSync('3mix-panel/painel/remoto/crew.html', 'utf8');
  assert.ok(html.includes('id="card-qr"'), 'crew.html deve ter o container de QR Code #card-qr');
  assert.ok(html.includes('id="crew-qr-img"'), 'crew.html deve ter a tag de imagem #crew-qr-img');
  assert.ok(html.includes('id="card-pair"'), 'crew.html deve ter o formulário de PIN #card-pair');
  assert.ok(html.includes('id="form-pair"'), 'crew.html deve ter o form #form-pair');

  const js = readFileSync('3mix-panel/painel/remoto/crew.js', 'utf8');
  assert.ok(js.includes('/api/access'), 'crew.js deve ler /api/access');
  assert.ok(js.includes('/api/pair'), 'crew.js deve enviar PIN para /api/pair');
  assert.ok(js.includes('atualizarQrCrew'), 'crew.js deve atualizar QR Code dinâmico');
});

