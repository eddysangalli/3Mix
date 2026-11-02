// Bounded fallback for this installation only; explicit QA ports remain strict.
import {readFile,writeFile,rename,unlink,lstat,realpath} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
export const installationIdentity=root=>createHash('sha256').update(resolve(root).toLowerCase()).digest('hex');
export async function selectApiPort({configuredPort,explicit=false,probe}){
 const first=await probe(configuredPort);
 if(first.health||!first.occupied)return{port:configuredPort,health:first.health||null,changed:false};
 if(explicit)throw Error('A porta explícita '+configuredPort+' está ocupada por outro serviço. Nenhum processo foi encerrado.');
 for(let port=18188;port<=18198;port++){if(port===configuredPort)continue;const state=await probe(port);if(state.health||!state.occupied)return{port,health:state.health||null,changed:true,previousPort:configuredPort};}
 throw Error('O controle local não encontrou uma porta livre entre 18188 e 18198. Nenhum processo foi encerrado.');
}
export async function persistApiPort(root,port,health){
 if(!Number.isInteger(port)||port<1||port>65535||!['FreeMix','3Mix'].includes(health?.app)||health.installationId!==installationIdentity(root)||Number(health.port)!==port)throw Error('Não foi confirmada a propriedade da API desta instalação.');
 const canonicalRoot=await realpath(root),directory=await realpath(join(root,'painel')),inside=relative(canonicalRoot,directory);
 if(inside==='..'||inside.startsWith('..\\')||inside.startsWith('../')||isAbsolute(inside))throw Error('O painel está fora desta instalação.');
 const path=join(directory,'local.js'),info=await lstat(path);if(!info.isFile()||info.isSymbolicLink())throw Error('Configuração local inválida.');
 const original=await readFile(path,'utf8'),match=/window\.MESA_LOCAL\s*=\s*(\{[^;]+\})\s*;?/.exec(original);if(!match)throw Error('Configuração da Mesa não encontrada.');
 const local=JSON.parse(match[1]),url=new URL(local.replayUrl);
 if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname))throw Error('O painel não aponta para uma API local.');
 if(Number(url.port||80)===port)return false;
 url.port=String(port);local.replayUrl=url.href;const updated=original.replace(match[1],JSON.stringify(local)),temp=path+'.port-'+randomBytes(6).toString('hex')+'.tmp';
 try{await writeFile(temp,updated,{flag:'wx'});if(await readFile(path,'utf8')!==original)throw Error('A configuração local mudou durante a abertura; tente novamente.');await rename(temp,path);}finally{await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
 return true;
}
