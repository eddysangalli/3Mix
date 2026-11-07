import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {packageExecutable} from './pacote-executavel.mjs';
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
