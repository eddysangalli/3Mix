import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {PluginManager} from './plugin-manager.mjs';
test('OBS33 core modules are protected independently of legacy plugins',async()=>{
 const root=join(process.cwd(),'qa-finalizacao','core-protection-'+process.pid);
 try {
  await mkdir(join(root,'core','obs-browser'),{recursive:true});
  await writeFile(join(root,'core','obs-browser','obs-browser.dll'),'fixture');
  await mkdir(join(root,'3mix-plugins','user-effect'),{recursive:true});
  await writeFile(join(root,'3mix-plugins','user-effect','user-effect.dll'),'fixture');
  const manager=new PluginManager({root});
  const ids=await manager.protectedIds();
  assert.ok(ids.has('obs-browser'));
  assert.ok(!ids.has('user-effect'));
  await assert.rejects(manager.action('disable',{id:'obs-browser'}),/protegido/);
 } finally {await rm(root,{recursive:true,force:true});}
});
