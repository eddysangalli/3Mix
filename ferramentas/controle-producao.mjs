import {setClockMessage} from './relogios-comandos.mjs';
import {createCoreProjectBinding} from './projetos/core-host-binding.mjs';
import {installIsolationHooks} from './projetos/isolation-hooks.mjs';
import {readProjectOwnerActivity} from './projetos/owner-activity.mjs';
import {projectQualificationPolicy} from './projetos/qualification-policy.mjs';
import {dispatchFinalProgramGate,readFinalProgramGate,matchesFinalProgramGate} from './final-program-gate-producao.mjs';
import {dispatchGtTickerUpdate} from './gc-gtzip.mjs';
// Shared production operations. Success means the engine accepted and confirmed the operation.
import { DataSources } from './fontes-dados.mjs';
import { InputEngine } from './entradas-producao.mjs';
import { SettingsEngine } from './configuracoes-producao.mjs';
import { CallEngine } from './calls-producao.mjs';
import { AudioRoutingEngine } from './audio-routing-producao.mjs';
import { MacroEngine } from './macros-producao.mjs';
import { RecoveryEngine } from './recuperacao-producao.mjs';
import { OutputEngine } from './saidas-producao.mjs';
import { MixEffectsEngine } from './mix-effects-producao.mjs';
import { SessionRecovery } from './sessao-producao.mjs';
import { NetworkEngine } from './bonding-producao.mjs';
import { QueueEngine } from './fila-producao.mjs';
import { MediaPlayoutEngine } from './media-playout-engine.mjs';
import { ControllerEngine } from './controlador-producao.mjs';
import { GlobalHotkeys } from './atalhos-globais.mjs';
import { GCLibraryEngine } from './gc-biblioteca-producao.mjs';
import { GCCompatibleEngine } from './gc-html-producao.mjs';
import { EffectsEngine } from './efeitos-producao.mjs';
import { SignalEngine } from './sinais-producao.mjs';
import { SignalRegistryEngine } from './registro-sinais-producao.mjs';
import { PatchRegistryEngine } from './patch-registry-producao.mjs';
import { MixAudioEngine } from './mix-audio-producao.mjs';
import { OverlayEngine } from './overlays-producao.mjs';
import { PreflightEngine } from './preflight-producao.mjs';
import { IncidentBlackboxEngine } from './blackbox-producao.mjs';
import { BroadcastDelayEngine } from './broadcast-delay.mjs';
import { ReturnFeedManager } from './return-feed-producao.mjs';
import { AudioDuckingEngine } from './audio-ducking-engine.mjs';
import { RundownEngine } from './rundown-producao.mjs';
import { PTZManager } from './ptz-manager.mjs';
import { createStudioSocial } from './studio-social-engine.mjs';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

const delay = ms => new Promise(r => setTimeout(r, ms));
const busNames = { M:'3Mix Master', A:'3Mix Bus A', B:'3Mix Bus B' };
const mediaKind = k => /ffmpeg|vlc|playlist/.test(k || '');
export const xml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function number(value, min, max, label='Valor') {
  if (value === '' || value === null || value === undefined || !Number.isFinite(Number(value)) || Number(value)<min || Number(value)>max) throw new Error(`${label}: use ${min} a ${max}`);
  return Number(value);
}

export class Production {
  installProjectHost({replay,iso,onlineUpdate,diagnostics}) {
    if(this.projectBinding)throw Error('PROJECT_HOST_ALREADY_INSTALLED');
    const owners={production:this,replay,iso,onlineUpdate,diagnostics};
    const binding=createCoreProjectBinding({root:this.root,InputEngine,getConnection:()=>this.getObs(),readState:()=>this.state,readActivity:()=>readProjectOwnerActivity(owners),...projectQualificationPolicy,nativeRequestNames:{policy:'project_creation_policy',inventory:'project_device_inventory'}});
    this.projectBinding=binding;
    this.projectIsolationHooks=installIsolationHooks(binding.gate,owners);
    return binding;
  }
  constructor({root,panel,getObs,publish=()=>{},publishRaw=null,finalProgramGateQualified=false}) {
    this.finalProgramGateQualified=finalProgramGateQualified===true; this.root=root; this.panel=panel; this.getObs=getObs; this.publish=publish; this.publishRaw=publishRaw; this.broadcast=msg=>{if(typeof this.publishRaw==="function")this.publishRaw(msg);else if(typeof this.publish==="function")this.publish(msg);}; this.tail=Promise.resolve(); this.levels=new Map(); this.generation=0;
    // Módulos opcionais em standby: servidor-api.mjs substitui esta função pela leitura
    // real de modulos-config.mjs; por padrão (aqui e em qualquer outro host que não a
    // configure) todo módulo conta como ativo, preservando o comportamento de hoje.
    this.moduloAtivo=()=>true;
    this.state={connected:false,scenes:[],inputs:[],audioInputs:[],media:[],overlays:[],gc:{},revision:0}; this.scope=null; this.dataSources=new DataSources(root);this.inputEngine=new InputEngine(this);this.settingsEngine=new SettingsEngine(this);this.callEngine=new CallEngine(this);
    this.macroEngine=new MacroEngine(this);
    this.recoveryEngine=new RecoveryEngine(this);
    this.sessionRecovery=new SessionRecovery(this);
    this.networkEngine=new NetworkEngine(this);
    this.playoutEngine=new MediaPlayoutEngine(this);
    this.queueEngine=this.playoutEngine;
    this.controllerEngine=new ControllerEngine(this);this.globalHotkeys=new GlobalHotkeys(this);
    // Audit finding A6: one MixEffectsEngine shared by OutputEngine (the HTTP
    // path's outputs_mix/operationId receipts) and SignalRegistryEngine (the
    // Signal Registry's meTally()/summary()) — they used to each construct
    // their own, so /api/mix-effects/check could confirm an operation the
    // Signal Registry's own read of mixes/meTally never agreed had happened.
    // Single instance means both now observe exactly the same receipts map.
    this.mixEffects=new MixEffectsEngine(this);
    this.outputEngine=new OutputEngine(this,this.mixEffects);this.audioRoutingEngine=new AudioRoutingEngine(this);this.overlayEngine=new OverlayEngine(this);
    this.gcCompatible=new GCCompatibleEngine(this);this.gcLibrary=new GCLibraryEngine(this);this.effectsEngine=new EffectsEngine(this);this.signalEngine=new SignalEngine(this);this.signalRegistry=new SignalRegistryEngine(this,this.mixEffects);this.patchRegistry=new PatchRegistryEngine(this);this.mixAudio=new MixAudioEngine(this);this.preflightEngine=new PreflightEngine(this);this.blackboxEngine=new IncidentBlackboxEngine(this);this.broadcastDelayEngine=new BroadcastDelayEngine(this);this.returnFeedManager=new ReturnFeedManager(this);this.audioDuckingEngine=new AudioDuckingEngine(this);this.rundownEngine=new RundownEngine(this);this.ptzManager=new PTZManager(this);
    // Frente 3MIX STUDIO & SOCIAL: chroma, estudio virtual e social em um agregador próprio.
    // Falha ao montar não derruba a mesa: as três trilhas ficam indisponíveis e o resto segue.
    try{this.studioSocial=createStudioSocial(this);}catch(e){this.studioSocial=null;this.studioSocialError=e.message;}

  }
  req(type,data={}) { const obs=this.getObs(); if(!obs) throw new Error('Sem conexão com o motor 3Mix'); return obs.req(type,data); }
  async optional(type,data) { try { return await this.req(type,data); } catch { return null; } }
  async vendor(type,data={},name='downstream-keyer') { const r=await this.req('CallVendorRequest',{vendorName:name,requestType:type,requestData:data}); if(r.responseData?.success===false) throw new Error(`O motor recusou ${type}${r.responseData.error?': '+r.responseData.error:''}`); return r.responseData; }
  // PTZ move/stop/zoom/focus bypass the serialized production tail entirely: they must
  // never wait behind a GetSourceScreenshot or a slow macro step, and Stop in particular
  // must land immediately (task requirement: "Botão STOP claramente disponível" + the
  // continuous-motion safety watchdog depends on low, predictable latency). PTZManager
  // keeps its own per-device serialization (one socket per camera) and lease arbitration;
  // it does not touch this.state or need a production refresh.
  async runPtz(action,data={}) { this.ptzResult=await this.ptzManager.execute(action,data); return this.state; }
  run(action,data={}) { if(action.startsWith('ptz_'))return this.runPtz(action,data); if(action==='gc_library_import'&&data.payload?.kind==='freemix-gtzip-import'&&data.payload.operation==='update'){if(data.payload.format!==1)return Promise.reject(Error('Formato de importação GTZIP inválido'));return this.runTickerUpdate(data);} if(['preview','active','cut','fade','transition','ftb','input_remove'].includes(action))return this.runRealtime(action,data);if(action==='macro_cancel')this.macroEngine.cancel();const p=this.tail.then(async()=>{this.sessionRecovery.beginMutation();try{await this.refresh(); await this.routeLegacyAudio(); await this.execute(action,data); this.macroEngine.recordAction?.(action,data); await this.sessionRecovery.journal(action,data); await this.refresh(); return this.state;}finally{this.sessionRecovery.endMutation();}}); this.tail=p.catch(()=>{}); return p; }
  // Rundown operations get the same serialized connection snapshot as other
  // production commands, but deliberately skip legacy audio migration: a step
  // may only touch the audio explicitly listed in its own actions.
  runRundown(action,data={}) {
    if(typeof this.rundownEngine?.execute!=='function')return Promise.reject(Error('Motor de Rundown indisponível nesta instalação'));
    const p=this.tail.then(async()=>{
      this.sessionRecovery.beginMutation();
      try {
        await this.refresh();
        const result=await this.rundownEngine.execute(action,data);
        let refreshError=null;
        try {
          await this.refresh();
        } catch (error) {
          // The action was already confirmed by the engine. Preserve its
          // receipt and report the stale snapshot separately instead of
          // pretending the command was rejected.
          refreshError=error.message;
          console.error('3Mix: rundown-refresh: '+error.message);
        }
        return {result,state:this.state,refreshError};
      } catch (error) {
        // Falha parcial pode ter mudado Programa/DSK/áudio antes de abortar.
        // Atualiza o snapshot para a tela mostrar o que realmente ocorreu.
        try { await this.refresh(); } catch (refreshFailure) { console.error('3Mix: rundown-failure-refresh: '+refreshFailure.message); }
        throw error;
      } finally {
        this.sessionRecovery.endMutation();
      }
    });
    this.tail=p.catch(()=>{});
    return p;
  }

  runTickerUpdate(data) {
    const queued=this.tail.then(async()=>{this.sessionRecovery.beginMutation();try{await this.refresh();const scope=this.scope,connection=this.getObs(),assertContext=()=>{if(this.scope!==scope||this.getObs()!==connection)throw Error('Projeto ou conexão mudou; atualização de ticker não enviada');};const dispatched=await dispatchGtTickerUpdate(this.gcLibrary,data.payload,{assertContext});this.gcLibrary.last=dispatched.receipt;this.state={...this.state,gcLibrary:this.gcLibrary.summary()};return {scope,connection,dispatched};}finally{this.sessionRecovery.endMutation();}});
    this.tail=queued.then(()=>{},()=>{});
    return queued.then(async({scope,connection,dispatched})=>{const ack=await dispatched.wait(),same=this.scope===scope&&this.getObs()===connection,receipt=same?ack:{...ack,rendererConfirmed:false,status:'UNCONFIRMED',contextChanged:true};if(same&&this.gcLibrary.last?.requestId===receipt.requestId){this.gcLibrary.last=receipt;this.state={...this.state,gcLibrary:this.gcLibrary.summary()};}return {...this.state,gcLibrary:{...this.gcLibrary.summary(),last:receipt}};});
  }

  runRealtime(action,data={}) {
    const receivedAt=Date.now(),connection=this.getObs(),id=data.operationId;
    if(id!==undefined&&(!/^[A-Za-z0-9_-]{1,80}$/.test(String(id))))return Promise.reject(Error('Identificação de comando inválida'));
    const p=this.tail.then(async()=>{
      const startedAt=Date.now();let executionStarted=false,preservePrevious=false;
      let operation={id:id||null,action,scope:String(data.expectedScope||this.scope||''),targetKey:action==='ftb'?null:data.input||null,targetName:null,receivedAt,startedAt,engineConfirmedAt:null,finishedAt:null,stage:'pending'};
      const signature=JSON.stringify(action==='ftb'?[action,data.mixId,data.enabled,data.active,data.durationMs,data.audioPolicy,data.experimentalOptIn]:[action,data.input||'$preview',data.duration??null]);
      const cacheKey=id?operation.scope+':'+id:null;
      this.operationReceipts??=new Map();this.operationConnections??=new Map();
      this.sessionRecovery.beginMutation();
      try {
        const previous=cacheKey&&this.operationReceipts.get(cacheKey);
        if(previous){preservePrevious=true;if(previous.signature!==signature)throw Error('Identificação reutilizada para outro comando');this.state={...this.state,operation:{...previous,replayed:true}};this.publish(this.state);if(previous.stage!=='confirmed')throw Error('Este comando foi recusado ou tem confirmação pendente; não será repetido');return this.state;}
        operation.signature=signature;
        if(cacheKey){if(this.operationReceipts.size>=128){const oldest=[...this.operationReceipts].find(([,r])=>r.stage==='confirmed'||r.stage==='rejected');if(oldest){this.operationReceipts.delete(oldest[0]);this.operationConnections.delete(oldest[0]);}else throw Error('Há muitas operações sem confirmação; confira o motor');}this.operationReceipts.set(cacheKey,operation);this.operationConnections.set(cacheKey,connection);}
        if(!connection||this.getObs()!==connection)throw Error('Conexão mudou antes do comando. Confira o Programa antes de tentar novamente.');
        if(action==='ftb'){
          const current=await dispatchFinalProgramGate(this,operation,data,connection,()=>{executionStarted=true;});
          operation.engineConfirmedAt=Date.now();operation.stage='confirmed';operation.finishedAt=Date.now();operation.confirmation='render-stage-state';operation.pixelsVerified=false;
          this.state={...this.state,finalProgramGate:current,operation:{...operation},operationReceipts:[...this.operationReceipts.values()].map(r=>({...r}))};this.publish(this.state);return this.state;
        }
        await this.prepareRealtime(action,data);
        if(this.getObs()!==connection)throw Error('Conexão mudou durante a confirmação inicial');
        const target=data.input?this.scene(data.input):this.state.inputs.find(i=>i.name===this.state.preview);
        if(!target)throw Error('Entrada removida ou Preview não identificado');
        Object.assign(operation,{scope:this.scope,targetKey:target.key,targetName:target.name});
        await this.routeLegacyAudio();
        if(this.getObs()!==connection)throw Error('Conexão mudou antes de executar');
        executionStarted=true;await this.execute(action,{...data,input:target.key});operation.engineConfirmedAt=Date.now();
        this.macroEngine.recordAction?.(action,data);await this.sessionRecovery.journal(action,data);
        // One full post-operation snapshot is retained for AFV, N-1 and audio safety.
        await this.refresh();if(this.getObs()!==connection||this.scope!==operation.scope)throw Error('Projeto ou conexão mudou após executar. Confira o Programa.');
        if(action==='input_remove'&&this.state.inputs.some(i=>i.key===target.key))throw Error('Entrada ainda presente após exclusão');
        if(action==='preview'&&this.state.preview!==target.name||['active','cut','fade','transition'].includes(action)&&this.state.program!==target.name)throw Error('O estado final não confirmou o alvo escolhido');
        operation.stage='confirmed';operation.finishedAt=Date.now();this.state={...this.state,operation:{...operation},operationReceipts:[...this.operationReceipts.values()].map(r=>({...r}))};this.publish(this.state);return this.state;
      }catch(error){if(!preservePrevious){operation.stage=executionStarted?'uncertain':'rejected';operation.error=error.message;operation.finishedAt=Date.now();this.state={...this.state,operation:{...operation},operationReceipts:[...this.operationReceipts.values()].map(r=>({...r}))};this.publish(this.state);}throw error;}
      finally{this.sessionRecovery.endMutation();}
    });this.tail=p.catch(()=>{});return p;
  }
  // Explicit correlated read-only reconciliation; never calls execute/refresh/audio routing.
  checkOperation({id,scope}={}) {
    if(!/^[A-Za-z0-9_-]{1,80}$/.test(String(id||''))||typeof scope!=='string'||!scope||scope.length>200)return Promise.reject(Error('Identificação de confirmação inválida'));
    const connection=this.getObs(),cacheKey=scope+':'+id;
    const queued=this.tail.then(async()=>{
      const receipt=this.operationReceipts?.get(cacheKey);
      if(!receipt)throw Error('Comando não identificado; nenhuma operação será repetida.');
      if(!connection||this.getObs()!==connection)throw Error('Conexão mudou durante a consulta. Confira novamente o motor.');
      if(receipt.action==='ftb'){
        const native=await readFinalProgramGate(this,connection);
        const sameContext=native.scope===scope&&this.operationConnections?.get(cacheKey)===connection&&native.contextToken===receipt.finalProgramGate?.contextToken&&native.mixIdentity===receipt.finalProgramGate?.mixIdentity&&native.generation===receipt.finalProgramGate?.generation;
        const desiredMatches=sameContext&&matchesFinalProgramGate(receipt,native);
        if(receipt.stage==='uncertain'&&desiredMatches){Object.assign(receipt,{stage:'confirmed',confirmation:'current-state',reconciledAt:Date.now(),originalStage:'uncertain',pixelsVerified:false});this.state={...this.state,finalProgramGate:native,operation:this.state.operation?.id===id&&this.state.operation?.scope===scope?{...receipt}:this.state.operation,operationReceipts:[...this.operationReceipts.values()].map(r=>({...r}))};this.publish(this.state);}
        return {operation:{...receipt},current:{scope:native.scope,program:{key:native.programUuid},preview:{key:native.previewUuid},transitionComplete:!native.transitionRunning&&!native.resetRequired,finalProgramGate:native},sameContext,desiredMatches,checkedAt:Date.now(),releaseAllowed:receipt.stage==='uncertain'&&!native.transitionRunning&&!native.resetRequired};
      }
      const transitionAction=['cut','fade','transition'].includes(receipt.action);
      const [sc,preset,cursor]=await Promise.all([this.req('GetSceneList'),this.req('GetSceneCollectionList'),transitionAction?this.req('GetCurrentSceneTransitionCursor'):Promise.resolve(null)]);
      if(this.getObs()!==connection)throw Error('Conexão mudou durante a consulta. Confira novamente o motor.');
      const scenes=sc.scenes||[],keyOf=name=>scenes.find(s=>s.sceneName===name)?.sceneUuid||null;
      const current={scope:preset.currentSceneCollectionName,program:{key:sc.currentProgramSceneUuid||keyOf(sc.currentProgramSceneName),name:sc.currentProgramSceneName},preview:{key:sc.currentPreviewSceneUuid||keyOf(sc.currentPreviewSceneName),name:sc.currentPreviewSceneName},transitionComplete:!transitionAction||cursor?.transitionCursor===1};
      const sameContext=current.scope===scope&&this.operationConnections?.get(cacheKey)===connection;
      let desiredMatches=false;
      if(sameContext&&receipt.targetKey){
        if(receipt.action==='input_remove')desiredMatches=!scenes.some(s=>s.sceneUuid===receipt.targetKey);
        else if(receipt.action==='preview')desiredMatches=current.preview.key===receipt.targetKey;
        else if(['active','cut','fade','transition'].includes(receipt.action))desiredMatches=current.program.key===receipt.targetKey&&current.transitionComplete;
      }
      if(receipt.stage==='uncertain'&&desiredMatches){
        Object.assign(receipt,{stage:'confirmed',confirmation:'current-state',reconciledAt:Date.now(),originalStage:'uncertain'});
        this.state={...this.state,operation:this.state.operation?.id===id&&this.state.operation?.scope===scope?{...receipt}:this.state.operation,operationReceipts:[...this.operationReceipts.values()].map(r=>({...r}))};this.publish(this.state);
      }
      return {operation:{...receipt},current,sameContext,desiredMatches,checkedAt:Date.now(),releaseAllowed:receipt.stage==='uncertain'&&current.transitionComplete};
    });this.tail=queued.catch(()=>{});return queued;
  }

  readFinalProgramGate() { return readFinalProgramGate(this,this.getObs()); }

  async prepareRealtime(action,data) {
    const [sc,preset,mode,tr]=await Promise.all([this.req('GetSceneList'),this.req('GetSceneCollectionList'),this.req('GetStudioModeEnabled'),this.req('GetSceneTransitionList')]);
    if(data.expectedScope&&data.expectedScope!==preset.currentSceneCollectionName)throw Error('O projeto mudou. Abra a entrada novamente antes de executar.');
    if(['cut','fade','transition'].includes(action)&&!mode.studioModeEnabled)throw Error('Modo Preview/Programa foi desligado; comando de transição recusado');
    const scenes=sc.scenes.slice().sort((a,b)=>b.sceneIndex-a.sceneIndex).filter(s=>s.sceneName!=='3Mix Barramentos'&&!s.sceneName.startsWith('3Mix Slot '));
    const cached=this.state.inputs||[],sameTopology=scenes.length===cached.length&&scenes.every(s=>cached.some(i=>i.key===s.sceneUuid));
    if(!this.state.connected||this.scope!==preset.currentSceneCollectionName||!sameTopology||Date.now()-(this.state.updatedAt||0)>2500)await this.refresh();
    const names=new Map(scenes.map(s=>[s.sceneUuid,s.sceneName]));
    this.state={...this.state,inputs:this.state.inputs.map(i=>({...i,name:names.get(i.key)||i.name})),program:sc.currentProgramSceneName,preview:sc.currentPreviewSceneName,transitions:tr.transitions,transition:tr.currentSceneTransitionName};
    if(action==='input_remove')await this.guardRealtimeDelete(data.input);
  }
  async guardRealtimeDelete(input) {
    const target=this.scene(input),live=await this.req('GetSceneList');
    if(!live.scenes.some(s=>s.sceneUuid===target.key))throw Error('Entrada removida; exclusão não será repetida');
    if(live.scenes.length<2)throw Error('Não é possível remover a última entrada');
    const tree=await this.realtimeVisibleTree(live.currentProgramSceneName);
    const keyers=await this.vendor('get_downstream_keyers');
    if(!Array.isArray(keyers?.downstream_keyers))throw Error('Não foi possível confirmar overlays antes de excluir');
    for(const k of keyers.downstream_keyers){const selected=await this.vendor('dsk_get_scene',{dsk_name:k.name});if(selected?.scene)await this.realtimeVisibleTree(selected.scene,tree);}
    if(live.currentProgramSceneName===target.name||tree.has(target.name))throw Error('Entrada está no ar: retire do Programa antes de excluir');
    return target;
  }
  async realtimeVisibleTree(name,visited=new Set(),group=false){
    if(!name||visited.has(name))return visited;visited.add(name);
    const r=await this.req(group?'GetGroupSceneItemList':'GetSceneItemList',{sceneName:name});
    if(!Array.isArray(r?.sceneItems))throw Error('Não foi possível confirmar a composição no ar');
    // Mesmo bug de sceneSources()/visibleTree() (ver comentários ali): se a cena-proxy pública de M/E
    // ("PGM M/E N") estiver aninhada na árvore do Programa do MAIN ou de algum DSK -- exatamente
    // o caso de usá-la como signal de Patch (passo 4 do plano) ou dentro de outra Scene -- inputKind===null
    // também bate na transição privada dela, e GetSceneItemList('3Mix Mix N') (a transição, não uma
    // cena) lançava aqui sem guarda nenhuma, quebrando a exclusão de Input nesse cenário real.
    for(const item of r.sceneItems)if(item.sceneItemEnabled!==false){if(item.isGroup||item.sourceType==='OBS_SOURCE_TYPE_SCENE')await this.realtimeVisibleTree(item.sourceName,visited,item.isGroup);else visited.add(item.sourceName);}
    return visited;
  }

  runMacroStep(step,scope,signal){const p=this.tail.then(async()=>{await this.refresh();if(signal.aborted||this.scope!==scope)throw Error('cancelled');await this.routeLegacyAudio();await this.execute(step.action,step.data);await this.refresh();return this.state;});this.tail=p.catch(()=>{});return p;}
  startDataPoll() {
    if(this.dataPollTask||this.dataPollReady)return;
    this.dataPollTask=this.dataSources.preparePoll().then(batch=>{this.dataPollReady=batch;},error=>{this.dataPollError=error.message;}).finally(()=>{this.dataPollTask=null;});
  }
  tick() { const p=this.tail.then(async()=>{await this.refresh();if(await this.routeLegacyAudio())await this.refresh();if(!this.state.buses&&!this.state.recording&&!this.state.streaming&&this.autoBusScope!==this.scope){this.autoBusScope=this.scope;try{await this.execute('audio_enable',{});this.busSetupError=null;await this.refresh();}catch(e){this.busSetupError=e.message;this.state={...this.state,busSetupError:e.message};this.publish(this.state);}}const dataSourcesAtivo=this.moduloAtivo('dataSources');const batch=dataSourcesAtivo?this.dataPollReady:null;this.dataPollReady=null;const changes=batch?await this.dataSources.applyPoll(batch):[];if(dataSourcesAtivo)this.startDataPoll();for(const s of changes)if(s.binding?.autoPublish){try{await this.publishData(s.id);}catch(e){s.error='Publicação: '+e.message;}}const summary=this.dataSources.summary();if(JSON.stringify(summary)!==JSON.stringify(this.state.dataSources)){this.state={...this.state,dataSources:summary,revision:++this.generation};this.publish(this.state);}await this.queueEngine.observe();this.macroEngine.observe?.(this.state);await this.signalEngine.observe();this.state.signals=this.signalEngine.summary();this.publish(this.state);return this.state;}); this.tail=p.catch(()=>{}); return p; }
  async routeLegacyAudio() {
    if(!this.state.buses)return false;let changed=false;const director=await this.callEngine.source();
    for(const input of this.state.audioInputs.filter(a=>!a.bus&&a.name!==director?.inputName)) {
      const tracks=(await this.req('GetInputAudioTracks',{inputName:input.name})).inputAudioTracks;
      if(!['1','2','3'].some(t=>tracks[t]))continue;
      const fresh=['1','2','3','4','5','6'].every(t=>tracks[t]);
      await this.req('SetInputAudioTracks',{inputName:input.name,inputAudioTracks:{'1':false,'2':false,'3':false,'4':fresh||tracks['1']||tracks['4'],'5':!fresh&&(tracks['2']||tracks['5']),'6':!fresh&&(tracks['3']||tracks['6'])}});changed=true;
    }
    return changed;
  }
  disconnected() { this.macroEngine.cancel();this.rundownEngine?.disconnected?.();this.globalHotkeys.disconnected();this.autoBusScope=null;this.busSetupError=null;this.state={...this.state,connected:false}; this.levels.clear(); this.publish(this.state); }
  onMeters(inputs=[]) {
    for(const i of inputs) this.levels.set(i.inputName,{levels:(i.inputLevelsMul||[]).map(ch=>Math.max(0,ch[1]||0)),at:Date.now()});
  }
  // tentativas=60 (3s) serve corte/transicao/audio; parar uma saida com atraso de seguranca
  // ativo so libera outputActive depois de ~delaySeconds reais (obs_output_delay_stop no motor
  // so esvazia a fila do atraso antes de sinalizar parado) -- por isso esse caller pode pedir
  // um teto maior, proporcional ao atraso configurado, em vez do fixo de sempre.
  async wait(type,data,test,tentativas=60) { for(let i=0;i<tentativas;i++){const r=await this.req(type,data); if(test(r)) return r; await delay(50);} throw new Error(`O motor não confirmou ${type}`); }
  async sceneSources(name,visited=new Set()) {
    if(visited.has(name)) return []; visited.add(name);
    const r=await this.req('GetSceneItemList',{sceneName:name}); const sources=[];
    // Bug real encontrado em QA (qa-beta/recibos/switcher-strip-patch-audio-tally-e2e.md): um item com
    // inputKind===null NÃO é só uma cena aninhada -- a transição privada dentro da cena-proxy pública de
    // nesting de M/E ("PGM M/E N", de FreeMixMixEffectManager.hpp) também tem inputKind===null
    // (sourceType OBS_SOURCE_TYPE_TRANSITION, não OBS_SOURCE_TYPE_SCENE). Recursar nela chamava
    // GetSceneItemList numa cena que não existe ("3Mix Mix 2" é a transição, não uma cena registrada),
    // lançando um erro não tratado que derrubava refresh() inteiro -- e portanto connected:false na API
    // toda -- assim que qualquer M/E 2-4 fazia seu primeiro preview+cut/fade/take. Mesmo filtro por
    // sourceType já usado em entradas-producao.mjs (InputEngine.cycle()) para o mesmo tipo de bug.
    for(const i of r.sceneItems){ if(i.isGroup) { const g=await this.req('GetGroupSceneItemList',{sceneName:i.sourceName}); sources.push(...g.sceneItems.map(s=>s.sourceName)); }
      else if(i.sourceType==='OBS_SOURCE_TYPE_SCENE') sources.push(...await this.sceneSources(i.sourceName,visited)); else sources.push(i.sourceName); }
    return [...new Set(sources)];
  }
  async visibleTree(name,visited=new Set(),group=false){
    if(!name||visited.has(name))return visited;visited.add(name);
    const r=await this.optional(group?'GetGroupSceneItemList':'GetSceneItemList',{sceneName:name});
    // Mesmo bug de sceneSources() (ver comentário ali): inputKind===null também é verdade pra transição
    // privada dentro da cena-proxy pública de M/E ("PGM M/E N"), não só pra cena aninhada.
    // optional() já evitava um crash aqui (retorna null, loop vira no-op), mas descer com sourceType
    // explícito é a checagem correta -- meTally() usa exatamente esta função pro tally recursivo do
    // passo 7, então classificar certo aqui importa pra correção do recurso, não só pra não quebrar.
    for(const item of r?.sceneItems||[])if(item.sceneItemEnabled!==false){if(item.isGroup||item.sourceType==='OBS_SOURCE_TYPE_SCENE')await this.visibleTree(item.sourceName,visited,item.isGroup);else visited.add(item.sourceName);}
    return visited;
  }
  async refresh() {
    const obs=this.getObs(); if(!obs){this.disconnected(); throw new Error('Sem conexão com o motor 3Mix');}
    const [sc,ins,rec,stream,tr,preset,video]=await Promise.all([
      this.req('GetSceneList'),this.req('GetInputList'),this.req('GetRecordStatus'),this.req('GetStreamStatus'),this.req('GetSceneTransitionList'),this.req('GetSceneCollectionList'),this.req('GetVideoSettings')]);
    if(this.scope!==preset.currentSceneCollectionName){
      this.scope=preset.currentSceneCollectionName;this.variables={};
      this.file=join(this.root,'config','obs-studio','plugin_config','freemix-control',createHash('sha256').update(this.scope).digest('hex').slice(0,24)+'.json');
      try {this.gc=JSON.parse(await readFile(this.file,'utf8')).gc||{};} catch(e){if(e.code!=='ENOENT') throw e; this.gc={};}
    }
    await this.dataSources.setScope(this.scope);
    await this.macroEngine.setScope(this.scope);
    if(typeof this.rundownEngine?.setScope==='function')await this.rundownEngine.setScope(this.scope);
    await this.ptzManager.setScope(this.scope);
    await this.inputEngine.setScope(this.scope);
    await this.gcCompatible.setScope(this.scope);await this.gcLibrary.setScope(this.scope);await this.overlayEngine.setScope(this.scope);this.signalEngine.setScope(this.scope);await this.patchRegistry.setScope(this.scope);await this.mixAudio.setScope(this.scope);
    const sceneFingerprint=JSON.stringify([this.scope,sc.scenes.map(s=>s.sceneUuid).sort()]);
    if(this.privateSceneFingerprint!==sceneFingerprint){await this.inputEngine.prunePrivateScenes();this.privateSceneFingerprint=sceneFingerprint;}
    await this.queueEngine.setScope(this.scope);
    await this.controllerEngine.setScope(this.scope);
    if(this.studioSocial)await this.studioSocial.setScope(this.scope).catch(e=>{this.studioSocialError=e.message;});
    await this.callEngine.setScope(this.scope);const callProgramNames=this.callEngine.individual?[...await this.visibleTree(sc.currentProgramSceneName)]:null;await this.callEngine.enforce({programNames:callProgramNames,inputSnapshot:ins.inputs});
    const audio=[],media=[];
    for(const inp of ins.inputs){
      const name=inp.inputName, kind=inp.unversionedInputKind||inp.inputKind;
      const [vol,mute,tracks,monitor,balance]=await Promise.all([
        this.optional('GetInputVolume',{inputName:name}),this.optional('GetInputMute',{inputName:name}),this.optional('GetInputAudioTracks',{inputName:name}),this.optional('GetInputAudioMonitorType',{inputName:name}),this.optional('GetInputAudioBalance',{inputName:name})]);
      if(vol&&mute){const meter=this.levels.get(name); audio.push({name,kind,volumeMul:vol.inputVolumeMul,volumeDb:vol.inputVolumeDb,muted:mute.inputMuted,tracks:tracks?.inputAudioTracks||{},monitor:monitor?.monitorType,balance:balance?.inputAudioBalance,levels:meter&&Date.now()-meter.at<1500?meter.levels:[],bus:Object.keys(busNames).find(k=>busNames[k]===name)||null});}
      if(mediaKind(kind)){
        const [s,m]=await Promise.all([this.req('GetInputSettings',{inputName:name}),this.optional('GetMediaInputStatus',{inputName:name})]);
        const set=s.inputSettings, list=set.playlist||set.list||[];
        media.push({name,kind,state:m?.mediaState||'OBS_MEDIA_STATE_NONE',position:m?.mediaCursor??null,duration:m?.mediaDuration??null,
          speed:set.speed_percent??100,loop:!!(set.looping??set.loop??false),autoNext:!(set.pause_between_media??false),
          items:list.map((p,i)=>({index:i,title:basename(typeof p==='string'?p:p.value||p.file||''),hidden:!!p.hidden})),currentFile:basename(set.local_file||'')});
      }
    }
    const keyers=await this.optional('CallVendorRequest',{vendorName:'downstream-keyer',requestType:'get_downstream_keyers',requestData:{}});
    let buses=Object.values(busNames).every(name=>audio.some(a=>a.name===name&&a.kind==='mix-track-to-source'));
    if(buses){for(const [i,name] of Object.values(busNames).entries()){const setting=await this.req('GetInputSettings',{inputName:name}),a=audio.find(a=>a.name===name);if(Number(setting.inputSettings.MixTrack)!==i+3||!['1','2','3','4','5','6'].every(t=>!!a.tracks[t]===(t===String(i+1))))buses=false;}
      const selected=keyers?.responseData?.downstream_keyers?.some(k=>k.name==='3Mix Audio')?await this.vendor('dsk_get_scene',{dsk_name:'3Mix Audio'}):null;
      const items=await this.optional('GetSceneItemList',{sceneName:'3Mix Barramentos'});buses=buses&&selected?.scene==='3Mix Barramentos'&&Object.values(busNames).every(name=>items?.sceneItems.some(i=>i.sourceName===name&&i.sceneItemEnabled));}
    const scenes=sc.scenes.slice().sort((a,b)=>b.sceneIndex-a.sceneIndex).filter(s=>s.sceneName!=='3Mix Barramentos'&&!s.sceneName.startsWith('3Mix Slot '));
    const inputs=[];
    for(const [i,s] of scenes.entries()){
      const sources=await this.sceneSources(s.sceneName), m=media.find(m=>sources.includes(m.name)), a=audio.filter(a=>sources.includes(a.name));
      inputs.push({name:s.sceneName,number:i+1,key:s.sceneUuid||createHash('sha256').update(s.sceneName).digest('hex').slice(0,32),sources,
        type:m?(/playlist|vlc/.test(m.kind)?'VideoList':'Video'):ins.inputs.some(x=>sources.includes(x.inputName)&&x.inputKind==='browser_source')?'Browser':'Camera',
        media:m?.name||null,position:m?.position??null,duration:m?.duration??null,state:m?.state||null,loop:m?.loop??false,
        muted:a.length?a.every(x=>x.muted):null,volume:a.length?Math.round(a.reduce((n,x)=>n+x.volumeMul,0)/a.length*100):null,
        audioBuses:Object.entries(buses?{M:'4',A:'5',B:'6'}:{M:'1',A:'2',B:'3'}).filter(([,t])=>a.some(x=>x.tracks[t])).map(([k])=>k).join(',')});
    }
    const overlays=[];
    for(const k of keyers?.responseData?.downstream_keyers||[]) if(/^\d+$/.test(k.name)) {const r=await this.vendor('dsk_get_scene',{dsk_name:k.name}); overlays.push({number:Number(k.name),scene:r.scene||''});}
    const [programTree,previewTree]=await Promise.all([this.visibleTree(sc.currentProgramSceneName),this.visibleTree(sc.currentPreviewSceneName)]);
    for(const overlay of overlays)if(overlay.scene)await this.visibleTree(overlay.scene,programTree);
    const tally={program:[...programTree],preview:[...previewTree]};
    const sourceStatus=(await this.optional('CallVendorRequest',{vendorName:'freemix',requestType:'get_sources_status',requestData:{}}))?.responseData?.sources||[];
    for(const input of inputs)input.health={sources:sourceStatus.filter(s=>s.name===input.name||input.sources.includes(s.name)),mediaState:input.state,signal:'unknown',freeze:'unknown'};
    for(const input of inputs)input.tally={program:programTree.has(input.name),preview:previewTree.has(input.name)};
    const gc={...this.gc}; gc.activeLowerThird=overlays.some(o=>o.scene==='3Mix Tarja'); gc.activeScore=overlays.some(o=>o.scene==='3Mix Placar');
    await this.broadcastDelayEngine.refresh();
    this.state={operation:this.state.operation,operationReceipts:[...(this.operationReceipts?.values()||[])].map(r=>({...r})),connected:true,preset:this.scope,scenes:inputs.map(i=>i.name),inputs:this.inputEngine.decorate(inputs,video),compositionTemplates:structuredClone(this.inputEngine.templates),compositionPresets:this.inputEngine.presets?.()||[],gcLibrary:this.gcLibrary.summary(),program:sc.currentProgramSceneName,preview:sc.currentPreviewSceneName,
      sourceStatus,tally,signals:this.signalEngine.summary(),sourceInputs:ins.inputs.map(i=>({key:i.inputUuid,name:i.inputName,kind:i.unversionedInputKind||i.inputKind})),variables:this.dataSources.publishedVariables(),people:this.dataSources.people(),audioInputs:audio,media,overlays,overlaysEngine:this.overlayEngine.summary(),preflight:this.preflightEngine.summary(),blackbox:this.blackboxEngine.summary(),broadcastDelay:this.broadcastDelayEngine.summary(),returnFeeds:this.returnFeedManager.summary(),audioDucking:this.audioDuckingEngine.summary(),rundown:this.rundownEngine.summary(),gc,buses,calls:await this.callEngine.summary(inputs),dataSources:this.dataSources.summary(),recording:rec.outputActive,streaming:stream.outputActive,recordTimecode:rec.outputTimecode,streamTimecode:stream.outputTimecode,
      transition:tr.currentSceneTransitionName,transitions:tr.transitions,video,controllers:this.controllerEngine.summary(),playout:this.playoutEngine.summary(),queue:this.playoutEngine.summary(),recoverySession:this.sessionRecovery.summary(),macros:this.macroEngine.summary(),busSetupError:this.busSetupError||null,revision:++this.generation,updatedAt:Date.now()};
    this.state.globalHotkeys=await this.globalHotkeys.sync();this.state.controllers=this.controllerEngine.summary();this.state.playout=this.playoutEngine.summary();this.state.queue=this.playoutEngine.summary();
    await this.inputEngine.observeAudio(this.state);
    await this.keepAudioInputsLive().catch(e=>{this.audioLiveError=e.message;});
    this.state.audioRouting=await this.audioRoutingEngine.refresh({scope:this.scope,audioInputs:audio,sourceInputs:this.state.sourceInputs,tally,director:this.state.calls?.director,connected:true});this.publish(this.state); return this.state;
  }
  // O motor só mede e mistura fonte ativa. A cena de barramentos fica sempre ativa, então é ela que segura
  // as entradas só de áudio: microfone e áudio do computador não dependem de corte. Quem quer que o áudio
  // acompanhe o vídeo liga o AFV. Mic junto de uma câmera continua seguindo a cena dela.
  async keepAudioInputsLive(){
    if(!this.state.buses)return;
    const kinds=new Set(['wasapi_input_capture','wasapi_output_capture','wasapi_process_output_capture','asio_input_capture','coreaudio_input_capture','coreaudio_output_capture','pulse_input_capture','pulse_output_capture','alsa_input_capture']);
    const kindOf=new Map((this.state.sourceInputs||[]).map(x=>[x.name,x.kind]));
    const wanted=new Set();
    for(const input of this.state.inputs||[])if(!input.composition&&input.sources?.length&&input.sources.every(name=>kinds.has(kindOf.get(name))))input.sources.forEach(name=>wanted.add(name));
    const signature=JSON.stringify([this.scope,[...wanted].sort()]);
    if(signature===this.audioLiveSignature)return;
    const scene='3Mix Barramentos',items=(await this.req('GetSceneItemList',{sceneName:scene})).sceneItems;
    const onAir=this.state.recording||this.state.streaming;
    for(const name of wanted){
      if(items.some(item=>item.sourceName===name))continue;
      await this.req('CreateSceneItem',{sceneName:scene,sourceName:name,sceneItemEnabled:true});
      // Criada no meio de uma transmissão, não abre microfone no ar sem o operador pedir.
      if(onAir)await this.optional('SetInputMute',{inputName:name,inputMuted:true});
    }
    // Entrada removida: solta a fonte, senão o microfone continuaria capturando sem aparecer na mesa.
    for(const item of items)if(!item.sourceName.startsWith('3Mix ')&&kinds.has(kindOf.get(item.sourceName))&&!wanted.has(item.sourceName))await this.optional('RemoveSceneItem',{sceneName:scene,sceneItemId:item.sceneItemId});
    this.audioLiveSignature=signature;this.audioLiveError=null;
  }
  scene(arg) {const i=this.state.inputs.find(i=>i.name===String(arg)||i.key===arg)||(/^\d+$/.test(String(arg))?this.state.inputs.find(i=>i.number===Number(arg)):null); if(!i) throw new Error('Entrada não encontrada'); return i;}
  audioNames(arg) {if(busNames[arg]) arg=busNames[arg]; if(this.state.audioInputs.some(a=>a.name===arg)) return [arg]; const i=this.scene(arg); const names=this.state.audioInputs.filter(a=>i.sources.includes(a.name)).map(a=>a.name); if(!names.length) throw new Error('Esta entrada não possui áudio controlável'); return names;}
  media(arg) {if(arg){const m=this.state.media.find(m=>m.name===arg)||this.state.media.find(m=>m.name===this.scene(arg).media); if(m) return m;}
    const m=this.state.media.find(m=>/playlist|vlc/.test(m.kind))||this.state.media.find(m=>m.name===this.state.inputs.find(i=>i.name===this.state.preview)?.media); if(!m) throw new Error('Selecione uma entrada de mídia'); return m;}
  async overlay(channel,scene='') {
    channel=number(channel,1,8,'Overlay');
    const names=(await this.vendor('get_downstream_keyers')).downstream_keyers||[];
    if(!names.some(k=>k.name===String(channel))) {await this.vendor('add_downstream_keyer',{dsk_name:String(channel)});await delay(100);}
    if(scene){this.scene(scene);try{await this.vendor('dsk_add_scene',{dsk_name:String(channel),scene});}catch{ /* Already in this keyer's scene list; selection below is authoritative. */ }}
    await this.vendor('dsk_select_scene',{dsk_name:String(channel),scene});
    for(let n=0;n<40;n++){if((await this.vendor('dsk_get_scene',{dsk_name:String(channel)})).scene===scene) return; await delay(50);} throw new Error('O overlay não confirmou a troca');
  }
  async title(kind,data,on) {
    const score=kind==='score', scene=score?'3Mix Placar':'3Mix Tarja', input=scene+' HTML', channel=score?2:1;
    const file=score?'esportes/placar.html':'jornalismo/lower_third.html', t=score?'esporte_placar':'jornal_lower_third';
    const d=score?{timeA:data.teamHome??this.gc.teamHome??'CASA',timeB:data.teamAway??this.gc.teamAway??'VISITANTE',golsA:data.scoreHome??this.gc.scoreHome??0,golsB:data.scoreAway??this.gc.scoreAway??0,minutos:data.minutes??this.gc.minutes??0,periodo:data.period??this.gc.period??'1º T'}:{nome:data.title??this.gc.title??'',cargo:data.subtitle??this.gc.subtitle??'',cor:data.color??this.gc.color??'#00e676'};
    const url=pathToFileURL(join(this.panel,'gc',file)).href+'#'+encodeURIComponent(JSON.stringify({n:input,t,d}));
    if(!this.state.scenes.includes(scene)) await this.req('CreateScene',{sceneName:scene});
    const before=await this.optional('GetInputSettings',{inputName:input});
    if(!before) {const created=await this.req('CreateInput',{sceneName:scene,inputName:input,inputKind:'browser_source',inputSettings:{url,width:1920,height:1080,shutdown:false,restart_when_active:false,reroute_audio:true},sceneItemEnabled:true});await this.req('SetSceneItemTransform',{sceneName:scene,sceneItemId:created.sceneItemId,sceneItemTransform:{positionX:0,positionY:0,boundsType:'OBS_BOUNDS_SCALE_INNER',boundsWidth:this.state.video.baseWidth,boundsHeight:this.state.video.baseHeight,boundsAlignment:0}});}
    else {
      if(before.inputKind!=='browser_source') throw new Error('A fonte de GC existente não é um título HTML');
      await this.vendor('emit_event',{event_name:'freemix-gc',event_data:{name:input,data:d}},'obs-browser');
      // Preserve the on-air page. Persist its edited address once the overlay is removed.
      if(!this.state.overlays.some(o=>o.scene===scene)) await this.req('SetInputSettings',{inputName:input,inputSettings:{url}});
    }
    this.gc={...this.gc,...data};
    await this.refresh();
    if(typeof on==='boolean') {
      if(!on){await this.vendor('emit_event',{event_name:'freemix-gc',event_data:{name:input,show:false}},'obs-browser'); await delay(550);}
      await this.overlay(channel,on?scene:'');
      if(!on) await this.req('SetInputSettings',{inputName:input,inputSettings:{url}});
      else await this.vendor('emit_event',{event_name:'freemix-gc',event_data:{name:input,data:d,show:true}},'obs-browser');
    }
    await mkdir(join(this.root,'config','obs-studio','plugin_config','freemix-control'),{recursive:true}); await writeFile(this.file+'.tmp',JSON.stringify({gc:this.gc})); await rename(this.file+'.tmp',this.file);
  }
  async publishData(id,on){const mapped=this.dataSources.mapped(id);
    if(mapped.kind==='person'){
      const values=mapped.data,name=String(values.title||'').trim();if(!name||name.length>200)throw Error('Informe o nome da pessoa');
      const input=values.input?this.scene(values.input):null,guests=(await this.callEngine.summary(this.state.inputs)).guests,guest=values.call?guests.find(g=>[g.key,g.name,g.id].includes(values.call)):null;if(values.call&&!guest)throw Error('Call da pessoa não encontrado');
      const previousPreview=this.state.preview,previousTargets=this.callEngine.rapidTargets;
      try{await this.title('lower',{title:name,subtitle:String(values.subtitle||''),color:values.color||'#00e676'},on);if(input)await this.req('SetCurrentPreviewScene',{sceneUuid:input.key});if(guest)await this.callEngine.execute('call_rapid_targets',{targets:[guest.key]});await this.dataSources.publishPerson(id,{name,inputKey:input?.key||null,callKey:guest?.key||null});}
      catch(e){if(input)await this.optional('SetCurrentPreviewScene',{sceneName:previousPreview});if(guest)try{await this.callEngine.execute('call_rapid_targets',{targets:previousTargets??null});}catch{}throw e;}return;
    }
    if(['lower','score'].includes(mapped.kind))return this.title(mapped.kind,mapped.data,on);
    if(mapped.kind==='variables'){this.state.variables=await this.dataSources.publishVariables(id);return;}
    if(mapped.kind==='inputName'){const scene=this.scene(mapped.target),name=String(mapped.data.name||'').trim();if(!name||name.length>60||/[\x00-\x1f]/.test(name))throw Error('Nome da entrada inválido');await this.req('SetSceneName',{sceneUuid:scene.key,newSceneName:name});return;}
    const all=(await this.req('GetInputList')).inputs,source=all.find(i=>i.inputUuid===mapped.target||i.inputName===mapped.target);if(!source)throw Error('Fonte de destino não encontrada');
    if(source.inputName===this.state.calls?.director?.name)throw Error('O microfone privado não pode receber vínculo de dados');
    if(mapped.kind==='text'){if(!/^text_(gdiplus|ft2)/.test(source.inputKind||source.unversionedInputKind||''))throw Error('O destino precisa ser uma fonte de texto');await this.req('SetInputSettings',{inputUuid:source.inputUuid,inputSettings:{text:String(mapped.data.text||'')},overlay:true});const actual=(await this.req('GetInputSettings',{inputUuid:source.inputUuid})).inputSettings;if(actual.text!==String(mapped.data.text||''))throw Error('Texto não confirmado pelo motor');return;}
    if(mapped.kind==='browser'){if(source.inputKind!=='browser_source')throw Error('O destino precisa ser uma fonte HTML');await this.vendor('emit_event',{event_name:'freemix-data',event_data:{name:source.inputName,sourceId:id,values:mapped.data}},'obs-browser');return;}
    throw Error('Destino de dados não implementado');
  }
  async execute(action,d) {
    if(action==='clock_message')return setClockMessage(this,d);
    if(action.startsWith('effects_')){this.effectsResult=await this.effectsEngine.execute(action,d);return;}
    if(action.startsWith('signal_'))return this.signalEngine.execute(action,d);
    if(action.startsWith('patch_'))return this.patchRegistry.execute(action,d);
    if(action.startsWith('mix_audio_'))return this.mixAudio.execute(action,d);
    if(action.startsWith('gc_html_')){this.gcCompatible.last=await this.gcCompatible.execute(action,d);return;}
    if(action.startsWith('gc_library_')){this.gcLibrary.last=await this.gcLibrary.execute(action,d);return;}
    if(action.startsWith('outputs_')){await this.outputEngine.execute(action,d);return;}
    if(action.startsWith('controller_')){this.controllerEngine.last=await this.controllerEngine.execute(action,d);return;}
    if(action.startsWith('preflight_'))return this.preflightEngine.execute(action,d);
    if(action.startsWith('blackbox_'))return this.blackboxEngine.execute(action,d);
    if(action.startsWith('delay_')||action==='dump')return this.broadcastDelayEngine.execute(action,d);
    if(action.startsWith('return_feed_'))return this.returnFeedManager.execute(action,d);
    if(action.startsWith('ducking_'))return this.audioDuckingEngine.execute(action,d);
    if(action.startsWith('rundown_'))return this.rundownEngine.execute(action,d);
    if(action.startsWith('ptz_')){this.ptzResult=await this.ptzManager.execute(action,d);return;}
    if(action.startsWith('playout_')||action.startsWith('queue_'))return this.playoutEngine.execute(action,d);
    if(action.startsWith('network_')){await this.networkEngine.execute(action,d);return;}
    if(action.startsWith('recovery_')){this.recoveryResult=await this.recoveryEngine.execute(action,d);return;}
    if(action.startsWith('macro_'))return this.macroEngine.execute(action,d);
    if(action.startsWith('call_')){this.callResult=await this.callEngine.execute(action,d);return;}
    if(action.startsWith('settings_'))return this.settingsEngine.execute(action,d);
    if(action==='input_remove'){const target=await this.guardRealtimeDelete(d.input);return this.inputEngine.execute(action,{...d,input:target.key});}if(action.startsWith('input_'))return this.inputEngine.execute(action,d);
    if(action.startsWith('overlay_')){this.overlayResult=await this.overlayEngine.execute(action,d);return;}
    if(action.startsWith('audio_routing_'))return this.audioRoutingEngine.execute(action,d);
    switch(action){
      case 'audio_enable': {
        if(this.state.buses)return;
        if(this.state.recording||this.state.streaming)throw Error('Pare gravação e transmissão antes de configurar os barramentos');
        const kinds=(await this.req('GetInputKindList')).inputKinds;if(!kinds.includes('mix-track-to-source'))throw new Error('O componente de barramentos não está instalado');
        const scene='3Mix Barramentos', key='3Mix Audio', old=[];const created=[];
        try {
          for(const name of Object.values(busNames)){const existing=await this.optional('GetInputSettings',{inputName:name});if(existing&&existing.inputKind!=='mix-track-to-source')throw Error('O nome '+name+' já pertence a outra fonte. Renomeie essa fonte antes de configurar os barramentos.');}
          if(!(await this.req('GetSceneList')).scenes.some(s=>s.sceneName===scene))await this.req('CreateScene',{sceneName:scene});
          for(const [i,name] of Object.values(busNames).entries()){
            const existing=await this.optional('GetInputSettings',{inputName:name});
            if(existing&&existing.inputKind!=='mix-track-to-source')throw Error('O nome '+name+' já pertence a outra fonte. Renomeie essa fonte antes de configurar os barramentos.');
            if(!existing) {const c=await this.req('CreateInput',{sceneName:scene,inputName:name,inputKind:'mix-track-to-source',inputSettings:{MixTrack:i+3},sceneItemEnabled:false});created.push(name);await this.req('SetSceneItemTransform',{sceneName:scene,sceneItemId:c.sceneItemId,sceneItemTransform:{positionX:-30000,positionY:-30000}});}
            else await this.req('SetInputSettings',{inputName:name,inputSettings:{MixTrack:i+3}});
            await this.req('SetInputAudioTracks',{inputName:name,inputAudioTracks:Object.fromEntries(['1','2','3','4','5','6'].map(t=>[t,t===String(i+1)]))});
            let item=(await this.req('GetSceneItemList',{sceneName:scene})).sceneItems.find(x=>x.sourceName===name);if(!item){const c=await this.req('CreateSceneItem',{sceneName:scene,sourceName:name,sceneItemEnabled:false});item={sceneItemId:c.sceneItemId};await this.req('SetSceneItemTransform',{sceneName:scene,sceneItemId:c.sceneItemId,sceneItemTransform:{positionX:-30000,positionY:-30000}});}await this.req('SetSceneItemEnabled',{sceneName:scene,sceneItemId:item.sceneItemId,sceneItemEnabled:true});
          }
          for(const a of this.state.audioInputs.filter(a=>!a.bus)){old.push(a);const fresh=['1','2','3','4','5','6'].every(t=>a.tracks[t]);await this.req('SetInputAudioTracks',{inputName:a.name,inputAudioTracks:{'1':false,'2':false,'3':false,'4':!!a.tracks['1']||!!a.tracks['4'],'5':!fresh&&(!!a.tracks['2']||!!a.tracks['5']),'6':!fresh&&(!!a.tracks['3']||!!a.tracks['6'])}});}
          const keys=(await this.vendor('get_downstream_keyers')).downstream_keyers||[];if(!keys.some(k=>k.name===key)){await this.vendor('add_downstream_keyer',{dsk_name:key});await delay(1000);}
          try{await this.vendor('dsk_add_scene',{dsk_name:key,scene});}catch{}await this.vendor('dsk_select_scene',{dsk_name:key,scene});
          if((await this.vendor('dsk_get_scene',{dsk_name:key})).scene!==scene)throw new Error('Barramentos não entraram no caminho de áudio');
          this.busSetupError=null;
        }catch(e){for(const a of old)await this.optional('SetInputAudioTracks',{inputName:a.name,inputAudioTracks:a.tracks});for(const name of created)await this.optional('RemoveInput',{inputName:name});throw e;}
        break;
      }
      case 'preview': {const scene=this.scene(d.input).name; await this.req('SetCurrentPreviewScene',{sceneName:scene}); await this.wait('GetSceneList',{},s=>s.currentPreviewSceneName===scene); break;}
      case 'active': {const scene=this.scene(d.input).name; await this.req('SetCurrentProgramScene',{sceneName:scene}); await this.wait('GetSceneList',{},s=>s.currentProgramSceneName===scene); break;}
      case 'cut': case 'fade': case 'transition': {
        const direct=!!d.input;
        const before=await this.req('GetSceneList');
        const previousProgram=before.currentProgramSceneName;
        const previousPreview=before.currentPreviewSceneName;
        const directName=direct?this.scene(d.input).name:'';
        // Clicar no PGM da própria entrada que já está no ar não deve mexer em nada.
        if(direct&&directName===previousProgram)break;
        // Flip-Flop broadcast clássico: na transição padrão de corte/fade (Preview -> Program),
        // o que estava no Program vai para o Preview após a transição.
        // Se for um corte direto para uma entrada diferente do Preview atual, restaura o Preview anterior preservando a pré-seleção.
        const nextPreview=(!direct||directName===previousPreview)?previousProgram:previousPreview;
        if(direct){await this.req('SetCurrentPreviewScene',{sceneName:directName});await this.wait('GetSceneList',{},s=>s.currentPreviewSceneName===directName);}
        const t=action==='transition'?await this.req('GetCurrentSceneTransition'):this.state.transitions.find(t=>t.transitionKind===(action==='cut'?'cut_transition':'fade_transition')); if(!t) throw new Error('Transição indisponível');
        // OBS refuses selection while the preceding AUDIO transition is still active,
        // even when its visual cursor already reads 1. Retry selection until confirmed.
        let selected=action==='transition';for(let n=0;!selected&&n<60;n++){await this.req('SetCurrentSceneTransition',{transitionName:t.transitionName});if((await this.req('GetCurrentSceneTransition')).transitionKind===t.transitionKind){selected=true;break;}await delay(50);}if(!selected)throw new Error('A transição anterior ainda está ativa');
        if(action==='fade') await this.req('SetCurrentSceneTransitionDuration',{transitionDuration:number(d.duration??500,50,20000,'Duração')});
        // CUT selection was already confirmed above; only fade duration needs another read.
        if(action==='fade') await this.wait('GetCurrentSceneTransition',{},s=>s.transitionKind===t.transitionKind&&s.transitionDuration===Number(d.duration??500));
        const target=(await this.req('GetSceneList')).currentPreviewSceneName;
        await this.req('TriggerStudioModeTransition'); await this.wait('GetSceneList',{},s=>s.currentProgramSceneName===target);
        // Program is selected at transition START, not at its final video frame.
        // Poll completion immediately for CUT; wait() still retries if the engine is busy.
        if(t.transitionKind!=='cut_transition')await delay(action==='fade'?Number(d.duration??500)+50:Math.max(50,Math.min(20000,Number(t.transitionDuration)||0)+50));
        await this.wait('GetCurrentSceneTransitionCursor',{},s=>s.transitionCursor===1);
        if(nextPreview&&nextPreview!==target){await this.req('SetCurrentPreviewScene',{sceneName:nextPreview}).catch(()=>{});await this.wait('GetSceneList',{},s=>s.currentPreviewSceneName===nextPreview).catch(()=>{});}
        break;
      }
      case 'tbar': {const position=number(d.position,0,1,'Posição');await this.req('SetTBarPosition',{position,release:d.release===true});if(position>0&&position<1&&!d.release)await this.wait('GetCurrentSceneTransitionCursor',{},s=>Math.abs(s.transitionCursor-position)<.06);break;}
      case 'audio_mute': case 'audio_volume': case 'audio_bus': case 'audio_monitor': case 'audio_balance': {
        const names=this.audioNames(d.input); const mute=d.muted??!this.state.audioInputs.filter(a=>names.includes(a.name)).every(a=>a.muted);
        if(action==='audio_mute')await this.audioRoutingEngine.manualOverride(names);
        for(const name of names){const inputName=name;
          if(['audio_mute','audio_bus','audio_monitor'].includes(action)&&this.state.calls?.director?.name===name)throw Error('Este mic é privado; use o botão de talkback da central Calls');
          if(action==='audio_bus'&&d.bus==='M'&&name==='3Mix Bus B'&&this.state.calls?.director)throw Error('O retorno B está reservado ao talkback e não pode alimentar o Master');
          if(action==='audio_mute'){await this.req('SetInputMute',{inputName,inputMuted:!!mute}); await this.wait('GetInputMute',{inputName},s=>s.inputMuted===!!mute);}
          if(action==='audio_volume'){const volume=number(d.volume,0,100,'Volume')/100; await this.req('SetInputVolume',{inputName,inputVolumeMul:volume}); await this.wait('GetInputVolume',{inputName},s=>Math.abs(s.inputVolumeMul-volume)<0.001);}
          if(action==='audio_bus') {const track=(this.state.buses?{M:'4',A:'5',B:'6'}:{M:'1',A:'2',B:'3'})[d.bus]; if(!track) throw new Error('Barramento deve ser M, A ou B'); const before=(await this.req('GetInputAudioTracks',{inputName})).inputAudioTracks; const enabled=d.enabled??!before[track]; await this.req('SetInputAudioTracks',{inputName,inputAudioTracks:{[track]:!!enabled}}); await this.wait('GetInputAudioTracks',{inputName},s=>s.inputAudioTracks[track]===!!enabled);}
          if(action==='audio_monitor'){const type=d.enabled?'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT':'OBS_MONITORING_TYPE_NONE'; await this.req('SetInputAudioMonitorType',{inputName,monitorType:type}); await this.wait('GetInputAudioMonitorType',{inputName},s=>s.monitorType===type);}
          if(action==='audio_balance') await this.req('SetInputAudioBalance',{inputName,inputAudioBalance:number(d.balance,0,1,'Balanço')});
        } break;
      }
      case 'record': case 'stream': {const prefix=action==='record'?'Record':'Stream'; await this.req((d.active?'Start':'Stop')+prefix);
        // Parar a transmissao com o Atraso/DUMP ativo so confirma outputActive:false depois que o
        // motor esvazia a fila do atraso (obs_output_delay_stop); o teto padrao de 3s (60*50ms) nao
        // alcanca o atraso recomendado do produto (7s) nem atrasos maiores -- nao e bug do motor,
        // e o wait() aplicando o teto generico de corte/transicao a uma espera que pode ser mais
        // longa de verdade. teto proporcional ao atraso configurado, com folga de 2s pra jitter.
        const atrasoSegundos=prefix==='Stream'&&!d.active?Number(this.broadcastDelayEngine?.summary()?.delaySeconds||0):0;
        const tentativas=atrasoSegundos>0?Math.max(60,Math.ceil((atrasoSegundos*1000+2000)/50)):60;
        await this.wait('Get'+prefix+'Status',{},s=>s.outputActive===!!d.active,tentativas); break;}
      case 'media': {const m=this.media(d.input), cmd=String(d.command).toUpperCase(); if(!['PLAY','PAUSE','STOP','RESTART','NEXT','PREVIOUS'].includes(cmd)) throw new Error('Ação de mídia inválida'); await this.req('TriggerMediaInputAction',{inputName:m.name,mediaAction:'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_'+cmd}); if(['PLAY','PAUSE','STOP'].includes(cmd)) await this.wait('GetMediaInputStatus',{inputName:m.name},s=>s.mediaState===({PLAY:'OBS_MEDIA_STATE_PLAYING',PAUSE:'OBS_MEDIA_STATE_PAUSED',STOP:'OBS_MEDIA_STATE_STOPPED'})[cmd]); break;}
      case 'media_seek': {const m=this.media(d.input); const cursor=number(d.position,0,m.duration,'Posição'); await this.req('SetMediaInputCursor',{inputName:m.name,mediaCursor:cursor});await this.wait('GetMediaInputStatus',{inputName:m.name},s=>Math.abs(s.mediaCursor-cursor)<100);break;}
      case 'media_settings': {const m=this.media(d.input), set={}; if(d.speed!==undefined){if(!/ffmpeg/.test(m.kind)) throw new Error('Esta fonte não oferece controle de velocidade'); set.speed_percent=number(d.speed,10,200,'Velocidade');}
        if(d.loop!==undefined) set[/playlist|vlc/.test(m.kind)?'loop':'looping']=!!d.loop;
        if(d.autoNext!==undefined){if(!/playlist/.test(m.kind)) throw new Error('Auto-Next requer uma fonte de playlist'); set.pause_between_media=!d.autoNext;}
        const before=await this.req('GetMediaInputStatus',{inputName:m.name}); await this.req('SetInputSettings',{inputName:m.name,inputSettings:set});
        if(d.speed!==undefined){await delay(200); await this.wait('GetMediaInputStatus',{inputName:m.name},s=>s.mediaDuration>0); if(before.mediaState==='OBS_MEDIA_STATE_PAUSED') await this.req('TriggerMediaInputAction',{inputName:m.name,mediaAction:'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE'}); await this.req('SetMediaInputCursor',{inputName:m.name,mediaCursor:before.mediaCursor});}
        const actual=(await this.req('GetInputSettings',{inputName:m.name})).inputSettings; for(const [k,v] of Object.entries(set)) if(actual[k]!==v) throw new Error('O motor não confirmou '+k); break;}
      case 'overlay': await this.overlay(d.channel,d.input?this.scene(d.input).name:''); break;
      case 'data_import': await this.dataSources.import(d);break;
      case 'data_http': await this.dataSources.configure(d,'http');break;
      case 'data_file': await this.dataSources.configure(d,'file');break;
      case 'data_select': await this.dataSources.select(d.id,d.index);break;
      case 'data_edit': await this.dataSources.edit(d);break;
      case 'data_bind': await this.dataSources.bind(d);break;
      case 'data_remove': await this.dataSources.remove(d.id);break;
      case 'data_scope': await this.dataSources.move(d.id,d.scope);break;
      case 'data_append': await this.dataSources.append(d);break;
      case 'data_remove_row': await this.dataSources.removeRow(d);break;
      case 'data_refresh': await this.dataSources.refresh(this.dataSources.get(d.id));await this.dataSources.save();break;
      case 'data_publish': await this.publishData(d.id,d.on);break;
      case 'gc': await this.title(d.kind||'lower',d.data||{},d.on); break;
      case 'score': {const key=d.team==='away'?'scoreAway':'scoreHome'; const next=Math.max(0,(this.gc[key]||0)+number(d.delta,-99,99,'Pontos')); await this.title('score',{[key]:next}); break;}
      default: throw new Error('Comando não implementado: '+action);
    }
  }
  statusXml() {
    const s=this.state;
    const aud=n=>{const a=s.audioInputs.find(a=>a.name===n); return a?`volume="${Math.round(a.volumeMul*100)}" muted="${a.muted?'True':'False'}" meterF1="${a.levels[0]??0}" meterF2="${a.levels[1]??0}"`: 'available="False"';};
    return `<?xml version="1.0" encoding="utf-8"?><vmix><version>27.0.0.1</version><edition>FreeMix</edition><preset>${xml(s.preset)}</preset><inputs>${s.inputs.map(i=>`<input key="${xml(i.key)}" number="${i.number}" type="${i.type}" title="${xml(i.name)}" state="${i.state?'OBS_MEDIA_STATE_PLAYING'===i.state?'Running':'Paused':'Running'}" position="${i.position??0}" duration="${i.duration??0}" loop="${i.loop?'True':'False'}" muted="${i.muted?'True':'False'}" volume="${i.volume??0}" audiobuses="${i.audioBuses}">${xml(i.name)}</input>`).join('')}</inputs><overlays>${Array.from({length:8},(_,i)=>`<overlay number="${i+1}">${s.inputs.find(x=>x.name===s.overlays.find(o=>o.number===i+1)?.scene)?.number||''}</overlay>`).join('')}</overlays><preview>${s.inputs.find(i=>i.name===s.preview)?.number||0}</preview><active>${s.inputs.find(i=>i.name===s.program)?.number||0}</active><recording>${s.recording?'True':'False'}</recording><streaming>${s.streaming?'True':'False'}</streaming><audio><master ${aud(busNames.M)}/><busA ${aud(busNames.A)}/><busB ${aud(busNames.B)}/></audio></vmix>`;
  }
}
