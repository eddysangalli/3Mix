import test from 'node:test';
import assert from 'node:assert/strict';
import {thumbnailIntervalMs, nextThumbnail} from '../painel/thumbnail-cadence.mjs';
test('skip one in N follows both 30 and 60 fps',()=>{
 for (const fps of [30,60]) for (const n of [2,3,5,6,10]) assert.ok(Math.abs(1000/thumbnailIntervalMs(fps,1,n)-fps*(n-1)/n)<1e-9);
 assert.ok(Math.abs(1000/thumbnailIntervalMs(60,1,0)-60)<1e-9);
});
test('rational rates preserved without integer fps rounding',()=>{assert.ok(Math.abs(1000/thumbnailIntervalMs(60000,1001,2)-30000/1001)<1e-9);});
test('invalid cadence rejected',()=>{for(const args of [[0,1,2],[30,0,2],[30,1,1],[30,1,-1],[30,1,2.5],[30,1,Infinity]])assert.throws(()=>thumbnailIntervalMs(...args));});
test('oldest visible input first, invisible and recent sources ignored',()=>{
 const last=new Map([['a',10],['b',20],['hidden',0]]);assert.equal(nextThumbnail(['b','a'],last,100,50),'a');
 last.set('a',100);assert.equal(nextThumbnail(['a','b'],last,100,50),'b');
 last.set('b',100);assert.equal(nextThumbnail(['a','b'],last,100,50),null);assert.equal(nextThumbnail(['new','a'],last,100,50),'new');
});


test('desk inline scripts parse and thumbnail loop cannot change production video settings',async()=>{
 const {readFile}=await import('node:fs/promises');const {Script}=await import('node:vm');
 const html=await readFile(new URL('../painel/mesa.html',import.meta.url),'utf8');
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(s=>s.trim());
 assert.ok(scripts.length>0);for(const source of scripts)new Script(source);
 const begin=html.indexOf('  async function thumbLoop()');const end=html.indexOf('  async function slowLoop()',begin);assert.ok(begin>=0&&end>begin);
 const loop=html.slice(begin,end);assert.ok(loop.includes('cadence.nextThumbnail(names, last, now, interval)'));
 assert.ok(loop.includes('await tryReq("GetSourceScreenshot"'));assert.ok(!loop.includes('SetVideoSettings'));assert.ok(!loop.includes('Promise.all'));
});


test('real desk loop backs off failed source and continues healthy thumbnails serially',async()=>{
 const {readFile}=await import('node:fs/promises');const {runInNewContext}=await import('node:vm');
 const html=await readFile(new URL('../painel/mesa.html',import.meta.url),'utf8');
 const begin=html.indexOf('  async function thumbLoop()');const end=html.indexOf('  async function slowLoop()',begin);
 let now=0,active=0,peak=0;const calls=[],thumbs=new Map(),stop=new Error('finished');
 const context={thumbnailCadence:Promise.resolve({thumbnailIntervalMs,nextThumbnail}),thumbnailSkipControl:{value:'2'},
 st:{scenes:['bad','good'],video:{fpsNumerator:60,fpsDenominator:1},program:'',preview:''},
 performance:{now:()=>now},visibleThumbnailNames:()=>['bad','good'],thumbs,
 CSS:{escape:x=>x},document:{querySelectorAll:()=>[]},
 sleep:async ms=>{now+=ms;if(now>=200)throw stop;},
 tryReq:async(type,data)=>{assert.equal(type,'GetSourceScreenshot');active++;peak=Math.max(peak,active);calls.push({name:data.sourceName,at:now});await Promise.resolve();active--;return data.sourceName==='bad'?null:{imageData:'data:image/jpeg;base64,TEST'};}
 };
 await assert.rejects(runInNewContext(html.slice(begin,end)+';thumbLoop()',context),e=>e===stop);
 assert.equal(peak,1);assert.equal(calls.filter(c=>c.name==='bad').length,1);assert.ok(calls.filter(c=>c.name==='good').length>=3);
 assert.equal(thumbs.has('bad'),false);assert.equal(thumbs.get('good'),'data:image/jpeg;base64,TEST');
});


test('classic CEF loader matches module cadence and is loaded before desk usage',async()=>{
 const {readFile}=await import('node:fs/promises');const {runInNewContext}=await import('node:vm');
 const source=await readFile(new URL('../painel/thumbnail-cadence.js',import.meta.url),'utf8');
 const context={window:{}};runInNewContext(source,context);const classic=context.window.ThreeMixThumbnailCadence;
 for(const fps of [24,30,60,60000]) for(const skip of [0,2,3,5,10,120])
  assert.equal(classic.thumbnailIntervalMs(fps,fps===60000?1001:1,skip),thumbnailIntervalMs(fps,fps===60000?1001:1,skip));
 const last=new Map([['a',10],['b',20]]);assert.equal(classic.nextThumbnail(['a','b'],last,100,50),nextThumbnail(['a','b'],last,100,50));
 const html=await readFile(new URL('../painel/mesa.html',import.meta.url),'utf8');
 const loader=html.indexOf('<script src="thumbnail-cadence.js"></script>');
 assert.ok(loader>=0&&loader<html.search(/const\s+thumbnailCadence\s*=/));
 assert.ok(!html.includes("import('./thumbnail-cadence.mjs')"));
});
