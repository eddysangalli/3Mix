// Runs only before starting a closed installation; preserve operator settings and backup changed files.
import {readFile,writeFile,copyFile,mkdir,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {randomBytes} from 'node:crypto';
import {existsSync} from 'node:fs';import {pluginDefaults} from './plugins-defaults.mjs';
const read=async file=>{try{return await readFile(file,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}};
async function put(file,text){const previous=await read(file);if(previous===text)return;if(previous!==null&&await read(file+'.anterior')===null)await copyFile(file,file+'.anterior');await mkdir(join(file,'..'),{recursive:true});await writeFile(file,text);}
async function files(dir,filter){let entries;try{entries=await readdir(dir,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return [];throw e;}const result=[];for(const e of entries){if(e.isSymbolicLink())continue;const name=join(dir,e.name);if(e.isDirectory())result.push(...await files(name,filter));else if(filter(e.name))result.push(name);}return result;}
// Cenas, fontes e filtros internos agora se chamam 3Mix. Projetos antigos migram aqui, com o motor fechado; os identificadores de formato não mudam.
const NOME_ANTIGO=/"FreeMix (?!ICE"|Project Template|Recovery"|Settings"|New Project Plan|multipath)/g;
async function migrarNomes3Mix(cfg){
 const alvos=[...await files(join(cfg,'basic/scenes'),name=>/\.(json|bak|salvo)$/.test(name)),...await files(join(cfg,'plugin_config'),name=>/\.json$/.test(name))];
 for(const file of alvos){
  const old=await read(file);if(old===null||!old.includes('"FreeMix '))continue;
  const novo=old.replace(NOME_ANTIGO,'"3Mix ');if(novo===old)continue;
  if(await read(file+'.pre-3mix')===null)await copyFile(file,file+'.pre-3mix');
  await writeFile(file,novo);
 }
}
export async function preparePortable(root){
 root=resolve(root);const cfg=join(root,'config/obs-studio'),mark=join(cfg,'raiz.txt');
 const wsFile=join(cfg,'plugin_config/obs-websocket/config.json');const encoded=await read(wsFile);if(!encoded)throw Error('Configuração do motor não encontrada.');const ws=JSON.parse(encoded);
 let local={};try{const match=/window\.MESA_LOCAL\s*=\s*(\{[^;]+\})\s*;?/.exec(await read(join(root,'painel/local.js'))||'');if(match)local=JSON.parse(match[1]);}catch{}
 const apiPort=Number(process.env.FREEMIX_API_PORT||(local.replayUrl?new URL(local.replayUrl).port:8088)||8088);
 if(!Number.isInteger(apiPort)||apiPort<1||apiPort>65535)throw Error('Porta da API inválida; informe um inteiro entre 1 e 65535.');
 if(!Number.isInteger(ws.server_port)||ws.server_port<1||ws.server_port>65535||ws.server_port===apiPort)throw Error('Portas do motor e da API devem ser válidas e diferentes.');
 const theme=await read(join(root,'painel/tema-padrao.ovt'));if(theme)await put(join(cfg,'themes/Yami_MesaDeCorte.ovt'),theme);
 await migrarNomes3Mix(cfg);
 const scenes=await files(join(cfg,'basic/scenes'),name=>/\.(json|bak|salvo)$/.test(name));
 for(const file of scenes){const old=await read(file);await put(file,old.replace(/("hide_after":\s*)[1-9]\d*/g,(_,prefix)=>prefix+'0'));}
  const plugins={advancedSceneSwitcher:existsSync(join(root,'obs-plugins/64bit/advanced-scene-switcher.dll')),cloudCaptions:existsSync(join(root,'obs-plugins/64bit/obs_google_caption_plugin.dll'))};
  if(plugins.advancedSceneSwitcher||plugins.cloudCaptions)for(const file of scenes.filter(f=>f.endsWith('.json'))){const result=pluginDefaults(JSON.parse(await read(file)),plugins);if(result.added.length)await put(file,JSON.stringify(result.collection,null,2));}
 const oldRoot=(await read(mark))?.trim()||'D:\\DRIVE\\IA\\antigravity\\vmixtwste\\obs-vmix';
 const moved=oldRoot.toLowerCase()!==root.toLowerCase();
 if(moved){const replace=(text,from,to)=>text.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),()=>to);
  for(const file of [join(cfg,'user.ini'),...scenes.filter(f=>f.endsWith('.json')),...await files(join(cfg,'basic/profiles'),name=>name==='basic.ini')]){let text=await read(file);if(text===null)continue;text=replace(text,oldRoot.replaceAll('\\','\\\\'),root.replaceAll('\\','\\\\'));text=replace(text,oldRoot.replaceAll('\\','/'),root.replaceAll('\\','/'));text=replace(text,oldRoot,root);
   if(file.endsWith('user.ini'))text=text.replace(/("url"\s*:\s*")file:\/\/\/[^"\n]*\/painel\/(mesa|topbar)\.html"/g,(_,prefix,name)=>prefix+pathToFileURL(join(root,'painel',name+'.html')).href+'"');await put(file,text);
  }
 }
 if(moved||ws.server_password==='FIRST-LAUNCH-GENERATES-NEW-SECRET'){ws.server_password=randomBytes(24).toString('base64url');ws.auth_required=true;await put(wsFile,JSON.stringify(ws,null,2));}
 await put(join(root,'painel/local.js'),'// Configuração local; não incluir em pacotes de atualização.\nwindow.MESA_LOCAL = '+JSON.stringify({...local,url:'ws://127.0.0.1:'+ws.server_port,password:ws.server_password,replayUrl:'http://127.0.0.1:'+apiPort+'/api/replay'})+';\n');
 await mkdir(join(root,'gravacoes/iso'),{recursive:true});await put(mark,root);
 return {apiPort,wsPort:ws.server_port,moved};
}
