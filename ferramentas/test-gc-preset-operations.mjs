import test from 'node:test';
import assert from 'node:assert/strict';
import {GCLibraryEngine} from './gc-biblioteca-producao.mjs';
function fixture(){const e=new GCLibraryEngine({state:{overlays:[]}});e.items=[{id:'a'},{id:'b'},{id:'c'}];e.save=async()=>{};return e;}
test('reorder preserves records and validates complete permutation',async()=>{
 const e=fixture(),old=e.items[2];await e.execute('gc_library_reorder',{ids:['c','a','b']});assert.equal(e.items[0],old);
 for(const ids of [['a'],['a','a','c'],['a','b','unknown']])await assert.rejects(e.execute('gc_library_reorder',{ids}));
});
test('batch removal validates every member before modifying library',async()=>{
 const e=fixture();e.p.state.overlays=[{scene:'3Mix GC b'}];await assert.rejects(e.execute('gc_library_remove_many',{ids:['a','b']}));assert.equal(e.items.length,3);
 e.p.state.overlays=[];await e.execute('gc_library_remove_many',{ids:['a','b']});assert.deepEqual(e.items,[{id:'c'}]);
});
test('save failure restores library for reorder and batch removal',async()=>{
 for(const [action,ids] of [['gc_library_reorder',['c','b','a']],['gc_library_remove_many',['a']]]){
 const e=fixture();e.save=async()=>{throw Error('disk failure');};await assert.rejects(e.execute(action,{ids}));assert.deepEqual(e.items.map(i=>i.id),['a','b','c']);
 }
});

import {models,defaults} from '../painel/gc/biblioteca/modelos.mjs';
function styledFixture(){const e=fixture();e.items=e.items.map((i,n)=>({...i,template:models[0].id,data:defaults(models[0].id),...(n<2?{syncGroup:'group'}:{})}));return e;}
test('batch style preserves text/geometry and updates linked versions',async()=>{
 const e=styledFixture(),before=e.items[0].data.title;await e.execute('gc_library_style_many',{ids:['a'],style:{letterSpacing:3}});
 assert.equal(e.items[0].data.letterSpacing,3);assert.equal(e.items[1].data.letterSpacing,3);assert.equal(e.items[2].data.letterSpacing,0);assert.equal(e.items[0].data.title,before);
});
test('batch style rejects on-air linked sibling and unsafe/invalid properties atomically',async()=>{
 const e=styledFixture();e.p.state.program='3Mix GC b';await assert.rejects(e.execute('gc_library_style_many',{ids:['a'],style:{letterSpacing:3}}));assert.equal(e.items[0].data.letterSpacing,0);
 e.p.state.program='';for(const style of [{title:'replace text'},{offsetX:20},{letterSpacing:100}])await assert.rejects(e.execute('gc_library_style_many',{ids:['a'],style}));assert.equal(e.items[0].data.letterSpacing,0);
});
test('batch style restores previous records on persistence failure',async()=>{
 const e=styledFixture();e.save=async()=>{throw Error('disk');};await assert.rejects(e.execute('gc_library_style_many',{ids:['a'],style:{letterSpacing:2}}));assert.equal(e.items[0].data.letterSpacing,0);
});

import {mkdir,mkdtemp,rm} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import path from 'node:path';
test('batch operations survive disk reload without mocked save',async()=>{
 const base=path.resolve('qa-finalizacao/gc-library-persistence');await mkdir(base,{recursive:true});const root=await mkdtemp(path.join(base,'run-'));
 try{
  const host={root,state:{overlays:[]}},engine=new GCLibraryEngine(host);await engine.setScope('QA');
  const ids=[randomUUID(),randomUUID()];engine.items=ids.map((id,n)=>({id,name:'QA '+n,template:models[0].id,data:defaults(models[0].id),channel:1}));await engine.save();
  await engine.execute('gc_library_style_many',{ids,style:{letterSpacing:2}});await engine.execute('gc_library_reorder',{ids:[...ids].reverse()});
  const reload=new GCLibraryEngine(host);await reload.setScope('QA');assert.deepEqual(reload.items.map(i=>i.id),[...ids].reverse());assert.ok(reload.items.every(i=>i.data.letterSpacing===2));
  await reload.execute('gc_library_remove_many',{ids:[ids[0]]});const final=new GCLibraryEngine(host);await final.setScope('QA');assert.deepEqual(final.items.map(i=>i.id),[ids[1]]);
 }finally{await rm(root,{recursive:true,force:true});}
});
