import test from 'node:test';import assert from 'node:assert/strict';import {sdiConfig} from './saidas-sdi.mjs';
test('SDI accepts only disabled/internal/external keyer and preserves output isolation',()=>{
 for(const keyer of [0,1,2]){const c=sdiConfig({deviceHash:'QA',modeId:1,keyer},'source');assert.equal(c.keyer,keyer);assert.equal(c.autoStart,false);}
 for(const keyer of [-1,3,999,0.5,Infinity])assert.throws(()=>sdiConfig({deviceHash:'QA',modeId:1,keyer},'source'),/válidos/);
});


test('SDI rejects empty/null/boolean numeric selections instead of coercing to a valid mode',()=>{
 for(const field of ['modeId','keyer','audioTrack'])for(const value of ['', ' ',null,true,false,[]])assert.throws(()=>sdiConfig({deviceHash:'QA',modeId:1,[field]:value},'source'),/válidos/);
 assert.equal(sdiConfig({deviceHash:'QA',modeId:'1',keyer:'0',audioTrack:'2'},'source').audioTrack,2);
});
