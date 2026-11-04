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
