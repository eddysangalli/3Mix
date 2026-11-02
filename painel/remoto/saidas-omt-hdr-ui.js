// Dedicated opaque HDR sender; SDR alpha controls above remain independent.
(() => {
 const panel=E('network-panel');if(!panel)return;
 panel.insertAdjacentHTML('beforeend',`<details id="omt-hdr-panel" hidden><summary>OMT HDR · receptor configurado manualmente</summary>
 <p>Envio HDR separado, sem alpha. A lista mostra fontes que o motor reconhece como HDR, preservando a precisão original. Cenas na mesa SDR não preservam HDR; use diretamente a fonte HDR. O receptor OMT precisa ter a mesma transferência selecionada. PA16 SDR e os envios de alpha acima continuam independentes.</p>
 <label>Envio HDR para editar<select id="omt-hdr-sender"><option value="0">HDR 1</option><option value="1">HDR 2</option><option value="2">HDR 3</option><option value="3">HDR 4</option></select></label>
 <label>Nome deste envio HDR<input id="omt-hdr-name" maxlength="120" value="3Mix OMT HDR"></label>
 <label>Fonte HDR própria<select id="omt-hdr-source"></select></label>
 <label>Transferência<select id="omt-hdr-transfer"><option value="pq">PQ · BT.2100 / BT.2020</option><option value="hlg">HLG · BT.2100 / BT.2020</option></select></label>
 <label>Áudio<select id="omt-hdr-audio"></select></label>
 <label class="check"><input id="omt-hdr-confirm" type="checkbox">Configurei no receptor OMT a mesma transferência PQ/HLG escolhida acima.</label>
 <div class="row"><button id="omt-hdr-preflight">Verificar fonte e contrato</button><button id="omt-hdr-configure">Salvar HDR</button><button id="omt-hdr-start">Ligar HDR</button><button id="omt-hdr-stop">Parar HDR</button></div>
 <p id="omt-hdr-status" role="status">Consultando suporte…</p><p>Configuração salva no perfil, sem início automático. O motor recusa SDR, alpha HDR e troca de configuração durante o envio. Os testes locais medem valores e áudio; recepção física e interpretação no seu receptor continuam necessárias.</p></details>`);
 let dirty=false,signature='',message='',senderId=0;
 E('omt-hdr-sender').addEventListener('change',()=>{if(dirty){E('omt-hdr-sender').value=String(senderId);message='Salve as alterações antes de trocar o envio HDR';}else{senderId=Number(E('omt-hdr-sender').value);signature='';message='';}paint();});
 const ids=['omt-hdr-name','omt-hdr-source','omt-hdr-transfer','omt-hdr-audio','omt-hdr-confirm'];
 for(const id of ids)E(id).addEventListener('change',()=>{dirty=true;message='Alterações ainda não salvas';paint();});
 E('omt-hdr-name').addEventListener('input',()=>{dirty=true;});
 function choices(id,items){const field=E(id),old=field.value,sig=JSON.stringify(items);if(field.dataset.signature===sig)return;field.dataset.signature=sig;field.innerHTML=items.map(([value,name])=>'<option value="'+esc(value)+'">'+esc(name)+'</option>').join('');if(items.some(([value])=>value===old))field.value=old;}
 function select(id,value){const field=E(id);if(value&&!Array.from(field.options).some(o=>o.value===value))field.add(new Option('Salvo indisponível · '+value,value));field.value=value;}
 function paint(){
  const area=E('omt-hdr-panel');area.hidden=E('network-heading').textContent.indexOf('OMT')<0;
  const state=outputs?.omtHdrSenders?.[senderId]||(senderId===0?outputs?.omtHdr:{} )||{},sources=state.hdrSources||[];
  choices('omt-hdr-source',sources.length?sources.map(s=>[s.uuid,s.name+' · '+s.width+'×'+s.height]):[['','Nenhuma fonte HDR reconhecida; adicione um vídeo PQ/HLG']]);choices('omt-hdr-audio',[['0','Master'],['1','Bus A'],['2','Bus B'],...(outputs?.audioSources||[]).map(s=>['bus:'+s.uuid,'Bus independente · '+s.name])]);
  const config=state.config||{},sig=JSON.stringify(config);
  if(!dirty&&sig!==signature){signature=sig;E('omt-hdr-name').value=config.name||'3Mix OMT HDR '+(senderId+1);if(config.sourceUuid)select('omt-hdr-source',config.sourceUuid);E('omt-hdr-transfer').value=config.transfer||'pq';select('omt-hdr-audio',config.audioSourceUuid?'bus:'+config.audioSourceUuid:String(config.audioTrack||0));E('omt-hdr-confirm').checked=config.manualReceiverConfirmed===true;}
  for(const id of ids)E(id).disabled=!!state.active;
  E('omt-hdr-start').disabled=!state.available||state.active||dirty||!config.sourceUuid;
  E('omt-hdr-stop').disabled=!state.active;
  for(const action of ['configure','preflight'])E('omt-hdr-'+action).disabled=!state.available||state.active||!E('omt-hdr-source').value;
  E('omt-hdr-status').textContent=message||(!state.available?'Motor ainda não oferece o caminho HDR OMT manual':state.active?'HDR ENVIANDO · '+config.transfer.toUpperCase()+' · '+(state.capturedFrames||0)+' quadros · P216 opaco · receptor manual':config.sourceUuid?'HDR parado · configuração salva · '+config.transfer.toUpperCase():'HDR parado · selecione fonte e confirme a transferência no receptor');
 }
 async function action(command){
  const transfer=E('omt-hdr-transfer').value,audio=E('omt-hdr-audio').value;
  try{await cmd('outputs_omt_hdr',{command,senderId,name:E('omt-hdr-name').value,sourceUuid:E('omt-hdr-source').value,transfer,receiverTransfer:transfer,manualReceiverConfirmed:E('omt-hdr-confirm').checked,audioTrack:audio.startsWith('bus:')?0:Number(audio),audioSourceUuid:audio.startsWith('bus:')?audio.slice(4):''});
   if(command==='configure'){dirty=false;signature='';}message=command==='preflight'?'Fonte HDR e contrato manual confirmados; nenhuma saída iniciou.':command==='configure'?'HDR salvo. Clique Ligar HDR para transmitir.':command==='start'?'Motor confirmou HDR ligado.':'HDR parado.';
  }catch(error){message=error.message;}paint();
 }
 for(const command of ['preflight','configure','start','stop'])E('omt-hdr-'+command).onclick=()=>action(command);
 const previous=paintStatus;paintStatus=function(){previous();paint();};
 for(const button of document.querySelectorAll('[data-panel]'))button.addEventListener('click',paint);
 paint();
})();
