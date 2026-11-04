(()=>{
 const el=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let selected='',revision='',mappingDirty=false;
 const sources=()=>window.FreeMixRemote?.getState().dataSources||[],current=()=>sources().find(s=>s.id===(el('data-source').value||selected));
 async function command(action,data={}){try{const result=await window.FreeMixRemote.command(action,data);render(true);return result;}catch{}}
 const options=()=>({name:el('data-name').value,scope:el('data-scope').value,format:el('data-format').value,delimiter:el('data-delimiter').value,sheet:el('data-sheet').value,jsonPath:el('data-path').value,intervalSeconds:Number(el('data-interval').value)});
 function render(force=false){const list=sources(),fingerprint=JSON.stringify([list,window.FreeMixRemote?.getState().sourceInputs,window.FreeMixRemote?.getState().inputs?.map(i=>[i.key,i.name])]);if(!force&&(fingerprint===revision||mappingDirty))return;if(document.activeElement?.dataset.cell)return;revision=fingerprint;
  const id=el('data-source').value||selected;el('data-source').innerHTML=list.map(s=>`<option value="${s.id}">${esc(s.name)} (${s.rowCount} linhas)</option>`).join('');if(list.some(s=>s.id===id))el('data-source').value=id;selected=el('data-source').value;
  const s=current();if(!s){el('data-status').textContent='Nenhuma tabela importada.';return;}el('data-status').textContent=s.error?'Erro: '+s.error:`${s.source} · atualizado ${new Date(s.updatedAt).toLocaleTimeString('pt-BR')}`;
  if(document.activeElement!==el('data-row'))el('data-row').value=s.selected+1;el('data-row').max=s.rowCount;el('data-preview').textContent=JSON.stringify(s.preview,null,2);
  const columns=Object.keys(s.rows[0]||{});el('data-table').innerHTML='<table><thead><tr><th>Linha</th>'+columns.map(c=>`<th>${esc(c)}</th>`).join('')+'</tr></thead><tbody>'+s.rows.map((r,i)=>`<tr><td>${i+1}</td>${columns.map(c=>`<td>${s.type==='manual'?`<input data-cell="${i}" data-column="${esc(c)}" value="${esc(r[c])}">`:esc(r[c])}</td>`).join('')}</tr>`).join('')+'</tbody></table>';
  if(!mappingDirty){el('data-kind').value=s.binding?.kind||'lower';el('data-auto').checked=!!s.binding?.autoPublish;renderMapping(s.binding?.mapping||{});}
 }
 // Formatação por campo (vMix 30 §5.10): só para kind!=='score' (o Placar usa número puro,
 // ver fontes-dados.mjs bind()). Compacta de propósito -- locale fixo em pt-BR (igual ao
 // resto do painel, nenhum seletor de idioma em nenhuma outra tela) e só os parâmetros do
 // tipo escolhido aparecem, pra não empilhar campos vazios na maioria dos vínculos (que
 // continuam sem formato nenhum, como sempre foram).
 const FORMAT_OPTIONS=[['text','Texto'],['number','Número'],['milliseconds','Milissegundos'],['date','Data'],['time','Hora'],['datetime','Data e hora']];
 function formatExtrasHtml(f,spec){
  const type=spec?.type||'text';
  if(type==='number')return '<label class="fmt-extra">Decimais<input type="number" min="0" max="6" step="1" data-format-param="decimals" data-format-field="'+esc(f)+'" value="'+(Number.isInteger(spec?.decimals)?spec.decimals:0)+'" style="width:44px"></label>';
  if(type==='milliseconds')return '<select data-format-param="style" data-format-field="'+esc(f)+'">'+[['mm:ss','mm:ss'],['hh:mm:ss','hh:mm:ss'],['mm:ss.mmm','mm:ss,mmm'],['seconds','segundos']].map(([v,l])=>'<option value="'+v+'"'+((spec?.style||'mm:ss')===v?' selected':'')+'>'+l+'</option>').join('')+'</select>';
  if(['date','time','datetime'].includes(type)){
   const offset='<label class="fmt-extra" title="Diferença de horas (outro fuso)">Fuso<input type="number" min="-12" max="14" step="1" data-format-param="offset" data-format-field="'+esc(f)+'" value="'+(Number.isFinite(spec?.offset)?spec.offset:0)+'" style="width:44px"></label>';
   const ampm=type!=='date'?'<label class="fmt-extra chk"><input type="checkbox" data-format-param="ampm" data-format-field="'+esc(f)+'"'+(spec?.ampm?' checked':'')+'> 12h</label>':'';
   return offset+ampm;
  }
  return '';
 }
 function renderMapping(mapping={}){
 const columns=Object.keys(current()?.rows[0]||{}),kind=el('data-kind').value,fields=kind==='score'?['teamHome','teamAway','scoreHome','scoreAway','minutes','period']:kind==='person'?['title','subtitle','color','input','call']:kind==='lower'?['title','subtitle','color']:kind==='text'?['text']:kind==='inputName'?['name']:null;
 const labels={input:'Entrada (nome ou UUID)',call:'Call (nome, ID ou UUID)',title:'Nome',subtitle:'Cargo',color:'Cor',teamHome:'Casa',teamAway:'Visitante',scoreHome:'Pontos casa',scoreAway:'Pontos visitante',minutes:'Minutos',period:'Período',text:'Texto',name:'Nome da entrada'};
 // Formatação só para campo com nome FIXO (fields!==null): 'score' fica fora porque usa
 // número puro (ver fontes-dados.mjs bind()); 'browser'/'variables' (campo de template
 // livre, nome digitado pelo operador em data-field-name) ficam fora porque o controle de
 // formato referencia o campo pelo nome no momento do render -- renomear um campo livre
 // depois de formatá-lo deixaria o formato "órfão" e bind() recusaria salvar (ver o erro
 // "Formato para campo sem vínculo" em fontes-dados.mjs). Caso de uso real do vMix 30
 // §5.10 (lower/person/text/inputName) não é afetado por essa restrição.
 const existingFormat=current()?.binding?.format||{},allowFormat=!!fields&&kind!=='score';
 el('data-add-mapping').hidden=!!fields;
 el('data-mapping').innerHTML=(fields||Object.keys(mapping).length&&Object.keys(mapping)||['nome']).map(f=>{
  const spec=existingFormat[f];
  const formatBit=allowFormat?'<select data-format-type data-format-field="'+esc(f)+'" title="Formato de exibição">'+FORMAT_OPTIONS.map(([v,l])=>'<option value="'+v+'"'+((spec?.type||'text')===v?' selected':'')+'>'+l+'</option>').join('')+'</select><span data-format-extras="'+esc(f)+'" style="display:inline-flex;gap:4px;align-items:center">'+formatExtrasHtml(f,spec)+'</span>':'';
  return '<label>'+(fields?labels[f]:'<input data-field-name value="'+esc(f)+'" placeholder="Campo do template">')+'<select data-mapping-select data-field="'+esc(f)+'"><option value="">Sem vínculo</option>'+columns.map(c=>'<option '+(mapping[f]===c?'selected':'')+' value="'+esc(c)+'">'+esc(c)+'</option>').join('')+'</select>'+formatBit+'</label>';
 }).join('');
 for(const sel of el('data-mapping').querySelectorAll('[data-format-type]'))sel.onchange=()=>{mappingDirty=true;const extras=el('data-mapping').querySelector('[data-format-extras="'+sel.dataset.formatField+'"]');if(extras)extras.innerHTML=formatExtrasHtml(sel.dataset.formatField,{type:sel.value});};
 const state=window.FreeMixRemote?.getState()||{},needs=['text','browser','inputName'].includes(kind);el('data-target-label').hidden=!needs;
 const inputs=kind==='inputName'?state.inputs||[]:(state.sourceInputs||[]).filter(s=>kind==='text'?/^text_(gdiplus|ft2)/.test(s.kind):s.kind==='browser_source');
 el('data-target').innerHTML='<option value="">Selecione</option>'+inputs.map(s=>'<option value="'+esc(s.key||s.inputUuid||s.sceneUuid||s.id)+'">'+esc(s.name||s.inputName||s.sceneName)+'</option>').join('');el('data-target').value=current()?.binding?.target||'';
 }
 // Lê de volta o formato de cada campo a partir dos controles desenhados por formatExtrasHtml.
 // Campo com tipo "text" (o padrão) não entra no objeto format -- mapped() então devolve o
 // texto cru, exatamente como um campo que nunca teve formatação configurada.
 function readFormat(){
  const result={};
  for(const sel of el('data-mapping').querySelectorAll('[data-format-type]')){
   const field=sel.dataset.formatField,type=sel.value;if(type==='text')continue;
   const param=name=>el('data-mapping').querySelector('[data-format-field="'+field+'"][data-format-param="'+name+'"]');
   const spec={type};
   if(type==='number'){const d=param('decimals');if(d)spec.decimals=Number(d.value);}
   else if(type==='milliseconds'){const st=param('style');if(st)spec.style=st.value;}
   else if(['date','time','datetime'].includes(type)){const off=param('offset');if(off)spec.offset=Number(off.value);const am=param('ampm');if(am)spec.ampm=am.checked;}
   result[field]=spec;
  }
  return Object.keys(result).length?result:undefined;
 }
 el('data-import').onclick=()=>command('data_import',{...options(),text:el('data-text').value});
 el('data-upload').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>5*1024*1024){el('message').textContent='Arquivo maior que 5 MB';return;}el('data-format').value=file.name.split('.').at(-1).toLowerCase();const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));await command('data_import',{...options(),base64:btoa(binary)});e.target.value='';};
 el('data-http').onclick=()=>command('data_http',{...options(),url:el('data-url').value});el('data-file').onclick=()=>command('data_file',{...options(),path:el('data-local').value});
 el('data-source').onchange=()=>{mappingDirty=false;render(true);};el('data-kind').onchange=()=>{mappingDirty=true;renderMapping();};el('data-mapping').onchange=()=>mappingDirty=true;el('data-auto').onchange=()=>mappingDirty=true;
 for(const [id,delta]of [['data-previous',-1],['data-next',1]])el(id).onclick=()=>{const s=current();if(s)command('data_select',{id:s.id,index:s.selected+delta});};el('data-select').onclick=()=>{const s=current();if(s)command('data_select',{id:s.id,index:Number(el('data-row').value)-1});};el('data-refresh').onclick=()=>{const s=current();if(s)command('data_refresh',{id:s.id});};
 el('data-table').onchange=e=>{const t=e.target,s=current();if(t.dataset.cell!==undefined&&s)command('data_edit',{id:s.id,row:Number(t.dataset.cell),column:t.dataset.column,value:t.value});};
 el('data-bind').onclick=async()=>{const s=current();if(!s)return;const mapping=Object.fromEntries([...el('data-mapping').querySelectorAll('[data-mapping-select]')].filter(e=>e.value).map(e=>[e.parentElement.querySelector('[data-field-name]')?.value||e.dataset.field,e.value]));const format=readFormat();const r=await command('data_bind',{id:s.id,kind:el('data-kind').value,mapping,...(format?{format}:{}),target:el('data-target').value,autoPublish:el('data-auto').checked});if(r){mappingDirty=false;render(true);}};
 for(const [id,on]of [['data-publish',undefined],['data-on',true]])el(id).onclick=()=>{const s=current();if(s)command('data_publish',{id:s.id,on});};
 el('data-people').onclick=async()=>{mappingDirty=false;const before=new Set(sources().map(s=>s.id));await command('data_import',{name:el('data-name').value==='Tabela'?'Pessoas':el('data-name').value,scope:el('data-scope').value,format:'csv',text:'nome,cargo,input,call\nNovo convidado,,,'});selected=sources().find(s=>!before.has(s.id))?.id||selected;el('data-source').value=selected;render(true);};
 el('data-add-row').onclick=()=>{const s=current();if(s)command('data_append',{id:s.id,values:Object.fromEntries(Object.keys(s.rows[0]||{nome:''}).map(k=>[k,'']))});};
 el('data-delete-row').onclick=()=>{const s=current();if(s&&confirm('Excluir esta linha?'))command('data_remove_row',{id:s.id,row:s.selected});};
 el('data-delete').onclick=()=>{const s=current();if(s&&confirm('Excluir a tabela '+s.name+'?'))command('data_remove',{id:s.id});};
 el('data-move').onclick=()=>{const s=current();if(s)command('data_scope',{id:s.id,scope:s.scope==='global'?'project':'global'});};
 el('data-add-mapping').onclick=()=>{mappingDirty=true;const label=document.createElement('label');label.innerHTML='<input data-field-name placeholder="Campo"><select data-mapping-select><option value="">Sem vínculo</option>'+Object.keys(current()?.rows[0]||{}).map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join('')+'</select>';el('data-mapping').append(label);};
 el('data-target').onchange=()=>mappingDirty=true;el('data-mapping').oninput=()=>mappingDirty=true;
 setInterval(render,500);
})();
