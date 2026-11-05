import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeClockMessage,setClockMessage} from './relogios-comandos.mjs';
import {MacroEngine} from './macros-producao.mjs';
test('macro and controller normalization share bounded clock action',()=>{const m=new MacroEngine({});assert.deepEqual(m.normalize({action:'clock_message',data:{slot:2,message:' AVISO '}}),{action:'clock_message',data:{slot:2,message:'AVISO'}});for(const d of [{slot:0,message:'a'},{slot:1,message:'a'.repeat(41)},{slot:1,message:'a'+String.fromCharCode(10)+'b'}])assert.throws(()=>normalizeClockMessage(d));});
test('clock persists and confirms before broadcasting, preserving other slots',async()=>{let value=[{type:'rec'},{type:'stream'},{type:'clock'}];const calls=[];const p={req:async(t,d)=>{calls.push(t);if(t==='GetPersistentData')return {slotValue:structuredClone(value)};if(t==='SetPersistentData')value=structuredClone(d.slotValue);return {};}};await setClockMessage(p,{slot:2,message:'ATENÇÃO'});assert.equal(value[0].type,'rec');assert.equal(value[2].type,'clock');assert.equal(value[1].message,'ATENÇÃO');assert.deepEqual(calls,['GetPersistentData','SetPersistentData','GetPersistentData','BroadcastCustomEvent']);});
test('failed readback never broadcasts success',async()=>{const calls=[];await assert.rejects(setClockMessage({req:async t=>{calls.push(t);return {slotValue:[]};}},{slot:1,message:'a'}),/confirmada/);assert.ok(!calls.includes('BroadcastCustomEvent'));});


import {ControllerEngine} from './controlador-producao.mjs';
test('saved keyboard controller dispatches clock message once on press, never on release',async()=>{
 const calls=[];const p={execute:async(action,data)=>calls.push({action,data})};p.macroEngine=new MacroEngine(p);
 const controller=new ControllerEngine(p),item={id:'clock-shortcut',enabled:true,trigger:{type:'keyboard'},target:{action:'clock_message',data:{slot:3,message:'AVISO'}}};
 const clientId='11111111-1111-4111-8111-111111111111';
 await controller.fire(item,{clientId,phase:'down'});await controller.fire(item,{clientId,phase:'up'});
 assert.deepEqual(calls,[{action:'clock_message',data:{slot:3,message:'AVISO'}}]);assert.equal(controller.feedback[item.id].success,true);
});
