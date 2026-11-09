// Fail-closed authorization for a private, installation-owned shutdown channel.
// This module does not open a listener, send signals, or terminate processes.
import { timingSafeEqual } from 'node:crypto';
export function authorizeApiShutdown(owner, request, state) {
  if (!owner || !request || !state) return false;
  if (owner.reused !== false || state.engineExited !== true || state.replacementEnginePresent !== false) return false;
  if (!Number.isSafeInteger(owner.apiPid) || owner.apiPid <= 0 || state.apiPid !== owner.apiPid) return false;
  if (!Number.isSafeInteger(owner.enginePid) || owner.enginePid <= 0 || state.exitedEnginePid !== owner.enginePid) return false;
  if (typeof owner.installationId !== 'string' || !owner.installationId || request.installationId !== owner.installationId || state.installationId !== owner.installationId) return false;
  if (typeof owner.instanceId !== 'string' || !owner.instanceId || request.instanceId !== owner.instanceId || state.instanceId !== owner.instanceId) return false;
  if (request.action !== 'shutdown') return false;
  if (typeof owner.token !== 'string' || !/^[a-f0-9]{64}$/.test(owner.token) || typeof request.token !== 'string' || !/^[a-f0-9]{64}$/.test(request.token)) return false;
  return timingSafeEqual(Buffer.from(owner.token, 'hex'), Buffer.from(request.token, 'hex'));
}

// Authenticate before expensive process enumeration. State authorization remains mandatory.
export function authenticateLifecycleRequest(owner, request) {
 if(!owner || !request || owner.reused!==false || request.action!=='shutdown')return false;
 if(typeof owner.installationId!=='string'||!owner.installationId||request.installationId!==owner.installationId)return false;
 if(typeof owner.instanceId!=='string'||!owner.instanceId||request.instanceId!==owner.instanceId)return false;
 if(typeof owner.token!=='string'||!/^[a-f0-9]{64}$/.test(owner.token)||typeof request.token!=='string'||!/^[a-f0-9]{64}$/.test(request.token))return false;
 return timingSafeEqual(Buffer.from(owner.token,'hex'),Buffer.from(request.token,'hex'));
}
