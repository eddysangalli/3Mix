import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./empacotar-limpo.mjs',import.meta.url),'utf8');
test('base package includes OBS33 core modules',()=>{
 const line=source.split(String.fromCharCode(10)).find(line=>line.startsWith("for(const folder of ['bin'"));
 assert.ok(line); assert.ok(line.includes("'core'"));
});
test('explicit native rundir also contributes its own core modules',()=>{
 const line=source.split(String.fromCharCode(10)).find(line=>line.startsWith('if(nativeRundir)for(const folder'));
 assert.ok(line); assert.ok(line.includes("'core'"));
});

test('new package and controller helpers stay in the runtime dependency closure',async()=>{
 const {runtimeDependencyClosure}=await import('./pacote-dependencias.mjs');
 const {fileURLToPath}=await import('node:url');
 const tools=fileURLToPath(new URL('./',import.meta.url));
 const panel=fileURLToPath(new URL('../painel/',import.meta.url));
 const files=await runtimeDependencyClosure(tools,['empacotar-limpo.mjs','servidor-api.mjs','iniciar-3mix.mjs'],{copiedModuleRoots:[panel]});
 for(const name of ['pacote-executavel.mjs','plugin-manager.mjs','verificar-versoes-remotas.mjs','ndi-runtime.mjs'])assert.ok(files.includes(name),name);
});
