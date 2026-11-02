'use strict';
const E=document.getElementById.bind(document),escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state={},fingerprint='',history=[];const counts={'2box':2,'3box':3,'4box':4,pip:2,slides:2,vertical2box:2,verticalpip:2};
const command=async(action,data)=>{try{E('status').textContent='Aplicando…';const result=await window.FreeMixRemote.command(action,data);E('status').textContent='Motor confirmou';fingerprint='';return result;}catch(e){E('status').textContent=e.message;throw e;}};
const options=selected=>(state.inputs||[]).map(i=>'<option value="'+escapeHtml(i.key)+'"'+(i.key===selected?' selected':'')+'>'+escapeHtml(i.name)+'</option>').join('');
function createSlots(){const old=[...E('new-slots').querySelectorAll('select')].map(s=>s.value);E('new-slots').innerHTML=Array.from({length:counts[E('layout').value]},(_,n)=>'<label>Slot '+String.fromCharCode(65+n)+'<select>'+options(old[n]||state.inputs?.[n]?.key)+'</select></label>').join('');}
const selected=()=>state.inputs?.find(i=>i.key===E('composition').value);
function draw(){const i=selected(),comp=i?.composition,W=state.video?.baseWidth||1920,H=state.video?.baseHeight||1080;if(!comp){E('slots').textContent='Nenhuma composição criada.';E('canvas').innerHTML='';return;}
 E('canvas').setAttribute('viewBox','0 0 '+W+' '+H);E('canvas').style.background=comp.color;E('canvas').innerHTML=comp.slots.map(s=>{const r=s.rect||s.defaultRect;return'<rect x="'+r[0]*W+'" y="'+r[1]*H+'" width="'+r[2]*W+'" height="'+r[3]*H+'"/><text x="'+(r[0]*W+12)+'" y="'+(r[1]*H+45)+'">'+escapeHtml(s.label+' · '+(state.inputs.find(x=>x.key===s.inputKey)?.name||'Ausente'))+'</text>';}).join('');
 E('slots').innerHTML=comp.slots.map(s=>{const r=s.rect||s.defaultRect;return'<div class="slot" data-slot="'+escapeHtml(s.id)+'"><label>Slot '+s.label+'<select data-source>'+options(s.inputKey)+'</select></label><label>Enquadramento<select data-mode><option value="fit"'+(s.mode==='fit'?' selected':'')+'>Caber inteiro</option><option value="fill"'+(s.mode==='fill'?' selected':'')+'>Preencher / recortar</option></select></label><div class="coords">'+['Esquerda %','Topo %','Largura %','Altura %'].map((l,n)=>'<label>'+l+'<input data-coordinate="'+n+'" type="number" min="0" max="100" step="0.1" value="'+(r[n]*100).toFixed(1)+'"></label>').join('')+'</div><button data-position>Aplicar posição</button></div>';}).join('');if(document.activeElement!==E('tags'))E('tags').value=(i.tags||[]).join(', ');
}
function refresh(next,targetKey){
 if(!next?.connected)return;
 state=next;fingerprint=JSON.stringify([next.inputs?.map(i=>[i.key,i.name,i.composition,i.tags]),next.video,next.compositionTemplates]);
 const old=targetKey||E('composition').value||new URLSearchParams(location.search).get('input');
 E('composition').innerHTML=state.inputs.filter(i=>i.composition).map(i=>'<option value="'+escapeHtml(i.key)+'">'+escapeHtml(i.name)+'</option>').join('');
 const target=state.inputs.find(i=>i.key===old||i.name===old);
 if(target?.composition)E('composition').value=target.key;
 createSlots();draw();
}
function nextName(name){
 const names=new Set((state.inputs||[]).map(i=>i.name));
 const base=name.replace(/\s+\d+$/,'').trim()||'Composição';
 let n=2,candidate=base+' '+n;
 while(names.has(candidate))candidate=base+' '+(++n);
 return candidate;
}
setInterval(()=>{const next=window.FreeMixRemote?.getState();if(!next?.connected||E('slots').contains(document.activeElement)||document.activeElement?.tagName==='SELECT')return;const value=JSON.stringify([next.inputs?.map(i=>[i.key,i.name,i.composition,i.tags]),next.video,next.compositionTemplates]);if(value!==fingerprint)refresh(next);},500);
E('layout').onchange=createSlots;E('composition').onchange=()=>{history=[];draw();};
E('create').onsubmit=async e=>{
 e.preventDefault();const button=E('create').querySelector('[type="submit"]');if(button.disabled)return;
 const name=E('name').value.trim();button.disabled=true;E('create-status').textContent='Criando…';
 try{
  const result=await command('input_create',{name,template:E('composition-template')?.value||undefined,layout:E('layout').value,color:E('color').value,background:typeof backgroundData==='function'?backgroundData('new-bg'):undefined,slots:[...E('new-slots').querySelectorAll('select')].map(s=>s.value)});
  const next=result.state||window.FreeMixRemote.getState(),created=next.inputs?.find(i=>i.name===name&&i.composition);
  if(!created)throw Error('Entrada criada; aguarde a atualização do motor para editar.');
  history=[];refresh(next,created.key);E('name').value=nextName(name);
  E('create-status').textContent='“'+name+'” criada e aberta no editor ao lado.';
 }catch(error){E('create-status').textContent=error.message;}
 finally{button.disabled=false;}
};
E('slots').onchange=e=>{if(!e.target.matches('[data-source],[data-mode]'))return;const row=e.target.closest('[data-slot]');command('input_slot',{input:selected().key,slot:row.dataset.slot,source:row.querySelector('[data-source]').value,mode:row.querySelector('[data-mode]').value}).catch(()=>{});};
E('slots').onclick=e=>{if(!e.target.matches('[data-position]'))return;const row=e.target.closest('[data-slot]'),slot=selected().composition.slots.find(s=>s.id===row.dataset.slot);history.push({input:selected().key,slots:[{id:slot.id,rect:slot.rect||slot.defaultRect}]});command('input_geometry',{input:selected().key,slots:[{id:slot.id,rect:[...row.querySelectorAll('[data-coordinate]')].map(e=>Number(e.value)/100)}]}).catch(()=>{});};
E('preview').onclick=()=>command('preview',{input:selected()?.key}).catch(()=>{});E('undo').onclick=()=>{const old=history.pop();if(old)command('input_geometry',old).catch(()=>{});};E('save-tags').onclick=()=>command('input_tags',{input:selected()?.key,tags:E('tags').value.split(',').map(t=>t.trim()).filter(Boolean)}).catch(()=>{});

const presetLayout=new URLSearchParams(location.search).get("layout");if(presetLayout&&counts[presetLayout]){E("layout").value=presetLayout;E("name").value=presetLayout.startsWith("vertical")?"Vertical":"Entrevista";}
