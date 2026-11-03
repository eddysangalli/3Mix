// Seal a newly built full package; never modifies an existing sealed release.
import {readFile,writeFile,readdir,lstat,access} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve,join,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,createPublicKey,sign,verify} from 'node:crypto';
import {inspectPortable} from '../../ferramentas/instalar-portatil.mjs';

const workspace=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const options={};for(const arg of process.argv.slice(2)){const i=arg.indexOf('=');const name=arg.slice(0,i),value=arg.slice(i+1);if(i<0||!['--root','--key','--receipt'].includes(name)||!value||options[name])throw Error('Use --root=PASTA_NOVA [--key=CHAVE_FORA_DO_PACOTE] [--receipt=ARQUIVO]');options[name]=value;}
if(!options['--root'])throw Error('Informe explicitamente a pasta nova do pacote');
const root=resolve(options['--root']),version=JSON.parse(await readFile(join(root,'version.json'),'utf8')).version;
if(!/^(?:0\.1\.0-local\.\d{14}|\d+\.\d+\.\d+-(?:alpha|beta))$/.test(version))throw Error('Versão inválida');
for(const name of ['manifest.json','manifest.sig'])if(await access(join(root,name)).then(()=>true,()=>false))throw Error('Entrega já selada; não modificar');
const keyPath=resolve(options['--key']||join(workspace,'release-keys/ed25519-private.pem'));
const keyRelative=relative(root,keyPath);if(!keyRelative.startsWith('..')&&!/^[A-Z]:/i.test(keyRelative))throw Error('Chave privada deve permanecer fora do pacote');
const privateKey=await readFile(keyPath),publicKey=await readFile(join(root,'update-public.pem'));
const files=[],names=new Set();
async function digest(path){const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');}
async function walk(folder){for(const e of await readdir(folder,{withFileTypes:true})){const path=join(folder,e.name),name=relative(root,path).replaceAll('\\','/');if(e.isSymbolicLink())throw Error('Link no pacote: '+name);if(e.isDirectory()){await walk(path);continue;}if(!e.isFile())throw Error('Entrada especial no pacote');if(name==='hashes.json')continue;if(names.has(name.toLowerCase()))throw Error('Nome duplicado: '+name);names.add(name.toLowerCase());if(/ed25519-private|\.pdb$|\.dmp$|\.log$|\.bak$|(?:^|\/)(?:gravacoes|crashes|diagnosticos|logs|gt_titles)(?:\/|$)/i.test(name))throw Error('Conteúdo de operador ou build recusado: '+name);const info=await lstat(path);files.push({path:name,size:info.size,sha256:await digest(path)});}}
await walk(root);files.sort((a,b)=>a.path.localeCompare(b.path));
await writeFile(join(root,'hashes.json'),JSON.stringify({version,files:Object.fromEntries(files.map(f=>[f.path,f.sha256]))},null,2));
const hashes=await lstat(join(root,'hashes.json'));files.push({path:'hashes.json',size:hashes.size,sha256:await digest(join(root,'hashes.json'))});files.sort((a,b)=>a.path.localeCompare(b.path));
const raw=Buffer.from(JSON.stringify({format:2,kind:'freemix-portable-full',version,createdAt:new Date().toISOString(),files})),signature=sign(null,raw,privateKey);
if(!verify(null,raw,publicKey,signature)||createPublicKey(privateKey).asymmetricKeyType!=='ed25519')throw Error('Chave privada não corresponde à chave pública Ed25519 do produto');
await writeFile(join(root,'manifest.json'),raw,{flag:'wx'});await writeFile(join(root,'manifest.sig'),signature,{flag:'wx'});
const checked=await inspectPortable(root,join(process.env.TEMP,'FreeMix-QA-Seal-'+version));
const components=JSON.parse(await readFile(join(root,'componentes.json'),'utf8'));
const receipt={status:'PASS',version,root,fileCount:checked.fileCount,totalBytes:checked.totalBytes,manifestHash:checked.manifestHash,signatureVerified:true,allHashesVerified:true,privateOperatorDataIncluded:false,ndiRuntimeIncluded:true,nativeCommit:components.runtimeLocal.nativeCommit,nativeSha256:components.runtimeLocal.sha256['bin/64bit/FreeMix.exe'],rebuiltComponents:components.rebuiltComponents,appStarted:false,firewallApplied:false,at:new Date().toISOString()};
await writeFile(resolve(options['--receipt']||join(workspace,'qa-finalizacao/full-payload-verificado.json')),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
