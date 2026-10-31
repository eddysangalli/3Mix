/* Bind the operational Replay view to the existing, confirmed replay controller. */
(() => {
  let connected=false,selectedEvent=null,frameBusy=false,disposed=false,frameGeneration=0;
  let selectedAngle=null,quadPage=0,quadGeneration=0,quadAbort=null,quadTimer=null;
  let historySpeed=1,lastHistorySession=null,detailsSignature='',pathMode=null,pathTarget=null;
  const frameUrls=new Map(),playerSignatures={A:'',B:''};
  const el=id=>document.getElementById(id);
  const clock=()=>{const node=el('clock-txt');if(node)node.textContent=new Date().toLocaleString('pt-BR');};clock();
  const clockTimer=setInterval(clock,1000);
  const setMessage=text=>{const node=el('message');if(node)node.textContent=text;};
  const fileBase=file=>String(file||'').split(/[\\/]/).pop()||'arquivo ausente';
  const windowClock=seconds=>{const total=Math.max(0,Math.round(Number(seconds)||0)),h=Math.floor(total/3600),m=Math.floor(total%3600/60),s=total%60;return (h?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');};

  /* The tape is a visual layer over the same #history-seek input. It never
     starts a preview or changes a mark by itself. */
  function paintHistoryTape(){
    const start=Number(historyState?.start),end=Number(historyState?.end);
    const has=Number.isFinite(start)&&Number.isFinite(end)&&end>start;
    const percent=value=>has?Math.max(0,Math.min(100,((Number(value)-start)/(end-start))*100)):0;
    const mark=(id,value,label)=>{
      const node=el(id);if(!node)return;
      if(value==null||!has){node.hidden=true;return;}
      node.hidden=false;node.style.left=percent(value)+'%';
      const tag=node.querySelector('span');if(tag)tag.textContent=label;
    };
    mark('history-in-mark',historyIn,'IN');
    mark('history-out-mark',historyOut,'OUT');
    const band=el('history-range-band');
    if(band){
      const valid=historyIn!=null&&historyOut!=null&&historyOut>historyIn&&has;
      band.hidden=!valid;
      if(valid){
        band.style.left=percent(historyIn)+'%';
        band.style.width=Math.max(0,percent(historyOut)-percent(historyIn))+'%';
      }
    }
    const head=el('history-playhead'),slider=el('history-seek');
    if(head){
      head.hidden=!has||!slider||slider.disabled;
      if(!head.hidden)head.style.left=percent(Number(slider.value)||0)+'%';
    }
    const duration=el('history-duration');
    if(duration)duration.textContent=!has?'—':historyIn!=null&&historyOut!=null?`IN/OUT ${(historyOut-historyIn).toFixed(2)} s`:`Janela ${windowClock(end-start)}`;
  }
  function paintSpeed(){
    const value=Number(replay?.speed??50);
    for(const id of ['deck-a-speed','deck-b-speed']){
      const node=el(id);if(node)node.textContent=value+'%';
    }
  }
  window.saveProjectNotice=()=>setMessage('Projeto atual confirmado. As alterações do Replay valem para esta produção.');
  const recNode=el('rec-status');
  if(recNode)new MutationObserver(()=>{
    const clean=recNode.textContent.replace(/^[●○]\s*/,'');
    if(clean!==recNode.textContent)recNode.textContent=clean;
  }).observe(recNode,{childList:true,characterData:true,subtree:true});

  /* ---------- state labels and controls ---------- */
  function setControls(){
    const offline=!connected||busy;
    for(const button of document.querySelectorAll('[data-rp-command]')){
      button.disabled=offline||(button.hasAttribute('data-rp-record')&&!replay?.rec)||button.hasAttribute('data-blocked');
    }
    for(const id of ['A','B']){
      const loaded=replay?.players?.[id],blocked=!loaded||loaded.available===false;
      for(const button of document.querySelectorAll(`[data-player="${id}"] [data-rp-command]`))if(blocked)button.disabled=true;
      const slider=el('seek-'+id);if(slider&&blocked)slider.disabled=true;
    }
    const loaded=replay?.players?.[deck];
    el('take-replay').disabled=offline||!loaded||loaded.available===false||replay?.program==='REPLAY '+deck;
    const onReplay=/^REPLAY [ABCD]$/.test(replay?.program||'');
    el('return-live').disabled=offline||!onReplay||!replay?.back||replay.backAvailable===false;
    // History controls have their own confirmation state; restore it after the
    // generic command pass.
    setHistoryButtons(historyConfirmed!==null);
    for(const id of ['history-prev-second','history-next-second','history-play','history-follow']){
      const button=el(id);if(button)button.disabled=offline||!historyState;
    }
    const refresh=el('history-refresh');if(refresh)refresh.disabled=offline;
    renderHistoryMarks();
    if(offline)for(const id of ['history-prev-second','history-next-second','history-play','history-follow','history-back-frame','history-next-frame','history-in','history-out','history-save','history-refresh']){
      const button=el(id);if(button)button.disabled=true;
    }
  }

  function transitionLabel(info){
    if(!info)return 'transição atual';
    const ms=Number(info.durationMs)||0;
    const duration=ms?(ms<1000?ms+' ms':(ms/1000).toFixed(1).replace('.',',')+' s'):'';
    return [info.name||'Corte',duration].filter(Boolean).join(' ');
  }

  function paintFooter(data=replay){
    if(!data)return;
    const loaded=data.players?.[deck],missing=loaded?.available===false;
    const programPlayer=/^REPLAY ([ABCD])$/.exec(data.program||'')?.[1]||null;
    const onAir=programPlayer===deck,onReplay=!!programPlayer;
    const take=el('take-replay');
    take.textContent=`Colocar Player ${deck} no ar`;
    take.title=onAir?`Player ${deck} já está no ar`:`Coloca o Player ${deck} no Programa retendo a fonte ao vivo anterior`;
    const state=el('deck-state');
    state.textContent=missing?'ARQUIVO AUSENTE':programPlayer?`NO AR · ${programPlayer}`:'AO VIVO';
    state.dataset.state=missing?'missing':onReplay?'onair':'live';
    state.classList.toggle('danger',missing||onReplay);
    const back=data.back,transition=transitionLabel(data.backTransition);
    const returnButton=el('return-live');
    returnButton.dataset.state=onReplay?'ready':'live';
    let sub;
    if(onReplay){
      if(!back)sub='Nenhuma fonte anterior registrada';
      else if(data.backAvailable===false)sub=`Fonte ${back} indisponível no motor`;
      else sub=`Retoma ${back} · ${transition}`;
    }else{
      sub=`Ao vivo em ${data.program||'—'}${back?` · retomada: ${back} · ${transition}`:''}`;
    }
    const main=document.createElement('span');
    main.textContent=onReplay?'Voltar ao vivo':'Ao vivo';
    const detail=document.createElement('small');
    detail.id='return-source';detail.textContent=sub;
    returnButton.replaceChildren(main,detail);
    returnButton.title=sub;
  }

  function clearPlayerFrame(id){
    const image=el('replay-frame-'+id);if(image){image.hidden=true;image.removeAttribute('src');}
    const old=frameUrls.get(id);if(old){URL.revokeObjectURL(old);frameUrls.delete(id);}
  }

  function paintPlayer(id,data){
    const loaded=data.players?.[id],event=data.events?.find(e=>e.id===loaded?.eventId);
    const deckEl=document.querySelector(`[data-player="${id}"]`),isProgram=data.program==='REPLAY '+id;
    const missing=!!loaded&&loaded.available===false;
    const text=el('player-'+id),badge=el('player-'+id.toLowerCase()+'-badge');
    const missingBox=el('missing-'+id),missingText=el('missing-'+id+'-text');
    const empty=el('replay-empty-'+id),image=el('replay-frame-'+id);
    deckEl.classList.toggle('missing',missing);
    deckEl.classList.toggle('live',isProgram);
    deckEl.classList.toggle('loaded',!!loaded&&!missing);
    if(!loaded){
      text.textContent='Nenhum lance carregado';
      text.title='Nenhum lance carregado';
      text.dataset.state='empty';text.style.color='';
      badge.textContent='VAZIO';badge.className='badge-loaded';badge.dataset.state='empty';badge.style.cssText='';
      missingBox.hidden=true;empty.hidden=false;empty.textContent='Carregue um lance no Player '+id;
      clearPlayerFrame(id);playerSignatures[id]='';
      return;
    }
    const name=event?.name||'Lance';
    if(missing){
      text.textContent=`${name} · ${loaded.cam}`;
      text.title=`${name} · ${loaded.cam} · ${loaded.file} (arquivo ausente)`;
      text.dataset.state='missing';text.style.color='';
      badge.textContent='ARQUIVO AUSENTE';badge.className='badge-loaded';badge.dataset.state='missing';badge.style.cssText='';
      missingBox.hidden=false;empty.hidden=true;
      missingText.textContent=`${name} · ${loaded.cam} aponta para ${loaded.file}. O player está bloqueado até o arquivo ser localizado.`;
      clearPlayerFrame(id);playerSignatures[id]='';
      return;
    }
    missingBox.hidden=true;
    text.textContent=`${name} · ${loaded.cam}`;
    text.title=`${name} · ${loaded.cam}${isProgram?' · no ar':''}`;
    text.dataset.state=isProgram?'onair':'loaded';text.style.color='';
    badge.textContent=isProgram?'NO AR':'PRONTO';badge.className='badge-loaded';badge.dataset.state=isProgram?'onair':'loaded';badge.style.cssText='';
    if(image.hidden){empty.hidden=false;empty.textContent='Preparando quadro do player…';}
    else empty.hidden=true;
  }

  /* ---------- history quad ---------- */
  function historyFps(){
    const parts=String(historyState?.frameRate||'').split('/').map(Number);
    return parts[0]>0&&parts[1]>0?parts[0]/parts[1]:30;
  }
  function timecode(seconds,fps=30){
    const safe=Math.max(0,Number(seconds)||0),whole=Math.floor(safe);
    const frames=Math.min(Math.max(0,Math.floor((safe-whole)*fps)),Math.max(0,Math.ceil(fps)-1));
    const pad=(value,size=2)=>String(Math.floor(value)).padStart(size,'0');
    return [pad(whole/3600),pad(whole%3600/60),pad(whole%60),pad(frames)].join(':');
  }
  function wallClock(seconds){
    const started=Number(replay?.session?.startedAt);
    if(!Number.isFinite(started)||!started)return '--:--:--';
    return new Date(started+Math.max(0,Number(seconds)||0)*1000).toLocaleTimeString('pt-BR');
  }
  function setQuadStatus(text){const node=el('quad-status');if(node)node.textContent=text;}
  function currentCursor(){return Number(el('history-seek').value)||0;}
  function paintHistoryLabels(){
    const cursor=currentCursor(),fps=historyFps(),tc=timecode(cursor,fps);
    if(el('history-timecode'))el('history-timecode').textContent=tc;
    if(el('quad-timecode'))el('quad-timecode').textContent=tc;
    if(el('history-now-label'))el('history-now-label').textContent=wallClock(cursor);
    if(historyState){
      if(el('history-start-label'))el('history-start-label').textContent=wallClock(historyState.start);
      if(el('history-end-label'))el('history-end-label').textContent=wallClock(historyState.end);
    }
    paintHistoryTape();
  }
  function pageCameras(){
    return (historyState?.cameras||[]).slice(quadPage*4,quadPage*4+4);
  }
  function ensureQuadTiles(){
    const cameras=historyState?.cameras||[],page=pageCameras();
    const tiles=[...document.querySelectorAll('#quad-grid .quad-tile')];
    tiles.forEach((tile,index)=>{
      const cam=page[index]||null;
      tile.dataset.cam=cam||'';
      tile.classList.toggle('empty',!cam);
      tile.classList.toggle('selected',!!cam&&cam===selectedAngle);
      const label=tile.querySelector('.quad-label');
      if(label)label.textContent=cam||'—';
      const flag=tile.querySelector('.quad-flag');
      if(flag){flag.hidden=!cam;flag.textContent=cam?'CAM '+(quadPage*4+index+1):'';}
      tile.title=cam||'';
      if(!cam){
        const image=tile.querySelector('img');if(image)image.hidden=true;
        const empty=tile.querySelector('.quad-empty');if(empty){empty.hidden=false;empty.textContent='Sem câmera';}
      }
    });
    const counter=el('quad-cameras');
    if(counter)counter.textContent=cameras.length?cameras.length+' CAM':'—';
    const prev=el('quad-prev'),next=el('quad-next');
    const many=cameras.length>4;
    prev.hidden=!many;next.hidden=!many;
    prev.disabled=quadPage===0;next.disabled=(quadPage+1)*4>=cameras.length;
    const angle=el('quad-angle');if(angle)angle.textContent='Ângulo: '+(selectedAngle||'—');
  }
  function renderQuadFrames(payload){
    const frames=payload?.frames||[];
    for(const tile of document.querySelectorAll('#quad-grid .quad-tile')){
      const cam=tile.dataset.cam,frame=frames.find(item=>item.cam===cam);
      const image=tile.querySelector('img'),empty=tile.querySelector('.quad-empty');
      if(!cam){if(image)image.hidden=true;if(empty){empty.hidden=false;empty.textContent='Sem câmera';}continue;}
      if(frame?.image){
        if(image){image.src=frame.image;image.hidden=false;}
        if(empty)empty.hidden=true;
      }else{
        if(image)image.hidden=true;
        if(empty){empty.hidden=false;empty.textContent=frame?.error||'Sem quadro neste ponto';}
      }
    }
  }
  function syncVideoTile(){
    const video=el('history-video');if(!video)return;
    const index=historyState?.cameras?.indexOf(selectedAngle)??-1;
    const slot=index>=0?index%4:0;
    video.style.gridColumn=String(slot%2+1);
    video.style.gridRow=String(Math.floor(slot/2)+1);
  }
  async function loadQuad(cursor,{quiet=false}={}){
    if(!historyState||disposed)return;
    const cams=pageCameras();
    if(!cams.length)return;
    const generation=++quadGeneration;
    quadAbort?.abort();quadAbort=new AbortController();
    if(!quiet)setQuadStatus('Lendo quatro ângulos em '+timecode(cursor)+'…');
    try{
      const result=await historyApi('history-quad',{sessionId:historyState.sessionId,cursor,cams},quadAbort.signal);
      if(generation!==quadGeneration||disposed)return;
      if(result.history)historyState=result.history;
      const payload=result.historyFrames;
      if(!payload)throw Error('O motor não devolveu os quadros do histórico');
      renderQuadFrames(payload);
      const slider=el('history-seek');
      slider.min=historyState.start;slider.max=historyState.end;
      slider.value=payload.cursor;
      el('history-cursor').value=payload.cursor.toFixed(3);
      const frames=payload.frames||[],selectedFrame=frames.find(item=>item.cam===selectedAngle);
      if(!selectedFrame?.image){
        historyConfirmed=null;
        setHistoryButtons(false);
        setQuadStatus(selectedFrame?.error||'Sem quadro do ângulo selecionado neste ponto');
        paintHistoryLabels();
        setControls();
        return;
      }
      historyConfirmed=payload.cursor;
      setHistoryButtons(true);
      paintHistoryLabels();
      const okCount=frames.filter(item=>item.image).length;
      setQuadStatus(`Quadro confirmado · ${okCount}/${frames.length} ângulos · ${wallClock(payload.cursor)} · ${payload.cursor.toFixed(3)} s`);
      if(el('history-status'))el('history-status').textContent=`Histórico disponível · ${historyState.cameras.length} câmera(s) · ${historyState.recording?'gravando':'gravação parada'}`;
      setControls();
    }catch(error){
      if(generation!==quadGeneration||error?.name==='AbortError')return;
      historyConfirmed=null;
      setHistoryButtons(false);
      setQuadStatus(error.message);
      if(el('history-status'))el('history-status').textContent=error.message;
    }finally{
      if(generation===quadGeneration)quadAbort=null;
    }
  }
  function selectHistoryAngle(cam){
    if(!historyState||!historyState.cameras.includes(cam))return;
    selectedAngle=cam;
    if(el('history-camera'))el('history-camera').value=cam;
    const index=historyState.cameras.indexOf(cam);
    quadPage=Math.floor(index/4);
    quadGeneration++;quadAbort?.abort();
    stopHistoryVideo();
    ensureQuadTiles();syncVideoTile();paintHistoryLabels();
    loadQuad(currentCursor(),{quiet:false});
  }
  function stepHistorySeconds(delta){
    if(!historyState||busy)return;
    const value=Math.min(historyState.end,Math.max(historyState.start,currentCursor()+Number(delta)));
    el('history-seek').value=value;
    el('history-cursor').value=value.toFixed(3);
    historyConfirmed=null;setHistoryButtons(false);
    paintHistoryLabels();
    stopHistoryVideo();
    loadQuad(value);
  }
  function setHistorySpeed(value){
    historySpeed=Number(value)||1;
    const video=el('history-video');
    if(video)video.playbackRate=historySpeed;
  }
  function historyCursorInput(){
    const value=currentCursor();
    el('history-cursor').value=value.toFixed(3);
    historyConfirmed=null;setHistoryButtons(false);
    paintHistoryLabels();
    quadGeneration++;quadAbort?.abort();quadAbort=null;
    clearTimeout(quadTimer);
    quadTimer=setTimeout(()=>loadQuad(value,{quiet:true}),240);
  }
  function historySeekCommitted(){
    clearTimeout(quadTimer);quadTimer=null;
    stopHistoryVideo();
    previewHistory();
  }

  /* ---------- saved events / details ---------- */
  function paintSelectedRow(){
    for(const row of document.querySelectorAll('#events-list [data-event]'))row.classList.toggle('selected',row.dataset.event===selectedEvent);
  }
  function selectEvent(id){
    selectedEvent=id;
    paintSelectedRow();
    renderDetails(id,{force:true});
  }
  function detailButton(label,attributes,onClick){
    const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.rpCommand='';
    for(const [name,value] of Object.entries(attributes||{}))if(value!==undefined&&value!==null)button.dataset[name]=value;
    button.addEventListener('click',onClick);
    return button;
  }
  function renderDetails(id,{force=false}={}){
    const host=el('replay-event-detail'),head=el('detail-head');
    const event=replay?.events?.find(item=>item.id===id);
    if(!event){
      selectedEvent=null;
      if(head)head.textContent='Nenhum lance selecionado';
      if(host)host.replaceChildren(Object.assign(document.createElement('p'),{textContent:'Selecione um lance salvo. Carregar em A/B apenas prepara o player; não coloca no ar.'}));
      detailsSignature='';
      return;
    }
    const signature=JSON.stringify([event.id,event.name,event.category,event.dur,(event.clips||[]).map(clip=>[clip.cam,clip.file,clip.available,clip.duration])]);
    if(!force){
      if(signature===detailsSignature&&host.childElementCount)return;
      if(host.contains(document.activeElement))return;
    }
    detailsSignature=signature;
    if(head)head.textContent=`${event.name} · ${event.category||'Lance'} · ${Number(event.dur).toFixed(2)} s`;
    host.replaceChildren();

    const edit=document.createElement('div');edit.className='detail-edit';
    const titleLabel=document.createElement('label');titleLabel.append(document.createTextNode('Título'));
    const title=document.createElement('input');title.id='detail-name';title.maxLength=120;title.value=event.name;titleLabel.append(title);
    const categoryLabel=document.createElement('label');categoryLabel.append(document.createTextNode('Categoria'));
    const category=document.createElement('input');category.id='detail-category';category.maxLength=60;category.value=event.category||'Lance';category.setAttribute('list','replay-category-list');categoryLabel.append(category);
    const categories=document.createElement('datalist');categories.id='replay-category-list';for(const value of ['Gol','Defesa','Falta','Lance','Outro']){const option=document.createElement('option');option.value=value;categories.append(option);}
    const saveMeta=detailButton('Salvar título e categoria',{},async()=>{
      const ok=await request('update-event',{eventId:event.id,name:el('detail-name').value.trim(),category:el('detail-category').value.trim()});
      if(ok){setMessage('Título e categoria confirmados no lance.');detailsSignature='';renderDetails(event.id,{force:true});}
    });
    edit.append(titleLabel,categoryLabel,categories,saveMeta);

    const trim=document.createElement('div');trim.className='detail-trim';
    const inLabel=document.createElement('label');inLabel.append(document.createTextNode('IN (s)'));
    const inInput=document.createElement('input');inInput.id='detail-in';inInput.type='number';inInput.min='0';inInput.max=String(Number(event.dur).toFixed(3));inInput.step='0.01';inInput.value='0';inLabel.append(inInput);
    const outLabel=document.createElement('label');outLabel.append(document.createTextNode('OUT (s)'));
    const outInput=document.createElement('input');outInput.id='detail-out';outInput.type='number';outInput.min='0';outInput.max=String(Number(event.dur).toFixed(3));outInput.step='0.01';outInput.value=Number(event.dur).toFixed(3);outLabel.append(outInput);
    const trimButton=detailButton('Aplicar IN/OUT',{},async()=>{
      const start=Number(el('detail-in').value),end=Number(el('detail-out').value);
      if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start){setMessage('IN/OUT inválido: OUT deve ser maior que IN.');return;}
      if(!confirm(`Recortar o lance entre ${start.toFixed(2)} s e ${end.toFixed(2)} s? Os ${event.clips.length} ângulo(s) serão re-codificados.`))return;
      const ok=await request('trim-event',{eventId:event.id,in:start,out:end});
      if(ok){setMessage(`IN/OUT aplicado: ${(end-start).toFixed(2)} s em ${event.clips.length} ângulo(s).`);detailsSignature='';renderDetails(event.id,{force:true});}
    });
    const trimNote=document.createElement('small');trimNote.textContent=`Duração atual ${Number(event.dur).toFixed(2)} s · ajuste com os players vazios`;
    trim.append(inLabel,outLabel,trimButton,trimNote);

    const angles=document.createElement('div');angles.className='detail-angles';
    const anglesTitle=document.createElement('strong');anglesTitle.textContent=`ÂNGULOS (${(event.clips||[]).length})`;angles.append(anglesTitle);
    for(const clip of event.clips||[]){
      const row=document.createElement('div');row.className='detail-angle'+(clip.available===false?' missing':'');
      const name=document.createElement('span');name.className='angle-cam';name.textContent=clip.cam;
      const availability=document.createElement('span');availability.className='angle-state';availability.textContent=clip.available===false?'ARQUIVO AUSENTE':`${Number(clip.duration??event.dur).toFixed(2)} s · disponível`;
      const file=document.createElement('small');file.className='angle-file';file.textContent=fileBase(clip.file);
      const actions=document.createElement('span');actions.className='angle-actions';
      if(clip.available===false){
        actions.append(detailButton('Localizar arquivo',{},()=>openLocate({eventId:event.id,cam:clip.cam,file:clip.file,label:clip.cam})));
      }else{
        for(const player of ['A','B']){
          const button=detailButton(player,{},async()=>{
            setMessage(`Carregando ${clip.cam} no Player ${player}…`);
            const ok=await request('load',{player,eventId:event.id,cam:clip.cam});
            if(ok)setMessage(`${clip.cam} preparado no Player ${player}. Use Reproduzir ou Colocar no ar.`);
          });
          button.title=`Carregar ${clip.cam} no Player ${player} (prepara, não coloca no ar)`;
          button.classList.add('btn-angle-load','btn-load-'+player.toLowerCase());
          actions.append(button);
        }
      }
      row.append(name,availability,file,actions);angles.append(row);
    }

    const actions=document.createElement('div');actions.className='detail-actions';
    const selected=el('replay-selected-player')?.value||deck;
    actions.innerHTML=`<span>Player selecionado no rodapé: <b>${selected}</b></span><span class="detail-hint">Carregar prepara o player; Reproduzir inicia o clipe; Colocar no ar troca o Programa.</span>`;
    host.append(edit,trim,angles,actions);
    setControls();
  }
  async function saveEventMeta(id){renderDetails(id,{force:true});}

  /* ---------- dialogs for missing media ---------- */
  function openLocate({player=null,eventId=null,cam=null,file='',label=''}={}){
    pathMode='locate';pathTarget={player,eventId,cam};
    el('path-title').textContent='Localizar arquivo';
    el('path-help').textContent=`Informe o caminho completo do vídeo${label?' de '+label:''}. O motor confere o arquivo antes de religar a referência.`;
    el('path-value').value=file||'';
    el('replay-path-dialog').showModal();
    setTimeout(()=>el('path-value').focus(),50);
  }
  function openRelink(){
    pathMode='relink';pathTarget=null;
    el('path-title').textContent='Religar pasta de gravações';
    el('path-help').textContent='Selecione a pasta que contém as gravações (ou a pasta da sessão). O 3Mix procura os arquivos ausentes pelo nome e religa apenas correspondências únicas. Pare a gravação SSD antes.';
    el('path-value').value='';
    el('replay-path-dialog').showModal();
    setTimeout(()=>el('path-value').focus(),50);
  }
  async function confirmPath(){
    const value=el('path-value').value.trim();
    if(!/^([a-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/i.test(value)||/[\x00-\x1f]/.test(value)){
      el('path-help').textContent='Informe um caminho local absoluto, por exemplo D:\\gravacoes\\replay.';
      el('path-value').focus();return;
    }
    el('replay-path-dialog').close();
    if(pathMode==='relink'){
      const ok=await request('relink',{folder:value});
      if(ok){
        const report=replay?.lastRelink;
        const notes=[];
        if(report?.reload?.failed)notes.push(`${report.reload.failed} player(s) não recarregado(s)`);
        if(report?.reload?.onAir?.length)notes.push(`Player ${report.reload.onAir.join('/')} no ar: volte ao vivo e recarregue`);
        await refreshHistory();
        setMessage(report?`Pasta religada: ${report.relinked} referência(s) recuperada(s), ${report.unresolved} pendente(s)${report.ambiguous?.length?', '+report.ambiguous.length+' nome(s) ambíguo(s)':''}${notes.length?' · '+notes.join(' · '):''}.`:'Pasta religada.');
      }
      return;
    }
    const target=pathTarget||{};
    const ok=await request('relocate',{player:target.player||undefined,eventId:target.eventId||undefined,cam:target.cam||undefined,file:value});
    if(!ok)return;
    if(target.player){
      const loaded=replay?.players?.[target.player];
      const eventId=target.eventId||loaded?.eventId,cam=target.cam||loaded?.cam;
      const reloaded=eventId?await request('load',{player:target.player,eventId,cam}):false;
      if(reloaded)setMessage(`Arquivo localizado e Player ${target.player} recarregado.`);
      else{
        const reason=el('message')?.textContent||'';
        setMessage(`Arquivo localizado, mas o Player ${target.player} não recarregou${reason?': '+reason:'.'}`);
      }
      return;
    }
    detailsSignature='';
    if(replay?.events?.some(event=>event.id===selectedEvent))renderDetails(selectedEvent,{force:true});
    setMessage('Arquivo localizado e referência do lance atualizada.');
  }

  /* ---------- request wrapper and render hooks ---------- */
  function cancelQuad(){
    clearTimeout(quadTimer);quadTimer=null;
    quadGeneration++;quadAbort?.abort();quadAbort=null;
  }
  const originalRequest=request;
  request=async function(action,data={}){
    if(disposed)return false;
    cancelQuad();
    const ok=await originalRequest(action,data);
    if(ok===true){
      if(action==='capture-range'){
        historyIn=historyOut=null;renderHistoryMarks();
        const first=replay?.events?.[0];
        if(first)selectEvent(first.id);
        setMessage('Lance salvo no histórico. Carregue A/B quando quiser preparar.');
      }else if(['capture','mark-out'].includes(action)){
        const first=replay?.events?.[0];
        if(first)selectEvent(first.id);
      }else if(action==='relink'){
        // The caller refreshes history after presenting the relink report.
      }else if(['update-event','trim-event'].includes(action)){
        detailsSignature='';
        if(selectedEvent)renderDetails(selectedEvent,{force:true});
      }
      setControls();
    }
    return ok===true;
  };
  const originalRender=render;
  render=function(data){
    if(disposed||!data)return;
    originalRender(data);connected=true;
    const rec=el('rec-status');
    if(rec)rec.textContent=rec.textContent.replace(/^[●○]\s*/,'');
    const recButton=el('record-btn');
    if(recButton){
      recButton.textContent=data.rec?'Parar REC':'Iniciar REC';
      recButton.title=data.rec?'Parar a gravação SSD desta produção':'Iniciar a gravação SSD desta produção';
    }
    paintSpeed();
    const recover=el('recover-in');
    if(recover){
      const recoverable=!data.rec&&data.markIn&&data.session&&data.markIn.sessionId===data.session.id;
      if(recoverable)delete recover.dataset.blocked;else recover.dataset.blocked='';
    }
    for(const id of ['A','B'])paintPlayer(id,data);
    paintFooter(data);
    if(selectedEvent)renderDetails(selectedEvent);
    paintSelectedRow();
    if(el('message')?.textContent==='Conectando ao motor…')setMessage('Motor conectado. Carregar A/B não coloca no ar.');
    setControls();
  };
  const originalHistoryRender=renderHistory;
  renderHistory=function(history){
    if(disposed)return;
    const previousSession=lastHistorySession;
    originalHistoryRender(history);
    if(!history){
      lastHistorySession=null;selectedAngle=null;
      ensureQuadTiles();
      paintHistoryTape();
      if(el('quad-timecode'))el('quad-timecode').textContent='--:--:--:--';
      setQuadStatus('Sem histórico disponível');
      const status=replay?.rec?'Aguardando os primeiros segundos de gravação.':'Nenhuma gravação disponível nesta produção. Inicie a REC SSD para criar histórico.';
      if(el('history-status'))el('history-status').textContent=status;
      setControls();
      return;
    }
    lastHistorySession=history.sessionId;
    if(!selectedAngle||!history.cameras.includes(selectedAngle))selectedAngle=history.cameras[0]||null;
    if(el('history-camera')&&selectedAngle)el('history-camera').value=selectedAngle;
    const index=selectedAngle?history.cameras.indexOf(selectedAngle):-1;
    quadPage=index>=0?Math.floor(index/4):0;
    ensureQuadTiles();syncVideoTile();paintHistoryLabels();paintHistoryTape();
    if(el('history-status'))el('history-status').textContent=`Histórico disponível · ${history.cameras.length} câmera(s) · ${history.recording?'gravando':'gravação parada'}`;
    if(previousSession!==history.sessionId){
      // New session: start at the newest confirmed frame, not at an empty range.
      const cursor=Math.max(history.start,history.end-1);
      el('history-seek').value=cursor;el('history-cursor').value=cursor.toFixed(3);
      paintHistoryLabels();
      loadQuad(cursor,{quiet:false});
    }else if(historyConfirmed===null&&!quadAbort){
      loadQuad(currentCursor(),{quiet:true});
    }
  };

  const originalRenderHistoryMarks=renderHistoryMarks;
  renderHistoryMarks=function(){
    originalRenderHistoryMarks();
    paintHistoryTape();
  };

  /* Preview is the shared quad cursor, not a second controller. */
  previewHistory=function(){
    if(!historyState||busy)return;
    historyConfirmed=null;setHistoryButtons(false);
    stopHistoryVideo();
    loadQuad(currentCursor(),{quiet:false});
  };
  const originalToggleHistoryPlayback=toggleHistoryPlayback;
  toggleHistoryPlayback=function(){
    if(!historyState||busy)return;
    const video=el('history-video');
    if(!historyPlayback){
      const cursor=currentCursor();
      startHistoryVideo(cursor,true);
      syncVideoTile();
      return;
    }
    if(video.paused){
      historyPlayback.resumeWhenReady=true;
      video.play().then(()=>{el('history-play').textContent='⏸ Pausar ângulo';syncVideoTile();}).catch(error=>setQuadStatus(error.message));
    }else{
      video.pause();
      historyPlayback.resumeWhenReady=false;
      el('history-play').textContent='▶ Reproduzir ângulo';
      const cursor=Number(el('history-seek').value);
      setTimeout(()=>{if(historyPlayback){stopHistoryVideo();loadQuad(cursor,{quiet:true});}},80);
    }
  };
  const originalStartHistoryVideo=startHistoryVideo;
  startHistoryVideo=function(cursor,playing){
    const result=originalStartHistoryVideo(cursor,playing);
    const video=el('history-video');
    if(video){video.playbackRate=historySpeed;video.muted=!el('history-audio')?.checked;syncVideoTile();}
    return result;
  };
  const originalStopHistoryVideo=stopHistoryVideo;
  stopHistoryVideo=function(){
    originalStopHistoryVideo();
    document.querySelector('#quad-grid .quad-tile.playing')?.classList.remove('playing');
    if(el('history-play'))el('history-play').textContent='▶ Reproduzir ângulo';
  };

  /* ---------- frame polling for players ---------- */
  async function frames(){
    if(disposed||document.hidden||frameBusy||busy)return;frameBusy=true;
    try{
      const response=await fetch('/api/json',{signal:AbortSignal.timeout(4000)}),state=await response.json();
      if(!response.ok||!state.connected)throw Error('Motor desconectado');
      if(el('replay-project'))el('replay-project').textContent=state.preset||'Produção atual';
      const disk=state.stats?.availableDiskSpace;
      if(el('replay-disk'))el('replay-disk').textContent=Number.isFinite(disk)?'Disco: '+(disk/1024).toFixed(1)+' GB livres':'Disco da gravação atual';
      for(const id of ['A','B']){
        const media=replay?.players?.[id];
        if(!media||media.available===false){clearPlayerFrame(id);playerSignatures[id]='';continue;}
        const signature=JSON.stringify([media.eventId,media.cam,media.file]);
        if(signature!==playerSignatures[id]){
          playerSignatures[id]=signature;frameGeneration++;clearPlayerFrame(id);
          const empty=el('replay-empty-'+id);if(empty){empty.hidden=false;empty.textContent='Preparando quadro do player…';}
        }
        const input=state.inputs?.find(item=>item.name==='REPLAY '+id);
        if(!input?.key)continue;
        const generation=frameGeneration;
        const shot=await fetch('/api/effects-frame?key='+encodeURIComponent(input.key),{signal:AbortSignal.timeout(4000)});
        if(!shot.ok)continue;
        const blob=await shot.blob();
        const current=replay?.players?.[id];
        if(disposed||generation!==frameGeneration||!current||current.available===false||signature!==JSON.stringify([current.eventId,current.cam,current.file]))continue;
        const url=URL.createObjectURL(blob),image=el('replay-frame-'+id),old=frameUrls.get(id);
        image.src=url;image.hidden=false;
        const empty=el('replay-empty-'+id);if(empty)empty.hidden=true;
        frameUrls.set(id,url);if(old)URL.revokeObjectURL(old);
      }
    }catch(error){
      if(!disposed){connected=false;setControls();setMessage(error.message);}
    }finally{frameBusy=false;}
  }
  const frameTimer=setInterval(frames,1500);frames();

  /* ---------- events, deck and dialog wiring ---------- */
  el('events-list').addEventListener('click',event=>{
    const row=event.target.closest('[data-event]');
    if(row)selectEvent(row.dataset.event);
  });
  const originalSelect=selectDeck;
  selectDeck=function(value,element){
    const previous=deck;
    originalSelect(value,element);
    if(previous!==value)cancelQuad();
    if(el('replay-selected-player'))el('replay-selected-player').value=value;
    paintFooter();
    if(selectedEvent)renderDetails(selectedEvent,{force:true});
    setControls();
  };
  document.querySelector('.replay-main').addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(!button)return;
    if(button.dataset.missingLocate!==undefined){
      const player=button.dataset.player,loaded=replay?.players?.[player];
      openLocate({player,eventId:loaded?.eventId,cam:loaded?.cam,file:loaded?.file||'',label:'Player '+player});
    }else if(button.dataset.missingRelink!==undefined){
      openRelink();
    }else if(button.dataset.missingRemove!==undefined){
      const player=button.dataset.player,loaded=replay?.players?.[player];
      if(!loaded)return;
      if(confirm(`Remover a referência do Player ${player} (${loaded.cam})? O arquivo não será apagado e pode ser religado depois.`)){
        request('unload',{player}).then(ok=>{if(ok)setMessage(`Referência removida do Player ${player}.`);});
      }
    }else if(button.dataset.locate!==undefined){
      openLocate({eventId:button.dataset.eventId,cam:button.dataset.cam,file:button.dataset.file||'',label:button.dataset.cam});
    }
  });
  el('quad-grid').addEventListener('click',event=>{
    const tile=event.target.closest('.quad-tile');
    if(tile?.dataset.cam)selectHistoryAngle(tile.dataset.cam);
  });
  el('quad-prev').addEventListener('click',()=>{
    if(quadPage>0&&historyState){quadPage--;selectHistoryAngle(pageCameras()[0]);}
  });
  el('quad-next').addEventListener('click',()=>{
    if(historyState&&(quadPage+1)*4<historyState.cameras.length){quadPage++;selectHistoryAngle(pageCameras()[0]);}
  });
  el('path-confirm').addEventListener('click',confirmPath);
  el('path-value').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();confirmPath();}});
  document.getElementById('history-speed').addEventListener('change',event=>setHistorySpeed(event.target.value));
  const historyVideo=el('history-video');
  if(historyVideo){
    historyVideo.addEventListener('play',()=>{
      if(el('history-play'))el('history-play').textContent='⏸ Pausar ângulo';
      historyVideo.playbackRate=historySpeed;
      syncVideoTile();
      document.querySelector('#quad-grid .quad-tile.selected')?.classList.add('playing');
    });
    historyVideo.addEventListener('pause',()=>{
      if(el('history-play'))el('history-play').textContent='▶ Reproduzir ângulo';
      document.querySelector('#quad-grid .quad-tile.playing')?.classList.remove('playing');
    });
    historyVideo.addEventListener('ended',()=>{
      if(el('history-play'))el('history-play').textContent='▶ Reproduzir ângulo';
      document.querySelector('#quad-grid .quad-tile.playing')?.classList.remove('playing');
    });
    historyVideo.addEventListener('timeupdate',paintHistoryLabels);
  }
  // Inline controls in the operational view call these narrow actions.
  window.historyCursorInput=historyCursorInput;
  window.historySeekCommitted=historySeekCommitted;
  window.stepHistorySeconds=stepHistorySeconds;
  window.selectHistoryAngle=selectHistoryAngle;
  window.setHistorySpeed=setHistorySpeed;

  /* ---------- keyboard ---------- */
  document.addEventListener('keydown',event=>{
    if(/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)||event.ctrlKey||event.altKey||event.metaKey||el('replay-settings').open||el('replay-path-dialog').open)return;
    const key=event.key.toLowerCase();
    if(key==='arrowleft'||key==='arrowright'){
      if(!historyState||!connected||busy)return;
      if(event.shiftKey)stepHistorySeconds(key==='arrowleft'?-1:1);
      else stepHistory(key==='arrowleft'?-1:1);
      return;
    }
    const actions={
      i:()=>historyState?markHistory('in'):markIn(),
      o:()=>historyState?markHistory('out'):markOut(),
      j:()=>quickClip(5),k:()=>quickClip(10),l:()=>quickClip(20),
      a:()=>selectDeck('A'),b:()=>selectDeck('B'),
      ' ':()=>{const player=replay?.players?.[deck];if(player&&player.available!==false)request('transport',{player:deck,command:player.mediaState==='OBS_MEDIA_STATE_PLAYING'?'PAUSE':'PLAY'});}
    };
    if(connected&&!busy&&actions[key]){event.preventDefault();actions[key]();}
  });

  /* ---------- view flags ---------- */
  const params=new URLSearchParams(location.search);
  if(params.get('view')==='settings')el('replay-settings').showModal();
  if(params.get('dock')==='1')document.body.classList.add('replay-docked');
  window.addEventListener('pagehide',()=>{
    disposed=true;frameGeneration++;cancelQuad();
    clearInterval(frameTimer);clearInterval(clockTimer);
    for(const url of frameUrls.values())URL.revokeObjectURL(url);
    frameUrls.clear();stopHistoryVideo();
  });
})();
