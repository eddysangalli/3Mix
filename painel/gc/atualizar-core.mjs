import fs from 'fs';
import path from 'path';

const ROOT = 'd:/DRIVE/IA/antigravity/vmixtwste/FreeMix';
const corePath = path.join(ROOT, 'painel/gc/biblioteca/core.js');

let coreContent = `(()=>{
const coreURL=document.currentScript.src;
// Own graphics: typed text/style and hash-addressed local assets, without arbitrary URLs/scripts.
const text=(key,label,value)=>({key,label,type:'text',default:value});
const number=(key,label,value,min=0,max=9999)=>({key,label,type:'number',default:value,min,max});

const definitions=[
 ['headline','Jornalismo','Manchete', [text('tag','Editoria','AO VIVO'),text('title','Manchete','A cidade se prepara para um novo capítulo'),text('detail','Linha de apoio','Informação verificada • Atualização da redação')]],
 ['lowerthird','Jornalismo','Nome e cargo',[text('name','Nome','MARINA COSTA'),text('role','Cargo / descrição','Repórter • Centro da cidade'),text('location','Local','PORTO ALEGRE')]],
 ['two_names','Jornalismo','Dois entrevistados',[text('nameA','Nome à esquerda','ANA SOUZA'),text('roleA','Cargo à esquerda','Apresentadora'),text('nameB','Nome à direita','PAULO LIMA'),text('roleB','Cargo à direita','Convidado')]],
 ['breaking','Jornalismo','Plantão / Urgente',[text('badge','Alerta','URGENTE • PLANTÃO'),text('title','Notícia Principal','AVANÇO HISTÓRICO NAS NEGOCIAÇÕES'),text('ticker','Linha de apoio','Acordo assinado nesta manhã prevê cooperação bilateral imediata')]],
 ['quote','Jornalismo','Citação / Aspas',[text('author','Autor','DR. ROBERTO ALENCAR'),text('role','Cargo / Instituição','Diretor Geral de Pesquisas'),text('quote','Declaração','"Os resultados superaram em 40% as melhores expectativas."')]],
 ['credits','Eventos','Créditos',[text('title','Cabeçalho','EQUIPE'),text('lines','Linhas (Cargo | Nome)','Direção | Marina Costa\\nProdução | Paulo Lima\\nImagens | Ana Souza\\nEdição | João Santos')]],
 ['agenda','Eventos','Agenda',[text('title','Título','PROGRAMAÇÃO'),text('date','Data / local','SÁBADO • AUDITÓRIO CENTRAL'),text('lines','Linhas (Hora | Atividade)','09:00 | Abertura\\n10:30 | Painel de convidados\\n14:00 | Oficinas\\n17:00 | Encerramento')]],
 ['countdown','Eventos','Contagem regressiva',[text('title','Título','COMEÇAMOS EM INSTANTES'),text('detail','Mensagem','Prepare-se para acompanhar ao vivo'),number('seconds','Duração em segundos',300,0,86400)]],
 ['scoreboard','Esportes','Placar e relógio',[text('teamA','Equipe A','BRASIL'),text('teamB','Equipe B','ARGENTINA'),number('scoreA','Pontos A',2),number('scoreB','Pontos B',1),text('period','Período','2º TEMPO'),number('elapsed','Tempo inicial (segundos)',3420,0,86400)]],
 ['stats','Esportes','Comparativo estatístico',[text('teamA','Equipe A','BRASIL'),text('teamB','Equipe B','ARGENTINA'),text('title','Título','ESTATÍSTICAS'),text('lines','Linhas (A | Métrica | B)','58% | Posse de bola | 42%\\n12 | Finalizações | 8\\n6 | Escanteios | 3\\n91% | Passes certos | 86%')]],
 ['lineup','Esportes','Escalação Tática',[text('team','Equipe','SELEÇÃO BRASILEIRA'),text('formation','Esquema','4 - 3 - 3'),text('coach','Treinador','Técnico: Dorival Júnior'),text('lines','Jogadores','1 Alisson | Goleiro\\n2 Danilo | Lateral\\n3 Marquinhos | Zagueiro\\n4 Gabriel Magalhães | Zagueiro\\n5 Casemiro | Volante\\n10 Lucas Paquetá | Meia\\n7 Vinicius Jr | Atacante\\n9 Rodrygo | Atacante')]],
 ['bug','Marca','Marca e relógio',[text('brand','Marca','3MIX'),text('label','Etiqueta','AO VIVO')]],
 ['social','Eventos','Redes sociais',[text('network','Rede','INSTAGRAM'),text('handle','Perfil','@seu_evento'),text('message','Convite','Participe da conversa'),text('hashtag','Hashtag','#AoVivoComVoce')]],
 ['podcast_host','Eventos','Podcast / Entrevista',[text('name','Convidado','GABRIEL MEDEIROS'),text('bio','Especialidade','Engenheiro de IA & Criador de Conteúdo'),text('handle','Rede Social','@gabrielmedeiros • youtube.com/gab')]],
 ['superchat','Eventos','Superchat / PIX',[text('sender','Apoiador','LUCAS SILVEIRA'),text('amount','Valor','R$ 50,00'),text('message','Mensagem','Parabéns pela transmissão! Impecável!')]],
 ['speaker','Eventos','Palestrante',[text('name','Nome','FERNANDA MONTENEGRO'),text('title','Palestra','O Futuro da Inteligência Artificial'),text('company','Empresa','VP de Tecnologia • Cloud Systems')]],
 ['product_deal','Eventos','Live Commerce',[text('badge','Destaque','OFERTA EXCLUSIVA AO VIVO'),text('product','Produto','Câmera Broadcast 4K Studio Pro'),text('price_old','Preço De','De: R$ 4.899,00'),text('price_new','Preço Por','Por: R$ 3.290,00'),text('coupon','Cupom','CUPOM: 3MIXVIP')]],
 ['fullscreen','Jornalismo','Cartão de informação',[text('tag','Editoria','SERVIÇO'),text('title','Título','O QUE VOCÊ PRECISA SABER'),text('lines','Tópicos (um por linha)','Consulte os horários atualizados\\nConfira os documentos necessários\\nProcure os canais oficiais'),text('footer','Rodapé','Fonte: organização do evento')]]
];

const style=[
  {key:'accent',label:'Cor primária (Destaque)',type:'color',default:'#19c9aa'},
  {key:'secondary',label:'Cor secundária (Acento 2)',type:'color',default:'#0284c7'},
  {key:'background',label:'Cor do painel (Fundo)',type:'color',default:'#102330'},
  {key:'foreground',label:'Cor do texto',type:'color',default:'#ffffff'},
  {key:'designStyle',label:'Estilo Visual / Geometria',type:'select',default:'modern_internet',options:['modern_internet','classic_tv','swiss_square','esports_neon','corporate_glass']},
  number('opacity','Opacidade do painel (%)',96,0,100),
  number('fontSize','Tamanho do texto (%)',100,70,140),
  number('offsetX','Deslocamento horizontal (%)',0,-25,25),
  number('offsetY','Deslocamento vertical (%)',0,-25,25),
  number('scale','Escala (%)',100,60,120)
];

const assets=[
  {key:'fontFamily',label:'Família da fonte',type:'select',default:'Segoe UI',options:['Segoe UI','Arial','Montserrat','Bebas Neue','Roboto','Impact','Trebuchet MS','Georgia']},
  {key:'fontAsset',label:'Arquivo de fonte importado',type:'asset',kind:'font',default:''},
  {key:'imageAsset',label:'Imagem / logotipo',type:'asset',kind:'image',default:''},
  number('imageX','Imagem X (%)',5,0,100),
  number('imageY','Imagem Y (%)',5,0,100),
  number('imageWidth','Imagem largura (%)',15,1,100),
  number('imageHeight','Imagem altura (%)',15,1,100),
  number('imageOpacity','Imagem opacidade (%)',100,0,100)
];

const animations=[
  {key:'animation',label:'Efeito de Transição',type:'select',default:'slide',options:['none','fade','slide','zoom','rotate','blur_fade','wipe']},
  number('animationInMs','Entrada (ms)',280,0,5000),
  number('animationOutMs','Saída (ms)',280,0,5000),
  {key:'animationEasing',label:'Curva da animação',type:'select',default:'ease-out',options:['linear','ease-in','ease-out','ease-in-out','cubic-bezier(0.16, 1, 0.3, 1)']}
];

const models=definitions.flatMap(([kind,collection,name,fields])=>['horizontal','vertical'].map(orientation=>({
  id:\`fm_\${kind}_\${orientation}\`,
  kind,
  orientation,
  name:\`\${name} · \${orientation==='vertical'?'Vertical':'Horizontal'}\`,
  collection,
  category:name,
  width:orientation==='vertical'?1080:1920,
  height:orientation==='vertical'?1920:1080,
  file:\`biblioteca/\${kind}_\${orientation}.html\`,
  thumbnail:\`biblioteca/thumbnails/\${kind}_\${orientation}.png\`,
  fields:[...fields,...style,...assets,...animations]
})));

function model(id){const found=models.find(m=>m.id===id);if(!found)throw Error('Modelo próprio não encontrado');return found;}
function defaults(id){return Object.fromEntries(model(id).fields.map(f=>[f.key,f.default]));}

function normalizeData(id,raw={},strict=true){
  const m=model(id);
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Campos inválidos');
  if(strict&&Object.keys(raw).some(k=>!m.fields.some(f=>f.key===k)))throw Error('Campo não suportado pelo modelo');
  return Object.fromEntries(m.fields.map(f=>{
    let v=raw[f.key]??f.default;
    if(f.type==='number'){
      v=Number(v);
      if(!Number.isFinite(v)||v<f.min||v>f.max)throw Error(\`\${f.label}: use \${f.min} a \${f.max}\`);
    }else{
      v=String(v);
      if(f.type==='select'&&!f.options.includes(v))throw Error(f.label+': opção inválida');
      if(f.type==='asset'&&v&&!new RegExp('^[a-f0-9]{64}\\\\.'+(f.kind==='font'?'(?:ttf|otf|woff2)':'(?:png|jpg|webp|bmp)')+'$').test(v))throw Error('Importe um arquivo local válido para '+f.label);
      if(f.key==='fontFamily'&&!/^[\\p{L}\\p{N} _-]{1,80}$/u.test(v))throw Error('Nome da família de fonte inválido');
      if(f.type==='color'&&!/^#[a-f\\d]{6}$/i.test(v))throw Error('Cor deve usar #RRGGBB');
      if(v.length>(f.key==='lines'?2000:300)||/[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f]/.test(v))throw Error('Texto inválido ou extenso');
      if(f.key==='lines'&&v.split('\\n').length>12)throw Error('Use até 12 linhas');
    }
    return [f.key,v];
  }));
}

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

function renderGraphic(id,raw={},seconds=0,clock=new Date()){
 const m=model(id),d=normalizeData(id,raw,false),V=m.orientation==='vertical',W=m.width,H=m.height;
 const A=d.accent, S=d.secondary||d.accent, B=d.background, F=d.foreground;
 const shape=d.designStyle||'modern_internet';
 const baseRadius = shape==='swiss_square'?0:shape==='classic_tv'?2:shape==='esports_neon'?4:shape==='corporate_glass'?6:12;

 let out='';
 const rect=(x,y,w,h,color=B,r=baseRadius,opacity=d.opacity/100,stroke=null,strokeW=0)=>{
  const strokeAttr = stroke ? \` stroke="\${stroke}" stroke-width="\${strokeW}"\` : '';
  out+=\`<rect x="\${x}" y="\${y}" width="\${w}" height="\${h}" rx="\${r}" fill="\${color}" opacity="\${opacity}"\${strokeAttr}/>\`;
 };
 const text=(x,y,s,size=48,color=F,weight=600,anchor='start')=>{
  out+=\`<text x="\${x}" y="\${y}" font-size="\${size*d.fontSize/100}" font-weight="\${weight}" fill="\${color}" text-anchor="\${anchor}">\${esc(s)}</text>\`;
 };
 const wrap=(value,x,y,width,size=48,maxLines=3,color=F)=>{
  const chars=Math.max(12,Math.floor(width/(size*d.fontSize/100*.57))),words=String(value).split(/\\s+/);
  let line='',lines=[];
  for(const word of words){
   if((line+' '+word).trim().length>chars&&line){lines.push(line);line=word;}else line=(line+' '+word).trim();
  }
  if(line)lines.push(line);
  if(lines.length>maxLines)lines[maxLines-1]=lines[maxLines-1].replace(/.{1,3}$/,'')+'…';
  lines.slice(0,maxLines).forEach((s,i)=>text(x,y+i*size*1.25,s,size,color));
  return Math.min(maxLines,lines.length)*size*1.25;
 };
 const lines=String(d.lines||'').split('\\n').filter(Boolean).slice(0,12),time=s=>\`\${String(Math.floor(Math.max(0,s)/60)).padStart(2,'0')}:\${String(Math.floor(Math.max(0,s)%60)).padStart(2,'0')}\`;

 if(m.kind==='headline'){
  const y=V?H-520:H-260;
  rect(60,y,W-120,V?400:185,B,baseRadius,d.opacity/100,shape==='esports_neon'?A:null,shape==='esports_neon'?2:0);
  rect(60,y,12,V?400:185,A);
  rect(60,y-52,260,52,A,shape==='swiss_square'?0:4);
  text(80,y-16,d.tag,28,'#ffffff',800);
  wrap(d.title,90,y+65,W-180,V?52:54,V?3:2);
  wrap(d.detail,90,y+(V?315:153),W-180,28,2,S);
 }
 if(m.kind==='lowerthird'){
  const y=V?H-380:H-230;
  rect(60,y,W-120,V?230:160,B,baseRadius,d.opacity/100,shape==='esports_neon'?A:null,shape==='esports_neon'?2:0);
  rect(60,y,W-120,9,A);
  text(90,y+67,d.name,V?50:58,F,800);
  wrap(d.role,90,y+120,W-180,32,2,S);
  rect(60,y-46,Math.min(460,W-120),46,A,shape==='swiss_square'?0:4);
  text(82,y-14,d.location,26,'#ffffff',700);
 }
 if(m.kind==='two_names'){
  const y=V?H-490:H-240,w=V?W-120:(W-180)/2;
  [['nameA','roleA'],['nameB','roleB']].forEach(([n,r],i)=>{
   const x=V?60:60+i*(w+60),yy=y+(V?i*200:0);
   rect(x,yy,w,170,B,baseRadius,d.opacity/100,shape==='esports_neon'?A:null,shape==='esports_neon'?2:0);
   rect(x,yy,8,170,i===0?A:S);
   text(x+32,yy+65,d[n],V?48:50,F,800);
   wrap(d[r],x+32,yy+119,w-64,30,2,i===0?A:S);
  });
 }
 if(m.kind==='breaking'){
  const y=V?H-540:H-250;
  rect(60,y,W-120,V?420:175,B,baseRadius,d.opacity/100,A,2);
  rect(60,y,W-120,V?60:50,A,shape==='swiss_square'?0:4);
  text(90,y+(V?42:35),d.badge,V?32:30,'#ffffff',800);
  wrap(d.title,90,y+(V?120:95),W-180,V?50:46,2);
  rect(60,y+(V?330:135),W-120,V?70:40,'#1e293b',shape==='swiss_square'?0:4);
  text(90,y+(V?375:162),d.ticker,V?26:22,S,600);
 }
 if(m.kind==='quote'){
  const y=V?H-520:H-280,w=W-120;
  rect(60,y,w,V?400:200,B,baseRadius,d.opacity/100,shape==='esports_neon'?A:null,shape==='esports_neon'?2:0);
  rect(60,y,10,V?400:200,A);
  text(90,y+50,'“',V?70:64,A,800);
  wrap(d.quote,130,y+55,w-170,V?40:38,V?3:2);
  rect(90,y+(V?290:135),w-180,2,S);
  text(130,y+(V?335:165),d.author,V?32:30,A,700);
  text(130,y+(V?375:188),d.role,V?24:22,F,400);
 }
 if(['credits','agenda'].includes(m.kind)){
  const x=V?70:440,y=V?330:100,w=V?W-140:1040;
  rect(x,y,w,H-y-(V?250:90),B,baseRadius);
  rect(x,y,w,100,A,shape==='swiss_square'?0:6);
  text(x+36,y+68,d.title,52,'#ffffff',800);
  if(d.date)text(x+36,y+160,d.date,29,S);
  lines.forEach((s,i)=>{
   const [a,...rest]=s.split('|'),yy=y+(d.date?235:190)+i*(V?112:64);
   text(x+36,yy,a.trim(),V?30:28,A);
   wrap(rest.join('|').trim(),x+(V?36:350),yy+(V?45:0),w-(V?72:390),V?38:35,1);
  });
 }
 if(m.kind==='countdown'){
  rect(0,0,W,H,B,0);
  rect(60,H*.31,W-120,8,A);
  wrap(d.title,80,H*.29,W-160,V?64:68,3);
  text(W/2,H*.59,time(d.seconds-seconds),V?190:220,A,800,'middle');
  wrap(d.detail,80,H*.75,W-160,42,3,S);
 }
 if(m.kind==='scoreboard'){
  const x=60,y=60,w=W-120;
  rect(x,y,w,V?280:118,B,baseRadius,d.opacity/100,A,2);
  rect(x,y,w,12,A);
  if(V){
   text(x+35,y+80,d.teamA,42,F,700);
   text(x+w-35,y+80,d.teamB,42,F,700,'end');
   text(W/2,y+190,\`\${d.scoreA}  —  \${d.scoreB}\`,96,A,800,'middle');
   text(W/2,y+250,\`\${d.period}   \${time(d.elapsed+seconds)}\`,30,S,600,'middle');
  }else{
   text(x+30,y+77,d.teamA,45,F,700);
   text(x+w-30,y+77,d.teamB,45,F,700,'end');
   text(W/2,y+80,\`\${d.scoreA}  —  \${d.scoreB}\`,66,A,800,'middle');
   rect(W/2-220,y+126,440,58,B,4);
   text(W/2,y+166,\`\${d.period}   \${time(d.elapsed+seconds)}\`,28,S,600,'middle');
  }
 }
 if(m.kind==='stats'){
  const x=V?60:320,y=V?300:110,w=W-x*2;
  rect(x,y,w,H-y-(V?300:110),B,baseRadius);
  rect(x,y,w,100,A,shape==='swiss_square'?0:4);
  text(x+36,y+67,d.title,50,'#ffffff',800);
  text(x+35,y+170,d.teamA,30,S);
  text(x+w-35,y+170,d.teamB,30,S,600,'end');
  lines.forEach((s,i)=>{
   const [a,k,b]=s.split('|').map(s=>s.trim()),yy=y+260+i*(V?120:95);
   rect(x+24,yy-55,w-48,76,i%2?'#1a3645':B,0,d.opacity/100);
   text(x+46,yy,a,42,A,800);
   text(W/2,yy,k,30,F,500,'middle');
   text(x+w-46,yy,b,42,A,800,'end');
  });
 }
 if(m.kind==='lineup'){
  const x=V?60:280,y=V?240:80,w=W-x*2;
  rect(x,y,w,H-y-(V?240:80),B,baseRadius,d.opacity/100,shape==='esports_neon'?A:null,shape==='esports_neon'?2:0);
  rect(x,y,w,90,A,shape==='swiss_square'?0:4);
  text(x+36,y+60,d.team,46,'#ffffff',800);
  text(x+w-36,y+60,d.formation,36,S,700,'end');
  text(x+36,y+130,d.coach,26,S,600);
  lines.forEach((s,i)=>{
   const [num,...name]=s.split('|'),col=i<4?0:1,row=col?i-4:i,xx=x+36+col*(w/2-20),yy=y+180+row*(V?100:65);
   rect(xx,yy-32,50,42,A,shape==='swiss_square'?0:4);
   text(xx+25,yy,num.trim(),24,'#ffffff',800,'middle');
   text(xx+65,yy,name.join('|').trim(),V?30:26,F,600);
  });
 }
 if(m.kind==='bug'){
  const w=V?400:450,x=W-w-60;
  rect(x,60,w,120,B,baseRadius,d.opacity/100,shape==='esports_neon'?A:null,shape==='esports_neon'?2:0);
  rect(x,60,8,120,A);
  text(x+28,108,d.brand,38,F,800);
  text(x+28,151,d.label,24,A,700);
  text(x+w-20,151,clock.toLocaleTimeString('pt-BR',{hour12:false}),24,S,600,'end');
 }
 if(m.kind==='social'){
  const y=V?H-490:H-285;
  rect(60,y,W-120,V?360:205,B,baseRadius,d.opacity/100,shape==='esports_neon'?A:null,shape==='esports_neon'?2:0);
  rect(60,y,12,V?360:205,A);
  text(92,y+52,d.network,28,A,700);
  text(92,y+116,d.handle,V?60:64,F,800);
  wrap(d.message,92,y+175,V?W-184:W*.55,32,2);
  text(V?92:W-92,y+(V?303:175),d.hashtag,30,S,600,V?'start':'end');
 }
 if(m.kind==='podcast_host'){
  const y=V?H-380:H-220,w=V?W-120:W-160;
  rect(80,y,w,V?250:150,B,baseRadius,d.opacity/100,A,2);
  rect(80,y,w,8,A,shape==='swiss_square'?0:4);
  text(110,y+58,d.name,V?48:52,F,800);
  wrap(d.bio,110,y+105,w-60,V?28:28,1,S);
  rect(110,y+(V?150:112),Math.min(480,w-60),V?40:32,'#27272a',shape==='swiss_square'?0:6);
  text(125,y+(V?178:134),d.handle,V?22:20,A,600);
 }
 if(m.kind==='superchat'){
  const y=V?H-380:H-230,w=V?W-120:720,x=V?60:W-w-80;
  rect(x,y,w,V?260:160,B,baseRadius,d.opacity/100,A,2);
  rect(x,y,w,46,A,shape==='swiss_square'?0:8);
  text(x+24,y+32,d.sender,26,'#ffffff',700);
  text(x+w-24,y+32,d.amount,28,'#ffffff',800,'end');
  wrap(d.message,x+24,y+85,w-48,V?30:28,3,F);
 }
 if(m.kind==='speaker'){
  const y=V?H-420:H-240;
  rect(60,y,W-120,V?280:170,B,baseRadius,d.opacity/100,shape==='esports_neon'?A:null,shape==='esports_neon'?2:0);
  rect(60,y,12,V?280:170,A);
  text(95,y+60,d.name,V?50:52,F,800);
  wrap(d.title,95,y+115,W-190,V?34:32,2,A);
  text(95,y+(V?225:150),d.company,V?26:24,S,500);
 }
 if(m.kind==='product_deal'){
  const y=V?H-420:H-250,w=V?W-120:800,x=V?60:W-w-80;
  rect(x,y,w,V?300:180,B,baseRadius,d.opacity/100,A,2);
  rect(x,y,w,40,A,shape==='swiss_square'?0:8);
  text(x+20,y+28,d.badge,22,'#ffffff',800);
  wrap(d.product,x+24,y+80,w-48,V?36:34,2,F);
  text(x+24,y+(V?200:130),d.price_old,22,'#94a3b8',500);
  text(x+24,y+(V?245:160),d.price_new,34,A,800);
  rect(x+w-240,y+(V?210:125),220,42,'#27272a',shape==='swiss_square'?0:6);
  text(x+w-130,y+(V?240:154),d.coupon,18,S,700,'middle');
 }
 if(m.kind==='fullscreen'){
  rect(0,0,W,H,B,0);
  rect(0,0,W,V?32:20,A);
  text(80,V?200:135,d.tag,38,A);
  const used=wrap(d.title,80,V?300:235,W-160,V?74:78,3);
  lines.forEach((s,i)=>{
   const yy=(V?420:335)+used+i*(V?160:105);
   rect(80,yy-35,12,45,A);
   wrap(s,122,yy,W-220,V?42:44,2,S);
  });
  text(80,H-80,d.footer,28,S);
 }

 const asset=token=>esc(new URL('./assets/'+token,coreURL).href),font=d.fontAsset?'FreeMixCustom'+d.fontAsset.slice(0,16):d.fontFamily;
 const fontStyle=d.fontAsset?\`<style>@font-face{font-family:\${font};src:url("\${asset(d.fontAsset)}")}</style>\`:'';
 const image=d.imageAsset?\`<image href="\${asset(d.imageAsset)}" x="\${d.imageX*W/100}" y="\${d.imageY*H/100}" width="\${d.imageWidth*W/100}" height="\${d.imageHeight*H/100}" opacity="\${d.imageOpacity/100}" preserveAspectRatio="xMidYMid meet"/>\`:'';
 return \`<svg xmlns="http://www.w3.org/2000/svg" width="\${W}" height="\${H}" viewBox="0 0 \${W} \${H}" role="img" aria-label="\${esc(m.name)}">\${fontStyle}<g font-family="\${esc(font)}, sans-serif" transform="translate(\${d.offsetX*W/100} \${d.offsetY*H/100}) translate(\${W/2} \${H/2}) scale(\${d.scale/100}) translate(\${-W/2} \${-H/2})">\${out}\${image}</g></svg>\`;
}

const m=model(document.body.dataset.model),canvas=document.getElementById('graphic');let data=defaults(m.id),started=Date.now(),active=false,timer,timeline={},animation;
document.body.style.width=m.width+'px';document.body.style.height=m.height+'px';
function draw(){canvas.innerHTML=renderGraphic(m.id,data,Math.max(0,Math.floor((Date.now()-started)/1000)));}
function animate(enter){
  animation?.cancel();
  const duration=data[enter?'animationInMs':'animationOutMs'],effect=data.animation;
  const hidden={
    opacity:0,
    transform:effect==='slide'?'translateY(32px)':effect==='zoom'?'scale(.82)':effect==='rotate'?'rotate(-6deg) scale(.92)':effect==='blur_fade'?'scale(.96)':'none',
    filter:effect==='blur_fade'?'blur(12px)':'none'
  };
  const visible={opacity:1,transform:'none',filter:'none'};
  canvas.classList.toggle('visible',enter);
  canvas.style.transition='none';
  if(effect==='none'||!duration){
    canvas.style.opacity=enter?'1':'0';
    canvas.style.transform='none';
    return;
  }
  animation=canvas.animate(enter?[hidden,visible]:[visible,hidden],{duration,easing:data.animationEasing,fill:'both'});
  if(enter&&timeline.animationStartedAt)animation.currentTime=Math.max(0,Date.now()-timeline.animationStartedAt);
}
window.FreeMixGCCompatibility={version:1,clock:true,animation:true,style:true};
window.GC={
  configure(t){timeline=t||{};if(Number.isFinite(timeline.clockStartedAt)&&timeline.clockStartedAt>0)started=timeline.clockStartedAt;data={...data,...timeline.style};draw();},
  update(d){data={...defaults(m.id),...d,...timeline.style};draw();},
  play(d){this.update(d);active=true;animate(true);clearInterval(timer);if(['countdown','scoreboard','bug'].includes(m.kind))timer=setInterval(draw,250);},
  stop(){active=false;animate(false);clearInterval(timer);}
};

})();
`;

fs.writeFileSync(corePath, coreContent, 'utf8');
console.log('core.js atualizado com suporte total a 3 cores, geometrias visuais e transições!');
