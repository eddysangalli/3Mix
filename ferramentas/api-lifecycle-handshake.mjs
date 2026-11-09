// Install only on an actual parent/child IPC connection; never on HTTP.
export function attachLifecycleHandshake({channel,bind}) {
 if(!channel||typeof channel.on!=='function'||typeof channel.send!=='function'||typeof bind!=='function')throw Error('Private IPC channel required');
 let claimed=false,disconnected=channel.connected===false,binding=null;
 const closeBinding=()=>{const resource=binding;binding=null;if(resource&&typeof resource.close==='function'){try{Promise.resolve(resource.close()).catch(()=>{});}catch{}}};
 const disconnect=()=>{disconnected=true;closeBinding();};
 channel.on('disconnect',disconnect);
 const reply=(success,requestId)=>{
  if(channel.connected===false)return;
  try{channel.send({type:'3mix-lifecycle-bound',success,...(requestId===undefined?{}:{requestId})},()=>{});}catch{}
 };
 const listener=async message=>{
  if(disconnected||message?.type!=='3mix-lifecycle-bind')return;
  if(claimed){reply(false,message.requestId);return;}
  claimed=true;
  try {binding=await bind(message.config);if(disconnected||channel.connected===false){closeBinding();return;}reply(true,message.requestId);
   // The IPC message listener must not retain an otherwise stopped service.
   channel.channel?.unref?.();}
  catch {reply(false,message.requestId);}
 };
 channel.on('message',listener);
 return ()=>{channel.removeListener('message',listener);channel.removeListener('disconnect',disconnect);disconnect();};
}
