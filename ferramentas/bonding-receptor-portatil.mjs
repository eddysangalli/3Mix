// A private receiver bundle. Exporting never binds a socket or starts a process.
import {readFile,writeFile,mkdir,copyFile,lstat,realpath} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function verifyReceiverBundle(folder){
 const encoded=await readFile(join(folder,'manifest.json'),'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(!encoded)return {bundleManifest:false,integrityChecked:false};
 const manifest=JSON.parse(encoded);if(manifest.format!=='3Mix private receiver'||manifest.schema!==1||!Array.isArray(manifest.files)||manifest.files.length>16)throw Error('Manifesto de receptor inválido');const paths=new Set();
 for(const f of manifest.files){if(!/^(?:runtime\/(?:node\.exe|LICENSE\.node\.txt)|ferramentas\/bonding-(?:producao|medicoes|receptor-portatil)\.mjs|receptor-privado\.json|RECEPTOR\.cmd)$/.test(f.path)||paths.has(f.path)||!Number.isInteger(f.size)||f.size<0||f.size>160*1024**2||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('Dependência de receptor inválida');paths.add(f.path);const file=join(folder,f.path);if((await lstat(file)).isSymbolicLink()||relative(await realpath(folder),await realpath(file)).startsWith('..'))throw Error('Dependência de receptor insegura');const bytes=await readFile(file);if(bytes.length!==f.size||hash(bytes)!==f.sha256)throw Error('Dependência alterada/corrompida: '+f.path);}
 for(const p of ['ferramentas/bonding-producao.mjs','ferramentas/bonding-medicoes.mjs','ferramentas/bonding-receptor-portatil.mjs','receptor-privado.json'])if(!paths.has(p))throw Error('Dependência ausente no manifesto');return {bundleManifest:true,integrityChecked:true,verifiedFiles:paths.size,signatureVerified:false};
}
export async function exportReceiverBundle(root,config,secret){
 root=await realpath(root);const base=join(root,'config/obs-studio/plugin_config/freemix-network');await mkdir(base,{recursive:true});
 if((await lstat(base)).isSymbolicLink()||relative(root,await realpath(base)).startsWith('..'))throw Error('Pasta de exportação insegura');
 const folder=join(base,'receptor-portatil-'+randomUUID());await mkdir(folder);await mkdir(join(folder,'ferramentas'));await mkdir(join(folder,'runtime'));
 const files=[];const copy=async(from,to)=>{const source=join(root,from);if((await lstat(source)).isSymbolicLink())throw Error('Dependência por link não permitida');const actual=await realpath(source),r=relative(root,actual);if(r.startsWith('..')||isAbsolute(r))throw Error('Dependência externa não permitida');const bytes=await readFile(source);await copyFile(source,join(folder,to));if(hash(await readFile(join(folder,to)))!==hash(bytes))throw Error('Dependência mudou durante a cópia');files.push({path:to,size:bytes.length,sha256:hash(bytes)});};
 for(const name of ['bonding-producao.mjs','bonding-medicoes.mjs','bonding-receptor-portatil.mjs'])await copy('ferramentas/'+name,'ferramentas/'+name);
 await copy('runtime/node.exe','runtime/node.exe');
 const license=await readFile(join(root,'runtime/LICENSE.node.txt')).catch(()=>null);if(license){await writeFile(join(folder,'runtime/LICENSE.node.txt'),license);files.push({path:'runtime/LICENSE.node.txt',size:license.length,sha256:hash(license)});}
 const encoded=JSON.stringify({...config,role:'receiver',bridge:false,receiverHost:'127.0.0.1',secret},null,2);await writeFile(join(folder,'receptor-privado.json'),encoded,{mode:0o600});
 files.push({path:'receptor-privado.json',size:Buffer.byteLength(encoded),sha256:hash(encoded)});
 const cmd='@echo off\r\ncd /d "%~dp0"\r\n"runtime\\node.exe" "ferramentas\\bonding-producao.mjs" --receiver "receptor-privado.json" %*\r\nif errorlevel 1 pause\r\n';await writeFile(join(folder,'RECEPTOR.cmd'),cmd);files.push({path:'RECEPTOR.cmd',size:Buffer.byteLength(cmd),sha256:hash(cmd)});
 await writeFile(join(folder,'LEIA-ME.txt'),'Pacote privado: receptor-privado.json contém a chave AES compartilhada. Não publicar.\r\nRECEPTOR.cmd --check valida sem abrir portas.\r\nRECEPTOR.cmd inicia somente em 127.0.0.1. Para receber de outra máquina use explicitamente RECEPTOR.cmd --listen=0.0.0.0 e autorize só a porta UDP configurada no firewall.\r\nSaída MPEG-TS sempre local em UDP 127.0.0.1:'+config.outputPort+'.\r\nLinux: Node.js >=20, copie ferramentas/ e o JSON privado; node ferramentas/bonding-producao.mjs --receiver receptor-privado.json --listen=0.0.0.0. Não há serviço ou firewall instalado automaticamente.\r\n');
 const manifest={format:'3Mix private receiver',schema:1,createdAt:Date.now(),runtime:{platform:'win32',architecture:'x64',producerNodeVersion:process.versions.node,requiresNodeAtLeast:20},files};await writeFile(join(folder,'manifest.json'),JSON.stringify(manifest,null,2));
 return {receiverConfigFile:join(folder,'receptor-privado.json'),receiverBundle:folder,manifestFile:join(folder,'manifest.json'),containsSecret:true,autoStarted:false};
}
