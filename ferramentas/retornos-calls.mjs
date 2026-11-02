// Each guest gets a separate PCM mix. Own voice is always excluded; director
// packets require the native lease AND membership in the current talk target.
import {randomBytes} from 'node:crypto';
import {NativeCallVideo} from './call-video-native.mjs';
export function mixReturn(packets,{own,sources,director,lease,targets,key,window,gain=1}){
 if(!Number.isFinite(gain)||gain<0||gain>2)throw Error('Nível de retorno inválido');
 const selected=packets.filter(p=>p.uuid!==own&&sources.has(p.uuid)&&
  (p.uuid!==director||(lease&&p.lease===lease&&targets.has(key))));
 if(!selected.length&&!window)return null;
 const rate=window?.rate||selected[0].rate;
 if(selected.some(p=>p.rate!==rate))throw Error('Taxas de áudio diferentes no retorno');
 const startFrame=window?.start??selected.reduce((a,p)=>Math.min(a,Number(BigInt(p.timestamp)*BigInt(rate)/1000000000n)),Infinity);
 const blocks=selected.map(p=>({p,offset:Number(BigInt(p.timestamp)*BigInt(rate)/1000000000n)-startFrame}));
 const frames=window?.frames??Math.max(...blocks.map(({p,offset})=>offset+p.frames));
 if(frames>rate/2)return null; // never turn a stale/discontinuous batch into seconds of latency
 const output=Buffer.alloc(frames*2*4);
 for(const {p,offset} of blocks){
  const data=Buffer.from(p.pcm,'base64');
  if(data.length!==p.frames*p.channels*4||p.channels<1||p.channels>8)throw Error('PCM inválido');
  for(let f=Math.max(0,-offset);f<Math.min(p.frames,frames-offset);f++)for(let ch=0;ch<2;ch++){
   const value=data.readFloatLE((f*p.channels+Math.min(ch,p.channels-1))*4);
   if(!Number.isFinite(value))continue;
   const index=((offset+f)*2+ch)*4;
   output.writeFloatLE(output.readFloatLE(index)+value*gain,index);
  }
 }
 for(let i=0;i<output.length;i+=4)output.writeFloatLE(Math.max(-1,Math.min(1,output.readFloatLE(i))),i);
 const header=Buffer.alloc(12);header.writeUInt32LE(rate);header.writeUInt32LE(2,4);header.writeUInt32LE(frames,8);
 return Buffer.concat([header,output]);
}
export class CallReturns{
 constructor(engine){this.videoController=null;this.videoExperimental=false;this.videoScope=null;this.engine=engine;this.clients=new Map();this.routes=[];this.sources=[];this.program=[];this.conference=true;this.token=randomBytes(32).toString('base64url');this.timer=null;this.busy=false;this.error=null;this.targets=new Set();this.lease=null;this.pending=[];this.cursor=null;}
 status(){return this.routes.map(r=>{const c=this.clients.get(r.key);const stale=c&&Date.now()-(c.updated||0)>10000;return {key:r.key,stream:r.stream,video:r.video||'program',audio:r.audio||'program',audioSources:r.audioSources||[],gain:r.gain??1,publisher:stale?'stale':c?.status||'offline',peers:stale?0:c?.peers||0,peerConnectionVerified:!stale&&(c?.peers||0)>0,diagnostics:c?.diagnostics||null,videoTransport:c?.videoTransport||{mode:(r.video||'program')==='program'?'virtual-camera':'jpeg5',audioIncluded:false,avSyncProven:false},error:stale?'Publicador sem heartbeat':c?.error||this.error};});}
 configure({routes,sources,program,conference,experimentalContinuousVideo=this.videoExperimental,videoScope=this.videoScope}){this.routes=routes;this.sources=sources;this.program=program;this.conference=conference;this.videoExperimental=experimentalContinuousVideo===true;this.videoScope=videoScope;this.videoController?.setEnabled(this.videoExperimental);this.syncVideo();}
 // Default off. Future owner must pass an explicit persisted opt-in + scope; reading state never enables it.
 ensureVideo(){if(!this.videoController){this.videoController=new NativeCallVideo(async(request,connection)=>{const r=await connection.req('CallVendorRequest',{vendorName:'freemix',requestType:'call_video',requestData:request});return r.responseData;},{getConnection:()=>this.engine.p.getObs(),onMode:(client,transport)=>{client.videoTransport=transport;this.sendVideoConfig(client);}});this.videoController.setEnabled(this.videoExperimental);}return this.videoController;}
 syncVideo(){if(this.timer&&this.clients.size)this.ensureVideo().reconcile(this.routes,this.clients,this.engine.p.state.inputs,this.videoScope).catch(()=>{this.videoError='Retorno contínuo não confirmado';});}
 sendVideoConfig(client){const route=this.routes.find(r=>r.key===client.key);if(!route||this.clients.get(client.key)!==client||client.ws.readyState!==1)return;const transport=client.videoTransport||{mode:(route.video||'program')==='program'?'virtual-camera':'jpeg5',audioIncluded:false,avSyncProven:false};const config={type:'config',stream:route.stream,video:route.video||'program',ice:this.engine.ice||null,videoTransport:transport};const identity=JSON.stringify({...config,videoTransport:{...transport,reason:undefined}});if(client.videoConfigIdentity===identity)return;client.videoConfigIdentity=identity;client.ws.send(JSON.stringify(config));}
 async start(){
  this.pending=[];this.cursor=null;
  await this.engine.p.vendor('call_audio',{action:'configure',sources:this.sources.map(i=>({uuid:i.inputUuid}))},'freemix');
  if(!this.timer){this.timer=setInterval(()=>this.pump(),50);this.timer.unref();}this.syncVideo();
 }
 async stop(){clearInterval(this.timer);this.timer=null;this.lease=null;this.targets.clear();for(const {ws} of this.clients.values())ws.close();this.clients.clear();const controller=this.videoController;this.videoController=null;await controller?.dispose();await this.engine.p.optional('CallVendorRequest',{vendorName:'freemix',requestType:'call_audio',requestData:{action:'stop'}});}
 accept(ws,key){
  if(!this.routes.some(r=>r.key===key)){ws.close();return;}
  this.clients.get(key)?.ws.close();const client={key,ws,status:'connecting',peers:0,updated:Date.now()};this.clients.set(key,client);
  ws.on('close',()=>{this.videoController?.unsubscribe(key,client);if(this.clients.get(key)===client)this.clients.delete(key);});
  ws.on('message',raw=>{try{const d=JSON.parse(String(raw));if(d.type==='video-capability'){client.videoCapability={available:d.available===true,experimentalOptIn:d.experimentalOptIn===true};this.syncVideo();}if(d.type==='status'){client.updated=Date.now();client.status=['connecting','publishing','error'].includes(d.status)?d.status:'error';client.peers=Math.max(0,Math.min(100,Number(d.peers)||0));client.error=String(d.error||'').slice(0,300);const x=d.diagnostics||{};client.diagnostics={ice:String(x.ice||'').slice(0,30),transport:String(x.transport||'').slice(0,30),rttMs:Number.isFinite(x.rttMs)?Math.max(0,Math.min(60000,x.rttMs)):null,packetsLost:Number.isFinite(x.packetsLost)?Math.max(0,x.packetsLost):null,reconnects:Math.max(0,Math.min(10000,Number(x.reconnects)||0)),queuedMs:Math.max(0,Math.min(1000,Number(x.queuedMs)||0))};}}catch{ws.close();}});
  this.sendVideoConfig(client);this.syncVideo();
 }
 async videoFrames(){
  this.syncVideo();if(this.videoBusy||Date.now()-(this.videoTime||0)<200)return;this.videoBusy=true;this.videoTime=Date.now();
  try{for(const key of new Set(this.routes.map(r=>r.video).filter(v=>v&&v!=='program'))){const entry=this.engine.p.state.inputs.find(i=>i.key===key);if(!entry)continue;const receivers=this.routes.filter(r=>r.video===key).map(r=>this.clients.get(r.key)).filter(c=>c?.ws.readyState===1&&c.videoMode!=='continuous'&&c.ws.bufferedAmount<256*1024);if(!receivers.length)continue;const shot=await this.engine.p.req('GetSourceScreenshot',{sourceName:entry.name,imageFormat:'jpeg',imageWidth:640,imageHeight:360,imageCompressionQuality:75});for(const c of receivers)c.ws.send(JSON.stringify({type:'video',image:shot.imageData}));}}catch(e){this.videoError=e.message;}finally{this.videoBusy=false;}
 }
 async pump(){
  if(this.busy)return;this.busy=true;
  try{
   const batch=await this.engine.p.vendor('call_audio',{action:'drain'},'freemix');
   const calls=new Set(this.routes.map(r=>r.key));
   const common=new Set(this.program.filter(key=>!calls.has(key)));
   if(this.conference)for(const key of calls)common.add(key);
   if(this.engine.director)common.add(this.engine.director.key);
   this.pending.push(...batch.packets||[]);if(this.pending.length>1000)this.pending.splice(0,this.pending.length-1000);
   if(this.pending.length){
    const rate=this.pending[0].rate,block=Math.round(rate*.05);
    const pos=p=>typeof p.timestamp==='bigint'?Number(p.timestamp*BigInt(rate)/1000000000n):Math.round(Number(p.timestamp)*rate/1e9);
    const newest=Math.max(...this.pending.map(p=>pos(p)+p.frames));
    if(this.cursor===null)this.cursor=Math.min(...this.pending.map(pos));
    const targetLag=block*2,currentLag=newest-this.cursor;
    if(currentLag>rate*.5||currentLag<-block)this.cursor=newest-targetLag;
    else if(Math.abs(currentLag-targetLag)>rate*.01){
     const driftAdj=Math.sign(currentLag-targetLag)*Math.min(Math.abs(Math.round((currentLag-targetLag)*.05)),Math.round(block*.05));
     this.cursor+=driftAdj;
    }
    for(let sent=0;sent<4&&this.cursor+block<=newest;sent++){
     const packets=this.pending.filter(p=>pos(p)<this.cursor+block&&pos(p)+p.frames>this.cursor);
     for(const route of this.routes){const client=this.clients.get(route.key);if(!client||client.ws.readyState!==1)continue;
      const sources=route.audio==='custom'?new Set(route.audioSources||[]):route.audio==='silent'?new Set():new Set(common);
      if(this.conference&&route.audio!=='silent')for(const key of calls)sources.add(key);
      if(this.engine.director)sources.add(this.engine.director.key);
      const output=mixReturn(packets,{own:route.key,sources,director:this.engine.director?.key,lease:this.lease,targets:this.targets,key:route.key,gain:route.gain??1,window:{rate,start:this.cursor,frames:block}});
      if(output&&client.ws.bufferedAmount<256*1024)client.ws.send(output);
     }
     this.cursor+=block;
     this.pending=this.pending.filter(p=>pos(p)+p.frames>this.cursor);
    }
   }
   this.error=null;
   this.videoFrames();
  }catch(e){this.error=e.message;this.lease=null;this.targets.clear();}finally{this.busy=false;}
 }
}
