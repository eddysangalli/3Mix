import {randomUUID} from 'node:crypto';
export class GlobalHotkeys {
 constructor(p){this.p=p;this.clientId=randomUUID();this.scope=null;this.fingerprint=null;this.available=false;this.error=null;this.pressed=new Set();this.lastPing=0;this.nextTry=0;}
 summary(){return {available:this.available,scope:this.scope,error:this.error,count:this.count||0,pressed:[...this.pressed],backend:'Hotkeys globais nativas do motor; respeitam preferências de foco do OBS'};}
 async sync(){const scope=this.p.scope,bindings=this.p.controllerEngine.items.filter(i=>i.enabled&&i.trigger.type==='keyboard'&&i.trigger.global===true).map(i=>({id:i.id,name:i.name,...i.trigger}));const fingerprint=JSON.stringify([scope,bindings]);
  if(fingerprint!==this.fingerprint&&Date.now()>=this.nextTry){try{await this.p.controllerEngine.execute('controller_release',{clientId:this.clientId});this.pressed.clear();const reply=await this.p.vendor('control',{action:'configure',scope,bindings},'freemix-hotkeys');if(!reply?.global)throw Error('Motor sem suporte a teclas globais');this.scope=scope;this.fingerprint=fingerprint;this.count=bindings.length;this.available=true;this.error=null;this.nextTry=0;}catch(e){this.available=false;this.error=e.message;this.nextTry=Date.now()+5000;}}
  if(this.pressed.size&&Date.now()-this.lastPing>=600){this.lastPing=Date.now();await this.p.controllerEngine.execute('controller_hold_ping',{clientId:this.clientId}).catch(e=>{this.error=e.message;});}
  return this.summary();
 }
 event(data){if(!this.available||data.scope!==this.p.scope||data.scope!==this.scope||typeof data.pressed!=='boolean')return;const item=this.p.controllerEngine.items.find(i=>i.id===data.id&&i.enabled&&i.trigger.type==='keyboard'&&i.trigger.global===true);if(!item)return;if(data.pressed)this.pressed.add(data.id);else this.pressed.delete(data.id);this.p.run('controller_fire',{id:item.id,clientId:this.clientId,phase:data.pressed?'down':'up'}).catch(e=>{this.error=e.message;});}
 async close(){this.available=false;this.fingerprint=null;this.scope=null;this.nextTry=0;this.pressed.clear();await this.p.controllerEngine.execute('controller_release',{clientId:this.clientId});}
 disconnected(){this.available=false;this.fingerprint=null;this.scope=null;this.nextTry=0;this.pressed.clear();this.p.controllerEngine.execute('controller_release',{clientId:this.clientId}).catch(()=>{});}
}
