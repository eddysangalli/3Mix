import test from 'node:test';import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {spawnSync} from 'node:child_process';import {DiskReplay} from './replay-disco.mjs';
test('external video import creates independently decodable replay clip and persisted event',async()=>{
 const available=spawnSync('ffmpeg',['-version']);assert.equal(available.status,0,'FFmpeg required for this real-media test');
 const qa=new URL('../qa-finalizacao/',import.meta.url);await mkdir(qa,{recursive:true});const root=await mkdtemp(new URL('replay-import-real-',qa));
 try{
 const input=join(root,'external.mp4');const generated=spawnSync('ffmpeg',['-hide_banner','-v','error','-nostdin','-y','-f','lavfi','-i','testsrc2=size=160x90:rate=30:duration=0.4','-c:v','libx264','-pix_fmt','yuv420p',input],{timeout:15000});assert.equal(generated.status,0,String(generated.stderr));
 const replay=new DiskReplay({root,getObs:()=>{throw Error('Operator motor must not be accessed');}});replay.save=async()=>writeFile(join(root,'events.json'),JSON.stringify(replay.state.events));
 await replay.importClip({file:input,name:'External QA',cam:'Importado'});
 const events=JSON.parse(await readFile(join(root,'events.json'),'utf8'));assert.equal(events.length,1);assert.equal(events[0].imported,true);assert.equal(events[0].cam,'Importado');assert.equal(events[0].clips.length,1);
 const clip=events[0].clips[0];assert.notEqual(clip.file,input);assert.ok(clip.duration>0);
 const decodedMedia=await replay.probe(clip.file);assert.ok(decodedMedia.duration>0);
 const decode=spawnSync('ffmpeg',['-v','error','-nostdin','-i',clip.file,'-f','null','-'],{timeout:15000});assert.equal(decode.status,0,String(decode.stderr));
 }finally{await rm(root,{recursive:true,force:true});}
});
