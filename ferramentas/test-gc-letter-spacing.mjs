import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {models, defaults, normalizeData} from '../painel/gc/biblioteca/modelos.mjs';
import {renderGraphic} from '../painel/gc/biblioteca/render.mjs';

test('legacy titles preserve zero spacing across all templates',()=>{
 for(const m of models){
  assert.equal(defaults(m.id).letterSpacing,0);
  assert.equal(normalizeData(m.id,{}).letterSpacing,0);
 }
});
test('spacing is rendered by the production SVG renderer',()=>{
 const id=models[0].id;
 assert.match(renderGraphic(id,{letterSpacing:2.5}),/letter-spacing="2.5"/);
 assert.match(renderGraphic(id,{letterSpacing:-2}),/letter-spacing="-2"/);
});
test('spacing rejects invalid values before render/save',()=>{
 for(const value of [NaN,Infinity,-6,31,'invalid'])assert.throws(()=>normalizeData(models[0].id,{letterSpacing:value}));
});
test('browser and backend model/renderer contracts remain aligned',async()=>{
 const dir=new URL('../painel/gc/biblioteca/',import.meta.url);
 for(const name of ['modelos','render']){
  const a=await readFile(new URL(name+'.js',dir),'utf8');
  const b=await readFile(new URL(name+'.mjs',dir),'utf8');
  assert.equal(a.replaceAll('./modelos.js','./modelos.mjs').trim(),b.trim());
 }
});
