import './switcher-strip.js?v=20261102d';
const host=window.ThreeMixStripHost;
// A Strip só aparece quando o backend Multi-M/E responde. Sem isso, o botão
// ficaria visível e quebrado em runtimes que ainda não têm o pacote de M/E.
async function start(){
 // A superfície mora na aba M/E da mesa, ao lado de Fontes.
 const container=document.getElementById('me-surface');if(!container)return;
 const surface=document.createElement('div');surface.className='me-strips';container.append(surface);
 document.body.classList.add('has-me');
 let meTarget=1,lastMixes=[];
 const visible=()=>document.body.classList.contains('me-on')||meTarget!==1;
 const nameOf=uuid=>window.FreeMixProductionState?.inputs?.find(i=>i.key===uuid)?.name||'';
 const pending=new Map();let scope='',polling=false;
 async function request(path,data){const response=await fetch(new URL(path,host.apiBase),{...(data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(15000)});const result=await response.json();if(!response.ok||!result.success)throw Error(result.error||'Motor não confirmou');return result;}
 async function meOperation(mixId,command,input,extra={}){
  if(pending.has(mixId))throw Error('Confirmação pendente: use Conferir motor, não repita o comando.');
  scope=window.FreeMixProductionState?.preset||scope;
  if(!scope)throw Error('Projeto não identificado');
  const operation={operationId:'strip_'+crypto.randomUUID(),expectedScope:scope,mixId,command,...(input?{input}:{}),...extra};pending.set(mixId,operation);
  try{const result=await request('control',{action:'outputs_mix',...operation});let receipt=result.outputs?.mixOperation;if(receipt?.id!==operation.operationId)throw Error('Confirmação pendente; consulte o motor.');
   // Durante a transição o motor responde "em andamento"; isso só vira pendência se não terminar no tempo dela.
   const limit=Date.now()+Number(operation.duration||500)+3000;
   while(receipt?.stage!=='confirmed'&&Date.now()<limit){await new Promise(done=>setTimeout(done,120));const check=await request('mix-effects/check',operation);receipt=check.operation||receipt;}
   if(receipt?.stage!=='confirmed')throw Error('Confirmação pendente; consulte o motor.');pending.delete(mixId);}
  finally{await refresh();}
 }
 // 4 Strips fixas, Delegate inicial 1/2/3/4: cobre os 4 M/Es simultaneamente por padrão (persistência por
 // localStorage ainda permite o operador redelegar qualquer uma para qualquer M/E depois -- isto só muda o
 // ponto de partida de 2 Strips ambas em MAIN para 4 Strips já cobrindo M/E 1-4 de cara).
 const strips=[0,1,2,3].map(index=>{
  const strip=document.createElement('three-mix-switcher-strip');strip.surface={...strip.surface,mixId:index+1};surface.append(strip);
  strip.executeOperation=async({command,input,mixId,...extra})=>{
   if(mixId===1){await host.executeMain(command,input);await refresh();return;}
   return meOperation(mixId,command,input,extra);
  };
  strip.frameUrl=key=>new URL('ptz/preview?input='+encodeURIComponent(key)+'&t='+Date.now(),host.apiBase).href;
  // Audio Bus padrão do M/E: ação administrativa (metadado + validação contra buses reais), não uma operação de
  // switching -- sem operationId/confirmação por mixId como as acima, reflete o mesmo padrão já usado para
  // mix_audio_set no backend (local-only, idempotente, falha aberta numa leitura futura se o bus sumir).
  strip.executeAudioBus=async({mixId,bus})=>{
   await request('control',{action:'mix_audio_set',mixId,bus});
   await refresh();
  };
  return strip;
 });
 const check=document.createElement('button');check.textContent='Conferir motor';check.onclick=async()=>{
  try{for(const [mixId,operation]of pending){const result=await request('mix-effects/check',operation);if(result.operation?.stage==='confirmed')pending.delete(mixId);}await refresh();}catch(error){check.title=error.message;}
 };container.append(check);
 // Patch: Source -> Input Slot. Formulário próprio (não por Strip, é uma operação de roteamento de um Input
 // específico, não de um M/E) -- dois selects populados pelos Inputs reais do snapshot, aplicando pelo mesmo
 // contrato patch_set já testado real (patch-registry-producao.mjs). O select de destino exclui Compositions
 // (describe() do backend já recusa isso; filtrar aqui só evita uma chamada fadada a falhar, não substitui a
 // validação real do motor).
 const patchBox=document.createElement('div');patchBox.style.cssText='margin-top:10px;padding-top:10px;border-top:1px solid #45474b;display:flex;gap:6px;align-items:center;flex-wrap:wrap';
 const patchLabel=document.createElement('span');patchLabel.textContent='Patch: ';
 const patchInput=document.createElement('select');patchInput.setAttribute('aria-label','Input a patchear');
 const patchSignal=document.createElement('select');patchSignal.setAttribute('aria-label','Sinal de origem');
 const patchButton=document.createElement('button');patchButton.type='button';patchButton.textContent='Aplicar Patch';
 const patchStatus=document.createElement('span');patchStatus.setAttribute('role','status');
 patchBox.append(patchLabel,patchInput,document.createTextNode(' ← '),patchSignal,patchButton,patchStatus);container.append(patchBox);
 function fillPatchSelects(state){
  const options=(state?.inputs||[]).filter(i=>!i.composition).map(i=>'<option value="'+i.key+'">'+(i.number||'')+' '+String(i.name).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))+'</option>').join('');
  const allOptions=(state?.inputs||[]).map(i=>'<option value="'+i.key+'">'+(i.number||'')+' '+String(i.name).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))+(i.composition?' (Composition)':'')+'</option>').join('');
  if(patchInput.dataset.sig!==options){patchInput.dataset.sig=options;const old=patchInput.value;patchInput.innerHTML=options;if([...patchInput.options].some(o=>o.value===old))patchInput.value=old;}
  if(patchSignal.dataset.sig!==allOptions){patchSignal.dataset.sig=allOptions;const old=patchSignal.value;patchSignal.innerHTML=allOptions;if([...patchSignal.options].some(o=>o.value===old))patchSignal.value=old;}
 }
 patchButton.onclick=async()=>{
  if(!patchInput.value||!patchSignal.value){patchStatus.textContent='Selecione os dois lados.';return;}
  patchButton.disabled=true;patchStatus.textContent='Aplicando...';
  try{await request('control',{action:'patch_set',input:patchInput.value,signal:patchSignal.value});patchStatus.textContent='Patch aplicado.';}
  catch(error){patchStatus.textContent=error.message;}
  finally{patchButton.disabled=false;}
 };
 function fillPatchSignals(mixes){
  const rows=mixes.filter(m=>m.proxyUuid);
  const sig=rows.map(m=>m.mixId+':'+m.proxyUuid).join();
  if(patchSignal.dataset.me===sig&&[...patchSignal.options].some(o=>o.dataset.me))return;
  patchSignal.dataset.me=sig;
  for(const o of [...patchSignal.options])if(o.dataset.me)o.remove();
  for(const m of rows){const o=new Option('Saída do M/E '+m.mixId,m.proxyUuid);o.dataset.me='1';patchSignal.add(o);}
 }
 async function refresh(){
  if(polling||!visible())return;polling=true;
  try{const state=window.FreeMixProductionState;if(!state?.connected)return;scope=state.preset;const requestedScope=scope;
   // meTally (Tally recursivo de M/E 2-4, mesma técnica do MAIN: percorre a árvore de
   // cenas aninhadas, não só compara UUID direto) vem de /api/signals -- achado real:
   // a Strip comparava só input.key===mix.programUuid/previewUuid, então um Input
   // visível só por estar DENTRO de uma Composition no ar de um M/E nunca aparecia
   // marcado como "no ar" nos botões. signals é best-effort (/api/signals pode faltar
   // em runtimes mais antigos) -- .catch(()=>null) preserva o resto da Strip funcionando
   // sem Tally recursivo nesse caso, só perde esse detalhe específico, nunca quebra tudo.
   const [native,audio,signals]=await Promise.all([request('mix-effects'),request('mix-audio').catch(()=>null),request('signals').catch(()=>null)]);
   if(window.FreeMixProductionState?.preset!==requestedScope)return;const key=name=>state.inputs?.find(i=>i.name===name)?.key||'';const snapshot={inputs:state.inputs||[],mixes:[{mixId:1,programUuid:key(state.program),previewUuid:key(state.preview)},...(native.mixes||[])],audioBuses:audio?{available:audio.availableBuses,defaults:audio.defaults}:null,meTally:signals?.meTally||null};
   // Bug real encontrado em QA (qa-beta/recibos/switcher-strip-patch-audio-tally-e2e.md): o reset abaixo
   // usava mixId:1 fixo sempre que storageKey mudava (inclusive na 1a vez, com localStorage vazio), apagando
   // o mixId:index+1 (1/2/3/4) setado na criação das Strips -- as "4 Strips fixas, Delegate inicial 1/2/3/4"
   // do comentário acima nunca funcionava numa sessão nova: as 4 nasciam em MAIN. O default agora é
   // index+1, igual à criação; localStorage com um mixId válido salvo continua podendo sobrescrever.
   strips.forEach((strip,index)=>{const storageKey='3mix.strip.'+scope+'.'+index;if(strip.storageKey!==storageKey){strip.storageKey=storageKey;strip.surface={mixId:index+1,page:0,size:16,category:''};try{const saved=JSON.parse(localStorage.getItem(storageKey));if(saved&&[1,2,3,4].includes(saved.mixId)&&Number.isInteger(saved.page)&&saved.page>=0)strip.surface={...strip.surface,mixId:saved.mixId,page:saved.page};}catch{}}strip.update(snapshot);localStorage.setItem(storageKey,JSON.stringify(strip.surface));});
   lastMixes=native.mixes||[];if(meTarget!==1)window.ThreeMixRepaintBanks?.();
   fillPatchSignals(lastMixes);
   check.textContent=pending.size?'Conferir motor ('+pending.size+')':'Conferir motor';
   fillPatchSelects(state);
  }catch(error){check.title=error.message;}finally{polling=false;}
 }
 setInterval(refresh,1000);
 setInterval(()=>{if(document.body.classList.contains('me-on'))strips.forEach(strip=>strip.refreshFrames());},2000);
 // Botoeiras do topo: sempre abrem no MAIN; o M/E escolhido não fica salvo, para nunca cortar no lugar errado depois de reabrir.
 function paintDelegate(){
  document.body.classList.toggle('bank-on-me',meTarget!==1);
  const bar=document.querySelector('#bank-pv .bank-me');
  if(bar&&!bar.children.length)bar.innerHTML=[1,2,3,4].map(id=>'<button type="button" class="bank-me-b" data-a="bank_me" data-v="'+id+'" title="'+(id===1?'Botoeiras no M/E principal':'Botoeiras no M/E '+id)+'">'+(id===1?'MAIN':'M/E '+id)+'</button>').join('');
  for(const button of document.querySelectorAll('.bank-me-b'))button.classList.toggle('on',Number(button.dataset.v)===meTarget);
  const tag=document.querySelector('#bank-pgm .bank-me-tag');if(tag)tag.textContent=meTarget===1?'':'M/E '+meTarget;
 }
 window.ThreeMixME={
  get target(){return meTarget;},
  select(id){meTarget=id;paintDelegate();refresh().finally(()=>window.ThreeMixRepaintBanks?.());window.ThreeMixRepaintBanks?.();},
  selectedName(side){const mix=lastMixes.find(m=>m.mixId===meTarget);return nameOf(side==='pv'?mix?.previewUuid:mix?.programUuid);},
  async pick(side,name){
   const key=window.FreeMixProductionState?.inputs?.find(i=>i.name===name)?.key;
   if(!key)throw Error('Entrada não encontrada: '+name);
   const mixId=meTarget;
   await meOperation(mixId,'preview',key);
   if(side==='pgm')await meOperation(mixId,'cut');
   window.ThreeMixRepaintBanks?.();
  },
  tick(){refresh();strips.forEach(strip=>strip.refreshFrames());},
 };
 paintDelegate();
}
// window.ThreeMixMixEffectsAvailable, se já estiver definida por outra parte do runtime, evita a sondagem
// abaixo. Sem ela (o caso comum: nada mais no projeto define essa flag hoje), a disponibilidade real do
// backend é checada uma vez contra /api/mix-effects antes de iniciar — nunca presumida, nunca deixando o
// botão M/E Strips visível e quebrado num runtime sem o pacote Multi-M/E (mesmo 404 de console que a flag
// estática tentava evitar, só que verificado de verdade em vez de depender de alguém lembrar de setá-la).
if(host&&!new URLSearchParams(location.search).has('pop')){
 (async()=>{
  if(window.ThreeMixMixEffectsAvailable===true){start();return;}
  if(window.ThreeMixMixEffectsAvailable===false)return;
  try{
   const response=await fetch(new URL('mix-effects',host.apiBase),{signal:AbortSignal.timeout(4000)});
   const result=await response.json().catch(()=>null);
   window.ThreeMixMixEffectsAvailable=response.ok&&result?.success===true;
  }catch{window.ThreeMixMixEffectsAvailable=false;}
  if(window.ThreeMixMixEffectsAvailable)start();
 })();
}
