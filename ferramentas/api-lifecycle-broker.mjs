// Keeps configuration forwarding restricted to the API child actually created here.
import {configureOwnedLifecycle} from './api-lifecycle-handshake-client.mjs';
export function createOwnedApiBroker({child,reused=false,configure=configureOwnedLifecycle}) {
 let claimed=false;
 return async config=>{
  if(claimed||reused!==false||!child?.connected||config?.owner?.reused!==false||config.owner.apiPid!==child.pid)return false;
  claimed=true;
  return configure(child,config);
 };
}
