import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { SlideEngine } from '../../ferramentas/apresentacao-slides.mjs';
import { connect } from '../../../../3mix-runtime/ferramentas/obsws.mjs';

const QA_DIR = path.join(process.cwd(), '../../../../qa-replay/evidencias-powerpoint');

async function runAudioVisualTests() {
  console.log('=== SUÍTE DE TESTES: SLIDEENGINE — REPRODUÇÃO AUDIOVISUAL, ÁUDIO & CONTROLES ===\n');

  console.log('[1/4] Conectando ao motor 3Mix / OBS WebSocket...');
  const obs = await connect({ root: path.join(process.cwd(), '../../../../3Mix/3mix-runtime') });
  console.log('✓ Conectado ao OBS WebSocket.');

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
  const deck = await engine.importPptx(pptxPath, 'Apresentação Broadcast Rica');

  // -------------------------------------------------------------
  // TESTE 1: APRESENTAR SLIDE 2 COM VÍDEOS INCORPORADOS E ÁUDIO ROTEADO
  // -------------------------------------------------------------
  console.log('\n[2/4] Apresentando Slide 2 (vídeos incorporados com áudio AAC real)...');
  await engine.presentSlide(deck.id, 2);
  await new Promise(r => setTimeout(r, 1000));

  // Verificar se a fonte de slides tem roteamento de áudio ativo
  const settings = await obs.req('GetInputSettings', { inputName: 'Fonte Slides' });
  console.log('  - reroute_audio configurado:', settings.inputSettings.reroute_audio);
  assert.strictEqual(settings.inputSettings.reroute_audio, true, 'reroute_audio DEVE ser true para enviar o som ao mixer 3Mix');

  // Verificar propriedades de áudio no mixer nativo do OBS
  const volInfo = await obs.req('GetInputVolume', { inputName: 'Fonte Slides' });
  console.log(`  - Volume atual da fonte no mixer: ${volInfo.inputVolumeDb.toFixed(1)} dB (Mul: ${volInfo.inputVolumeMul.toFixed(2)})`);

  // Testar ajuste de ganho/fader operacional (+3dB / -6dB)
  await obs.req('SetInputVolume', { inputName: 'Fonte Slides', inputVolumeDb: -6.0 });
  const volAfter = await obs.req('GetInputVolume', { inputName: 'Fonte Slides' });
  assert(Math.abs(volAfter.inputVolumeDb - (-6.0)) < 0.5, 'Fader de volume deve responder com precisão');
  console.log(`✓ Fader de áudio ajustado com sucesso para ${volAfter.inputVolumeDb.toFixed(1)} dB.`);

  // Testar Mute e Unmute operacional
  await obs.req('SetInputMute', { inputName: 'Fonte Slides', inputMuted: true });
  const muteCheck1 = await obs.req('GetInputMute', { inputName: 'Fonte Slides' });
  assert.strictEqual(muteCheck1.inputMuted, true, 'Fonte deve estar silenciada (Mute=true)');

  await obs.req('SetInputMute', { inputName: 'Fonte Slides', inputMuted: false });
  const muteCheck2 = await obs.req('GetInputMute', { inputName: 'Fonte Slides' });
  assert.strictEqual(muteCheck2.inputMuted, false, 'Fonte deve estar ativa (Mute=false)');
  console.log('✓ Controle de Mute / Unmute operacional validado.');

  // -------------------------------------------------------------
  // TESTE 2: PLAY, PAUSE, SEEK SEM RECRIAR A FONTE (PRESERVA POSIÇÃO)
  // -------------------------------------------------------------
  console.log('\n[3/4] Testando Play/Pause/Seek contínuo sem recriação de fonte...');
  // Capturar UUID da fonte antes dos comandos
  const sceneItemsBefore = await obs.req('GetSceneItemList', { sceneName: 'Slides' });
  const sourceUuidBefore = sceneItemsBefore.sceneItems[0]?.sourceUuid;

  let lastEvent = null;
  engine.on('event', ev => { lastEvent = ev; });

  // Executar Play
  await engine.playVideo(deck.id);
  assert.strictEqual(lastEvent?.action, 'play_video');
  await new Promise(r => setTimeout(r, 400));

  // Executar Pause
  await engine.pauseVideo(deck.id);
  assert.strictEqual(lastEvent?.action, 'pause_video');
  await new Promise(r => setTimeout(r, 400));

  // Executar Seek (tempo 2.5s)
  await engine.seekVideo(deck.id, 2.5);
  assert.strictEqual(lastEvent?.action, 'seek_video');
  assert.strictEqual(lastEvent?.time, 2.5);
  await new Promise(r => setTimeout(r, 400));

  // Verificar que o UUID da fonte NÃO mudou (zero recriação de DOM / OBS source)
  const sceneItemsAfter = await obs.req('GetSceneItemList', { sceneName: 'Slides' });
  const sourceUuidAfter = sceneItemsAfter.sceneItems[0]?.sourceUuid;
  assert.strictEqual(sourceUuidBefore, sourceUuidAfter, 'O UUID da fonte deve ser preservado (sem recriação destrutiva)');
  console.log('✓ Play/Pause/Seek executados sem recriação da fonte: posição do vídeo preservada.');

  // -------------------------------------------------------------
  // TESTE 3: ANIMAÇÕES EM MOVIMENTO CONTÍNUO (SLIDE 3)
  // -------------------------------------------------------------
  console.log('\n[4/4] Validando progressão contínua de animações (Fade, Fly-In, Zoom)...');
  await engine.presentSlide(deck.id, 3);
  await new Promise(r => setTimeout(r, 600));

  const s3 = deck.slides[2];
  assert.strictEqual(s3.currentAnimationStep, 0, 'Passo inicial deve ser 0');

  // Próx. Animação 1 (Fade)
  await engine.nextAnimation(deck.id);
  assert.strictEqual(s3.currentAnimationStep, 1);
  assert.strictEqual(lastEvent?.action, 'next_animation');
  assert.strictEqual(lastEvent?.effect, 'fade');
  console.log('  - Passo 1 acionado: efeito Fade.');

  // Próx. Animação 2 (Fly-In)
  await engine.nextAnimation(deck.id);
  assert.strictEqual(s3.currentAnimationStep, 2);
  assert.strictEqual(lastEvent?.action, 'next_animation');
  assert.strictEqual(lastEvent?.effect, 'fly');
  console.log('  - Passo 2 acionado: efeito Fly-In.');

  // Próx. Animação 3 (Zoom)
  await engine.nextAnimation(deck.id);
  assert.strictEqual(s3.currentAnimationStep, 3);
  assert.strictEqual(lastEvent?.action, 'next_animation');
  assert.strictEqual(lastEvent?.effect, 'zoom');
  console.log('  - Passo 3 acionado: efeito Zoom.');

  obs.close();
  console.log('\n======================================================');
  console.log('TODOS OS TESTES AUDIOVISUAIS FORAM APROVADOS!');
  console.log('======================================================');
}

runAudioVisualTests().catch(err => {
  console.error('\n❌ FALHA NO TESTE AUDIOVISUAL:', err);
  process.exit(1);
});
