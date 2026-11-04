import {model,normalizeData} from './modelos.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

// This exact SVG is the live browser renderer and the thumbnail source.
export function renderGraphic(id,raw={},seconds=0,clock=new Date()){
 const m=model(id),d=normalizeData(id,raw,false),V=m.orientation==='vertical',W=m.width,H=m.height;
 const A=d.accent, S=d.secondary||d.accent, B=d.background, F=d.foreground;
 const shape=d.designStyle||'modern_internet';
 const baseRadius = shape==='swiss_square'?0:shape==='classic_tv'?2:shape==='esports_neon'?4:shape==='corporate_glass'?8:shape==='pill_capsule'?40:shape==='cyber_bevel'?2:shape==='minimal_flat'?1:12;

 let out='';
 const rect=(x,y,w,h,color=B,r=baseRadius,opacity=d.opacity/100,stroke=null,strokeW=0)=>{
  const strokeAttr = stroke ? ` stroke="${stroke}" stroke-width="${strokeW}"` : '';
  out+=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${color}" opacity="${opacity}"${strokeAttr}/>`;
 };
 const text=(x,y,s,size=48,color=F,weight=600,anchor='start')=>{
  out+=`<text x="${x}" y="${y}" font-size="${size*d.fontSize/100}" font-weight="${weight}" letter-spacing="${d.letterSpacing}" fill="${color}" text-anchor="${anchor}">${esc(s)}</text>`;
 };
 const wrap=(value,x,y,width,size=48,maxLines=3,color=F)=>{
  const chars=Math.max(12,Math.floor(width/(size*d.fontSize/100*.57))),words=String(value).split(/\s+/);
  let line='',lines=[];
  for(const word of words){
   if((line+' '+word).trim().length>chars&&line){lines.push(line);line=word;}else line=(line+' '+word).trim();
  }
  if(line)lines.push(line);
  if(lines.length>maxLines)lines[maxLines-1]=lines[maxLines-1].replace(/.{1,3}$/,'')+'…';
  lines.slice(0,maxLines).forEach((s,i)=>text(x,y+i*size*1.25,s,size,color));
  return Math.min(maxLines,lines.length)*size*1.25;
 };
 const lines=String(d.lines||'').split('\n').filter(Boolean).slice(0,12),time=s=>`${String(Math.floor(Math.max(0,s)/60)).padStart(2,'0')}:${String(Math.floor(Math.max(0,s)%60)).padStart(2,'0')}`;

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
   text(W/2,y+190,`${d.scoreA}  —  ${d.scoreB}`,96,A,800,'middle');
   text(W/2,y+250,`${d.period}   ${time(d.elapsed+seconds)}`,30,S,600,'middle');
  }else{
   text(x+30,y+77,d.teamA,45,F,700);
   text(x+w-30,y+77,d.teamB,45,F,700,'end');
   text(W/2,y+80,`${d.scoreA}  —  ${d.scoreB}`,66,A,800,'middle');
   rect(W/2-220,y+126,440,58,B,4);
   text(W/2,y+166,`${d.period}   ${time(d.elapsed+seconds)}`,28,S,600,'middle');
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
 if(m.kind==='church_verse'){
  const y=V?H-480:H-260,w=V?W-120:W-160,x=V?60:80;
  rect(x,y,w,V?380:190,B,baseRadius,d.opacity/100,shape==='esports_neon'?A:null,shape==='esports_neon'?2:0);
  rect(x,y,10,V?380:190,A);
  rect(x,y-44,Math.min(380,w),44,A,shape==='swiss_square'?0:4);
  text(x+20,y-14,d.book,26,'#ffffff',800);
  wrap(d.verse,x+36,y+60,w-72,V?36:34,V?4:2,F);
  text(x+36,y+(V?330:155),d.version,22,S,600);
 }
 if(m.kind==='breaking_ticker'){
  const y=V?H-320:H-140,w=W-120;
  rect(60,y,w,V?220:100,B,baseRadius,d.opacity/100,A,2);
  rect(60,y,V?180:160,V?80:55,A,shape==='swiss_square'?0:4);
  text(V?150:140,y+(V?52:38),d.badge,V?30:26,'#ffffff',900,'middle');
  wrap(d.title,V?260:240,y+(V?52:38),w-(V?280:260),V?32:30,1,F);
  rect(60,y+(V?90:55),w,V?110:45,'#0a0f1d',shape==='swiss_square'?0:4);
  text(85,y+(V?155:85),`▶  ${d.ticker}`,V?24:22,S,600);
 }
 if(m.kind==='election_poll'){
  const x=V?60:280,y=V?260:90,w=W-x*2;
  rect(x,y,w,H-y-(V?260:90),B,baseRadius,d.opacity/100,shape==='esports_neon'?A:null,shape==='esports_neon'?2:0);
  rect(x,y,w,80,A,shape==='swiss_square'?0:4);
  text(x+30,y+52,d.title,40,'#ffffff',800);
  const pA=Number(d.pctA)||0, pB=Number(d.pctB)||0, pC=Number(d.pctC)||0;
  const cands=[[d.candA,pA,A],[d.candB,pB,S],[d.candC,pC,'#64748b']];
  cands.forEach(([name,pct,color],i)=>{
   const yy=y+140+i*(V?130:95);
   text(x+30,yy,name,V?28:26,F,700);
   text(x+w-30,yy,`${pct}%`,V?32:30,color,800,'end');
   rect(x+30,yy+15,w-60,V?24:18,'#1e293b',4);
   rect(x+30,yy+15,(w-60)*(pct/100),V?24:18,color,4);
  });
  text(x+30,H-y-(V?290:120),d.source,20,S,500);
 }
 if(m.kind==='weather'){
  const y=V?H-420:H-220,w=V?W-120:720,x=V?60:W-w-80;
  rect(x,y,w,V?320:170,B,baseRadius,d.opacity/100,shape==='esports_neon'?A:null,shape==='esports_neon'?2:0);
  rect(x,y,10,V?320:170,A);
  text(x+30,y+55,d.city,V?36:34,F,800);
  text(x+w-30,y+70,d.temp,V?76:68,A,900,'end');
  text(x+30,y+(V?110:95),d.condition,V?26:24,S,600);
  text(x+30,y+(V?155:130),d.min_max,V?24:22,F,500);
  rect(x+30,y+(V?190:142),w-60,2,'#2e3744');
  text(x+30,y+(V?240:162),d.forecast,V?22:20,S,400);
 }
 if(m.kind==='breaking_banner'){
  const y=V?H-340:H-160,w=W;
  rect(0,y,w,V?340:160,B,0,d.opacity/100);
  rect(0,y,w,6,A);
  rect(0,y+6,V?260:220,V?60:48,A,0);
  text(V?130:110,y+(V?46:38),d.badge,V?26:24,'#ffffff',900,'middle');
  text(W-40,y+(V?46:38),d.time,V?22:20,S,700,'end');
  wrap(d.title,V?40:60,y+(V?135:95),W-(V?80:120),V?42:38,2,F);
  text(V?40:60,y+(V?260:136),`• ${d.subtext}`,V?24:22,S,500);
 }
 if(m.kind==='lowerthird_chanfro'){
  const y=V?H-380:H-230,w=V?W-120:960,x=V?60:80;
  rect(x,y,w,V?260:160,B,shape==='pill_capsule'?30:0,d.opacity/100,A,2);
  rect(x,y,14,V?260:160,A);
  rect(x+14,y,V?280:240,36,A,0);
  text(x+28,y+26,'3MIX ESPORTS',18,'#000000',900);
  text(x+36,y+80,d.name,V?48:46,F,900);
  wrap(d.team,x+36,y+125,w-72,V?28:26,1,A);
  rect(x+36,y+(V?170:138),w-72,1,'#334155');
  text(x+36,y+(V?215:154),d.stats,V?22:20,S,600);
 }
 if(m.kind==='lowerthird_pill'){
  const y=V?H-340:H-210,w=V?W-120:880,x=V?60:80;
  rect(x,y,w,V?220:140,B,shape==='swiss_square'?0:45,d.opacity/100,S,1.5);
  rect(x+16,y+16,V?60:50,V?60:50,A,shape==='swiss_square'?0:25);
  text(x+(V?46:41),y+(V?54:48),'●',V?26:24,'#ffffff',900,'middle');
  text(x+(V?96:82),y+(V?56:52),d.name,V?44:42,F,800);
  rect(x+w-180,y+20,160,32,A,16);
  text(x+w-100,y+42,d.tag,16,'#ffffff',800,'middle');
  wrap(d.specialty,x+(V?96:82),y+(V?115:95),w-(V?120:100),V?26:24,2,S);
 }
 if(m.kind==='lowerthird_glass'){
  const y=V?H-360:H-220,w=V?W-120:920,x=V?60:80;
  rect(x,y,w,V?240:150,'rgba(18,24,38,0.92)',baseRadius,d.opacity/100,'rgba(255,255,255,0.25)',1);
  rect(x,y,w,4,A);
  text(x+40,y+58,d.name,V?48:46,F,800);
  text(x+w-40,y+52,d.company,V?20:18,S,600,'end');
  wrap(d.title,x+40,y+105,w-80,V?30:26,2,A);
 }
 if(m.kind==='crypto_ticker'){
  const y=V?H-260:H-110,w=W;
  rect(0,y,w,V?260:110,B,0,d.opacity/100);
  rect(0,y,w,4,A);
  rect(0,y+4,V?240:200,V?50:42,A,0);
  text(V?120:100,y+(V?38:32),d.title,V?22:20,'#ffffff',800,'middle');
  if(V){
   text(40,y+90,d.asset1,24,'#22c55e',700);
   text(40,y+135,d.asset2,24,'#22c55e',700);
   text(40,y+180,d.asset3,24,'#38bdf8',700);
   text(40,y+225,d.asset4,24,'#f43f5e',700);
  } else {
   text(240,y+32,`  ${d.asset1}    |    ${d.asset2}    |    ${d.asset3}    |    ${d.asset4}`,22,F,600);
   text(60,y+82,'DADOS DE MERCADO EM TEMPO REAL • ATUALIZAÇÃO CONTÍNUA VIA 3MIX DATA ENGINE',16,S,500);
  }
 }
 if(m.kind==='poll_bar'){
  const y=V?H-440:H-260,w=V?W-120:860,x=V?60:W-w-80;
  rect(x,y,w,V?320:200,B,baseRadius,d.opacity/100,A,1.5);
  rect(x,y,w,44,A,shape==='swiss_square'?0:6);
  text(x+24,y+30,d.question,V?22:20,'#ffffff',800);
  const pA=Number(d.pctA)||50, pB=Number(d.pctB)||50;
  text(x+24,y+85,d.optA,V?24:22,F,700);
  text(x+w-24,y+85,`${pA}%`,V?26:24,A,800,'end');
  rect(x+24,y+98,w-48,16,'#1e293b',8);
  rect(x+24,y+98,(w-48)*(pA/100),16,A,8);
  text(x+24,y+(V?170:145),d.optB,V?24:22,F,700);
  text(x+w-24,y+(V?170:145),`${pB}%`,V?26:24,S,800,'end');
  rect(x+24,y+(V?185:158),w-48,16,'#1e293b',8);
  rect(x+24,y+(V?185:158),(w-48)*(pB/100),16,S,8);
 }
 if(m.kind==='gaming_esports'){
  const y=V?60:50,w=V?W-120:880,x=V?60:(W-w)/2;
  rect(x,y,w,V?220:130,B,shape==='pill_capsule'?20:4,d.opacity/100,A,2);
  rect(x,y,w,32,'#0f172a',0);
  text(x+w/2,y+22,`${d.map} • ${d.status}`,16,S,700,'middle');
  text(x+40,y+80,d.teamA,V?36:34,F,900);
  rect(x+w/2-60,y+45,120,54,A,shape==='swiss_square'?0:6);
  text(x+w/2,y+84,`${d.scoreA} : ${d.scoreB}`,36,'#000000',900,'middle');
  text(x+w-40,y+80,d.teamB,V?36:34,F,900,'end');
 }
 if(m.kind==='speaker_bio'){
  const x=V?60:W-540,y=V?H-560:100,w=V?W-120:460;
  rect(x,y,w,V?460:520,B,baseRadius,d.opacity/100,A,1.5);
  rect(x,y,w,10,A);
  text(x+30,y+55,d.name,V?34:32,F,800);
  text(x+30,y+95,d.role,V?24:22,A,600);
  rect(x+30,y+115,w-60,1,'#334155');
  const bioLines=String(d.bio||'').split('\n').slice(0,5);
  bioLines.forEach((l,i)=>{
   text(x+30,y+155+i*(V?48:42),`• ${l.trim()}`,V?22:20,F,400);
  });
 }
 if(m.kind==='side_panel_info'){
  const x=V?60:W-520,y=V?H-540:80,w=V?W-120:440;
  rect(x,y,w,V?460:580,B,baseRadius,d.opacity/100,S,1.5);
  rect(x,y,w,52,A,shape==='swiss_square'?0:6);
  text(x+24,y+36,d.title,26,'#ffffff',800);
  text(x+24,y+110,d.item1,22,F,600);
  text(x+24,y+180,d.item2,22,F,600);
  text(x+24,y+250,d.item3,22,F,600);
  rect(x+24,y+(V?360:480),w-48,1,'#334155');
  text(x+24,y+(V?400:520),d.footer,18,S,500);
 }
 if(m.kind==='corner_bug_pro'){
  const x=V?W-380:W-340,y=V?60:50,w=V?320:280,h=90;
  rect(x,y,w,h,B,shape==='swiss_square'?0:10,d.opacity/100,A,1);
  rect(x,y,8,h,A);
  text(x+24,y+38,d.brand,28,F,900);
  text(x+w-20,y+38,d.temp,24,A,800,'end');
  text(x+24,y+72,`${d.location} • ${d.badge}`,18,S,600);
 }
 if(m.kind==='music_nowplaying'){
  const y=V?H-320:H-180,w=V?W-120:640,x=V?60:80;
  rect(x,y,w,V?220:120,B,shape==='pill_capsule'?30:8,d.opacity/100,A,1.5);
  rect(x+16,y+16,V?60:48,V?60:48,A,shape==='pill_capsule'?24:4);
  text(x+(V?46:40),y+(V?56:48),'♫',V?32:28,'#000000',900,'middle');
  text(x+(V?96:80),y+46,d.track,V?30:28,F,800);
  text(x+(V?96:80),y+82,`${d.artist} • ${d.album}`,V?22:20,S,500);
  text(x+w-24,y+46,d.duration,18,A,700,'end');
 }
 if(m.kind==='topbar_headline'){
  rect(0,0,W,V?120:60,B,0,d.opacity/100);
  rect(0,V?116:56,W,4,A);
  rect(0,0,V?260:200,V?116:56,A,0);
  text(V?130:100,V?70:38,d.category,V?24:20,'#ffffff',900,'middle');
  wrap(d.title,V?290:230,V?50:38,W-(V?340:480),V?28:22,1,F);
  text(W-40,V?70:38,d.source,V?20:18,S,600,'end');
 }
 if(m.kind==='versus_match'){
  const y=V?H-540:H-280,w=V?W-120:1040,x=V?60:(W-w)/2;
  rect(x,y,w,V?440:210,B,baseRadius,d.opacity/100,A,2);
  rect(x,y,w,40,A,0);
  text(x+w/2,y+28,d.title,22,'#ffffff',900,'middle');
  text(x+30,y+90,d.fighterA,V?34:32,F,800);
  text(x+30,y+128,d.recordA,V?22:20,S,600);
  rect(x+w/2-30,y+80,60,40,'#ef4444',4);
  text(x+w/2,y+108,'VS',22,'#ffffff',900,'middle');
  text(x+w-30,y+90,d.fighterB,V?34:32,F,800,'end');
  text(x+w-30,y+128,d.recordB,V?22:20,S,600,'end');
  rect(x+30,y+(V?260:160),w-60,1,'#334155');
  text(x+w/2,y+(V?320:190),d.category,20,A,700,'middle');
 }
 if(m.kind==='product_card_shop'){
  const x=V?60:W-540,y=V?H-540:120,w=V?W-120:460;
  rect(x,y,w,V?440:460,B,baseRadius,d.opacity/100,A,2);
  rect(x,y,w,46,A,shape==='swiss_square'?0:6);
  text(x+20,y+32,d.badge,22,'#ffffff',900);
  rect(x+w-120,y+10,100,26,'#ef4444',13);
  text(x+w-70,y+28,d.discount,16,'#ffffff',900,'middle');
  wrap(d.product,x+24,y+95,w-48,V?32:28,2,F);
  text(x+24,y+(V?210:190),d.price,42,A,900);
  rect(x+24,y+(V?260:240),w-48,V?120:140,'#1e293b',8);
  text(x+w/2,y+(V?330:315),d.code,18,S,700,'middle');
 }
 if(m.kind==='citation_quote'){
  const y=V?H-520:H-300,w=V?W-120:960,x=V?60:(W-w)/2;
  rect(x,y,w,V?420:220,B,baseRadius,d.opacity/100,S,1.5);
  text(x+30,y+70,'“',72,A,900);
  wrap(d.quote,x+90,y+65,w-130,V?36:34,3,F);
  rect(x+90,y+(V?280:150),w-140,2,A);
  text(x+90,y+(V?330:185),d.author,26,A,800);
  text(x+90,y+(V?370:208),d.context,20,S,500);
 }
 if(m.kind==='podcast_minimal'){
  const y=V?H-320:H-180,w=V?W-120:800,x=V?60:80;
  rect(x,y,w,V?220:110,B,shape==='swiss_square'?0:8,d.opacity/100);
  rect(x,y,4,V?220:110,A);
  text(x+30,y+45,d.name,V?40:36,F,800);
  text(x+30,y+85,`${d.role}  |  ${d.social}`,V?24:22,A,600);
 }
 if(m.kind==='stats_versus'){
  const y=V?H-520:H-260,w=V?W-120:960,x=V?60:(W-w)/2;
  rect(x,y,w,V?420:200,B,baseRadius,d.opacity/100,A,1.5);
  rect(x,y,w,46,A,0);
  text(x+30,y+32,d.playerA,22,'#ffffff',800);
  text(x+w-30,y+32,d.playerB,22,'#ffffff',800,'end');
  [d.metric1,d.metric2,d.metric3].forEach((mStr,i)=>{
   const yy=y+90+i*(V?85:40);
   text(x+w/2,yy,mStr,V?24:22,F,600,'middle');
   rect(x+40,yy+10,w-80,1,'#334155');
  });
 }
 if(m.kind==='social_card_highlight'){
  const y=V?H-480:H-260,w=V?W-120:840,x=V?60:80;
  rect(x,y,w,V?380:190,B,baseRadius,d.opacity/100,A,2);
  rect(x,y,w,42,A,shape==='swiss_square'?0:6);
  text(x+20,y+28,`${d.network} • ${d.tag}`,20,'#ffffff',800);
  text(x+24,y+80,d.author,26,F,800);
  text(x+24,y+110,d.handle,20,S,600);
  wrap(d.message,x+24,y+145,w-48,V?28:24,3,F);
 }
 if(m.kind==='countdown_circle'){
  const y=V?H-440:H-240,w=V?W-120:740,x=V?60:(W-w)/2;
  rect(x,y,w,V?340:170,B,baseRadius,d.opacity/100,A,2);
  text(x+w/2,y+42,d.title,24,A,800,'middle');
  text(x+w/2,y+115,time(d.seconds||180),64,F,900,'middle');
  text(x+w/2,y+(V?260:150),d.subtitle,20,S,500,'middle');
 }
 if(m.kind==='church_service'){
  const y=V?H-460:H-240,w=V?W-120:940,x=V?60:80;
  rect(x,y,w,V?360:170,B,baseRadius,d.opacity/100,A,1.5);
  rect(x,y,10,V?360:170,A);
  rect(x,y-42,Math.min(420,w),42,A,shape==='swiss_square'?0:4);
  text(x+20,y-12,d.title,24,'#ffffff',800);
  text(x+36,y+56,d.preacher,V?46:44,F,800);
  text(x+36,y+100,d.theme,V?28:26,A,600);
  text(x+36,y+(V?220:140),d.church,V?22:20,S,500);
 }

 const asset=token=>esc(new URL('./assets/'+token,import.meta.url).href),font=d.fontAsset?'FreeMixCustom'+d.fontAsset.slice(0,16):d.fontFamily;
 const fontStyle=d.fontAsset?`<style>@font-face{font-family:${font};src:url("${asset(d.fontAsset)}")}</style>`:'';
 const image=d.imageAsset?`<image href="${asset(d.imageAsset)}" x="${d.imageX*W/100}" y="${d.imageY*H/100}" width="${d.imageWidth*W/100}" height="${d.imageHeight*H/100}" opacity="${d.imageOpacity/100}" preserveAspectRatio="xMidYMid meet"/>`:'';
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(m.name)}">${fontStyle}<g font-family="${esc(font)}, sans-serif" transform="translate(${d.offsetX*W/100} ${d.offsetY*H/100}) translate(${W/2} ${H/2}) scale(${d.scale/100}) translate(${-W/2} ${-H/2})">${out}${image}</g></svg>`;
}
