import {PreferencesEngine,preferenceCategories} from './preferencias-producao.mjs';
import {simpleEncoderChoices,streamProtocol,validateEncoder,validateStreamTarget,recordingFormats,normalizeProtocols} from './capacidades-motor.mjs';
// Local settings: native readback, validation before mutation and rollback on failure.
export const supportedSettingsCategories=['display','recording','streaming'];
const fields={display:['baseWidth','baseHeight','outputWidth','outputHeight','fps','reflow'],recording:['directory','format','quality','encoder'],streaming:['protocol','server','bitrate','audioBitrate','encoder','key','enhancedRtmp']};
export function validateSettings(category,data,before){
 if(!supportedSettingsCategories.includes(category)||!data||typeof data!=='object'||Array.isArray(data))throw Error('Categoria de configuração não suportada');
 for(const name of Object.keys(data))if(!fields[category].includes(name))throw Error('Campo não suportado: '+name);
 const d={...data};if(category!=='display'&&before.mode==='Advanced')throw Error('Este perfil usa saída avançada; ajuste-o no editor completo do OBS');
 if(category==='display'){for(const k of fields.display.slice(0,4)){const n=Number(d[k]);if(!Number.isInteger(n)||n<240||n>7680||n%2)throw Error('Dimensões: números pares entre 240 e 7680');d[k]=n;}const value=String(d.fps),parts=value.split('/').map(Number);if(parts.length>2||parts.some(n=>!Number.isInteger(n)||n<1)||parts[0]>240*(parts[1]||1)||parts[0]<(parts[1]||1)||parts[0]>24000000||(parts[1]||1)>100000)throw Error('Taxa de quadros inválida');d.fps=parts.length===2?parts.join('/'):parts[0];if(d.reflow!==undefined&&typeof d.reflow!=='boolean')throw Error('Reenquadramento inválido');}
 if(category==='recording'){if(typeof d.directory!=='string'||!d.directory.trim()||d.directory.length>500||/[\x00-\x1f]/.test(d.directory)||!recordingFormats.includes(d.format)||!['Small','HQ','Lossless','Stream'].includes(d.quality))throw Error('Configuração de gravação inválida');validateEncoder(before,d.encoder,category);d.directory=d.directory.trim();}
 if(category==='streaming'){
  d.protocol=d.protocol||before.protocol||'rtmp';validateStreamTarget(d.protocol,d.server);
  if(!['string','number'].includes(typeof d.bitrate)||!Number.isInteger(+d.bitrate)||+d.bitrate<200||+d.bitrate>100000||!['128','160','192','256','320'].includes(String(d.audioBitrate))||d.key!==undefined&&(typeof d.key!=='string'||d.key.length>2000||/[\x00-\x1f]/.test(d.key))||d.enhancedRtmp!==undefined&&typeof d.enhancedRtmp!=='boolean')throw Error('Configuração de transmissão inválida');
  const encoder=validateEncoder(before,d.encoder,category,d.protocol);
  if(['rtmp','rtmps'].includes(d.protocol)&&encoder.codec!=='h264'&&d.enhancedRtmp!==true&&!(before.protocol===d.protocol&&before.values?.StreamEncoder===d.encoder))throw Error('Para AV1/HEVC em RTMP, confirme que o servidor aceita Enhanced RTMP');
  d.bitrate=Number(d.bitrate);d.audioBitrate=String(d.audioBitrate);
 }
 return d;
}
export function settingsDefaults(category,before){if(!supportedSettingsCategories.includes(category))throw Error('Padrões disponíveis somente para Vídeo, Gravação e Transmissão');if(category!=='display'&&before.mode==='Advanced')throw Error('Use os padrões no editor completo do OBS para este perfil avançado');return category==='display'?{baseWidth:1920,baseHeight:1080,outputWidth:1920,outputHeight:1080,fps:30,reflow:true}:category==='recording'?{directory:before.recordDirectory,format:'mkv',quality:'HQ',encoder:'x264'}:{server:before.server,bitrate:2500,audioBitrate:'160',encoder:'x264'};}
export function exportSettings(category,before){const v=before.video,s=before.values,draft=category==='display'?{baseWidth:v.baseWidth,baseHeight:v.baseHeight,outputWidth:v.outputWidth,outputHeight:v.outputHeight,fps:v.fpsNumerator+'/'+v.fpsDenominator,reflow:false}:category==='recording'?{directory:before.recordDirectory,format:s.RecFormat2||'mkv',quality:s.RecQuality||'Small',encoder:s.RecEncoder||'x264'}:{server:before.server,bitrate:Number(s.VBitrate||2500),audioBitrate:s.ABitrate||'160',encoder:s.StreamEncoder||'x264'};const values=validateSettings(category,draft,before);if(category==='streaming')delete values.server;return {format:'FreeMix Settings',schema:1,category,values,note:'Somente esta categoria suportada. Servidor, chave, senha e tokens de transmissão não são exportados.'};}
export function importSettings(document,before){if(!document||document.format!=='FreeMix Settings'||document.schema!==1||!supportedSettingsCategories.includes(document.category)||!document.values||typeof document.values!=='object'||Array.isArray(document.values)||Object.keys(document).some(k=>!['format','schema','category','values','note'].includes(k)))throw Error('Arquivo de configuração 3Mix inválido');if(Object.keys(document.values).some(k=>['key','server','password','token','secret'].includes(k)))throw Error('Credenciais e servidor não são aceitos na importação');const draft={...document.values,...(document.category==='streaming'?{server:before.server}: {})};return {category:document.category,draft:validateSettings(document.category,draft,before)};}
export class SettingsEngine {
 constructor(p){this.p=p;this.preferences=new PreferencesEngine(p);}
 async read(){const p=this.p,P=async(c,n)=>(await p.req('GetProfileParameter',{parameterCategory:c,parameterName:n})).parameterValue;
  const [video,dir,service,mode,stats,virtual]=await Promise.all([p.req('GetVideoSettings'),p.req('GetRecordDirectory'),p.req('GetStreamServiceSettings'),P('Output','Mode'),p.req('GetStats'),p.req('GetVirtualCamStatus')]);
  const cat=mode==='Advanced'?'AdvOut':'SimpleOutput',values={};for(const n of ['RecFormat2','RecQuality','RecEncoder','StreamEncoder','VBitrate','ABitrate'])values[n]=await P(cat,n);
  const [nativePreferences,native]=await Promise.all([this.preferences.read().catch(e=>({error:e.message,fields:[]})),p.vendor('get_destinations',{},'freemix').catch(e=>({error:e.message,encoders:[],protocols:[]}))]);
  const server=service.streamServiceSettings.server||'',protocol=streamProtocol(service,server);
  return {nativePreferences,capabilities:{simpleEncoders:simpleEncoderChoices(native),protocols:normalizeProtocols(native),recordingFormats,error:native.error||null},protocol,serviceType:service.streamServiceType,serviceName:service.streamServiceSettings.service||'',video,recordDirectory:dir.recordDirectory,server,hasKey:!!service.streamServiceSettings.key,mode:mode||'Simple',values,stats,virtualCamera:virtual.outputActive};
 }
 async execute(action,d={}){const p=this.p;
   if(['settings_encoder_read','settings_encoder_preview','settings_encoder_apply'].includes(action)){if(!['stream','record'].includes(d.target))throw Error('Destino do encoder inválido');if(action!=='settings_encoder_read'&&(typeof d.encoder!=='string'||typeof d.revision!=='string'||!/^([a-f0-9]{64})$/.test(d.revision)||!d.values||typeof d.values!=='object'||Array.isArray(d.values)||JSON.stringify(d.values).length>32768))throw Error('Parâmetros de encoder inválidos');this.last=await p.vendor('control',{action:action.replace('settings_',''),target:d.target,encoder:d.encoder,revision:d.revision,values:d.values},'freemix-preferences');return;}
   if(action==='settings_plugin_tools'){this.last=await p.vendor('control',{action:'plugin_tools'},'freemix-preferences');return;}
   if(action==='settings_plugin_open'){if(!Number.isInteger(d.id)||d.id<0||d.id>1000||typeof d.label!=='string'||!d.label||d.label.length>300)throw Error('Ferramenta de plugin inválida');this.last=await p.vendor('control',{action:'plugin_tool_open',id:d.id,label:d.label},'freemix-preferences');return;}
  if(action==='settings_pick_image'){this.last=await p.vendor('control',{action:'pick_image_start'},'freemix-preferences');return;}
  if(action==='settings_pick_image_status'){if(typeof d.id!=='string'||!/^[-a-f0-9]{36}$/i.test(d.id))throw Error('Seletor de imagem inválido');this.last=await p.vendor('control',{action:'pick_image_read',id:d.id},'freemix-preferences');return;}
  const preferenceCategory=d.category||d.document?.category;if(['settings_defaults','settings_export','settings_import','settings_apply'].includes(action)&&preferenceCategories.includes(preferenceCategory)){this.last=await this.preferences.execute(action,{...d,category:preferenceCategory});if(action==='settings_apply')this.last={...(await this.read()),requiresRestart:true};return;}
  if(action==='settings_get'){this.last=await this.read();return;}
  if(action==='settings_defaults'){this.last={category:d.category,draft:settingsDefaults(d.category,await this.read())};return;}
  if(action==='settings_export'){this.last={document:exportSettings(d.category,await this.read())};return;}
  if(action==='settings_import'){this.last=importSettings(d.document,await this.read());return;}
  if(action==='settings_native'){const response=await p.req('CallVendorRequest',{vendorName:'freemix',requestType:'open_settings',requestData:{}});if(!response.responseData?.success)throw Error('O motor não confirmou a abertura das configurações completas');return;}
  if(action==='settings_projector'){if(!['PROGRAM','PREVIEW','MULTIVIEW'].includes(d.mix))throw Error('Saída inválida');await p.req('OpenVideoMixProjector',{videoMixType:'OBS_WEBSOCKET_VIDEO_MIX_TYPE_'+d.mix,monitorIndex:-1});return;}
  if(action==='settings_source_projector'){await p.req('OpenSourceProjector',{sourceName:p.scene(d.input).name,monitorIndex:-1});return;}
  if(action==='settings_virtual'){await p.req((d.active?'Start':'Stop')+'VirtualCam');return;}
  if(action==='settings_stream_key'){
    const key=String(d.key||'');
    if(!key||key.length>2000||/[\x00-\x1f]/.test(key))throw Error('Chave de transmissão inválida');
    const service=await p.req('GetStreamServiceSettings');
    const streamServiceSettings={...service.streamServiceSettings,key};
    await p.req('SetStreamServiceSettings',{streamServiceType:service.streamServiceType,streamServiceSettings});
    const actual=await p.req('GetStreamServiceSettings');
    if((actual.streamServiceSettings.key||'')!==key)throw Error('Motor não confirmou a chave');
    this.last={...(await this.read()),keyOnly:true,requiresRestart:false};
    return;
  }
  if(action!=='settings_apply')throw Error('Configuração inválida');
  if(p.macroEngine.controller||p.callEngine.lease||p.state.recording||p.state.streaming||(await p.req('GetVirtualCamStatus')).outputActive||(await p.req('GetOutputList')).outputs.some(o=>o.outputActive))throw Error('Pare gravação, transmissões, saídas de rede e câmera virtual antes de aplicar configurações');
  const before=await this.read(),undo=[];
  const param=async(c,n,v)=>{const old=(await p.req('GetProfileParameter',{parameterCategory:c,parameterName:n})).parameterValue;undo.push(()=>p.req('SetProfileParameter',{parameterCategory:c,parameterName:n,parameterValue:old??''}));await p.req('SetProfileParameter',{parameterCategory:c,parameterName:n,parameterValue:String(v)});const actual=(await p.req('GetProfileParameter',{parameterCategory:c,parameterName:n})).parameterValue;if(String(actual)!==String(v))throw Error('Motor não confirmou '+n);};
  const category=d.category,values=Object.fromEntries(Object.entries(d).filter(([k])=>!['action','category'].includes(k)));d={category,...validateSettings(category,values,before)};let video;
  if(category==='display'){const [fpsNumerator,fpsDenominator=1]=String(d.fps).split('/').map(Number);video={...Object.fromEntries(['baseWidth','baseHeight','outputWidth','outputHeight'].map(k=>[k,d[k]])),fpsNumerator,fpsDenominator};}
  try {
    if(video){undo.push(()=>p.req('SetVideoSettings',before.video));await p.req('SetVideoSettings',video);const actual=await p.req('GetVideoSettings');for(const [k,v] of Object.entries(video))if(actual[k]!==v)throw Error('Motor não confirmou vídeo');if(d.reflow===true||d.reflow==='true')undo.push(await p.inputEngine.reflow());}
   if(d.category==='recording'){undo.push(()=>p.req('SetRecordDirectory',{recordDirectory:before.recordDirectory}));await p.req('SetRecordDirectory',{recordDirectory:d.directory.trim()});if((await p.req('GetRecordDirectory')).recordDirectory!==d.directory.trim())throw Error('Motor não confirmou pasta');await param('SimpleOutput','RecFormat2',d.format);await param('SimpleOutput','RecQuality',d.quality);await param('SimpleOutput','RecEncoder',d.encoder);}
   if(d.category==='streaming'){const service=await p.req('GetStreamServiceSettings');undo.push(()=>p.req('SetStreamServiceSettings',service));const same=before.protocol===d.protocol&&service.streamServiceType!=='freemix_hls';const streamServiceType=same?service.streamServiceType:d.protocol==='hls'?'freemix_hls':'rtmp_custom';const streamServiceSettings={...(same?service.streamServiceSettings:{}),server:d.server,key:d.key===undefined?service.streamServiceSettings.key||'':d.key};await p.req('SetStreamServiceSettings',{streamServiceType,streamServiceSettings});const actual=await p.req('GetStreamServiceSettings');if(actual.streamServiceSettings.server!==d.server||streamProtocol(actual,d.server)!==d.protocol)throw Error('Motor não confirmou servidor/protocolo');await param('SimpleOutput','VBitrate',+d.bitrate);await param('SimpleOutput','ABitrate',d.audioBitrate);await param('SimpleOutput','StreamEncoder',d.encoder);await param('SimpleOutput','StreamAudioEncoder','aac');}
    if(['recording','streaming'].includes(category))await p.vendor('control',{action:'reset_outputs'},'freemix-preferences');
    this.last=await this.read();
   }catch(e){const failures=[];for(const restore of undo.reverse())try{await restore();}catch(r){failures.push(r.message);}if(['recording','streaming'].includes(category))try{await p.vendor('control',{action:'reset_outputs'},'freemix-preferences');}catch(r){failures.push(r.message);}throw Error(e.message+(failures.length?' — restauração incompleta: '+failures.join('; '):' — alterações revertidas'));}
 }
}
