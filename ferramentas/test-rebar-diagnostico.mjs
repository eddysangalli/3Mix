import test from 'node:test';
import assert from 'node:assert/strict';
import {detectResizableBar} from './rebar-diagnostico.mjs';

test('nvidia-smi absent reports undetermined, never a false bar1 size claim',async()=>{
 const run=async()=>{const e=new Error('not found');e.code='ENOENT';throw e;};
 const r=await detectResizableBar({run});
 assert.equal(r.status,'undetermined');assert.equal(r.vendor,'unknown');assert.match(r.reason,/indispon/);
});

test('BAR1 close to total VRAM is reported as bar1_large (a signal, not a confirmed negotiation)',async()=>{
 const calls=[];
 const run=async(cmd,args)=>{calls.push(args);
  if(args.includes('--query-gpu=name,memory.total'))return {stdout:'NVIDIA GeForce RTX 4060 Laptop GPU, 8188'};
  return {stdout:'    BAR1 Memory Usage\n        Total                                          : 8192 MiB\n        Used                                           : 8163 MiB\n        Free                                           : 29 MiB\n'};
 };
 const r=await detectResizableBar({run});
 assert.equal(r.status,'bar1_large');assert.equal(r.vendor,'nvidia');assert.equal(r.totalMiB,8188);assert.equal(r.bar1MiB,8192);assert.equal(calls.length,2);
 assert.match(r.reason,/consistente com/);assert.match(r.reason,/não confirma a negociação/);
});

test('legacy 256MiB BAR1 is reported bar1_legacy, not silently upgraded',async()=>{
 const run=async(cmd,args)=>args.includes('--query-gpu=name,memory.total')?{stdout:'NVIDIA GeForce GTX 1650, 4096'}:{stdout:'    BAR1 Memory Usage\n        Total                                          : 256 MiB\n        Used                                           : 100 MiB\n        Free                                           : 156 MiB\n'};
 const r=await detectResizableBar({run});
 assert.equal(r.status,'bar1_legacy');assert.equal(r.bar1MiB,256);
});

test('malformed or missing driver output never crashes nor fabricates a status',async()=>{
 const badName=async()=>({stdout:''});
 assert.equal((await detectResizableBar({run:badName})).status,'undetermined');
 const badDetail=async(cmd,args)=>args.includes('--query-gpu=name,memory.total')?{stdout:'NVIDIA X, 8188'}:{stdout:'no BAR1 section here'};
 assert.equal((await detectResizableBar({run:badDetail})).status,'undetermined');
 const secondCallFails=async(cmd,args)=>{if(args.includes('--query-gpu=name,memory.total'))return {stdout:'NVIDIA X, 8188'};throw new Error('detail query failed');};
 const r=await detectResizableBar({run:secondCallFails});assert.equal(r.status,'undetermined');assert.equal(r.gpu,'NVIDIA X');
});

test('status vocabulary never uses active/inactive, which would overclaim PCIe negotiation',async()=>{
 const r=await detectResizableBar({run:async()=>({stdout:'NVIDIA X, 100'})});
 assert.ok(!['active','inactive'].includes(r.status));
});

test("this machine's real nvidia-smi returns a determinate shape with the corrected field",async()=>{
 const r=await detectResizableBar();
 assert.ok(['bar1_large','bar1_legacy','undetermined'].includes(r.status));
 if(r.status!=='undetermined'){assert.equal(r.vendor,'nvidia');assert.ok(r.totalMiB>0);assert.ok(r.bar1MiB>0);console.log('REAL GPU RESULT:',JSON.stringify(r));}
 else console.log('REAL GPU UNDETERMINED:',r.reason);
});
