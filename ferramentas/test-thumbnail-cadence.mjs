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
