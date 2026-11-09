// Read-only bridge between Windows enumeration and conservative interpretation.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {observeEngineExit} from './api-engine-observation.mjs';
const run=promisify(execFile);
export async function readEngineObservation({expectedExe,enginePid}) {
 const unknown=()=>observeEngineExit({expectedExe,enginePid,complete:false,snapshot:[]});
 if(process.platform!=='win32'||!Number.isSafeInteger(enginePid)||enginePid<=0)return unknown();
 try {
  const {stdout}=await run('powershell.exe',['-NoProfile','-File',fileURLToPath(new URL('./collect-engine-snapshot.ps1',import.meta.url)),'-ObservedEnginePid',String(enginePid)],{windowsHide:true,timeout:15000,maxBuffer:1024*1024});
  const data=JSON.parse(stdout.replace(/^﻿/,''));
  return observeEngineExit({expectedExe,enginePid,snapshot:data.snapshot,complete:data.complete});
 }catch{return unknown();}
}
