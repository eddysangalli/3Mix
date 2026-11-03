// Signed, local-package updater. No update is fetched from an invented server.
import {readFile,writeFile,rename,mkdir,copyFile,unlink,stat,lstat,readdir} from 'node:fs/promises';
import {resolve,join,relative,dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verify,createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const hash=b=>createHash('sha256').update(b).digest('hex');
export function safe(root,name){
 if(typeof name!=='string'||!name||name.includes('\\')||name.includes(':')||name.split('/').some(s=>!s||s==='.'||s==='..')||/^config\/|^gravacoes\/|^capturas\/|^originais\/|^painel\/local\.js$|^updates\//i.test(name))throw Error('Caminho de atualização recusado: '+name);
 const p=resolve(root,name),r=relative(root,p);if(!r||r.startsWith('..')||isAbsolute(r))throw Error('Destino fora da instalação');return p;
}
async function noLinks(root,path){for(let p=path;;p=dirname(p)){const s=await lstat(p).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(s?.isSymbolicLink())throw Error('Link recusado na atualização');if(p===root)break;if(dirname(p)===p)throw Error('Caminho fora da raiz');}}
async function closed(root){if(process.platform!=='win32')return;
  const ids=execFileSync('tasklist.exe',['/FO','CSV','/NH'],{encoding:'utf8',windowsHide:true,timeout:10000}).split(/\r?\n/).map(line=>line.match(/^"(?:FreeMix|obs64|node|powershell|pwsh)\.exe","(\d+)"/i)?.[1]).filter(id=>id&&Number(id)!==process.pid);
  if(!ids.length)return;
  const rows=JSON.parse(execFileSync(join(root,'runtime/freemix-process-info.exe'),ids,{encoding:'utf8',windowsHide:true,timeout:10000}));
  if(rows.some(p=>!p.exited&&(!p.path||resolve(p.path).toLowerCase().startsWith(root.toLowerCase()+ '\\'))))throw Error('Feche o 3Mix e seu ajudante antes de atualizar');
}
export async function inspect(root,pkg,key){root=resolve(root);pkg=resolve(pkg);const raw=await readFile(join(pkg,'manifest.json')),sig=await readFile(join(pkg,'manifest.sig'));
 if(!verify(null,raw,key,sig))throw Error('Assinatura da versão inválida');const m=JSON.parse(raw);if(m.format!==1||typeof m.version!=='string'||!Array.isArray(m.files)||!m.files.length||m.files.length>40000)throw Error('Manifesto inválido');
 const names=new Set();for(const f of m.files){if(names.has(f.path)||!/^([a-f0-9]{64})$/.test(f.sha256))throw Error('Arquivo inválido ou duplicado');names.add(f.path);const src=safe(pkg,f.path),dest=safe(root,f.path);await noLinks(pkg,src);await noLinks(root,dest);const info=await stat(src);if(!info.isFile()||info.size>2e9||info.size!==f.size||hash(await readFile(src))!==f.sha256)throw Error('Hash/tamanho divergente: '+f.path);}return m;
}
export async function rollback(root,journal){root=resolve(root);const backup=resolve(journal), rel=relative(join(root,'updates'),backup);if(rel.startsWith('..')||isAbsolute(rel))throw Error('Backup fora da instalação');await closed(root);const j=JSON.parse(await readFile(join(backup,'journal.json'),'utf8'));
 for(const f of [...j.files].reverse()){const dest=safe(root,f.path);await noLinks(root,dest);if(f.existed){const src=safe(join(backup,'files'),f.path);if(hash(await readFile(src))!==f.originalHash)throw Error('Backup alterado');await mkdir(dirname(dest),{recursive:true});await copyFile(src,dest);}else await unlink(dest).catch(e=>{if(e.code!=='ENOENT')throw e;});}
 j.status='restored';await writeFile(join(backup,'journal.json'),JSON.stringify(j,null,2));return j;
}
// O desinstalador só remove o que confere com o recibo de propriedade. Sem atualizar o recibo, todo arquivo atualizado ficaria para trás como "alterado".
async function syncOwnership(root,m,backup,j,journal){const name='uninstall-files.json',path=join(root,name);const raw=await readFile(path,'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(raw===null)return;const plan=JSON.parse(raw.replace(/^\uFEFF/,''));if(!Array.isArray(plan.files))return;await writeFile(join(backup,'files',name),raw);j.files.push({path:name,existed:true,originalHash:hash(Buffer.from(raw))});await journal();const rows=new Map(plan.files.map(f=>[f.path,f]));for(const f of m.files)rows.set(f.path,{...(rows.get(f.path)||{}),path:f.path,size:f.size,sha256:f.sha256});plan.files=[...rows.values()];const temp=path+'.update-'+randomUUID();await writeFile(temp,JSON.stringify(plan));await rename(temp,path);}
// Atualização interrompida (queda de energia, processo morto): o diário fica em "applying". Na abertura seguinte, volta ao estado anterior.
export async function recoverInterrupted(root){root=resolve(root);const parent=join(root,'updates'),done=[];for(const name of await readdir(parent).catch(()=>[])){const file=join(parent,name,'journal.json');const raw=await readFile(file,'utf8').catch(()=>null);if(!raw)continue;let j;try{j=JSON.parse(raw);}catch{continue;}if(j.status==='applying'){await rollback(root,join(parent,name));done.push(j.version);}}return done;}
export async function apply(root,pkg,key,{failAfter=Infinity}={}){root=resolve(root);pkg=resolve(pkg);const m=await inspect(root,pkg,key);
 const current=await readFile(join(root,'version.json'),'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(current){const before=JSON.parse(current).version,old=String(before).match(/\d+/g)?.map(Number),next=m.version.match(/\d+/g)?.map(Number);if(!old||!next)throw Error('Versão inválida');let order=0;for(let i=0;i<Math.max(old.length,next.length);i++){if((next[i]||0)!==(old[i]||0)){order=(next[i]||0)>(old[i]||0)?1:-1;break;}}if(order<=0)throw Error('A versão deve ser posterior à instalada; use rollback para restaurar');}
 await closed(root);
 const backup=join(root,'updates',randomUUID());await noLinks(root,backup);await mkdir(join(backup,'files'),{recursive:true});const j={version:m.version,status:'applying',files:[]};
 const journal=()=>writeFile(join(backup,'journal.json'),JSON.stringify(j,null,2));
  try{for(const f of m.files){const dest=safe(root,f.path),src=safe(pkg,f.path);await noLinks(root,dest);await noLinks(pkg,src);const bytes=await readFile(src);if(hash(bytes)!==f.sha256)throw Error('Pacote mudou durante aplicação');const old=await readFile(dest).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
   if(old&&hash(old)===f.sha256)continue;
  if(old){const save=safe(join(backup,'files'),f.path);await mkdir(dirname(save),{recursive:true});await writeFile(save,old);}
  j.files.push({path:f.path,existed:old!==null,originalHash:old?hash(old):null});await journal();await mkdir(dirname(dest),{recursive:true});const temp=dest+'.update-'+randomUUID();await writeFile(temp,bytes);await rename(temp,dest);if(j.files.length>=failAfter)throw Error('Falha de QA injetada');}
 await syncOwnership(root,m,backup,j,journal);
 j.status='installed';await journal();return {version:m.version,backup};
 }catch(e){await rollback(root,backup);throw e;}
}
const _entry = resolve(process.argv[1]||'').toLowerCase(); if(_entry === fileURLToPath(import.meta.url).toLowerCase() || _entry.endsWith('atualizar-freemix.mjs') || _entry.endsWith('atualizar-3mix.mjs')){
 const [action,root,pkg]=process.argv.slice(2);try{if(action==='rollback')console.log(JSON.stringify(await rollback(root,pkg)));else{const key=await readFile(join(root,'update-public.pem'));console.log(JSON.stringify(action==='check'?await inspect(root,pkg,key):action==='apply'?await apply(root,pkg,key):(()=>{throw Error('Use check/apply/rollback RAIZ PACOTE');})()));}}catch(e){console.error(e.message);process.exitCode=1;}
}
