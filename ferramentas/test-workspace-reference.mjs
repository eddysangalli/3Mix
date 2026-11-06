import test from 'node:test';
import assert from 'node:assert/strict';
import {validateWorkspace,workspaceDefaults} from './workspace-config.mjs';
test('workspace defaults validate without changing dimensions',()=>{assert.deepEqual(validateWorkspace({...workspaceDefaults}),workspaceDefaults);});
test('dock tabs remain distinct and copied independently',()=>{const v={...workspaceDefaults,dockTabs:[['mixer','list'],['replay','dsk']]};const out=validateWorkspace(v);assert.deepEqual(out.dockTabs,v.dockTabs);out.dockTabs[0].push('ptz');assert.equal(v.dockTabs[0].length,2);});
test('duplicate or unknown dock tabs rejected',()=>{for(const tabs of [[['mixer'],['mixer']],[['unknown'],[]],[['mixer']]])assert.throws(()=>validateWorkspace({...workspaceDefaults,dockTabs:tabs}));});
test('invalid widths and foreign fields rejected',()=>{for(const patch of [{cardWidth:119},{cardWidth:321},{cardWidth:180.5},{sideWidth:279},{sideWidth:4001},{audioLeft:'false'},{operatorPath:'x'}])assert.throws(()=>validateWorkspace({...workspaceDefaults,...patch}));});

import {handleWorkspaceRequest} from './workspace-config.mjs';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
test('concurrent saves with same revision cannot overwrite each other',async()=>{
 const base=fileURLToPath(new URL('../qa-finalizacao/workspace-tests/',import.meta.url));await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'case-'));
 try{
  const events=[];const call=async values=>{let result;await handleWorkspaceRequest({path:'/api/workspace',req:{method:'POST'},res:{},root,local:()=>true,body:async()=>values,json:(_res,status,data)=>{result={status,data};},production:{optional:async(_type,data)=>events.push(data)}});return result;};
  const results=await Promise.all([call({...workspaceDefaults,cardWidth:180,expectedRevision:0}),call({...workspaceDefaults,cardWidth:240,expectedRevision:0})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);const saved=JSON.parse(await readFile(join(root,'config/3mix-workspace.json'),'utf8'));assert.equal(saved.revision,1);assert.equal(saved.cardWidth,180);assert.equal(events.length,1);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('corrupt workspace is preserved and rejected instead of silently reset',async()=>{
 const base=fileURLToPath(new URL('../qa-finalizacao/workspace-tests/',import.meta.url));await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'case-'));
 try{await mkdir(join(root,'config'));const file=join(root,'config/3mix-workspace.json');const invalid='{broken workspace';await writeFile(file,invalid);
 await assert.rejects(handleWorkspaceRequest({path:'/api/workspace',req:{method:'GET'},res:{},root,local:()=>true,json:()=>{throw Error('unexpected success');}}),/preservado/);assert.equal(await readFile(file,'utf8'),invalid);
 }finally{await rm(root,{recursive:true,force:true});}
});
