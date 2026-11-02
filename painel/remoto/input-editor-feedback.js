// Identity-bound editor opening. Qt observations are not desktop z-order proof.
(function(root){
 'use strict';
 const valid=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
 function uniqueSources(list){const seen=new Set();return list.filter(s=>{const identity=valid(s.key)?'uuid:'+s.key:'name:'+s.name+'\0'+s.kind;if(seen.has(identity))return false;seen.add(identity);return true;});}
 function sceneMatches(context,target){return Boolean(context?.on&&(context.scope||'')===(target?.scope||'')&&valid(target.ownerKey)&&context.sceneKeys?.[target.owner]===target.ownerKey);}
 function create({context,request,publish,deadlineMs=5000}){
  let intent=null,querying=false,opening=false;
  const output=(stage,message,extra={})=>{const s=Object.freeze({stage,message,pending:Boolean(intent),...(intent?{sourceKey:intent.key,sourceName:String(intent.name||'').slice(0,160),kind:intent.kind}:{}),...extra,zOrderVerified:false});publish(s);return s;};
  function check(i){const c=context();if(intent!==i||!sceneMatches(c,i)||c.connection!==i.connection||!(c.items.get(i.owner)||[]).some(s=>s.key===i.key))throw Error('EDITOR_CONTEXT_CHANGED');}
  async function call(i,type,data){check(i);let timer;try{const result=await Promise.race([request(type,data),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('EDITOR_DEADLINE')),deadlineMs);})]);check(i);return result;}finally{clearTimeout(timer);}}
  async function observe(internal=false){
   if(opening&&!internal)return output('opening','Aguarde o pedido de abertura terminar.');
   const i=intent;if(!i)return output('idle','Nenhuma abertura pendente.');if(querying)return output('checking','Conferindo a janela solicitada…');
   querying=true;try{
    const response=await call(i,'CallVendorRequest',{vendorName:'freemix',requestType:'get_interface',requestData:{show:false,screenshot:false,sourceEditors:true}}),r=response?.responseData;
    if(r?.interfaceBusy===true||r?.closing===true)return output('unobserved','O motor está ocupado ou encerrando. A janela não foi confirmada e a abertura não será repetida.');
    if(r?.success!==true||r.sourceEditorsObserved!==true||!Array.isArray(r.sourceEditors))return output('unobserved','Pedido enviado; esta versão não confirmou a janela. Confira o motor antes de repetir.');
    const row=r.sourceEditors.find(e=>e.kind===i.kind&&e.identityKnown===true&&e.sourceUuid===i.key);
    if(row?.visible===true&&row.minimized===false){intent=null;return output('visible',row.activeWindow===true?'Janela visível e ativa segundo o motor.':'Janela visível segundo o motor; ela pode estar atrás da mesa.',{sourceKey:i.key,sourceName:String(i.name||'').slice(0,160),kind:i.kind,visible:true,activeWindow:row.activeWindow===true,focusWithin:row.focusWithin===true});}
    return output('accepted','Pedido recebido; a janela ainda não foi confirmada como visível. Use Conferir janela.');
   }catch(error){return output(error.message==='EDITOR_CONTEXT_CHANGED'?'context-changed':'uncertain',error.message==='EDITOR_CONTEXT_CHANGED'?'O projeto, a fonte ou a conexão mudou. Não repetimos a abertura.':'Não foi possível conferir a janela. O comando não será repetido.');}finally{querying=false;}
  }
  async function open(target){
   if(intent||opening||querying)return output('blocked','Há uma janela em confirmação. Confira antes de abrir outra.');
   const c=context();if(!['properties','filters'].includes(target.kind)||!valid(target.key)||!sceneMatches(c,target))return output('rejected','Esta entrada mudou ou não tem UUID confirmado. Atualize a mesa e abra a engrenagem novamente.');
   const i={...target,connection:c.connection};intent=i;opening=true;let dispatched=false;output('preflight','Identificando a fonte antes de abrir…');
   try{
    const items=await call(i,'GetSceneItemList',{sceneUuid:i.ownerKey});
    const source=Array.isArray(items?.sceneItems)&&items.sceneItems.find(s=>s.sourceUuid===i.key&&s.inputKind);if(!source)throw Error('EDITOR_SOURCE_REMOVED');
    if(typeof source.sourceName==='string')i.name=source.sourceName;
    const collection=await call(i,'GetSceneCollectionList',{});if(i.scope&&collection?.currentSceneCollectionName!==i.scope)throw Error('EDITOR_CONTEXT_CHANGED');
    check(i);dispatched=true;output('opening','Abrindo a janela no motor…');
    await call(i,i.kind==='filters'?'OpenInputFiltersDialog':'OpenInputPropertiesDialog',{inputUuid:i.key});
    output('accepted','O motor recebeu o pedido. Conferindo a janela…');return await observe(true);
   }catch(error){if(!dispatched){intent=null;return output('rejected','A fonte ou o projeto mudou, ou a leitura falhou. Nenhuma abertura foi enviada.');}return output(error.message==='EDITOR_CONTEXT_CHANGED'?'context-changed':'uncertain','Não foi possível confirmar a abertura. Confira a janela; não enviamos outro pedido.');}finally{opening=false;}
  }
  function abandon(){if(querying||opening)return output('checking','Aguarde o pedido ou a leitura da janela terminar.');intent=null;return output('abandoned','Controle liberado localmente. A abertura anterior não foi cancelada nem repetida.');}
  return Object.freeze({open,observe:()=>observe(false),abandon,pending:()=>Boolean(intent)});
 }
 const api=Object.freeze({create,sceneMatches,uniqueSources});if(typeof module!=='undefined')module.exports=api;root.FreeMixInputEditors=api;
})(typeof window!=='undefined'?window:globalThis);
