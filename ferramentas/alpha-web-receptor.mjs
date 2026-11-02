// Receives real packed-alpha video. Remuxes H.264 without decoding or redrawing titles.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../package.json',import.meta.url));
const {WebSocketServer,WebSocket}=require('ws');
const root=fileURLToPath(new URL('../',import.meta.url));
const viewerFile=fileURLToPath(new URL('../painel/alpha-web/viewer.html',import.meta.url));
const clientFile=fileURLToPath(new URL('../painel/alpha-web/viewer.js',import.meta.url));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class AlphaWebReceiver {
 constructor({ffmpeg=join(root,'runtime/ffmpeg.exe'),port=18750,srtPort=18460,bind='127.0.0.1',srtBind='127.0.0.1',token=randomBytes(24).toString('base64url'),inputUrl=null,retryMs=1500}={}){
  if(!Number.isInteger(port)||port<0||port>65535||!Number.isInteger(srtPort)||srtPort<1024||srtPort>65535||!/^[\w.-]+$/.test(bind)||!/^[\w.-]+$/.test(srtBind)||!/^[-\w]{24,80}$/.test(token))throw Error('Configuração de receptor inválida');
  Object.assign(this,{ffmpeg,port,srtPort,bind,srtBind,token,retryMs});
  this.inputUrl=inputUrl||`srt://${srtBind}:${srtPort}?mode=listener&latency=120000&timeout=3000000`;
  this.prefix='/alpha/'+token;this.clients=new Set();this.generation=0;this.stopping=false;
  this.stats={connected:false,fragments:0,bytes:0,restarts:0,lastVideoAt:null};this.pending=Buffer.alloc(0);this.init=[];
 }
 status(){return {...this.stats,generation:this.generation,viewers:this.clients.size,port:this.port,srtPort:this.srtPort,transport:'SRT H.264 4:2:0 packed → fragmented MP4 → WebGL alpha',audio:false};}
 json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
 reset(){this.pending=Buffer.alloc(0);this.init=[];this.initSegment=null;this.fragmentParts=[];this.lastFragment=null;this.mime=null;this.stats.connected=false;this.generation++;for(const ws of this.clients){ws.send(JSON.stringify({type:'reset'}));ws.close(1012,'Video restarted');}}
 send(ws,data){if(ws.readyState!==WebSocket.OPEN)return;if(ws.bufferedAmount>8*1024*1024){ws.terminate();return;}ws.send(data);}
 accept(chunk){
  this.pending=Buffer.concat([this.pending,chunk]);
  while(this.pending.length>=8){
   let size=this.pending.readUInt32BE(0),header=8;
   if(size===1){if(this.pending.length<16)return;const big=this.pending.readBigUInt64BE(8);if(big>32n*1024n*1024n)throw Error('MP4 box too large');size=Number(big);header=16;}
   if(size<header||size>32*1024*1024)throw Error('Invalid MP4 box');if(this.pending.length<size)return;
   const box=this.pending.subarray(0,size),type=box.toString('ascii',4,8);this.pending=this.pending.subarray(size);
   if(type==='ftyp'||type==='moov'){
    this.init.push(box);
    if(type==='moov'){
     const at=box.indexOf(Buffer.from('avcC'));if(at<0||at+8>box.length)throw Error('H.264/AVC input required');
     this.mime=`video/mp4; codecs="avc1.${box.subarray(at+5,at+8).toString('hex')}"`;
     this.initSegment=Buffer.concat(this.init);this.stats.connected=true;
     for(const ws of this.clients){this.send(ws,JSON.stringify({type:'init',mime:this.mime,generation:this.generation}));this.send(ws,this.initSegment);}
    }
   }else if(type==='moof')this.fragmentParts=[box];
   else if(this.fragmentParts.length){
    this.fragmentParts.push(box);
    if(type==='mdat'){
     this.lastFragment=Buffer.concat(this.fragmentParts);this.fragmentParts=[];this.stats.fragments++;this.stats.bytes+=this.lastFragment.length;this.stats.lastVideoAt=Date.now();
     for(const ws of this.clients)this.send(ws,this.lastFragment);
    }
   }
  }
  if(this.pending.length>32*1024*1024)throw Error('MP4 buffer exceeded');
 }
 startVideo(){
  if(this.stopping)return;this.reset();
  // Each fragment starts at a keyframe, so a viewer can join without corrupt frames.
  const args=['-hide_banner','-loglevel','warning','-nostdin','-probesize','1000000','-analyzeduration','1000000','-i',this.inputUrl,'-map','0:v:0','-c:v','copy','-an','-movflags','empty_moov+default_base_moof+frag_keyframe','-flush_packets','1','-f','mp4','pipe:1'];
  const child=spawn(this.ffmpeg,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});this.child=child;
  child.stdout.on('data',chunk=>{try{this.accept(chunk);}catch{this.stats.error='Vídeo incompatível com o receptor H.264';child.kill();}});
  child.stderr.on('data',()=>{}); // Do not log connection URLs/passphrases.
  child.on('error',()=>{this.stats.error='Não foi possível iniciar o FFmpeg';});
  child.on('close',()=>{if(this.child===child)this.child=null;this.stats.connected=false;for(const ws of this.clients){this.send(ws,JSON.stringify({type:'reset'}));ws.close(1012,'Video disconnected');}if(!this.stopping){this.stats.restarts++;this.retry=setTimeout(()=>this.startVideo(),this.retryMs);}});
 }
 async start(){
  this.server=createServer(async(req,res)=>{
   res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
   try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(req.method!=='GET')return this.json(res,405,{error:'Somente leitura'});
    if(path===this.prefix+'/status')return this.json(res,200,this.status());
    if(path===this.prefix){res.writeHead(302,{Location:this.prefix+'/'});return res.end();}
    if(path===this.prefix+'/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(await readFile(viewerFile));}
    if(path===this.prefix+'/viewer.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});return res.end(await readFile(clientFile));}
    // Setup page only through the local loopback host, never through a public reverse proxy.
    if(path==='/'&&['127.0.0.1','::ffff:127.0.0.1','::1'].includes(req.socket.remoteAddress)&&/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host||'')){
     const url=`http://127.0.0.1:${this.port}${this.prefix}/`;
     res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(`<!doctype html><meta charset="utf-8"><title>3Mix · Vídeo com alpha</title><style>body{font:16px Arial;background:#1d242b;color:#fff;max-width:850px;margin:40px auto}input{width:100%;padding:12px;box-sizing:border-box}p{line-height:1.5}a{color:#19c9aa}</style><h1>Vídeo com alpha · uma entrada</h1><p>Recebe vídeo de qualquer entrada com transparência. Não converte nem edita o GC.</p><p>No FreeMix, use Externo → SRT, H.264/x264, 4:2:0, alpha lado a lado (cor + máscara), origem com alpha real.</p><label>Destino SRT local<input readonly value="srt://127.0.0.1:${this.srtPort}?mode=caller&amp;latency=120000"></label><p>No vMix: Adicionar Entrada → Web Browser. Use a largura e altura lógicas da saída (por exemplo, 1920×1080).</p><label>URL para colar no vMix<input readonly onclick="this.select()" value="${esc(url)}"></label><p><a href="${esc(url)}?debug=1" target="_blank">Abrir diagnóstico do vídeo</a> · <a href="${esc(this.prefix+'/status')}">Estado do receptor</a></p><p>Sem áudio neste protótipo. Latência depende do intervalo de keyframes e do navegador. O vídeo some quando a conexão é perdida. A URL local funciona nesta máquina; internet exige hospedar o receptor com HTTPS/WSS e uma porta SRT acessível.</p>`);
    }
    return this.json(res,404,{error:'Não encontrado'});
   }catch{return this.json(res,500,{error:'Receptor indisponível'});}
  });
  this.wss=new WebSocketServer({noServer:true,maxPayload:1024});
  this.server.on('upgrade',(req,socket,head)=>{
   let valid=false;try{const u=new URL(req.url,'http://localhost');valid=u.pathname===this.prefix+'/ws'&&(!req.headers.origin||new URL(req.headers.origin).host===req.headers.host)&&this.clients.size<16;}catch{}
   if(!valid){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');return socket.destroy();}
   this.wss.handleUpgrade(req,socket,head,ws=>{
    this.clients.add(ws);ws.on('error',()=>{});ws.on('close',()=>this.clients.delete(ws));
    if(this.initSegment){this.send(ws,JSON.stringify({type:'init',mime:this.mime,generation:this.generation}));this.send(ws,this.initSegment);if(this.lastFragment)this.send(ws,this.lastFragment);}
   });
  });
  await new Promise((yes,no)=>{this.server.once('error',no);this.server.listen(this.port,this.bind,yes);});this.port=this.server.address().port;
  this.startVideo();return {url:`http://127.0.0.1:${this.port}${this.prefix}/`,setup:`http://127.0.0.1:${this.port}/`};
 }
 async stop(){this.stopping=true;clearTimeout(this.retry);for(const ws of this.clients)ws.terminate();this.wss?.close();const child=this.child;if(child){child.kill();await Promise.race([new Promise(r=>child.once('close',r)),new Promise(r=>setTimeout(r,2000))]);}if(this.server)await new Promise(r=>this.server.close(r));}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=(name,fallback)=>process.argv.find(x=>x.startsWith('--'+name+'='))?.split('=').slice(1).join('=')||fallback;
 const dataDir=resolve(arg('data',join(root,'config/alpha-web-receptor')));await mkdir(dataDir,{recursive:true});
 let token;try{token=JSON.parse(await readFile(join(dataDir,'access.json'),'utf8')).token;}catch(e){if(e.code!=='ENOENT')throw e;token=randomBytes(24).toString('base64url');await writeFile(join(dataDir,'access.json'),JSON.stringify({token}),{mode:0o600});}
 const srtBind=arg('srt-bind','127.0.0.1'),srtPort=Number(arg('srt-port','18460')),secret=process.env.FREEMIX_ALPHA_SRT_PASSPHRASE;
 if(secret&&(secret.length<10||secret.length>79))throw Error('A frase SRT precisa de 10 a 79 caracteres');
 const inputUrl=secret?`srt://${srtBind}:${srtPort}?mode=listener&latency=120000&timeout=3000000&passphrase=${encodeURIComponent(secret)}&pbkeylen=32`:null;
 const service=new AlphaWebReceiver({ffmpeg:arg('ffmpeg',join(root,'runtime/ffmpeg.exe')),port:Number(arg('port','18750')),srtPort,bind:arg('bind','127.0.0.1'),srtBind,token,inputUrl});
 const info=await service.start();await writeFile(join(dataDir,'running.json'),JSON.stringify({...info,pid:process.pid,status:service.status()},null,2));
 console.log('3Mix · receptor de vídeo alpha\nAbra '+info.setup+'\nCtrl+C encerra somente este receptor.');
 let closing=false;for(const event of ['SIGINT','SIGTERM'])process.on(event,async()=>{if(closing)return;closing=true;await service.stop();process.exit(0);});
}
