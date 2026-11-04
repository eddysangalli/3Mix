// Decodificação mínima de PNG/BMP para amostragem de cor (conta-gotas) e verificação de alfa.
// Não é um decodificador de propósito geral: aceita exatamente o que o motor 3Mix entrega em
// GetSourceScreenshot (8 bits por canal, sem entrelaçamento). Qualquer outra variante é recusada
// com erro explícito em vez de produzir cor errada silenciosamente.
import {inflateSync} from 'node:zlib';

const PNG_SIG=Buffer.from([137,80,78,71,13,10,26,10]);

export function decodePng(buffer){
 if(!Buffer.isBuffer(buffer)||buffer.length<8||!buffer.subarray(0,8).equals(PNG_SIG))throw Error('PNG inválido');
 let offset=8,width=0,height=0,bitDepth=0,colorType=0,interlace=0,plte=null,trns=null;
 const idat=[];
 while(offset+8<=buffer.length){
  const length=buffer.readUInt32BE(offset),type=buffer.toString('ascii',offset+4,offset+8),data=buffer.subarray(offset+8,offset+8+length);
  if(data.length!==length)throw Error('PNG truncado');
  if(type==='IHDR'){if(length!==13)throw Error('IHDR inválido');width=data.readUInt32BE(0);height=data.readUInt32BE(4);bitDepth=data[8];colorType=data[9];interlace=data[12];if(data[10]!==0||data[11]!==0)throw Error('Compressão PNG não suportada');}
  else if(type==='PLTE')plte=Buffer.from(data);
  else if(type==='tRNS')trns=Buffer.from(data);
  else if(type==='IDAT')idat.push(data);
  else if(type==='IEND')break;
  offset+=12+length;
 }
 if(!width||!height)throw Error('PNG sem dimensões');
 if(bitDepth!==8)throw Error('PNG com profundidade '+bitDepth+' não suportada');
 if(interlace!==0)throw Error('PNG entrelaçado não suportado');
 const channels=colorType===6?4:colorType===2?3:colorType===0?1:colorType===4?2:colorType===3?1:0;
 if(!channels)throw Error('PNG com tipo de cor '+colorType+' não suportado');
 if(colorType===3&&!plte)throw Error('PNG indexado sem paleta');
 if(!idat.length)throw Error('PNG sem dados de imagem');
 let raw;
 try{raw=inflateSync(Buffer.concat(idat));}catch(e){throw Error('PNG com dados comprimidos inválidos: '+e.message);}
 const stride=width*channels,bpp=channels,expected=height*(stride+1);
 if(raw.length<expected)throw Error('PNG incompleto');
 const pixels=Buffer.alloc(stride*height);
 let prev=Buffer.alloc(stride);
 for(let y=0;y<height;y++){
  const filter=raw[y*(stride+1)],line=raw.subarray(y*(stride+1)+1,(y+1)*(stride+1)),out=pixels.subarray(y*stride,(y+1)*stride);
  for(let x=0;x<stride;x++){
   const a=x>=bpp?out[x-bpp]:0,b=prev[x],c=x>=bpp?prev[x-bpp]:0,value=line[x];
   let predicted;
   if(filter===0)predicted=0;
   else if(filter===1)predicted=a;
   else if(filter===2)predicted=b;
   else if(filter===3)predicted=(a+b)>>1;
   else if(filter===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);predicted=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
   else throw Error('Filtro PNG desconhecido: '+filter);
   out[x]=(value+predicted)&0xff;
  }
  prev=out;
 }
 // Converte para RGBA8 uniforme
 const rgba=Buffer.alloc(width*height*4);
 for(let i=0,j=0;i<width*height;i++,j+=channels){
  if(colorType===6){rgba[i*4]=pixels[j];rgba[i*4+1]=pixels[j+1];rgba[i*4+2]=pixels[j+2];rgba[i*4+3]=pixels[j+3];}
  else if(colorType===2){rgba[i*4]=pixels[j];rgba[i*4+1]=pixels[j+1];rgba[i*4+2]=pixels[j+2];rgba[i*4+3]=255;}
  else if(colorType===0){rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=pixels[j];rgba[i*4+3]=255;}
  else if(colorType===4){rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=pixels[j];rgba[i*4+3]=pixels[j+1];}
  else if(colorType===3){const n=pixels[j];if(n*3+2>=plte.length)throw Error('Índice de paleta fora da tabela');rgba[i*4]=plte[n*3];rgba[i*4+1]=plte[n*3+1];rgba[i*4+2]=plte[n*3+2];rgba[i*4+3]=trns&&n<trns.length?trns[n]:255;}
 }
 return {width,height,channels:4,data:rgba};
}

export function decodeBmp(buffer){
 if(!Buffer.isBuffer(buffer)||buffer.length<54||buffer[0]!==0x42||buffer[1]!==0x4d)throw Error('BMP inválido');
 const pixelOffset=buffer.readUInt32LE(10),headerSize=buffer.readUInt32LE(14);
 if(headerSize<40)throw Error('Cabeçalho BMP não suportado');
 const width=buffer.readInt32LE(18),rawHeight=buffer.readInt32LE(22),planes=buffer.readUInt16LE(26),bits=buffer.readUInt16LE(28),compression=buffer.readUInt32LE(30);
 if(planes!==1)throw Error('BMP com planos inválidos');
 if(compression!==0)throw Error('BMP comprimido não suportado');
 if(![24,32].includes(bits))throw Error('BMP de '+bits+' bits não suportado');
 if(width<=0||rawHeight===0)throw Error('Dimensões BMP inválidas');
 const height=Math.abs(rawHeight),topDown=rawHeight<0,rowSize=Math.floor((bits*width+31)/32)*4;
 if(pixelOffset+rowSize*height>buffer.length)throw Error('BMP truncado');
 const rgba=Buffer.alloc(width*height*4),bytesPerPixel=bits/8;
 for(let y=0;y<height;y++){
  const row=pixelOffset+rowSize*(topDown?y:height-1-y);
  for(let x=0;x<width;x++){
   const p=row+x*bytesPerPixel,d=(y*width+x)*4;
   rgba[d]=buffer[p+2];rgba[d+1]=buffer[p+1];rgba[d+2]=buffer[p];rgba[d+3]=bytesPerPixel===4?buffer[p+3]:255;
  }
 }
 return {width,height,channels:4,data:rgba};
}

// Média de uma vizinhança quadrada. Amostrar um único pixel de vídeo comprimido devolve artefato
// de compressão, não a cor do fundo; a média reduz esse ruído.
export function averageColor(image,px,py,radius=2){
 const x=Math.max(0,Math.min(image.width-1,Math.round(px))),y=Math.max(0,Math.min(image.height-1,Math.round(py))),r=Math.max(0,Math.min(16,Math.floor(radius)));
 let sr=0,sg=0,sb=0,n=0;
 for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
  const sx=x+dx,sy=y+dy;if(sx<0||sy<0||sx>=image.width||sy>=image.height)continue;
  const p=(sy*image.width+sx)*4;sr+=image.data[p];sg+=image.data[p+1];sb+=image.data[p+2];n++;
 }
 if(!n)throw Error('Amostra fora do quadro');
 return {r:Math.round(sr/n),g:Math.round(sg/n),b:Math.round(sb/n),pixels:n};
}

export function alphaStats(image){
 let transparent=0,opaque=0,partial=0,minA=255,maxA=0;
 for(let p=3;p<image.data.length;p+=4){const a=image.data[p];if(a<minA)minA=a;if(a>maxA)maxA=a;if(a===0)transparent++;else if(a===255)opaque++;else partial++;}
 return {transparent,opaque,partial,total:image.data.length/4,minA,maxA};
}

// Formato de cor do filtro oficial: bits 0-7 R, 8-15 G, 16-23 B (vec4_from_rgba do libobs).
export const rgbToKeyColor=(r,g,b)=>((b&0xff)<<16)|((g&0xff)<<8)|(r&0xff);
export const keyColorToHex=value=>'#'+[value&0xff,(value>>8)&0xff,(value>>16)&0xff].map(v=>v.toString(16).padStart(2,'0')).join('');
export const hexToKeyColor=hex=>{const m=/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(String(hex||''));if(!m)throw Error('Cor hexadecimal inválida');return rgbToKeyColor(parseInt(m[1],16),parseInt(m[2],16),parseInt(m[3],16));};
