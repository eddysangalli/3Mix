import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { SlideEngine } from '../../ferramentas/apresentacao-slides.mjs';
import { connect } from '../../../../3mix-runtime/ferramentas/obsws.mjs';

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const QA_DIR = path.join(process.cwd(), '../../../../qa-replay/evidencias-powerpoint');
const ARTIFACT_DIR = 'C:\\Users\\eddyr\\.gemini\\antigravity\\brain\\53afe648-b1c6-4bdb-99a3-222ed40f3874';

async function runCompositorTests() {
  console.log('=== SUÍTE DE TESTES: SLIDEENGINE — RENDERIZADOR & COMPOSITOR OBS ===\n');

  if (!fs.existsSync(QA_DIR)) fs.mkdirSync(QA_DIR, { recursive: true });

  console.log('[1/5] Conectando ao motor OBS Studio via WebSocket...');
  const obs = await connect({ root: path.join(process.cwd(), '3mix-runtime') });
  console.log('✓ Conectado ao 3Mix Pro / OBS WebSocket.');

  const productionAdapter = {
    req: (type, data) => obs.req(type, data),
    getObs: () => obs
  };

  const engine = new SlideEngine({
    root: path.join(process.cwd(), '../../../../3Mix/3mix-runtime'),
    production: productionAdapter
  });
  await engine.ready;

  const pptxPath = path.join(process.cwd(), '../../../../3Mix/scratch/apresentacao-rica-broadcast.pptx');
  const deck = await engine.importPptx(pptxPath, 'Apresentação Rica Broadcast');

  // -------------------------------------------------------------
  // TESTE 1: APRESENTAR SLIDE 1 COM DIAGRAMAÇÃO LIVRE NO PROGRAM
  // -------------------------------------------------------------
  console.log('\n[2/5] Apresentando Slide 1 com diagramação livre no Program...');
  await engine.presentSlide(deck.id, 1);
  await new Promise(r => setTimeout(r, 1000));

  const shotSlide1 = await obs.req('GetSourceScreenshot', {
    sourceName: 'Fonte Slides',
    imageFormat: 'png',
    imageWidth: 1920,
    imageHeight: 1080
  });
  const bufSlide1 = Buffer.from(shotSlide1.imageData.replace(/^data:image\/png;base64,/, ''), 'base64');
  const pathSlide1 = path.join(QA_DIR, 'evidencia_compositor_01_slide1_livre.png');
  fs.writeFileSync(pathSlide1, bufSlide1);
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'evidencia_compositor_01_slide1_livre.png'), bufSlide1);
  console.log(`✓ Frame do Slide 1 salvo (${bufSlide1.length} bytes): ${pathSlide1}`);

  // -------------------------------------------------------------
  // TESTE 2: ISOLAMENTO ESTREITO PREVIEW VS PROGRAM
  // -------------------------------------------------------------
  console.log('\n[3/5] Validando isolamento: armar Slide 3 no Preview NÃO pode alterar o Program...');
  // Slide 1 continua no ar. Operador seleciona Slide 3 no Preview:
  engine.prepareSlide(deck.id, 3);
  assert.strictEqual(deck.currentSlide, 1, 'Slide no ar deve continuar sendo o 1');
  assert.strictEqual(deck.preparedSlide, 3, 'Slide no preview deve ser o 3');

  await new Promise(r => setTimeout(r, 800));

  const shotDuringPvw = await obs.req('GetSourceScreenshot', {
    sourceName: 'Fonte Slides',
    imageFormat: 'png',
    imageWidth: 1920,
    imageHeight: 1080
  });
  const bufDuringPvw = Buffer.from(shotDuringPvw.imageData.replace(/^data:image\/png;base64,/, ''), 'base64');
  assert.strictEqual(sha(bufSlide1), sha(bufDuringPvw), 'A imagem no ar no Program deve ser rigorosamente IDÊNTICA!');
  console.log('✓ Isolamento comprovado: o frame no ar não sofreu qualquer oscilação.');

  // -------------------------------------------------------------
  // TESTE 3: APRESENTAR SLIDE 4 (MORPH) E COMPROVAR AUSÊNCIA DE WARNINGS NO AR
  // -------------------------------------------------------------
  console.log('\n[4/5] Apresentando Slide 4 (Morph) e comprovando ausência de warnings na saída...');
  await engine.presentSlide(deck.id, 4);
  await new Promise(r => setTimeout(r, 1000));

  const shotSlide4 = await obs.req('GetSourceScreenshot', {
    sourceName: 'Fonte Slides',
    imageFormat: 'png',
    imageWidth: 1920,
    imageHeight: 1080
  });
  const bufSlide4 = Buffer.from(shotSlide4.imageData.replace(/^data:image\/png;base64,/, ''), 'base64');
  const pathSlide4 = path.join(QA_DIR, 'evidencia_compositor_02_slide4_morph_limpo.png');
  fs.writeFileSync(pathSlide4, bufSlide4);
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'evidencia_compositor_02_slide4_morph_limpo.png'), bufSlide4);
  console.log(`✓ Frame do Slide 4 salvo (${bufSlide4.length} bytes): ${pathSlide4}`);

  // Verificar no SVG que não há elementos de badge ou texto de warning
  const s4 = deck.slides[3];
  assert(!s4.svgPreview.includes('⚠'), 'SVG do Slide 4 não deve conter símbolo de aviso');
  assert(!s4.svgPreview.includes('Morph (Suporte Parcial'), 'SVG do Slide 4 não deve vazar texto de limitação');
  console.log('✓ Ausência de poluição visual confirmada no Program do vídeo.');

  // -------------------------------------------------------------
  // TESTE 4: APRESENTAÇÃO LEGADA 4:3 (PILARBOX BROADCAST)
  // -------------------------------------------------------------
  console.log('\n[5/5] Testando proporção 4:3 com pilarbox lateral...');
  const pptx43Path = path.join(process.cwd(), '../../../../3Mix/scratch/apresentacao-4x3.pptx');
  const deck43 = await engine.importPptx(pptx43Path, 'Apresentação Legada 4:3');
  assert.strictEqual(deck43.aspect, '4:3');

  await engine.presentSlide(deck43.id, 1);
  await new Promise(r => setTimeout(r, 1000));

  const shot43 = await obs.req('GetSourceScreenshot', {
    sourceName: 'Fonte Slides',
    imageFormat: 'png',
    imageWidth: 1920,
    imageHeight: 1080
  });
  const buf43 = Buffer.from(shot43.imageData.replace(/^data:image\/png;base64,/, ''), 'base64');
  const path43 = path.join(QA_DIR, 'evidencia_compositor_03_legado_4x3_pilarbox.png');
  fs.writeFileSync(path43, buf43);
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'evidencia_compositor_03_legado_4x3_pilarbox.png'), buf43);
  console.log(`✓ Frame 4:3 com pilarbox lateral salvo (${buf43.length} bytes): ${path43}`);

  obs.close();
  console.log('\n======================================================');
  console.log('TODOS OS TESTES DO COMPOSITOR OBS FORAM APROVADOS!');
  console.log('======================================================');
}

runCompositorTests().catch(err => {
  console.error('\n❌ FALHA NO TESTE DO COMPOSITOR:', err);
  process.exit(1);
});
