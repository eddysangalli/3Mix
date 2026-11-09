// Launcher-owned identity: renewed only when a new engine is about to start.
import {randomUUID} from 'node:crypto';
import {mkdir,open,readFile,lstat,rename,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
const fileFor=root=>join(resolve(root),'config/obs-studio/plugin_config/freemix-control/update-opening.json');
async function rejectLinks(file){for(let p=resolve(file);;p=dirname(p)){const info=await lstat(p).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(info?.isSymbolicLink())throw Error('Link recusado na identidade de abertura');if(dirname(p)===p)break;}}
export async function createUpdateOpening(root){
 const file=fileFor(root);await rejectLinks(file);await mkdir(dirname(file),{recursive:true});
 const session={format:1,id:randomUUID(),startedAt:new Date().toISOString()};
 const tmp=file+'.'+randomUUID()+'.tmp';const handle=await open(tmp,'wx',0o600);
 try{
  try{await handle.writeFile(JSON.stringify(session));await handle.sync();}finally{await handle.close();}
  await rejectLinks(file);await rename(tmp,file);return session;
 }finally{await rm(tmp,{force:true});}
}
export async function readUpdateOpening(root){
 const file=fileFor(root);await rejectLinks(file);
 const info=await lstat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(!info)return null;
 if(!info.isFile()||info.size>1024)throw Error('Identidade de abertura inválida');
 const value=JSON.parse(await readFile(file,'utf8'));
 if(!value||Array.isArray(value)||value.format!==1||typeof value.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.id)||typeof value.startedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.startedAt)||!Number.isFinite(Date.parse(value.startedAt))||new Date(value.startedAt).toISOString()!==value.startedAt)throw Error('Identidade de abertura inválida');
 return value;
}

// One in-flight/successful attempt per opening in this API lifetime.
// Failures are retryable; manual checks never pass through this coordinator.
export class OpeningUpdateCheck {
 constructor(){this.attempts=new Map();}
 async run(id,check){
  if(!id)return check();
  if(this.attempts.has(id))return this.attempts.get(id);
  const pending=Promise.resolve().then(check);
  this.attempts.set(id,pending);
  try{return await pending;}catch(error){if(this.attempts.get(id)===pending)this.attempts.delete(id);throw error;}

 }
}
