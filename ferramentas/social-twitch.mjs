// Leitura de chat da Twitch sem credencial.
//
// O chat público da Twitch aceita conexão anônima (NICK justinfanNNNN) só para LER. Isso não dá
// poder de moderação, não apaga mensagem e não publica nada: serve apenas para trazer o comentário
// para a fila do 3Mix Social, onde ele continua sujeito a aprovação. Nenhum segredo é pedido.
//
// Os demais conectores (YouTube, Facebook/Instagram, TikTok, Kick, Bluesky) exigem credencial
// oficial de API e por isso NÃO são fingidos aqui: aparecem como bloqueados por dependência.
import tls from 'node:tls';

const HOST='irc.chat.twitch.tv',PORT=6697;
const CHANNEL=/^[a-z\d_]{1,25}$/i;
const MAX_RECONNECT=5;

// Tags do IRCv3 viram objeto. Valor vazio conta como ausente.
function parseTags(text){
 const tags={};
 for(const part of text.split(';')){
  if(!part)continue;
  const index=part.indexOf('=');
  if(index<0){tags[part]=true;continue;}
  const key=part.slice(0,index);
  let value=part.slice(index+1);
  value=value.replace(/\\(.)/g,(_,c)=>({':':';','s':' ','\\':'\\','r':'\r','n':'\n'})[c]??c);
  tags[key]=value;
 }
 return tags;
}

// Uma linha PRIVMSG vira um comentário. Devolve null para tudo que não é mensagem de chat.
export function parsePrivmsg(line){
 if(!line)return null;
 let rest=line, tags={};
 if(rest.startsWith('@')){
  const space=rest.indexOf(' ');
  if(space<0)return null;
  tags=parseTags(rest.slice(1,space));
  rest=rest.slice(space+1);
 }
 const match=/^:(\S+)!(\S+)@\S+\s+PRIVMSG\s+#([a-z\d_]+)\s+:(.*)$/i.exec(rest);
 if(!match)return null;
 const text=match[4].replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').slice(0,500);
 if(!text)return null;
 return {
  network:'twitch',
  channel:match[3].toLowerCase(),
  login:match[2].toLowerCase(),
  author:tags['display-name']||match[2],
  authorId:tags['user-id']||null,
  color:/^#[a-f\d]{6}$/i.test(tags.color||'')?tags.color:null,
  text,
  at:Date.now(),
  source:'twitch-irc-anonymous'
 };
}

export class TwitchChat{
 constructor(onMessage){this.onMessage=onMessage;this.socket=null;this.channel=null;this.status='idle';this.error=null;this.attempts=0;this.connectedAt=null;this.lastAt=null;this.count=0;this.reconnectTimer=null;this.manual=false;}

 summary(){
  return {status:this.status,channel:this.channel,error:this.error,connectedAt:this.connectedAt,lastMessageAt:this.lastAt,messages:this.count,anonymous:true,canModerate:false,
   note:'Leitura anônima do chat público: não apaga mensagens, não dá timeout e não publica nada. Todo comentário entra na fila para aprovação.'};
 }

 connect(channel){
  const name=String(channel||'').trim().replace(/^#/,'').toLowerCase();
  if(!CHANNEL.test(name))throw Error('Canal da Twitch inválido: use somente letras, números e sublinhado (até 25)');
  if(this.status==='connecting'||this.status==='connected')this.disconnect();
  this.channel=name;this.manual=false;this.attempts=0;this.error=null;
  return this.open();
 }

 open(){
  return new Promise((resolve,reject)=>{
   this.status='connecting';
   const socket=tls.connect({host:HOST,port:PORT,servername:HOST},()=>{
    socket.write('CAP REQ :twitch.tv/tags twitch.tv/commands\r\n');
    socket.write('PASS SCHMOOPIIE\r\n');
    socket.write('NICK justinfan'+Math.floor(10000+Math.random()*89999)+'\r\n');
    socket.write('JOIN #'+this.channel+'\r\n');
    this.status='connected';this.connectedAt=Date.now();this.attempts=0;this.error=null;
    resolve(this.summary());
   });
   this.socket=socket;
   socket.setEncoding('utf8');
   socket.unref?.();
   let buffer='';
   socket.on('data',chunk=>{
    buffer+=chunk;
    let index;
    while((index=buffer.indexOf('\r\n'))>=0){
     const line=buffer.slice(0,index);buffer=buffer.slice(index+2);
     this.line(line,socket);
    }
    if(buffer.length>65536)buffer='';                 // linha absurda: descarta em vez de crescer sem limite
   });
   socket.on('error',error=>{this.error=error.code||error.message;if(this.status==='connecting'){this.status='error';reject(Error('Chat da Twitch indisponível: '+this.error));}});
   socket.on('close',()=>{this.socket=null;if(this.status!=='error')this.status='closed';if(!this.manual&&this.channel&&this.attempts<MAX_RECONNECT)this.reconnect();});
   socket.setTimeout(0);
  });
 }
 line(line,socket){
  if(line.startsWith('PING')){socket.write('PONG :tmi.twitch.tv\r\n');return;}
  if(/^:\S+\s+NOTICE\s/.test(line)&&/login authentication failed/i.test(line)){this.status='error';this.error='A Twitch recusou a conexão anônima';socket.destroy();return;}
  const message=parsePrivmsg(line);
  if(!message)return;
  this.lastAt=message.at;this.count++;
  try{this.onMessage(message);}catch{/* a fila decide o que fazer; erro de fila não derruba o socket */}
 }
 reconnect(){
  this.attempts++;
  const wait=Math.min(30000,1000*2**this.attempts);
  this.status='reconnecting';
  this.reconnectTimer=setTimeout(()=>{this.reconnectTimer=null;this.open().catch(()=>{});},wait);
  this.reconnectTimer.unref?.();
 }
 disconnect(){
  this.manual=true;
  if(this.reconnectTimer){clearTimeout(this.reconnectTimer);this.reconnectTimer=null;}
  if(this.socket){try{this.socket.destroy();}catch{}this.socket=null;}
  this.status='idle';this.connectedAt=null;
  return this.summary();
 }
}
