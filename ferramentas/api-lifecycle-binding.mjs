// Explicit opt-in binding; no public HTTP route and no environment-token logging.
import {win32} from 'node:path';
import {realpath} from 'node:fs/promises';
import {listenLifecycle} from './api-lifecycle-channel.mjs';
import {readEngineObservation} from './read-engine-observation.mjs';
export async function bindOwnedApiLifecycle({config,stop,installationRoot,resolvePhysical=realpath,listen=listenLifecycle,observe=readEngineObservation}) {
 if(config==null)return null;
 const {endpoint,expectedExe}=config;
 const owner=Object.freeze({...config.owner});
 const prefix=String.fromCharCode(92).repeat(2)+'.'+String.fromCharCode(92)+'pipe'+String.fromCharCode(92)+'3mix-lifecycle-';
 if(typeof endpoint!=='string'||!endpoint.startsWith(prefix)||!/^[a-f0-9-]{36}$/.test(endpoint.slice(prefix.length))||owner?.reused!==false||owner.apiPid!==process.pid||!Number.isSafeInteger(owner.enginePid)||owner.enginePid<=0||typeof owner.token!=='string'||!/^[a-f0-9]{64}$/.test(owner.token)||typeof owner.installationId!=='string'||!owner.installationId||typeof owner.instanceId!=='string'||!owner.instanceId||typeof expectedExe!=='string'||!win32.isAbsolute(expectedExe)||typeof stop!=='function')throw Error('Invalid private lifecycle binding');
 if(installationRoot!==undefined){
  if(typeof installationRoot!=='string'||!win32.isAbsolute(installationRoot))throw Error('Invalid installation root');
  const expected=win32.normalize(expectedExe).toLowerCase();
  const allowed=['3Mix.exe','FreeMix.exe'].map(name=>win32.join(installationRoot,'bin','64bit',name).toLowerCase());
  if(!allowed.includes(expected))throw Error('Executable outside installation');
  const physicalRoot=win32.normalize(await resolvePhysical(installationRoot)).toLowerCase();
  const physicalExe=win32.normalize(await resolvePhysical(expectedExe)).toLowerCase();
  const physicalAllowed=['3Mix.exe','FreeMix.exe'].map(name=>win32.join(physicalRoot,'bin','64bit',name).toLowerCase());
  if(!physicalAllowed.includes(physicalExe))throw Error('Executable redirected outside installation');
 }
 return listen({endpoint,owner,readState:async()=>({...await observe({expectedExe,enginePid:owner.enginePid}),apiPid:process.pid,installationId:owner.installationId,instanceId:owner.instanceId}),onShutdown:async()=>{
  const outcome=await stop();
  if(outcome?.success!==true||outcome.failures!==0)throw Error('Cooperative cleanup not confirmed');
  return outcome;
 }});
}
