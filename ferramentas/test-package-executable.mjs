import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {packageExecutable,packageFfmpegModule} from './pacote-executavel.mjs';
test('package prefers 3Mix, supports legacy explicitly, rejects missing executable',async()=>{
 const root=join(process.cwd(),'qa-finalizacao','package-executable-'+process.pid);
 try {
  await mkdir(join(root,'bin','64bit'),{recursive:true});
  assert.throws(()=>packageExecutable(root),/sem executável/);
  await writeFile(join(root,'bin','64bit','FreeMix.exe'),'fixture');
  assert.equal(packageExecutable(root),'bin/64bit/FreeMix.exe');
  await writeFile(join(root,'bin','64bit','3Mix.exe'),'fixture');
  assert.equal(packageExecutable(root),'bin/64bit/3Mix.exe');
 } finally {await rm(root,{recursive:true,force:true});}
});

test('directory masquerading as 3Mix.exe is rejected rather than using legacy silently',async()=>{
 const root=join(process.cwd(),'qa-finalizacao','package-invalid-executable-'+process.pid);
 try {
  await mkdir(join(root,'bin','64bit','3Mix.exe'),{recursive:true});
  await writeFile(join(root,'bin','64bit','FreeMix.exe'),'fixture');
  assert.throws(()=>packageExecutable(root),/arquivo regular/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('native ffmpeg identity prefers OBS33 core instead of stale legacy copy',async()=>{
 const root=join(process.cwd(),'qa-finalizacao','package-ffmpeg-'+process.pid);
 try{
  await mkdir(join(root,'obs-plugins','64bit'),{recursive:true});
  await writeFile(join(root,'obs-plugins','64bit','obs-ffmpeg.dll'),'legacy');
  assert.equal(packageFfmpegModule(root),'obs-plugins/64bit/obs-ffmpeg.dll');
  await mkdir(join(root,'core','obs-ffmpeg'),{recursive:true});
  await writeFile(join(root,'core','obs-ffmpeg','obs-ffmpeg.dll'),'core');
  assert.equal(packageFfmpegModule(root),'core/obs-ffmpeg/obs-ffmpeg.dll');
 }finally{await rm(root,{recursive:true,force:true});}
});
