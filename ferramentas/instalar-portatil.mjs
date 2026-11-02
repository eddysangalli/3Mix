// Offline full installer. Trust is pinned to the public key beside this installation.
import {readFile,writeFile,lstat,readdir,mkdir,mkdtemp,rename,rmdir,rm} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {resolve,join,dirname,relative,isAbsolute,parse} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,createPublicKey,verify} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {preparePortable} from './preparar-portatil.mjs';
import {prepareNdiRuntime} from './ndi-runtime.mjs';
const ownRoot=resolve(fileURLToPath(new URL('../',import.meta.url)));
const pinnedKey=()=>readFile(join(ownRoot,'update-public.pem'));
const digest=b=>createHash('sha256').update(b).digest('hex');
const run=promisify(execFile);
const required=['bin/64bit/FreeMix.exe','runtime/node.exe','runtime/ffmpeg.exe','runtime/ffprobe.exe','runtime/freemix-process-info.exe','ferramentas/iniciar-freemix.mjs','ferramentas/iniciar-api.mjs','ferramentas/servidor-api.mjs','ferramentas/preparar-portatil.mjs','painel/mesa.html','painel/topbar.html','painel/layout-padrao.json','painel/tema-padrao.ovt','config/obs-studio/global.ini','config/obs-studio/user.ini','config/obs-studio/basic/profiles/Estudio/basic.ini','config/obs-studio/basic/scenes/3Mix.json','config/obs-studio/plugin_config/obs-websocket/config.json','update-public.pem','portable_mode.txt','version.json','3Mix Studio.cmd'];
export function portablePath(root,name){
 if(typeof name!=='string'||!name||name.length>512||name.includes('\\')||name.split('/').some(s=>!s||s==='.'||s==='..'||/[<>:"|?*\x00-\x1f]/.test(s)||/[. ]$/.test(s)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s)))throw Error('Caminho do pacote recusado: '+name);
 const path=resolve(root,name),rel=relative(root,path);if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Caminho fora da raiz');return path;
}
async function noLinks(path){for(let p=resolve(path);;p=dirname(p)){const s=await lstat(p).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(s?.isSymbolicLink())throw Error('Links e junções não são aceitos: '+p);if(dirname(p)===p)break;}}
async function hashFile(path){const h=createHash('sha256');for await(const bytes of createReadStream(path))h.update(bytes);return h.digest('hex');}
function nested(a,b){const rel=relative(a,b);return !rel||(!rel.startsWith('..')&&!isAbsolute(rel));}
function port(value,fallback){const n=value===undefined?fallback:Number(value);if(!Number.isInteger(n)||n<1||n>65535)throw Error('Porta deve estar entre 1 e 65535');return n;}
async function destination(source,dest){
 if(nested(source,dest)||nested(dest,source)||dest===parse(dest).root)throw Error('Origem e destino devem ser pastas separadas, sem aninhamento');
 await noLinks(source);await noLinks(dest);
 const s=await lstat(dest).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(s&&(!s.isDirectory()||(await readdir(dest)).length))throw Error('Escolha uma pasta nova ou completamente vazia; a instalação existente será preservada');
 return s!==null;
}
async function inventory(root){const files=[];async function walk(folder){for(const e of await readdir(folder,{withFileTypes:true})){const p=join(folder,e.name);if(e.isSymbolicLink())throw Error('Link encontrado no pacote');if(e.isDirectory())await walk(p);else if(e.isFile())files.push(relative(root,p).replaceAll('\\','/'));else throw Error('Entrada especial recusada no pacote');if(files.length>40002)throw Error('Pacote excessivo');}}await walk(root);return files;}
export async function inspectPortable(source,dest,{publicKey,apiPort=8088,wsPort=4466,firewall=false}={}){
 source=resolve(source);dest=resolve(dest);apiPort=port(apiPort,8088);wsPort=port(wsPort,4466);if(apiPort===wsPort)throw Error('API e motor precisam de portas diferentes');
 const existed=await destination(source,dest),key=createPublicKey(publicKey??await pinnedKey());if(key.asymmetricKeyType!=='ed25519')throw Error('Chave pública deve ser Ed25519');
 const mf=join(source,'manifest.json'),sf=join(source,'manifest.sig');await noLinks(mf);await noLinks(sf);
 if((await lstat(mf)).size>16*1024*1024||(await lstat(sf)).size!==64)throw Error('Manifesto ou assinatura inválidos');
 const raw=await readFile(mf),signature=await readFile(sf);if(!verify(null,raw,key,signature))throw Error('Assinatura da entrega inválida');
 const m=JSON.parse(raw);if(m.format!==2||m.kind!=='freemix-portable-full'||typeof m.version!=='string'||!m.version||m.version.length>128||!Array.isArray(m.files)||!m.files.length||m.files.length>40000)throw Error('É necessário um pacote completo assinado do FreeMix; pacotes de atualização não servem para instalar');
 const names=new Set(),files=new Map();let total=0;
 for(const f of m.files){const path=portablePath(source,f.path);portablePath(dest,f.path);const name=f.path.toLowerCase();if(names.has(name)||/^(manifest\.json|manifest\.sig|installation\.json|installation-error\.txt)$/i.test(f.path)||!Number.isSafeInteger(f.size)||f.size<0||f.size>2e9||!/^([a-f0-9]{64})$/.test(f.sha256))throw Error('Arquivo duplicado ou inválido no manifesto');names.add(name);files.set(name,f);total+=f.size;if(total>30e9)throw Error('Pacote excede o limite de 30 GB');await noLinks(path);const info=await lstat(path);if(!info.isFile()||info.size!==f.size||await hashFile(path)!==f.sha256)throw Error('Arquivo alterado ou incompleto: '+f.path);}
 for(const name of names){const parts=name.split('/');for(let i=1;i<parts.length;i++)if(names.has(parts.slice(0,i).join('/')))throw Error('Arquivo usado como pasta no manifesto');}
 for(const name of required)if(!names.has(name.toLowerCase()))throw Error('Pacote completo sem arquivo obrigatório: '+name);
 for(const name of['ferramentas/ndi-runtime.mjs','runtime/ndi-v6/Processing.NDI.Lib.x64.dll','licenses/ndi-runtime/NDI SDK License Agreement.pdf','licenses/ndi-runtime/Processing.NDI.Lib.Licenses.txt','licenses/ndi-runtime/PROVENANCE.json','licenses/ndi-runtime/TERMS.md'])if(!names.has(name.toLowerCase()))throw Error('Pacote completo sem dependência NDI: '+name);
 await prepareNdiRuntime(source,{env:{},writeReceipt:false});
 for(const prefix of ['data/','obs-plugins/','node_modules/ws/'])if(![...names].some(n=>n.startsWith(prefix)))throw Error('Pacote completo sem componentes: '+prefix);
 if(firewall&&!names.has('runtime/freemix-network-setup.exe'))throw Error('A entrega não contém o configurador de rede');
 const listed=await inventory(source);for(const name of listed)if(!['manifest.json','manifest.sig'].includes(name)&&!names.has(name.toLowerCase()))throw Error('Arquivo não assinado no pacote: '+name);
 const packageKey=createPublicKey(await readFile(join(source,'update-public.pem')));if(!packageKey.export({format:'der',type:'spki'}).equals(key.export({format:'der',type:'spki'})))throw Error('Chave do pacote diferente da chave confiável');
 const version=JSON.parse(await readFile(join(source,'version.json'),'utf8'));if(version.version!==m.version)throw Error('Versão diferente da versão assinada');
 const ws=JSON.parse(await readFile(join(source,'config/obs-studio/plugin_config/obs-websocket/config.json'),'utf8'));if(ws.server_enabled!==true||ws.auth_required!==true||ws.server_password!=='FIRST-LAUNCH-GENERATES-NEW-SECRET')throw Error('O pacote deve conter somente a configuração inicial sem credenciais de operador');
 if(names.has('painel/local.js')&&!/^\s*(\/\/[^\r\n]*(?:\r?\n|$)|\s)*$/.test(await readFile(join(source,'painel/local.js'),'utf8')))throw Error('O pacote contém configuração privada do painel');
 return {source,dest,manifest:m,existed,apiPort,wsPort,fileCount:m.files.length,totalBytes:total,manifestHash:digest(raw)};
}
async function prepare(root,apiPort,wsPort){
 const wsFile=join(root,'config/obs-studio/plugin_config/obs-websocket/config.json'),ws=JSON.parse(await readFile(wsFile,'utf8'));ws.server_port=wsPort;ws.server_enabled=true;ws.auth_required=true;await writeFile(wsFile,JSON.stringify(ws,null,2));
 // Keep the signed seed's old root for path remapping. A seed already targeting this folder still needs a fresh secret.
 const marker=join(root,'config/obs-studio/raiz.txt'),oldRoot=await readFile(marker,'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(oldRoot?.trim().toLowerCase()===root.toLowerCase())await writeFile(marker,'FREEMIX-OFFLINE-NEW-INSTALLATION');
 else if(oldRoot&&isAbsolute(oldRoot.trim()))await writeFile(marker,resolve(oldRoot.trim()));
 const previous=process.env.FREEMIX_API_PORT;process.env.FREEMIX_API_PORT=String(apiPort);try{return await preparePortable(root);}finally{if(previous===undefined)delete process.env.FREEMIX_API_PORT;else process.env.FREEMIX_API_PORT=previous;}
}
export async function installPortable(source,dest,options={}){
 const info=await inspectPortable(source,dest,options);const parent=dirname(info.dest);await noLinks(parent);await mkdir(parent,{recursive:true});await noLinks(parent);
 const stage=await mkdtemp(join(parent,'.freemix-install-'));let committed=false;
 try{
  for(const f of info.manifest.files){const from=portablePath(info.source,f.path),to=portablePath(stage,f.path);await noLinks(from);const src=await lstat(from);if(!src.isFile()||src.size!==f.size)throw Error('Pacote mudou durante instalação');await mkdir(dirname(to),{recursive:true});await pipeline(createReadStream(from),createWriteStream(to,{flags:'wx'}));if(await hashFile(to)!==f.sha256)throw Error('Pacote mudou durante cópia: '+f.path);}
  const raw=await readFile(join(info.source,'manifest.json')),signature=await readFile(join(info.source,'manifest.sig'));
  if(digest(raw)!==info.manifestHash||!verify(null,raw,createPublicKey(options.publicKey??await pinnedKey()),signature))throw Error('Manifesto mudou durante instalação');
  await writeFile(join(stage,'manifest.json'),raw,{flag:'wx'});await writeFile(join(stage,'manifest.sig'),signature,{flag:'wx'});
  // Final preparation uses final paths after commit; no payload code is executed.
  await destination(info.source,info.dest);await noLinks(stage);if(info.existed)await rmdir(info.dest);await rename(stage,info.dest);committed=true;
  const ndiRuntime=await prepareNdiRuntime(info.dest,{env:{}});
  const prepared=await prepare(info.dest,info.apiPort,info.wsPort);
  const receipt={format:1,status:'installed',version:info.manifest.version,root:info.dest,installedAt:new Date().toISOString(),manifestHash:info.manifestHash,fileCount:info.fileCount,apiPort:prepared.apiPort,wsPort:prepared.wsPort,appStarted:false,firewallApplied:false};
  receipt.ndiRuntime=ndiRuntime;await writeFile(join(info.dest,'installation.json'),JSON.stringify(receipt,null,2));
  if(options.importProject!==undefined){if(typeof options.importProject!=='string'||!options.importProject.trim())throw Error('Informe explicitamente a pasta UUID.fmx a importar');const {inspectRecoveryImport,importRecoveryOffline}=await import('./recuperacao-importacao.mjs');const preview=await inspectRecoveryImport(info.dest,options.importProject,{name:options.projectName});receipt.projectImport=await importRecoveryOffline(info.dest,options.importProject,{name:options.projectName,expectedManifestHash:options.expectedProjectHash||preview.manifestHash});await writeFile(join(info.dest,'installation.json'),JSON.stringify(receipt,null,2));}
  return receipt;
 }catch(e){if(!committed){await noLinks(stage);await rm(stage,{recursive:true,force:true});}else{await writeFile(join(info.dest,'installation-error.txt'),'Os arquivos da nova instalação foram mantidos, mas a preparação/importação não foi concluída. Não inicie esta instalação antes de conferir o erro.\n'+e.message).catch(()=>{});}throw e;}
}
export async function configureInstalledFirewall(receipt,{controlLan=false,ndi=false,omt=false}={}){
 if(!controlLan&&!ndi&&!omt)throw Error('Para --firewall selecione --control-lan, --ndi e/ou --omt');
 const exe=join(receipt.root,'runtime/freemix-network-setup.exe');await noLinks(exe);
 const result=await run(exe,['--root',receipt.root,'--port',String(receipt.apiPort),'--apply','--elevate',...(controlLan?['--control-lan']:[]),...(ndi?['--ndi']:[]),...(omt?['--omt']:[])],{windowsHide:true,timeout:120000});
 return JSON.parse(result.stdout.trim());
}
function argumentsFor(args){const out={};for(let i=0;i<args.length;i++){const a=args[i];if(['--source','--dest','--api-port','--ws-port','--import-project','--project-name'].includes(a)){if(out[a]!==undefined||!args[i+1]||args[i+1].startsWith('--'))throw Error('Argumento ausente ou duplicado: '+a);out[a]=args[++i];}else if(['--check','--firewall','--control-lan','--ndi','--omt','--help'].includes(a)){if(out[a])throw Error('Argumento duplicado: '+a);out[a]=true;}else throw Error('Argumento desconhecido: '+a);}return out;}
if(resolve(process.argv[1]||'')===fileURLToPath(import.meta.url)){
 try{const a=argumentsFor(process.argv.slice(2));if(a['--help']||!process.argv.slice(2).length){console.log('INSTALAR-3MIX.cmd --source "PASTA DO PACOTE COMPLETO" --dest "NOVA PASTA" [--check] [--api-port 8088] [--ws-port 4466]\nImportação opcional: --import-project "PASTA UUID.fmx" [--project-name "NOME NOVO"]. Preserva o original, remove credenciais e mantém saídas/automações paradas. --check verifica apenas o pacote e destino, sem importar.\nRede opcional após instalar: --firewall --control-lan e/ou --ndi e/ou --omt (Windows pede confirmação de administrador). Não inicia o FreeMix.');}else{
  if(!a['--source']||!a['--dest'])throw Error('Informe --source e --dest; consulte --help');
  if(a['--project-name']&&!a['--import-project'])throw Error('--project-name exige --import-project explícito');
  if((a['--control-lan']||a['--ndi']||a['--omt'])&&!a['--firewall'])throw Error('Opções de rede exigem --firewall explícito');
  if(a['--firewall']&&!a['--control-lan']&&!a['--ndi']&&!a['--omt'])throw Error('--firewall exige ao menos uma opção: --control-lan, --ndi ou --omt');
  const options={apiPort:port(a['--api-port'],8088),wsPort:port(a['--ws-port'],4466),firewall:!!a['--firewall'],...(a['--import-project']?{importProject:a['--import-project'],projectName:a['--project-name']}:{})};
  if(a['--check']){const info=await inspectPortable(a['--source'],a['--dest'],options);console.log(JSON.stringify({verified:true,version:info.manifest.version,fileCount:info.fileCount,totalBytes:info.totalBytes,root:info.dest,apiPort:info.apiPort,wsPort:info.wsPort,written:false,appStarted:false,firewallApplied:false}));}
  else{const receipt=await installPortable(a['--source'],a['--dest'],options);if(a['--firewall']){try{receipt.firewall=await configureInstalledFirewall(receipt,{controlLan:!!a['--control-lan'],ndi:!!a['--ndi'],omt:!!a['--omt']});receipt.firewallApplied=receipt.firewall.applied===true;await writeFile(join(receipt.root,'installation.json'),JSON.stringify(receipt,null,2));}catch(e){receipt.firewallError=e.message;process.exitCode=2;}}console.log(JSON.stringify(receipt));}
 }}catch(e){console.error('3Mix: '+e.message);process.exitCode=1;}
}
