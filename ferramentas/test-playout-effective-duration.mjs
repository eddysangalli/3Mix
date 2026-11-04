import test from 'node:test';import assert from 'node:assert/strict';
import {playoutItemDurationMs,MediaPlayoutEngine} from './media-playout-engine.mjs';
test('trimmed duration respects IN/OUT and known source length',()=>{
 assert.equal(playoutItemDurationMs({durationMs:10000,inMs:2000,outMs:8000}),6000);
 assert.equal(playoutItemDurationMs({durationMs:10000,inMs:2000,outMs:12000}),8000);
 assert.equal(playoutItemDurationMs({durationMs:10000,inMs:2000}),8000);
});
test('unknown, malformed and reversed ranges do not invent duration',()=>{
 for(const item of [{},{durationMs:NaN},{durationMs:1000,inMs:2000},{durationMs:1000,inMs:900,outMs:500}])assert.equal(playoutItemDurationMs(item),0);
 assert.equal(playoutItemDurationMs({outMs:8000,inMs:2000}),6000);
});
test('summary uses effective rather than raw duration without changing end behavior',()=>{
 const e=new MediaPlayoutEngine({});e.lists=[{id:'list',name:'test',items:[{id:'a',durationMs:10000,inMs:2000,outMs:8000},{id:'b',durationMs:5000}]}];e.activeListId='list';
 assert.equal(e.summary().lists[0].totalDurationMs,11000);
});

import {readFile} from 'node:fs/promises';import {runInNewContext} from 'node:vm';
test('real playlist UI and backend agree on bounded trim totals',async()=>{
 const source=await readFile(new URL('../painel/remoto/playout.js',import.meta.url),'utf8');
 const start=source.indexOf('  function updatePlaylistTotals('); const end=source.indexOf(String.fromCharCode(10)+'  }',start)+4; const block=source.slice(start,end); assert.ok(start>=0);
 const box={innerHTML:''};const context={plTotalInfo:box,formatTCShort:v=>String(v)};runInNewContext(block+';this.paint=updatePlaylistTotals;',context);
 context.paint({activeList:{items:[{id:'a',durationMs:10000,inMs:2000,outMs:12000}]},program:{item:{id:'a'},positionMs:3000}});
 assert.match(box.innerHTML,/<b>DUR:<\/b> 8000/);assert.match(box.innerHTML,/<b>POS:<\/b> 1000/);assert.match(box.innerHTML,/<b>REM:<\/b> -7000/);
});

test('navigation and totals skip disabled clips and reject disabled TAKE',async()=>{
 const e=new MediaPlayoutEngine({});e.lists=[{id:'list',items:[{id:'a',durationMs:1000},{id:'b',durationMs:2000,enabled:false},{id:'c',durationMs:3000}],loop:true}];e.activeListId='list';
 assert.equal(e._findNextItem(e.lists[0],0).id,'c');assert.equal(e._findNextItem(e.lists[0],2).id,'a');assert.equal(e.summary().lists[0].totalDurationMs,4000);
 await assert.rejects(e.take({item:e.lists[0].items[1]}),/desabilitado/);
});

test('Auto Next false holds at end instead of taking the following item',async()=>{
 const e=new MediaPlayoutEngine({});e.lists=[{id:'list',items:[{id:'a'},{id:'b'}]}];e.activeListId='list';e.state.program.item={id:'a',autoNext:false};e.state.program.endBehavior='play_next';e.state.automation.active=true;e.state.automation.autoAdvance=true;e.take=async()=>{throw Error('unexpected TAKE');};await e._handleEndBehavior();assert.equal(e.state.program.status,'frozen');
});

test('enable state rejects invalid payload and rolls back when persistence fails',async()=>{
 const e=new MediaPlayoutEngine({});e.lists=[{id:'list',items:[{id:'a',durationMs:1000}]}];e.activeListId='list';e.save=async()=>{throw Error('disk');};
 await assert.rejects(e.execute('playout_item_update',{itemId:'a',enabled:'false'}),/inválido/);
 await assert.rejects(e.execute('playout_item_update',{itemId:'a',enabled:false}),/disk/);assert.equal(Object.hasOwn(e.lists[0].items[0],'enabled'),false);
});

import {mkdir,mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';
test('legacy normalization preserves explicit enabled and Auto Next states',()=>{
 const e=new MediaPlayoutEngine({});const l=e._normalizeLegacyList({items:[{enabled:false,autoNext:false},{autoAdvance:false},{}]});
 assert.equal(l.items[0].enabled,false);assert.equal(l.items[0].autoNext,false);assert.equal(l.items[1].autoNext,false);assert.equal(l.items[2].enabled,true);assert.equal(l.items[2].autoNext,true);
});
test('playlist enabled state survives real save and reload',async()=>{
 const base=path.resolve('qa-finalizacao/playout-persistence');await mkdir(base,{recursive:true});const root=await mkdtemp(path.join(base,'run-'));
 try{
 const e=new MediaPlayoutEngine({root});await e.setScope('QA');await e.execute('playout_save_playlist',{id:'list',items:[{id:'a',durationMs:10000,inMs:2000,outMs:8000,enabled:false},{id:'b',durationMs:1000}]});
 const reload=new MediaPlayoutEngine({root});await reload.setScope('QA');assert.equal(reload.lists[0].items[0].enabled,false);assert.equal(reload.summary().lists[0].totalDurationMs,1000);assert.equal(reload._findNextItem(reload.lists[0],-1).id,'b');
 }finally{await rm(root,{recursive:true,force:true});}
});

import {normalizeOperationalStep} from './automacao-operacional.mjs';
test('macro enable shortcut uses validated shared playlist dispatcher',async()=>{
 const engine=new MediaPlayoutEngine({});engine.lists=[{id:'list',items:[{id:'a'}]}];engine.activeListId='list';engine.save=async()=>{};
 const step=normalizeOperationalStep({playoutEngine:engine},{action:'playout_item_enabled',data:{itemId:'a',enabled:false}});
 await engine.execute(step.action,step.data);assert.equal(engine.lists[0].items[0].enabled,false);
 assert.throws(()=>normalizeOperationalStep({playoutEngine:engine},{action:step.action,data:{itemId:'missing',enabled:true}}));
});
