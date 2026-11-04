// Private talkback uses individual PCM returns; legacy untargeted callers may use bus B.
// A short lease closes the microphone if the console disappears.
import {randomUUID,createHash} from 'node:crypto';import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';import {join} from 'node:path';
import {CallReturns} from './retornos-calls.mjs';
import {validateCallIce,callIceSummary} from './calls-ice.mjs';
const tracks=on=>Object.fromEntries([1,2,3,4,5,6].map(n=>[n===6?'6':String(n),n===6&&on]));
// The call id is what the guest link carries ("password" of the call): unguessable, letters and digits only.
const newCallId=()=>'fm'+randomUUID().replaceAll('-','').slice(0,12);
export const CALL_AUDIO_SPECS=Object.freeze({
 gate:{kind:'noise_gate_filter',name:'3Mix Audio - Gate',settings:{open_threshold:-26,close_threshold:-32,attack_time:25,hold_time:200,release_time:150}},
 compressor:{kind:'compressor_filter',name:'3Mix Audio - Compressor',settings:{ratio:4,threshold:-18,attack_time:6,release_time:60,output_gain:0,sidechain_source:'none'}},
 agc:{kind:'compressor_filter',name:'3Mix Call - AGC',settings:{ratio:3,threshold:-24,attack_time:12,release_time:250,output_gain:6,sidechain_source:'none'}},
 limiter:{kind:'limiter_filter',name:'3Mix Audio - Limiter',settings:{threshold:-3,release_time:60}}
});
export function validateReturnRoute(data,{guests,inputs,audio,director}){
 const route=guests.find(g=>g.key===data.key);if(!route)throw Error('Convidado inválido');
 const video=data.video||'program',mode=data.audio||'program',gain=Number(data.gain??1);
 if(video!=='program'&&!inputs.some(i=>i.key===video))throw Error('Entrada de vídeo inválida');
 if(!['program','custom','silent'].includes(mode)||!Number.isFinite(gain)||gain<0||gain>2)throw Error('Seleção ou nível de áudio inválido');
 if(!Array.isArray(data.audioSources??[])||(data.audioSources||[]).length>32)throw Error('Selecione até 32 fontes de áudio');
 const audioSources=mode==='custom'?[...new Set(data.audioSources||[])]:[];
 if(audioSources.some(key=>key===director||!audio.some(i=>i.inputUuid===key)))throw Error('Fonte de áudio inválida; mic do diretor usa somente Talkback');
 return {video,audio:mode,audioSources,gain};
}
export class CallEngine{
 constructor(p){this.p=p;this.scope=null;this.director=null;this.lease=null;this.deadline=0;this.tail=Promise.resolve();this.returns=new CallReturns(this);this.individual=false;this.returnRoutes=[];this.conference=true;this.experimentalContinuousVideo=false;this.timer=setInterval(()=>{if(this.lease&&Date.now()>this.deadline)this.release().catch(()=>{});},150);this.timer.unref();}
 async save(){await mkdir(join(this.file,'..'),{recursive:true});await writeFile(this.file+'.tmp',JSON.stringify({director:this.director,returnRoutes:this.returnRoutes,conference:this.conference,experimentalContinuousVideo:this.experimentalContinuousVideo===true,rapidTargets:this.rapidTargets??null,ice:this.ice??null}));await rename(this.file+'.tmp',this.file);}
 async prepareReturns(){
  const guests=(await this.summary(this.p.state.inputs)).guests;
  if(!guests.length)throw Error('Crie primeiro uma entrada Call');
  if(guests.length>8)throw Error('Esta configuração aceita até 8 convidados');
  const all=(await this.p.req('GetInputList')).inputs;
  const audioNames=new Set(this.p.state.audioInputs.filter(i=>!i.bus&&!/^3Mix (?:Retorno|N1)/.test(i.name)).map(i=>i.name));
  const sources=all.filter(i=>audioNames.has(i.inputName));
  if(this.director&&!sources.some(i=>i.inputUuid===this.director.key)){const mic=all.find(i=>i.inputUuid===this.director.key);if(mic)sources.push(mic);}
  if(sources.length>32)throw Error('Selecione um projeto com até 32 fontes para os taps de áudio de Calls');
  const previous=this.returnRoutes;
  const next=guests.map(g=>({...previous.find(r=>r.key===g.key),key:g.key,stream:previous.find(r=>r.key===g.key)?.stream||'FMX'+randomUUID().replaceAll('-','')}));
  for(const route of next)Object.assign(route,validateReturnRoute(route,{guests,inputs:this.p.state.inputs,audio:sources,director:this.director?.key}));
  // Resolve enabled Program before enabling PCM; panel state may still describe the previous scene.
  const currentProgram=await this.p.req('GetSceneList');
  const programNames=await this.p.visibleTree(currentProgram.currentProgramSceneName);
  const program=sources.filter(i=>programNames.has(i.inputName)&&i.inputUuid!==this.director?.key&&!/^3Mix (?:Retorno|N1)/.test(i.inputName)).map(i=>i.inputUuid);
  this.returnRoutes=next;
  try{
   this.returns.configure({routes:this.returnRoutes,sources,program,conference:this.conference,experimentalContinuousVideo:this.experimentalContinuousVideo===true,videoScope:this.scope});
   await this.returns.start();
   if(this.returnRoutes.some(r=>!r.video||r.video==='program')){const video=await this.p.req('GetVirtualCamStatus');if(!video.outputActive)await this.p.req('StartVirtualCam');}
   const scene='3Mix Barramentos';if(!await this.p.optional('GetSceneItemList',{sceneName:scene}))await this.p.req('CreateScene',{sceneName:scene});
   for(const route of this.returnRoutes){
    const name='3Mix N1 '+route.key;
    const url=`http://127.0.0.1:${Number(process.env.FREEMIX_API_PORT||8088)}/call-publisher.html?key=${encodeURIComponent(route.key)}&token=${this.returns.token}${this.experimentalContinuousVideo===true?'&continuousVideo=experimental':''}`;
    const settings={url,width:320,height:180,shutdown:false,restart_when_active:false,reroute_audio:true};
    if(await this.p.optional('GetInputSettings',{inputName:name}))await this.p.req('SetInputSettings',{inputName:name,inputSettings:settings});
    else {const item=await this.p.req('CreateInput',{sceneName:scene,inputName:name,inputKind:'browser_source',inputSettings:settings,sceneItemEnabled:false});await this.p.req('SetSceneItemTransform',{sceneName:scene,sceneItemId:item.sceneItemId,sceneItemTransform:{positionX:-30000,positionY:-30000}});}
    await this.p.req('SetInputAudioTracks',{inputName:name,inputAudioTracks:tracks(false)});await this.p.req('SetInputMute',{inputName:name,inputMuted:true});
    const item=await this.p.req('GetSceneItemId',{sceneName:scene,sourceName:name});
    await this.p.req('SetSceneItemTransform',{sceneName:scene,sceneItemId:item.sceneItemId,sceneItemTransform:{positionX:-30000,positionY:-30000}});
    await this.p.req('SetSceneItemEnabled',{sceneName:scene,sceneItemId:item.sceneItemId,sceneItemEnabled:true});
   }
   await this.save();this.individual=true;
  }catch(e){
   this.individual=false;this.returnRoutes=previous;
   try{await this.returns.stop();}catch{const failure=new Error('Retorno não preparado; encerramento dos taps não confirmado',{cause:e});failure.code='CALL_RETURN_CLEANUP_UNCONFIRMED';throw failure;}
   throw e;
  }
 }
 async setScope(scope){if(this.scope===scope)return;await this.release();await this.returns.stop();this.individual=false;this.returnRoutes=[];this.experimentalContinuousVideo=false;this.rapidTargets=null;this.ice=null;this.scope=scope;this.file=join(this.p.root,'config/obs-studio/plugin_config/freemix-calls',createHash('sha256').update(scope).digest('hex').slice(0,24)+'.json');try{const saved=JSON.parse(await readFile(this.file,'utf8'));this.ice=saved.ice?validateCallIce(saved.ice):null;this.director=saved.director||null;this.returnRoutes=saved.returnRoutes||[];this.conference=saved.conference!==false;this.experimentalContinuousVideo=saved.experimentalContinuousVideo===true;this.rapidTargets=Array.isArray(saved.rapidTargets)?saved.rapidTargets:null;}catch(e){if(e.code!=='ENOENT')throw e;this.director=null;}const source=await this.source();if(source)await this.p.optional('CallVendorRequest',{vendorName:'freemix',requestType:'talkback',requestData:{action:'prepare',uuid:source.inputUuid}});await this.enforce();}
 async source(){if(!this.director)return null;const list=(await this.p.req('GetInputList')).inputs;return list.find(i=>i.inputUuid===this.director.key)||null;}
 serial(fn){const r=this.tail.then(fn);this.tail=r.catch(()=>{});return r;}
 async route(on){const s=await this.source();if(!s){this.lease=null;return;}await this.p.req('SetInputMute',{inputName:s.inputName,inputMuted:true});await this.p.req('SetInputAudioMonitorType',{inputName:s.inputName,monitorType:'OBS_MONITORING_TYPE_NONE'});await this.p.req('SetInputAudioTracks',{inputName:s.inputName,inputAudioTracks:tracks(on&&!this.individual)});if(on)await this.p.req('SetInputMute',{inputName:s.inputName,inputMuted:false});}
 async enforce({programNames=null,inputSnapshot=null}={}){if(this.individual){const names=programNames??this.p.state.inputs.find(i=>i.name===this.p.state.program)?.sources??[];this.returns.program=this.returns.sources.filter(i=>names.includes(i.inputName)&&i.inputUuid!==this.director?.key&&!/^3Mix (?:Retorno|N1)/.test(i.inputName)&&(!inputSnapshot||inputSnapshot.some(s=>s.inputUuid===i.inputUuid&&s.inputName===i.inputName))).map(i=>i.inputUuid);}const source=await this.source();if(!source)return;const r=await this.p.req('GetInputAudioTracks',{inputName:source.inputName}),mute=await this.p.req('GetInputMute',{inputName:source.inputName}),monitor=await this.p.req('GetInputAudioMonitorType',{inputName:source.inputName});const on=!!this.lease&&Date.now()<this.deadline;const expected=tracks(on&&!this.individual);if(Object.entries(expected).some(([k,v])=>r.inputAudioTracks[k]!==v)||mute.inputMuted===on||monitor.monitorType!=='OBS_MONITORING_TYPE_NONE')await this.serial(()=>this.route(on));}
 async release(){this.lease=null;this.deadline=0;this.returns.lease=null;this.returns.targets.clear();if(this.director)await this.p.optional('CallVendorRequest',{vendorName:'freemix',requestType:'talkback',requestData:{action:'stop'}});await this.serial(()=>this.route(false));}
 async summary(inputs){const people=this.p.dataSources?.people?.()||[];const ins=(await this.p.req('GetInputList')).inputs,guests=[];for(const i of ins.filter(i=>i.inputKind==='browser_source')){const settings=(await this.p.req('GetInputSettings',{inputName:i.inputName})).inputSettings;let url;try{url=new URL(settings.url);}catch{continue;}if(!['vdo.ninja','www.vdo.ninja'].includes(url.hostname)||!url.searchParams.get('view'))continue;const id=url.searchParams.get('view');if(!/^[A-Za-z0-9_]{1,100}$/.test(id))continue;const person=people.find(p=>p.callKey===i.inputUuid);const flist=(await this.p.optional('GetSourceFilterList',{sourceName:i.inputName}))?.filters||[];const processing=Object.fromEntries(Object.entries(CALL_AUDIO_SPECS).map(([k,spec])=>[k,flist.some(f=>f.filterName===spec.name&&f.filterEnabled===true)]));guests.push({key:i.inputUuid,name:i.inputName,...(person?{person:{sourceId:person.sourceId,name:person.name,updatedAt:person.updatedAt}}:{}),entries:inputs.filter(e=>e.sources.includes(i.inputName)).map(e=>e.key),id,processing,guest:'https://vdo.ninja/?push='+id+'&webcam&label=Convidado&view='+id+'_ret'});}
  for(const guest of guests){const route=this.returnRoutes.find(r=>r.key===guest.key);if(route){guest.returnStream=route.stream;guest.route={video:route.video||'program',audio:route.audio||'program',audioSources:route.audioSources||[],gain:route.gain??1};guest.guest='https://vdo.ninja/?push='+guest.id+'&webcam&label=Convidado&view='+route.stream;}}
  const ret=await this.p.optional('GetInputSettings',{inputName:'3Mix Retorno'}),filter=await this.p.optional('GetSourceFilter',{sourceName:'3Mix Bus B',filterName:'3Mix Retorno (áudio)'}),id=/[?&]push=([A-Za-z0-9_]+)_ret/.exec(ret?.inputSettings?.url||'')?.[1];
  const ready=!!id&&filter?.filterEnabled===true&&!!filter.filterSettings?.device&&/[?&]ad=CABLE_Output/.test(ret.inputSettings.url);
  const native=await this.p.optional('CallVendorRequest',{vendorName:'freemix',requestType:'talkback',requestData:{action:'state'}}),mic=await this.source();const returns=this.returns.status();for(const guest of guests){const r=returns.find(r=>r.key===guest.key);guest.connected=r?.peerConnectionVerified===true;guest.transport={state:guest.connected?'connected':'disconnected',evidence:'return-peer',rttMs:r?.diagnostics?.rttMs??null};}return {ice:callIceSummary(this.ice),guests,rapidTargets:this.rapidTargets??null,returnId:id||null,returnAudio:ready,nativeWatchdog:!!native?.responseData?.watchdog,director:mic?{key:mic.inputUuid,name:mic.inputName}:null,talking:!!native?.responseData?.talking,capability:this.individual?'individual-PCM-WebRTC':'shared-return-B',conference:this.conference,returns,peerConnectionVerified:returns.some(r=>r.peerConnectionVerified),experimentalContinuousVideo:this.experimentalContinuousVideo===true,videoReturnAvSyncProven:false,videoReturnLimit:this.experimentalContinuousVideo?'Entrada/composição: captura contínua experimental640×360; requer navegador compatível, até2fontes; sincronismo A/V ainda não homologado. Fallback JPEG até5fps. Programa: câmera virtual.':'Programa: câmera virtual; entrada/composição: JPEG local640×360 até5fps',audioChoices:ins.filter(i=>this.p.state.audioInputs.some(a=>a.name===i.inputName&&!a.bus)&&i.inputUuid!==mic?.inputUuid&&!/^3Mix (?:Retorno|N1)/.test(i.inputName)).map(i=>({key:i.inputUuid,name:i.inputName}))};
 }
 async applyAudioFilter(sourceName,key,enabled){
  const spec=CALL_AUDIO_SPECS[key];if(!spec)throw Error('Processamento de áudio inválido');
  if(typeof enabled!=='boolean')throw Error('Informe ligado ou desligado para o filtro de voz');
  const list=(await this.p.req('GetSourceFilterList',{sourceName}))?.filters||[];
  const existing=list.find(f=>f.filterName===spec.name);
  if(existing&&existing.filterKind!==spec.kind)throw Error('Nome de filtro já em uso por outro tipo');
  if(!existing){
   if(!enabled)return;
   await this.p.req('CreateSourceFilter',{sourceName,filterName:spec.name,filterKind:spec.kind,filterSettings:spec.settings});
  }
  await this.p.req('SetSourceFilterEnabled',{sourceName,filterName:spec.name,filterEnabled:enabled});
 }
 async execute(action,d){
  if(action==='call_audio_processing'){
   const guest=(await this.summary(this.p.state.inputs)).guests.find(g=>g.key===d.key);if(!guest)throw Error('Convidado inválido');
   const enabled=d.enabled!==false;
   if(d.preset==='podcast'){
    for(const k of ['gate','compressor','agc','limiter'])await this.applyAudioFilter(guest.name,k,enabled);
   }else{
    await this.applyAudioFilter(guest.name,d.filter,d.enabled);
   }
   const flist=(await this.p.optional('GetSourceFilterList',{sourceName:guest.name}))?.filters||[];
   return {key:guest.key,processing:Object.fromEntries(Object.entries(CALL_AUDIO_SPECS).map(([k,spec])=>[k,flist.some(f=>f.filterName===spec.name&&f.filterEnabled===true)]))};
  }
  if(action==='call_ice_import'||action==='call_ice_reset'){const next=action==='call_ice_import'?validateCallIce(d.document):null;await this.release();await this.returns.stop();this.individual=false;this.ice=next;await this.save();return {ice:callIceSummary(next),requiresPrepare:true};}

  if(action==='call_return_route'){await this.release();const guests=(await this.summary(this.p.state.inputs)).guests,all=(await this.p.req('GetInputList')).inputs;const next=validateReturnRoute(d,{guests,inputs:this.p.state.inputs,audio:all.filter(i=>this.p.state.audioInputs.some(a=>a.name===i.inputName&&!a.bus)),director:this.director?.key});const previous=this.returnRoutes.map(r=>({...r}));let route=this.returnRoutes.find(r=>r.key===d.key);if(!route){route={key:d.key,stream:'FMX'+randomUUID().replaceAll('-','')};this.returnRoutes.push(route);}Object.assign(route,next);try{await this.save();if(this.individual)await this.prepareReturns();}catch(e){this.returnRoutes=previous;await this.save();throw e;}return;}
  if(action==='call_video_experimental'){if(typeof d.enabled!=='boolean')throw Error('Escolha explicitamente ativar ou desativar o vídeo contínuo experimental');if(d.enabled){const cap=await this.p.vendor('call_video',{action:'state'},'freemix');if(!cap.available||cap.contract!=='rgba640x360-derived-fps-opaque-pts-v1'||cap.experimental!==true||cap.audioIncluded!==false)throw Error('O motor não oferece captura contínua experimental compatível');}await this.release();await this.returns.stop();this.individual=false;const previous=this.experimentalContinuousVideo;this.experimentalContinuousVideo=d.enabled;try{await this.save();}catch(error){this.experimentalContinuousVideo=previous;throw error;}return {experimentalContinuousVideo:this.experimentalContinuousVideo,requiresPrepare:true,avSyncProven:false};}
  if(action==='call_reconnect'){await this.release();const route=this.returnRoutes.find(r=>r.key===d.key);if(!route||!this.individual)throw Error('Prepare o retorno deste convidado');const client=this.returns.clients.get(d.key);client?.ws.close();if(this.experimentalContinuousVideo&&route.video&&route.video!=='program')this.returns.videoController?.retrySource(route.video);await this.prepareReturns();return;}
  if(action==='call_director_create'){await this.release();const name='3Mix Diretor Privado',all=(await this.p.req('GetInputList')).inputs;if(all.some(i=>i.inputName===name))throw Error('Já existe um microfone dedicado; selecione-o na lista');const scene='3Mix Barramentos';if(!await this.p.optional('GetSceneItemList',{sceneName:scene}))await this.p.req('CreateScene',{sceneName:scene});const created=await this.p.req('CreateInput',{sceneName:scene,inputName:name,inputKind:'wasapi_input_capture',inputSettings:{device_id:'default'},sceneItemEnabled:false});await this.p.req('SetInputMute',{inputName:name,inputMuted:true});await this.p.req('SetInputAudioTracks',{inputName:name,inputAudioTracks:tracks(false)});await this.p.req('SetInputAudioMonitorType',{inputName:name,monitorType:'OBS_MONITORING_TYPE_NONE'});await this.p.req('SetSceneItemEnabled',{sceneName:scene,sceneItemId:created.sceneItemId,sceneItemEnabled:true});return this.execute('call_director',{input:name});}
  if(action==='call_rapid_targets'){const guests=(await this.summary(this.p.state.inputs)).guests;const targets=d.targets===null?null:Array.isArray(d.targets)?[...new Set(d.targets)]:undefined;if(targets===undefined||targets?.some(key=>!guests.some(g=>g.key===key)))throw Error('Selecione convidados válidos para o Talkback da mesa');await this.release();const previous=this.rapidTargets;this.rapidTargets=targets;try{await this.save();}catch(e){this.rapidTargets=previous;throw e;}return;}
  // "Host a call": a new mesa entry with the guest's video and audio, the same shape Add Input creates.
  if(action==='call_create'){await this.release();const guests=(await this.summary(this.p.state.inputs)).guests;if(guests.length>=8)throw Error('Esta configuração aceita até 8 convidados');
   const taken=new Set([...(await this.p.req('GetSceneList')).scenes.map(s=>s.sceneName),...(await this.p.req('GetInputList')).inputs.map(i=>i.inputName)]);
   let name=String(d.name??'').trim();if(name.length>60||/[\u0000-\u001f]/.test(name))throw Error('Nome da chamada inválido');
   if(!name){let n=guests.length+1;while(taken.has('Chamada '+n)||taken.has('Chamada '+n+' (fonte)'))n++;name='Chamada '+n;}
   const source=name+' (fonte)';if(taken.has(name)||taken.has(source))throw Error('Já existe uma entrada com este nome');
   const id=newCallId(),width=this.p.state.video?.baseWidth||1920,height=this.p.state.video?.baseHeight||1080;
   await this.p.req('CreateScene',{sceneName:name});
   try{const item=await this.p.req('CreateInput',{sceneName:name,inputName:source,inputKind:'browser_source',inputSettings:{url:'https://vdo.ninja/?view='+id+'&cleanoutput',width,height,reroute_audio:true,shutdown:false,restart_when_active:false}});
    await this.p.optional('SetSceneItemTransform',{sceneName:name,sceneItemId:item.sceneItemId,sceneItemTransform:{positionX:0,positionY:0,boundsType:'OBS_BOUNDS_SCALE_INNER',boundsWidth:width,boundsHeight:height,boundsAlignment:0}});
   }catch(e){await this.p.optional('RemoveScene',{sceneName:name});throw e;}
   // The link is final from the start: the return address is reserved now, not at the first "prepare".
   const created=(await this.p.req('GetInputList')).inputs.find(i=>i.inputName===source);
   if(created&&!this.returnRoutes.some(r=>r.key===created.inputUuid)){this.returnRoutes.push({key:created.inputUuid,stream:'FMX'+randomUUID().replaceAll('-','')});await this.save();if(this.individual)await this.prepareReturns();}
   return {created:name,source,id};}
  // The guest link of a call made before its return address existed: reserve the address, then the link never changes.
  if(action==='call_link'){const guest=(await this.summary(this.p.state.inputs)).guests.find(g=>g.key===d.key);if(!guest)throw Error('Convidado inválido');
   let route=this.returnRoutes.find(r=>r.key===d.key);if(!route){route={key:d.key,stream:'FMX'+randomUUID().replaceAll('-','')};this.returnRoutes.push(route);await this.save();}
   return {guest:'https://vdo.ninja/?push='+guest.id+'&webcam&label=Convidado&view='+route.stream};}
  // "Reset password": the old guest link stops working, for the guest's camera and for the return they receive.
  if(action==='call_reset_password'){await this.release();const guest=(await this.summary(this.p.state.inputs)).guests.find(g=>g.key===d.key);if(!guest)throw Error('Convidado inválido');
   const settings=(await this.p.req('GetInputSettings',{inputName:guest.name})).inputSettings,id=newCallId(),url=String(settings.url).replace(/([?&]view=)[A-Za-z0-9_]+/,'$1'+id);
   if(url===settings.url||!url.includes('view='+id))throw Error('Endereço da chamada não reconhecido');
   await this.p.req('SetInputSettings',{inputName:guest.name,inputSettings:{url}});
   const route=this.returnRoutes.find(r=>r.key===d.key);if(route){route.stream='FMX'+randomUUID().replaceAll('-','');await this.save();if(this.individual)await this.prepareReturns();}
   return {id};}
  if(action==='call_returns_prepare'){await this.release();await this.prepareReturns();return;}
  if(action==='call_returns_stop'){await this.release();await this.returns.stop();this.individual=false;return;}
  if(action==='call_conference'){await this.release();this.conference=d.enabled===true;this.returns.conference=this.conference;await this.save();return;}
  if(action==='call_director'){await this.release();const input=(await this.p.req('GetInputList')).inputs.find(i=>i.inputUuid===d.input||i.inputName===d.input);if(!input||!['wasapi_input_capture','ffmpeg_source'].includes(input.inputKind))throw Error('Selecione uma fonte de microfone dedicada');if(!await this.p.optional('GetInputVolume',{inputName:input.inputName}))throw Error('Fonte sem áudio');for(const entry of this.p.state.inputs.filter(e=>e.sources.includes(input.inputName)))for(const filter of ['3Mix Replay Rec','Gravação ISO']){const f=await this.p.optional('GetSourceFilter',{sourceName:entry.name,filterName:filter});if(f?.filterEnabled&&f.filterSettings.record_mode===1)throw Error('Pare ISO/replay das entradas que contêm este mic antes de prepará-lo');}await this.p.vendor('talkback',{action:'prepare',uuid:input.inputUuid},'freemix');this.director={key:input.inputUuid};await this.route(false);await this.save();if(this.individual)await this.prepareReturns();return;}
  if(action==='call_talk_stop'){if(d.lease&&d.lease!==this.lease)return;await this.release();return;}
  if(action==='call_talk_ping'){if(!this.lease||d.lease!==this.lease||Date.now()>this.deadline){await this.release();throw Error('Talkback fechado; pressione novamente');}await this.p.vendor('talkback',{action:'ping',lease:this.lease},'freemix');this.deadline=Date.now()+1500;return;}
  if(action==='call_talk_start'){if(this.lease)throw Error('Talkback já está pressionado');if(!this.director)throw Error('Prepare primeiro o mic privado do diretor');const state=await this.summary(this.p.state.inputs);if(this.individual){
   const targets=Array.isArray(d.targets)?[...new Set(d.targets)]:[];
   if(!targets.length||targets.some(key=>!state.guests.some(g=>g.key===key)||!this.returnRoutes.some(r=>r.key===key)))throw Error('Selecione os convidados que devem ouvir o diretor');
   if(targets.some(key=>this.returns.clients.get(key)?.status!=='publishing'))throw Error('Aguarde o publicador de retorno dos convidados selecionados');
   this.returns.targets=new Set(targets);
  }else if(Array.isArray(d.targets))throw Error('Retorno B é compartilhado e não garante destinos individuais. Prepare os retornos individuais em Calls.');else if(!this.p.state.buses||!state.returnAudio)throw Error('Ative primeiro um retorno B com cabo de áudio virtual na mesa');
  if(!state.nativeWatchdog)throw Error('Este executável não tem o fechamento automático de talkback');if(this.lease)throw Error('Talkback já está pressionado');const lease=randomUUID();this.lease=lease;this.returns.lease=lease;this.deadline=Date.now()+1500;try{await this.p.vendor('talkback',{action:'start',uuid:this.director.key,lease,isolated:this.individual},'freemix');}catch(e){await this.release();throw e;}return {lease};}
  throw Error('Comando de Call inválido');
 }
}
