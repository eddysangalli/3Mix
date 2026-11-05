import test from 'node:test';import assert from 'node:assert/strict';import {runInNewContext} from 'node:vm';import {GT_RUNTIME_SCRIPT} from './gtzip-runtime.mjs';
test('GTZIP consumes named browser data events for text only, preserving ticker acknowledgement contract',()=>{
 const listeners={},updates=[];const window={addEventListener:(name,fn)=>listeners[name]=fn,FreeMixTitle:{data:[{id:'Headline',type:'text'},{id:'Ticker',type:'ticker'},{id:'Image',type:'image'}]},GC:{update:d=>updates.push(d)}};
 runInNewContext(GT_RUNTIME_SCRIPT,{window,location:{hash:'#'+encodeURIComponent(JSON.stringify({n:'Own',d:{Existing:'keep'}}))}});
 const send=detail=>listeners['freemix-data']({detail});send({name:'Other',values:{Headline:'wrong'}});assert.equal(updates.length,0);
 send({name:'Own',values:{Headline:'Live data',Ticker:'unsafe bypass',Image:'http://remote',Unknown:'ignored'}});
 assert.equal(updates.length,1);assert.equal(updates[0].Headline,'Live data');assert.equal(updates[0].Existing,'keep');assert.equal(Object.hasOwn(updates[0],'Ticker'),false);assert.equal(Object.hasOwn(updates[0],'Image'),false);
 send({name:'Own',values:{Headline:'x'.repeat(2001)}});assert.equal(updates.length,1);
});


import {parseGtXml} from './gtzip-xml.mjs';import {generateHtml} from './gtzip-render.mjs';
test('browser data event reaches actual generated renderer and preserves unrelated text',()=>{
 const html=generateHtml(parseGtXml('<Composition Width="640" Height="360"><TextBlock Name="Headline" Dimensions="300,50,0" Location="0,0,0" Text="Initial" FontSize="28"/></Composition>'));
 const source=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1],listeners={};
 const el={dataset:{fieldName:'Headline'},style:{},classList:{contains:()=>false},textContent:'Initial'};
 const window={addEventListener:(name,fn)=>listeners[name]=fn};const context={window,location:{hash:'#'+encodeURIComponent(JSON.stringify({n:'Own'}))},document:{querySelectorAll:s=>s==='[data-field-name]'?[el]:[],getElementById:()=>({style:{}}),querySelector:()=>null},setInterval(){}};
 runInNewContext(source,context);runInNewContext(GT_RUNTIME_SCRIPT,context);
 listeners['freemix-data']({detail:{name:'Own',values:{Headline:'From table'}}});assert.equal(el.textContent,'From table');
 listeners['freemix-data']({detail:{name:'Other',values:{Headline:'Wrong title'}}});assert.equal(el.textContent,'From table');
});
