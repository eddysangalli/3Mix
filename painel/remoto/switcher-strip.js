import {stripInputs,stripMix,changeDelegate} from './switcher-strip-model.js?v=20261102';
// Host injects its existing guarded operation path. No direct fetch or MAIN bypass.
const CSS=`:host{display:block;background:#252525;color:#e6e6e6;font:12px "Segoe UI",sans-serif;border:1px solid #414141;border-radius:4px;padding:8px;min-width:0}
header{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px}
h3{margin:0 auto 0 0;font-size:13px;font-weight:700}
label{display:inline-flex;gap:4px;align-items:center;color:#a9a9a9;font-size:11px}
select{background:#202020;color:#e6e6e6;border:1px solid #414141;border-radius:3px;height:24px;font:inherit;font-size:11px;max-width:120px}
.monitors{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:6px}
figure{margin:0;min-width:0}
.frame{position:relative;aspect-ratio:16/9;background:#000;border:2px solid #414141;overflow:hidden}
.pv .frame{border-color:#49d54d}.pgm .frame{border-color:#ff3038}
.frame img{display:block;width:100%;height:100%;object-fit:contain}
figcaption{display:flex;gap:4px;font-size:11px;padding-top:2px;white-space:nowrap;overflow:hidden}
figcaption b{font-weight:700}.pv b{color:#65df69}.pgm b{color:#ff5a60}
figcaption span{overflow:hidden;text-overflow:ellipsis}
.bus{display:grid;grid-template-columns:30px 1fr;gap:4px;align-items:center;margin-bottom:4px}
.bus>span{font-size:10px;font-weight:700;color:#a9a9a9}
.bank{display:grid;grid-template-columns:repeat(auto-fill,minmax(66px,1fr));gap:3px}
button{background:#303030;color:#e6e6e6;border:1px solid #414141;border-radius:3px;min-height:26px;padding:2px 5px;font:inherit;font-size:11px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
button:hover:not(:disabled){border-color:#2f6fed}
button:disabled{opacity:.45;cursor:default}
button[data-pgm]{background:#b80e18;border-color:#ff3038;color:#fff}
button[data-pvw]{background:#155b21;border-color:#49d54d;color:#fff}
nav{display:flex;gap:4px;margin:4px 0}
nav.actions button{flex:1;min-height:32px;font-weight:700}
.status{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
[role=alert]{color:#ff7a80;font-size:11px;margin-top:4px}`;
export class SwitcherStrip extends HTMLElement {
 constructor(){super();this.surface={mixId:1,page:0,size:16,category:''};this.snapshot={inputs:[],mixes:[]};this.attachShadow({mode:'open'});this.frames={pv:new Image(),pgm:new Image()};this.frames.pv.alt='';this.frames.pgm.alt='';}
 connectedCallback(){this.render();}
 // Polled once a second: rebuild only when something shown changed, so an open list stays open and images do not blink.
 update(snapshot){
  this.snapshot=snapshot;
  const signature=JSON.stringify([snapshot.inputs?.map(i=>[i.key,i.name,i.number,i.tags]),snapshot.mixes,snapshot.audioBuses,snapshot.meTally,this.surface]);
  if(signature===this.signature)return;
  if(this.shadowRoot.activeElement?.tagName==='SELECT')return;
  this.render();
 }
 refreshFrames(){
  if(!this.frameUrl||!this.isConnected)return;
  const mix=stripMix(this.snapshot,this.surface.mixId);
  for(const [side,key] of [['pv',mix?.previewUuid],['pgm',mix?.programUuid]]){
   const frame=this.frames[side];
   if(!key){frame.removeAttribute('src');continue;}
   const next=new Image();next.onload=()=>{frame.src=next.src;};next.src=this.frameUrl(key);
  }
 }
 render(){
  this.signature=JSON.stringify([this.snapshot.inputs?.map(i=>[i.key,i.name,i.number,i.tags]),this.snapshot.mixes,this.snapshot.audioBuses,this.snapshot.meTally,this.surface]);
  const root=this.shadowRoot;root.replaceChildren();
  const style=document.createElement('style');style.textContent=CSS;root.append(style);
  const header=document.createElement('header');
  const title=document.createElement('h3');title.textContent='M/E '+this.surface.mixId+(this.surface.mixId===1?' MAIN':'');header.append(title);
  const label=document.createElement('label');label.textContent='Delegate ';
  const select=document.createElement('select');select.setAttribute('aria-label','Delegate M/E');
  for(const id of [1,2,3,4]){const option=new Option('M/E '+id+(id===1?' MAIN':''),String(id));select.add(option);}select.value=String(this.surface.mixId);
  select.onchange=()=>{this.surface=changeDelegate(this.surface,Number(select.value));select.blur();this.render();this.refreshFrames();};label.append(select);
  // Bank por categoria: as opções vêm das tags realmente presentes nos Inputs. Trocar a categoria volta à página 0.
  const categories=[...new Set(this.snapshot.inputs.flatMap(i=>i.tags||[]))].sort();
  if(categories.length){
   const catLabel=document.createElement('label');catLabel.textContent='Categoria ';
   const catSelect=document.createElement('select');catSelect.setAttribute('aria-label','Categoria do Bank');
   catSelect.add(new Option('Todas','',true));
   for(const tag of categories)catSelect.add(new Option(tag,tag));
   catSelect.value=this.surface.category||'';
   catSelect.onchange=()=>{this.surface={...this.surface,category:catSelect.value,page:0};catSelect.blur();this.render();};
   catLabel.append(catSelect);header.append(catLabel);
  }
  header.append(label);
  // Audio Bus padrão: só M/E 2-4; o MAIN usa o caminho de áudio da mesa.
  if(this.surface.mixId!==1&&this.snapshot.audioBuses){
   const busLabel=document.createElement('label');busLabel.textContent='Áudio ';
   const busSelect=document.createElement('select');busSelect.setAttribute('aria-label','Audio Bus padrão do M/E');
   busSelect.add(new Option('Master (padrão)',''));
   for(const key of this.snapshot.audioBuses.available||[])busSelect.add(new Option(key==='busA'?'Bus A':key==='busB'?'Bus B':key==='master'?'Master':key,key));
   busSelect.value=this.snapshot.audioBuses.defaults?.[this.surface.mixId]||'';
   busSelect.disabled=!this.executeAudioBus||this.busBusy;
   busSelect.onchange=async()=>{
    if(!this.executeAudioBus)return;
    this.busBusy=true;busSelect.blur();this.render();
    try{await this.executeAudioBus({mixId:this.surface.mixId,bus:busSelect.value||null});}
    catch(error){this.error=error.message;}
    finally{this.busBusy=false;this.render();}
   };
   busLabel.append(busSelect);header.append(busLabel);
  }
  root.append(header);
  const mix=stripMix(this.snapshot,this.surface.mixId),name=uuid=>this.snapshot.inputs.find(i=>i.key===uuid)?.name||'—';
  const monitors=document.createElement('div');monitors.className='monitors';
  for(const [side,text,uuid] of [['pv','PV',mix?.previewUuid],['pgm','PGM',mix?.programUuid]]){
   const figure=document.createElement('figure');figure.className=side;
   const frame=document.createElement('div');frame.className='frame';frame.append(this.frames[side]);
   const caption=document.createElement('figcaption');const tag=document.createElement('b');tag.textContent=text;const who=document.createElement('span');who.textContent=name(uuid);caption.append(tag,who);
   figure.append(frame,caption);monitors.append(figure);
  }
  root.append(monitors);
  const status=document.createElement('div');status.className='status';status.setAttribute('role','status');
  status.textContent=mix?'PVW: '+name(mix.previewUuid)+' · PGM: '+name(mix.programUuid)+(mix.transitioning?' · TRANSIÇÃO':''):'Estado do M/E indisponível';root.append(status);
  const addButton=(parent,text,handler,disabled=false)=>{const button=document.createElement('button');button.type='button';button.textContent=text;button.title=text;button.disabled=disabled;button.onclick=handler;parent.append(button);return button;};
  // Tally recursivo (só M/E 2-4): uma entrada dentro de uma composição no ar também conta como no ar.
  const tally=this.surface.mixId!==1?this.snapshot.meTally?.[this.surface.mixId]:null;
  const rows=stripInputs(this.snapshot.inputs,this.surface),off=!mix||this.busy||!this.executeOperation;
  for(const [side,text] of [['pgm','PGM'],['pv','PV']]){
   const bus=document.createElement('div');bus.className='bus';const tag=document.createElement('span');tag.textContent=text;
   const bank=document.createElement('div');bank.className='bank';
   for(const input of rows){
    const label=String(input.number||'')+' '+input.name;
    const button=addButton(bank,label,()=>side==='pv'?this.perform('preview',input.key):this.performProgram(input.key),off);
    if(side==='pgm'&&(input.key===mix?.programUuid||tally?.program?.includes(input.name)))button.dataset.pgm='';
    if(side==='pv'&&(input.key===mix?.previewUuid||tally?.preview?.includes(input.name)))button.dataset.pvw='';
   }
   bus.append(tag,bank);root.append(bus);
  }
  const total=(this.surface.category?this.snapshot.inputs.filter(i=>i.tags?.includes(this.surface.category)):this.snapshot.inputs).length;
  if(total>this.surface.size){
   const nav=document.createElement('nav');
   addButton(nav,'Banco anterior',()=>{this.surface.page--;this.render();},this.surface.page===0);
   addButton(nav,'Banco '+(this.surface.page+1)+' →',()=>{this.surface.page++;this.render();},(this.surface.page+1)*this.surface.size>=total);root.append(nav);
  }
  const actions=document.createElement('nav');actions.className='actions';for(const [command,text] of [['cut','CUT'],['take','AUTO']])addButton(actions,text,()=>this.perform(command),off);root.append(actions);
  if(this.error){const warning=document.createElement('div');warning.setAttribute('role','alert');warning.textContent=this.error;root.append(warning);}
 }
 async perform(command,input){
  if(this.busy||!this.executeOperation)return;
  this.busy=true;this.error='';this.render();
  try{await this.executeOperation({command,input,mixId:this.surface.mixId});}
  catch(error){this.error=error.message;}
  finally{this.busy=false;this.render();this.refreshFrames();}
 }
 // Botão do barramento PGM: corte direto. No MAIN é o corte com entrada; nos outros, prepara no PV e corta, com confirmação em cada passo.
 async performProgram(input){
  if(this.busy||!this.executeOperation)return;
  this.busy=true;this.error='';this.render();
  const mixId=this.surface.mixId;
  try{
   if(mixId===1)await this.executeOperation({command:'cut',input,mixId});
   else{await this.executeOperation({command:'preview',input,mixId});await this.executeOperation({command:'cut',mixId});}
  }catch(error){this.error=error.message;}
  finally{this.busy=false;this.render();this.refreshFrames();}
 }
}
if(!customElements.get('three-mix-switcher-strip'))customElements.define('three-mix-switcher-strip',SwitcherStrip);
