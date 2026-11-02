// Per-device movement leases. No production queue: Stop must not wait for video work.
import {randomUUID} from 'node:crypto';
export class PTZLeases {
 constructor({stop,suspendTracking,now=Date.now,ttlMs=1200}) {
  if(typeof stop!=='function'||typeof suspendTracking!=='function')throw Error('PTZ safety hooks required');
  this.stop=stop;this.suspendTracking=suspendTracking;this.now=now;this.ttlMs=ttlMs;this.items=new Map();this.pending=new Map();this.errors=new Map();
  this.timer=setInterval(()=>{this.expire().catch(()=>{});},100);this.timer.unref();
 }
 async acquire(device,owner) {
  if(typeof device!=='string'||!device||typeof owner!=='string'||!owner)throw Error('Device and owner required');
  if(this.items.has(device)||this.pending.has(device))throw Error('Camera already controlled');
  const reservation={cancelled:false};this.pending.set(device,reservation);
  try {
   // Fail closed: a failed tracking suspension never grants manual movement.
   await this.suspendTracking(device);
   await this.stop(device);
   if(reservation.cancelled)throw Error('PTZ acquisition cancelled');
   const item={token:randomUUID(),owner,deadline:this.now()+this.ttlMs};
   this.items.set(device,item);return {token:item.token,ttlMs:this.ttlMs};
  } finally {if(this.pending.get(device)===reservation)this.pending.delete(device);}
 }
 check(device,token) {
  const item=this.items.get(device);
  if(!item||item.token!==token||item.deadline<=this.now())throw Error('PTZ lease expired or invalid');
  return item;
 }
 ping(device,token){const item=this.check(device,token);item.deadline=this.now()+this.ttlMs;}
 async release(device,token) {
  const item=this.items.get(device);
  if(token!==undefined&&item?.token!==token)throw Error('PTZ lease invalid');
  const pending=this.pending.get(device);if(pending)pending.cancelled=true;
  this.items.delete(device);
  try{await this.stop(device);this.errors.delete(device);}catch(error){this.errors.set(device,'Stop not confirmed');throw error;}
 }
 async expire(){
  const expired=[...this.items].filter(([,item])=>item.deadline<=this.now());
  await Promise.allSettled(expired.map(([device])=>this.release(device)));
 }
 async close(){clearInterval(this.timer);for(const item of this.pending.values())item.cancelled=true;await Promise.allSettled([...this.items.keys()].map(device=>this.release(device)));}
}
