import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {runInNewContext} from 'node:vm';
test('actual SDI UI disables configure/start with confirmed empty inventory',async()=>{
 const source=await readFile(new URL('../painel/remoto/saidas.js',import.meta.url),'utf8');const begin=source.indexOf('function paintSdi(){'),end=source.indexOf('function paintSdiModes()',begin);assert.ok(begin>=0&&end>begin);
 const nodes=new Map();const E=id=>{if(!nodes.has(id))nodes.set(id,{dataset:{signature:'[]'},value:'',disabled:false,textContent:'',innerHTML:'',options:[{},{}]});return nodes.get(id);};
 const context={E,outputs:{sdi:{active:false,capabilities:{decklink:{inventoryKnown:true,inventorySnapshotUsable:true,devices:[]}}}},sdiSlotView(){},paintSdiSlots(){},paintSdiModes(){},FreeMixRemote:{getState:()=>({inputs:[]})},esc:String};
 runInNewContext(source.slice(begin,end)+';paintSdi()',context);assert.equal(E('sdi-start').disabled,true);assert.equal(E('sdi-configure').disabled,true);assert.equal(E('sdi-stop').disabled,true);assert.equal(E('sdi-refresh').disabled,false);assert.match(E('sdi-status').textContent,/nenhuma placa/);
 context.outputs.sdi.capabilities.decklink.inventorySnapshotUsable=false;
 runInNewContext(source.slice(begin,end)+';paintSdi()',context);
 assert.equal(E('sdi-start').disabled,true);assert.equal(E('sdi-configure').disabled,true);assert.match(E('sdi-status').textContent,/cache/);
 context.outputs.sdi.active=true;
 runInNewContext(source.slice(begin,end)+';paintSdi()',context);
 assert.equal(E('sdi-stop').disabled,false);assert.equal(E('sdi-refresh').disabled,true);assert.equal(E('sdi-configure').disabled,true);assert.equal(E('sdi-status').textContent,'SDI ATIVO');
});
