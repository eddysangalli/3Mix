import test from 'node:test';import assert from 'node:assert/strict';import {createMediaPickerClient} from '../painel/remoto/media-picker-client.mjs';
test('selected path is returned only after confirmed status',async()=>{const actions=[];const p=createMediaPickerClient({wait:async()=>{},request:async d=>{actions.push(d.action);return d.action==='start'?{success:true,token:'qa'}:{success:true,state:'selected',path:'D:/qa/video.mp4'};}});assert.equal(await p.select('video'),'D:/qa/video.mp4');assert.deepEqual(actions,['start','status']);});
test('cancel returns null and double click starts only one dialog',async()=>{let starts=0;const p=createMediaPickerClient({request:async d=>d.action==='start'?(starts++,{success:true,token:'qa'}):{success:true,state:'cancelled'}});assert.deepEqual(await Promise.all([p.select('audio'),p.select('audio')]),[null,null]);assert.equal(starts,1);});
test('uncertain start is not retried automatically',async()=>{let calls=0;const p=createMediaPickerClient({request:async()=>{calls++;throw Error('timeout uncertain');}});await assert.rejects(p.select('video'),/uncertain/);assert.equal(calls,1);});
test('pending timeout does not recreate dialog',async()=>{let starts=0;const p=createMediaPickerClient({maxPolls:2,wait:async()=>{},request:async d=>d.action==='start'?(starts++,{success:true,token:'qa'}):{success:true,state:'pending'}});await assert.rejects(p.select('video'),/não foi confirmada/);assert.equal(starts,1);});

test('uncertain start blocks a later click rather than opening a second dialog',async()=>{
 let calls=0;const p=createMediaPickerClient({request:async()=>{calls++;throw Error('transport lost');}});await assert.rejects(p.select('video'),/transport lost/);await assert.rejects(p.select('video'),/resultado incerto/);assert.equal(calls,1);
});
test('explicit cancellation permits a subsequent selection',async()=>{
 let starts=0;const p=createMediaPickerClient({request:async d=>d.action==='start'?(starts++,{success:true,token:'qa'}):{success:true,state:'cancelled'}});assert.equal(await p.select('audio'),null);assert.equal(await p.select('video'),null);assert.equal(starts,2);
});

test('confirmed terminal error permits another attempt',async()=>{let starts=0;const p=createMediaPickerClient({request:async d=>d.action==='start'?(starts++,{success:true,token:'qa'}):{success:true,state:'error',error:'file unavailable'}});await assert.rejects(p.select('video'),/file unavailable/);await assert.rejects(p.select('video'),/file unavailable/);assert.equal(starts,2);});
test('client source is strict UTF8 without replacement characters',async()=>{const {readFile}=await import('node:fs/promises');const bytes=await readFile(new URL('../painel/remoto/media-picker-client.mjs',import.meta.url));const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);assert.ok(!text.includes(String.fromCharCode(65533)));});

test('status transport failure resumes the same token without another start',async()=>{
 let starts=0,statuses=0;const tokens=[];
 const p=createMediaPickerClient({request:async d=>{
  if(d.action==='start'){starts++;return {success:true,token:'retained-token'};}
  tokens.push(d.token);if(++statuses===1)throw Error('status transport lost');
  return {success:true,state:'selected',path:'D:/qa/recovered.mp4'};
 }});
 await assert.rejects(p.select('video'),/status transport lost/);
 assert.equal(await p.select('video'),'D:/qa/recovered.mp4');
 assert.equal(starts,1);assert.deepEqual(tokens,['retained-token','retained-token']);
});
test('poll timeout resumes existing picker and confirmed cancel allows fresh start',async()=>{
 let starts=0,cancel=false;
 const p=createMediaPickerClient({maxPolls:1,wait:async()=>{},request:async d=>d.action==='start'?(starts++,{success:true,token:'same'}):{success:true,state:cancel?'cancelled':'pending'}});
 await assert.rejects(p.select('audio'),/não foi confirmada/);cancel=true;
 assert.equal(await p.select('audio'),null);assert.equal(starts,1);
 assert.equal(await p.select('video'),null);assert.equal(starts,2);
});

test('pending video cannot be consumed by an audio selection after timeout',async()=>{
 let starts=0,selected=false;
 const p=createMediaPickerClient({maxPolls:1,wait:async()=>{},request:async d=>d.action==='start'?(starts++,{success:true,token:'video-operation'}):selected?{success:true,state:'selected',path:'D:/qa/video.mp4'}:{success:true,state:'pending'}});
 await assert.rejects(p.select('video'),/não foi confirmada/);
 await assert.rejects(p.select('audio'),/outro tipo pendente/);assert.equal(starts,1);
 selected=true;assert.equal(await p.select('video'),'D:/qa/video.mp4');
 assert.equal(await p.select('audio'),'D:/qa/video.mp4');assert.equal(starts,2);
});
test('different media type is rejected during an active request',async()=>{
 let release;const gate=new Promise(r=>release=r);let starts=0;
 const p=createMediaPickerClient({request:async d=>{if(d.action==='start'){starts++;await gate;return {success:true,token:'active'};}return {success:true,state:'cancelled'};}});
 const first=p.select('video');await assert.rejects(p.select('audio'),/outro tipo pendente/);release();assert.equal(await first,null);assert.equal(starts,1);
});
