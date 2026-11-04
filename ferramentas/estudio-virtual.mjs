// 3Mix Virtual Studio — cenários 2D/2.5D montados com fontes e filtros que o motor já tem.
//
// Não existe renderizador 3D próprio e nada novo é compilado: o encaixe em perspectiva usa
// `corner-pin.shader`, que já vem instalado junto do Shaderfilter (GPLv2, autoria SkeletonBow,
// derivado do StreamFX de Xaymar e da fórmula de Inigo Quilez). O binário do motor não muda.
//
// Ordem de camadas do cenário (2.5D com oclusão real):
//   fundo (cor ou fonte)  →  câmeras encaixadas em perspectiva  →  primeiro plano (mesa com alfa)
//
// Cada câmera entra por uma cena privada "3Mix Slot <uuid>", do mesmo tipo que o motor de
// composição já usa e já esconde da lista de entradas. Isso é obrigatório: o filtro é por FONTE,
// então aplicar o corner pin direto na câmera compartilhada deformaria a câmera em todo lugar.
// Com a cena privada, o encaixe vale só dentro do cenário.
//
// A cena do cenário é uma entrada normal do 3Mix: entra na lista, vai ao ar, recebe áudio e tally
// como qualquer outra. Não é uma tela nova do painel.
//
// Não é um motor de malhas 3D: são planos 2D posicionados em perspectiva. Não há paralaxe
// verdadeira nem câmera girando em torno do cenário, e a documentação diz isso com todas as letras.
import {readFile,writeFile,mkdir,rename,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {decodePng,decodeBmp,alphaStats} from './midia-imagem.mjs';

export const STUDIO_KIND='shader_filter';
export const STUDIO_FILTER='3Mix Estúdio';
export const STUDIO_SHADER='data/obs-plugins/obs-shaderfilter/examples/corner-pin.shader';
const SLOT_PREFIX='3Mix Slot ';
const SET_PREFIX='3Mix Estúdio';
const QUAD_KEYS=['tl','tr','br','bl'];
const UNIFORMS=['Top_Left_X','Top_Left_Y','Top_Right_X','Top_Right_Y','Bottom_Right_X','Bottom_Right_Y','Bottom_Left_X','Bottom_Left_Y'];
const PRESET_LIMIT=40;
const SET_LIMIT=24;
const fail=message=>{throw Error(message);};
const round=value=>Math.round(value*1e4)/1e4;

// ---------------------------------------------------------------------------------------------
// Geometria
// ---------------------------------------------------------------------------------------------

// Quatro cantos em coordenadas normalizadas do quadro do cenário (0,0 = canto superior esquerdo,
// 1,1 = canto inferior direito). A ordem é sempre tl → tr → br → bl, igual à do shader.
function quadPoints(quad){
 const points=[];
 for(const key of QUAD_KEYS){
  const point=quad?.[key];
  if(!Array.isArray(point)||point.length!==2)fail('Enquadramento incompleto: informe os quatro cantos');
  const x=Number(point[0]),y=Number(point[1]);
  if(!Number.isFinite(x)||!Number.isFinite(y))fail('Canto de enquadramento inválido');
  // Um canto pode sair um pouco do quadro (câmera cortada de propósito), mas não pode ir longe:
  // valores extremos viram textura esticada e não é isso que o operador vê na prévia.
  if(x<-1||x>2||y<-1||y>2)fail('Canto fora do quadro: use valores entre -1 e 2');
  points.push([x,y]);
 }
 return points;
}
function polygonArea(points){
 let area=0;
 for(let i=0;i<points.length;i++){const [x1,y1]=points[i],[x2,y2]=points[(i+1)%points.length];area+=x1*y2-x2*y1;}
 return area/2;
}
// O shader resolve o encaixe por bilinear inversa. Um quadrilátero côncavo ou cruzado não tem
// solução única e produz manchas; recusar é melhor do que entregar imagem quebrada no ar.
function isConvex(points){
 let sign=0;
 for(let i=0;i<points.length;i++){
  const [ax,ay]=points[i],[bx,by]=points[(i+1)%points.length],[cx,cy]=points[(i+2)%points.length];
  const cross=(bx-ax)*(cy-by)-(by-ay)*(cx-bx);
  if(Math.abs(cross)<1e-9)return false;
  const side=Math.sign(cross);
  if(sign===0)sign=side;else if(side!==sign)return false;
 }
 return true;
}
export function studioQuad(input){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('Enquadramento inválido');
 const points=quadPoints(input),result={};
 // A área mínima evita canto colapsado: um quadrilátero de área zero gera divisão por zero no shader.
 if(Math.abs(polygonArea(points))<0.002)fail('Os quatro cantos estão sobrepostos demais para formar uma área');
 if(!isConvex(points))fail('Os cantos formam um quadrilátero cruzado ou côncavo; ajuste a ordem dos cantos');
 QUAD_KEYS.forEach((key,n)=>{result[key]=[round(points[n][0]),round(points[n][1])];});
 return result;
}
// Normalizado (0..1) → unidade do shader (-100..100, percentual de meia moldura).
const toShader=value=>round((value*2-1)*100);
const fromShader=value=>round((Number(value)/100+1)/2);

// Converte o enquadramento nos oito uniformes reais do corner-pin.shader, sem inventar nomes.
export function cornerPinSettings(quad,antialias=true){
 const q=studioQuad(quad);
 return {
  Top_Left_X:toShader(q.tl[0]),Top_Left_Y:toShader(q.tl[1]),
  Top_Right_X:toShader(q.tr[0]),Top_Right_Y:toShader(q.tr[1]),
  Bottom_Right_X:toShader(q.br[0]),Bottom_Right_Y:toShader(q.br[1]),
  Bottom_Left_X:toShader(q.bl[0]),Bottom_Left_Y:toShader(q.bl[1]),
  Antialias_Edges:!!antialias
 };
}
// Caminho inverso: lê o que o motor realmente tem gravado e devolve o enquadramento em 0..1.
export function quadFromSettings(settings){
 if(!settings||typeof settings!=='object')fail('Filtro sem parâmetros de enquadramento');
 const pick=key=>{const value=Number(settings[key]);if(!Number.isFinite(value))fail('Filtro sem o parâmetro '+key);return fromShader(value);};
 return studioQuad({tl:[pick('Top_Left_X'),pick('Top_Left_Y')],tr:[pick('Top_Right_X'),pick('Top_Right_Y')],br:[pick('Bottom_Right_X'),pick('Bottom_Right_Y')],bl:[pick('Bottom_Left_X'),pick('Bottom_Left_Y')]});
}

// ---------------------------------------------------------------------------------------------
// Zoom Virtual e Travelling Broadcast
// ---------------------------------------------------------------------------------------------

// Aplica escala de lente virtual e translação Pan/Tilt sobre os quatro vértices do enquadramento.
export function applyVirtualZoom(baseQuad, zoom=1.0, panX=0.0, panY=0.0){
 const q=studioQuad(baseQuad);
 const z=Math.max(1.0,Math.min(3.5,Number(zoom)||1.0));
 const px=Math.max(-1.0,Math.min(1.0,Number(panX)||0.0));
 const py=Math.max(-1.0,Math.min(1.0,Number(panY)||0.0));
 const cx=0.5+px;
 const cy=0.5+py;

 const transform=([x,y])=>[
  round((x-cx)*z+0.5),
  round((y-cy)*z+0.5)
 ];

 return studioQuad({
  tl:transform(q.tl),
  tr:transform(q.tr),
  br:transform(q.br),
  bl:transform(q.bl)
 });
}

export const STUDIO_ZOOM_PRESETS=[
 {id:'wide',name:'Plano Geral (1.0x)',zoom:1.0,panX:0.0,panY:0.0},
 {id:'medium',name:'Plano Médio (1.45x)',zoom:1.45,panX:0.0,panY:0.15},
 {id:'close',name:'Close-Up (2.1x)',zoom:2.1,panX:0.0,panY:0.25},
 {id:'screen',name:'Foco Telão (1.7x)',zoom:1.7,panX:0.35,panY:0.05},
 {id:'guest',name:'Convidado (1.5x)',zoom:1.5,panX:-0.3,panY:0.1}
];

// ---------------------------------------------------------------------------------------------
// Biblioteca de cenários e Packs Oficiais 3Mix
// ---------------------------------------------------------------------------------------------

export async function findVirtualSetsDir(root){
 const candidates=[
  process.env.FREEMIX_VIRTUALSETS_DIR,
  join(root,'..','virtualsets','3Mix Virtual Sets 1 a 07'),
  join(root,'virtualsets','3Mix Virtual Sets 1 a 07'),
  join(root,'..','virtualsets'),
  join(root,'virtualsets'),
  'D:\\DRIVE\\IA\\antigravity\\3Mix\\virtualsets\\3Mix Virtual Sets 1 a 07'
 ].filter(Boolean);

 for(const dir of candidates){
  try{
   const s=await stat(dir);
   if(s.isDirectory()){
    const cat=join(dir,'CATALOGO_SETS.json');
    const sCat=await stat(cat).catch(()=>null);
    if(sCat&&sCat.isFile())return dir;
   }
  }catch{}
 }
 return null;
}

export async function loadVirtualSetsCatalog(root){
 const dir=await findVirtualSetsDir(root);
 if(!dir)return {packs:[],dir:null};
 try{
  const raw=await readFile(join(dir,'CATALOGO_SETS.json'),'utf8');
  const packs=JSON.parse(raw);
  return {packs,dir};
 }catch{
  return {packs:[],dir};
 }
}

const quad=(tlx,tly,trx,try_,brx,bry,blx,bly)=>({tl:[tlx,tly],tr:[trx,try_],br:[brx,bry],bl:[blx,bly]});
const BUILTIN=[
 {id:'builtin-solo',name:'Apresentador único',description:'Plano médio central com leve perspectiva. Fundo e primeiro plano definidos pelo operador.',slots:[{label:'A',quad:quad(.30,.06,.70,.06,.72,.99,.28,.99)}]},
 {id:'builtin-duo',name:'Dois apresentadores',description:'Duas câmeras lado a lado, uma de frente para a outra.',slots:[
  {label:'A',quad:quad(.03,.12,.48,.10,.49,.98,.02,.98)},
  {label:'B',quad:quad(.52,.10,.97,.12,.98,.98,.51,.98)}]},
 {id:'builtin-trio',name:'Três apresentadores',description:'Apresentador central maior, dois convidados nas laterais.',slots:[
  {label:'A',quad:quad(.33,.04,.67,.04,.69,.86,.31,.86)},
  {label:'B',quad:quad(.01,.22,.31,.18,.32,.99,.00,.99)},
  {label:'C',quad:quad(.69,.18,.99,.22,1.00,.99,.68,.99)}]},
 {id:'builtin-desk-2',name:'Mesa · 2 convidados',description:'Dois convidados atrás de uma mesa; o primeiro plano cobre a base.',slots:[
  {label:'A',quad:quad(.06,.18,.47,.16,.48,.94,.05,.96)},
  {label:'B',quad:quad(.53,.16,.94,.18,.95,.96,.52,.94)}]},
 {id:'builtin-desk-4',name:'Mesa · 4 convidados',description:'Quatro convidados em duas fileiras, com perspectiva nos cantos.',slots:[
  {label:'A',quad:quad(.02,.20,.26,.18,.27,.66,.01,.68)},
  {label:'B',quad:quad(.28,.17,.52,.17,.53,.66,.27,.66)},
  {label:'C',quad:quad(.55,.17,.79,.17,.80,.66,.54,.66)},
  {label:'D',quad:quad(.81,.18,1.00,.20,1.01,.68,.80,.66)}]},
 {id:'builtin-screen',name:'Telão único',description:'Uma câmera em telão 16:9; a parte de baixo fica livre para a mesa.',slots:[
  {label:'A',quad:quad(.14,.10,.86,.09,.87,.78,.13,.79)}]},
 {id:'builtin-wide-3',name:'Plano aberto · 3 câmeras',description:'Três câmeras em plano aberto com as laterais inclinadas para dentro.',slots:[
  {label:'A',quad:quad(.00,.16,.30,.22,.31,.99,-.01,.93)},
  {label:'B',quad:quad(.34,.10,.66,.10,.67,.99,.33,.99)},
  {label:'C',quad:quad(.70,.22,1.00,.16,1.01,.93,.69,.99)}]}
];
const BUILTIN_IDS=new Set(BUILTIN.map(x=>x.id));
const BACKGROUND_TYPES=['color','input','image'];
const HEX=/^#[a-f\d]{6}$/i;

// Normaliza a definição de fundo. Cor é criada como color_source_v3; imagem aponta para o
// arquivo do pack; fonte é uma entrada existente do 3Mix.
function backgroundSpec(input){
 const spec=input||{type:'color',color:'#101820'};
 if(!BACKGROUND_TYPES.includes(spec.type))fail('Fundo inválido: use cor, entrada ou imagem');
 if(spec.type==='color'){const color=String(spec.color||'');if(!HEX.test(color))fail('Cor de fundo inválida');return {type:'color',color:color.toUpperCase()};}
 if(spec.type==='image'){if(!spec.file)fail('Arquivo de imagem de fundo não informado');return {type:'image',file:String(spec.file)};}
 if(!spec.key)fail('Escolha a entrada de fundo');
 return {type:'input',key:String(spec.key)};
}
const abgr=hex=>{const value=parseInt(hex.slice(1),16);return (0xff000000|((value&255)<<16)|(value&0xff00)|(value>>16))>>>0;};
function hexRgb(hex){const value=parseInt(hex.slice(1),16);return {r:(value>>16)&255,g:(value>>8)&255,b:value&255};}
// Ponto dentro de polígono por lançamento de raio. Funciona também para quadriláteros que saem
// um pouco do quadro, que é justamente o caso de câmera cortada de propósito.
export function pointInQuad(x,y,polygon){
 let inside=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const [xi,yi]=polygon[i],[xj,yj]=polygon[j];
  if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
 }
 return inside;
}

// ---------------------------------------------------------------------------------------------
// Motor
// ---------------------------------------------------------------------------------------------

export class StudioEngine{
 constructor(p){this.p=p;this.scope=null;this.file=null;this.presets=[];this.sets={};this.last=null;this.available=null;this.shaderPath=join(p.root,STUDIO_SHADER);}

 async setScope(scope){
  if(this.scope===scope)return;
  this.scope=scope;
  const dir=join(this.p.root,'config/obs-studio/plugin_config/3mix-studio');
  this.file=join(dir,createHash('sha256').update(scope||'').digest('hex').slice(0,24)+'.json');
  let data={format:1,presets:[],sets:{}};
  try{data=JSON.parse(await readFile(this.file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(data.format!==1)fail('Arquivo de estúdio virtual inválido');
  this.presets=Array.isArray(data.presets)?data.presets.filter(x=>x&&typeof x.id==='string'&&typeof x.name==='string'&&Array.isArray(x.slots)&&x.slots.length>0).slice(0,PRESET_LIMIT):[];
  this.sets=data.sets&&typeof data.sets==='object'?data.sets:{};
 }
 async save(){
  if(!this.file)fail('Projeto ainda não carregado');
  await mkdir(join(this.file,'..'),{recursive:true});
  await writeFile(this.file+'.tmp',JSON.stringify({format:1,presets:this.presets,sets:this.sets},null,2));
  await rename(this.file+'.tmp',this.file);
 }

 // O filtro só existe se o Shaderfilter estiver instalado E o shader do corner pin estiver no
 // disco. Sem os dois, o módulo se declara indisponível em vez de falhar no meio da operação.
 async support(){
  if(this.available!==null)return this.available;
  let kinds=[];
  try{kinds=(await this.p.req('GetSourceFilterKindList')).sourceFilterKinds||[];}catch{this.available=false;return false;}
  let file=false;
  try{file=(await stat(this.shaderPath)).size>2000;}catch{}
  this.available=kinds.includes(STUDIO_KIND)&&file;
  return this.available;
 }
 targets(){return (this.p.state?.inputs||[]).filter(x=>!x.audioOnly);}

 // Resolve uma chave em nome real de fonte. Cenas e entradas vivem em listas diferentes no
 // obs-websocket, e CreateSceneItem só aceita nome — daí a tradução explícita.
 async resolve(key){
  if(!key)fail('Informe a entrada');
  const scenes=(await this.p.req('GetSceneList')).scenes||[];
  const scene=scenes.find(s=>s.sceneUuid===key||s.sceneName===key);
  if(scene)return {uuid:scene.sceneUuid,name:scene.sceneName,kind:'scene'};
  const inputs=(await this.p.req('GetInputList')).inputs||[];
  const input=inputs.find(i=>i.inputUuid===key||i.inputName===key);
  if(input)return {uuid:input.inputUuid,name:input.inputName,kind:'input'};
  fail('Entrada não encontrada no motor');
 }
 async filterOf(uuid){
  const filters=(await this.p.req('GetSourceFilterList',{sourceUuid:uuid})).filters||[];
  return filters.find(f=>f.filterName===STUDIO_FILTER)||null;
 }

 async applyFilter(uuid,quadValue,enabled,antialias=true){
  if(typeof enabled!=='boolean')fail('Informe se o encaixe fica ativo ou desligado');
  const geometry=cornerPinSettings(quadValue,antialias);
  const settings={...geometry,from_file:true,shader_file_name:this.shaderPath,override_entire_effect:false};
  const existing=await this.filterOf(uuid);
  if(existing&&existing.filterKind!==STUDIO_KIND)fail('O nome "'+STUDIO_FILTER+'" já é usado por outro filtro nesta fonte');
  if(existing)await this.p.req('SetSourceFilterSettings',{sourceUuid:uuid,filterName:STUDIO_FILTER,filterSettings:settings,overlay:false});
  else await this.p.req('CreateSourceFilter',{sourceUuid:uuid,filterName:STUDIO_FILTER,filterKind:STUDIO_KIND,filterSettings:settings,filterEnabled:false});
  await this.p.req('SetSourceFilterEnabled',{sourceUuid:uuid,filterName:STUDIO_FILTER,filterEnabled:enabled});
  // Confirmação real: relê o filtro do motor e compara com o que foi pedido. Não confia no eco.
  const confirmed=await this.p.req('GetSourceFilter',{sourceUuid:uuid,filterName:STUDIO_FILTER});
  if(confirmed.filterKind!==STUDIO_KIND)fail('O motor registrou outro filtro com este nome');
  if(confirmed.filterEnabled!==enabled)fail('O motor não confirmou o estado do encaixe');
  if(confirmed.filterSettings?.last_error)fail('Shader recusou o encaixe: '+confirmed.filterSettings.last_error);
  for(const key of UNIFORMS){
   const got=Number(confirmed.filterSettings?.[key]),want=Number(geometry[key]);
   if(!Number.isFinite(got)||Math.abs(got-want)>0.51)fail('O motor não aplicou o canto '+key+' (pedido '+want+', lido '+got+')');
  }
  const gotAA=confirmed.filterSettings?.Antialias_Edges;
  if(gotAA!==undefined&&!!gotAA!==!!antialias)fail('O motor não confirmou o suavizado de borda');
  return {uuid,enabled:confirmed.filterEnabled,quad:quadFromSettings(confirmed.filterSettings),antialias:gotAA!==false};
 }
 async removeFilter(uuid){
  const existing=await this.filterOf(uuid);
  if(!existing)return {removed:false};
  if(existing.filterKind!==STUDIO_KIND)fail('O filtro nesta fonte não é o 3Mix Estúdio');
  await this.p.req('RemoveSourceFilter',{sourceUuid:uuid,filterName:STUDIO_FILTER});
  return {removed:true};
 }

 preset(id){return [...BUILTIN,...this.presets].find(x=>x.id===id)||null;}
 presetsAll(){return [...BUILTIN.map(x=>({...x,builtin:true})),...this.presets.map(x=>({...x,builtin:false,saved:true}))];}

 // ------------------------------------------------------------------------------------------
 // Montagem do cenário
 // ------------------------------------------------------------------------------------------

 async uniqueSceneName(base){
  const live=(await this.p.req('GetSceneList')).scenes||[];
  const taken=new Set(live.map(s=>s.sceneName));
  if(!taken.has(base))return base;
  for(let n=2;n<200;n++){const candidate=base+' '+n;if(!taken.has(candidate))return candidate;}
  return fail('Não há nome livre para o cenário');
 }

 // Item ocupa o quadro inteiro com esticamento: é o que garante que as coordenadas 0..1 do
 // enquadramento sejam exatamente as coordenadas do quadro do cenário.
 async fit(scene,itemId){
  const video=await this.p.req('GetVideoSettings'),W=video.baseWidth||1920,H=video.baseHeight||1080;
  await this.p.req('SetSceneItemTransform',{sceneName:scene,sceneItemId:itemId,sceneItemTransform:{
   positionX:0,positionY:0,alignment:5,rotation:0,cropLeft:0,cropRight:0,cropTop:0,cropBottom:0,
   boundsType:'OBS_BOUNDS_STRETCH',boundsAlignment:5,boundsWidth:W,boundsHeight:H}});
 }
 async fitInner(scene,itemId){
  const video=await this.p.req('GetVideoSettings'),W=video.baseWidth||1920,H=video.baseHeight||1080;
  await this.p.req('SetSceneItemTransform',{sceneName:scene,sceneItemId:itemId,sceneItemTransform:{
   positionX:W/2,positionY:H/2,alignment:0,rotation:0,cropLeft:0,cropRight:0,cropTop:0,cropBottom:0,
   boundsType:'OBS_BOUNDS_SCALE_INNER',boundsAlignment:0,boundsWidth:W,boundsHeight:H}});
 }
 async indexOf(scene,itemId){
  const items=(await this.p.req('GetSceneItemList',{sceneName:scene})).sceneItems||[];
  const found=items.find(i=>i.sceneItemId===itemId);
  return found?found.sceneItemIndex:0;
 }

 // Cria o fundo e devolve o que precisa ser removido depois (item e eventual fonte de cor ou imagem).
 async createBackground(scene,spec){
  const video=await this.p.req('GetVideoSettings'),W=video.baseWidth||1920,H=video.baseHeight||1080;
  if(spec.type==='input'){
   const source=await this.resolve(spec.key);
   const item=await this.p.req('CreateSceneItem',{sceneName:scene,sourceName:source.name,sceneItemEnabled:true});
   await this.fit(scene,item.sceneItemId);
   return {itemId:item.sceneItemId,inputName:null,sourceName:source.name};
  }
  if(spec.type==='image'){
   const inputName='3Mix Fundo '+randomUUID();
   await this.p.req('CreateInput',{sceneName:scene,inputName,inputKind:'image_source',inputSettings:{file:spec.file,unload:false},sceneItemEnabled:true});
   const items=(await this.p.req('GetSceneItemList',{sceneName:scene})).sceneItems||[];
   const item=items.find(i=>i.sourceName===inputName);
   if(!item)fail('O motor não criou o fundo do cenário a partir da imagem');
   await this.fit(scene,item.sceneItemId);
   return {itemId:item.sceneItemId,inputName,sourceName:inputName};
  }
  const inputName='Fundo '+randomUUID();
  await this.p.req('CreateInput',{sceneName:scene,inputName,inputKind:'color_source_v3',inputSettings:{color:abgr(spec.color),width:W,height:H},sceneItemEnabled:true});
  const items=(await this.p.req('GetSceneItemList',{sceneName:scene})).sceneItems||[];
  const item=items.find(i=>i.sourceName===inputName);
  if(!item)fail('O motor não criou o fundo do cenário');
  await this.fit(scene,item.sceneItemId);
  return {itemId:item.sceneItemId,inputName};
 }

  // Constrói o cenário inteiro com arquitetura canônica das 4 Faixas.
  // Tudo é desfeito se qualquer passo falhar: uma cena pela metade
  // apareceria na lista de entradas como um cenário quebrado.
 async build(d){
  if(!await this.support())fail('Este motor não tem Shaderfilter com corner-pin.shader; o estúdio virtual não pode ser montado');
  let preset=d.presetId?this.preset(d.presetId):null;
  let pack=null;
  if(!preset&&d.presetId){
   const catalogData=await loadVirtualSetsCatalog(this.p.root).catch(()=>({packs:[]}));
   pack=catalogData.packs?.find(p=>p.id===d.presetId||p.pasta===d.presetId)||null;
   if(pack){
    preset={
     id:pack.id,
     name:pack.nome,
     description:pack.tipo,
     pack:true,
     slots:[{label:'A',quad:quad(.28,.20,.72,.20,.72,.66,.28,.66)}]
    };
   }
  }
  if(!preset)fail('Cenário não encontrado');
  const slots=Array.isArray(d.slots)&&d.slots.length?d.slots:preset.slots;
  if(slots.length!==preset.slots.length)fail(`O cenário "${preset.name}" precisa de ${preset.slots.length} câmera(s)`);
  const background=backgroundSpec(d.background);

  // Faixa 01: Telão multimídia (opcional, posicionado em Z=0 no fundo)
  let screen=null;
  if(d.screen?.key){
   const source=await this.resolve(d.screen.key);
   screen={key:source.uuid,name:source.name,bounds:d.screen.bounds||null};
  }

  // Faixa 03: Câmeras nos slots
  const cameras=[];
  for(const [n,slot] of slots.entries()){
   if(!slot.key)fail('Escolha a câmera do slot '+preset.slots[n].label);
   const source=await this.resolve(slot.key);
   if(source.name.startsWith(SLOT_PREFIX))fail('Cenas privadas de slot não podem ser usadas como câmera');
   cameras.push({label:preset.slots[n].label,key:source.uuid,name:source.name,quad:studioQuad(slot.quad||preset.slots[n].quad)});
  }
  if(new Set(cameras.map(c=>c.key)).size!==cameras.length)fail('A mesma câmera não pode ocupar dois slots do mesmo cenário');

  // Faixa 04: Primeiro plano / Bancada
  let foreground=null;
  if(d.foreground?.file){
   foreground={type:'image',file:String(d.foreground.file)};
  } else if(d.foreground?.key){
   const source=await this.resolve(d.foreground.key);
   if(cameras.some(c=>c.key===source.uuid))fail('O primeiro plano não pode ser uma das câmeras');
   foreground={type:'input',key:source.uuid,name:source.name};
  }

  if(background.type==='input'){
   const source=await this.resolve(background.key);
   if(cameras.some(c=>c.key===source.uuid))fail('O fundo não pode ser uma das câmeras');
   if(foreground&&foreground.type==='input'&&foreground.key===source.uuid)fail('Fundo e primeiro plano são a mesma fonte');
   background.sourceName=source.name;
  }

  const requested=String(d.name||'').trim()||SET_PREFIX+' · '+preset.name;
  if(requested.length>60||/[\x00-\x1f]/.test(requested))fail('Nome do cenário inválido');
  if(requested.startsWith(SLOT_PREFIX))fail('Nome reservado ao módulo');
  const name=await this.uniqueSceneName(requested);

  const created={scene:false,inputs:[],slotScenes:[],items:[],backgroundItem:null,backgroundInput:null,foregroundItem:null,foregroundInput:null,screenItem:null};
  try{
   await this.p.req('CreateScene',{sceneName:name});created.scene=true;

   // 1) Faixa 01: Telão Multimídia (Z = 0, no fundo de tudo)
   if(screen){
    const item=await this.p.req('CreateSceneItem',{sceneName:name,sourceName:screen.name,sceneItemEnabled:true});
    if(screen.bounds){
     const video=await this.p.req('GetVideoSettings');
     const W=video.baseWidth||1920,H=video.baseHeight||1080;
     const b=screen.bounds;
     const px=b.x<=1?Math.round(b.x*W):Math.round(b.x);
     const py=b.y<=1?Math.round(b.y*H):Math.round(b.y);
     const pw=b.largura<=1?Math.round(b.largura*W):(b.largura||b.w||W);
     const ph=b.altura<=1?Math.round(b.altura*H):(b.altura||b.h||H);
     await this.p.req('SetSceneItemTransform',{sceneName:name,sceneItemId:item.sceneItemId,sceneItemTransform:{
      positionX:px,positionY:py,alignment:5,rotation:0,cropLeft:0,cropRight:0,cropTop:0,cropBottom:0,
      boundsType:'OBS_BOUNDS_STRETCH',boundsAlignment:5,boundsWidth:pw,boundsHeight:ph}});
    } else {
     await this.fit(name,item.sceneItemId);
    }
    created.screenItem=item.sceneItemId;
   }

   // 2) Faixa 02: Cenário de Fundo (Z = 1, com recorte alfa do telão)
   const bg=await this.createBackground(name,background);
   created.backgroundItem=bg.itemId;
   created.backgroundInput=bg.inputName;

   // 3) Faixa 03: Câmeras nos slots (Z = 2, apresentador com chroma key)
   const wrappers=[];
   for(const camera of cameras){
    const wrapperName=SLOT_PREFIX+randomUUID();
    await this.p.req('CreateScene',{sceneName:wrapperName});
    created.slotScenes.push(wrapperName);
    const camItem=await this.p.req('CreateSceneItem',{sceneName:wrapperName,sourceName:camera.name,sceneItemEnabled:true});
    await this.fitInner(wrapperName,camItem.sceneItemId).catch(()=>{});
    const wrapper=await this.resolve(wrapperName);
    const filtered=await this.applyFilter(wrapper.uuid,camera.quad,true,true);
    const item=await this.p.req('CreateSceneItem',{sceneName:name,sourceName:wrapperName,sceneItemEnabled:true});
    await this.fit(name,item.sceneItemId);
    wrappers.push({label:camera.label,inputKey:camera.key,inputName:camera.name,wrapperKey:wrapper.uuid,wrapperName,itemId:item.sceneItemId,quad:filtered.quad,baseQuad:filtered.quad,enabled:true,antialias:filtered.antialias});
   }

   // 4) Faixa 04: Frente / Bancada (Z = 3, mesa de primeiro plano com alfa cobrindo a base)
   if(foreground){
    if(foreground.type==='image'){
     const fgInputName='3Mix Bancada '+randomUUID();
     await this.p.req('CreateInput',{sceneName:name,inputName:fgInputName,inputKind:'image_source',inputSettings:{file:foreground.file,unload:false},sceneItemEnabled:true});
     const items=(await this.p.req('GetSceneItemList',{sceneName:name})).sceneItems||[];
     const item=items.find(i=>i.sourceName===fgInputName);
     if(!item)fail('O motor não criou o primeiro plano da bancada');
     await this.fit(name,item.sceneItemId);
     created.foregroundItem=item.sceneItemId;
     created.foregroundInput=fgInputName;
     foreground.name=fgInputName;
    } else {
     const item=await this.p.req('CreateSceneItem',{sceneName:name,sourceName:foreground.name,sceneItemEnabled:true});
     await this.fit(name,item.sceneItemId);
     created.foregroundItem=item.sceneItemId;
    }
   }

   // 5) Ordem canônica das camadas (baixo para cima):
   // Faixa 01 (Telão Z=0) -> Faixa 02 (Fundo Z=1) -> Faixa 03 (Câmeras Z=2) -> Faixa 04 (Bancada Z=3)
   const order=[];
   if(created.screenItem)order.push(created.screenItem);
   order.push(bg.itemId);
   order.push(...wrappers.map(w=>w.itemId));
   if(created.foregroundItem)order.push(created.foregroundItem);
   for(const [index,itemId] of order.entries())await this.p.req('SetSceneItemIndex',{sceneName:name,sceneItemId:itemId,sceneItemIndex:index});

   const scene=await this.resolve(name);
   const record={id:scene.uuid,name,presetId:preset.id,presetName:preset.name,screen,background,backgroundInput:bg.inputName,
    foreground,foregroundInput:created.foregroundInput||null,slots:wrappers,createdAt:Date.now(),revision:1};
   if(Object.keys(this.sets).length>=SET_LIMIT&&!this.sets[scene.uuid])fail('Limite de '+SET_LIMIT+' cenários salvos neste projeto; remova um antes de criar outro');
   this.sets[scene.uuid]=record;
   await this.save();
   this.last={set:record};
   return this.withProbe(record);
  }catch(e){
   // Reverte na ordem inversa; o que já não existir, ignora.
   for(const sceneName of created.slotScenes.slice().reverse())await this.p.optional('RemoveScene',{sceneName});
   if(created.foregroundInput)await this.p.optional('RemoveInput',{inputName:created.foregroundInput});
   if(created.backgroundInput)await this.p.optional('RemoveInput',{inputName:created.backgroundInput});
   if(created.scene)await this.p.optional('RemoveScene',{sceneName:name});
   throw e;
  }
 }

 // Alterar um cenário existente. Só mexe no que foi pedido; câmera trocada ganha cena privada
 // nova e a antiga é removida no fim, para o filtro nunca ficar apontando para fonte errada.
 async update(d){
  const key=d.key,record=this.sets[key];
  if(!record)fail('Este cenário não foi montado pelo 3Mix Estúdio');
  const live=(await this.p.req('GetSceneList')).scenes||[];
  if(!live.some(s=>s.sceneUuid===key))fail('O cenário não existe mais no motor');
  const slots=Array.isArray(d.slots)&&d.slots.length?d.slots:record.slots;
  if(slots.length!==record.slots.length)fail('A quantidade de câmeras do cenário não pode mudar; crie outro cenário');
  const stale=[],replaced=[];
  try{
   for(const [n,slot] of slots.entries()){
    const current=record.slots[n];
    const wanted=slot.key?await this.resolve(slot.key):{uuid:current.inputKey,name:current.inputName};
    const quadValue=studioQuad(slot.quad||current.quad);
    if(wanted.uuid!==current.inputKey){
     if(wanted.name.startsWith(SLOT_PREFIX))fail('Cenas privadas de slot não podem ser usadas como câmera');
     const wrapperName=SLOT_PREFIX+randomUUID();
     await this.p.req('CreateScene',{sceneName:wrapperName});
     replaced.push(wrapperName);
     await this.p.req('CreateSceneItem',{sceneName:wrapperName,sourceName:wanted.name,sceneItemEnabled:true});
     const wrapper=await this.resolve(wrapperName);
     await this.applyFilter(wrapper.uuid,quadValue,true,true);
     const index=await this.indexOf(record.name,current.itemId);
     const createdItem=await this.p.req('CreateSceneItem',{sceneName:record.name,sourceName:wrapperName,sceneItemEnabled:true});
     await this.fit(record.name,createdItem.sceneItemId);
     await this.p.req('SetSceneItemIndex',{sceneName:record.name,sceneItemId:createdItem.sceneItemId,sceneItemIndex:index});
     await this.p.optional('RemoveSceneItem',{sceneName:record.name,sceneItemId:current.itemId});
     record.slots[n]={...current,inputKey:wanted.uuid,inputName:wanted.name,wrapperKey:wrapper.uuid,wrapperName,itemId:createdItem.sceneItemId,quad:quadValue};
     stale.push(current.wrapperName||current.wrapperKey);
    }else{
     const filtered=await this.applyFilter(current.wrapperKey,quadValue,slot.enabled!==false,slot.antialias!==false);
     record.slots[n]={...current,quad:filtered.quad,enabled:filtered.enabled,antialias:filtered.antialias};
    }
   }
   if(d.background)record.background=await this.replaceBackground(record,backgroundSpec(d.background));
   record.revision=(record.revision||1)+1;
   await this.save();
   for(const sceneName of stale)await this.p.optional('RemoveScene',{sceneName});
   this.last={set:record};
   return this.withProbe(record);
  }catch(e){
   for(const sceneName of replaced)await this.p.optional('RemoveScene',{sceneName});
   throw e;
  }
 }
 // Troca o fundo sem deixar o cenário sem fundo: cria o novo, coloca no índice 0, só então
 // remove o antigo. Se a criação falhar, o fundo original continua no lugar.
 async replaceBackground(record,spec){
  const created=await this.createBackground(record.name,spec);
  await this.p.req('SetSceneItemIndex',{sceneName:record.name,sceneItemId:created.itemId,sceneItemIndex:0});
  if(record.backgroundItem)await this.p.optional('RemoveSceneItem',{sceneName:record.name,sceneItemId:record.backgroundItem});
  if(record.backgroundInput)await this.p.optional('RemoveInput',{inputName:record.backgroundInput});
  record.backgroundItem=created.itemId;
  record.backgroundInput=created.inputName;
  return spec;
 }

 // Remove o cenário e as cenas privadas dele. O que não existir mais é ignorado, para a limpeza
 // funcionar mesmo depois de o operador ter apagado partes à mão.
 async destroy(d){
  const key=d.key,record=this.sets[key];
  if(!record)fail('Este cenário não foi montado pelo 3Mix Estúdio');
  await this.p.optional('RemoveScene',{sceneName:record.name});
  for(const slot of record.slots)await this.p.optional('RemoveScene',{sceneName:slot.wrapperName||slot.wrapperKey});
  if(record.backgroundInput)await this.p.optional('RemoveInput',{inputName:record.backgroundInput});
  if(record.foregroundInput)await this.p.optional('RemoveInput',{inputName:record.foregroundInput});
  delete this.sets[key];
  await this.save();
  this.last={removed:key};
  return {removed:true,key};
 }

 // ------------------------------------------------------------------------------------------
 // Diagnóstico
 // ------------------------------------------------------------------------------------------

 async shot(uuid,wanted=960){
  const video=await this.p.req('GetVideoSettings');
  const scale=Math.min(1,wanted/Math.max(video.baseWidth||1920,video.baseHeight||1080));
  const width=Math.max(64,Math.round((video.baseWidth||1920)*scale)),height=Math.max(36,Math.round((video.baseHeight||1080)*scale));
  let lastError;
  for(const imageFormat of ['bmp','png']){
   try{
    const shot=await this.p.req('GetSourceScreenshot',{sourceUuid:uuid,imageFormat,imageWidth:width,imageHeight:height});
    const data=String(shot.imageData||''),comma=data.indexOf(',');
    if(!data.startsWith('data:image/')||comma<0)fail('O motor devolveu uma imagem em formato inesperado');
    const buffer=Buffer.from(data.slice(comma+1),'base64');
    return {buffer,contentType:'image/'+imageFormat,image:imageFormat==='bmp'?decodeBmp(buffer):decodePng(buffer),imageFormat};
   }catch(e){lastError=e;}
  }
  fail('Não foi possível ler o quadro: '+(lastError?.message||'erro desconhecido'));
 }

 // Prova de que o cenário desenha as câmeras, e não só o fundo: conta cores distintas e a
 // fração de pixels diferentes da cor de fundo. É medição de pixel, não confiança no comando.
 // Uma cena recém-criada pode entregar o primeiro quadro só com o fundo, enquanto o compositor
 // do motor não montou as camadas; por isso a leitura insiste por alguns quadros antes de concluir.
 async probeSet(key,record){
  let result=null;
  for(let attempt=0;attempt<8;attempt++){
   result=await this.measureSet(key,record);
   if(result.enoughContent)return result;
   if(attempt<7)await new Promise(resolve=>setTimeout(resolve,150));
  }
  return result;
 }
 async measureSet(key,record){
  const shot=await this.shot(key);
  const image=shot.image,data=image.data,width=image.width;
  const reference=record?.background?.type==='color'?hexRgb(record.background.color):null;
  const quads=(record?.slots||[]).map(slot=>QUAD_KEYS.map(k=>slot.quad[k]));
  const colors=new Set();
  let nonBackground=0,sampled=0,insideSamples=0,insideNonBg=0,outsideSamples=0,outsideBg=0;
  for(let p=0;p+3<data.length;p+=28){
   const r=data[p],g=data[p+1],b=data[p+2];
   sampled++;
   colors.add(((r>>3)<<10)|((g>>3)<<5)|(b>>3));
   const different=!!reference&&Math.abs(r-reference.r)+Math.abs(g-reference.g)+Math.abs(b-reference.b)>24;
   if(different)nonBackground++;
   if(!reference)continue;
   // Confinamento: pixel dentro de algum enquadramento precisa mostrar câmera; pixel fora precisa
   // mostrar o fundo. É isso que prova que o encaixe recortou a câmera no quadrilátero em vez de
   // esticá-la pelo quadro inteiro.
   const index=p/4,px=index%width,py=Math.floor(index/width);
   const inside=quads.some(quad=>pointInQuad((px+.5)/width,(py+.5)/image.height,quad));
   if(inside){insideSamples++;if(different)insideNonBg++;}
   else{outsideSamples++;if(!different)outsideBg++;}
  }
  const pct=sampled?Math.round(nonBackground/sampled*1000)/10:0;
  const alpha=alphaStats(image);
  const fillPct=insideSamples?Math.round(insideNonBg/insideSamples*1000)/10:null;
  const clippingPct=outsideSamples?Math.round(outsideBg/outsideSamples*1000)/10:null;
  const confined=(fillPct===null||fillPct>=50)&&(clippingPct===null||clippingPct>=90);
  return {
   key,name:record?.name||null,width:image.width,height:image.height,imageFormat:shot.imageFormat,
   distinctColors:colors.size,nonBackgroundPct:pct,
   quadCoverage:{insidePct:sampled?Math.round(insideSamples/sampled*1000)/10:0,fillPct,clippingPct,confined},
   alpha:{transparent:alpha.transparent,partial:alpha.partial},
   enoughContent:reference?pct>=2:colors.size>=40,
   note:!reference
    ?'Fundo por fonte: a leitura mede variedade de cor, não cobertura.'
    :confined
     ?'A câmera aparece dentro do enquadramento e o fundo aparece fora dele: o encaixe recortou de verdade.'
     :'Nem tudo bateu: confira se a câmera tem sinal e se o enquadramento está dentro do quadro.'
  };
 }
 async probeFilter(uuid){
  const filter=await this.filterOf(uuid);
  if(!filter)fail('Aplique o 3Mix Estúdio antes de conferir o encaixe');
  const shot=await this.shot(uuid);
  const alpha=alphaStats(shot.image);
  return {key:uuid,enabled:filter.filterEnabled,quad:quadFromSettings(filter.filterSettings),imageFormat:shot.imageFormat,
   alpha:{transparent:alpha.transparent,partial:alpha.partial,opaque:alpha.opaque,total:alpha.total},
   alphaPreserved:alpha.transparent+alpha.partial>0,
   note:alpha.transparent+alpha.partial>0
    ?'O encaixe recortou a área fora dos cantos, como esperado.'
    :'O motor entrega a captura de uma cena já composta, sem canal alfa. O recorte é comprovado no cenário montado, medindo o fundo fora do enquadramento.'};
 }
 // Prova de montagem: relê o filtro de cada cena privada e o quadro final. Não basta o comando
 // ter voltado sem erro — o cenário só está pronto quando o motor mostra o encaixe gravado.
 async withProbe(record){
  const probe=await this.probeSet(record.id,record).catch(e=>({error:e.message}));
  const slots=[];
  for(const slot of record.slots){
   const filter=await this.filterOf(slot.wrapperKey).catch(()=>null);
   slots.push({label:slot.label,inputKey:slot.inputKey,inputName:slot.inputName,quad:slot.quad,
    wrapperKey:slot.wrapperKey,wrapperName:slot.wrapperName,
    applied:!!filter,kind:filter?.filterKind||null,enabled:filter?.filterEnabled||false,
    quadRead:filter?.filterSettings?this.safeQuad(filter.filterSettings):null,
    error:filter?.filterSettings?.last_error||null});
  }
  return {...record,slots,probe};
 }

 // ------------------------------------------------------------------------------------------
 // Resumo e comandos
 // ------------------------------------------------------------------------------------------

 async summary(key){
  const supported=await this.support();
  const targets=this.targets().map(x=>({key:x.key,name:x.name,kind:x.kind||''}));
  const sets=Object.values(this.sets).map(record=>({id:record.id,name:record.name,presetId:record.presetId,presetName:record.presetName,
   slots:record.slots.map(s=>({label:s.label,inputKey:s.inputKey,inputName:s.inputName,quad:s.quad,enabled:s.enabled!==false})),
   background:record.background,foreground:record.foreground||null,screen:record.screen||null,revision:record.revision||1}));
  const catalogData=await loadVirtualSetsCatalog(this.p.root).catch(()=>({packs:[],dir:null}));
  let details=null;
  if(key&&targets.some(x=>x.key===key)){
   // A fonte pode ter sido removida entre a leitura da lista e esta consulta; o resumo responde
   // com "ausente" em vez de estourar a rota inteira.
   try{
    const filter=await this.filterOf(key);
    details={key,exists:!!filter,enabled:filter?.filterEnabled||false,
     quad:filter?.filterSettings&&!filter.filterSettings.last_error?this.safeQuad(filter.filterSettings):null,
     antialias:filter?.filterSettings?.Antialias_Edges!==false,
     shader:filter?.filterSettings?.shader_file_name||null,
     error:filter?.filterSettings?.last_error||null};
   }catch(e){details={key,exists:false,missing:true,error:e.message};}
  }
  return {
   supported,filterName:STUDIO_FILTER,kind:STUDIO_KIND,shader:STUDIO_SHADER,
   presets:this.presetsAll(),zoomPresets:STUDIO_ZOOM_PRESETS,targets,sets,details,scope:this.scope,
   packs:catalogData.packs||[],packsDir:catalogData.dir||null,
   limits:{presets:PRESET_LIMIT,sets:SET_LIMIT},
   limitations:[
    'Cenários 2D/2.5D: planos 2D posicionados em perspectiva; não é motor de malhas 3D nem tem paralaxe verdadeira.',
    'O encaixe usa corner-pin.shader já instalado com o Shaderfilter; nenhum plugin novo é exigido.',
    'Cada câmera entra por uma cena privada para o filtro não afetar a fonte compartilhada.',
    'Custo de GPU: uma passagem de shader por câmera, na resolução do quadro.',
    'Fundo por entrada ou cor; primeiro plano por entrada com alfa (mesa, objeto, moldura).'
   ]
  };
 }
 async zoomSet(d){
  const key=d.key;
  let record=this.sets[key] || Object.values(this.sets).find(s=>s.id===key || s.name===key || s.name===d.scene || s.name===d.v);
  if(!record)fail('Este cenário não foi montado pelo 3Mix Estúdio');
  let zoom=Number(d.zoom)||1.0;
  let panX=Number(d.panX)||0.0;
  let panY=Number(d.panY)||0.0;
  if(d.presetId){
   const p=STUDIO_ZOOM_PRESETS.find(x=>x.id===d.presetId);
   if(p){zoom=p.zoom;panX=p.panX;panY=p.panY;}
  }

  // 1) Restaura os slots (câmeras) para o enquadramento de perspectiva original
  for(const slot of record.slots){
   const targetQuad=slot.baseQuad||slot.quad;
   if(targetQuad){
    await this.applyFilter(slot.wrapperKey,targetQuad,slot.enabled!==false,slot.antialias!==false).catch(()=>{});
    slot.quad=targetQuad;
   }
  }

  // 2) Obtém todos os itens da cena do cenário virtual
  const items=(await this.p.req('GetSceneItemList',{sceneName:record.name})).sceneItems||[];
  const video=await this.p.req('GetVideoSettings');
  const W=video.baseWidth||1920,H=video.baseHeight||1080;

  const sb=record.screen?.bounds;
  const screenName=record.screen?.name;

  // 3) Interpolação suave de Travelling Broadcast (dolly zoom cinematográfico)
  const zoomStart=record.currentZoom?.zoom||1.0;
  const panXStart=record.currentZoom?.panX||0.0;
  const panYStart=record.currentZoom?.panY||0.0;
  const zoomEnd=zoom,panXEnd=panX,panYEnd=panY;
  const duration=Math.min(5000,Math.max(0,Number(d.duration)||0));
  const steps=duration<=50?1:Math.max(1,Math.round(duration/33));
  const interval=steps>1?duration/steps:0;

  for(let s=1;s<=steps;s++){
   const progress=s/steps;
   const ease=0.5-0.5*Math.cos(Math.PI*progress);
   const curZ=zoomStart+(zoomEnd-zoomStart)*ease;
   const curPX=panXStart+(panXEnd-panXStart)*ease;
   const curPY=panYStart+(panYEnd-panYStart)*ease;
   const curCX=W*(0.5+curPX);
   const curCY=H*(0.5+curPY);

   for(const item of items){
    const isScreen=screenName&&item.sourceName===screenName;
    const origX=isScreen&&sb?(sb.x<=1?Math.round(sb.x*W):sb.x):0;
    const origY=isScreen&&sb?(sb.y<=1?Math.round(sb.y*H):sb.y):0;
    const origW=isScreen&&sb?(sb.largura<=1?Math.round(sb.largura*W):(sb.largura||W)):W;
    const origH=isScreen&&sb?(sb.altura<=1?Math.round(sb.altura*H):(sb.altura||H)):H;

    const newW=Math.round(origW*curZ);
    const newH=Math.round(origH*curZ);
    const newX=Math.round((origX-curCX)*curZ + W/2);
    const newY=Math.round((origY-curCY)*curZ + H/2);

    await this.p.req('SetSceneItemTransform',{
     sceneName:record.name,
     sceneItemId:item.sceneItemId,
     sceneItemTransform:{
      boundsType:'OBS_BOUNDS_STRETCH',
      boundsAlignment:5,
      boundsWidth:newW,
      boundsHeight:newH,
      positionX:newX,
      positionY:newY,
      alignment:5
     }
    }).catch(()=>{});
   }
   if(s<steps&&interval>0)await new Promise(r=>setTimeout(r,interval));
  }

  record.currentZoom={zoom,panX,panY,presetId:d.presetId||null};
  await this.save();
  this.last={set:record,zoom:{zoom,panX,panY}};
  return {key,name:record.name,zoom,panX,panY,presetId:d.presetId||null,slots:record.slots};
 }
 safeQuad(settings){try{return quadFromSettings(settings);}catch{return null;}}

 async execute(action,d={}){
  if(action==='studio_read')return this.summary(d.key);
  if(action==='studio_packs')return loadVirtualSetsCatalog(this.p.root);
  if(action==='studio_preset_save')return this.savePreset(d);
  if(action==='studio_preset_remove')return this.removePreset(d);
  if(action==='studio_set_remove')return this.destroy(d);
  if(action==='studio_probe')return d.setKey?this.probeSetByKey(d.setKey):this.probeFilter(await this.frameTarget(d.key));
  if(!await this.support())fail('Este motor não tem Shaderfilter com corner-pin.shader; o estúdio virtual não pode ser montado');
  if(action==='studio_apply'){
   const target=await this.resolve(d.key);
   const quadValue=studioQuad(d.quad);
   const filtered=await this.applyFilter(target.uuid,quadValue,d.enabled!==false,d.antialias!==false);
   this.last={filter:filtered};
   return {key:target.uuid,name:target.name,enabled:filtered.enabled,quad:filtered.quad,antialias:filtered.antialias};
  }
  if(action==='studio_remove'){const target=await this.resolve(d.key);return {key:target.uuid,name:target.name,...await this.removeFilter(target.uuid)};}
  if(action==='studio_set_create')return this.build(d);
  if(action==='studio_set_update')return this.update(d);
  if(action==='studio_zoom')return this.zoomSet(d);
  if(action==='studio_build')return this.build(d);
  if(action==='studio_save')return this.savePreset(d);
  fail('Ação de estúdio virtual inválida');
 }
 async probeSetByKey(key){
  const record=this.sets[key];
  if(!record)fail('Este cenário não foi montado pelo 3Mix Estúdio');
  return this.probeSet(key,record);
 }
 // Um cenário é lido pela cena; uma câmera, pela fonte. A prévia aceita as duas.
 async frameTarget(key){
  if(this.sets[key])return key;
  return (await this.resolve(key)).uuid;
 }
 async savePreset(d){
  const name=String(d.name||'').trim();
  if(!name||name.length>60||/[\x00-\x1f]/.test(name))fail('Nome de cenário inválido');
  if(!Array.isArray(d.slots)||!d.slots.length)fail('Informe os slots do cenário');
  if(d.slots.length>8)fail('Um cenário comporta no máximo 8 câmeras');
  const slots=d.slots.map((slot,n)=>({label:String(slot.label||String.fromCharCode(65+n)).slice(0,2),quad:studioQuad(slot.quad)}));
  if(d.presetId&&BUILTIN_IDS.has(d.presetId))fail('Cenários de fábrica não podem ser alterados; salve uma cópia');
  const current=d.presetId?this.presets.find(x=>x.id===d.presetId):null;
  if(current){current.name=name;current.slots=slots;current.description=String(d.description||current.description||'').slice(0,240);}
  else{
   if(this.presets.length>=PRESET_LIMIT)fail(`Limite de ${PRESET_LIMIT} cenários salvos por projeto`);
   this.presets.push({id:randomUUID(),name,description:String(d.description||'').slice(0,240),slots,createdAt:Date.now()});
  }
  await this.save();
  return {preset:current||this.presets.at(-1),total:this.presets.length};
 }
 async removePreset(d){
  const id=String(d.presetId||'');
  if(BUILTIN_IDS.has(id))fail('Cenários de fábrica não podem ser removidos');
  const before=this.presets.length;
  this.presets=this.presets.filter(x=>x.id!==id);
  if(this.presets.length===before)fail('Cenário não encontrado');
  await this.save();
  return {removed:id};
 }
}
