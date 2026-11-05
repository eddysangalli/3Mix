import test from 'node:test';import assert from 'node:assert/strict';
import {ControllerEngine} from './controlador-producao.mjs';import {MacroEngine} from './macros-producao.mjs';
test('failed shortcut save never activates unpersisted clock binding',async()=>{
 const p={state:{connected:true}};p.macroEngine=new MacroEngine(p);const engine=new ControllerEngine(p),before=engine.items;engine.save=async()=>{throw Error('disk full');};
 await assert.rejects(engine.execute('controller_save',{name:'Clock QA',trigger:{type:'keyboard',code:'F8'},target:{action:'clock_message',data:{slot:3,message:'AVISO'}}}),/disk full/);
 assert.equal(engine.items,before);assert.equal(engine.items.length,0);
});
