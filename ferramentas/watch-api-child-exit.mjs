// Attach before shutdown so an early child-exit announcement cannot be missed.
export function watchApiChildExit(broker,apiPid){
 if(!broker||typeof broker.on!=='function'||!Number.isSafeInteger(apiPid)||apiPid<=0)throw Error('Invalid API exit observer');
 let observed=null,waiters=[],closed=false;
 const message=data=>{if(!closed&&!observed&&data?.type==='3mix-api-exited'&&data.apiPid===apiPid&&((Number.isInteger(data.code)&&data.signal===null)||(data.code===null&&typeof data.signal==='string'&&data.signal.length>0))){observed={exited:true,code:data.code,signal:data.signal};for(const notify of [...waiters])notify(observed);}};
 broker.on('message',message);
 return {
 wait:({timeoutMs=5000}={})=>(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>30000)?Promise.resolve({exited:false}):observed?Promise.resolve(observed):closed?Promise.resolve({exited:false}):new Promise(resolve=>{
  const notify=result=>{clearTimeout(timer);waiters=waiters.filter(w=>w!==notify);resolve(result);};
  const timer=setTimeout(()=>notify({exited:false}),timeoutMs);waiters.push(notify);
 }),
 close:()=>{closed=true;broker.removeListener('message',message);for(const notify of [...waiters])notify({exited:false});}
 };
}
