// Conservative snapshot interpretation; no signals, polling, or process termination.
import {win32} from 'node:path';
export function observeEngineExit({expectedExe,enginePid,snapshot,complete}) {
 const unknown={engineExited:false,replacementEnginePresent:true,exitedEnginePid:null};
 if(complete!==true||typeof expectedExe!=='string'||!win32.isAbsolute(expectedExe)||!Number.isSafeInteger(enginePid)||enginePid<=0||!Array.isArray(snapshot))return unknown;
 const normalize=p=>win32.normalize(p).toLowerCase();
 const expected=normalize(expectedExe);
 let original=false,replacement=false;
 for(const row of snapshot){
  if(!row||!Number.isSafeInteger(row.pid)||row.pid<=0||typeof row.exited!=='boolean')return unknown;
  if(row.exited)continue;
  if(typeof row.path!=='string'||!win32.isAbsolute(row.path))return unknown;
  if(row.pid===enginePid){if(normalize(row.path)!==expected)return unknown;original=true;}
  else if(normalize(row.path)===expected)replacement=true;
 }
 return {engineExited:!original,replacementEnginePresent:replacement,exitedEnginePid:original?null:enginePid};
}
