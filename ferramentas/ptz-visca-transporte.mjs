// VISCA raw-byte transport over TCP or UDP. One connection per physical camera,
// owned and serialized by PTZEngine (ferramentas/ptz-engine.mjs) -- never the UI.
import {Socket} from 'node:net';
import dgram from 'node:dgram';
import {parseViscaReply} from './ptz-visca.mjs';
export class ViscaTransport{
 constructor({host,port,protocol='tcp',timeoutMs=2000}){
  if(!['tcp','udp'].includes(protocol))throw Error('Protocolo VISCA inválido');
  this.host=host;this.port=port;this.protocol=protocol;this.timeoutMs=timeoutMs;
  this.socket=null;this.connected=false;this.buffer=Buffer.alloc(0);this.pending=[];this.onLost=null;
 }
 async connect(){
  if(this.connected)return;
  if(this.protocol==='udp'){
   const s=dgram.createSocket('udp4');
   await new Promise((resolve,reject)=>{
    const onError=e=>{s.removeListener('connect',onConnect);reject(e);};
    const onConnect=()=>{s.removeListener('error',onError);resolve();};
    s.once('error',onError);s.connect(this.port,this.host,onConnect);
   });
   s.on('error',e=>this.lost(e));s.on('message',m=>this.receive(m));
   this.socket=s;this.connected=true;return;
  }
  const s=new Socket();
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{s.destroy();reject(Error('Tempo esgotado ao conectar à câmera VISCA'));},this.timeoutMs);
   s.once('error',e=>{clearTimeout(timer);reject(e);});
   s.connect(this.port,this.host,()=>{clearTimeout(timer);resolve();});
  });
  s.on('error',e=>this.lost(e));s.on('close',()=>this.lost(Error('Conexão VISCA encerrada')));
  s.on('data',chunk=>{this.buffer=Buffer.concat([this.buffer,chunk]);this.drain();});
  this.socket=s;this.connected=true;
 }
 drain(){for(;;){const end=this.buffer.indexOf(0xff);if(end<0)return;const f=this.buffer.subarray(0,end+1);this.buffer=this.buffer.subarray(end+1);this.receive(f);}}
 receive(frameBytes){
  const waiter=this.pending[0];if(!waiter)return;
  try{
   const reply=parseViscaReply(frameBytes);
   if(reply.kind==='ack'){waiter.socket=reply.socket;return;}
   if(waiter.socket!==undefined&&reply.socket!==waiter.socket)return;
   this.pending.shift();clearTimeout(waiter.timer);
   if(reply.kind==='error')waiter.reject(Error('VISCA command rejected: '+reply.code));
   else waiter.resolve(reply);
  }catch(error){this.pending.shift();clearTimeout(waiter.timer);waiter.reject(error);}
 }
 lost(error){const was=this.connected;this.connected=false;for(const w of this.pending.splice(0)){clearTimeout(w.timer);w.reject(error);}if(was&&typeof this.onLost==='function')this.onLost(error);}
 async send(bytes,{expectReply=true}={}){
  if(!this.connected)throw Error('Camera VISCA desconectada');
  if(expectReply&&this.pending.length)throw Error('Consulta VISCA anterior pendente');
  let waiter,reply;
  if(expectReply)reply=new Promise((resolve,reject)=>{
   waiter={resolve,reject,timer:null};
   waiter.timer=setTimeout(()=>{this.pending=this.pending.filter(w=>w!==waiter);reject(Error('Timeout VISCA'));this.close();},this.timeoutMs);
   this.pending.push(waiter);
  });
  // Register the waiter BEFORE sending: loopback and fast devices can reply immediately.
  try{
   if(this.protocol==='udp')await new Promise((resolve,reject)=>this.socket.send(bytes,e=>e?reject(e):resolve()));
   else await new Promise((resolve,reject)=>this.socket.write(bytes,e=>e?reject(e):resolve()));
  }catch(error){this.lost(error);if(reply)await reply.catch(()=>{});throw error;}
  return reply||null;
 }

 close(){this.lost(Error('Transporte VISCA fechado'));try{this.socket?.destroy?.();this.socket?.close?.();}catch{/* already closing */}}
}
