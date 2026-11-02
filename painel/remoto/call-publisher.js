// Private publisher: no physical microphone; only selected return video.
'use strict';
const query=new URLSearchParams(location.search),key=query.get('key'),token=query.get('token');
let sdk,ctx,video,worklet,ws,closed=false,retry=null,reconnects=0,generation=0,canvas=null,publishing=false;
let videoWriter=null,videoTransport=null,videoModule=null,publishQueue=Promise.resolve();
const videoReady=import('./call-video-track.js').then(m=>(videoModule=m)).catch(()=>null);
const peers=new Map();let diagnostic={queuedMs:0};
function status(value,error='') {document.getElementById('status').textContent=error||(value+(videoTransport?' · vídeo contínuo experimental; sincronismo A/V ainda não homologado':canvas?' · retorno JPEG até 5 fps':''));if(ws?.readyState===1)ws.send(JSON.stringify({type:'status',status:value,peers:[...peers.values()].filter(p=>p.connectionState==='connected').length,error,diagnostics:{...diagnostic,reconnects}}));}
async function closeMedia(){generation++;publishing=false;const ownedWriter=videoWriter,ownedVideo=video,ownedWorklet=worklet,ownedSdk=sdk,ownedCtx=ctx;videoWriter=null;videoTransport=null;video=null;worklet=null;sdk=null;ctx=null;peers.clear();canvas=null;ownedWriter?.close();ownedWorklet?.port.postMessage({flush:true});ownedVideo?.getTracks().forEach(t=>t.stop());try{await ownedSdk?.disconnect();}catch{}try{await ownedCtx?.close();}catch{}}
async function publish(next){
 await closeMedia();const current=generation;
 ctx=new AudioContext({sampleRate:48000});await ctx.audioWorklet.addModule('call-pcm-worklet.js');
 worklet=new AudioWorkletNode(ctx,'freemix-call-pcm',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
 worklet.port.onmessage=e=>{if(e.data?.type==='diagnostic')diagnostic.queuedMs=e.data.queuedMs;};
 const destination=ctx.createMediaStreamDestination();worklet.connect(destination);await ctx.resume();
 if((next.video||'program')==='program'){
  const devices=await navigator.mediaDevices.enumerateDevices(),device=devices.find(d=>d.kind==='videoinput'&&/obs|freemix/i.test(d.label));
  if(!device)throw Error('Câmera virtual 3Mix não encontrada; nenhuma câmera física foi aberta');
  video=await navigator.mediaDevices.getUserMedia({audio:false,video:{deviceId:{exact:device.deviceId},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:25,max:30}}});
 }else if(next.videoTransport?.mode==='continuous'){
  const m=await videoReady;if(!m?.videoCapabilities().available)throw Error('Transporte contínuo indisponível neste navegador');
  const generated=m.generatedVideoTrack();video=new MediaStream([generated.track]);videoTransport=next.videoTransport;
  videoWriter=new m.BoundedTrackWriter({...generated,...videoTransport,onFault:()=>{status('error','Retorno contínuo interrompido; controle precisa ser reconectado');ws?.close();}});
 }else{canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;canvas.getContext('2d').fillRect(0,0,640,360);video=canvas.captureStream(5);}
 if(closed||current!==generation){video?.getTracks().forEach(t=>t.stop());return;}
 const stream=new MediaStream([...destination.stream.getAudioTracks(),...video.getVideoTracks()]);
const ice=next.ice;const turns=ice?.iceServers?.filter(s=>s.urls.some(u=>/^turns?:/i.test(u))),stuns=ice?.iceServers?.flatMap(s=>s.urls.filter(u=>/^stuns?:/i.test(u)).map(url=>({urls:url})));
 sdk=new VDONinjaSDK({debug:false,...(ice?{turnServers:turns,stunServers:stuns,forceTURN:ice.transportPolicy==='relay'}:{})});
 sdk.addEventListener('peerConnected',e=>{if(e.detail?.connection?.pc)peers.set(e.detail.uuid,e.detail.connection.pc);status('publishing');});
 sdk.addEventListener('peerDisconnected',e=>{peers.delete(e.detail?.uuid);status(publishing?'publishing':'connecting');});
 sdk.addEventListener('error',()=>{publishing=false;status('error','Falha de sinalização/WebRTC; reconexão em andamento');schedule();});
 await sdk.connect();if(closed||current!==generation)return;
 await sdk.publish(stream,{streamID:next.stream,label:'3Mix Retorno',media:{video:{maxBitrate:1500},audio:{maxBitrate:96}}});publishing=true;status('publishing');
}
function schedule(){if(closed||retry)return;retry=setTimeout(()=>{retry=null;reconnects++;connect();},Math.min(10000,500*Math.pow(2,Math.min(reconnects,5))));}
function connect(){if(closed)return;if(ws){ws.onclose=null;ws.close();}status('connecting');ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/calls/audio?key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`);ws.binaryType='arraybuffer';
 ws.onopen=async()=>{const socket=ws,m=await videoReady;if(socket!==ws||socket.readyState!==1)return;socket.send(JSON.stringify({type:'video-capability',available:m?.videoCapabilities().available===true,experimentalOptIn:query.get('continuousVideo')==='experimental'}));};
 ws.onmessage=e=>{if(typeof e.data==='string'){let m;try{m=JSON.parse(e.data);}catch{return;}
  if(m.type==='config'){const socket=ws;publishQueue=publishQueue.catch(()=>{}).then(()=>{if(closed||socket!==ws)return;return publish(m);}).catch(async()=>{await closeMedia();status('error','Não foi possível preparar o retorno; tentando novamente');schedule();});}
  if(m.type==='video'&&canvas&&/^data:image\/jpeg;base64,/.test(m.image||'')){const target=canvas,img=new Image();img.onload=()=>{if(target===canvas)target.getContext('2d').drawImage(img,0,0,640,360);};img.src=m.image;}return;}
  if(e.data instanceof ArrayBuffer&&e.data.byteLength>=4&&new DataView(e.data).getUint32(0,true)===0x46564d46){if(videoWriter&&videoTransport){try{videoWriter.offer(videoModule.decodeVideoMessage(e.data,videoTransport));}catch{videoWriter.close();status('error','Quadro contínuo inválido; reconecte o retorno');ws?.close();}}return;}
  if(!worklet||e.data.byteLength<12)return;const header=new DataView(e.data),rate=header.getUint32(0,true),channels=header.getUint32(4,true),frames=header.getUint32(8,true);if(channels!==2||rate<8000||rate>192000||frames>rate/2||e.data.byteLength!==12+frames*8)return;const pcm=new Float32Array(e.data.slice(12));worklet.port.postMessage({rate,pcm},[pcm.buffer]);};
 ws.onclose=()=>{closeMedia();status('error','Controle local desconectado; tentando reconectar');schedule();};ws.onerror=()=>status('error','Falha no transporte local');
}
const heartbeat=setInterval(async()=>{try{let transport='',ice='',rttMs=null,packetsLost=0;for(const pc of peers.values()){ice=pc.iceConnectionState;const report=await pc.getStats();let pair;report.forEach(row=>{if(row.type==='candidate-pair'&&row.state==='succeeded'&&row.nominated)pair=row;if(row.type==='remote-inbound-rtp')packetsLost+=row.packetsLost||0;});if(pair){rttMs=Number.isFinite(pair.currentRoundTripTime)?pair.currentRoundTripTime*1000:null;const candidate=report.get(pair.localCandidateId);transport=candidate?.candidateType==='relay'?'TURN':candidate?.protocol||'WebRTC';}}diagnostic={...diagnostic,transport,ice,rttMs,packetsLost};status(publishing?'publishing':'connecting');}catch{status('error','Diagnóstico WebRTC indisponível');}},2000);
window.addEventListener('pagehide',()=>{closed=true;clearTimeout(retry);clearInterval(heartbeat);ws?.close();closeMedia();});connect();
