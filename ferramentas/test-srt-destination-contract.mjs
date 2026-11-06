import test from 'node:test';
import assert from 'node:assert/strict';
import {srtDestinationOptions} from './saidas-srt.mjs';
test('ordinary 420 destination remains available without advanced capabilities',()=>{assert.deepEqual(srtDestinationOptions({}),{chroma:'420',alphaMode:'none'});});
test('444 and alpha cannot be advertised without motor capabilities',()=>{
 assert.throws(()=>srtDestinationOptions({protocol:'srt',chroma:'444'}),/motor/);
 assert.throws(()=>srtDestinationOptions({protocol:'srt',alphaMode:'fill'}),/motor/);
 assert.throws(()=>srtDestinationOptions({protocol:'rtmp',chroma:'444'}),/SRT/);
});
test('supported 444 uses explicit encoder and does not mutate request',()=>{
 const request={protocol:'srt',chroma:'444',encoder:'obs_x264'};const before=JSON.stringify(request);
 assert.deepEqual(srtDestinationOptions(request,{}, {srtChroma444Supported:true}),{chroma:'444',alphaMode:'none'});assert.equal(JSON.stringify(request),before);
 assert.throws(()=>srtDestinationOptions({...request,encoder:'ffmpeg_nvenc'}, {}, {srtChroma444Supported:true}),/x264/);
});
test('packed alpha width respects actual motor limit',()=>{
 const caps={srtPackedAlpha420Supported:true,srtPackedAlphaSupported:true,srtPackedAlphaMaxWidth:1280};
 assert.throws(()=>srtDestinationOptions({protocol:'srt',alphaMode:'packed',width:1920},{},caps),/1280/);
 assert.deepEqual(srtDestinationOptions({protocol:'srt',alphaMode:'packed',width:1280},{},caps),{chroma:'420',alphaMode:'packed'});
});


test('missing Fill/Key gives maintenance guidance without promising restart upgrades',()=>{
 assert.throws(()=>srtDestinationOptions({protocol:'srt',alphaMode:'fill'}),error=>{
  assert.match(error.message,/pacote 3Mix compatível/);assert.match(error.message,/manutenção/);
  assert.ok(!error.message.includes('ABRIR-FREEMIX'));return true;
 });
});
