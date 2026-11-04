import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { SlideEngine } from '../../3mix-panel/ferramentas/apresentacao-slides.mjs';

async function runApiTests() {
  console.log('=== SUÍTE DE TESTES: SLIDEENGINE — CONTRATOS DE API & MODELO ===\n');

  const engine = new SlideEngine({ root: path.join(process.cwd(), '3mix-runtime') });
  await engine.ready;

  const pptxPath = path.join(process.cwd(), 'scratch/apresentacao-rica-broadcast.pptx');
  assert(fs.existsSync(pptxPath), 'Arquivo PPTX rico deve existir em scratch/');

  console.log('[1/6] Testando importação de apresentação com layout livre...');
  const deck = await engine.importPptx(pptxPath, 'Apresentação Broadcast Teste');
  assert.strictEqual(deck.totalSlides, 4, 'Deve conter exatamente 4 slides');
  assert.strictEqual(deck.aspect, '16:9', 'Proporção detectada deve ser 16:9');
  console.log('✓ Importação concluída com sucesso. Total de slides:', deck.totalSlides);

  console.log('\n[2/6] Validando elementos livres do Slide 1 (cards, >5 tópicos, 2 imagens)...');
  const s1 = deck.slides[0];
  assert.strictEqual(s1.index, 1);
  assert(s1.elementsCount >= 4, `Deve conter ao menos 4 elementos estruturados, obtido: ${s1.elementsCount}`);
  assert(s1.images.length === 2, `Deve conter 2 imagens livres, obtido: ${s1.images.length}`);
  assert(s1.fullText.includes('Item 8'), 'Deve conter mais de 5 tópicos (até Item 8)');
  console.log(`✓ Slide 1 validado: ${s1.elementsCount} elementos, 2 imagens, 8 tópicos preservados.`);

  console.log('\n[3/6] Validando detecção de múltiplos vídeos e autoplay no Slide 2...');
  const s2 = deck.slides[1];
  assert(s2.hasVideo, 'Slide 2 deve ter hasVideo=true');
  assert(s2.videos && s2.videos.length === 2, `Slide 2 deve conter 2 vídeos incorporados, obtido: ${s2.videos?.length}`);
  assert.strictEqual(s2.videos[0].autoPlay, true, 'Vídeo 1 deve ter autoPlay=true');
  assert.strictEqual(s2.videos[1].autoPlay, false, 'Vídeo 2 deve ter autoPlay=false');
  console.log('✓ Slide 2 validado: 2 vídeos extraídos com distinção correta de autoplay.');

  console.log('\n[4/6] Validando parser de animações sequenciais estritas no Slide 3...');
  const s3 = deck.slides[2];
  assert.strictEqual(s3.totalAnimationSteps, 3, 'Slide 3 deve ter exatamente 3 etapas de animação');
  assert.strictEqual(s3.animationSteps[0].effect, 'fade', 'Etapa 1 deve ser fade');
  assert.strictEqual(s3.animationSteps[1].effect, 'fly', 'Etapa 2 deve ser fly');
  assert.strictEqual(s3.animationSteps[2].effect, 'zoom', 'Etapa 3 deve ser zoom');
  console.log('✓ Slide 3 validado: 3 efeitos fiéis ao OpenXML sem atribuições arbitrárias.');

  console.log('\n[5/6] Validando classificação e isolamento da Transição Morph no Slide 4...');
  const s4 = deck.slides[3];
  assert.strictEqual(s4.transition.type, 'morph-interpolation');
  assert.strictEqual(s4.transition.classification, 'suporte-parcial-adaptado');
  assert(s4.unsupportedFeatures.some(f => f.includes('Suporte Parcial')), 'Deve registrar limitação como Suporte Parcial');
  // Confirmar que o SVG gerado NÃO contém o badge amarelo na tela
  assert(!s4.svgPreview.includes('⚠ 3Mix:'), 'O SVG broadcast NÃO pode conter badge de warning na tela do espectador!');
  console.log('✓ Slide 4 validado: classificado como Suporte Parcial e Program 100% limpo de warnings.');

  console.log('\n[6/6] Validando emissão de eventos em tempo real para controle contínuo...');
  let eventCaptured = null;
  engine.on('event', ev => { eventCaptured = ev; });

  // Apresentar Slide 2 (que possui vídeos incorporados)
  await engine.presentSlide(deck.id, 2);

  await engine.playVideo(deck.id);
  assert.strictEqual(eventCaptured?.action, 'play_video');

  await engine.pauseVideo(deck.id);
  assert.strictEqual(eventCaptured?.action, 'pause_video');

  await engine.seekVideo(deck.id, 12.5);
  assert.strictEqual(eventCaptured?.action, 'seek_video');
  assert.strictEqual(eventCaptured?.time, 12.5);
  console.log('✓ Eventos de transporte em tempo real emitidos sem recarregar o slide.');

  console.log('\n======================================================');
  console.log('TODOS OS TESTES DE CONTRATO DE API E MODELO PASSARAM!');
  console.log('======================================================');
}

runApiTests().catch(err => {
  console.error('\n❌ FALHA NO TESTE DE API:', err);
  process.exit(1);
});
