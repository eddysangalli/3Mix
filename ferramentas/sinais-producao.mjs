import {createHash} from 'node:crypto';
export class SignalEngine {
 constructor(p){this.p=p;this.scope=null;this.monitors=new Map();this.last=null;this.next=0;}
 setScope(scope){if(this.scope===scope)return;this.scope=scope;this.monitors.clear();this.next=0;}
 summary(){return {items:[...this.monitors.values()].map(({hash,...s})=>s),note:'Imagem sem alterações é observação, não prova de câmera congelada. Alertas de movimento são opcionais; nada é reiniciado ou colocado no ar.'};}
 async sample(key){
  const m=this.monitors.get(key);if(!m)throw Error('Ative o diagnóstico desta entrada');const input=this.p.state.inputs.find(i=>i.key===key);m.sampledAt=Date.now();
  if(!input){m.status='missing';m.error='Entrada removida';return;}
  try{
   const frame=await this.p.req('GetSourceScreenshot',{sourceUuid:key,imageFormat:'jpg',imageWidth:160,imageHeight:90,imageCompressionQuality:55}),hash=createHash('sha256').update(frame.imageData).digest('hex'),now=Date.now();
   if(hash!==m.hash){m.hash=hash;m.lastChangedAt=now;m.samplesUnchanged=0;}else m.samplesUnchanged++;
   m.unchangedSeconds=Math.floor((now-m.lastChangedAt)/1000);m.status=m.expectMotion&&m.samplesUnchanged>=2&&m.unchangedSeconds>=m.timeoutSeconds?'motion-warning':m.samplesUnchanged?'unchanged':'changing';m.error=null;
   if(input.media){const status=await this.p.optional('GetMediaInputStatus',{inputName:input.media});if(status){const advancing=status.mediaCursor!==m.mediaCursor||status.mediaState!=='OBS_MEDIA_STATE_PLAYING';if(advancing)m.mediaChangedAt=now;m.mediaState=status.mediaState;m.mediaCursor=status.mediaCursor;if(!advancing&&now-(m.mediaChangedAt||now)>=m.timeoutSeconds*1000)m.status='media-stalled';}}
  }catch(e){m.status='error';m.error=e.message;}
 }
 async observe(){const enabled=[...this.monitors.values()].filter(m=>m.enabled);if(!enabled.length)return;const m=enabled[this.next++%enabled.length];if(Date.now()-(m.sampledAt||0)<2000)return;await this.sample(m.key);}
 async execute(action,d){this.setScope(this.p.scope);if(action==='signal_read'){this.last=this.summary();return;}
  const input=this.p.state.inputs.find(i=>i.key===d.input);if(!input||input.name==='3Mix Barramentos'||input.name.startsWith('3Mix Slot '))throw Error('Selecione uma entrada pública com vídeo');
  if(action==='signal_configure'){
   if(typeof d.enabled!=='boolean'||typeof d.expectMotion!=='boolean'||!Number.isInteger(d.timeoutSeconds)||d.timeoutSeconds<5||d.timeoutSeconds>120)throw Error('Informe ativação, movimento e intervalo de 5 a 120 segundos');
   if(!d.enabled){this.monitors.delete(input.key);this.last=this.summary();return;}
   if(!this.monitors.has(input.key)&&this.monitors.size>=8)throw Error('Limite de oito entradas monitoradas');
   this.monitors.set(input.key,{key:input.key,name:input.name,enabled:true,expectMotion:d.expectMotion,timeoutSeconds:d.timeoutSeconds,status:'pending',sampledAt:0,lastChangedAt:Date.now(),samplesUnchanged:0,unchangedSeconds:0});await this.sample(input.key);
  }else if(action==='signal_probe')await this.sample(input.key);else throw Error('Diagnóstico inválido');this.last=this.summary();
 }
}
