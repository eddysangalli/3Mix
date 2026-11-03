import {MixEffectsEngine} from './mix-effects-producao.mjs';
import {join} from 'node:path';import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {ndiRead,ndiStart,ndiStop,ndiCreateInput} from './ndi-producao.mjs';
import {omtRead,omtStart,omtStop,omtCreateInput} from './omt-producao.mjs';
import {omtHdrRead,omtHdrExecute} from './omt-hdr-producao.mjs';
import {srtHdrRead,srtHdrExecute} from './srt-hdr-producao.mjs';
import {srtDestinationOptions} from './saidas-srt.mjs';
import {sdiConfig} from './saidas-sdi.mjs';
import {assertSdrOutputRequest,outputHdrContracts} from './saidas-hdr.mjs';
import {MultiRTMPAdapter} from './multi-rtmp-adapter.mjs';
const fields=['chroma','alphaMode','protocol','enhancedRtmp','name','server','key','enabled','mode','sourceUuid','width','height','bitrate','audioTrack','audioSourceUuid','mixId','stingerAudio','autoStart','fill','encoder','fpsDivisor','overlaysMask','overlayChannels'];
export class OutputEngine {
 // mixes: shared MixEffectsEngine instance (audit finding A6 — this engine and
 // SignalRegistryEngine used to each construct their own, so the HTTP path's
 // operationId receipts (correlated()/reconcile()) lived in a Map the Signal
 // Registry's meTally()/summary() could never see, and vice-versa. A second
 // positional arg keeps every existing call site (`new OutputEngine(this)`,
 // `new OutputEngine(p)` in tests) working unchanged — it defaults to a fresh
 // instance, same behavior as before, for any caller that doesn't pass one.
 constructor(p,mixes=new MixEffectsEngine(p)){this.p=p;this.mixes=mixes;this.last=null;this.obs={req:(type,data)=>p.req(type,data),tryReq:(type,data)=>p.optional(type,data)};this.external=new MultiRTMPAdapter((type,data)=>p.req(type,data));}
 async readSrtHdr(senderId=0){const srtHdr=await srtHdrRead(this.obs,{senderId});const native=await this.p.vendor('get_destinations',{},'freemix');return {srtHdr,audioSources:native.audioSources||[]};}
 async audioUuid(value){const uuid=String(value||'');if(!uuid)return '';if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid))throw Error('Selecione áudio por UUID');const native=await this.p.vendor('get_destinations',{},'freemix');if(!native.audioSourceSelectable||!native.audioSources?.some(s=>s.uuid===uuid))throw Error('Barramento ausente, privado ou com trilhas globais habilitadas');return uuid;}
 async overlayChannels(){const list=await this.p.vendor('get_downstream_keyers'),base=Number(list.downstream_keyers_channel||7);return Array.from({length:8},(_,i)=>{const index=(list.downstream_keyers||[]).findIndex(k=>k.name===String(i+1));return {channel:index<0?0:base+index};});}
 async profiles(){const {currentSceneCollectionName}=await this.p.req('GetSceneCollectionList');const id=createHash('sha256').update(currentSceneCollectionName).digest('hex').slice(0,24),folder=join(this.p.root,'config/obs-studio/plugin_config/freemix-output-profiles'),file=join(folder,id+'.json');let data={};try{data=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}return {data,folder,file};}
 async read(){const [native,ndi,omt,mix,profiles,sdi,omtHdrSenders]=await Promise.all([this.p.vendor('get_destinations',{},'freemix'),ndiRead(this.obs,{root:this.p.root}),omtRead(this.obs),this.mixes.read(),this.profiles(),this.p.vendor('sdi_output',{action:'state'},'freemix').catch(()=>({available:false,active:false,requiresUpdate:true})),Promise.all([0,1,2,3].map(senderId=>omtHdrRead(this.obs,{senderId})))]);return {...native,sdi,omtHdr:omtHdrSenders[0],omtHdrSenders,hdrContracts:outputHdrContracts,protocols:(native.protocols||[]).map(p=>({...p,videoCodecs:String(p.videoCodecs||'').split(';').filter(Boolean),audioCodecs:String(p.audioCodecs||'').split(';').filter(Boolean)})),ndi,omt,mix,external:this.external.summary(),profiles:Object.keys(profiles.data).sort(),destinations:native.destinations.map(({key,...d},index)=>({...d,index,hasKey:!!key}))};}
 async execute(action,d){const index=Number(d.index);if(action==='outputs_get'){this.last=await this.read();return;}
  if(action==='outputs_external_read'){await this.external.read({id:d.id});this.last=await this.read();return;}
  if(action==='outputs_srt_hdr'){
   const {action:_action,command,senderId=0,...options}=d;
   let srtHdr;
   if(command==='state'){
    if(Object.keys(options).length)throw Error('Consulta HDR não recebe configuração');
    throw Error('Consulta HDR usa GET /api/srt-hdr');
   }else{
    if(['configure','preflight'].includes(command))options.audioSourceUuid=await this.audioUuid(options.audioSourceUuid);
    srtHdr=await srtHdrExecute(this.obs,{command,senderId,...options});
   }
   const native=await this.p.vendor('get_destinations',{},'freemix');
   this.last={...this.last,srtHdr,audioSources:native.audioSources||[]};return;
  }
  if(action==='outputs_omt_hdr'){
   const data={...d};if(['configure','preflight'].includes(d.command)){data.sourceUuid=d.sourceUuid?String(d.sourceUuid):this.p.scene(d.input).key;data.audioSourceUuid=await this.audioUuid(d.audioSourceUuid);}
   const omtHdr=await omtHdrExecute(this.obs,data);this.last={...await this.read(),omtHdr};return;
  }
  // Corte de M/E não espera a leitura de todas as saídas: basta o estado dos próprios M/Es.
  if(action==='outputs_mix'){const result=await this.mixes.execute(d);const base=this.last?.protocols?this.last:await this.read();this.last={...base,mix:await this.mixes.read(),mixOperation:result.operation||null,mixConfirmation:result.confirmation};return;}
  if(action.startsWith('outputs_profile_')){const profile=String(d.profile||'').trim();if(!profile||profile.length>80||!/^[-\p{L}\p{N} _]+$/u.test(profile)||['__proto__','constructor','prototype'].includes(profile))throw Error('Nome de perfil inválido');const {data,folder,file}=await this.profiles();if(action==='outputs_profile_save'){const native=await this.p.vendor('get_destinations',{},'freemix');data[profile]=native.destinations.map(({key,...value})=>({...Object.fromEntries(fields.filter(f=>f!=='key').map(f=>[f,value[f]])),autoStart:false}));await mkdir(folder,{recursive:true});await writeFile(file+'.tmp',JSON.stringify(data,null,2));for(let attempt=0;attempt<5;attempt++){try{await rename(file+'.tmp',file);break;}catch(e){if(attempt===4||!['EPERM','EBUSY','EACCES'].includes(e.code))throw e;await new Promise(r=>setTimeout(r,50));}}}else if(action==='outputs_profile_load'){if(!data[profile])throw Error('Perfil não encontrado');const native=await this.p.vendor('get_destinations',{},'freemix');if(native.destinations.some(o=>o.active))throw Error('Pare as saídas antes de trocar perfil');await this.p.vendor('set_destinations',{destinations:data[profile].map((v,i)=>({...v,chroma:v.chroma??native.destinations[i]?.chroma??'420',alphaMode:v.alphaMode??native.destinations[i]?.alphaMode??'none',key:native.destinations[i]?.key||''}))},'freemix');}else throw Error('Comando do perfil inválido');this.last=await this.read();return;}
  if(action==='outputs_sdi'){if(!['configure','preflight','start','stop','state','refresh'].includes(d.command))throw Error('Comando SDI inválido');const slot=d.slot===undefined?0:Number(d.slot);if(!Number.isInteger(slot)||slot<0||slot>15)throw Error('Saída SDI inválida');const data={action:d.command,slot};if(['configure','preflight'].includes(d.command))data.config=sdiConfig(d,d.hdr===true?String(d.sourceUuid||''):d.input?this.p.scene(d.input).key:'',await this.audioUuid(d.audioSourceUuid));const sdi=await this.p.vendor('sdi_output',data,'freemix');this.last={...await this.read(),sdi};return;}
  if(action==='outputs_network'){
   if(d.command!=='stop')assertSdrOutputRequest(d.protocol,d);
   if(!['NDI','OMT'].includes(d.protocol)||!['start','stop','restart'].includes(d.command))throw Error('Saída de rede inválida');
   const senderId=Number(d.senderId??0);if(!Number.isInteger(senderId)||senderId<0||senderId>3)throw Error('Selecione sender 1 a 4');
   const read=d.protocol==='NDI'?ndiRead:omtRead,start=d.protocol==='NDI'?ndiStart:omtStart,stop=d.protocol==='NDI'?ndiStop:omtStop;
   if(d.command==='stop')await stop(this.obs,{senderId});
   else if(d.command==='restart'){const state=await read(this.obs,{senderId});if(!state.outputCreated)throw Error('Ligue este sender antes de reiniciá-lo');await stop(this.obs,{senderId});await start(this.obs,{senderId,mode:state.mode,sourceUuid:state.sourceUuid,audioTrack:state.audioTrack,audioSourceUuid:state.audioSourceUuid,alpha:state.alpha,precisionBits:state.precisionBits||8,fillKey:state.fillKey,keyName:state.keyName,name:state.networkName||'',groups:state.groups||''});}
   else{const audioSourceUuid=await this.audioUuid(d.audioSourceUuid);const mode=d.mode||'program',audioTrack=Number(d.audioTrack??0);if(!['program','source'].includes(mode)||![0,1,2].includes(audioTrack))throw Error('Conteúdo ou áudio de rede inválido');await start(this.obs,{senderId,mode,audioTrack,audioSourceUuid,sourceUuid:mode==='source'?this.p.scene(d.input).key:'',alpha:d.alpha===true,precisionBits:Number(d.precisionBits??8),fillKey:d.fillKey===true,keyName:String(d.keyName||'').trim(),name:String(d.name||'').trim(),groups:d.groups||''});}
   this.last=await this.read();return;
  }
  if(action==='outputs_source'){if(!['NDI','OMT'].includes(d.protocol))throw Error('Entrada de rede inválida');const sceneName=this.p.scene(d.input).name,inputName=String(d.name||'').trim(),sourceName=String(d.sourceName||'').trim();if(!inputName||inputName.length>120||!sourceName||sourceName.length>500)throw Error('Nome da entrada e fonte de rede obrigatórios');if(d.protocol==='NDI')await ndiCreateInput(this.obs,{sceneName,inputName,sourceName,framesync:d.framesync!==false});else await omtCreateInput(this.obs,{sceneName,inputName,sourceName});this.last=await this.read();return;}
  if(!Number.isInteger(index)||index<0||index>3)throw Error('Selecione uma das quatro saídas extras');
  if(action==='outputs_configure'){
   assertSdrOutputRequest('SRT',d);
   const before=await this.p.vendor('get_destinations',{},'freemix'),all=Array.from({length:4},(_,n)=>Object.fromEntries(fields.map(k=>[k,before.destinations[n]?.[k]]).filter(([,v])=>v!==undefined)));
   const mixId=Number(d.mixId??2);if(![2,3,4].includes(mixId))throw Error('Selecione Mix 2, 3 ou 4');const mode=d.mode;if(!['source','program','preview','clean','mix'].includes(mode))throw Error('Escolha entrada, Programa, Preview, Clean ou Mix 2');
   // Default Audio Bus per M/E: only applies when this destination's own audio fields were left exactly at their
   // untouched defaults (no explicit audioSourceUuid AND audioTrack omitted or Master/0, the panel's own blank
   // state) -- a destination that already chose its own audio, even Master explicitly, is never silently
   // overridden. 'master' maps to the existing Master/A/B track selector (audioTrack), never audioSourceUuid.
   const inheritedBus=mode==='mix'&&!d.audioSourceUuid&&(d.audioTrack===undefined||Number(d.audioTrack)===0)?this.p.mixAudio.resolve(mixId):null;
   const inheritedUuid=inheritedBus&&inheritedBus!=='master'&&inheritedBus!=='busA'&&inheritedBus!=='busB'?inheritedBus:undefined;
   const inheritedTrack=inheritedBus==='busA'?1:inheritedBus==='busB'?2:undefined;
   const audioSourceUuid=await this.audioUuid(inheritedUuid??d.audioSourceUuid);if(audioSourceUuid&&!before.audioSourceSelectable)throw Error('Motor sem áudio independente por UUID');
   const width=Number(d.width),height=Number(d.height),bitrate=Number(d.bitrate),audioTrack=inheritedTrack??Number(d.audioTrack);if(![width,height].every(v=>Number.isInteger(v)&&v>=240&&v<=3840&&v%2===0)||!Number.isInteger(bitrate)||bitrate<200||bitrate>50000||![0,1,2].includes(audioTrack))throw Error('Resolução, bitrate ou áudio inválidos');
    const name=String(d.name||'').trim(),server=String(d.server||'').trim();const protocol=String(d.protocol||'auto');if(!['auto','rtmp','rtmps','srt','rist','hls'].includes(protocol))throw Error('Protocolo inválido');if(!name||name.length>80||server&&!/^(rtmps?|srt|rist|https?):\/\/[^\s]+$/i.test(server)||server.length>1000||server&&(/^(http|https):/.test(server))!==(protocol==='hls'))throw Error('Nome ou servidor inválido; HTTP/HTTPS precisa selecionar HLS');if(d.autoStart&&!server)throw Error('Informe o servidor antes de ativar início automático');
   if(d.key!==undefined&&(typeof d.key!=='string'||d.key.length>2000))throw Error('Chave inválida');
   const encoder=d.encoder||'obs_x264',fpsDivisor=Number(d.fpsDivisor??1),overlaysMask=Number(d.overlaysMask??0);if(!before.encoders?.some(e=>e.id===encoder)||!Number.isInteger(fpsDivisor)||fpsDivisor<1||fpsDivisor>8||!Number.isInteger(overlaysMask)||overlaysMask<0||overlaysMask>255)throw Error('Codificador indisponível, FPS ou overlays inválidos');
   const srt=srtDestinationOptions({...d,protocol,server,encoder,width},all[index],before);
   all[index]={...all[index],...srt,protocol,enhancedRtmp:d.enhancedRtmp===true,name,server,mode,mixId,stingerAudio:d.stingerAudio!==false,sourceUuid:mode==='source'?this.p.scene(d.input).key:'',width,height,bitrate,audioTrack,audioSourceUuid,encoder,fpsDivisor,overlaysMask:mode==='clean'?0:overlaysMask,overlayChannels:await this.overlayChannels(),fill:d.fill===true,enabled:d.enabled!==false,autoStart:d.autoStart===true,...(d.clearKey?{key:''}:d.key?{key:d.key}:{})};
   await this.p.vendor('set_destinations',{destinations:all},'freemix');this.last=await this.read();return;
  }
  if(!['outputs_start','outputs_stop','outputs_record'].includes(action))throw Error('Comando de saída inválido');
  if(action!=='outputs_stop'){const current=await this.p.vendor('get_destinations',{},'freemix'),channels=await this.overlayChannels();if(JSON.stringify(current.destinations[index]?.overlayChannels)!==JSON.stringify(channels)){const all=current.destinations.map(v=>Object.fromEntries(fields.map(k=>[k,v[k]]).filter(([,v])=>v!==undefined)));all[index].overlayChannels=channels;await this.p.vendor('set_destinations',{destinations:all},'freemix');}}
   if(action==='outputs_start'&&!(await this.p.vendor('get_destinations',{},'freemix')).destinations[index]?.server)throw Error('Informe o servidor do protocolo selecionado para transmitir. A gravação local pode usar o campo vazio.');
   const data={index,action:action==='outputs_start'?'start':action==='outputs_stop'?'stop':'record'};
  if(action==='outputs_record'){const folder=join(this.p.root,'gravacoes/saidas');await mkdir(folder,{recursive:true});data.path=join(folder,'saida-'+(index+2)+'-'+Date.now()+'.mkv');}
  await this.p.vendor('control_destination',data,'freemix');if(action==='outputs_stop'){let done=false;for(let n=0;n<200;n++){const state=await this.p.vendor('get_destinations',{},'freemix');if(!state.destinations[index].active&&state.destinations[index].state!=='stopping'){done=true;break;}await new Promise(r=>setTimeout(r,100));}if(!done)throw Error('A saída ainda está finalizando o arquivo; aguarde antes de reabrir');}this.last={...await this.read(),...(data.path?{recordingPath:data.path}:{})};
 }
}
