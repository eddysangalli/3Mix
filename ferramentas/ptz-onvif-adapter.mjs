// Explicit ONVIF adapter. No inferred profiles or simulated imaging capabilities.
import {OnvifPTZ} from './ptz-onvif.mjs';
import {OnvifImaging} from './ptz-onvif-imaging.mjs';
export function createOnvifAdapter(device){
 const client=new OnvifPTZ({url:device.url,profileToken:device.profileToken,username:device.username||'',password:device.password||''});
 const imaging=new OnvifImaging({url:device.url,username:device.username||'',password:device.password||''});
 let connected=false, videoSourceToken=null;
 const unavailable=()=>{throw Error('ONVIF capability not discovered; control unavailable');};
 return {
  get connected(){return connected;},
  async connect(){
   await client.getStatus();connected=true;
   // Imaging lives on a separate service; discover its video source token without
   // failing the whole connection when the camera does not expose it.
   try{videoSourceToken=await imaging.getVideoSources();}catch{videoSourceToken=null;}
  },
  async close(){connected=false;},
  move(pan,tilt,speed){return client.move(pan*speed,tilt*speed,0);},
  zoom(direction,speed){return client.move(0,0,direction*speed);},
  stop(){return client.stop();},
  focus:unavailable,focusMode:unavailable,home:unavailable,
  presetRecall:unavailable,presetSave:unavailable,
  async imagingGet(){if(!videoSourceToken)throw Error('ONVIF Imaging não descoberto nesta câmera');return imaging.getImagingSettings(videoSourceToken);},
  async imagingSet(patch){if(!videoSourceToken)throw Error('ONVIF Imaging não descoberto nesta câmera');return imaging.setImagingSettings(videoSourceToken,patch);},
  async deviceInfo(){return imaging.getDeviceInformation();},
  capabilities:{movement:'profile-required',focus:false,home:false,presets:false,imaging:false,deviceInfo:true}
 };
}
