import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SlideEngine } from '../../ferramentas/apresentacao-slides.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../../..');
const RUNTIME_ROOT = resolve(PROJECT_ROOT, '3mix-runtime');
const PPTX_PATH = resolve(PROJECT_ROOT, 'scratch/apresentacao-rica-broadcast.pptx');

async function runApiTests() {
  console.log('=== SLIDEENGINE — API & MODELO ===\n');

  const engine = new SlideEngine({ root: RUNTIME_ROOT });
  await engine.ready;

  assert.ok(fs.existsSync(PPTX_PATH), 'PPTX deve existir em scratch/');

  console.log('[1/6] Importação layout livre...');
  const deck = await engine.importPptx(PPTX_PATH, 'Teste API');
  assert.strictEqual(deck.totalSlides, 4);
  assert.strictEqual(deck.aspect, '16:9');
  console.log('✓ Importação OK:', deck.totalSlides, 'slides');

  console.log('\n[2/6] Slide 1 elementos livres...');
  const s1 = deck.slides[0];
  assert.strictEqual(s1.index, 1);
  assert(s1.elementsCount >= 4);
  assert(s1.images.length === 2);
  assert(s1.fullText.includes('Item 8'));
  console.log(`✓ Slide 1: ${s1.elementsCount} elementos, 2 imagens`);

  console.log('\n[3/6] Slide 2 vídeos + autoplay...');
  const s2 = deck.slides[1];
  assert(s2.hasVideo);
  assert(s2.videos && s2.videos.length === 2);
  assert.strictEqual(s2.videos[0].autoPlay, true);
  assert.strictEqual(s2.videos[1].autoPlay, false);
  console.log('✓ Slide 2: 2 vídeos, autoplay correto');

  console.log('\n[4/6] Slide 3 animações...');
  const s3 = deck.slides[2];
  assert.strictEqual(s3.totalAnimationSteps, 3);
  assert.strictEqual(s3.animationSteps[0].effect, 'fade');
  assert.strictEqual(s3.animationSteps[1].effect, 'fly');
  assert.strictEqual(s3.animationSteps[2].effect, 'zoom');
  console.log('✓ Slide 3: fade, fly, zoom');

  console.log('\n[5/6] Slide 4 Morph...');
  const s4 = deck.slides[3];
  assert.strictEqual(s4.transition.type, 'morph-interpolation');
  assert.strictEqual(s4.transition.classification, 'suporte-parcial-adaptado');
  assert(s4.unsupportedFeatures.some(f => f.includes('Suporte Parcial')));
  assert(!s4.svgPreview.includes('⚠ 3Mix:'));
  console.log('✓ Slide 4: Morph classificado, sem warning no SVG');

  console.log('\n[6/6] Eventos tempo real...');
  let eventCaptured = null;
  engine.on('event', ev => { eventCaptured = ev; });

  await engine.presentSlide(deck.id, 2);
  await engine.playVideo(deck.id);
  assert.strictEqual(eventCaptured?.action, 'play_video');
  await engine.pauseVideo(deck.id);
  assert.strictEqual(eventCaptured?.action, 'pause_video');
  await engine.seekVideo(deck.id, 12.5);
  assert.strictEqual(eventCaptured?.action, 'seek_video');
  assert.strictEqual(eventCaptured?.time, 12.5);
  console.log('✓ Eventos play/pause/seek emitidos');

  console.log('\n=== API & MODELO: TODOS PASS ===');
}

runApiTests().catch(err => {
  console.error('\n❌ FALHA API:', err.message);
  process.exit(1);
});
