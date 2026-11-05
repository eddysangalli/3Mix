import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';
import {excludedFromUpdate,updateRoots} from '../scripts/distribuicao/update-path-policy.mjs';
test('roots resolve repository and workspace from distribution script location',()=>{const script=path.resolve('scripts/distribuicao');assert.equal(updateRoots(script).repo,path.resolve('.'));assert.equal(updateRoots(script).ws,path.resolve('..'));});
test('built-in live GC modules are included',()=>{for(const f of ['core.js','modelos.js','modelos.mjs','render.js','render.mjs','player.mjs'])assert.equal(excludedFromUpdate('painel/gc/biblioteca/'+f),false);});
test('operator titles, assets, catalogues, state and path traversal stay excluded',()=>{for(const p of ['painel/gc/biblioteca/assets/photo.png','painel/gc/biblioteca/custom.html','painel/gc/gt_titles/title.html','painel/gc/catalogo.js','painel/local.js','config/access.json','gravacoes/test.mkv','../outside','painel/../config/private','C:/private','/private'])assert.equal(excludedFromUpdate(p),true,p);});
test('ordinary shipped panel and tools remain updateable',()=>{for(const p of ['painel/remoto/gc.js','ferramentas/srt-presets.mjs'])assert.equal(excludedFromUpdate(p),false);});

import {dependencyUpdatePath} from '../scripts/distribuicao/update-path-policy.mjs';
test('dependency closure cannot bypass protected operator paths',()=>{
 for(const p of ['../config/access.json','../../outside','../painel/local.js','../painel/gc/biblioteca/assets/private.png','C:/private'])assert.throws(()=>dependencyUpdatePath(p));
 assert.equal(dependencyUpdatePath('../painel/gc/biblioteca/modelos.mjs'),'painel/gc/biblioteca/modelos.mjs');
 assert.equal(dependencyUpdatePath('srt-presets.mjs'),'ferramentas/srt-presets.mjs');
});

import {alphaReleaseDocuments} from '../scripts/distribuicao/update-path-policy.mjs';import {access} from 'node:fs/promises';
test('required alpha operating documents exist and are permitted in update',async()=>{
 assert.equal(new Set(alphaReleaseDocuments).size,5);
 for(const doc of alphaReleaseDocuments){assert.equal(excludedFromUpdate(doc),false);await access(new URL('../'+doc,import.meta.url));}
});


test('thumbnail cadence module and its importing desk both ship in panel updates',async()=>{
 const {readFile}=await import('node:fs/promises');
 const desk=await readFile(new URL('../painel/mesa.html',import.meta.url),'utf8');
 assert.ok(desk.includes("import('./thumbnail-cadence.mjs')"));
 for(const file of ['painel/mesa.html','painel/thumbnail-cadence.mjs']){
  assert.equal(excludedFromUpdate(file),false);await access(new URL('../'+file,import.meta.url));
 }
 const packager=await readFile(new URL('../scripts/distribuicao/montar-atualizacao-mesa.mjs',import.meta.url),'utf8');
 assert.ok(packager.includes('p.startsWith("painel/")'));
});


import {validateFrozenFile} from '../scripts/distribuicao/update-path-policy.mjs';
test('native freeze requires exact size and hash before packaging',()=>{
 const hash='a'.repeat(64),f={path:'bin/64bit/obs.dll',bytes:123,sha256:hash};
 assert.doesNotThrow(()=>validateFrozenFile(f,123,hash));
 assert.throws(()=>validateFrozenFile(f,124,hash),/diverge/);
 assert.throws(()=>validateFrozenFile(f,123,'b'.repeat(64)),/diverge/);
 assert.throws(()=>validateFrozenFile({...f,sha256:undefined},123,hash),/incompleto/);
 assert.throws(()=>validateFrozenFile({...f,path:'../outside'},123,hash));
});


test('packager validates native receipt before accessing its file',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../scripts/distribuicao/montar-atualizacao-mesa.mjs',import.meta.url),'utf8');
 const begin=source.indexOf('for (const f of frozen.files)');
 const check=source.indexOf('validateFrozenFile(f,f.bytes ?? f.size,f.sha256)',begin);
 const access=source.indexOf('await fs.lstat(source)',begin);
 assert.ok(begin>=0&&check>begin&&access>check);
});
