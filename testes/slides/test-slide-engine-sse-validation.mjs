import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { SlideEngine } from '../../ferramentas/apresentacao-slides.mjs';
import { connect } from 'file:///D:/DRIVE/IA/antigravity/3Mix/3mix-runtime/ferramentas/obsws.mjs';

const QA_DIR = path.join(process.cwd(), '../../../../qa-replay/evidencias-sse-validation');

async function runSSEValidationTest() {
  console.log('=== TESTE VALIDAÇÃO SSE-ONLY: Browser Source NÃO RECARREGA ===\n');

  let obs = null;
  let runtimeTested = false;

  try {
    console.log('[1/6] Conectando ao 3Mix Pro via OBS WebSocket...');
    obs = await connect({ root: 'D:/DRIVE/IA/antigravity/3Mix/3mix-runtime' });
    console.log('   [PASS] Conectado ao motor 3Mix Pro');
    runtimeTested = true;
  } catch (err) {
    console.log('   [AVISO] 3Mix Pro não está rodando - teste de validação SSE-only PULADO');
    console.log('   Para validar: inicie o 3Mix Pro e reexecute este teste.');
    return;
  }

  const productionAdapter = {
    req: (type, data) => obs.req(type, data),
    getObs: () => obs
  };

  const engine = new SlideEngine({
    root: 'D:/DRIVE/IA/antigravity/3Mix/3mix-runtime',
    production: productionAdapter
  });
  await engine.ready;

  const pptxPath = path.join(process.cwd(), '../../../../3Mix/scratch/apresentacao-rica-broadcast.pptx');
  const deck = await engine.importPptx(pptxPath, 'Apresentação Teste SSE');

  if (!fs.existsSync(QA_DIR)) fs.mkdirSync(QA_DIR, { recursive: true });

  // -------------------------------------------------------------
  // TESTE 1: Apresentar Slide 3 (com animações) no Program
  // -------------------------------------------------------------
  console.log('\n[2/6] Apresentando Slide 3 (3 animações) no Program...');
  await engine.presentSlide(deck.id, 3);
  await new Promise(r => setTimeout(r, 1500));

  // Capturar UUID da fonte Browser Source ANTES das animações
  const sceneItemsBefore = await obs.req('GetSceneItemList', { sceneName: 'Slides' });
  const sourceUuidBefore = sceneItemsBefore.sceneItems[0]?.sourceUuid;
  const sourceName = sceneItemsBefore.sceneItems[0]?.sourceName;
  console.log(`   Fonte: ${sourceName}, UUID antes: ${sourceUuidBefore}`);

  // Capturar frame de referência (slide 3, step 0)
  const shotStep0 = await obs.req('GetSourceScreenshot', {
    sourceName: sourceName,
    imageFormat: 'png',
    imageWidth: 1920,
    imageHeight: 1080
  });
  const bufStep0 = Buffer.from(shotStep0.imageData.replace(/^data:image\/png;base64,/, ''), 'base64');
  fs.writeFileSync(path.join(QA_DIR, 'sse_slide3_step0.png'), bufStep0);
  console.log(`   [PASS] Frame step 0 capturado (${bufStep0.length} bytes)`);

  // -------------------------------------------------------------
  // TESTE 2: Avançar animação 1 (Fade) via SSE-only
  // -------------------------------------------------------------
  console.log('\n[3/6] Avançando animação 1 (Fade) via nextAnimation() [SSE-only]...');
  await engine.nextAnimation(deck.id);
  await new Promise(r => setTimeout(r, 800));

  // Verificar UUID da fonte NÃO mudou (Browser Source não recarregou)
  const sceneItemsAfter1 = await obs.req('GetSceneItemList', { sceneName: 'Slides' });
  const sourceUuidAfter1 = sceneItemsAfter1.sceneItems[0]?.sourceUuid;
  
  assert.strictEqual(sourceUuidBefore, sourceUuidAfter1, 
    'UUID da fonte Browser Source DEVE permanecer idêntico (sem recarregamento)');
  console.log('   [PASS] UUID preservado — Browser Source NÃO recarregou');

  // Capturar frame step 1
  const shotStep1 = await obs.req('GetSourceScreenshot', {
    sourceName: sourceName,
    imageFormat: 'png',
    imageWidth: 1920,
    imageHeight: 1080
  });
  const bufStep1 = Buffer.from(shotStep1.imageData.replace(/^data:image\/png;base64,/, ''), 'base64');
  fs.writeFileSync(path.join(QA_DIR, 'sse_slide3_step1_fade.png'), bufStep1);
  console.log(`   [PASS] Frame step 1 (Fade) capturado`);

  // Verificar que o frame MUDOU (animação aplicada via SSE)
  assert.notStrictEqual(bufStep0.toString('base64'), bufStep1.toString('base64'),
    'Frame deve ter mudado (animação Fade aplicada via SSE)');
  console.log('   [PASS] Frame alterado — animação aplicada via SSE sem reload');

  // -------------------------------------------------------------
  // TESTE 3: Avançar animação 2 (Fly-In) via SSE-only
  // -------------------------------------------------------------
  console.log('\n[4/6] Avançando animação 2 (Fly-In) via nextAnimation() [SSE-only]...');
  await engine.nextAnimation(deck.id);
  await new Promise(r => setTimeout(r, 800));

  const sceneItemsAfter2 = await obs.req('GetSceneItemList', { sceneName: 'Slides' });
  const sourceUuidAfter2 = sceneItemsAfter2.sceneItems[0]?.sourceUuid;
  
  assert.strictEqual(sourceUuidBefore, sourceUuidAfter2, 
    'UUID da fonte DEVE permanecer idêntico após segunda animação');
  console.log('   [PASS] UUID preservado — Browser Source NÃO recarregou');

  const shotStep2 = await obs.req('GetSourceScreenshot', {
    sourceName: sourceName,
    imageFormat: 'png',
    imageWidth: 1920,
    imageHeight: 1080
  });
  const bufStep2 = Buffer.from(shotStep2.imageData.replace(/^data:image\/png;base64,/, ''), 'base64');
  fs.writeFileSync(path.join(QA_DIR, 'sse_slide3_step2_fly.png'), bufStep2);
  console.log(`   [PASS] Frame step 2 (Fly-In) capturado`);

  assert.notStrictEqual(bufStep1.toString('base64'), bufStep2.toString('base64'),
    'Frame deve ter mudado (animação Fly-In aplicada via SSE)');
  console.log('   [PASS] Frame alterado — animação Fly-In aplicada via SSE sem reload');

  // -------------------------------------------------------------
  // TESTE 4: Avançar animação 3 (Zoom) via SSE-only
  // -------------------------------------------------------------
  console.log('\n[5/6] Avançando animação 3 (Zoom) via nextAnimation() [SSE-only]...');
  await engine.nextAnimation(deck.id);
  await new Promise(r => setTimeout(r, 800));

  const sceneItemsAfter3 = await obs.req('GetSceneItemList', { sceneName: 'Slides' });
  const sourceUuidAfter3 = sceneItemsAfter3.sceneItems[0]?.sourceUuid;
  
  assert.strictEqual(sourceUuidBefore, sourceUuidAfter3, 
    'UUID da fonte DEVE permanecer idêntico após terceira animação');
  console.log('   [PASS] UUID preservado — Browser Source NÃO recarregou');

  const shotStep3 = await obs.req('GetSourceScreenshot', {
    sourceName: sourceName,
    imageFormat: 'png',
    imageWidth: 1920,
    imageHeight: 1080
  });
  const bufStep3 = Buffer.from(shotStep3.imageData.replace(/^data:image\/png;base64,/, ''), 'base64');
  fs.writeFileSync(path.join(QA_DIR, 'sse_slide3_step3_zoom.png'), bufStep3);
  console.log(`   [PASS] Frame step 3 (Zoom) capturado`);

  assert.notStrictEqual(bufStep2.toString('base64'), bufStep3.toString('base64'),
    'Frame deve ter mudado (animação Zoom aplicada via SSE)');
  console.log('   [PASS] Frame alterado — animação Zoom aplicada via SSE sem reload');

  // -------------------------------------------------------------
  // TESTE 5: Voltar animação (previousAnimation) via SSE-only
  // -------------------------------------------------------------
  console.log('\n[6/6] Retrocedendo animação (previousAnimation) via SSE-only...');
  await engine.previousAnimation(deck.id);
  await new Promise(r => setTimeout(r, 800));

  const sceneItemsAfterBack = await obs.req('GetSceneItemList', { sceneName: 'Slides' });
  const sourceUuidAfterBack = sceneItemsAfterBack.sceneItems[0]?.sourceUuid;
  
  assert.strictEqual(sourceUuidBefore, sourceUuidAfterBack, 
    'UUID da fonte DEVE permanecer idêntico ao voltar animação');
  console.log('   [PASS] UUID preservado — Browser Source NÃO recarregou');

  const shotStepBack = await obs.req('GetSourceScreenshot', {
    sourceName: sourceName,
    imageFormat: 'png',
    imageWidth: 1920,
    imageHeight: 1080
  });
  const bufStepBack = Buffer.from(shotStepBack.imageData.replace(/^data:image\/png;base64,/, ''), 'base64');
  fs.writeFileSync(path.join(QA_DIR, 'sse_slide3_step2_back.png'), bufStepBack);
  console.log(`   [PASS] Frame step 2 (volta) capturado`);

  // -------------------------------------------------------------
  // VALIDAÇÃO ADICIONAL: Preview preparado permanece intacto
  // -------------------------------------------------------------
  console.log('\n[VALIDAÇÃO] Verificando isolamento Preview vs Program...');
  
  // Armar slide 1 no Preview enquanto slide 3 está no Program
  engine.prepareSlide(deck.id, 1);
  assert.strictEqual(deck.currentSlide, 3, 'Slide no ar (Program) deve continuar sendo 3');
  assert.strictEqual(deck.preparedSlide, 1, 'Slide no Preview deve ser 1');
  
  await new Promise(r => setTimeout(r, 500));
  
  const shotDuringPreview = await obs.req('GetSourceScreenshot', {
    sourceName: sourceName,
    imageFormat: 'png',
    imageWidth: 1920,
    imageHeight: 1080
  });
  const bufDuringPreview = Buffer.from(shotDuringPreview.imageData.replace(/^data:image\/png;base64,/, ''), 'base64');
  
  // Program deve continuar mostrando slide 3 step 2 (último estado)
  assert.strictEqual(bufDuringPreview.toString('base64'), bufStep2.toString('base64'),
    'Program NÃO deve mudar ao armar slide no Preview');
  console.log('   [PASS] Isolamento Preview/Program confirmado — Program inalterado ao armar Preview');

  obs.close();
  console.log('\n=== TESTE SSE-ONLY VALIDADO COM SUCESSO ===');
  console.log('Resultados:');
  console.log('  ✓ Browser Source NÃO recarregou em nenhuma animação (UUID preservado)');
  console.log('  ✓ Animações aplicadas via SSE (frames mudam sem reload)');
  console.log('  ✓ previousAnimation também via SSE (sem reload)');
  console.log('  ✓ Preview preparado não afeta Program');
  console.log('Evidências salvas em:', QA_DIR);
}

runSSEValidationTest().catch(err => {
  console.error('\n❌ FALHA NO TESTE SSE-VALIDATION:', err);
  process.exit(1);
});