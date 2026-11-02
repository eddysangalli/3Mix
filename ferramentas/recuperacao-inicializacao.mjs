// Per-installation launch serialization and bounded support logs. Never terminates processes.
import {open,readFile,lstat,mkdir,unlink,rename,appendFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {redactDiagnostic} from './diagnostico-producao.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function noLinks(path){for(let p=resolve(path);;p=dirname(p)){const s=await lstat(p).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(s?.isSymbolicLink())throw Error('Link recusado no registro de inicialização');if(dirname(p)===p)break;}}
export async function startupRecord(root,event,data={}){
 try{const folder=join(resolve(root),'logs');await noLinks(folder);await mkdir(folder,{recursive:true});const path=join(folder,'startup.ndjson');await noLinks(path);const stat=await lstat(path).catch(()=>null);if(stat?.size>1024*1024){const previous=path+'.1.ndjson';await noLinks(previous);await unlink(previous).catch(e=>{if(e.code!=='ENOENT')throw e;});await rename(path,previous);}const text=redactDiagnostic(JSON.stringify(data),[],[resolve(root),process.env.USERPROFILE,process.env.TEMP]);await appendFile(path,JSON.stringify({at:new Date().toISOString(),event:String(event).slice(0,80),pid:process.pid,data:text})+'\n',{mode:0o600});}catch{/* Diagnostics must not prevent the operator from starting the application. */}
}
export async function acquireStartupLock(root,{name='launcher',timeoutMs=60000}={}){
 if(!['launcher','api'].includes(name)||!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>120000)throw Error('Bloqueio de abertura inválido');
 root=resolve(root);const folder=join(root,'config/obs-studio/plugin_config/freemix-control');await noLinks(folder);await mkdir(folder,{recursive:true});const path=join(folder,'startup-'+name+'.lock'),identity=createHash('sha256').update(root.toLowerCase()).digest('hex'),token=randomUUID(),deadline=Date.now()+timeoutMs;
 let waitingLogged=false;
 while(true){await noLinks(path);try{const handle=await open(path,'wx',0o600);await handle.writeFile(JSON.stringify({format:1,pid:process.pid,identity,token,startedAt:Date.now()}));await handle.close();return async()=>{await noLinks(path);const current=JSON.parse(await readFile(path,'utf8').catch(()=>'{"token":null}'));if(current.token===token)await unlink(path).catch(e=>{if(e.code!=='ENOENT')throw e;});};}catch(e){if(e.code!=='EEXIST')throw e;}
  const stat=await lstat(path).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(!stat)continue;if(!stat.isFile()||stat.size>4096)throw Error('Registro de abertura inválido');let current;try{current=JSON.parse(await readFile(path,'utf8'));}catch{if(Date.now()-stat.mtimeMs<5000&&Date.now()<deadline){await delay(100);continue;}throw Error('Registro de abertura incompleto; aguarde a primeira abertura e tente novamente');}
  let alive=false;if(Number.isInteger(current?.pid)&&current.pid>0){try{process.kill(current.pid,0);alive=true;}catch(e){if(e.code==='ESRCH')alive=false;else alive=true;}}
  if(!alive){await noLinks(path);await unlink(path).catch(e=>{if(e.code!=='ENOENT')throw e;});continue;}
  if(current.identity!==identity||!Number.isInteger(current.pid)||current.pid<1)throw Error('Registro de abertura pertence a outra instalação ativa (PID: '+current.pid+')');
  if(!waitingLogged){await startupRecord(root,name+'-waiting',{ownerPid:current.pid});waitingLogged=true;}
  if(Date.now()>deadline)throw Error('Outra abertura desta instalação ainda está em andamento. Aguarde e use a janela existente; nenhum processo foi encerrado.');await delay(200);
 }
}
