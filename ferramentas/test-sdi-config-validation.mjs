import test from 'node:test';import assert from 'node:assert/strict';import {sdiConfig} from './saidas-sdi.mjs';
test('SDI accepts only disabled/internal/external keyer and preserves output isolation',()=>{
 for(const keyer of [0,1,2]){const c=sdiConfig({deviceHash:'QA',modeId:1,keyer},'source');assert.equal(c.keyer,keyer);assert.equal(c.autoStart,false);}
 for(const keyer of [-1,3,999,0.5,Infinity])assert.throws(()=>sdiConfig({deviceHash:'QA',modeId:1,keyer},'source'),/válidos/);
});
