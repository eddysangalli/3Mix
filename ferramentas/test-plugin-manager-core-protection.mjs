import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {PluginManager,applyPendingPlugins} from './plugin-manager.mjs';
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
  const snapshot=await manager.snapshot();
  const core=snapshot.plugins.find(plugin=>plugin.id==='obs-browser');
  assert.ok(core,'core module stays visible without native report');
  assert.equal(core.protected,true);
  assert.equal(core.managed,false);
  assert.equal(core.state,'unknown');
  assert.equal(core.compatibility,'unknown');
  assert.equal(core.versionSource,'unknown');
  for (const action of ['disable', 'enable', 'remove', 'rollback']) {
   await assert.rejects(manager.action(action,{id:'obs-browser'}),/protegido/, action);
  }
  await mkdir(join(root,'obs-plugins','64bit'),{recursive:true});
  await writeFile(join(root,'obs-plugins','64bit','legacy-system.dll'),'fixture');
  await mkdir(join(root,'plugins','modern-system'),{recursive:true});
  await writeFile(join(root,'plugins','modern-system','modern-system.dll'),'fixture');
  const allIds=await manager.protectedIds();
  assert.ok(allIds.has('legacy-system'));
  assert.ok(allIds.has('modern-system'));
  for (const id of ['legacy-system','modern-system']) {
   for (const action of ['disable','enable','remove','rollback']) {
    await assert.rejects(manager.action(action,{id}),/protegido/, id+':'+action);
   }
  }
 } finally {await rm(root,{recursive:true,force:true});}
});

test('pending pre-migration operation cannot mutate an OBS33 core module',async()=>{
 const root=join(process.cwd(),'qa-finalizacao','core-queue-protection-'+process.pid);
 const module=join(root,'core','obs-browser','obs-browser.dll');
 const queuePath=join(root,'config','3mix-plugin-manager','queue.json');
 try {
  await mkdir(join(root,'core','obs-browser'),{recursive:true});
  await writeFile(module,'protected-system-fixture');
  await mkdir(join(root,'config','3mix-plugin-manager'),{recursive:true});
  const queue=[{id:'obs-browser',opId:'old-operation',action:'remove'}];
  await writeFile(queuePath,JSON.stringify(queue));
  await assert.rejects(applyPendingPlugins(root),/plugin protegido/);
  assert.equal(await readFile(module,'utf8'),'protected-system-fixture');
  assert.deepEqual(JSON.parse(await readFile(queuePath,'utf8')),queue);
 }finally{await rm(root,{recursive:true,force:true});}
});
