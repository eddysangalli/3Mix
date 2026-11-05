// Same persistent slot and event consumed by the production topbar.
export function normalizeClockMessage(d={}){
 if(!Number.isInteger(d.slot)||d.slot<1||d.slot>3)throw Error('Relógio: escolha posição 1, 2 ou 3');
 if(typeof d.message!=='string'||d.message.length>40||/[\x00-\x1f]/.test(d.message))throw Error('Mensagem: até 40 caracteres sem controles');
 return {slot:d.slot,message:d.message.trim()};
}
export async function setClockMessage(p,data){
 const {slot,message}=normalizeClockMessage(data);
 const query={realm:'OBS_WEBSOCKET_DATA_REALM_GLOBAL',slotName:'freemix_clocks'};
 const read=await p.req('GetPersistentData',query);
 if(read.slotValue!=null&&(!Array.isArray(read.slotValue)||read.slotValue.length>3||read.slotValue.some(c=>!c||typeof c!=='object'||Array.isArray(c))))throw Error('Configuração de relógios inválida; nenhuma alteração gravada');
 const clocks=Array.isArray(read.slotValue)?structuredClone(read.slotValue):[{type:'rec'},{type:'stream'},{type:'clock'}];
 while(clocks.length<3)clocks.push({type:'none'});
 clocks[slot-1]={...clocks[slot-1],type:'message',message};
 await p.req('SetPersistentData',{...query,slotValue:clocks});
 const confirmed=await p.req('GetPersistentData',query);
 if(!Array.isArray(confirmed.slotValue)||JSON.stringify(confirmed.slotValue)!==JSON.stringify(clocks))throw Error('Mensagem não confirmada pelo motor; configuração mudou durante a operação');
 await p.req('BroadcastCustomEvent',{eventData:{freemix:{clocks:confirmed.slotValue}}});
 return {slot,message,persisted:true};
}
