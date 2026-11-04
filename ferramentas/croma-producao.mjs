// 3Mix Chroma — exposição profissional do filtro oficial do libobs.
//
// Não existe segundo algoritmo de chroma: o recorte é feito por `chroma_key_filter`, o mesmo
// filtro que o OBS usa, na sua versão 2 (a que este motor registra). O que este módulo entrega é
// o que faltava em volta dele: contrato de parâmetros correto para a v2, validação de faixa,
// conta-gotas sobre a imagem real da fonte, presets por projeto, persistência e proteção contra
// aplicação dupla em fonte aninhada.
//
// Contrato real da v2 lido em 3mix-engine/plugins/obs-filters/chroma-key-filter.c:
//   key_color_type  string   green | blue | magenta | custom   (green/blue/magenta ignoram key_color)
//   key_color       int      0xBBGGRR (bits 0-7 R, 8-15 G, 16-23 B)
//   similarity      int      1..1000   (400 padrão)
//   smoothness      int      1..1000   (80 padrão)
//   spill           int      0..1000   (100 padrão)
//   opacity         float    0.0..1.0  (1.0 padrão)  ← v2 é fração, não porcentagem
//   contrast        float    -4.0..4.0 (0.0 padrão)
//   brightness      float    -1.0..1.0 (0.0 padrão)
//   gamma           float    -1.0..1.0 (0.0 padrão)
// A v2 é SDR-only: em fonte HDR ela se declara inativa (SdrOnlyInfo). Não mascaramos isso.
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {decodePng,decodeBmp,averageColor,alphaStats,rgbToKeyColor,keyColorToHex,hexToKeyColor} from './midia-imagem.mjs';

export const CHROMA_KIND='chroma_key_filter';
export const CHROMA_FILTER='3Mix Chroma';
export const NV_CHROMA_KIND='nv_greenscreen_filter';
export const NV_CHROMA_FILTER='3Mix NVIDIA Fundo';
export const NV_MODES=[
 {id:0,label:'Qualidade Máxima'},
 {id:1,label:'Alta Performance'},
 {id:2,label:'Qualidade + Cadeira de Escritório'},
 {id:3,label:'Performance + Cadeira de Escritório'}
];
export const NV_DEFAULTS={mode:0,threshold:1.0,processing_interval:1};
const KEY_TYPES=['green','blue','magenta','custom'];
const SPEC={
 similarity:{kind:'int',min:1,max:1000,def:400},
 smoothness:{kind:'int',min:1,max:1000,def:80},
 spill:{kind:'int',min:0,max:1000,def:100},
 opacity:{kind:'float',min:0,max:1,def:1},
 contrast:{kind:'float',min:-4,max:4,def:0},
 brightness:{kind:'float',min:-1,max:1,def:0},
 gamma:{kind:'float',min:-1,max:1,def:0},
 key_color:{kind:'int',min:0,max:0xffffff,def:0x00ff00},
};
export const CHROMA_DEFAULTS={key_color_type:'green',...Object.fromEntries(Object.entries(SPEC).map(([k,v])=>[k,v.def]))};
const PRESET_LIMIT=60;
const BUILTIN=[
 {id:'builtin-green',name:'Verde padrão',settings:{...CHROMA_DEFAULTS}},
 {id:'builtin-green-hair',name:'Verde · cabelo e borda',settings:{...CHROMA_DEFAULTS,similarity:300,smoothness:200,spill:180}},
 {id:'builtin-green-hard',name:'Verde · fundo uniforme',settings:{...CHROMA_DEFAULTS,similarity:520,smoothness:40,spill:60}},
 {id:'builtin-blue',name:'Azul padrão',settings:{...CHROMA_DEFAULTS,key_color_type:'blue'}},
 {id:'builtin-magenta',name:'Magenta padrão',settings:{...CHROMA_DEFAULTS,key_color_type:'magenta'}},
];
const INTERNAL=/^3Mix (?:Barramentos|Slot|Retorno|N1|Bus|Master)/;

const fail=message=>{throw Error(message);};
function number(value,spec,name){
 if(typeof value==='string'&&value.trim()==='')fail('Parâmetro vazio: '+name);
 const n=Number(value);
 if(!Number.isFinite(n))fail('Parâmetro numérico inválido: '+name);
 if(n<spec.min||n>spec.max)fail(`Parâmetro ${name} fora da faixa ${spec.min}..${spec.max}`);
 return spec.kind==='int'?Math.round(n):n;
}

// Normaliza e valida exatamente o contrato do filtro. Chave desconhecida é erro, não ignorada.
export function chromaSettings(input={}){
 if(input===null||typeof input!=='object'||Array.isArray(input))fail('Configuração de chroma inválida');
 const result={...CHROMA_DEFAULTS};
 for(const[key,value]of Object.entries(input)){
  if(key==='sdr_only_info')continue;                       // campo informativo do OBS, não operacional
  if(key==='key_color_type'){if(!KEY_TYPES.includes(value))fail('Tipo de cor inválido: use green, blue, magenta ou custom');result.key_color_type=value;continue;}
  const spec=SPEC[key];
  if(!spec)fail('Parâmetro de chroma desconhecido: '+key);
  result[key]=number(value,spec,key);
 }
 // key_color só tem efeito em "custom"; guardar a cor escolhida mesmo assim evita perder a
 // seleção do conta-gotas quando o operador alterna entre verde/azul e volta para personalizado.
 return result;
}

// Normaliza e valida os parâmetros do filtro NVIDIA Broadcast / Maxine Video Effects (nv_greenscreen_filter).
export function nvidiaSettings(input={}){
 if(input===null||typeof input!=='object'||Array.isArray(input))fail('Configuração NVIDIA inválida');
 const result={...NV_DEFAULTS};
 if(input.mode!==undefined){
  const m=Number(input.mode);
  if(!Number.isInteger(m)||m<0||m>3)fail('Modo NVIDIA inválido: use 0 (Qualidade), 1 (Performance), 2 (Qualidade+Cadeira) ou 3 (Performance+Cadeira)');
  result.mode=m;
 }
 if(input.threshold!==undefined){
  const th=Number(input.threshold);
  if(!Number.isFinite(th)||th<0||th>1)fail('Sensibilidade NVIDIA fora da faixa 0.0 a 1.0');
  result.threshold=Math.round(th*1e4)/1e4;
 }
 if(input.processing_interval!==undefined){
  const pi=Number(input.processing_interval);
  if(!Number.isInteger(pi)||pi<1||pi>4)fail('Intervalo de processamento NVIDIA fora da faixa 1 a 4 quadros');
  result.processing_interval=pi;
 }
 return result;
}

// O tally já resolve cena, aninhamento e composição: se a entrada aparece no Programa por
// qualquer caminho, o motor marca program=true nela.
function inProgram(production,key){
 const input=(production.state?.inputs||[]).find(i=>i.key===key);
 return {direct:!!input?.tally?.program};
}

export class ChromaEngine{
 constructor(p){this.p=p;this.scope=null;this.file=null;this.presets=[];this.last=null;this.suspendLock=new Map();this.capability=null;this.nvCapability=null;}
 async setScope(scope){
  if(this.scope===scope)return;
  this.scope=scope;
  const dir=join(this.p.root,'config/obs-studio/plugin_config/3mix-chroma');
  this.file=join(dir,createHash('sha256').update(scope||'').digest('hex').slice(0,24)+'.json');
  let data={format:1,presets:[]};
  try{data=JSON.parse(await readFile(this.file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(data.format!==1||!Array.isArray(data.presets))fail('Arquivo de presets de chroma inválido');
  this.presets=data.presets.filter(x=>x&&typeof x.id==='string'&&typeof x.name==='string'&&x.settings&&typeof x.settings==='object').slice(0,PRESET_LIMIT);
 }
 async save(){
  if(!this.file)fail('Projeto ainda não carregado');
  await mkdir(join(this.file,'..'),{recursive:true});
  await writeFile(this.file+'.tmp',JSON.stringify({format:1,presets:this.presets},null,2));
  await rename(this.file+'.tmp',this.file);
 }
 async support(){
  if(this.capability!==null)return this.capability;
  const kinds=(await this.p.req('GetSourceFilterKindList')).sourceFilterKinds;
  this.capability=kinds.includes(CHROMA_KIND);
  return this.capability;
 }
 async supportNv(){
  if(this.nvCapability!==null)return this.nvCapability;
  try{
   const kinds=(await this.p.req('GetSourceFilterKindList')).sourceFilterKinds||[];
   this.nvCapability=kinds.includes(NV_CHROMA_KIND);
  }catch{this.nvCapability=false;}
  return this.nvCapability;
 }
 targets(){
  const director=this.p.state?.calls?.director?.key;
  return (this.p.state?.inputs||[]).filter(x=>!x.audioOnly&&x.key&&x.key!==director&&!INTERNAL.test(x.name));
 }
 source(key){
  const target=this.targets().find(x=>x.key===key || x.name===key);
  if(!target)fail('Entrada visual indisponível para chroma');
  return target;
 }
 async filterOf(key){
  try{
   const filters=(await this.p.req('GetSourceFilterList',{sourceUuid:key})).filters||[];
   const found=filters.find(f=>f.filterName===CHROMA_FILTER||f.filterKind===CHROMA_KIND||f.filterKind==='chroma_key_filter_v2'||f.filterName==='Chroma Key');
   if(found){
    const full=await this.p.req('GetSourceFilter',{sourceUuid:key,filterName:found.filterName}).catch(()=>null);
    return {
     filterName:found.filterName,
     filterKind:found.filterKind||CHROMA_KIND,
     filterEnabled:full?.filterEnabled??found.filterEnabled??false,
     filterSettings:full?.filterSettings||{},
     targetUuid:key
    };
   }
  }catch{}
  try{
   const items=(await this.p.req('GetSceneItemList',{sceneUuid:key})).sceneItems||[];
   for(const it of items){
    if(it.sourceUuid){
     const subList=(await this.p.req('GetSourceFilterList',{sourceUuid:it.sourceUuid})).filters||[];
     const found=subList.find(f=>f.filterName===CHROMA_FILTER||f.filterKind===CHROMA_KIND||f.filterKind==='chroma_key_filter_v2'||f.filterName==='Chroma Key');
     if(found){
      const full=await this.p.req('GetSourceFilter',{sourceUuid:it.sourceUuid,filterName:found.filterName}).catch(()=>null);
      return {
       filterName:found.filterName,
       filterKind:found.filterKind||CHROMA_KIND,
       filterEnabled:full?.filterEnabled??found.filterEnabled??false,
       filterSettings:full?.filterSettings||{},
       targetUuid:it.sourceUuid
      };
     }
    }
   }
  }catch{}
  return null;
 }
 async filterNvOf(key){
  try{
   const filters=(await this.p.req('GetSourceFilterList',{sourceUuid:key})).filters||[];
   const found=filters.find(f=>f.filterName===NV_CHROMA_FILTER||f.filterKind===NV_CHROMA_KIND);
   if(found){
    const full=await this.p.req('GetSourceFilter',{sourceUuid:key,filterName:found.filterName}).catch(()=>null);
    return {
     filterName:found.filterName,
     filterKind:found.filterKind||NV_CHROMA_KIND,
     filterEnabled:full?.filterEnabled??found.filterEnabled??false,
     filterSettings:full?.filterSettings||{},
     targetUuid:key
    };
   }
  }catch{}
  try{
   const items=(await this.p.req('GetSceneItemList',{sceneUuid:key})).sceneItems||[];
   for(const it of items){
    if(it.sourceUuid){
     const subList=(await this.p.req('GetSourceFilterList',{sourceUuid:it.sourceUuid})).filters||[];
     const found=subList.find(f=>f.filterName===NV_CHROMA_FILTER||f.filterKind===NV_CHROMA_KIND);
     if(found){
      const full=await this.p.req('GetSourceFilter',{sourceUuid:it.sourceUuid,filterName:found.filterName}).catch(()=>null);
      return {
       filterName:found.filterName,
       filterKind:found.filterKind||NV_CHROMA_KIND,
       filterEnabled:full?.filterEnabled??found.filterEnabled??false,
       filterSettings:full?.filterSettings||{},
       targetUuid:it.sourceUuid
      };
     }
    }
   }
  }catch{}
  return null;
 }
 // Uma fonte aninhada pode receber chroma duas vezes: no próprio input e na cena que o contém.
 // Não bloqueia (o operador pode ter motivo), mas devolve o aviso junto da resposta.
 async nestWarning(key){
  const uid=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i,scenes=(await this.p.req('GetSceneList')).scenes;
  const scene=scenes.find(s=>s.sceneUuid===key);
  const hasFilter=async name=>{try{return (await this.p.req('GetSourceFilterList',{sourceName:name})).filters.some(f=>f.filterName===CHROMA_FILTER&&f.filterEnabled);}catch{return false;}};
  if(scene){
   const items=(await this.p.req('GetSceneItemList',{sceneUuid:key})).sceneItems||[];
   for(const item of items){if(!uid.test(item.sourceUuid||''))continue;const source=(this.p.state?.sourceInputs||[]).find(s=>s.key===item.sourceUuid);if(source&&await hasFilter(source.name))return `A cena "${scene.sceneName}" contém "${source.name}", que já tem chroma ativo. O recorte seria aplicado duas vezes.`;}
   return null;
  }
  for(const s of scenes){if(s.sceneName===key)continue;let items;try{items=(await this.p.req('GetSceneItemList',{sceneUuid:s.sceneUuid})).sceneItems||[];}catch{continue;}
   if(items.some(i=>i.sourceUuid===key)&&await hasFilter(s.sceneName))return `Esta fonte também está na cena "${s.sceneName}", que tem chroma ativo. O recorte seria aplicado duas vezes.`;}
  return null;
 }
 async summary(key){
  const supported=await this.support();
  const nvidiaSupported=await this.supportNv();
  const presets=[...BUILTIN.map(b=>({...b,builtin:true})),...this.presets.map(x=>({...x,builtin:false}))];
  const targets=this.targets().map(x=>({key:x.key,name:x.name,kind:x.kind||''}));
  let details=null;
  const resolvedTarget = key ? this.targets().find(x=>x.key===key || x.name===key) : null;
  if(resolvedTarget){
   const actualKey = resolvedTarget.key;
   const filter=await this.filterOf(actualKey);
   const nvFilter=await this.filterNvOf(actualKey);
   details={
    key: actualKey,
    name: resolvedTarget.name,
    exists:!!filter,
    enabled:filter?.filterEnabled||false,
    settings:chromaSettings(filter?.filterSettings||{}),
    kind:filter?.filterKind||null,
    name:filter?.filterName||null,
    warning:await this.nestWarning(actualKey),
    nvidia:{
     exists:!!nvFilter,
     enabled:nvFilter?.filterEnabled||false,
     settings:nvidiaSettings(nvFilter?.filterSettings||{}),
     kind:nvFilter?.filterKind||null,
     name:nvFilter?.filterName||null
    }
   };
  }
  return {
   supported,kind:CHROMA_KIND,filterName:CHROMA_FILTER,defaults:CHROMA_DEFAULTS,spec:SPEC,keyTypes:KEY_TYPES,
   nvidiaSupported,nvidiaKind:NV_CHROMA_KIND,nvidiaFilterName:NV_CHROMA_FILTER,nvidiaModes:NV_MODES,nvidiaDefaults:NV_DEFAULTS,
   presets,targets,details,scope:this.scope,
   limitations:[
    'O recorte usa chroma_key_filter (v2) do motor ou nv_greenscreen_filter (NVIDIA Maxine RTX).',
    'A v2 oficial é SDR-only: em fonte HDR o filtro se declara inativo em vez de recortar.',
    'Opacidade da v2 é fração de 0 a 1 (não porcentagem).',
    'Contraste da v2 vai de -4 a 4.',
    'Chroma NVIDIA requer placa NVIDIA GeForce RTX e NVIDIA Video Effects SDK instalado.'
   ]
  };
 }
 async execute(action,d={}){
  if(!await this.support())fail('Este motor não registra o filtro chroma_key_filter');
  if(action==='chroma_read')return this.summary(d.key);
  if(action==='chroma_sample')return this.sample(d);
  if(action==='chroma_probe')return this.probe(d);
  if(action==='chroma_preset_remove'){
   const id=String(d.presetId||'');
   if(BUILTIN.some(b=>b.id===id))fail('Presets de fábrica não podem ser removidos');
   const before=this.presets.length;
   this.presets=this.presets.filter(x=>x.id!==id);
   if(this.presets.length===before)fail('Preset não encontrado');
   await this.save();return {removed:id};
  }
  if(action==='chroma_preset_save'){
   const name=String(d.name||'').trim();
   if(!name||name.length>60||/[\x00-\x1f]/.test(name))fail('Nome de preset inválido');
   const settings=chromaSettings(d.settings);
   const current=d.presetId?this.presets.find(x=>x.id===d.presetId):null;
   if(current){current.name=name;current.settings=settings;}
   else{
    if(this.presets.length>=PRESET_LIMIT)fail(`Limite de ${PRESET_LIMIT} presets por projeto`);
    this.presets.push({id:randomUUID(),name,settings,createdAt:Date.now()});
   }
   await this.save();
   return {preset:current||this.presets.at(-1),total:this.presets.length};
  }
  if(action==='chroma_preset_apply'){
   const preset=[...BUILTIN,...this.presets].find(x=>x.id===d.presetId);
   if(!preset)fail('Preset de chroma não encontrado');
   return this.apply({...d,settings:preset.settings});
  }
  if(action==='chroma_apply')return this.apply(d);
  if(action==='chroma_remove')return this.remove(d);
  if(action==='chroma_nvidia_apply')return this.applyNv(d);
  if(action==='chroma_nvidia_remove')return this.removeNv(d);
  fail('Ação de chroma inválida');
 }
 async applyNv(d){
  if(!await this.supportNv())fail('O filtro NVIDIA Broadcast (nv_greenscreen_filter) não está disponível no motor. Verifique a placa NVIDIA RTX e o SDK instalado.');
  const target=this.source(d.key);
  if(typeof d.enabled!=='boolean')fail('Informe se o filtro NVIDIA fica ativo ou desligado');
  const settings=nvidiaSettings(d.settings);
  const list=(await this.p.req('GetSourceFilterList',{sourceUuid:target.key})).filters||[];
  const existing=list.find(f=>f.filterName===NV_CHROMA_FILTER);
  if(existing&&existing.filterKind!==NV_CHROMA_KIND)fail('O nome "'+NV_CHROMA_FILTER+'" já é usado por outro filtro nesta fonte');
  if(existing){
   await this.p.req('SetSourceFilterSettings',{sourceUuid:target.key,filterName:NV_CHROMA_FILTER,filterSettings:settings,overlay:false});
  }else{
   await this.p.req('CreateSourceFilter',{sourceUuid:target.key,filterName:NV_CHROMA_FILTER,filterKind:NV_CHROMA_KIND,filterSettings:settings,filterEnabled:false});
  }
  await this.p.req('SetSourceFilterEnabled',{sourceUuid:target.key,filterName:NV_CHROMA_FILTER,filterEnabled:d.enabled});
  const confirmed=await this.p.req('GetSourceFilter',{sourceUuid:target.key,filterName:NV_CHROMA_FILTER});
  if(confirmed.filterKind!==NV_CHROMA_KIND)fail('O motor registrou outro filtro com este nome');
  if(confirmed.filterEnabled!==d.enabled)fail('O motor não confirmou o estado do filtro NVIDIA');
  const result={key:target.key,name:target.name,enabled:confirmed.filterEnabled,settings:nvidiaSettings(confirmed.filterSettings),kind:NV_CHROMA_KIND};
  this.last=result;
  return result;
 }
 async removeNv(d){
  const target=this.source(d.key);
  const existing=await this.filterNvOf(target.key);
  if(!existing)return {key:target.key,removed:false};
  if(existing.filterKind!==NV_CHROMA_KIND)fail('O filtro nesta fonte não é o 3Mix NVIDIA Fundo');
  await this.p.req('RemoveSourceFilter',{sourceUuid:target.key,filterName:NV_CHROMA_FILTER});
  this.last={key:target.key,removed:true};
  return this.last;
 }
 async apply(d){
  const target=this.source(d.key);
  if(typeof d.enabled!=='boolean')fail('Informe se o chroma fica ativo ou desligado');
  const settings=chromaSettings(d.settings);
  const warning=await this.nestWarning(target.key);
  const existing=await this.filterOf(target.key);
  const targetKey=existing?.targetUuid||target.key;
  const filterName=existing?.filterName||CHROMA_FILTER;
  if(existing){
   await this.p.req('SetSourceFilterSettings',{sourceUuid:targetKey,filterName,filterSettings:settings,overlay:false});
  }else{
   await this.p.req('CreateSourceFilter',{sourceUuid:targetKey,filterName:CHROMA_FILTER,filterKind:CHROMA_KIND,filterSettings:settings,filterEnabled:false});
  }
  await this.p.req('SetSourceFilterEnabled',{sourceUuid:targetKey,filterName,filterEnabled:d.enabled});
  const confirmed=await this.p.req('GetSourceFilter',{sourceUuid:targetKey,filterName});
  if(confirmed.filterKind!==CHROMA_KIND&&confirmed.filterKind!=='chroma_key_filter_v2')fail('O motor registrou outro filtro com este nome');
  if(confirmed.filterEnabled!==d.enabled)fail('O motor não confirmou o estado do chroma');
  if(confirmed.filterSettings?.last_error)fail('Motor recusou o chroma: '+confirmed.filterSettings.last_error);
  const result={key:target.key,targetKey,name:target.name,enabled:confirmed.filterEnabled,settings:chromaSettings(confirmed.filterSettings),warning};
  this.last=result;
  return result;
 }
 async remove(d){
  const target=this.source(d.key);
  const existing=await this.filterOf(target.key);
  if(!existing)return {key:target.key,removed:false};
  const targetKey=existing.targetUuid||target.key;
  const filterName=existing.filterName||CHROMA_FILTER;
  await this.p.req('RemoveSourceFilter',{sourceUuid:targetKey,filterName});
  this.last={key:target.key,removed:true};
  return this.last;
 }
 // Captura o quadro da fonte. Se o filtro estiver ativo e a fonte estiver fora do ar, o filtro é
 // suspenso por uma única captura e restaurado em finally. Se estiver no ar, nada é suspenso:
 // preferimos recusar a amostra a arriscar um quadro sem recorte na transmissão.
 async withRawFrame(key,capture){
  const previous=await this.suspendLock.get(key);
  if(previous)return previous;                                    // capturas concorrentes compartilham uma suspensão
  const run=(async()=>{
   const filter=await this.filterOf(key),wasEnabled=!!filter?.filterEnabled;
   const nvFilter=await this.filterNvOf(key).catch(()=>null),wasNvEnabled=!!nvFilter?.filterEnabled;
   const program=inProgram(this.p,key);
   if((wasEnabled||wasNvEnabled)&&program.direct)fail('Esta entrada está no Programa; desligue o chroma por um instante para amostrar a cor real do fundo');
   let suspendedChroma=false,suspendedNv=false;
   try{
    if(wasEnabled){await this.p.req('SetSourceFilterEnabled',{sourceUuid:key,filterName:CHROMA_FILTER,filterEnabled:false});suspendedChroma=true;}
    if(wasNvEnabled){await this.p.req('SetSourceFilterEnabled',{sourceUuid:key,filterName:NV_CHROMA_FILTER,filterEnabled:false});suspendedNv=true;}
    return await capture();
   }finally{
    if(suspendedChroma)await this.p.req('SetSourceFilterEnabled',{sourceUuid:key,filterName:CHROMA_FILTER,filterEnabled:true}).catch(()=>{});
    if(suspendedNv)await this.p.req('SetSourceFilterEnabled',{sourceUuid:key,filterName:NV_CHROMA_FILTER,filterEnabled:true}).catch(()=>{});
   }
  })();
  this.suspendLock.set(key,run);
  try{return await run;}finally{this.suspendLock.delete(key);}
 }
 // Imagem crua (sem o filtro) para a comparação antes/depois. Devolve o BMP original do motor:
 // o navegador desenha BMP nativamente, então não há recompressão no caminho da prévia.
 async rawImage(key,wanted=960){
  const target=this.source(key);
  return this.withRawFrame(target.key,async()=>{
   const shot=await this.rawShot(target.key,wanted,false);
   return {contentType:shot.contentType,buffer:shot.buffer,width:shot.width,height:shot.height};
  });
 }
 async rawShot(key,wanted=960,decode=false){
  const video=await this.p.req('GetVideoSettings');
  const scale=Math.min(1,wanted/Math.max(video.baseWidth||1920,video.baseHeight||1080));
  const imageWidth=Math.max(64,Math.round((video.baseWidth||1920)*scale)),imageHeight=Math.max(36,Math.round((video.baseHeight||1080)*scale));
  let lastError;
  for(const imageFormat of ['bmp','png']){
   try{
    const shot=await this.p.req('GetSourceScreenshot',{sourceUuid:key,imageFormat,imageWidth,imageHeight});
    const data=String(shot.imageData||''),comma=data.indexOf(',');
    if(!data.startsWith('data:image/')||comma<0)fail('O motor devolveu uma imagem em formato inesperado');
    const buffer=Buffer.from(data.slice(comma+1),'base64');
    const image=decode?(imageFormat==='bmp'?decodeBmp(buffer):decodePng(buffer)):null;
    return {buffer,contentType:'image/'+imageFormat,image,imageFormat,width:imageWidth,height:imageHeight};
   }catch(e){lastError=e;}
  }
  fail('Não foi possível ler o quadro da fonte: '+(lastError?.message||'erro desconhecido'));
 }
 async screenshot(key,wanted=480){
  const shot=await this.rawShot(key,wanted,true);
  return {image:shot.image,imageFormat:shot.imageFormat,width:shot.width,height:shot.height};
 }
 async sample(d){
  const target=this.source(d.key);
  const nx=Number(d.x),ny=Number(d.y);
  if(!Number.isFinite(nx)||!Number.isFinite(ny)||nx<0||nx>1||ny<0||ny>1)fail('Ponto de amostragem fora do quadro');
  const radius=d.radius===undefined?2:Number(d.radius);
  if(!Number.isInteger(radius)||radius<0||radius>8)fail('Raio de amostragem deve ser inteiro entre 0 e 8');
  const {image,imageFormat}=await this.withRawFrame(target.key,()=>this.screenshot(target.key));
  const color=averageColor(image,nx*image.width,ny*image.height,radius);
  const keyColor=rgbToKeyColor(color.r,color.g,color.b);
  const saturation=Math.max(color.r,color.g,color.b)-Math.min(color.r,color.g,color.b);
  const result={
   key:target.key,name:target.name,
   point:{x:nx,y:ny},radius,pixels:color.pixels,
   color:{...color,hex:keyColorToHex(keyColor)},
   hex:keyColorToHex(keyColor),
   keyColor,
   suggested:{key_color_type:'custom',key_color:keyColor,similarity:400,smoothness:80,spill:100,opacity:1,contrast:0,brightness:0,gamma:0},
   source:{width:image.width,height:image.height,format:imageFormat},
   warning:saturation<18?'A amostra tem pouca saturação; confira se o fundo é realmente chroma.':null
  };
  this.last=result;
  return result;
 }
 // Diagnóstico honesto da prévia: o filtro preserva alfa? Quanto do quadro ficou transparente?
 async probe(d){
  const target=this.source(d.key);
  const filter=await this.filterOf(target.key);
  if(!filter)fail('Aplique o 3Mix Chroma antes de conferir a transparência');
  const {image,imageFormat}=await this.screenshot(target.key);
  const stats=alphaStats(image);
  return {
   key:target.key,name:target.name,imageFormat,width:image.width,height:image.height,
   enabled:filter.filterEnabled,alpha:stats,
   alphaPreserved:stats.transparent>0||stats.partial>0,
   note:stats.transparent>0||stats.partial>0?'O motor entrega alfa nesta captura; a prévia pode usar fundo quadriculado real.':'Esta captura não trouxe alfa; a prévia mostra o quadro sobre fundo quadriculado apenas como referência visual.'
  };
 }
}
