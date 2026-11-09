import {randomUUID} from 'node:crypto';
// Parent-side IPC handshake. Never logs configuration or terminates children.
export function configureOwnedLifecycle(child,config,{timeoutMs=5000}={}) {
 if(!child?.connected||typeof child.send!=='function')return Promise.resolve(false);
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>15000)return Promise.resolve(false);
 return new Promise(resolve=>{
  const requestId=randomUUID();
  let finished=false;
  const finish=value=>{if(finished)return;finished=true;clearTimeout(timer);child.removeListener('message',message);child.removeListener('disconnect',disconnected);child.removeListener('error',disconnected);child.removeListener('exit',disconnected);resolve(value);};
  const message=data=>{if(data?.type==='3mix-lifecycle-bound'&&data.requestId===requestId)finish(data.success===true);};
  const disconnected=()=>finish(false);
  const timer=setTimeout(disconnected,timeoutMs);
  child.on('message',message);child.once('disconnect',disconnected);child.once('error',disconnected);child.once('exit',disconnected);
  try{child.send({type:'3mix-lifecycle-bind',requestId,config},error=>{if(error)finish(false);});}catch{finish(false);}
 });
}
