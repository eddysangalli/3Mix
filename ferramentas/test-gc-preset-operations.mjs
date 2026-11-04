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
