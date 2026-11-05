import test from 'node:test';
import assert from 'node:assert/strict';
import {inventario} from './diagnostico-maquina.mjs';

test('real machine inventory includes platform ReBAR status without fabricating app support',async()=>{
 const r=await inventario();
 assert.ok(r.resizableBar);assert.ok(['active','inactive','undetermined'].includes(r.resizableBar.status));
 if(r.gpus.some(g=>/nvidia/i.test(g.nome)))assert.equal(r.resizableBar.vendor,'nvidia');
 console.log('INVENTORY ReBAR:',JSON.stringify(r.resizableBar));
});
