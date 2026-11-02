// Operational adapter for the existing independent native M/Es.
// MAIN deliberately remains on Production.runRealtime (operationId/ACK semantics);
// this adapter gives M/E 2-4 their OWN confirmation, scoped to that mixId's state,
// per the task's explicit rule: never validate M/E 2 against M/E 1's Program.
export class MixEffectsEngine {
 constructor(production){this.p=production;this.receipts=new Map();this.tail=Promise.resolve();}
 async read(){return this.p.vendor('get_mixes',{},'freemix');}
 execute(d={}){
  // Legacy callers without operationId retain their existing contract.
  if(d.operationId===undefined)return this.dispatch(d);
  const run=this.tail.then(()=>this.correlated(d));
  this.tail=run.catch(()=>{});return run;
 }
 context(){return {scope:this.p.scope,connection:this.p.getObs?.()};}
 sameContext(context){const current=this.context();return current.scope===context.scope&&current.connection===context.connection;}
 async correlated(d){
  const id=d.operationId;
  if(typeof id!=='string'||! /^[A-Za-z0-9_-]{1,80}$/.test(id))throw Error('operationId inválido');
  const context=this.context();
  if(!context.scope||!context.connection||d.expectedScope!==context.scope)throw Error('Projeto ou conexão não confirmado');
  const key=JSON.stringify([context.scope,id]);
  const signature=JSON.stringify(Object.entries(d).filter(([k])=>!['operationId','expectedScope'].includes(k)).sort(([a],[b])=>a.localeCompare(b)));
  const existing=this.receipts.get(key);
  if(existing){
   if(existing.signature!==signature||!this.sameContext(existing.context))throw Error('operationId reutilizado em outro comando ou conexão');
   if(existing.public.stage==='rejected'){const error=Error(existing.public.error||'Operação rejeitada');error.operation={...existing.public};throw error;}
   return {...existing.result,operation:{...existing.public}};
  }
  if(this.receipts.size>=256)throw Error('Limite de recibos desta sessão atingido; nenhuma operação enviada');
  const entry={context,signature,public:{id,scope:context.scope,mixId:Number(d.mixId??2),command:d.command,stage:'pending'},sent:false};
  this.receipts.set(key,entry);
  try{
   const result=await this.dispatch(d,entry);
   if(!this.sameContext(context))throw Error('Projeto ou conexão mudou após execução');
   entry.result=result;
   entry.public.stage=result.selected?.transitioning?'uncertain':'confirmed';
   return {...result,operation:{...entry.public}};
  }catch(error){entry.public.stage=entry.sent?'uncertain':'rejected';entry.public.error=error.message;error.operation={...entry.public};throw error;}
 }
 reconcile({operationId,expectedScope}={}){
  const run=this.tail.then(async()=>{
   const entry=this.receipts.get(JSON.stringify([expectedScope,operationId]));
   if(!entry||!this.sameContext(entry.context))throw Error('Operação ou contexto não identificado');
   const native=await this.read();
   if(!this.sameContext(entry.context))throw Error('Contexto mudou durante consulta');
   const selected=native?.mixes?.find(m=>m.mixId===entry.public.mixId);
   const field=entry.public.command==='preview'?'previewUuid':'programUuid';
   const matches=!!entry.target&&selected?.[field]===entry.target&&!selected?.transitioning;
   if(entry.public.stage==='uncertain'&&matches)entry.public.stage='confirmed';
   return {operation:{...entry.public},selected,desiredMatches:matches};
  });this.tail=run.catch(()=>{});return run;
 }
 async dispatch(d={},receipt=null){
  if(!['configure','preview','cut','fade','take','state'].includes(d.command))throw Error('Comando de M/E inválido');
  const mixId=Number(d.mixId??2);
  if(!Number.isInteger(mixId)||![2,3,4].includes(mixId))throw Error('Selecione M/E 2, 3 ou 4');
  const data={action:d.command,mixId};
  let expectedPreviewUuid,expectedProgramUuid;
  if(d.command==='preview'){data.uuid=this.p.scene(d.input).key;expectedPreviewUuid=data.uuid;}
  if(d.command==='configure'){
   data.width=Number(d.width);data.height=Number(d.height);data.fill=d.fill===true;
   for(const field of ['positionX','positionY','zoom'])if(d[field]!==undefined)data[field]=Number(d[field]);
   if(d.transitionUuid!==undefined)data.transitionUuid=String(d.transitionUuid);
  }
  if(['fade','take'].includes(d.command))data.duration=Number(d.duration??500);
  if(['cut','fade','take'].includes(d.command)){const before=(await this.read()).mixes?.find(m=>m.mixId===mixId);if(!before?.previewUuid)throw Error('Preview do M/E '+mixId+' não identificado; nenhuma operação enviada.');expectedProgramUuid=before.previewUuid;}
  // Do not interpret root programUuid: the legacy response root is always Mix 2.
  // Confirm strictly against THIS mixId's own entry in mixes[], never the root
  // and never another M/E's state — this IS this M/E's own ACK, scoped by mixId.
  if(receipt){if(!this.sameContext(receipt.context))throw Error('Contexto mudou antes do envio');receipt.target=expectedPreviewUuid??expectedProgramUuid;receipt.sent=true;}
  const native=await this.p.vendor('control_mix',data,'freemix');
  const selected=native?.mixes?.find(m=>m.mixId===mixId)||null;
  let confirmed=native?.success===true;
  if(confirmed&&d.command==='preview')confirmed=selected?.previewUuid===expectedPreviewUuid;
  if(confirmed&&d.command==='cut')confirmed=selected?.programUuid===expectedProgramUuid;
  if(confirmed&&['fade','take'].includes(d.command))confirmed=selected?.programUuid===expectedProgramUuid;
  if(!confirmed)throw Error('M/E '+mixId+' não confirmou o estado esperado após '+d.command+'.');
  return {native,selected,mixId,confirmation:selected?.transitioning?'accepted-in-flight':'current-state'};
 }
}
