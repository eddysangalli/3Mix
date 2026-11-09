// Waits for an installation-matched broker announcement; never launches processes.
export function waitApiBrokerReady(child,installationId,{timeoutMs=45000}={}) {
 if(!child||typeof child.on!=='function'||typeof installationId!=='string'||!installationId||!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>45000)return Promise.reject(Error('Invalid broker readiness configuration'));
 if(child.connected===false||child.exitCode!=null||child.signalCode!=null)return Promise.reject(Error('API broker unavailable before readiness'));
 return new Promise((resolve,reject)=>{
  let done=false;
  const finish=(error,info)=>{if(done)return;done=true;clearTimeout(timer);for(const [event,handler] of [['message',message],['exit',failed],['disconnect',failed],['error',failed]])child.removeListener(event,handler);error?reject(error):resolve(info);};
  const failed=()=>finish(Error('API broker unavailable before readiness'));
  const message=data=>{
   if(data?.type!=='3mix-api-ready')return;
   const info=data.info;
   if(info?.installationId!==installationId||!Number.isSafeInteger(info.pid)||info.pid<=0||!Number.isInteger(info.port)||info.port<1||info.port>65535||typeof info.reused!=='boolean'){finish(Error('API broker identity invalid'));return;}
   finish(null,info);
  };
  const timer=setTimeout(failed,timeoutMs);
  child.on('message',message);child.once('exit',failed);child.once('disconnect',failed);child.once('error',failed);
 });
}
