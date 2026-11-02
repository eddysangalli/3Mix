// Raw VISCA frames. Transport and hardware qualification are separate.
const integer=(v,min,max)=>{if(!Number.isInteger(v)||v<min||v>max)throw Error('Valor VISCA fora do intervalo');return v;};
const frame=(address,...bytes)=>Buffer.from([0x80|integer(address,1,7),...bytes,0xff]);
export const visca={
 move(address,pan,tilt,panSpeed=1,tiltSpeed=1){
  integer(pan,-1,1);integer(tilt,-1,1);
  return frame(address,1,6,1,integer(panSpeed,1,24),integer(tiltSpeed,1,20),pan<0?1:pan>0?2:3,tilt>0?1:tilt<0?2:3);
 },
 zoom(address,direction,speed=0){integer(direction,-1,1);integer(speed,0,7);return frame(address,1,4,7,direction===0?0:(direction>0?0x20:0x30)|speed);},
 focus(address,direction,speed=0){integer(direction,-1,1);integer(speed,0,7);return frame(address,1,4,8,direction===0?0:(direction>0?0x20:0x30)|speed);},
 focusMode(address,auto){if(typeof auto!=='boolean')throw Error('Modo de foco inválido');return frame(address,1,4,0x38,auto?2:3);},
 home(address){return frame(address,1,6,4);},
 preset(address,number,save=false){integer(number,0,127);if(typeof save!=='boolean')throw Error('Operação de preset inválida');return frame(address,1,4,0x3f,save?1:2,number);},
 powerInquiry(address){return frame(address,9,4,0);}
};

// Imaging commands. Value units (f-stop, dB, 1/shutter) vary per manufacturer and are
// NOT invented here: callers get/set a raw 0..65535 register and must mark it
// rangeConfirmed:false until validated against real hardware (task requirement: never
// simulate functioning the device doesn't confirm).
const toNibbles=v=>{integer(v,0,0xffff);return [(v>>12)&0xf,(v>>8)&0xf,(v>>4)&0xf,v&0xf];};
const fromNibbles=(bytes,offset=0)=>((bytes[offset]&0xf)<<12)|((bytes[offset+1]&0xf)<<8)|((bytes[offset+2]&0xf)<<4)|(bytes[offset+3]&0xf);
Object.assign(visca,{
 wbMode(address,mode){const byte={auto:0,indoor:1,outdoor:2,onePush:3,manual:5}[mode];if(byte===undefined)throw Error('Modo de white balance inválido');return frame(address,1,4,0x35,byte);},
 wbOnePushTrigger(address){return frame(address,1,4,0x10,5);},
 aeMode(address,mode){const byte={full_auto:0,manual:3,shutterPriority:0x0a,irisPriority:0x0b,bright:0x0d}[mode];if(byte===undefined)throw Error('Modo de exposição inválido');return frame(address,1,4,0x39,byte);},
 irisDirect(address,value){return frame(address,1,4,0x4b,...toNibbles(value));},
 gainDirect(address,value){return frame(address,1,4,0x4c,...toNibbles(value));},
 shutterDirect(address,value){return frame(address,1,4,0x4a,...toNibbles(value));},
 inquiryZoom(address){return frame(address,9,4,0x47);},
 inquiryFocus(address){return frame(address,9,4,0x48);},
 inquiryIris(address){return frame(address,9,4,0x4b);},
 inquiryGain(address){return frame(address,9,4,0x4c);},
 inquiryShutter(address){return frame(address,9,4,0x4a);},
 inquiryWb(address){return frame(address,9,4,0x35);}
});
export const decodeInquiryValue=data=>fromNibbles(Buffer.isBuffer(data)?data:Buffer.from(data));

export function parseViscaReply(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<3||bytes.length>32||bytes.at(-1)!==255||(bytes[0]&15)!==0)throw Error('Resposta VISCA inválida');
 const type=bytes[1]&0xf0,socket=bytes[1]&15;
 if(type===0x40&&bytes.length===3)return {kind:'ack',socket};
 if(type===0x50)return {kind:bytes.length===3?'completion':'inquiry',socket,data:[...bytes.subarray(2,-1)]};
 if(type===0x60&&bytes.length===4)return {kind:'error',socket,code:bytes[2]};
 throw Error('Resposta VISCA desconhecida');
}
