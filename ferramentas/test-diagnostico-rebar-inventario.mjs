import test from 'node:test';
import assert from 'node:assert/strict';
import {inventario} from './diagnostico-maquina.mjs';

test('real machine inventory includes BAR1 size signal without claiming confirmed ReBAR negotiation',async()=>{
 const r=await inventario();
 assert.ok(r.resizableBar);assert.ok(['bar1_large','bar1_legacy','undetermined'].includes(r.resizableBar.status));
 assert.ok(!['active','inactive'].includes(r.resizableBar.status));
 if(r.gpus.some(g=>/nvidia/i.test(g.nome)))assert.equal(r.resizableBar.vendor,'nvidia');
 console.log('INVENTORY ReBAR:',JSON.stringify(r.resizableBar));
});
