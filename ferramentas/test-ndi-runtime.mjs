import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,mkdtemp,rm,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {inspectNdiBinary,prepareNdiRuntime,NDI_SDK_SHA256,NDI_DLL} from './ndi-runtime.mjs';

// Checked against the real installed binary and licenses (3mix-runtime/), not mocks.
const RUNTIME_ROOT='D:/DRIVE/IA/antigravity/3Mix/3mix-runtime';
const REAL_RUNTIME=join(RUNTIME_ROOT,'runtime/ndi-v6',NDI_DLL);
const REAL_LICENSES=join(RUNTIME_ROOT,'licenses/ndi-runtime');

test('real installed NDI binary inspects as pinned 6.3.2.0 with v6 API present',async()=>{
 const bytes=await readFile(REAL_RUNTIME);
 const info=inspectNdiBinary(bytes);
 assert.equal(info.version,'6.3.2.0');assert.equal(info.sha256,NDI_SDK_SHA256);assert.equal(info.architecture,'x64');
});

test('prepareNdiRuntime accepts a real copy of the installed binary and licenses, rejects when unpinned',async()=>{
 const root=await mkdtemp(join(tmpdir(),'ndi-runtime-qa-'));
 try{
  const dir=join(root,'runtime/ndi-v6');await mkdir(dir,{recursive:true});
  await copyFile(REAL_RUNTIME,join(dir,NDI_DLL));
  const licDir=join(root,'licenses/ndi-runtime');await mkdir(licDir,{recursive:true});
  for(const name of['NDI SDK License Agreement.pdf','Processing.NDI.Lib.Licenses.txt','PROVENANCE.json','TERMS.md'])
   await copyFile(join(REAL_LICENSES,name),join(licDir,name));
  const env={};const receipt=await prepareNdiRuntime(root,{env,writeReceipt:false});
  assert.equal(receipt.version,'6.3.2.0');assert.equal(receipt.globallyInstalled,false);assert.equal(env.NDI_RUNTIME_DIR_V6,dir);
  await writeFile(join(dir,NDI_DLL),'tampered content, wrong size entirely');
  await assert.rejects(prepareNdiRuntime(root,{env:{},writeReceipt:false}),/NDI incompleto|inválida/);
 }finally{await rm(root,{recursive:true,force:true});}
});
