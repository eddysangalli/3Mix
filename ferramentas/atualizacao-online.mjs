import https from 'node:https';
import {readFile,writeFile,mkdir,lstat,rename,rm,open,readdir,stat,copyFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import {resolve,join,dirname} from 'node:path';
import {createPublicKey,verify,createHash,randomUUID} from 'node:crypto';
import {portablePath} from './instalar-portatil.mjs';
import {safe} from './atualizar-freemix.mjs';
const limits={feed:65536,manifest:16*1024*1024,file:2e9,total:8e9,files:40000,timeout:30000};
// Canal oficial: manifestos no GitHub Pages, arquivos nas Releases. O operador pode trocar o canal em Sobre, ou desligar a consulta.
export const CHANNEL_BASE='https://eddysangalli.github.io/3Mix/';
export const RELEASE_PREFIX='https://github.com/eddysangalli/3Mix/releases/download/';
const RELEASE_HOSTS=new Set(['objects.githubusercontent.com','release-assets.githubusercontent.com']);
export const CHANNELS=['stable','beta'];
// Alpha e beta recebem o canal de testes; só versão sem sufixo fica no estável. Estável nunca recebe versão de testes sozinho.
export const channelOf=version=>/^\d+\.\d+\.\d+$/.test(String(version))?'stable':'beta';
export const defaultFeed=channel=>CHANNEL_BASE+channel+'/feed.json';
const AUTO_INTERVAL=6*60*60*1000,AUTO_DELAY=30000;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function hashFile(path){const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex');}
export function updateURL(value,origin){let url;try{url=new URL(value);}catch{throw Error('Informe um endereço HTTPS válido');}if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||value.length>2000||origin&&url.origin!==origin)throw Error('Use HTTPS sem credenciais, query ou fragmento, na mesma origem do feed');return url;}
export function newerVersion(next,current){
 const semver=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
 const a=typeof next==='string'&&next.length<=128?semver.exec(next):null,b=typeof current==='string'&&current.length<=128?semver.exec(current):null;
 if(a&&b){
  for(let i=1;i<=3;i++){const x=BigInt(a[i]),y=BigInt(b[i]);if(x!==y)return x>y;}
  if(a[4]===b[4])return false;if(!a[4])return true;if(!b[4])return false;
  const x=a[4].split('.'),y=b[4].split('.');
  for(let i=0;i<Math.max(x.length,y.length);i++){
   if(x[i]===undefined)return false;if(y[i]===undefined)return true;if(x[i]===y[i])continue;
   const xn=/^\d+$/.test(x[i]),yn=/^\d+$/.test(y[i]);
   if(xn&&yn)return BigInt(x[i])>BigInt(y[i]);if(xn!==yn)return !xn;return x[i]>y[i];
  }
  return false;
 }
 // Preserve historical local identifiers that predate SemVer release channels.
const parse=v=>{if(typeof v!=='string'||v.length>128||!/^\d+(?:[.\w-]*\d)*[.\w-]*$/.test(v))throw Error('Versão inválida');const n=v.match(/\d+/g).map(Number);if(n.some(x=>!Number.isSafeInteger(x)))throw Error('Versão inválida');return n;};const legacyA=parse(next),legacyB=parse(current);for(let i=0;i<Math.max(legacyA.length,legacyB.length);i++){if((legacyA[i]||0)!==(legacyB[i]||0))return(legacyA[i]||0)>(legacyB[i]||0);}return false;}
// No redirects, custom agent, TLS override or retry that could change the intended origin.
// Só as Releases podem redirecionar, e só para os hosts de arquivo do próprio GitHub: a origem do download continua fixa. Quem garante o conteúdo é o hash assinado.
export function followsRedirect(from,to){return from.href.startsWith(RELEASE_PREFIX)&&to.protocol==='https:'&&!to.username&&!to.password&&RELEASE_HOSTS.has(to.hostname);}
export function httpsBytes(url,max,{timeout=limits.timeout,onChunk,offset=0,onRestart,hops=0,mayRedirect=followsRedirect}={}){return new Promise((resolve,reject)=>{const req=https.get(url,{rejectUnauthorized:true,timeout,headers:offset?{Range:'bytes='+offset+'-'}:{}},async res=>{try{
 if([301,302,303,307,308].includes(res.statusCode)&&res.headers.location){res.resume();const next=new URL(res.headers.location,url);if(hops>=4||!mayRedirect(hops?new URL(RELEASE_PREFIX):url,next))throw Error('Servidor recusou o arquivo ou tentou redirecionar');resolve(await httpsBytes(next,max,{timeout,onChunk,offset,onRestart,hops:hops+1,mayRedirect}));return;}
 if(res.statusCode===206){const start=Number(/^bytes (\d+)-/.exec(res.headers['content-range']||'')?.[1]);if(start!==offset)throw Error('Retomada de download inválida');}else if(res.statusCode===200){if(offset)await onRestart?.();}else throw Error('Servidor recusou o arquivo ou tentou redirecionar');
 if(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity')throw Error('Servidor recusou o arquivo ou tentou redirecionar');
 const room=res.statusCode===206?max-offset:max,length=Number(res.headers['content-length']);if(Number.isFinite(length)&&length>room)throw Error('Download excede o tamanho permitido');
 let size=0,chunks=[];for await(const chunk of res){size+=chunk.length;if(size>room)throw Error('Download excede o tamanho permitido');if(onChunk)await onChunk(chunk);else chunks.push(chunk);}
 resolve(onChunk?size:Buffer.concat(chunks));}catch(e){res.destroy();req.destroy(e);reject(e);}});req.on('timeout',()=>req.destroy(Error('Tempo de download esgotado')));req.on('error',reject);const timer=setTimeout(()=>req.destroy(Error('Tempo de download esgotado')),timeout);req.on('close',()=>clearTimeout(timer));});}
async function noLinks(path){for(let p=resolve(path);;p=dirname(p)){const info=await lstat(p).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(info?.isSymbolicLink())throw Error('Link ou junção recusado na atualização');if(dirname(p)===p)break;}}
export function verifyOnlineManifest(raw,signature,publicKey,root,current){const key=createPublicKey(publicKey);if(key.asymmetricKeyType!=='ed25519'||signature.length!==64||raw.length>limits.manifest||!verify(null,raw,key,signature))throw Error('Assinatura da atualização inválida');const m=JSON.parse(raw);if(m.format!==1||!Array.isArray(m.files)||!m.files.length||m.files.length>limits.files||!newerVersion(m.version,current))throw Error('Manifesto inválido ou versão não posterior à instalada');const names=new Set();let total=0;for(const f of m.files){portablePath(root,f.path);safe(root,f.path);const name=f.path.toLowerCase();if(names.has(name)||['manifest.json','manifest.sig'].includes(name)||!Number.isSafeInteger(f.size)||f.size<0||f.size>limits.file||name==='version.json'&&f.size>65536||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('Arquivo inválido no manifesto');names.add(name);total+=f.size;if(total>limits.total)throw Error('Atualização excede 8 GB');}for(const name of names){const parts=name.split('/');for(let i=1;i<parts.length;i++)if(names.has(parts.slice(0,i).join('/')))throw Error('Arquivo usado como pasta');}if(!names.has('version.json'))throw Error('Manifesto sem version.json');return {manifest:m,totalBytes:total};}
export class OnlineUpdateEngine {
 constructor(root,{transport=httpsBytes}={}){this.root=resolve(root);this.transport=transport;this.last=null;this.busy=false;this.checked=null;this.state={status:'unconfigured',url:'',channel:null,currentVersion:null,version:null,totalBytes:0,downloadBytes:0,receivedBytes:0,fileCount:0,novidades:[],packagePath:null,checkedAt:null,lastResult:null,message:'Atualizações desligadas'};this.file=join(this.root,'config/obs-studio/plugin_config/freemix-control/update-feed.json');this.loaded=false;}
 summary(){return structuredClone({...this.state,busy:this.busy});}
 async load(){if(this.loaded)return;await noLinks(this.file);const d=await readFile(this.file,'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});const saved=d?JSON.parse(d):null,channel=CHANNELS.includes(saved?.channel)?saved.channel:channelOf(await this.current());const url=saved?saved.url:defaultFeed(channel);this.state.channel=channel;if(url){this.state.url=updateURL(url).href;this.state.status='configured';this.state.message='Atualizações ativas';}const result=await readFile(join(this.root,'updates/resultado.json'),'utf8').catch(()=>null);if(result){try{this.state.lastResult=JSON.parse(result.replace(/^\uFEFF/,''));}catch{}}this.loaded=true;}
 async current(){const v=JSON.parse(await readFile(join(this.root,'version.json'),'utf8')).version;newerVersion(v,v);this.state.currentVersion=v;return v;}
 async fetch(url,max){return this.transport(url,max,{timeout:limits.timeout});}
 async check(){if(!this.state.url)throw Error('As atualizações estão desligadas');const current=await this.current(),feedURL=updateURL(this.state.url),feed=JSON.parse(await this.fetch(feedURL,limits.feed));if(feed.format!==1)throw Error('Canal de atualização inválido');
  const clean={status:'current',version:null,totalBytes:0,downloadBytes:0,receivedBytes:0,fileCount:0,novidades:[],packagePath:null,checkedAt:Date.now()};
  if(typeof feed.version==='string'&&!newerVersion(feed.version,current)){this.checked=null;this.state={...this.state,...clean,message:'Você está na versão mais recente'};return;}
  const manifestURL=updateURL(feed.manifestUrl,feedURL.origin),signatureURL=updateURL(feed.signatureUrl,feedURL.origin),raw=await this.fetch(manifestURL,limits.manifest),signature=await this.fetch(signatureURL,64),key=await readFile(join(this.root,'update-public.pem'));
  const info=verifyOnlineManifest(raw,signature,key,this.root,current),m=info.manifest;
  if(typeof feed.version!=='string'||feed.version!==m.version)throw Error('Versão do feed diverge do manifesto assinado');
  // O canal e a origem dos arquivos vêm do manifesto assinado: o feed não assina nada, então não pode escolher nenhum dos dois.
  if(m.channel&&m.channel!==this.state.channel)throw Error('Esta versão é do canal '+m.channel+', não do canal escolhido');
  const base=m.filesBaseUrl;if(typeof base!=='string'||!base.endsWith('/'))throw Error('Origem dos arquivos inválida');const filesBaseURL=new URL(base);if(!base.startsWith(RELEASE_PREFIX))updateURL(base,feedURL.origin);
  let downloadBytes=0;for(const f of m.files)if(!await this.sameAsInstalled(f))downloadBytes+=f.size;
  this.checked={...info,raw,signature,filesBaseURL,key,byHash:m.assetNaming==='sha256'};
  this.state={...this.state,...clean,status:'available',version:m.version,totalBytes:info.totalBytes,downloadBytes,fileCount:m.files.length,novidades:Array.isArray(m.novidades)?m.novidades:[],message:'Nova versão disponível'};}
 // Arquivo que já está igual na instalação não é baixado de novo: o manifesto é cumulativo e a maior parte costuma já estar aqui.
 async sameAsInstalled(f){try{return await hashFile(safe(this.root,f.path))===f.sha256;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
 async fetchFile(f,path,checked,deadline){
  const url=checked.byHash?new URL(f.sha256,checked.filesBaseURL):new URL(f.path.split('/').map(encodeURIComponent).join('/'),checked.filesBaseURL);
  if(!url.href.startsWith(RELEASE_PREFIX))updateURL(url.href,checked.filesBaseURL.origin);
  let last;
  for(let attempt=0;attempt<4;attempt++){
   if(Date.now()>deadline)throw Error('Tempo total de download esgotado');
   // Retoma do que já chegou. Se o servidor não aceitar retomada, recomeça este arquivo do zero.
   let received=(await stat(path).catch(()=>null))?.size||0;if(received>=f.size){if(received===f.size&&await hashFile(path)===f.sha256)return;await rm(path,{force:true});received=0;}
   const digest=createHash('sha256');if(received)for await(const chunk of createReadStream(path))digest.update(chunk);
   let hasher=digest;const before=received,handle=await open(path,received?'a':'w');let failed=null;
   try{
    // Pelo menos 50 kB/s: quem tem internet lenta termina, e conexão parada não trava para sempre.
    await this.transport(url,f.size,{timeout:Math.min(Math.max(limits.timeout,f.size/50),Math.max(1,deadline-Date.now())),offset:received,onRestart:async()=>{await handle.truncate(0);this.state.receivedBytes-=received;received=0;hasher=createHash('sha256');},onChunk:async chunk=>{received+=chunk.length;this.state.receivedBytes+=chunk.length;if(received>f.size)throw Error('Arquivo excede o tamanho assinado');hasher.update(chunk);await handle.write(chunk);}});
    if(received!==f.size)throw Error('Download incompleto: '+f.path);
    if(hasher.digest('hex')!==f.sha256){await handle.close().catch(()=>{});await rm(path,{force:true});this.state.receivedBytes-=received;throw Error('Hash ou tamanho divergente: '+f.path);}
    return;
   }catch(e){failed=e;}finally{await handle.close().catch(()=>{});}
   last=failed;void before;
   if(/divergente|excede|inválida/.test(failed.message)&&attempt>=1)break;
   await new Promise(done=>setTimeout(done,1500*(attempt+1)));
  }
  throw last;
 }
 async download(){
  const checked=this.checked;if(!checked||this.state.status!=='available')throw Error('Consulte e valide a atualização antes de baixar');
  verifyOnlineManifest(checked.raw,checked.signature,await readFile(join(this.root,'update-public.pem')),this.root,await this.current());
  const parent=join(this.root,'updates/downloads');await noLinks(parent);await mkdir(parent,{recursive:true});
  // A pasta parcial tem o nome do manifesto: se o download cair, a próxima tentativa continua daqui.
  const id=hash(checked.raw).slice(0,24),stage=join(parent,id+'.partial'),dest=join(parent,id);
  for(const old of await readdir(parent).catch(()=>[]))if(old!==id+'.partial'&&old!==id)await rm(join(parent,old),{recursive:true,force:true});
  await rm(dest,{recursive:true,force:true});await mkdir(stage,{recursive:true});
  const deadline=Date.now()+2*60*60*1000;let n=0;
  this.state.receivedBytes=0;
  for(const f of checked.manifest.files){
   const path=portablePath(stage,f.path);await noLinks(path);await mkdir(dirname(path),{recursive:true});
   const had=(await stat(path).catch(()=>null))?.size||0;
   if(await this.sameAsInstalled(f)){await copyFile(safe(this.root,f.path),path);}else{this.state.receivedBytes+=Math.min(had,f.size);await this.fetchFile(f,path,checked,deadline);}
   if(f.path.toLowerCase()==='version.json'&&JSON.parse(await readFile(path)).version!==checked.manifest.version)throw Error('version.json diverge do manifesto assinado');
   this.state.message='Baixando: '+(++n)+' de '+checked.manifest.files.length+' arquivos';
  }
  await writeFile(join(stage,'manifest.json'),checked.raw);await writeFile(join(stage,'manifest.sig'),checked.signature);
  await noLinks(parent);await noLinks(stage);await rename(stage,dest);
  this.state={...this.state,status:'downloaded',packagePath:dest,message:'Atualização baixada e verificada'};return dest;
 }
 // Baixa, confere e entrega ao atualizador separado, que fecha, aplica e reabre. Nunca com algo no ar.
 async install(){
  const blocked=await this.guard?.();if(blocked)throw Error(blocked);
  if(this.state.status!=='downloaded'||!this.state.packagePath){await this.check();if(this.state.status==='current')return;await this.download();}
  const again=await this.guard?.();if(again)throw Error(again);
  await this.beforeApply?.();
  const script=join(this.root,'ferramentas/atualizar-e-reabrir.ps1').replaceAll('/','\\');
   const pkg=this.state.packagePath.replaceAll('/','\\');
   const apiPort=String(this.apiPort||process.env.FREEMIX_API_PORT||18188);
   const vbs=join(this.root,'updates/run-update.vbs');
   await writeFile(vbs,`CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""${script}"" -Package ""${pkg}"" -ApiPort ${apiPort}", 0, False`);
   execFileSync('wscript.exe',[vbs]);
  
  
  this.state={...this.state,status:'installing',message:'O 3Mix vai fechar, atualizar e abrir de novo'};
 }
 // Só consulta: não baixa nem aplica, e não ocupa a rede de quem está em transmissão. Sem internet, nada muda.
 startAutoCheck(){const quiet=async()=>{if(this.busy||['downloaded','installing','available'].includes(this.state.status))return;await this.execute('update_check').catch(()=>{if(this.state.status==='error'){this.state.status=this.state.url?'configured':'unconfigured';this.state.message='Canal de atualização sem resposta. Tentamos de novo mais tarde.';}});};this.autoTimer=setTimeout(()=>{quiet().catch(()=>{});this.autoTimer=setInterval(()=>quiet().catch(()=>{}),AUTO_INTERVAL);this.autoTimer.unref?.();},AUTO_DELAY);this.autoTimer.unref?.();}
 async execute(action,data={}){if(this.busy){if(action==='update_read')return this.summary();throw Error('Aguarde a operação de atualização atual');}this.busy=true;try{await this.load();if(action==='update_read'){await this.current();}else if(action==='update_configure'){const channel=data.channel===undefined?this.state.channel:data.channel;if(!CHANNELS.includes(channel))throw Error('Canal inválido');const url=data.url===''?'':data.url?updateURL(data.url).href:defaultFeed(channel);await noLinks(this.file);await mkdir(dirname(this.file),{recursive:true});const tmp=this.file+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify({format:1,url,channel},null,2),{flag:'wx'});await rename(tmp,this.file);this.checked=null;this.state={...this.state,url,channel,status:url?'configured':'unconfigured',version:null,packagePath:null,totalBytes:0,downloadBytes:0,fileCount:0,novidades:[],checkedAt:null,message:url?'Atualizações ativas':'Atualizações desligadas'};}else if(action==='update_check'){this.checked=null;await this.check();}else if(action==='update_download'){await this.download();}else if(action==='update_install'){await this.install();}else throw Error('Comando de atualização inválido');}catch(e){this.state.status='error';this.state.packagePath=null;this.state.message=e.message;throw e;}finally{this.busy=false;this.last=this.summary();}return this.last;}
}
