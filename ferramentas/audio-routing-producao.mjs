import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import{AudioBusesEngine,BUS_KIND}from'./audio-buses-producao.mjs';

export const AUDIO_FILTERS={
 gain:{kind:'gain_filter',name:'FreeMix Audio - Gain',defaults:{db:0},ranges:{db:[-30,30]}},
 eq:{kind:'basic_eq_filter',name:'FreeMix Audio - EQ 3 bandas',defaults:{low:0,mid:0,high:0},ranges:{low:[-20,20],mid:[-20,20],high:[-20,20]}},
 gate:{kind:'noise_gate_filter',name:'FreeMix Audio - Gate',defaults:{open_threshold:-26,close_threshold:-32,attack_time:25,hold_time:200,release_time:150},ranges:{open_threshold:[-60,0],close_threshold:[-60,0],attack_time:[0,10000,true],hold_time:[0,10000,true],release_time:[0,10000,true]}},
 compressor:{kind:'compressor_filter',name:'FreeMix Audio - Compressor',defaults:{ratio:4,threshold:-18,attack_time:6,release_time:60,output_gain:0},ranges:{ratio:[1,32],threshold:[-60,0],attack_time:[1,100,true],release_time:[1,1000,true],output_gain:[-30,30]}},
 limiter:{kind:'limiter_filter',name:'FreeMix Audio - Limiter',defaults:{threshold:-6,release_time:60},ranges:{threshold:[-60,0],release_time:[1,1000,true]}},
 rnnoise:{kind:'noise_suppress_filter',name:'FreeMix Audio - RNNoise (IA)',defaults:{suppress_method:'rnnoise'},ranges:{}},
 nvidia:{kind:'nvidia_audiofx_filter',name:'FreeMix Audio - NVIDIA Denoise',defaults:{intensity:0.5,method:'denoiser'},ranges:{intensity:[0,1]}},
 expander:{kind:'expander_filter',name:'FreeMix Audio - Expander',defaults:{ratio:2,threshold:-40,attack_time:10,release_time:50,output_gain:0},ranges:{ratio:[1,32],threshold:[-60,0],attack_time:[1,100,true],release_time:[1,1000,true],output_gain:[-30,30]}}
};
export function filterSettings(type,value={},previous={}){
 const spec=AUDIO_FILTERS[type];if(!spec||!value||typeof value!=='object'||Array.isArray(value))throw Error('Filtro ou parâmetros inválidos');
 if(Object.keys(value).some(key=>!Object.hasOwn(spec.ranges,key)))throw Error('Parâmetro de filtro não suportado');
 const result={...spec.defaults};for(const key of Object.keys(result))if(previous[key]!==undefined)result[key]=previous[key];Object.assign(result,value);
 for(const [key,[min,max,integer]]of Object.entries(spec.ranges)){const n=Number(result[key]);if(!Number.isFinite(n)||n<min||n>max||integer&&!Number.isInteger(n))throw Error(`${key}: valor fora do intervalo ${min} a ${max}`);result[key]=n;}
 if(type==='gate'&&result.close_threshold>result.open_threshold)throw Error('Gate: fechar deve estar abaixo de abrir');
 if(type==='compressor')result.sidechain_source='none';return result;
}

export class AudioRoutingEngine{
 constructor(p){this.p=p;this.busEngine=new AudioBusesEngine(p);this.scope=null;this.config={version:1,sources:{}};this.rows=[];this.context={};this.applied=new Map();this.details=null;this.kinds=null;this.error=null;this.last=null;this.tail=Promise.resolve();}
 queue(fn){const task=this.tail.then(fn);this.tail=task.catch(()=>{});return task;}
 async load(scope){
  if(!scope||String(scope).length>200)throw Error('Produção de áudio não identificada');if(scope===this.scope)return;
  this.scope=scope;this.applied.clear();this.details=null;this.config={version:1,sources:{}};
  this.file=join(this.p.root,'config/obs-studio/plugin_config/freemix-audio-routing',createHash('sha256').update(String(scope)).digest('hex').slice(0,24)+'.json');
  try{const d=JSON.parse(await readFile(this.file,'utf8'));if(d.version!==1||!d.sources||typeof d.sources!=='object'||Array.isArray(d.sources))throw Error('Configuração de áudio inválida');this.config=d;}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 async save(){await mkdir(join(this.file,'..'),{recursive:true});await writeFile(this.file+'.tmp',JSON.stringify(this.config,null,2));await rename(this.file+'.tmp',this.file);}
 refresh(context){return this.queue(()=>this.observe(context));}
 async observe(context){
  this.context=context;await this.busEngine.refresh(context);if(context.connected===false){this.applied.clear();this.kinds=null;this.rows=[];return this.summary();}
  await this.load(context.scope||this.p.scope||this.p.state?.preset);const sources=context.sourceInputs||[],audio=context.audioInputs||[],onAir=new Set(context.tally?.program||[]),director=context.director;
  const isUuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s||'')) || /^[0-9a-f-]{30,}$/i.test(String(s||''));
  const isInternalBus = s => /^(?:FreeMix|3Mix) (?:Master|Bus|Retorno|N1|Barramentos)(?:\s|$)/i.test(String(s||''));
  this.rows=audio.map(a=>{
    const source=sources.find(s=>s.name===a.name||s.key===a.key),key=source?.key||a.key;
    // As keys são UUIDs por definição. Marcar todo key UUID como interno
    // esvaziava o mixer; só o nome gerado pelo motor identifica um canal oculto.
    const isSysInternal = isUuid(a.name) || isInternalBus(a.name) || a.kind==='mix-track-to-source' || (source?.name && isInternalBus(source.name));
    return {
      ...a,key,kind:source?.kind||a.kind,
      protected:!key||source?.kind===BUS_KIND||!!a.bus||a.kind==='mix-track-to-source'||key===director?.key||a.name===director?.name||isSysInternal,
      internal:!!isSysInternal,
      onAir:onAir.has(a.name)
    };
  });
  this.error=null;let changed=false;
  for(const row of this.rows){const entry=this.config.sources[row.key];if(!entry?.afv)continue;
   if(row.protected){entry.afv=false;entry.override='Fonte privada ou barramento';this.applied.delete(row.key);changed=true;continue;}
   const last=this.applied.get(row.key);if(last!==undefined&&row.muted!==last){entry.afv=false;entry.override='Mute alterado manualmente';this.applied.delete(row.key);changed=true;continue;}
   const muted=!row.onAir;
   if(row.muted!==muted){try{await this.p.req('SetInputMute',{inputUuid:row.key,inputMuted:muted});row.muted=muted;}catch(e){this.error=`AFV ${row.name}: ${e.message}`;continue;}}
   this.applied.set(row.key,muted);
  }
  this.snapshotAudio();if(changed)await this.save();return this.summary();
 }
 snapshotAudio(){this.context={...this.context,audioInputs:(this.context.audioInputs||[]).map(a=>({...a,muted:this.rows.find(r=>r.name===a.name)?.muted??a.muted}))};}
 source(key){const row=this.rows.find(r=>r.key===key);if(!row)throw Error('Fonte de áudio removida ou indisponível');if(row.protected)throw Error('Mic privado, retorno e barramentos não participam deste controle');return row;}
 manualOverride(keys){return this.queue(()=>this.override(keys));}
 async override(keys){let changed=false;for(const key of keys){const row=this.rows.find(r=>r.key===key||r.name===key);if(!row)continue;const entry=this.config.sources[row.key];if(entry?.afv){entry.afv=false;entry.override='Controle manual';this.applied.delete(row.key);changed=true;}}if(changed)await this.save();return this.summary();}
 async inspect(key){const row=this.source(key);if(!this.kinds)this.kinds=new Set((await this.p.req('GetSourceFilterKindList')).sourceFilterKinds);const [offset,list]=await Promise.all([this.p.req('GetInputAudioSyncOffset',{inputUuid:key}),this.p.req('GetSourceFilterList',{sourceUuid:key})]);
  const filters={};for(const [type,spec]of Object.entries(AUDIO_FILTERS)){const filter=list.filters.find(f=>f.filterName===spec.name);filters[type]={supported:this.kinds.has(spec.kind),exists:!!filter,enabled:filter?.filterEnabled??false,settings:filter?filterSettings(type,{},filter.filterSettings):{...spec.defaults}};}
  this.details={key,name:row.name,delayMs:offset.inputAudioSyncOffset,filters,filterOrder:list.filters.map(f=>f.filterName)};return this.details;
 }
 read(key){return this.queue(async()=>{if(key)await this.inspect(key);return this.summary();});}
 execute(action,d={}){return this.queue(()=>this.command(action,d));}
 async command(action,d){
  if(!this.scope)throw Error('Aguarde a conexão e identificação da produção');
  if(action.startsWith('audio_routing_bus_')||action.startsWith('audio_routing_asio_output_')||['audio_routing_direct','audio_routing_asio_create','audio_routing_devices'].includes(action)){await this.busEngine.command(action,d);this.last=this.summary();return;}
  if(action==='audio_routing_get'){if(d.key)await this.inspect(d.key);this.last=this.summary();return;}
  const row=this.source(d.key),entry=this.config.sources[row.key]||{};
  if(action==='audio_routing_afv'){
   if(typeof d.enabled!=='boolean')throw Error('AFV deve ser ligado ou desligado');entry.afv=d.enabled;entry.override=null;this.config.sources[row.key]=entry;this.applied.delete(row.key);await this.save();await this.observe(this.context);
  }else if(action==='audio_routing_manual'){
   if(typeof d.muted!=='boolean')throw Error('Mute manual deve ser ligado ou desligado');await this.override([row.key]);await this.p.req('SetInputMute',{inputUuid:row.key,inputMuted:d.muted});row.muted=d.muted;this.snapshotAudio();
  }else if(action==='audio_routing_delay'){
   const delay=Number(d.delayMs);if(!Number.isInteger(delay)||delay< -950||delay>20000)throw Error('Atraso: -950 a 20000 ms');await this.p.req('SetInputAudioSyncOffset',{inputUuid:row.key,inputAudioSyncOffset:delay});const result=await this.p.req('GetInputAudioSyncOffset',{inputUuid:row.key});if(result.inputAudioSyncOffset!==delay)throw Error('Motor não confirmou o atraso');entry.delayMs=delay;this.config.sources[row.key]=entry;await this.save();await this.inspect(row.key);
  }else if(action==='audio_routing_filter'){
   const spec=AUDIO_FILTERS[d.type];if(!spec)throw Error('Filtro indisponível');if(d.enabled!==undefined&&typeof d.enabled!=='boolean')throw Error('Estado do filtro inválido');if(d.remove!==undefined&&typeof d.remove!=='boolean')throw Error('Remoção de filtro inválida');
   if(!this.kinds)this.kinds=new Set((await this.p.req('GetSourceFilterKindList')).sourceFilterKinds);if(!this.kinds.has(spec.kind))throw Error('Este motor não oferece o filtro solicitado');
   const list=await this.p.req('GetSourceFilterList',{sourceUuid:row.key}),existing=list.filters.find(f=>f.filterName===spec.name);if(existing&&existing.filterKind!==spec.kind)throw Error('Nome reservado já pertence a outro filtro');
   if(d.remove){if(existing)await this.p.req('RemoveSourceFilter',{sourceUuid:row.key,filterName:spec.name});}
   else{const settings=filterSettings(d.type,d.settings||{},existing?.filterSettings);if(existing){if(d.settings!==undefined)await this.p.req('SetSourceFilterSettings',{sourceUuid:row.key,filterName:spec.name,filterSettings:settings,overlay:true});}else await this.p.req('CreateSourceFilter',{sourceUuid:row.key,filterName:spec.name,filterKind:spec.kind,filterSettings:settings});await this.p.req('SetSourceFilterEnabled',{sourceUuid:row.key,filterName:spec.name,filterEnabled:d.enabled??true});}
   await this.inspect(row.key);
  }else if(action==='audio_routing_open_filters'){
   await this.p.req('OpenInputFiltersDialog',{inputName:row.name});
  }else throw Error('Comando de áudio não reconhecido');
  this.last=this.summary();
 }
 summary(){
  const getCat = (kind) => {
    if (['wasapi_input_capture','coreaudio_input_capture','pulse_input_capture','alsa_input_capture','asio_input_capture'].includes(kind)) return 'mic';
    if (['ffmpeg_source','vlc_source','media_source'].includes(kind)) return 'media';
    if (['browser_source','webrtc_source','call_source'].includes(kind)) return 'web';
    if (['dshow_input','ndi_source','omt_source','decklink-input'].includes(kind)) return 'camera';
    return 'other';
  };
  return {
    scope:this.scope,
    error:this.error,
    details:this.details,
    routing:this.busEngine.summary(),
    sources:this.rows.map(r=>({
      key:r.key,
      name:r.name,
      kind:r.kind,
      category:getCat(r.kind),
      protected:r.protected,
      internal:!!r.internal,
      onAir:r.onAir,
      muted:r.muted,
      afv:this.config.sources[r.key]?.afv===true,
      override:this.config.sources[r.key]?.override||null,
      delayMs:this.details?.key===r.key?this.details.delayMs:this.config.sources[r.key]?.delayMs??null
    })),
    limitations:['AFV usa o tally visível do Programa e overlays','Mute manual desliga AFV da fonte','Filtros e barramentos adicionais dependem das capabilities reais do motor']
  };
 }
}
