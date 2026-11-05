import test from 'node:test';import assert from 'node:assert/strict';import {runInNewContext} from 'node:vm';import {GT_RUNTIME_SCRIPT} from './gtzip-runtime.mjs';
test('GTZIP consumes named browser data events for text only, preserving ticker acknowledgement contract',()=>{
 const listeners={},updates=[];const window={addEventListener:(name,fn)=>listeners[name]=fn,FreeMixTitle:{data:[{id:'Headline',type:'text'},{id:'Ticker',type:'ticker'},{id:'Image',type:'image'}]},GC:{update:d=>updates.push(d)}};
 runInNewContext(GT_RUNTIME_SCRIPT,{window,location:{hash:'#'+encodeURIComponent(JSON.stringify({n:'Own',d:{Existing:'keep'}}))}});
 const send=detail=>listeners['freemix-data']({detail});send({name:'Other',values:{Headline:'wrong'}});assert.equal(updates.length,0);
 send({name:'Own',values:{Headline:'Live data',Ticker:'unsafe bypass',Image:'http://remote',Unknown:'ignored'}});
 assert.equal(updates.length,1);assert.equal(updates[0].Headline,'Live data');assert.equal(updates[0].Existing,'keep');assert.equal(Object.hasOwn(updates[0],'Ticker'),false);assert.equal(Object.hasOwn(updates[0],'Image'),false);
 send({name:'Own',values:{Headline:'x'.repeat(2001)}});assert.equal(updates.length,1);
});
