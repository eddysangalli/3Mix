import{isIP}from'node:net';
export const PTZ_KIND='face_tracker_ptz',PTZ_NAME='FreeMix PTZ Tracking';
export function ptzSettings(raw={}){
 const address=String(raw.address||'').trim(),port=Number(raw.port??1259),parts=address.split('.').map(Number);
 if(isIP(address)!==4||!(parts[0]===10||parts[0]===127||parts[0]===192&&parts[1]===168||parts[0]===172&&parts[1]>=16&&parts[1]<=31))throw Error('Use o IPv4 local da câmera VISCA TCP');
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('Porta VISCA inválida');
 const result={'ptz-type':'visca-over-tcp','ptz.visca-over-tcp.address':address,'ptz.visca-over-tcp.port':port,face_lost_ptz_preset:-1,face_lost_zoomout_timeout:0,debug_faces:false,landmark_detection:false};
 const bounds={scale:[1,8,2],track_z:[.1,1,.25],track_x:[-.5,.5,0],track_y:[-.5,.5,0],Kp_x_db:[0,60,40],Kp_y_db:[0,60,40],Kp_z_db:[0,50,30]};
 for(const[key,[min,max,def]]of Object.entries(bounds)){const value=Number(raw[key]??def);if(!Number.isFinite(value)||value<min||value>max)throw Error('Parâmetro PTZ inválido: '+key);result[key]=value;}
 for(const key of Object.keys(raw))if(!['address','port',...Object.keys(bounds)].includes(key))throw Error('Parâmetro PTZ desconhecido: '+key);
 return result;
}
export async function ptzTargets(p){const director=(await p.vendor('talkback',{action:'state'},'freemix')).director_uuid;return(p.state.sourceInputs||[]).filter(x=>x.key&&x.key!==director&&x.key!==p.state.calls?.director?.key&&['dshow_input','ffmpeg_source','ndi_source','omtsource'].includes(x.kind)&&!/^FreeMix (?:Retorno|N1|Bus|Master|Slot)/.test(x.name)&&!x.audioOnly);}
export async function executePTZ(engine,d){
 if(typeof d.enabled!=='boolean')throw Error('Informe iniciar ou parar tracking PTZ');
 const targets=await ptzTargets(engine.p),target=targets.find(x=>x.key===d.key);if(!target)throw Error('Escolha uma fonte pública de vídeo assíncrono (câmera/NDI/OMT/mídia)');
 const old=(await engine.p.req('GetSourceFilterList',{sourceUuid:target.key})).filters.find(f=>f.filterName===PTZ_NAME);
 if(old&&old.filterKind!==PTZ_KIND)throw Error('Nome reservado por outro filtro');
 if(!d.enabled){if(old)await engine.p.req('RemoveSourceFilter',{sourceUuid:target.key,filterName:PTZ_NAME});return{key:target.key,enabled:false,removed:!!old};}
 if(!(await engine.discover()).ptz)throw Error('Face Tracker PTZ indisponível');
 const active=await engine.p.req('GetSourceActive',{sourceUuid:target.key});if(!active.videoShowing)throw Error('Coloque a entrada da câmera no Preview ou Programa antes de iniciar tracking PTZ');
 const settings=ptzSettings(d.settings),defaults=(await engine.p.req('GetSourceFilterDefaultSettings',{filterKind:PTZ_KIND})).defaultFilterSettings;
 engine.p.ptzManager?.assertTrackingAvailable(settings['ptz.visca-over-tcp.address'],settings['ptz.visca-over-tcp.port']);
 await engine.filter(target.key,PTZ_NAME,PTZ_KIND,{...defaults,...settings},true);
 const confirmed=await engine.p.req('GetSourceFilter',{sourceUuid:target.key,filterName:PTZ_NAME});
 if(!confirmed.filterEnabled||confirmed.filterSettings['ptz-type']!=='visca-over-tcp')throw Error('Tracking PTZ não confirmado');
 return{key:target.key,enabled:true,transport:'VISCA TCP',address:settings['ptz.visca-over-tcp.address'],port:settings['ptz.visca-over-tcp.port'],cameraMotionConfirmed:false};
}
