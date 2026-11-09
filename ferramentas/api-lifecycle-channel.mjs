// Local named-pipe transport. Not connected to production startup yet.
import net from 'node:net';
import {performance} from 'node:perf_hooks';
import {authorizeApiShutdown,authenticateLifecycleRequest} from './api-lifecycle-guard.mjs';
export async function listenLifecycle({endpoint,owner,readState,onShutdown,inspectionDeadlineMs=20000}) {
  if(typeof endpoint!=='string'||!endpoint||typeof readState!=='function'||typeof onShutdown!=='function')throw Error('Invalid lifecycle configuration');
  if(!Number.isFinite(inspectionDeadlineMs)||inspectionDeadlineMs<=0||inspectionDeadlineMs>20000)throw Error('Invalid inspection deadline');
  // Retain a private snapshot; caller mutations cannot change authorization.
  owner=Object.freeze({...owner});
  let consumed=false;
  const sockets=new Set();
  const server=net.createServer(socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
    socket.setTimeout(1000,()=>socket.destroy());let bytes=0,parts=[];let handled=false;
    socket.on('data',async chunk=>{
      if(handled)return;bytes+=chunk.length;if(bytes>4096){handled=true;socket.destroy();return;}parts.push(chunk);
      const data=Buffer.concat(parts);if(!data.includes(10))return;handled=true;
      // Windows CIM collection has its own 15s deadline. Keep the short timeout
      // for incomplete messages, but allow a bounded inspection/cleanup phase.
      socket.setTimeout(inspectionDeadlineMs);
      const deadline=performance.now()+inspectionDeadlineMs;
      try {
        const request=JSON.parse(data.subarray(0,data.indexOf(10)).toString('utf8'));
        if(consumed||!authenticateLifecycleRequest(owner,request)){socket.end('denied'+String.fromCharCode(10));return;}
        const state=await readState();
        if(socket.destroyed || !socket.writable) return;
        if(performance.now()>=deadline){socket.end('denied'+String.fromCharCode(10));return;}
        if(consumed||!authorizeApiShutdown(owner,request,state)){socket.end('denied'+String.fromCharCode(10));return;}
        consumed=true;
        const outcome=await onShutdown();
        socket.end((outcome?.success===false?'denied':'accepted')+String.fromCharCode(10));
      }catch{socket.end('denied'+String.fromCharCode(10));}
    });
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(endpoint,()=>{server.removeListener('error',reject);resolve();});});
  // The control listener must not keep an otherwise stopped API alive.
  server.unref();
  return {close:()=>new Promise((resolve,reject)=>{for(const socket of sockets)socket.destroy();server.close(e=>e?reject(e):resolve());})};
}
export function requestLifecycleShutdown(endpoint,request){
  return new Promise((resolve,reject)=>{
    const socket=net.createConnection(endpoint);let result='';
    socket.setTimeout(22000,()=>socket.destroy(Error('Lifecycle timeout')));
    socket.on('error',reject);socket.on('connect',()=>socket.write(JSON.stringify(request)+String.fromCharCode(10)));
    socket.on('data',chunk=>{result+=chunk;if(result.length>64)socket.destroy(Error('Invalid lifecycle response'));});
    socket.on('end',()=>resolve(result.trim()==='accepted'));
    // A peer may close without a complete response: never leave the caller pending.
    socket.on('close',()=>resolve(false));
  });
}
