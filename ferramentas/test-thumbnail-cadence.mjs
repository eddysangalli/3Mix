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
