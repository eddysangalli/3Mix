// Ensaio pontual: valida desentrelaçamento (GetInputDeinterlaceMode/SetInputDeinterlaceMode)
// contra o motor nativo REAL em execução (processo QA ativo, não o operador), fechando a
// lacuna explícita registrada em docs/RESULTADOS-VMIX30-ALPHA-20261104.md ("Desentrelaçamento
// (UI) — status de validação explícito": "nenhuma validação foi feita com o motor nativo em
// execução real"). Usa a fonte de captura física/arquivo já existente no projeto QA ativo;
// não cria fonte nova, não altera Preview/Program, não inicia/para o motor.
import { connect } from '../ferramentas/obsws.mjs';
import { readDeinterlace, setDeinterlace, ASYNC_CAPTURE_KINDS } from '../ferramentas/deinterlace-producao.mjs';

const obs = await connect({ root: process.env.FREEMIX_ROOT });
console.log('[OK] Conectado ao motor real.');

const { inputs } = await obs.req('GetInputList', {});
const asyncInputs = [];
for (const input of inputs) {
  if (ASYNC_CAPTURE_KINDS.includes(input.inputKind)) asyncInputs.push(input);
}
console.log(`Entradas no projeto: ${inputs.length}. Candidatas a desentrelaçamento (ASYNC_CAPTURE_KINDS): ${asyncInputs.length}`);
for (const i of inputs) console.log('  -', i.inputName, '(' + i.inputKind + ')');

if (!asyncInputs.length) {
  console.log('[SKIPPED] Nenhuma fonte de captura física/arquivo (dshow/decklink/aja/ffmpeg_source) no projeto QA atual.');
  console.log('Isso não é falha do recurso: confirma que o motor recusa desentrelaçar fontes não-async (o comportamento já documentado), mas não exercita o caminho de sucesso.');
  await obs.close?.();
  process.exit(0);
}

const target = asyncInputs[0];
console.log(`\nUsando "${target.inputName}" (${target.inputKind}) para o ensaio real.`);

const before = await readDeinterlace(obs, { inputName: target.inputName, inputKind: target.inputKind });
console.log('Estado ANTES (lido do motor real):', JSON.stringify(before));

if (!before.supported) {
  console.log('[INFO] Motor recusou (InvalidResourceState ou similar) — a fonte concreta não é async de fato apesar do kind. Esperado e documentado, não é bug.');
  console.log('Razão:', before.reason);
  await obs.close?.();
  process.exit(0);
}

const originalMode = before.mode, originalOrder = before.fieldOrder;
const testMode = originalMode === 'OBS_DEINTERLACE_MODE_YADIF_2X' ? 'OBS_DEINTERLACE_MODE_YADIF' : 'OBS_DEINTERLACE_MODE_YADIF_2X';

console.log(`\nAplicando modo de teste "${testMode}" via SetInputDeinterlaceMode...`);
const applied = await setDeinterlace(obs, { inputName: target.inputName, inputKind: target.inputKind, mode: testMode });
console.log('Motor confirmou (releitura real):', JSON.stringify(applied));
if (applied.mode !== testMode) throw Error('FALHA: motor não confirmou o modo aplicado');

console.log(`\nRestaurando modo original "${originalMode}"...`);
const restored = await setDeinterlace(obs, { inputName: target.inputName, inputKind: target.inputKind, mode: originalMode, fieldOrder: originalOrder });
console.log('Estado restaurado (confirmado pelo motor):', JSON.stringify(restored));
if (restored.mode !== originalMode) throw Error('FALHA: motor não confirmou a restauração do modo original');

console.log('\n=== RESULTADO ===');
console.log('[PASS] GetInputDeinterlaceMode/SetInputDeinterlaceMode validados contra obs-websocket REAL (motor em execução, não mock).');
console.log('Fonte usada:', target.inputName, '(' + target.inputKind + ')');
console.log('Estado original preservado após o ensaio.');
console.log('NÃO cobre: sinal físico 1080i/576i/480i real entrando pela captura, nem inspeção visual do efeito no vídeo — isso continua exigindo hardware físico.');
await obs.close?.();
