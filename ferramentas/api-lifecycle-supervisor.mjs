// Supervises only the child object supplied by its creator. Never kills a process.
import {requestLifecycleShutdown} from './api-lifecycle-channel.mjs';
export function superviseOwnedEngine({child,owner,endpoint,requestShutdown=requestLifecycleShutdown}) {
 if(owner?.reused!==false||!child||child.pid!==owner.enginePid||typeof child.once!=='function')return Promise.resolve({requested:false,reason:'ownership-unconfirmed'});
 owner=Object.freeze({...owner});
 return new Promise(resolve=>{
  let handled=false;
  const finish=async()=>{
   if(handled)return;handled=true;child.removeListener('exit',finish);child.removeListener('error',error);
   try {const accepted=await requestShutdown(endpoint,{action:'shutdown',installationId:owner.installationId,instanceId:owner.instanceId,token:owner.token});resolve({requested:true,accepted});}
   catch {resolve({requested:true,accepted:false,reason:'channel-unavailable'});}
  };
  const error=()=>{if(handled)return;handled=true;child.removeListener('exit',finish);resolve({requested:false,reason:'child-error'});};
  child.once('exit',finish);child.once('error',error);
  if(child.exitCode!=null||child.signalCode!=null)void finish();
 });
}
