import {stripInputs,stripMix,changeDelegate} from './switcher-strip-model.js';
// Host injects its existing guarded operation path. No direct fetch or MAIN bypass.
export class SwitcherStrip extends HTMLElement {
 constructor(){super();this.surface={mixId:1,page:0,size:8,category:''};this.snapshot={inputs:[],mixes:[]};this.attachShadow({mode:'open'});}
 connectedCallback(){this.render();}
 update(snapshot){this.snapshot=snapshot;this.render();}
 render(){
  const root=this.shadowRoot;root.replaceChildren();
  const style=document.createElement('style');style.textContent=`:host{display:block;background:#202124;color:#eee;font:12px "Segoe UI",sans-serif;border:1px solid #45474b;padding:8px}header,nav,.bank{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px}button,select{background:#34363a;color:inherit;border:1px solid #585a60;padding:7px;min-height:32px}button[data-pgm]{border-color:#e25757}button[data-pvw]{border-color:#54b98b}.status{min-height:24px}`;root.append(style);
  const header=document.createElement('header'),label=document.createElement('label');label.textContent='Delegate ';
  const select=document.createElement('select');select.setAttribute('aria-label','Delegate M/E');
  for(const id of [1,2,3,4]){const option=new Option('M/E '+id+(id===1?' MAIN':''),String(id));select.add(option);}select.value=String(this.surface.mixId);
  select.onchange=()=>{this.surface=changeDelegate(this.surface,Number(select.value));this.render();};label.append(select);
  // Bank por categoria: opções vêm das tags realmente presentes nos Inputs deste snapshot (até 12 por Input,
  // já existentes no acervo — não inventa uma lista própria de categorias). Trocar a categoria reseta a página
  // para 0: um Bank filtrado tem sua própria contagem de páginas, continuar na página N da lista anterior não
  // faz sentido.
  const categories=[...new Set(this.snapshot.inputs.flatMap(i=>i.tags||[]))].sort();
  if(categories.length){
   const catLabel=document.createElement('label');catLabel.textContent='Categoria ';
   const catSelect=document.createElement('select');catSelect.setAttribute('aria-label','Categoria do Bank');
   catSelect.add(new Option('Todas','',true));
   for(const tag of categories)catSelect.add(new Option(tag,tag));
   catSelect.value=this.surface.category||'';
   catSelect.onchange=()=>{this.surface={...this.surface,category:catSelect.value,page:0};this.render();};
   catLabel.append(catSelect);header.append(catLabel);
  }
  header.append(label);
  // Audio Bus padrão do M/E: só faz sentido para M/E 2-4 (MAIN usa o caminho de áudio existente da mesa, não
  // este mecanismo). Lista de opções vem do snapshot (mixAudio.availableBuses(), já validado contra o motor
  // real); aplicar passa pelo mesmo host.executeAudioBus que o resto da Strip usa para operações reais.
  if(this.surface.mixId!==1&&this.snapshot.audioBuses){
   const busLabel=document.createElement('label');busLabel.textContent='Áudio ';
   const busSelect=document.createElement('select');busSelect.setAttribute('aria-label','Audio Bus padrão do M/E');
   busSelect.add(new Option('Master (padrão)',''));
   for(const key of this.snapshot.audioBuses.available||[])busSelect.add(new Option(key==='busA'?'Bus A':key==='busB'?'Bus B':key==='master'?'Master':key,key));
   busSelect.value=this.snapshot.audioBuses.defaults?.[this.surface.mixId]||'';
   busSelect.disabled=!this.executeAudioBus||this.busBusy;
   busSelect.onchange=async()=>{
    if(!this.executeAudioBus)return;
    this.busBusy=true;this.render();
    try{await this.executeAudioBus({mixId:this.surface.mixId,bus:busSelect.value||null});}
    catch(error){this.error=error.message;}
    finally{this.busBusy=false;this.render();}
   };
   busLabel.append(busSelect);header.append(busLabel);
  }
  root.append(header);
  const status=document.createElement('div');status.className='status';status.setAttribute('role','status');
  const mix=stripMix(this.snapshot,this.surface.mixId),name=uuid=>this.snapshot.inputs.find(i=>i.key===uuid)?.name||uuid||'—';
  status.textContent=mix?'PVW: '+name(mix.previewUuid)+' · PGM: '+name(mix.programUuid)+(mix.transitioning?' · TRANSIÇÃO':''):'Estado do M/E indisponível';root.append(status);
  const nav=document.createElement('nav');
  const addButton=(parent,text,handler,disabled=false)=>{const button=document.createElement('button');button.type='button';button.textContent=text;button.disabled=disabled;button.onclick=handler;parent.append(button);return button;};
  addButton(nav,'Banco anterior',()=>{this.surface.page--;this.render();},this.surface.page===0);
  addButton(nav,'Banco '+(this.surface.page+1)+' →',()=>{this.surface.page++;this.render();},(this.surface.page+1)*this.surface.size>=this.snapshot.inputs.length);root.append(nav);
  const bank=document.createElement('div');bank.className='bank';
  // Tally recursivo (M/E 2-4 só, nunca MAIN -- regra já aplicada no backend): um Input
  // dentro de uma Composition que está no ar deste M/E também conta como "no ar", não só
  // o que estiver DIRETO em programUuid/previewUuid. meTally[mixId] vem de /api/signals
  // (ver switcher-strip-host.js); ausente em runtimes sem essa rota -- nesse caso cai de
  // volta para a comparação direta apenas, sem quebrar o resto da Strip.
  const tally=this.surface.mixId!==1?this.snapshot.meTally?.[this.surface.mixId]:null;
  for(const input of stripInputs(this.snapshot.inputs,this.surface)){
   const button=addButton(bank,String(input.number||'')+' '+input.name,()=>this.perform('preview',input.key),!mix||this.busy||!this.executeOperation);
   const onProgram=input.key===mix?.programUuid||!!tally?.program?.includes(input.name);
   const onPreview=input.key===mix?.previewUuid||!!tally?.preview?.includes(input.name);
   if(onProgram)button.dataset.pgm='';if(onPreview)button.dataset.pvw='';
  }root.append(bank);
  const actions=document.createElement('nav');for(const [command,text] of [['cut','CUT'],['take','AUTO']])addButton(actions,text,()=>this.perform(command),!mix||this.busy||!this.executeOperation);root.append(actions);
  if(this.error){const warning=document.createElement('div');warning.setAttribute('role','alert');warning.textContent=this.error;root.append(warning);}
 }
 async perform(command,input){
  if(this.busy||!this.executeOperation)return;
  this.busy=true;this.error='';this.render();
  try{await this.executeOperation({command,input,mixId:this.surface.mixId});}
  catch(error){this.error=error.message;}
  finally{this.busy=false;this.render();}
 }
}
if(!customElements.get('three-mix-switcher-strip'))customElements.define('three-mix-switcher-strip',SwitcherStrip);
