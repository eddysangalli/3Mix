import test from 'node:test';
import assert from 'node:assert/strict';
import {MixEffectsEngine} from './mix-effects-producao.mjs';
function fixture({cycle=false,wrong=false}={}){
 const calls=[];const p={scene:key=>({key,name:'CAM QA'}),inputEngine:{cycle:async()=>cycle},vendor:async(type,data)=>{calls.push({type,data});return {success:true,previewUuid:'target',mixes:[{mixId:2,previewUuid:'target'},{mixId:3,previewUuid:wrong?'other':'target'}]};}};
 return {engine:new MixEffectsEngine(p),calls};
}
test('preview M/E 3 uses its own native mixId, never MAIN',async()=>{const {engine,calls}=fixture();const r=await engine.dispatch({command:'preview',mixId:3,input:'target'});assert.equal(r.selected.mixId,3);assert.deepEqual(calls,[{type:'control_mix',data:{action:'preview',mixId:3,uuid:'target'}}]);});
test('root or M/E 2 matching target cannot confirm a wrong M/E 3',async()=>{const {engine}=fixture({wrong:true});await assert.rejects(engine.dispatch({command:'preview',mixId:3,input:'target'}),/confirmou/);});
test('cycle rejected before native mutation',async()=>{const {engine,calls}=fixture({cycle:true});await assert.rejects(engine.dispatch({command:'preview',mixId:3,input:'target'}),/ciclo/);assert.equal(calls.length,0);});
test('MAIN cannot enter independent ME adapter',async()=>{const {engine,calls}=fixture();await assert.rejects(engine.dispatch({command:'preview',mixId:1,input:'target'}),/Selecione/);assert.equal(calls.length,0);});
