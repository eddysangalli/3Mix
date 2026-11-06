// Destination-only SRT format contract. No shared/global video settings are altered.
import {assertSdrOutputRequest} from './saidas-hdr.mjs';
export function srtDestinationOptions(data,before={},capabilities={}){
 assertSdrOutputRequest('SRT',data);
 const chroma=data.chroma===undefined?(before.chroma??'420'):data.chroma,alphaMode=data.alphaMode===undefined?(before.alphaMode??'none'):data.alphaMode;
 if(!['420','444'].includes(chroma)||!['none','packed','fill','key'].includes(alphaMode))throw Error('Selecione 4:2:0/4:4:4 e um modo de alpha válido');
 if(chroma==='420'&&alphaMode==='none')return{chroma,alphaMode};
 const protocol=data.protocol??before.protocol??'auto',server=String(data.server??before.server??''),effective=protocol==='auto'?server.split(':')[0].toLowerCase():protocol,encoder=data.encoder??before.encoder??'obs_x264',width=Number(data.width??before.width);
 if(effective!=='srt')throw Error('4:4:4 e cor + máscara exigem um destino SRT');
 if(['fill','key'].includes(alphaMode)){
  if(!capabilities.srtSeparateAlphaSupported)throw Error('Este motor não oferece Fill/Key separado; instale um pacote 3Mix compatível em janela de manutenção antes de selecionar este formato');
  if(chroma!=='420')throw Error('Fill/Key separado usa 4:2:0 para compatibilidade');
  if(encoder!=='obs_x264')throw Error('Fill/Key separado usa x264 H.264');
  return {chroma,alphaMode};
 }
 if(chroma==='444'&&!capabilities.srtChroma444Supported)throw Error('Este motor não oferece a saída SRT 4:4:4; atualize o motor antes de selecionar este formato');
 if(encoder!==(capabilities.srt444Encoder||'obs_x264'))throw Error('SRT 4:4:4 usa somente x264 H.264 nesta versão; selecione o codificador x264');
 if(alphaMode==='packed'){
  if(chroma==='420'&&!capabilities.srtPackedAlpha420Supported)throw Error('Este motor não oferece cor + máscara em 4:2:0; atualize o motor');
  if(!capabilities.srtPackedAlphaSupported)throw Error('Este motor não oferece cor + máscara para SRT');
  const max=Number(capabilities.srtPackedAlphaMaxWidth)||1920;if(!Number.isInteger(width)||width<240||width>max)throw Error('Cor + máscara: a largura lógica deve ser de 240 até '+max+' pixels; o transporte usa o dobro da largura');
 }
 return{chroma,alphaMode};
}
