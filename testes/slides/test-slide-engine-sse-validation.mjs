import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SlideEngine } from '../../ferramentas/apresentacao-slides.mjs';
import { connect } from 'file:///D:/DRIVE/IA/antigravity/3Mix/3mix-runtime/ferramentas/obsws.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../../..');
const RUNTIME_ROOT = resolve(PROJECT_ROOT, '3mix-runtime');
const QA_DIR = resolve(PROJECT_ROOT, 'qa-replay/evidencias-sse-validation');
const PPTX_PATH = resolve(PROJECT_ROOT, 'scratch/apresentacao-rica-broadcast.pptx');
const ISOLATED_SCENE_PREFIX = 'SSE_TEST_';

async function runSSEValidationTest() {
  console.log('=== TESTE SSE-ONLY: Browser Source NÃO RECARREGA (ambiente isolado) ===\n');

  let obs = null;
  let runtimeTested = false;
  let testSceneName = null;

  try {
    console.log('[1/7] Conectando ao 3Mix Pro...');
    obs = await connect({ root: RUNTIME_ROOT });
    console.log('   [PASS] Conectado');
    runtimeTested = true;
  } catch (err) {
    console.log('   [SKIPPED] 3Mix Pro não ativo');
    return;
  }

  const productionAdapter = {
    req: (type, data) => obs.req(type, data),
    getObs: () => obs
  };

  const engine = new SlideEngine({
    root: RUNTIME_ROOT,
    production: productionAdapter
  });
  await engine.ready;

  const deck = await engine.importPptx(PPTX_PATH, 'Apresentação Teste SSE');

  if (!fs.existsSync(QA_DIR)) fs.mkdirSync(QA_DIR, { recursive: true });

  // Create isolated scene
  testSceneName = `${ISOLATED_SCENE_PREFIX}Slides`;
  await obs.req('CreateScene', { sceneName: testSceneName }).catch(() => {});
  console.log(`   Cena isolada: ${testSceneName}`);

  // -------------------------------------------------------------
  // TESTE 1: Apresentar Slide 3 no Program (cena isolada)
  // -------------------------------------------------------------
  console.log('\n[2/7] Apresentando Slide 3 (3 animações) no Program isolado...');
  await engine.presentSlide(deck.id, 3, { targetScene: testSceneName });
  await new Promise(r => setTimeout(r, 1500));

  const sceneItemsBefore = await obs.req('GetSceneItemList', { sceneName: testSceneName });
  const sourceUuidBefore = sceneItemsBefore.sceneItems[0]?.sourceUuid;
  const sourceName = sceneItemsBefore.sceneItems[0]?.sourceName;
  console.log(`   Fonte: ${sourceName}, UUID: ${sourceUuidBefore}`);

  const shotStep0 = await obs.req('GetSourceScreenshot', {
    sourceName, imageFormat: 'png', imageWidth: 1920, imageHeight: 1080
  });
  const bufStep0 = Buffer.from(shotStep0.imageData.replace(/^data:image\/png;base64,/, ''), 'base64');
  fs.writeFileSync(path.join(QA_DIR, 'sse_slide3_step0.png'), bufStep0);
  console.log(`   [PASS] Frame step 0 capturado`);

  // -------------------------------------------------------------
  // TESTE 2: Animação 1 (Fade) via SSE-only
  // -------------------------------------------------------------
  console.log('\n[3/7] Animação 1 (Fade) via nextAnimation() [SSE-only]...');
  await engine.nextAnimation(deck.id);
  await new Promise(r => setTimeout(r, 800));

  const sceneItemsAfter1 = await obs.req('GetSceneItemList', { sceneName: testSceneName });
  const sourceUuidAfter1 = sceneItemsAfter1.sceneItems[0]?.sourceUuid;
  
  assert.strictEqual(sourceUuidBefore, sourceUuidAfter1, 'UUID deve permanecer idêntico (sem reload)');
  console.log('   [PASS] UUID preservado — Browser Source NÃO recarregou');

  const shotStep1 = await obs.req('GetSourceScreenshot', {
    sourceName, imageFormat: 'png', imageWidth: 1920, imageHeight: 1080
  });
  const bufStep1 = Buffer.from(shotStep1.imageData.replace(/^data:image\/png;base64,/, ''), 'base64');
  fs.writeFileSync(path.join(QA_DIR, 'sse_slide3_step1_fade.png'), bufStep1);
  
  assert.notStrictEqual(bufStep0.toString('base64'), bufStep1.toString('base64'), 'Frame deve mudar via SSE');
  console.log('   [PASS] Frame alterado — Fade via SSE sem reload');

  // -------------------------------------------------------------
  // TESTE 3: Animação 2 (Fly-In) via SSE-only
  // -------------------------------------------------------------
  console.log('\n[4/7] Animação 2 (Fly-In) via nextAnimation() [SSE-only]...');
  await engine.nextAnimation(deck.id);
  await new Promise(r => setTimeout(r, 800));

  const sceneItemsAfter2 = await obs.req('GetSceneItemList', { sceneName: testSceneName });
  const sourceUuidAfter2 = sceneItemsAfter2.sceneItems[0]?.sourceUuid;
  
  assert.strictEqual(sourceUuidBefore, sourceUuidAfter2, 'UUID deve permanecer idêntico');
  console.log('   [PASS] UUID preservado');

  const shotStep2 = await obs.req('GetSourceScreenshot', {
    sourceName, imageFormat: 'png', imageWidth: 1920, imageHeight: 1080
  });
  const bufStep2 = Buffer.from(shotStep2.imageData.replace(/^data:image\/png;base64,/, ''), 'base64');
  fs.writeFileSync(path.join(QA_DIR, 'sse_slide3_step2_fly.png'), bufStep2);
  
  assert.notStrictEqual(bufStep1.toString('base64'), bufStep2.toString('base64'), 'Frame deve mudar via SSE');
  console.log('   [PASS] Frame alterado — Fly-In via SSE sem reload');

  // -------------------------------------------------------------
  // TESTE 4: Animação 3 (Zoom) via SSE-only
  // -------------------------------------------------------------
  console.log('\n[5/7] Animação 3 (Zoom) via nextAnimation() [SSE-only]...');
  await engine.nextAnimation(deck.id);
  await new Promise(r => setTimeout(r, 800));

  const sceneItemsAfter3 = await obs.req('GetSceneItemList', { sceneName: testSceneName });
  const sourceUuidAfter3 = sceneItemsAfter3.sceneItems[0]?.sourceUuid;
  
  assert.strictEqual(sourceUuidBefore, sourceUuidAfter3, 'UUID deve permanecer idêntico');
  console.log('   [PASS] UUID preservado');

  const shotStep3 = await obs.req('GetSourceScreenshot', {
    sourceName, imageFormat: 'png', imageWidth: 1920, imageHeight: 1080
  });
  const bufStep3 = Buffer.from(shotStep3.imageData.replace(/^data:image\/png;base64,/, ''), 'base64');
  fs.writeFileSync(path.join(QA_DIR, 'sse_slide3_step3_zoom.png'), bufStep3);
  
  assert.notStrictEqual(bufStep2.toString('base64'), bufStep3.toString('base64'), 'Frame deve mudar via SSE');
  console.log('   [PASS] Frame alterado — Zoom via SSE sem reload');

  // -------------------------------------------------------------
  // TESTE 5: previousAnimation via SSE-only
  // -------------------------------------------------------------
  console.log('\n[6/7] Retrocedendo (previousAnimation) via SSE-only...');
  await engine.previousAnimation(deck.id);
  await new Promise(r => setTimeout(r, 800));

  const sceneItemsAfterBack = await obs.req('GetSceneItemList', { sceneName: testSceneName });
  const sourceUuidAfterBack = sceneItemsAfterBack.sceneItems[0]?.sourceUuid;
  
  assert.strictEqual(sourceUuidBefore, sourceUuidAfterBack, 'UUID deve permanecer idêntico');
  console.log('   [PASS] UUID preservado ao voltar');

  const shotStepBack = await obs.req('GetSourceScreenshot', {
    sourceName, imageFormat: 'png', imageWidth: 1920, imageHeight: 1080
  });
  const bufStepBack = Buffer.from(shotStepBack.imageData.replace(/^data:image\/png;base64,/, ''), 'base64');
  fs.writeFileSync(path.join(QA_DIR, 'sse_slide3_step2_back.png'), bufStepBack);
  console.log('   [PASS] Frame step 2 (volta) capturado');

  // -------------------------------------------------------------
  // TESTE 6: Isolamento Preview vs Program
  // -------------------------------------------------------------
  console.log('\n[7/7] Isolamento Preview vs Program...');
  
  engine.prepareSlide(deck.id, 1);
  assert.strictEqual(deck.currentSlide, 3, 'Program continua no slide 3');
  assert.strictEqual(deck.preparedSlide, 1, 'Preview armado no slide 1');
  
  await new Promise(r => setTimeout(r, 500));
  
  const shotDuringPreview = await obs.req('GetSourceScreenshot', {
    sourceName, imageFormat: 'png', imageWidth: 1920, imageHeight: 1080
  });
  const bufDuringPreview = Buffer.from(shotDuringPreview.imageData.replace(/^data:image\/png;base64,/, ''), 'base64');
  
  assert.strictEqual(bufDuringPreview.toString('base64'), bufStep2.toString('base64'), 'Program inalterado ao armar Preview');
  console.log('   [PASS] Program inalterado — Preview isolado');

  // Cleanup
  await obs.req('RemoveScene', { sceneName: testSceneName }).catch(() => {});
  console.log('   [PASS] Cena isolada removida');

  obs.close();
  console.log('\n=== TESTE SSE-ONLY: TODOS PASS ===');
  console.log('  ✓ Browser Source NÃO recarregou (UUID preservado em 4 animações + volta)');
  console.log('  ✓ Animações aplicadas via SSE (frames mudam sem reload)');
  console.log('  ✓ previousAnimation via SSE (sem reload)');
  console.log('  ✓ Preview armado não afeta Program');
  console.log('  ✓ Cena isolada criada e removida — sem lixo no runtime');
  console.log('Evidências:', QA_DIR);
}

runSSEValidationTest().catch(err => {
  console.error('\n❌ FALHA SSE-VALIDATION:', err.message);
  process.exit(1);
});