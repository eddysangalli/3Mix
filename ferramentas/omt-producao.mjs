// Uses the actual OMT plugin registration and native 3Mix output bridge.
import {assertSdrOutputRequest,outputHdrContracts} from './saidas-hdr.mjs';
async function nativeRequest(obs,action,data={}) {
 const r=await obs.tryReq('CallVendorRequest',{vendorName:'freemix',requestType:'network_output',requestData:{protocol:'OMT',action,...data}}).catch(()=>null);
 return typeof r?.responseData?.available==='boolean'?r.responseData:null;
}
export async function omtRead(obs,{senderId=0}={}) {
 const [kinds,listed,native]=await Promise.all([obs.req('GetInputKindList'),obs.req('GetOutputList'),nativeRequest(obs,'state',{senderId})]);
 const sourceAvailable=kinds.inputKinds.includes('omtsource');
 const outputs=listed.outputs.filter(x=>['omtoutput','freemix_omt_output'].includes(x.outputKind));
 const output=outputs.find(x=>x.outputName===(native?.outputName||'OMT Output'));
 return {hdrContract:outputHdrContracts.OMT,installed:sourceAvailable,sourceAvailable,available:native?.available??sourceAvailable,nativeBridge:Boolean(native),outputAvailable:Boolean(native?.available||output),outputCreated:Boolean(output),outputActive:native?.active??Boolean(output?.outputActive),outputName:native?.outputName||'OMT Output',networkName:native?.networkName||null,networkNameEditable:!!native?.networkNameEditable,sourceIndependent:!!native?.sourceIndependent,audioSourceSelectable:!!native?.audioSourceSelectable,audioSourceUuid:native?.audioSourceUuid||'',audioTrackSelectable:!!native?.audioTrackSelectable,sendersPerProtocol:native?.sendersPerProtocol||1,senderId:native?.senderId||0,senders:native?.senders||[],fillKeySupported:!!native?.fillKeySupported,fillKey:!!native?.fillKey,keyName:native?.keyName||'',pa16Supported:!!native?.pa16Supported,precisionBits:native?.precisionBits||8,hdrSupported:!!native?.hdrSupported,alphaSupported:!!native?.alphaSupported,alpha:!!native?.alpha,connections:native?.connections??-1,receiverStatus:native?.receiverStatus||'unknown',capturedFrames:native?.capturedFrames||0,backend:native?.backend||null,mode:native?.mode||'program',sourceUuid:native?.sourceUuid||'',audioTrack:native?.audioTrack||0,width:native?.width||0,height:native?.height||0,outputs,needsOutputInitialization:sourceAvailable&&!native?.available&&!output};
}
export async function omtStart(obs,options={}) {
 assertSdrOutputRequest('OMT',options);
 const senderId=Number(options.senderId??0),state=await omtRead(obs,{senderId});
 if(!Number.isInteger(senderId)||senderId<0||senderId>=(state.sendersPerProtocol||1))throw Error('Sender OMT indisponível neste motor');
 const precision=Number(options.precisionBits??8);if(![8,16].includes(precision)||options.hdr||precision===16&&(!state.pa16Supported||options.mode!=='source'||options.fillKey))throw Error('PA16 exige OMT SDR/entrada própria; HDR não está implementado nesta rota integrada');
 if(options.fillKey&&(!state.fillKeySupported||options.mode!=='source'))throw Error('Fill+Key exige SDK OMT e entrada/composição independente');
 if(options.fillKey&&options.alpha)throw Error('Escolha Alpha integrado ou par Fill+Key');
 if(options.alpha&&(!state.alphaSupported||options.mode!=='source'))throw Error('Alpha exige entrada independente e suporte BGRA SDR do motor');
 const mode=options.mode||'program',audioTrack=Number(options.audioTrack??0),audioSourceUuid=String(options.audioSourceUuid||'');if(audioSourceUuid&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(audioSourceUuid))throw Error('Áudio independente exige UUID');if(audioSourceUuid&&!state.audioSourceSelectable)throw Error('Motor sem captura PCM independente por UUID');
 if(!['program','source'].includes(mode)||![0,1,2].includes(audioTrack))throw Error('Escolha Programa ou entrada e áudio Master/A/B para OMT');
 if(mode==='source'&&(!state.sourceIndependent||!options.sourceUuid))throw Error('Este motor não suporta OMT por entrada independente');
 if(audioTrack!==0&&!state.audioTrackSelectable)throw Error('Este motor não suporta seleção de bus OMT');
 if(state.nativeBridge){const result=await nativeRequest(obs,'start',{...options,senderId,audioTrack,audioSourceUuid,mode,alpha:options.alpha===true});if(!result?.success||!result.active)throw Error(result?.error||'Motor não confirmou saída OMT ativa');return {...result,outputActive:result.active};}
 if(!state.outputAvailable)throw Object.assign(Error('Saída OMT não inicializada; ative OMT Output no menu Tools ou use motor 3Mix com network_output'),{code:'OMT_OUTPUT_NOT_INITIALIZED'});
 if(!state.outputActive)await obs.req('StartOutput',{outputName:state.outputName});
 const result=await obs.req('GetOutputStatus',{outputName:state.outputName});if(!result.outputActive)throw Error('Plugin OMT não confirmou envio ativo');return result;
}
export async function omtStop(obs,{senderId=0}={}) {
 const state=await omtRead(obs,{senderId});
 if(state.nativeBridge){let result=await nativeRequest(obs,'stop',{senderId});if(!result?.success)throw Error(result?.error||'Motor não confirmou parada OMT');for(let n=0;result.active&&n<60;n++){await new Promise(resolve=>setTimeout(resolve,50));result=await nativeRequest(obs,'state',{senderId});if(!result?.success)throw Error(result?.error||'Motor não confirmou estado OMT');}if(result.active)throw Error('Sender OMT ainda está encerrando a captura; aguarde');return {...result,outputActive:result.active};}
 if(!state.outputAvailable)return {outputActive:false,outputAvailable:false};
 if(state.outputActive)await obs.req('StopOutput',{outputName:state.outputName});
 const result=await obs.req('GetOutputStatus',{outputName:state.outputName});if(result.outputActive)throw Error('Plugin OMT não confirmou parada');return result;
}
export async function omtCreateInput(obs,{sceneName,inputName,sourceName}={}) {
 if(!(await omtRead(obs)).sourceAvailable)throw Error('Plugin OMT não carregado');
 if(!sceneName||!inputName||!sourceName)throw Error('Cena, nome da entrada e fonte OMT são obrigatórios');
 return obs.req('CreateInput',{sceneName,inputName,inputKind:'omtsource',inputSettings:{sourceProperty:sourceName},sceneItemEnabled:true});
}
