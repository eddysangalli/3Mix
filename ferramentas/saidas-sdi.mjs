import {assertSdrOutputRequest} from './saidas-hdr.mjs';
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const coordinates=['redX','redY','greenX','greenY','blueX','blueY','whiteX','whiteY'];
export function sdiConfig(data,sourceUuid,audioSourceUuid='') {
 const hdr=data.hdr===true;
 if(!hdr)assertSdrOutputRequest('SDI',data);
 const config={deviceHash:String(data.deviceHash||''),modeId:Number(data.modeId),keyer:Number(data.keyer??0),audioTrack:Number(data.audioTrack??0),audioSourceUuid,sourceUuid,hdr,autoStart:false};
 if(!config.deviceHash||!Number.isInteger(config.modeId)||![0,1,2].includes(config.keyer)||![0,1,2].includes(config.audioTrack))throw Error('Selecione dispositivo, modo, keyer e áudio SDI válidos');
 if(!hdr)return config;
 if(config.keyer||data.alpha||data.fillKey)throw Error('HDR SDI é opaco; alpha e Fill+Key não são suportados');
 if(!uuidPattern.test(sourceUuid))throw Error('Selecione uma fonte HDR por UUID');
 if(!['pq','hlg'].includes(data.hdrTransfer))throw Error('Escolha PQ ou HLG para SDI HDR');
 const value=data.hdrMetadata;
 if(!value||value.confirmed!==true)throw Error('Confirme os metadados de mastering do conteúdo HDR');
 const metadata={confirmed:true};
 for(const field of [...coordinates,'maxMastering','minMastering','maxContent','maxAverage']){
  const number=value[field];if(typeof number!=='number'||!Number.isFinite(number))throw Error('Metadado HDR inválido: '+field);metadata[field]=number;
 }
 if(coordinates.some(f=>metadata[f]<0||metadata[f]>1)||['red','green','blue','white'].some(c=>metadata[c+'X']+metadata[c+'Y']>1||metadata[c+'Y']<=0)||metadata.maxMastering<1||metadata.maxMastering>10000||metadata.minMastering<.0001||metadata.minMastering>6.5535||metadata.minMastering>=metadata.maxMastering||metadata.maxContent<1||metadata.maxContent>10000||metadata.maxAverage<1||metadata.maxAverage>metadata.maxContent)throw Error('Metadados HDR fora do contrato ST2086/CTA-861');
 return {...config,hdrTransfer:data.hdrTransfer,hdrMetadata:metadata};
}
