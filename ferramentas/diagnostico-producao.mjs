import {readdir,lstat,readFile,writeFile,mkdir,open,rename,unlink,appendFile,statfs} from 'node:fs/promises';
import {execFile,spawn} from 'node:child_process';
import {join,resolve,relative,basename} from 'node:path';
import {hostname,platform,release,version,arch,cpus,totalmem,freemem,uptime} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {zipDiagnostics,readDiagnosticZip} from './diagnostico-zip.mjs';

const MAX_FILE=1024*1024,MAX_TOTAL=16*1024*1024,MAX_FILES=70;
const hash=data=>createHash('sha256').update(data).digest('hex');
const safe=n=>String(n).normalize('NFKD').replace(/[^A-Za-z0-9_.-]/g,'_').slice(0,100);
async function regular(path){try{const s=await lstat(path);return !s.isSymbolicLink()&&s.isFile()?s:null;}catch{return null;}}
async function directory(path){try{const s=await lstat(path);return !s.isSymbolicLink()&&s.isDirectory();}catch{return false;}}
async function insideWithoutLinks(root,path){const rel=relative(root,path);if(!rel||rel.startsWith('..')||resolve(root,rel)!==resolve(path))return false;let current=root;for(const part of rel.split(/[\\/]/)){current=join(current,part);const s=await lstat(current).catch(()=>null);if(!s||s.isSymbolicLink())return false;}return true;}
async function textSmall(path){const s=await regular(path);if(!s||s.size>256*1024)return '';return readFile(path,'utf8');}
// OAuth callbacks can be logged as a relative HTTP request target rather than a URL.
// Keep ordinary product state fields; state is sensitive only in OAuth query context.
function redactRelativeOAuthQueries(text){
 return text.replace(/(^|[\s"'(=,:])((?:\/[^\s<>"'?#]*)?\?[^\s<>"']+)/gm,(match,prefix,target,offset)=>{
  const question=target.indexOf('?');let end=target.length;
  for(let i=question+1;i<target.length;i++)if(target[i]==='#'&&!(target[i-1]==='&'&&/^#(?:38|x26);/i.test(target.slice(i)))){end=i;break;}
  const parts=target.slice(question+1,end).split(/(&amp;|&#38;|&#x26;|[&;])/i);
  const parameter=part=>{const equal=part.indexOf('=');if(equal<0)return null;let name=part.slice(0,equal);try{name=decodeURIComponent(name.replaceAll('+',' '));}catch{}return {name:name.toLowerCase(),equal};};
  const names=parts.filter((_,i)=>i%2===0).map(parameter).filter(Boolean).map(p=>p.name);
  const before=text.slice(Math.max(0,offset-100),offset);
  const oauth=names.some(n=>['code','access_token','id_token','error','error_description'].includes(n))||/(?:^|\/)(?:oauth\w*|auth|callback|redirect)(?:\/|$)/i.test(target.slice(0,question))||/\b(?:oauth|redirect|callback)[^\r\n]{0,80}[:=]\s*(?:GET|POST)?\s*$/i.test(before);
  for(let i=0;i<parts.length;i+=2){const p=parameter(parts[i]);if(p&&(p.name==='code'||p.name==='state'&&oauth))parts[i]=parts[i].slice(0,p.equal+1)+'[omitido]';}
  return prefix+target.slice(0,question+1)+parts.join('')+target.slice(end);
 });
}
export function redactDiagnostic(text,secrets=[],paths=[]){
 let s=String(text);
 for(const secret of [...new Set(secrets)].filter(x=>typeof x==='string'&&x.length>=4).sort((a,b)=>b.length-a.length))s=s.split(secret).join('[credencial omitida]');
 for(const path of paths.filter(Boolean).sort((a,b)=>b.length-a.length)){s=s.split(path).join('[pasta local]');s=s.split(path.replaceAll('\\','/')).join('[pasta local]');}
 s=redactRelativeOAuthQueries(s);
 s=s.replace(/\b(?:https?|rtmps?|srt|rist|turns?|stun):[^\s<>"']+/gi,'[endereço omitido]');
 s=s.replace(/((?:authorization|proxy-authorization)\s*[:=]\s*)(?:Bearer\s+|Basic\s+)?[^\r\n,}]+/gi,'$1[omitido]');
 s=s.replace(/((?:["']?)(?:password|passwd|passphrase|secret|token|api[_-]?key|apiToken|stream[_-]?key|streamKey|key|pin|username|credential|server|cookie|set-cookie|sessionId|accessToken|refreshToken)(?:["']?)\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}\r\n]+)/gi,'$1[omitido]');
 s=s.replace(/((?:^|\n)\s*(?:cookie|set-cookie)\s*:\s*)[^\r\n]+/gi,'$1[omitido]');
 s=s.replace(/(\b(?:Bearer|Basic)\s+)[A-Za-z0-9._~+\/-]+=*/gi,'$1[omitido]');
 s=s.replace(/(-{1,2}(?:password|passwd|passphrase|secret|token|api[_-]?key|stream[_-]?key|cookie|authorization)(?:\s+|=))(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s;\r\n]+)/gi,'$1[omitido]');
 s=s.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,'[token omitido]');
 s=s.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[email omitido]');
 s=s.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'[IP omitido]');
 s=s.replace(/\[(?:[0-9a-f]{0,4}:){2,}[0-9a-f:]+\]/gi,'[IP omitido]');
 s=s.replace(/\\\\[^\s"<>]*/g,'[caminho de rede omitido]');
 s=s.replace(/\b[A-Za-z]:[\\/](?:[^\r\n"<>|]*?)(?=\s+(?:e\b|and\b|com\b|para\b|from\b|to\b|rede\b|\[)|\s{2}|["<>|]|\r?\n|$)/gi,'[caminho local omitido]');
 return s;
}
async function knownSecrets(root){
 const paths=[join(root,'config','obs-studio','plugin_config','obs-websocket','config.json'),join(root,'config','obs-studio','plugin_config','freemix-control','acesso.json'),join(root,'painel','local.js')];
 const profiles=join(root,'config','obs-studio','basic','profiles');if(await directory(profiles))for(const p of await readdir(profiles)){if(await directory(join(profiles,p)))paths.push(join(profiles,p,'service.json'),join(profiles,p,'basic.ini'));}
 const control=join(root,'config','obs-studio','plugin_config','freemix-control');if(await directory(control))for(const name of await readdir(control)){if(/\.(json|ini)$/i.test(name))paths.push(join(control,name));}
 const secrets=[];for(const path of paths.slice(0,100)){if(!await insideWithoutLinks(root,path))continue;const text=await textSmall(path);for(const match of text.matchAll(/["']?(?:password|passwd|passphrase|secret|token|apiToken|api[_-]?key|stream[_-]?key|streamKey|key|pin|credential|username)["']?\s*[:=]\s*(?:"([^"\r\n]+)"|'([^'\r\n]+)'|([^\s,;}\r\n]+))/gi))secrets.push(match[1]||match[2]||match[3]);}
 return secrets;
}
async function gather(root){
 const list=[],add=async(folder,kind,depth=0)=>{if(depth>3||!await insideWithoutLinks(root,folder)||!await directory(folder))return;const entries=await readdir(folder,{withFileTypes:true});for(const e of entries.slice(0,300)){const p=join(folder,e.name);if(e.isSymbolicLink())continue;if(e.isDirectory()&&kind==='plugins')await add(p,kind,depth+1);else if(e.isFile()&&/\.(log|txt|ndjson)$/i.test(e.name)&&!/(secret|credential|token|password|config|preset)/i.test(e.name)){const s=await regular(p);if(s)list.push({path:p,kind,size:s.size,mtime:s.mtimeMs});}}};
 const config=join(root,'config','obs-studio');await add(join(config,'crashes'),'crash');await add(join(config,'logs'),'motor');
 await add(join(config,'plugin_config'),'plugins');await add(join(root,'logs'),'launcher');await add(join(root,'runtime','logs'),'launcher');
 return list.sort((a,b)=>(a.kind==='crash'?-1:0)-(b.kind==='crash'?-1:0)||b.mtime-a.mtime).slice(0,MAX_FILES);
}
async function boundedRead(path,size){const f=await open(path,'r');try{if(size<=MAX_FILE){const buffer=Buffer.alloc(size),r=await f.read(buffer,0,size,0);return {bytes:buffer.subarray(0,r.bytesRead),truncated:false};}const head=Buffer.alloc(64*1024),tail=Buffer.alloc(MAX_FILE-head.length);const h=await f.read(head,0,head.length,0),t=await f.read(tail,0,tail.length,Math.max(0,size-tail.length));const first=head.subarray(0,h.bytesRead),last=tail.subarray(0,t.bytesRead),headNewline=first.lastIndexOf(10),tailNewline=last.indexOf(10);return {bytes:Buffer.concat([headNewline<0?Buffer.alloc(0):first.subarray(0,headNewline+1),Buffer.from('\n[3Mix: trecho intermediário e linhas cortadas omitidos por tamanho]\n'),tailNewline<0?Buffer.alloc(0):last.subarray(tailNewline+1)]),truncated:true};}finally{await f.close();}}
async function supportStatus(root){
 const read=async path=>{if(!await insideWithoutLinks(root,path))return null;try{return JSON.parse(await textSmall(path));}catch{return null;}};
 const control=join(root,'config/obs-studio/plugin_config/freemix-control'),installation=await read(join(root,'installation.json')),network=await read(join(control,'network.json')),ndi=await read(join(control,'ndi-runtime.json'));
 const choose=(source,fields)=>source?Object.fromEntries(fields.filter(k=>['string','boolean','number'].includes(typeof source[k])).map(k=>[k,source[k]])):null;
 return {format:1,readOnly:true,probesExecuted:false,installation:choose(installation,['status','version','apiPort','wsPort','appStarted','firewallApplied']),network:choose(network,['allowLan','apiPort','port','controlLan','ndi','omt','firewallApplied']),ndiRuntime:choose(ndi,['sha256','size','architecture','scope','globalEnvironmentChanged','globallyInstalled','verifiedAt']),availability:{installationReceipt:!!installation,networkReceipt:!!network,ndiRuntimeReceipt:!!ndi},limit:'Recibos locais existentes; não testa portas, rede, dependências carregadas ou dispositivos. Não inclui configurações completas nem credenciais.'};
}
const texto=(v,n)=>String(v??'').replace(/\0/g,'').slice(0,n);
const IMPACTO={fechou:'Fechou ou travou o programa',saida:'Parou saída, gravação ou transmissão',operacao:'Atrapalha a operação',visual:'Detalhe visual'};
const FREQUENCIA={sempre:'Sempre','as-vezes':'Às vezes','uma-vez':'Só uma vez'};
// O que o testador escreveu. O contato fica como digitado: é o dado que ele quer que chegue.
function relatoDoTestador(r,redact){
 if(!r||typeof r!=='object')return null;
 return {aconteceu:redact(texto(r.aconteceu,2000)),fazendo:redact(texto(r.fazendo,2000)),esperado:redact(texto(r.esperado,500)),impacto:IMPACTO[r.impacto]||'',frequencia:FREQUENCIA[r.frequencia]||'',nome:texto(r.nome,80).replace(/[\r\n]/g,' '),contato:texto(r.contato,120).replace(/[\r\n]/g,' ')};
}
function relatoEmTexto(r,meta){
 const linha=(rotulo,valor)=>rotulo+': '+(valor||'(não informado)');
 return [linha('Versão',meta.version),linha('Gerado em',meta.createdAt),linha('Nome',r?.nome),linha('Contato',r?.contato),linha('Impacto',r?.impacto),linha('Frequência',r?.frequencia),'','O QUE ACONTECEU',r?.aconteceu||meta.note||'(não informado)','','O QUE ESTAVA FAZENDO',r?.fazendo||'(não informado)','','O QUE DEVERIA ACONTECER',r?.esperado||'(não informado)',''].join('\r\n');
}
// Placas e drivers vêm do registro: a consulta WMI leva de 5 a mais de 40 s numa máquina em carga.
const CLASSE_VIDEO='HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}';
const consultaRegistro=valor=>new Promise(ok=>execFile('reg.exe',['query',CLASSE_VIDEO,'/s','/v',valor],{timeout:5000,windowsHide:true,maxBuffer:512*1024},(erro,saida)=>ok(erro?'':String(saida))));
async function placasDeVideo(){
 const placas=new Map();
 for(const [campo,valor] of [['nome','DriverDesc'],['driver','DriverVersion'],['dataDriver','DriverDate']]){let chave='';for(const linha of (await consultaRegistro(valor)).split(/\r?\n/)){if(/^HKEY_/i.test(linha)){chave=/\\\d{4}$/.test(linha)?linha.trim():'';continue;}const m=linha.match(/^\s+\S+\s+REG_\S+\s+(.+)$/);if(chave&&m)placas.set(chave,{...placas.get(chave),[campo]:m[1].trim()});}}
 return [...placas.values()].filter(p=>p.nome);
}
async function sistemaDetalhado(root){
 const base={sistema:version(),build:release(),arquitetura:arch(),cpu:cpus()[0]?.model||'',nucleos:cpus().length,memoriaGB:Math.round(totalmem()/1024**3),memoriaLivreGB:Math.round(freemem()/1024**3),ligadoHa:Math.round(uptime()/60)+' min'};
 try{const d=await statfs(root);base.discos=[{local:'pasta da instalação',totalGB:Math.round(d.blocks*d.bsize/1024**3),livreGB:Math.round(d.bavail*d.bsize/1024**3)}];}catch{}
 if(platform()==='win32')base.placas=await placasDeVideo();
 return base;
}
// Identifica o build exato: é o que permite casar o relatório de crash com os símbolos guardados.
async function binarios(root){
 const lista=[];for(const nome of ['bin/64bit/FreeMix.exe','bin/64bit/obs.dll','obs-plugins/64bit/source-record.dll']){const p=join(root,nome),st=await regular(p);if(st&&st.size<256*1024*1024)lista.push({nome,bytes:st.size,modificado:new Date(st.mtimeMs).toISOString(),sha256:hash(await readFile(p))});}
 return lista;
}
function resumoCrash(conteudo){
 const fim=conteudo.indexOf('(Crashed)'),bloco=fim<0?'':conteudo.slice(fim,(conteudo.indexOf('\nThread ',fim+9)+1||conteudo.length+1)-1),modulos=[...new Set([...bloco.matchAll(/([A-Za-z0-9_.-]+\.(?:dll|exe))!/gi)].map(m=>m[1].toLowerCase()))];
 return {excecao:conteudo.match(/Unhandled exception: (\S+)/)?.[1]||'',quando:conteudo.match(/Date\/Time: ([^\r\n]+)/)?.[1]||'',moduloDaFalha:conteudo.match(/Fault address: \S+ \((?:[^)]*[\\/])?([^)\\/]+)\)/)?.[1]||'',modulosNaPilha:modulos.slice(0,10)};
}
async function crashesResumo(root){
 const pasta=join(root,'config','obs-studio','crashes');if(!await directory(pasta))return [];const itens=[];
 for(const nome of await readdir(pasta)){const p=join(pasta,nome),st=await regular(p);if(st&&st.size<4*1024*1024)itens.push({at:st.mtimeMs,...resumoCrash(await readFile(p,'latin1'))});}
 return itens.sort((a,b)=>b.at-a.at).slice(0,20).map(({at,...resto})=>resto);
}
// Últimas ações da sessão, sem o encadeamento de hashes: mostra o caminho até o erro.
async function sessaoRecente(root){
 const pasta=join(root,'projetos','sessoes');if(!await directory(pasta))return '';let atual=null;
 for(const nome of await readdir(pasta)){if(!nome.endsWith('.jsonl'))continue;const st=await regular(join(pasta,nome));if(st&&(!atual||st.mtimeMs>atual.at))atual={at:st.mtimeMs,caminho:join(pasta,nome),tamanho:st.size};}
 if(!atual)return '';const lido=await boundedRead(atual.caminho,atual.tamanho),linhas=lido.bytes.toString('utf8').split(/\r?\n/).filter(Boolean);let erroAnterior=null;const saida=[];
 for(const linha of linhas){try{const j=JSON.parse(linha),item={at:new Date(j.at).toISOString(),acao:j.action,entrada:j.input,etapa:j.step,projeto:j.scope,eventos:j.nativeEvents};const erroNovo=j.stateCaptureError&&j.stateCaptureError!==erroAnterior;if(erroNovo)item.erroEstado=j.stateCaptureError;erroAnterior=j.stateCaptureError||erroAnterior;if(j.action!=='native_state'||erroNovo)saida.push(JSON.stringify(item));}catch{}}
 return saida.slice(-300).join('\n')+'\n';
}
// Erros das telas, gravados na pasta de logs que já entra no pacote. Limite de tamanho com uma geração anterior.
export async function registrarErroPainel(root,d={}){
 const pasta=join(resolve(root),'logs'),arquivo=join(pasta,'painel-erros.ndjson');await mkdir(pasta,{recursive:true});
 const atual=await lstat(arquivo).catch(()=>null);if(atual?.isSymbolicLink())throw Error('Log inválido');if(atual&&atual.size>512*1024)await rename(arquivo,join(pasta,'painel-erros-anterior.ndjson')).catch(()=>{});
 await appendFile(arquivo,JSON.stringify({at:new Date().toISOString(),tipo:texto(d.tipo,20),pagina:texto(d.pagina,200),mensagem:texto(d.mensagem,1000),origem:texto(d.origem,300),linha:Number(d.linha)||0,coluna:Number(d.coluna)||0,pilha:texto(d.pilha,3000),navegador:texto(d.navegador,200)})+'\n',{mode:0o600});
}
export class DiagnosticCollector{
 constructor(root){this.root=resolve(root);this.folder=join(this.root,'diagnosticos');this.busy=null;this.last=null;}
 async generate({note='',machineName=hostname(),relato=null,estado=null}={}){if(this.busy)throw Error('Um diagnóstico já está sendo gerado');this.busy=this.create({note,machineName,relato,estado});try{return await this.busy;}finally{this.busy=null;}}
 async create({note,machineName,relato,estado}){
  if(!await directory(this.root))throw Error('Instalação não encontrada');if((await lstat(this.folder).catch(()=>null))?.isSymbolicLink())throw Error('Pasta de diagnóstico inválida');await mkdir(this.folder,{recursive:true});
  const secrets=await knownSecrets(this.root),paths=[this.root,process.env.USERPROFILE,process.env.TEMP,process.env.TMP];const redact=s=>redactDiagnostic(s,secrets,paths);const files=[],collected=[],omitted=[];let total=0;
  for(const item of await gather(this.root)){if(total>=MAX_TOTAL){omitted.push('Limite total de logs atingido');break;}const stat=await regular(item.path);if(!stat)continue;try{const read=await boundedRead(item.path,stat.size),data=Buffer.from(redact(read.bytes.toString('utf8')));if(total+data.length>MAX_TOTAL){omitted.push('Log omitido por limite total');continue;}total+=data.length;const name=`logs/${item.kind}/${String(collected.length+1).padStart(3,'0')}-${safe(basename(item.path))}`;files.push({name,data});collected.push({name,originalBytes:stat.size,bytes:data.length,truncated:read.truncated,modifiedAt:new Date(stat.mtimeMs).toISOString()});}catch{omitted.push('Log indisponível durante a leitura');}}
  let instanceId;const idFile=join(this.folder,'instancia.txt');const old=await textSmall(idFile);if(/^[0-9a-f-]{36}$/.test(old.trim()))instanceId=old.trim();else{instanceId=randomUUID();await writeFile(idFile,instanceId,{flag:'wx',mode:0o600}).catch(()=>{});}
  let version='não identificada';try{const v=JSON.parse(await textSmall(join(this.root,'version.json')));version=String(v.version||v.build||version);}catch{}
  files.push({name:'support-status.json',data:Buffer.from(redact(JSON.stringify(await supportStatus(this.root),null,2)))});
  const anexar=async(name,fazer,json=true)=>{try{const valor=await fazer();if(valor!=null&&valor!=='')files.push({name,data:Buffer.from(redact(json?JSON.stringify(valor,null,2):valor))});}catch{omitted.push('Não foi possível reunir '+name);}};
  await anexar('sistema.json',()=>sistemaDetalhado(this.root));await anexar('binarios.json',()=>binarios(this.root));await anexar('crashes-resumo.json',()=>crashesResumo(this.root));await anexar('sessao-recente.ndjson',()=>sessaoRecente(this.root),false);await anexar('estado-no-momento.json',()=>estado);await anexar('versao.json',()=>textSmall(join(this.root,'version.json')),false);
  const metadata={format:'freemix-diagnostic-1',id:randomUUID(),createdAt:new Date().toISOString(),instanceId,machineName:redact(String(machineName).replace(/[\r\n\0]/g,' ').slice(0,80)),version:redact(version),system:{platform:platform(),release:release(),arch:arch(),cpu:cpus()[0]?.model||'',logicalCpus:cpus().length,memoryGB:Math.round(totalmem()/1024**3)},note:redact(String(note).slice(0,2000)),relato:relatoDoTestador(relato,redact),logs:collected,omitted,privacy:{sent:false,includes:['logs recentes do motor, plugins, API e inicialização','relatórios de crash','resumo de rede, instalação e dependências existente','versão e sistema, placa de vídeo, driver e disco','estado do programa no momento e últimas ações da sessão','erros das telas','nome ou apelido da máquina'],excludes:['senhas, chaves, passphrases, cookies e tokens reconhecidos','configurações completas e projetos','áudio, vídeo e capturas de tela','dump de memória e documentos pessoais'],notice:'A remoção automática reduz dados privados; revise a prévia antes de compartilhar. Até 70 logs, 1 MB por log e 16 MB de logs no total; arquivos grandes usam início e final.'}};
  files.push({name:'diagnostico.json',data:Buffer.from(JSON.stringify(metadata,null,2))});files.push({name:'RELATO.txt',data:Buffer.from(relatoEmTexto(metadata.relato,metadata))});files.push({name:'LEIA-ME.txt',data:Buffer.from('3Mix — diagnóstico local\r\nEste ZIP foi gerado no computador e não foi enviado automaticamente.\r\nVeja diagnostico.json para a lista de arquivos, truncamentos e limites.\r\nRevise o conteúdo antes de enviar por e-mail ou WhatsApp.\r\nNão inclui projetos, mídias, configurações completas nem dumps de memória.\r\n')});
  const manifest={format:'freemix-diagnostic-1',files:files.map(f=>({name:f.name,size:f.data.length,sha256:hash(f.data)}))};files.push({name:'manifest.json',data:Buffer.from(JSON.stringify(manifest,null,2))});const zip=await zipDiagnostics(files);await readDiagnosticZip(zip);
  const name=`3Mix-Diagnostico-${metadata.createdAt.replace(/[^0-9]/g,'').slice(0,14)}-${metadata.id.slice(0,8)}.zip`,destination=join(this.folder,name),temporary=destination+'.tmp';await writeFile(temporary,zip,{flag:'wx',mode:0o600});await rename(temporary,destination);
  // Generated ZIPs only: bounded retention avoids collecting a growing archive into itself.
  const previous=(await readdir(this.folder)).filter(n=>/^(?:3Mix|FreeMix)-Diagnostico-\d{14}-[0-9a-f]{8}\.zip$/.test(n)&&n!==name).sort().reverse();for(const old of previous.slice(4))if(await regular(join(this.folder,old)))await unlink(join(this.folder,old));
  this.last={success:true,id:metadata.id,name,path:destination,size:zip.length,sha256:hash(zip),report:metadata};return this.last;
 }
 async download(id){if(!this.last||id!==this.last.id)throw Error('Gere um diagnóstico nesta sessão');return readFile(this.last.path);}
 summary(){return this.last?{...this.last,path:undefined}:{success:true,ready:true};}
 // Crash mais novo que o último pacote gerado: o que ainda não foi relatado. O destino vem de config/suporte.json.
 async situacao(){
  const maisNovo=async(pasta,filtro)=>{if(!await directory(pasta))return 0;let m=0;for(const n of await readdir(pasta)){if(!filtro(n))continue;const st=await regular(join(pasta,n));if(st&&st.mtimeMs>m)m=st.mtimeMs;}return m;};
  const crash=await maisNovo(join(this.root,'config','obs-studio','crashes'),()=>true),zip=await maisNovo(this.folder,n=>/-Diagnostico-.*\.zip$/.test(n));
  let destino='';try{const c=JSON.parse(await textSmall(join(this.root,'config','suporte.json')));if(typeof c.destino==='string')destino=c.destino.trim().slice(0,200);}catch{}
  return {...this.summary(),ultimoCrash:crash?new Date(crash).toISOString():null,crashPendente:crash>zip,destino};
 }
 async revelar(){if(!this.last?.path||!await regular(this.last.path))throw Error('Gere o pacote primeiro');if(platform()!=='win32')return;const janela=spawn(join(process.env.WINDIR||'C:\\Windows','explorer.exe'),['/select,',this.last.path],{detached:true,stdio:'ignore',windowsHide:true});janela.on('error',()=>{});janela.unref();}
}
