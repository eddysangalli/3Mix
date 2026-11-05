import test from 'node:test';import assert from 'node:assert/strict';import {runInNewContext} from 'node:vm';import {GT_RUNTIME_SCRIPT} from './gtzip-runtime.mjs';
test('GTZIP consumes named browser data events for text only, preserving ticker acknowledgement contract',()=>{
 const listeners={},updates=[];const window={addEventListener:(name,fn)=>listeners[name]=fn,FreeMixTitle:{data:[{id:'Headline',type:'text'},{id:'Ticker',type:'ticker'},{id:'Image',type:'image'}]},GC:{update:d=>updates.push(d)}};
 runInNewContext(GT_RUNTIME_SCRIPT,{window,location:{hash:'#'+encodeURIComponent(JSON.stringify({n:'Own',d:{Existing:'keep'}}))}});
 const send=detail=>listeners['freemix-data']({detail});send({name:'Other',values:{Headline:'wrong'}});assert.equal(updates.length,0);
 send({name:'Own',values:{Headline:'Live data',Ticker:'unsafe bypass',Image:'http://remote',Unknown:'ignored'}});
 assert.equal(updates.length,1);assert.equal(updates[0].Headline,'Live data');assert.equal(updates[0].Existing,'keep');assert.equal(Object.hasOwn(updates[0],'Ticker'),false);assert.equal(Object.hasOwn(updates[0],'Image'),false);
 send({name:'Own',values:{Headline:'x'.repeat(2001)}});assert.equal(updates.length,1);
 send({name:'Own',values:{Headline:'invalid'+String.fromCharCode(0)}});assert.equal(updates.length,1);
 send({name:'Own',values:{Headline:'line one'+String.fromCharCode(10)+'line two'}});assert.equal(updates.length,2);
});


import {parseGtXml} from './gtzip-xml.mjs';import {generateHtml} from './gtzip-render.mjs';
test('browser data event reaches actual generated renderer and preserves unrelated text',()=>{
 const html=generateHtml(parseGtXml('<Composition Width="640" Height="360"><TextBlock Name="Headline" Dimensions="300,50,0" Location="0,0,0" Text="Initial" FontSize="28"/></Composition>'));
 const source=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1],listeners={};
 const el={dataset:{fieldName:'Headline'},style:{},classList:{contains:name=>name==='gt-text'},textContent:'Initial'};
 const window={addEventListener:(name,fn)=>listeners[name]=fn};const context={window,location:{hash:'#'+encodeURIComponent(JSON.stringify({n:'Own'}))},document:{querySelectorAll:s=>s==='[data-field-name]'?[el]:[],getElementById:()=>({style:{}}),querySelector:()=>null},setInterval(){}};
 runInNewContext(source,context);runInNewContext(GT_RUNTIME_SCRIPT,context);
 listeners['freemix-data']({detail:{name:'Own',values:{Headline:'From table'}}});assert.equal(el.textContent,'From table');
 listeners['freemix-data']({detail:{name:'Other',values:{Headline:'Wrong title'}}});assert.equal(el.textContent,'From table');
 listeners['freemix-data']({detail:{name:'Own',values:{HeadlineColor:'#12ab34'}}});assert.equal(el.style.color,'#12ab34');assert.equal(el.textContent,'From table');
 for(const color of ['red','url(http://invalid)','#fff','#123456;display:none'])listeners['freemix-data']({detail:{name:'Own',values:{HeadlineColor:color}}});
 assert.equal(el.style.color,'#12ab34');
 listeners['freemix-data']({detail:{name:'Other',values:{HeadlineColor:'#ffffff'}}});assert.equal(el.style.color,'#12ab34');
});


test('actual central publisher emits mapped text/color to the named browser source',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('./controle-producao.mjs',import.meta.url),'utf8');
 const begin=source.indexOf('  async publishData('),end=source.indexOf('  async execute(',begin);assert.ok(begin>=0&&end>begin);
 const publish=runInNewContext('({'+source.slice(begin,end)+'}).publishData',{}),events=[];
 const context={dataSources:{mapped:()=>({kind:'browser',target:'source-uuid',data:{Headline:'Table text',HeadlineColor:'#12ab34'}})},state:{calls:{}},req:async()=>({inputs:[{inputUuid:'source-uuid',inputName:'QA GTZIP',inputKind:'browser_source'}]}),vendor:async(...args)=>events.push(args)};
 await publish.call(context,'table');assert.equal(events.length,1);assert.equal(events[0][0],'emit_event');assert.equal(events[0][1].event_name,'freemix-data');assert.equal(events[0][1].event_data.name,'QA GTZIP');assert.equal(events[0][1].event_data.values.HeadlineColor,'#12ab34');assert.equal(events[0][2],'obs-browser');
});
