import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {runInNewContext} from 'node:vm';
test('actual table renderer restores scroll after DOM replacement',async()=>{
 const source=await readFile(new URL('../painel/remoto/playout.js',import.meta.url),'utf8');
 const start=source.indexOf('  function renderTable(items)');const end=source.indexOf('  function cell(',start);assert.ok(start>=0&&end>start);
 const scroll={scrollTop:350,scrollLeft:90};let body='old';const table={closest:()=>scroll,get innerHTML(){return body;},set innerHTML(v){body=v;scroll.scrollTop=0;scroll.scrollLeft=0;}};
 const context={plTbody:table,tableSignature:()=> 'changed',lastTableSignature:'old',state:{},document:{}};
 runInNewContext(source.slice(start,end)+';renderTable([])',context);
 assert.equal(scroll.scrollTop,350);assert.equal(scroll.scrollLeft,90);assert.ok(body.includes('colspan'));
});
