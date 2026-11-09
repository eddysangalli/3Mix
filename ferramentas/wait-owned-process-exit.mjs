// Observe only: never sends signals or terminates a child.
export function waitOwnedProcessExit(child,{timeoutMs=5000}={}) {
 if(!child||typeof child.once!=='function'||!Number.isFinite(timeoutMs)||timeoutMs<=0)return Promise.resolve({exited:false});
 if(child.exitCode!=null||child.signalCode!=null)return Promise.resolve({exited:true,code:child.exitCode,signal:child.signalCode});
 return new Promise(resolve=>{
  let done=false;
  const finish=result=>{if(done)return;done=true;clearTimeout(timer);child.removeListener('exit',exited);child.removeListener('error',failed);resolve(result);};
  const exited=(code,signal)=>finish({exited:true,code,signal});
  const failed=()=>finish({exited:false});
  const timer=setTimeout(failed,timeoutMs);
  child.once('exit',exited);child.once('error',failed);
 });
}
