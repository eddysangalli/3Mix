import test from 'node:test';import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {spawnSync} from 'node:child_process';import {DiskReplay} from './replay-disco.mjs';
for(const withAudio of [false,true])test('external video import persists decodable clip, audio='+withAudio,async()=>{
 const available=spawnSync('ffmpeg',['-version']);assert.equal(available.status,0,'FFmpeg required for this real-media test');
 const qa=new URL('../qa-finalizacao/',import.meta.url);await mkdir(qa,{recursive:true});const root=await mkdtemp(new URL('replay-import-real-',qa));
 try{
 const input=join(root,'external.mp4');const generated=spawnSync('ffmpeg',['-hide_banner','-v','error','-nostdin','-y','-f','lavfi','-i','testsrc2=size=160x90:rate=30:duration=0.4',...(withAudio?['-f','lavfi','-i','sine=frequency=1000:sample_rate=48000:duration=0.4']:[]),'-c:v','libx264','-pix_fmt','yuv420p',...(withAudio?['-c:a','aac','-shortest']:[]),input],{timeout:15000});assert.equal(generated.status,0,String(generated.stderr));
 const replay=new DiskReplay({root,getObs:()=>{throw Error('Operator motor must not be accessed');}});replay.save=async()=>writeFile(join(root,'events.json'),JSON.stringify(replay.state.events));
 await replay.importClip({file:input,name:'External QA',cam:'Importado'});
 const events=JSON.parse(await readFile(join(root,'events.json'),'utf8'));assert.equal(events.length,1);assert.equal(events[0].imported,true);assert.equal(events[0].cam,'Importado');assert.equal(events[0].clips.length,1);
 const clip=events[0].clips[0];assert.notEqual(clip.file,input);assert.ok(clip.duration>0);
 const decodedMedia=await replay.probe(clip.file);assert.ok(decodedMedia.duration>0);assert.equal(decodedMedia.streams.some(s=>s.codec_type==='audio'),withAudio);
 const decode=spawnSync('ffmpeg',['-v','error','-nostdin','-i',clip.file,'-f','null','-'],{timeout:15000});assert.equal(decode.status,0,String(decode.stderr));
 }finally{await rm(root,{recursive:true,force:true});}
});


test('audio-only file is rejected before creating imported replay events',async()=>{
 const qa=new URL('../qa-finalizacao/',import.meta.url);await mkdir(qa,{recursive:true});const root=await mkdtemp(new URL('replay-audio-only-',qa));
 try{
 const input=join(root,'audio.wav');const result=spawnSync('ffmpeg',['-v','error','-nostdin','-y','-f','lavfi','-i','sine=duration=0.2',input],{timeout:15000});assert.equal(result.status,0,String(result.stderr));
 const replay=new DiskReplay({root,getObs:()=>{throw Error('Operator motor must not be accessed');}});let saved=false;replay.save=async()=>{saved=true;};
 await assert.rejects(replay.importClip({file:input}),/faixa de vídeo/);assert.equal(replay.state.events.length,0);assert.equal(saved,false);
 }finally{await rm(root,{recursive:true,force:true});}
});


test('real import save failure removes generated clip and preserves source',async()=>{
 const qa=new URL('../qa-finalizacao/',import.meta.url);await mkdir(qa,{recursive:true});const root=await mkdtemp(new URL('replay-import-failure-',qa));
 try{
 const input=join(root,'original.mp4');const result=spawnSync('ffmpeg',['-v','error','-nostdin','-y','-f','lavfi','-i','testsrc2=size=160x90:duration=0.2','-c:v','libx264',input],{timeout:15000});assert.equal(result.status,0,String(result.stderr));
 const original=await readFile(input),replay=new DiskReplay({root,getObs:()=>{throw Error('Operator motor must not be accessed');}});let generated;
 replay.save=async()=>{generated=replay.state.events.at(-1).clips[0].file;throw Error('disk full');};
 await assert.rejects(replay.importClip({file:input}),/disk full/);assert.equal(replay.state.events.length,0);assert.deepEqual(await readFile(input),original);await assert.rejects(readFile(generated),{code:'ENOENT'});
 }finally{await rm(root,{recursive:true,force:true});}
});
