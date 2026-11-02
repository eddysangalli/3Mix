// Logical 3Mix inputs and replaceable composition slots over the real engine.
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {normalizeMask,styleAsset,orientationViewport,anchoredRect} from './composicao-estilos.mjs';
import {advancedMaskKind,advancedMaskFilter,advancedMaskSettings} from './composicao-advanced-masks.mjs';
import {speakerOptions,chooseSpeaker,speakerRects} from './composicao-locutor.mjs';
import {compositionPresets,presetById,presetRects} from './composicao-presets.mjs';
import {localBackground} from './composicao-fundo.mjs';
export const layouts={
 '2box':{label:'2 pessoas',count:2},
 '3box':{label:'3 pessoas',count:3},
 '4box':{label:'4 pessoas',count:4},
 pip:{label:'Picture in Picture',count:2},
 slides:{label:'Apresentador + slides',count:2},
 vertical2box:{label:'Vertical · 2 pessoas',count:2},
 verticalpip:{label:'Vertical · PiP',count:2},
 grid9:{label:'Multiview · 9 entradas',count:9},
 grid16:{label:'Multiview · 16 entradas',count:16}
};
for(let count=1;count<=16;count++)layouts['grid'+count]={label:'Composição livre · '+count+' entradas',count};
for(const preset of compositionPresets)layouts[preset.id]={label:preset.label,count:preset.count};
export function slotRects(layout,portrait=false,aspect=16/9){
 if(compositionPresets.some(p=>p.id===layout))return presetRects(layout,{baseWidth:aspect,baseHeight:1});
 if(!layouts[layout])throw Error('Composição inválida');
 if(layout.startsWith('grid')){const count=layouts[layout].count,cols=Math.ceil(Math.sqrt(count)),rows=Math.ceil(count/cols),gap=.008;return Array.from({length:count},(_,n)=>[(n%cols)/cols+gap,Math.floor(n/cols)/rows+gap,1/cols-gap*2,1/rows-gap*2]);}
 if(layout.startsWith('vertical')){const width=Math.min(1,(9/16)/aspect),left=(1-width)/2;return layout==='verticalpip'?[[left,0,width,1],[left+.62*width,.68,.35*width,.29]]:[[left+.03*width,.025,.94*width,.46],[left+.03*width,.515,.94*width,.46]];}
 if(layout==='pip')return [[0,0,1,1],[.68,.66,.3,.3]];
 if(layout==='slides')return portrait?[[.03,.025,.94,.32],[.03,.37,.94,.60]]:[[.025,.16,.28,.68],[.33,.04,.645,.92]];
 if(layout==='2box')return portrait?[[.03,.025,.94,.46],[.03,.515,.94,.46]]:[[.025,.10,.4625,.80],[.5125,.10,.4625,.80]];
 if(layout==='3box')return portrait?[[.03,.02,.94,.30],[.03,.35,.94,.30],[.03,.68,.94,.30]]:[[.025,.035,.4625,.445],[.5125,.035,.4625,.445],[.269,.52,.4625,.445]];
 return [[.025,.025,.4625,.4625],[.5125,.025,.4625,.4625],[.025,.5125,.4625,.4625],[.5125,.5125,.4625,.4625]];
}
export class InputEngine{
 constructor(production){this.p=production;this.scope=null;this.entries={};this.templates=[];this.histories=new Map();this.contentHistories=new Map();this.speakerStates=new Map();this.speakerBusy=false;}
 async setScope(scope){if(this.scope===scope)return;this.maskKinds=(await this.p.req('GetSourceFilterKindList')).sourceFilterKinds;this.scope=scope;this.histories.clear();this.contentHistories.clear();this.speakerStates.clear();this.file=join(this.p.root,'config/obs-studio/plugin_config/freemix-inputs',createHash('sha256').update(scope).digest('hex').slice(0,24)+'.json');try{const data=JSON.parse(await readFile(this.file,'utf8'));this.entries=data.entries||{};this.templates=data.templates||[];}catch(e){if(e.code!=='ENOENT')throw e;this.entries={};this.templates=[];}}
 async save(){await mkdir(join(this.file,'..'),{recursive:true});await writeFile(this.file+'.tmp',JSON.stringify({format:2,entries:this.entries,templates:this.templates},null,2));await rename(this.file+'.tmp',this.file);}
 decorate(inputs,video){return inputs.map(i=>{const meta=structuredClone(this.entries[i.key]||{});if(meta.composition){meta.composition.contentUndoAvailable=!!this.contentHistories.get(meta.composition.syncGroup)?.length;meta.composition.maskEngines={advanced:this.maskKinds?.includes(advancedMaskKind)===true};const rects=slotRects(meta.composition.layout,video.baseHeight>video.baseWidth,video.baseWidth/video.baseHeight);meta.composition.slots.forEach((s,n)=>s.defaultRect=rects[n]);}return {...i,...meta,key:i.key,name:i.name,number:i.number};});}
 presets(){return structuredClone(compositionPresets);}
 async frame(input){const scene=await this.scene(input);if(!this.entries[scene.sceneUuid]?.composition)throw Error('Selecione uma composição');const v=await this.p.req('GetVideoSettings'),scale=Math.min(1,960/Math.max(v.baseWidth,v.baseHeight));return (await this.p.req('GetSourceScreenshot',{sourceUuid:scene.sceneUuid,imageFormat:'png',imageWidth:Math.round(v.baseWidth*scale),imageHeight:Math.round(v.baseHeight*scale)})).imageData;}
 async scene(key){const r=await this.p.req('GetSceneList'),s=r.scenes.find(s=>s.sceneUuid===key||s.sceneName===key);if(!s)throw Error('Entrada não encontrada');return s;}
 async cycle(parent,child,seen=new Set()){if(parent===child)return true;if(seen.has(child))return false;seen.add(child);const items=(await this.p.req('GetSceneItemList',{sceneName:child})).sceneItems;for(const i of items)if(i.sourceType==='OBS_SOURCE_TYPE_SCENE'&&!i.isGroup&&await this.cycle(parent,i.sourceName,seen))return true;const me=/^PGM M\/E (\d+)$/.exec(child);if(me){const native=await this.p.outputEngine?.mixes?.read?.().catch(()=>null),mix=native?.mixes?.find(m=>m.mixId===Number(me[1]));if(mix){const list=(await this.p.req('GetSceneList')).scenes;for(const uuid of [mix.programUuid,mix.previewUuid]){const scene=list.find(x=>x.sceneUuid===uuid);if(scene&&await this.cycle(parent,scene.sceneName,seen))return true;}}}return false;}
 async transform(scene,item,rect,mode='fit',style={}){
  if(style.wrapper)return this.transformWrapped(scene,item,rect,mode,style);
  const v=(await this.p.req('GetVideoSettings')),W=v.baseWidth,H=v.baseHeight,[x,y,w,h]=rect;
  const old=(await this.p.req('GetSceneItemTransform',{sceneName:scene,sceneItemId:item})).sceneItemTransform;
  const crop=style.crop||{},rotation=style.rotation??0;
  if(!Number.isFinite(rotation)||rotation<-180||rotation>180)throw Error('Rotação: use -180 a 180 graus');
  let [cropLeft,cropRight,cropTop,cropBottom]=['left','right','top','bottom'].map(k=>{const n=crop[k]??0;if(!Number.isInteger(n)||n<0||n>100000)throw Error('Recorte: use pixels inteiros positivos');return n;});
  const sw=old.sourceWidth-cropLeft-cropRight,sh=old.sourceHeight-cropTop-cropBottom;
  if((cropLeft||cropRight||cropTop||cropBottom)&&(!(sw>0)||!(sh>0)))throw Error('O recorte não pode eliminar toda a imagem');
  if(mode==='fill'&&sw>0&&sh>0){const target=W*w/(H*h),ratio=sw/sh;if(ratio>target){const n=Math.floor((sw-sh*target)/2);cropLeft+=n;cropRight+=n;}else{const n=Math.floor((sh-sw/target)/2);cropTop+=n;cropBottom+=n;}}
  await this.p.req('SetSceneItemTransform',{sceneName:scene,sceneItemId:item,sceneItemTransform:{positionX:W*x,positionY:H*y,alignment:5,rotation,cropLeft,cropRight,cropTop,cropBottom,boundsType:'OBS_BOUNDS_SCALE_INNER',boundsAlignment:0,boundsWidth:W*w,boundsHeight:H*h}});
 }
 async transformWrapped(scene,item,rect,mode,style){
  const v=await this.p.req('GetVideoSettings'),W=v.baseWidth,H=v.baseHeight,[x,y,w,h]=rect,old=(await this.p.req('GetSceneItemTransform',{sceneName:style.wrapper.name,sceneItemId:style.wrapper.childId})).sceneItemTransform,crop=style.crop||{};
  let [left,right,top,bottom]=['left','right','top','bottom'].map(k=>{const n=crop[k]??0;if(!Number.isInteger(n)||n<0||n>100000)throw Error('Recorte inválido');return n;});
  let sw=old.sourceWidth-left-right,sh=old.sourceHeight-top-bottom;if(!(sw>0&&sh>0))throw Error('Fonte sem dimensões ou recorte elimina a imagem');const target=W*w/(H*h),ratio=sw/sh;let rw=1,rh=1;
  if(mode==='fill'){if(ratio>target){const n=Math.floor((sw-sh*target)/2);left+=n;right+=n;}else{const n=Math.floor((sh-sw/target)/2);top+=n;bottom+=n;}}
  else if(ratio>target)rh=target/ratio;else rw=ratio/target;
  const rotation=style.rotation||0;if(!Number.isFinite(rotation)||rotation< -180||rotation>180)throw Error('Rotação inválida');
  await this.p.req('SetSceneItemTransform',{sceneName:style.wrapper.name,sceneItemId:style.wrapper.childId,sceneItemTransform:{positionX:W*(1-rw)/2,positionY:H*(1-rh)/2,alignment:5,rotation:0,cropLeft:left,cropRight:right,cropTop:top,cropBottom:bottom,boundsType:'OBS_BOUNDS_STRETCH',boundsAlignment:5,boundsWidth:W*rw,boundsHeight:H*rh}});
  await this.p.req('SetSceneItemTransform',{sceneName:scene,sceneItemId:item,sceneItemTransform:{positionX:W*x,positionY:H*y,alignment:5,rotation,cropLeft:0,cropRight:0,cropTop:0,cropBottom:0,boundsType:'OBS_BOUNDS_STRETCH',boundsAlignment:5,boundsWidth:W*w,boundsHeight:H*h}});
  if(style.mask?.type&&style.mask.type!=='none')await this.maskFilter(style,rect,v);
 }
 async privateSlot(scene,slot){
  if(slot.wrapper)return;const source=await this.scene(slot.inputKey),name='3Mix Slot '+randomUUID(),items=(await this.p.req('GetSceneItemList',{sceneName:scene})).sceneItems,old=items.find(i=>i.sceneItemId===slot.itemId);if(!old)throw Error('Slot alterado externamente');
  const transform=(await this.p.req('GetSceneItemTransform',{sceneName:scene,sceneItemId:slot.itemId})).sceneItemTransform;let added;
  try{await this.p.req('CreateScene',{sceneName:name});const wrapper=await this.scene(name),child=await this.p.req('CreateSceneItem',{sceneName:name,sourceName:source.sceneName,sceneItemEnabled:true});added=await this.p.req('CreateSceneItem',{sceneName:scene,sourceName:name,sceneItemEnabled:false});await this.p.req('SetSceneItemTransform',{sceneName:scene,sceneItemId:added.sceneItemId,sceneItemTransform:transform});await this.p.req('SetSceneItemIndex',{sceneName:scene,sceneItemId:added.sceneItemId,sceneItemIndex:old.sceneItemIndex});await this.p.req('SetSceneItemEnabled',{sceneName:scene,sceneItemId:added.sceneItemId,sceneItemEnabled:old.sceneItemEnabled!==false});await this.p.req('RemoveSceneItem',{sceneName:scene,sceneItemId:slot.itemId});slot.wrapper={name,key:wrapper.sceneUuid,childId:child.sceneItemId};slot.itemId=added.sceneItemId;}
  catch(e){if(added)await this.p.optional('RemoveSceneItem',{sceneName:scene,sceneItemId:added.sceneItemId});await this.p.optional('RemoveScene',{sceneName:name});throw e;}
 }
 async maskFilter(slot,rect,video){
  const filterName='3Mix Slot Mask',list=(await this.p.req('GetSourceFilterList',{sourceUuid:slot.wrapper.key})).filters;
  const own=[filterName,advancedMaskFilter],wanted=slot.mask.type==='advanced'?advancedMaskFilter:slot.mask.type==='none'?null:filterName;
  if(slot.mask.type==='advanced'){
   const kinds=(await this.p.req('GetSourceFilterKindList')).sourceFilterKinds;if(!kinds.includes(advancedMaskKind))throw Error('Advanced Masks não está disponível neste motor. Escolha a máscara nativa.');
   const filterSettings=advancedMaskSettings(slot.mask,video,rect);
   if(list.some(f=>f.filterName===wanted))await this.p.req('SetSourceFilterSettings',{sourceUuid:slot.wrapper.key,filterName:wanted,filterSettings,overlay:false});else await this.p.req('CreateSourceFilter',{sourceUuid:slot.wrapper.key,filterName:wanted,filterKind:advancedMaskKind,filterSettings});
   for(const name of own.filter(n=>n!==wanted))if(list.some(f=>f.filterName===name))await this.p.req('RemoveSourceFilter',{sourceUuid:slot.wrapper.key,filterName:name});delete slot.maskAsset;return;
  }
  if(slot.mask.type==='none'){for(const name of own)if(list.some(f=>f.filterName===name))await this.p.req('RemoveSourceFilter',{sourceUuid:slot.wrapper.key,filterName:name});return;}
  const kinds=(await this.p.req('GetSourceFilterKindList')).sourceFilterKinds,kind=kinds.includes('mask_filter_v2')?'mask_filter_v2':kinds.includes('mask_filter')?'mask_filter':null;if(!kind)throw Error('Motor sem filtro nativo de máscara');
  const asset=await styleAsset(this.p.root,{mask:slot.mask},video.baseWidth*rect[2],video.baseHeight*rect[3]),settings={type:'mask_alpha_filter.effect',image_path:asset.file,color:4294967295,opacity:kind==='mask_filter_v2'?1:100,stretch:true};
  if(list.some(f=>f.filterName===filterName))await this.p.req('SetSourceFilterSettings',{sourceUuid:slot.wrapper.key,filterName,filterSettings:settings,overlay:false});else await this.p.req('CreateSourceFilter',{sourceUuid:slot.wrapper.key,filterName,filterKind:kind,filterSettings:settings});slot.maskAsset=asset.file;
  if(list.some(f=>f.filterName===advancedMaskFilter))await this.p.req('RemoveSourceFilter',{sourceUuid:slot.wrapper.key,filterName:advancedMaskFilter});
 }
 async create(d){
  const template=d.template?this.templates.find(t=>t.id===d.template):null;if(d.template&&!template)throw Error('Modelo não encontrado');
  const name=String(d.name||'').trim(),layout=template?.layout||d.preset||d.layout,definition=layouts[layout];if(!name||name.length>60||name.startsWith('3Mix Slot ')||/[\x00-\x1f]/.test(name)||!definition)throw Error('Nome ou layout inválido');
  if((await this.p.req('GetSceneList')).scenes.some(s=>s.sceneName===name))throw Error('Já existe uma entrada com esse nome');
  if(!Array.isArray(d.slots)||d.slots.length!==definition.count)throw Error('Preencha todos os slots');
  const sources=await Promise.all(d.slots.map(k=>this.scene(k)));if(sources.some(s=>s.sceneName.startsWith('3Mix Slot ')))throw Error('Cenas privadas de slot não são entradas de composição');const v=await this.p.req('GetVideoSettings'),rects=slotRects(layout,v.baseHeight>v.baseWidth,v.baseWidth/v.baseHeight),bg='Fundo '+randomUUID(),modes=d.modes||[];
  const color=String(template?.color||d.color||'#101820');if(!/^#[a-fA-F0-9]{6}$/.test(color))throw Error('Cor inválida');const hex=parseInt(color.slice(1),16),abgr=(0xff000000|((hex&255)<<16)|(hex&0xff00)|(hex>>16))>>>0;
  let created=false;
  try{await this.p.req('CreateScene',{sceneName:name});created=true;
   await this.p.req('CreateInput',{sceneName:name,inputName:bg,inputKind:'color_source_v3',inputSettings:{color:abgr,width:v.baseWidth,height:v.baseHeight},sceneItemEnabled:true});
   const slots=[];
   for(let n=0;n<sources.length;n++){const s=sources[n],saved=template?.slots[n],mode=saved?.mode||(modes[n]==='fill'||modes[n]===undefined&&compositionPresets.some(p=>p.id===layout)?'fill':'fit'),item=await this.p.req('CreateSceneItem',{sceneName:name,sourceName:s.sceneName,sceneItemEnabled:true});await this.transform(name,item.sceneItemId,saved?.rect||rects[n],mode,saved||{});if(saved?.enabled===false)await this.p.req('SetSceneItemEnabled',{sceneName:name,sceneItemId:item.sceneItemId,sceneItemEnabled:false});slots.push({id:randomUUID(),label:String.fromCharCode(65+n),inputKey:s.sceneUuid,itemId:item.sceneItemId,mode,...(saved?{rect:saved.rect,crop:saved.crop,rotation:saved.rotation,border:saved.border,shadow:saved.shadow,mask:saved.mask,anchors:saved.anchors,enabled:saved.enabled,locked:saved.locked}:{})});}
   const scene=await this.scene(name);this.entries[scene.sceneUuid]={type:'Composition',composition:{layout,slots,background:bg,color,...(compositionPresets.some(p=>p.id===layout)?{preset:layout,orientation:presetById(layout).orientation,viewport:orientationViewport(v,presetById(layout).orientation)}:{}),...(template?.orientation?{orientation:template.orientation,viewport:orientationViewport(v,template.orientation)}:{})},tags:['Composições']};if(template?.backgroundSpec||d.background)await this.background({input:scene.sceneUuid,...(template?.backgroundSpec||d.background)});this.last={createdKey:scene.sceneUuid};for(const slot of slots){if(slot.mask?.type&&slot.mask.type!=='none')await this.style({input:scene.sceneUuid,slot:slot.id,mask:slot.mask});else await this.decorations(name,slot,slot.rect||rects[slots.indexOf(slot)]);}await this.save();
  }catch(e){const entry=Object.entries(this.entries).find(([,meta])=>meta.composition?.background===bg);if(entry){await this.removeArtifacts(entry[1]);delete this.entries[entry[0]];try{await this.save();}catch{}}if(created)await this.p.optional('RemoveScene',{sceneName:name});await this.p.optional('RemoveInput',{inputName:bg});throw e;}
 }
 async synchronized(d,method){
  const selected=await this.scene(d.input),comp=this.entries[selected.sceneUuid]?.composition;
  if(!comp?.syncGroup)return this[method](d);
  const live=(await this.p.req('GetSceneList')).scenes,targets=Object.entries(this.entries).filter(([key,m])=>m.composition?.syncGroup===comp.syncGroup&&live.some(s=>s.sceneUuid===key));
  const selectedSlot=method==='replace'?comp.slots.find(s=>s.id===d.slot||s.label===d.slot):null;
  if(method==='replace'&&!selectedSlot)throw Error('Camada não encontrada');
  const operations=[];
  for(const [key,meta] of targets){
   if(method==='replace'){
    const slot=meta.composition.slots.find(s=>s.linkKey&&s.linkKey===selectedSlot.linkKey);
    if(!slot)throw Error('As camadas vinculadas mudaram; desvincule ou recrie a versão');
    if(slot.locked)throw Error('Desbloqueie a camada nas duas versões antes de trocar a entrada');
    const source=await this.scene(d.source),parent=live.find(s=>s.sceneUuid===key);
    if(source.sceneName.startsWith('3Mix Slot ')||await this.cycle(parent.sceneName,source.sceneName))throw Error('A entrada criaria dependência circular numa versão vinculada');
    operations.push({next:{...d,input:key,slot:slot.id},old:{input:key,slot:slot.id,source:slot.inputKey,mode:slot.mode}});
   }else{
    const old=meta.composition.backgroundSpec||{type:'color',mode:'fill'};
    if(old.type==='image')await localBackground(this.p.root,old.file);
    if(d.type==='image')await localBackground(this.p.root,d.file);
    if(d.type==='input'){const source=await this.scene(d.source),parent=live.find(s=>s.sceneUuid===key);if(source.sceneName.startsWith('3Mix Slot ')||await this.cycle(parent.sceneName,source.sceneName))throw Error('Fundo circular numa versão vinculada');}
    operations.push({next:{...d,input:key},old:{input:key,type:old.type,mode:old.mode,file:old.file,source:old.source,color:meta.composition.color}});
   }
  }
  // Fit/crop is geometry: changing it in H must not overwrite V's framing.
  for(const op of operations)if(op.next.input!==selected.sceneUuid)op.next.mode=op.old.mode;
  const attempted=[];
  try{for(const op of operations){attempted.push(op);await this[method](op.next);}this.last={...this.last,synchronized:targets.map(([key])=>key)};
   const history=this.contentHistories.get(comp.syncGroup)||[];
   history.push({method,operations:structuredClone(operations)});this.contentHistories.set(comp.syncGroup,history.slice(-20));}
  catch(e){const errors=[];for(const op of attempted.reverse())try{await this[method](op.old);}catch(r){errors.push(r.message);}throw Error(e.message+(errors.length?' — restauração incompleta: '+errors.join('; '):' — alterações nas versões revertidas'));}
 }
 async contentUndo(d){
  const selected=await this.scene(d.input),comp=this.entries[selected.sceneUuid]?.composition;
  const history=comp?.syncGroup&&this.contentHistories.get(comp.syncGroup),event=history?.at(-1);
  if(!event)throw Error('Nenhuma troca de conteúdo H/V para desfazer nesta sessão');
  const live=(await this.p.req('GetSceneList')).scenes;
  for(const op of event.operations){
   const target=this.entries[op.old.input]?.composition;
   if(!target||target.syncGroup!==comp.syncGroup||!live.some(s=>s.sceneUuid===op.old.input))throw Error('O vínculo mudou; a troca anterior não pode ser desfeita');
   if(event.method==='replace'){
    const slot=target.slots.find(s=>s.id===op.old.slot);
    if(!slot||slot.locked)throw Error('Desbloqueie as camadas vinculadas antes de desfazer');
    await this.scene(op.old.source);
   }else if(op.old.type==='input')await this.scene(op.old.source);
   else if(op.old.type==='image')await localBackground(this.p.root,op.old.file);
  }
  const attempted=[];
  try{for(const op of event.operations){attempted.push(op);await this[event.method](op.old);}history.pop();this.last={synchronized:event.operations.map(op=>op.old.input),contentUndone:true};}
  catch(e){const errors=[];for(const op of attempted.reverse())try{await this[event.method](op.next);}catch(r){errors.push(r.message);}throw Error(e.message+(errors.length?' — restauração incompleta: '+errors.join('; '):' — desfazer cancelado, conteúdo anterior preservado'));}
 }
 async link(d){
  const scene=await this.scene(d.input),comp=this.entries[scene.sceneUuid]?.composition;if(!comp)throw Error('Selecione uma composição');
  if(d.enabled!==false)throw Error('Crie a versão H/V vinculada pelo botão de variante');
  const old=structuredClone(comp);delete comp.syncGroup;comp.slots.forEach(s=>delete s.linkKey);
  try{await this.save();}catch(e){this.entries[scene.sceneUuid].composition=old;throw e;}
 }
 async replace(d){const scene=await this.scene(d.input),meta=this.entries[scene.sceneUuid],comp=meta?.composition,slot=comp?.slots.find(s=>s.id===d.slot||s.label===d.slot);
  if(!slot)throw Error('Slot não encontrado');if(slot.locked)throw Error('Desbloqueie esta camada para trocar sua entrada');const source=await this.scene(d.source);if(source.sceneName.startsWith('3Mix Slot '))throw Error('Selecione uma entrada pública');if(await this.cycle(scene.sceneName,source.sceneName))throw Error('Uma composição não pode conter a si mesma, direta ou indiretamente');
  const list=(await this.p.req('GetSceneItemList',{sceneName:scene.sceneName})).sceneItems,old=list.find(i=>i.sceneItemId===slot.itemId);if(!old)throw Error('Slot foi alterado externamente; restaure ou recrie a composição');
  const v=await this.p.req('GetVideoSettings'),rect=slot.rect||slotRects(comp.layout,v.baseHeight>v.baseWidth,v.baseWidth/v.baseHeight)[comp.slots.indexOf(slot)],mode=d.mode===undefined?slot.mode:d.mode;if(!['fit','fill'].includes(mode))throw Error('Enquadramento inválido');
  if(slot.wrapper){const oldChild=slot.wrapper.childId,added=await this.p.req('CreateSceneItem',{sceneName:slot.wrapper.name,sourceName:source.sceneName,sceneItemEnabled:false}),previous=structuredClone(slot);try{slot.wrapper.childId=added.sceneItemId;slot.inputKey=source.sceneUuid;slot.mode=mode;await this.transform(scene.sceneName,slot.itemId,rect,mode,slot);await this.p.req('SetSceneItemEnabled',{sceneName:slot.wrapper.name,sceneItemId:added.sceneItemId,sceneItemEnabled:true});await this.save();await this.p.req('RemoveSceneItem',{sceneName:slot.wrapper.name,sceneItemId:oldChild});}catch(e){Object.assign(slot,previous);await this.p.optional('RemoveSceneItem',{sceneName:slot.wrapper.name,sceneItemId:added.sceneItemId});throw e;}return;}
  const added=await this.p.req('CreateSceneItem',{sceneName:scene.sceneName,sourceName:source.sceneName,sceneItemEnabled:false});
  const previous=structuredClone(slot);
  try{await this.transform(scene.sceneName,added.sceneItemId,rect,mode,slot);await this.p.req('SetSceneItemIndex',{sceneName:scene.sceneName,sceneItemId:added.sceneItemId,sceneItemIndex:old.sceneItemIndex});await this.p.req('SetSceneItemEnabled',{sceneName:scene.sceneName,sceneItemId:added.sceneItemId,sceneItemEnabled:old.sceneItemEnabled!==false});slot.itemId=added.sceneItemId;slot.inputKey=source.sceneUuid;slot.mode=mode;await this.save();await this.p.req('RemoveSceneItem',{sceneName:scene.sceneName,sceneItemId:old.sceneItemId});}
  catch(e){Object.assign(slot,previous);await this.p.optional('RemoveSceneItem',{sceneName:scene.sceneName,sceneItemId:added.sceneItemId});try{await this.save();}catch{}throw e;}
 }
 async background(d){
  const scene=await this.scene(d.input),comp=this.entries[scene.sceneUuid]?.composition;if(!comp)throw Error('Selecione uma composição');
  const type=d.type||'color',mode=d.mode||'fill';if(!['color','image','input'].includes(type)||!['fit','fill'].includes(mode))throw Error('Tipo de fundo ou enquadramento inválido');
  const color=d.color||comp.color;if(!/^#[a-f\d]{6}$/i.test(color))throw Error('Cor inválida');
  let file,source;if(type==='image')file=await localBackground(this.p.root,d.file);if(type==='input'){source=await this.scene(d.source);if(source.sceneName.startsWith('3Mix Slot ')||await this.cycle(scene.sceneName,source.sceneName))throw Error('O fundo não pode conter esta composição nem cenas privadas');}
  const old=structuredClone(comp.backgroundSpec),oldColor=comp.color,settings=(await this.p.req('GetInputSettings',{inputName:comp.background})).inputSettings,v=await this.p.req('GetVideoSettings');let next={type,mode},added;
  try{
   if(type==='image'){const name='3Mix Fundo '+randomUUID();added=await this.p.req('CreateInput',{sceneName:scene.sceneName,inputName:name,inputKind:'image_source',inputSettings:{file,unload:false},sceneItemEnabled:false});next={...next,ownedSource:name,file,itemId:added.sceneItemId};}
   else if(type==='input'){added=await this.p.req('CreateSceneItem',{sceneName:scene.sceneName,sourceName:source.sceneName,sceneItemEnabled:false});next={...next,source:source.sceneUuid,itemId:added.sceneItemId};}
   if(added){for(let n=0;n<10;n++){const t=(await this.p.req('GetSceneItemTransform',{sceneName:scene.sceneName,sceneItemId:added.sceneItemId})).sceneItemTransform;if(t.sourceWidth&&t.sourceHeight)break;await new Promise(r=>setTimeout(r,30));}await this.transform(scene.sceneName,added.sceneItemId,orientationViewport(v,comp.orientation||(v.baseHeight>v.baseWidth?'portrait':'landscape')),mode);await this.p.req('SetSceneItemIndex',{sceneName:scene.sceneName,sceneItemId:added.sceneItemId,sceneItemIndex:1});await this.p.req('SetSceneItemEnabled',{sceneName:scene.sceneName,sceneItemId:added.sceneItemId,sceneItemEnabled:true});}
   const hex=parseInt(color.slice(1),16),abgr=(0xff000000|((hex&255)<<16)|(hex&0xff00)|(hex>>16))>>>0;await this.p.req('SetInputSettings',{inputName:comp.background,inputSettings:{color:abgr},overlay:true});comp.color=color;comp.backgroundSpec=next;await this.save();
  }catch(e){comp.color=oldColor;comp.backgroundSpec=old;if(next.ownedSource)await this.p.optional('RemoveInput',{inputName:next.ownedSource});else if(added)await this.p.optional('RemoveSceneItem',{sceneName:scene.sceneName,sceneItemId:added.sceneItemId});await this.p.optional('SetInputSettings',{inputName:comp.background,inputSettings:settings,overlay:false});throw e;}
  if(old?.itemId)await this.p.req('RemoveSceneItem',{sceneName:scene.sceneName,sceneItemId:old.itemId});if(old?.ownedSource)try{await this.p.req('RemoveInput',{inputName:old.ownedSource});}catch(e){if(!/^RemoveInput: 600 /.test(e.message))throw e;}
 }
 async tags(d){const s=await this.scene(d.input);if(!Array.isArray(d.tags)||d.tags.length>12||d.tags.some(t=>typeof t!=='string'||!t.trim()||t.length>32))throw Error('Use até 12 categorias de até 32 caracteres');this.entries[s.sceneUuid]={...this.entries[s.sceneUuid],tags:[...new Set(d.tags.map(t=>t.trim()))]};await this.save();}
 async geometry(d){const scene=await this.scene(d.input),meta=this.entries[scene.sceneUuid];if(!meta?.composition)throw Error('Selecione uma composição');const before=structuredClone(meta.composition);
  if(meta.composition.speaker?.enabled&&!d.fromSpeaker){meta.composition.speaker.enabled=false;meta.composition.speaker.reason='Posição alterada manualmente';}
  const staged=[];for(const change of d.slots||[]){const s=meta.composition.slots.find(s=>s.id===change.id);if(!s)throw Error('Slot inválido');if(s.locked)throw Error('Desbloqueie esta camada para alterar a posição');if(!Array.isArray(change.rect)||change.rect.length!==4||change.rect.some(n=>!Number.isFinite(n)||n<0||n>1)||change.rect[2]<.01||change.rect[3]<.01||change.rect[0]+change.rect[2]>1.001||change.rect[1]+change.rect[3]>1.001)throw Error('Posição/tamanho fora do quadro');staged.push([s,change.rect]);}
  const original=[];for(const s of meta.composition.slots){const wrapper=s.wrapper?{...s.wrapper,transform:(await this.p.req('GetSceneItemTransform',{sceneName:s.wrapper.name,sceneItemId:s.wrapper.childId})).sceneItemTransform,filters:(await this.p.req('GetSourceFilterList',{sourceUuid:s.wrapper.key})).filters}:null;original.push([s.itemId,(await this.p.req('GetSceneItemTransform',{sceneName:scene.sceneName,sceneItemId:s.itemId})).sceneItemTransform,wrapper]);}
  for(const [s,rect] of staged)s.rect=rect;
  try{for(const s of meta.composition.slots){const v=await this.p.req('GetVideoSettings'),r=s.rect||slotRects(meta.composition.layout,v.baseHeight>v.baseWidth,v.baseWidth/v.baseHeight)[meta.composition.slots.indexOf(s)];await this.transform(scene.sceneName,s.itemId,r,s.mode,s);await this.decorations(scene.sceneName,s,r);}meta.composition.previous=before.slots.map(s=>({id:s.id,rect:s.rect||null}));await this.save();if(!d.skipHistory){const v=await this.p.req('GetVideoSettings'),h=this.histories.get(scene.sceneUuid)||[];h.push(before.slots.map(s=>({id:s.id,rect:s.rect||slotRects(before.layout,v.baseHeight>v.baseWidth,v.baseWidth/v.baseHeight)[before.slots.indexOf(s)]})));this.histories.set(scene.sceneUuid,h.slice(-30));}}catch(e){meta.composition=before;const failed=[];for(const [id,t,wrapper] of original)try{await this.p.req('SetSceneItemTransform',{sceneName:scene.sceneName,sceneItemId:id,sceneItemTransform:t});if(wrapper){await this.p.req('SetSceneItemTransform',{sceneName:wrapper.name,sceneItemId:wrapper.childId,sceneItemTransform:wrapper.transform});for(const filter of wrapper.filters)if(['3Mix Slot Mask',advancedMaskFilter].includes(filter.filterName))await this.p.req('SetSourceFilterSettings',{sourceUuid:wrapper.key,filterName:filter.filterName,filterSettings:filter.filterSettings,overlay:false});}}catch(r){failed.push(r.message);}throw Error(e.message+(failed.length?' — restauração incompleta: '+failed.join('; '):''));}
 }
 async layer(d){const scene=await this.scene(d.input),comp=this.entries[scene.sceneUuid]?.composition,slot=comp?.slots.find(s=>s.id===d.slot);if(!slot)throw Error('Camada não encontrada');const old=structuredClone(slot);
  if(d.locked!==undefined&&typeof d.locked!=='boolean'||d.enabled!==undefined&&typeof d.enabled!=='boolean')throw Error('Estado inválido');
  if(d.locked!==undefined)slot.locked=d.locked;
  if(d.enabled!==undefined){await this.p.req('SetSceneItemEnabled',{sceneName:scene.sceneName,sceneItemId:slot.itemId,sceneItemEnabled:d.enabled});slot.enabled=d.enabled;const v=await this.p.req('GetVideoSettings');await this.decorations(scene.sceneName,slot,slot.rect||slotRects(comp.layout,v.baseHeight>v.baseWidth,v.baseWidth/v.baseHeight)[comp.slots.indexOf(slot)]);}
  try{await this.save();}catch(e){Object.assign(slot,old);if(d.enabled!==undefined)await this.p.req('SetSceneItemEnabled',{sceneName:scene.sceneName,sceneItemId:slot.itemId,sceneItemEnabled:old.enabled!==false});throw e;}
 }
 async align(d){const scene=await this.scene(d.input),comp=this.entries[scene.sceneUuid]?.composition;if(!comp)throw Error('Selecione uma composição');const v=await this.p.req('GetVideoSettings'),defaults=slotRects(comp.layout,v.baseHeight>v.baseWidth,v.baseWidth/v.baseHeight);
  const slots=comp.slots.filter(s=>(!d.ids||d.ids.includes(s.id))&&!s.locked).map(s=>({id:s.id,rect:[...(s.rect||defaults[comp.slots.indexOf(s)])]}));if(!slots.length)throw Error('Nenhuma camada desbloqueada selecionada');
  const ref=slots[0].rect;
  if(['left','top','width','height','centerX','centerY'].includes(d.mode)){for(const s of slots){if(d.mode==='left')s.rect[0]=ref[0];if(d.mode==='top')s.rect[1]=ref[1];if(d.mode==='width')s.rect[2]=Math.min(ref[2],1-s.rect[0]);if(d.mode==='height')s.rect[3]=Math.min(ref[3],1-s.rect[1]);if(d.mode==='centerX')s.rect[0]=Math.max(0,Math.min(1-s.rect[2],.5-s.rect[2]/2));if(d.mode==='centerY')s.rect[1]=Math.max(0,Math.min(1-s.rect[3],.5-s.rect[3]/2));}}
  else if(['distributeX','distributeY'].includes(d.mode)){const axis=d.mode==='distributeX'?0:1,size=axis+2;slots.sort((a,b)=>a.rect[axis]-b.rect[axis]);const total=slots.reduce((n,s)=>n+s.rect[size],0);if(total>1)throw Error('As camadas não cabem lado a lado; reduza seus tamanhos');const gap=slots.length>1?(1-total)/(slots.length-1):0;let at=0;for(const s of slots){s.rect[axis]=at;at+=s.rect[size]+gap;}}
  else if(d.mode==='reset')for(const s of slots)s.rect=defaults[comp.slots.findIndex(x=>x.id===s.id)];else throw Error('Alinhamento inválido');
  await this.geometry({input:scene.sceneUuid,slots});
 }
 async undo(d){const scene=await this.scene(d.input),h=this.histories.get(scene.sceneUuid)||[],previous=h.at(-1);if(!previous)throw Error('Nenhuma posição para desfazer nesta sessão');await this.geometry({input:scene.sceneUuid,skipHistory:true,slots:previous.filter(s=>!this.entries[scene.sceneUuid].composition.slots.find(x=>x.id===s.id)?.locked)});h.pop();this.histories.set(scene.sceneUuid,h);}
 async duplicate(d){const source=await this.scene(d.input),meta=this.entries[source.sceneUuid];if(!meta?.composition)throw Error('Selecione uma composição');const before=structuredClone(meta),names=new Set((await this.p.req('GetSceneList')).scenes.map(s=>s.sceneName));let name=String(d.name||source.sceneName+' cópia').trim(),n=2;const base=name;while(names.has(name))name=base+' '+n++;if(name.length>60)throw Error('Nome muito longo');
  await this.create({name,layout:before.composition.layout,color:before.composition.color,background:before.composition.backgroundSpec?{type:before.composition.backgroundSpec.type,file:before.composition.backgroundSpec.file,source:before.composition.backgroundSpec.source,mode:before.composition.backgroundSpec.mode}:undefined,slots:before.composition.slots.map(s=>s.inputKey),modes:before.composition.slots.map(s=>s.mode)});const created=await this.scene(name),comp=this.entries[created.sceneUuid].composition;
  try{await this.geometry({input:created.sceneUuid,slots:comp.slots.map((s,n)=>({id:s.id,rect:before.composition.slots[n].rect||slotRects(comp.layout,this.p.state.video.baseHeight>this.p.state.video.baseWidth,this.p.state.video.baseWidth/this.p.state.video.baseHeight)[n]}))});this.entries[created.sceneUuid].tags=before.tags;comp.orientation=before.composition.orientation;comp.viewport=structuredClone(before.composition.viewport);for(let n=0;n<comp.slots.length;n++){const original=before.composition.slots[n];await this.style({input:created.sceneUuid,slot:comp.slots[n].id,crop:original.crop||{},rotation:original.rotation||0,border:original.border,shadow:original.shadow,mask:original.mask});comp.slots[n].anchors=structuredClone(original.anchors);await this.layer({input:created.sceneUuid,slot:comp.slots[n].id,enabled:original.enabled!==false,locked:!!original.locked});}await this.save();this.last={createdKey:created.sceneUuid};}
  catch(e){await this.p.optional('RemoveScene',{sceneName:name});await this.removeArtifacts(this.entries[created.sceneUuid]);delete this.entries[created.sceneUuid];await this.save();throw e;}
 }
 async reorder(d){
  const scenes=(await this.p.req('GetSceneList')).scenes.slice().sort((a,b)=>b.sceneIndex-a.sceneIndex);
  const visible=scenes.filter(s=>s.sceneName!=='3Mix Barramentos'&&!s.sceneName.startsWith('3Mix Slot '));
  if(!Array.isArray(d.keys)||d.keys.length!==visible.length||new Set(d.keys).size!==visible.length||d.keys.some(k=>!visible.some(s=>s.sceneUuid===k)))throw Error('A lista de entradas mudou; atualize a mesa e tente novamente.');
  let n=0;const keys=scenes.map(s=>({uuid:s.sceneName==='3Mix Barramentos'||s.sceneName.startsWith('3Mix Slot ')?s.sceneUuid:d.keys[n++]}));
  const result=await this.p.req('CallVendorRequest',{vendorName:'freemix',requestType:'reorder_inputs',requestData:{keys}});
  if(!result.responseData?.success)throw Error('O motor não confirmou a nova ordem das entradas.');
 }
  async reflow(){
   const undo=[],video=await this.p.req('GetVideoSettings');
   try{for(const [uuid,meta] of Object.entries(this.entries)){if(!meta.composition)continue;const scene=await this.scene(uuid),comp=meta.composition,rects=slotRects(comp.layout,video.baseHeight>video.baseWidth,video.baseWidth/video.baseHeight);
    if(comp.background){const old=(await this.p.req('GetInputSettings',{inputName:comp.background})).inputSettings;undo.push(()=>this.p.req('SetInputSettings',{inputName:comp.background,inputSettings:old,overlay:false}));await this.p.req('SetInputSettings',{inputName:comp.background,inputSettings:{width:video.baseWidth,height:video.baseHeight},overlay:true});}
    if(comp.backgroundSpec?.itemId){const itemId=comp.backgroundSpec.itemId,old=(await this.p.req('GetSceneItemTransform',{sceneName:scene.sceneName,sceneItemId:itemId})).sceneItemTransform;undo.push(()=>this.p.req('SetSceneItemTransform',{sceneName:scene.sceneName,sceneItemId:itemId,sceneItemTransform:old}));await this.transform(scene.sceneName,itemId,orientationViewport(video,comp.orientation||(video.baseHeight>video.baseWidth?'portrait':'landscape')),comp.backgroundSpec.mode);}
    for(const [n,slot] of comp.slots.entries()){const old=(await this.p.req('GetSceneItemTransform',{sceneName:scene.sceneName,sceneItemId:slot.itemId})).sceneItemTransform;undo.push(()=>this.p.req('SetSceneItemTransform',{sceneName:scene.sceneName,sceneItemId:slot.itemId,sceneItemTransform:old}));await this.transform(scene.sceneName,slot.itemId,slot.rect||rects[n],slot.mode,slot);await this.decorations(scene.sceneName,slot,slot.rect||rects[n]);}
   }}catch(e){const failed=[];for(const restore of undo.reverse())try{await restore();}catch(r){failed.push(r.message);}throw Error(e.message+(failed.length?' — restauração de composições incompleta: '+failed.join('; '):''));}
   return async()=>{for(const restore of undo.slice().reverse())await restore();};
  }
 async style(d){
  const scene=await this.scene(d.input),comp=this.entries[scene.sceneUuid]?.composition,slot=comp?.slots.find(s=>s.id===d.slot);if(!slot)throw Error('Camada não encontrada');if(slot.locked)throw Error('Desbloqueie a camada para editar seu enquadramento');
  const previous=structuredClone(slot),v=await this.p.req('GetVideoSettings'),rect=slot.rect||slotRects(comp.layout,v.baseHeight>v.baseWidth,v.baseWidth/v.baseHeight)[comp.slots.indexOf(slot)],old=(await this.p.req('GetSceneItemTransform',{sceneName:scene.sceneName,sceneItemId:slot.itemId})).sceneItemTransform;
  const mask=normalizeMask(d.mask??slot.mask),next={...slot,crop:d.crop??slot.crop,rotation:d.rotation??slot.rotation,border:d.border??slot.border,shadow:d.shadow??slot.shadow,mask};
  if(mask.type==='advanced'&&!this.maskKinds?.includes(advancedMaskKind))throw Error('Advanced Masks não está disponível neste motor. Escolha a máscara nativa.');
  if(next.border&&(!Number.isInteger(next.border.width)||next.border.width<0||next.border.width>80||!/^#[a-f\d]{6}$/i.test(next.border.color)))throw Error('Borda: use 0 a 80 pixels e uma cor válida');
  if(next.shadow!==undefined&&typeof next.shadow!=='boolean')throw Error('Sombra inválida');
  if(mask.type!=='none'&&!slot.wrapper){await this.privateSlot(scene.sceneName,slot);next.wrapper=slot.wrapper;}
  try{await this.transform(scene.sceneName,slot.itemId,rect,slot.mode,next);Object.assign(slot,{crop:next.crop,rotation:next.rotation,border:next.border,shadow:next.shadow,mask});if(slot.wrapper&&mask.type==='none')await this.maskFilter(slot,rect,v);await this.decorations(scene.sceneName,slot,rect);await this.save();}catch(e){const decorations=slot.decorations,wrapper=slot.wrapper,itemId=slot.itemId;for(const k of Object.keys(slot))delete slot[k];Object.assign(slot,previous);slot.decorations=decorations;if(wrapper){slot.wrapper=wrapper;slot.itemId=itemId;slot.mask=previous.mask||{type:'none'};try{await this.transform(scene.sceneName,slot.itemId,rect,slot.mode,slot);await this.maskFilter(slot,rect,v);}catch{}}else await this.p.req('SetSceneItemTransform',{sceneName:scene.sceneName,sceneItemId:slot.itemId,sceneItemTransform:old});try{await this.decorations(scene.sceneName,slot,rect);await this.save();}catch{}throw e;}
 }
 async decorations(scene,slot,rect){
  if(!slot.border?.width&&!slot.shadow&&!slot.decorations)return;
  const v=await this.p.req('GetVideoSettings'),W=v.baseWidth,H=v.baseHeight,[x,y,w,h]=rect,rotation=slot.rotation||0,angle=rotation*Math.PI/180;slot.decorations??={};
  for(const kind of ['shadow','border']){
   const enabled=(kind==='shadow'?slot.shadow:!!slot.border?.width)&&slot.enabled!==false;let part=slot.decorations[kind];
   if(!enabled){if(part)await this.p.req('SetSceneItemEnabled',{sceneName:scene,sceneItemId:part.itemId,sceneItemEnabled:false});continue;}
   const hex=parseInt(kind==='shadow'?'000000':slot.border.color.slice(1),16),alpha=kind==='shadow'?110:255,color=((alpha<<24)|((hex&255)<<16)|(hex&0xff00)|(hex>>16))>>>0;
   const asset=kind==='shadow'?await styleAsset(this.p.root,{shadow:true,mask:slot.mask},w*W,h*H):null;
   if(part&&kind==='shadow'&&!part.diffuse){await this.p.req('RemoveInput',{inputName:part.source});part=null;}
   if(!part){const source='3Mix '+kind+' '+randomUUID(),created=await this.p.req('CreateInput',{sceneName:scene,inputName:source,inputKind:asset?'image_source':'color_source_v3',inputSettings:asset?{file:asset.file,unload:false}:{color,width:1,height:1},sceneItemEnabled:false});part=slot.decorations[kind]={source,itemId:created.sceneItemId,...(asset?{diffuse:true}:{})};}
   await this.p.req('SetInputSettings',{inputName:part.source,inputSettings:asset?{file:asset.file}:{color},overlay:true});
   const pad=asset?asset.pad:slot.border.width,dx=kind==='shadow'?12-pad:-pad,dy=kind==='shadow'?12-pad:-pad;
   await this.p.req('SetSceneItemTransform',{sceneName:scene,sceneItemId:part.itemId,sceneItemTransform:{positionX:x*W+dx*Math.cos(angle)-dy*Math.sin(angle),positionY:y*H+dx*Math.sin(angle)+dy*Math.cos(angle),rotation,alignment:5,boundsType:'OBS_BOUNDS_STRETCH',boundsAlignment:5,boundsWidth:asset?asset.width:w*W+pad*2,boundsHeight:asset?asset.height:h*H+pad*2}});
   const items=(await this.p.req('GetSceneItemList',{sceneName:scene})).sceneItems,index=items.find(i=>i.sceneItemId===slot.itemId).sceneItemIndex,other=slot.decorations[kind==='shadow'?'border':'shadow'];const before=kind==='shadow'&&other?items.find(i=>i.sceneItemId===other.itemId)?.sceneItemIndex:index;
   const current=items.find(i=>i.sceneItemId===part.itemId).sceneItemIndex;await this.p.req('SetSceneItemIndex',{sceneName:scene,sceneItemId:part.itemId,sceneItemIndex:Math.max(0,before-(current<before?1:0))});
   await this.p.req('SetSceneItemEnabled',{sceneName:scene,sceneItemId:part.itemId,sceneItemEnabled:true});
  }
 }
 async template(d){
  if(d.remove){const old=this.templates;this.templates=this.templates.filter(t=>t.id!==d.id);try{await this.save();}catch(e){this.templates=old;throw e;}return;}
  const scene=await this.scene(d.input),comp=this.entries[scene.sceneUuid]?.composition;if(!comp)throw Error('Selecione uma composição');const name=String(d.name||scene.sceneName).trim();if(!name||name.length>60)throw Error('Nome do modelo inválido');if(this.templates.length>=50)throw Error('Limite de cinquenta modelos por projeto');
  const v=await this.p.req('GetVideoSettings'),defaults=slotRects(comp.layout,v.baseHeight>v.baseWidth,v.baseWidth/v.baseHeight),t={id:randomUUID(),name,layout:comp.layout,color:comp.color,orientation:comp.orientation,backgroundSpec:comp.backgroundSpec?{type:comp.backgroundSpec.type,file:comp.backgroundSpec.file,source:comp.backgroundSpec.source,mode:comp.backgroundSpec.mode}:undefined,slots:comp.slots.map((s,n)=>({rect:s.rect||defaults[n],mode:s.mode,crop:s.crop,rotation:s.rotation,border:s.border,shadow:s.shadow,mask:s.mask,anchors:s.anchors,locked:s.locked,enabled:s.enabled}))};
  this.templates.push(t);try{await this.save();}catch(e){this.templates.pop();throw e;}
 }
 async anchor(d){const scene=await this.scene(d.input),comp=this.entries[scene.sceneUuid]?.composition,slot=comp?.slots.find(s=>s.id===d.slot);if(!slot)throw Error('Camada não encontrada');if(slot.locked)throw Error('Desbloqueie a camada');const video=await this.p.req('GetVideoSettings'),profile={anchor:d.anchor,size:d.size,margin:d.margin||[.04,.04]},rect=anchoredRect(video,d.orientation,profile.anchor,profile.size,profile.margin),old=structuredClone(slot.anchors);slot.anchors={...slot.anchors,[d.orientation]:profile};try{const orientation=comp.orientation||(video.baseHeight>video.baseWidth?'portrait':'landscape');if(orientation===d.orientation)await this.geometry({input:scene.sceneUuid,slots:[{id:slot.id,rect}]});else await this.save();}catch(e){slot.anchors=old;throw e;}}
 async variant(d){if(!['portrait','landscape'].includes(d.orientation))throw Error('Orientação inválida');const source=await this.scene(d.input),before=structuredClone(this.entries[source.sceneUuid]?.composition);if(!before)throw Error('Selecione uma composição');await this.duplicate({input:source.sceneUuid,name:d.name||source.sceneName.slice(0,44)+(d.orientation==='portrait'?' vertical':' horizontal')});const uuid=this.last.createdKey,comp=this.entries[uuid].composition,video=await this.p.req('GetVideoSettings'),viewport=orientationViewport(video,d.orientation),layout=comp.layout.startsWith('vertical')?(comp.layout==='verticalpip'?'pip':'2box'):({'grid2':'2box','grid3':'3box'}[comp.layout]||comp.layout),currentPreset=compositionPresets.find(p=>p.id===layout),variantPreset=currentPreset?compositionPresets.find(p=>p.orientation===d.orientation&&p.family===currentPreset.family&&p.count===currentPreset.count):null,defaults=variantPreset?variantPreset.rects:slotRects(layout,d.orientation==='portrait',d.orientation==='portrait'?9/16:16/9);if(variantPreset){comp.layout=variantPreset.id;comp.preset=variantPreset.id;}comp.orientation=d.orientation;comp.viewport=viewport;comp.variantOf=source.sceneUuid;const linked=d.linked!==false,syncGroup=before.syncGroup||randomUUID();if(linked){comp.syncGroup=syncGroup;comp.slots.forEach((s,n)=>s.linkKey=before.slots[n].linkKey||before.slots[n].id);}const changes=comp.slots.map((slot,n)=>{const anchor=slot.anchors?.[d.orientation],r=defaults[n];return {id:slot.id,rect:anchor?anchoredRect(video,d.orientation,anchor.anchor,anchor.size,anchor.margin):[viewport[0]+r[0]*viewport[2],viewport[1]+r[1]*viewport[3],r[2]*viewport[2],r[3]*viewport[3]]};});try{const locked=comp.slots.map(s=>s.locked);comp.slots.forEach(s=>s.locked=false);try{await this.geometry({input:uuid,slots:changes});if(comp.backgroundSpec?.itemId)await this.transform((await this.scene(uuid)).sceneName,comp.backgroundSpec.itemId,viewport,comp.backgroundSpec.mode);}finally{comp.slots.forEach((s,n)=>s.locked=locked[n]);}if(linked){const original=this.entries[source.sceneUuid].composition;original.syncGroup=syncGroup;original.slots.forEach((s,n)=>s.linkKey=before.slots[n].linkKey||before.slots[n].id);}await this.save();this.last={createdKey:uuid,linked};}catch(e){this.entries[source.sceneUuid].composition=before;await this.remove({input:uuid});throw e;}}
 async speaker(d){const scene=await this.scene(d.input),comp=this.entries[scene.sceneUuid]?.composition;if(!comp)throw Error('Selecione uma composição');const options=speakerOptions(d,comp.slots);if(options.enabled&&comp.slots.some(s=>s.locked))throw Error('Desbloqueie as camadas antes do enquadramento automático');for(const m of options.mappings){const input=this.p.state.sourceInputs?.find(i=>i.key===m.audioKey),audio=this.p.state.audioInputs?.find(a=>a.name===input?.name),director=this.p.state.calls?.director;if(!input||audio?.bus||input.key===director?.key||input.name===director?.name||/^3Mix (?:Master|Bus|Retorno|N1)(?:\s|$)/.test(input.name))throw Error('Locutor deve usar fonte de áudio pública; mic privado/retornos excluídos');}const old=comp.speaker;if(!options.enabled&&old?.baseline){await this.geometry({input:scene.sceneUuid,slots:old.baseline.filter(s=>!comp.slots.find(c=>c.id===s.id)?.locked),fromSpeaker:true,skipHistory:true});}const v=await this.p.req('GetVideoSettings'),defaults=slotRects(comp.layout,v.baseHeight>v.baseWidth,v.baseWidth/v.baseHeight);comp.speaker={...options,baseline:old?.enabled?old.baseline:comp.slots.map((s,n)=>({id:s.id,rect:s.rect||defaults[n]})),reason:null};this.speakerStates.delete(scene.sceneUuid);await this.save();}
 async observeAudio(context){if(this.speakerBusy||!context.connected)return;this.speakerBusy=true;try{for(const [uuid,meta]of Object.entries(this.entries)){const comp=meta.composition,cfg=comp?.speaker;if(!cfg?.enabled)continue;if(comp.slots.some(s=>s.locked)){cfg.enabled=false;cfg.reason='Camada bloqueada manualmente';await this.save();continue;}const st=this.speakerStates.get(uuid)||{};this.speakerStates.set(uuid,st);const active=chooseSpeaker(cfg,st,context);if(!active)continue;const video=context.video||await this.p.req('GetVideoSettings');try{await this.geometry({input:uuid,slots:speakerRects(comp.slots,active,orientationViewport(video,comp.orientation||'landscape')),fromSpeaker:true,skipHistory:true});cfg.activeSlot=active;cfg.reason=null;}catch(e){cfg.enabled=false;cfg.reason=e.message;await this.save();}}}finally{this.speakerBusy=false;}}
 async waitSceneRemoved(uuid){for(let n=0;n<40;n++){if(!(await this.p.req('GetSceneList')).scenes.some(s=>s.sceneUuid===uuid))return;await new Promise(r=>setTimeout(r,25));}throw Error('Motor ainda está removendo a cena; aguarde a atualização');}
 async remove(d){const scene=await this.scene(d.input);if(/^PGM M\/E \d+$/.test(scene.sceneName))throw Error('Esta entrada é o Programa de um M/E e não pode ser removida.');const meta=this.entries[scene.sceneUuid],live=new Set((await this.p.req('GetSceneList')).scenes.map(s=>s.sceneUuid));if(Object.entries(this.entries).some(([key,entry])=>key!==scene.sceneUuid&&live.has(key)&&(entry.composition?.backgroundSpec?.source===scene.sceneUuid||entry.composition?.slots.some(slot=>slot.inputKey===scene.sceneUuid))))throw Error('Entrada usada em outra composição. Troque os slots/fundo ou remova a composição dependente primeiro.');await this.p.req('RemoveScene',{sceneName:scene.sceneName});await this.waitSceneRemoved(scene.sceneUuid);await this.removeArtifacts(meta);delete this.entries[scene.sceneUuid];this.speakerStates.delete(scene.sceneUuid);await this.save();}
 async removeArtifacts(meta){const comp=meta?.composition;if(!comp)return;for(const slot of comp.slots){if(slot.wrapper?.name?.startsWith('3Mix Slot '))await this.p.optional('RemoveScene',{sceneName:slot.wrapper.name});for(const part of Object.values(slot.decorations||{}))if(part.source?.startsWith('3Mix '))await this.p.optional('RemoveInput',{inputName:part.source});}if(comp.backgroundSpec?.ownedSource?.startsWith('3Mix Fundo '))await this.p.optional('RemoveInput',{inputName:comp.backgroundSpec.ownedSource});if(comp.background?.startsWith('Fundo '))await this.p.optional('RemoveInput',{inputName:comp.background});}
 async prunePrivateScenes(){const scenes=(await this.p.req('GetSceneList')).scenes,live=new Set(scenes.map(s=>s.sceneUuid));let changed=false;for(const [uuid,meta]of Object.entries(this.entries))if(meta.composition&&!live.has(uuid)){await this.removeArtifacts(meta);delete this.entries[uuid];changed=true;}if(changed)await this.save();}
 async execute(action,d){if(action==='input_content_undo')return this.contentUndo(d);if(action==='input_link')return this.link(d);if(action==='input_background')return this.synchronized(d,'background');if(action==='input_anchor')return this.anchor(d);if(action==='input_variant')return this.variant(d);if(action==='input_speaker')return this.speaker(d);if(action==='input_remove')return this.remove(d);if(action==='input_style')return this.style(d);if(action==='input_template')return this.template(d);if(action==='input_create')return this.create(d);if(action==='input_slot')return this.synchronized(d,'replace');if(action==='input_tags')return this.tags(d);if(action==='input_geometry')return this.geometry(d);if(action==='input_reorder')return this.reorder(d);if(action==='input_layer')return this.layer(d);if(action==='input_align')return this.align(d);if(action==='input_undo')return this.undo(d);if(action==='input_duplicate')return this.duplicate(d);throw Error('Comando de entrada inválido');}
}
