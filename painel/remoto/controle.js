// One reconnecting, acknowledged client shared by the operator consoles.
(() => {
  const el=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const page=document.body.dataset.page;let ws,timer,attempt=0,state={},interacting=false,pendingRender=false,isoDirty=false;const isoSelection=new Set();
  const message=(s,error=false)=>{const box=el('message')||el('error');if(!box)return;box.hidden=false;box.textContent=s;box.className=error?'error':'ok';};
  // O selo de conexão é colorido pela paleta 3Mix: verde conectado, vermelho desligado, âmbar reconectando.
  const connection=(text,state)=>{const box=el('connection');if(!box)return;box.textContent=text;if(state)box.dataset.state=state;else delete box.dataset.state;};
  const time=ms=>ms==null?'--:--':`${Math.floor(ms/60000).toString().padStart(2,'0')}:${Math.floor(ms/1000%60).toString().padStart(2,'0')}`;
  async function request(url,data){const r=await fetch(url,{...(data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(120000)});let v;try{v=await r.json();}catch{throw new Error('Resposta inválida do servidor');}if(r.status===401){pair();throw new Error(v.error);}if(!r.ok||v.success===false)throw new Error(v.error||'Operação recusada');return v;}
  async function cmd(action,data={}){try{const r=await request('/api/control',{action,...data});if(r.state){state=r.state;render();}message('Operação confirmada pelo 3Mix.');return r;}catch(e){message(e.message,true);throw e;}}
  function pair(){if(el('pair-dialog'))return;const box=document.createElement('div');box.id='pair-dialog';box.className='pair';box.innerHTML='<form><h2>Autorizar dispositivo</h2><p>Digite o código mostrado no Hub aberto no computador do 3Mix.</p><label>Código de seis dígitos<input name="pin" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label><button>Conectar</button><p role="alert"></p></form>';document.body.appendChild(box);box.querySelector('form').onsubmit=async e=>{e.preventDefault();try{await request('/api/pair',{pin:box.querySelector('input').value});const next=new URLSearchParams(location.search).get('next');if(next&&next.startsWith('/')&&!next.startsWith('//')&&!next.startsWith('/\\')){location.replace(next);return;}box.remove();connect();}catch(e){box.querySelector('[role=alert]').textContent=e.message;}};}
  function connect(){clearTimeout(timer);ws?.close();const mine=ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);
    mine.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='state'||m.type==='init'){attempt=0;state=m.data;connection(state.connected?'Motor conectado':'Motor desconectado',state.connected?'on':'off');if(interacting)pendingRender=true;else render();}if(m.type==='meters')for(const i of m.inputs||[]){const meter=document.querySelector(`[data-meter="${CSS.escape(i.inputName)}"]`);if(meter)meter.style.width=Math.min(100,Math.max(0,...(i.inputLevelsMul||[]).map(ch=>ch[1]||0))*100)+'%';}};
    mine.onclose=()=>{if(ws!==mine)return;connection('Reconectando','wait');timer=setTimeout(async()=>{try{await request('/api/json');connect();}catch(e){if(!el('pair-dialog'))connect();}},Math.min(10000,500*2**attempt++));};
  }
  function inputValue(id,value){const e=el(id);if(e&&document.activeElement!==e)e.value=value??'';}
  function render(){
    if(page==='iso'){
      const rec=state.iso?.rec;el('iso-status').textContent=rec?'ISO GRAVANDO':'ISO parado';el('iso-start').disabled=!!rec;el('iso-stop').disabled=!rec;
      if(el('iso-options')){
        for(const field of el('iso-options').querySelectorAll('input,select,button'))field.disabled=!!rec;
        if(!isoDirty){const o=state.iso?.recordOptions||{};for(const k of ['format','directory','prefix','encoder','crf','audio'])inputValue('iso-'+k,o[k]??({format:'mpegts',prefix:'cam',encoder:'default',crf:23,audio:'input'})[k]??'');inputValue('iso-split',Number(o.splitSeconds||0)/60);}
      }
      for(const b of document.querySelectorAll('[data-iso-format]')){b.disabled=!!rec;b.classList.toggle('selected',b.dataset.isoFormat===el('iso-format').value);}
      el('iso-inputs').innerHTML=(state.scenes||[]).filter(n=>!n.startsWith('REPLAY ')&&n!=='3Mix Barramentos').map(n=>{const cam=state.iso?.session?.cams?.find(c=>c.name===n);return `<tr><td><label><input type="checkbox" data-iso="${esc(n)}" ${isoSelection.has(n)?'checked':''} ${rec?'disabled':''}>${esc(n)}</label></td><td>${rec&&cam?time(Date.now()-state.iso.session.startedAt):'—'}</td><td>${rec&&cam?'Gravando':'Parado'}</td><td class="iso-path" title="${esc(cam?.file||'')}">${esc(cam?.file||'Pasta base + subpasta da sessão')}</td></tr>`;}).join('');
      el('iso-files').innerHTML=(state.iso?.session?.cams||[]).flatMap(c=>(c.files?.length?c.files:[c.file]).map(f=>`<li>${esc(c.name)} · ${esc(f)}</li>`)).join('')||'<li>Nenhuma sessão gravada.</li>';return;
    }
    if(page==='hub'){el('engine-status').textContent=state.connected?`Programa: ${state.program||'—'} · ${state.recording?'Gravando':'Gravação parada'} · ${state.streaming?'Transmitindo':'Transmissão parada'}`:'Aguardando motor';return;}
    if(page==='corte'){
      el('program').textContent=state.program||'—';el('preview').textContent=state.preview||'—';el('inputs').innerHTML=(state.inputs||[]).filter(i=>!/^REPLAY [AB]$/.test(i.name)).map(i=>`<button data-preview="${esc(i.name)}" class="${i.name===state.program?'program':i.name===state.preview?'preview':''}">${i.number}. ${esc(i.name)}</button>`).join('');
    }
    if(page==='playout'){
      const selected=el('media-select').value||localStorage.getItem('freemix.remote.media'),list=state.media||[];
      el('media-select').innerHTML=list.map(m=>`<option value="${esc(m.name)}">${esc(m.name)}</option>`).join('');if(list.some(m=>m.name===selected))el('media-select').value=selected;
      const m=list.find(m=>m.name===el('media-select').value);el('media-state').textContent=m?m.state.replace('OBS_MEDIA_STATE_',''):'Nenhuma fonte de mídia';
      el('time').textContent=m?`${time(m.position)} / ${time(m.duration)}`:'--:--';el('seek').max=m?.duration||0;inputValue('seek',m?.position||0);inputValue('speed',m?.speed||100);el('speed').disabled=!/ffmpeg/.test(m?.kind||'');el('loop').checked=!!m?.loop;el('autonext').checked=!!m?.autoNext;el('autonext').disabled=!/playlist/.test(m?.kind||'');
      el('items').innerHTML=(m?.items||[]).map(i=>`<li>${esc(i.title)}</li>`).join('')||`<li>${esc(m?.currentFile||'Nenhum arquivo')}</li>`;
      for(const b of document.querySelectorAll('[data-media]'))b.disabled=!m||(['NEXT','PREVIOUS'].includes(b.dataset.media)&&!/playlist|vlc/.test(m.kind));
    }
    if(page==='audio'){
      el('strips').innerHTML=(state.audioInputs||[]).map(a=>`<div class="strip"><b>${esc(a.name)}</b><div class="meter"><i data-meter="${esc(a.name)}" style="width:${Math.min(100,Math.max(0,...a.levels)*100)}%"></i></div><label>Volume<input type="range" min="0" max="100" value="${Math.round(a.volumeMul*100)}" data-volume="${esc(a.name)}"></label><small>${Math.round(a.volumeMul*100)}%</small><div class="row"><button data-mute="${esc(a.name)}" class="${a.muted?'air':''}">${a.muted?'MUDO':'Áudio'}</button><button data-monitor="${esc(a.name)}" data-on="${a.monitor==='OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT'}">Fone</button></div><div class="row">${['M','A','B'].map((bus,i)=>`<button data-route="${esc(a.name)}" data-bus="${bus}" class="${a.tracks[String((state.buses?4:1)+i)]?'on':''}">${bus}</button>`).join('')}</div></div>`).join('')||'<p>Nenhuma fonte de áudio disponível.</p>';
      const hasMaster=(state.audioInputs||[]).some(a=>a.bus==='M');el('master-notice').textContent=hasMaster?'Master e auxiliares confirmados no motor.':'Master e auxiliares ainda não foram configurados. Os botões M/A/B abaixo controlam as trilhas 1/2/3 enquanto os barramentos estão desligados.';el('enable-buses').hidden=hasMaster;
    }
    if(page==='gc'){
      const g=state.gc||{};for(const [id,k] of Object.entries({title:'title',subtitle:'subtitle','team-home':'teamHome','team-away':'teamAway','minutes':'minutes',period:'period'}))inputValue(id,g[k]);
      el('score-home').textContent=g.scoreHome??0;el('score-away').textContent=g.scoreAway??0;el('lower-status').textContent=g.activeLowerThird?'TARJA NO AR':'Tarja fora do ar';el('score-status').textContent=g.activeScore?'PLACAR NO AR':'Placar fora do ar';
    }
  }
  document.addEventListener('pointerdown',()=>{interacting=true;});document.addEventListener('pointerup',()=>{interacting=false;if(pendingRender){pendingRender=false;setTimeout(render,100);}});
  document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;let action,data;
    if(b.dataset.isoFormat){el('iso-format').value=b.dataset.isoFormat;isoDirty=true;render();return;}
    if(b.dataset.preview){action='preview';data={input:b.dataset.preview};}
    if(b.dataset.action){action=b.dataset.action;data={duration:el('duration')?.value};}
    if(b.dataset.media){action='media';data={input:el('media-select').value,command:b.dataset.media};}
    if(b.dataset.mute){action='audio_mute';data={input:b.dataset.mute};}
    if(b.dataset.monitor){action='audio_monitor';data={input:b.dataset.monitor,enabled:b.dataset.on!=='true'};}
    if(page==='audio'&&b.dataset.route){action='audio_bus';data={input:b.dataset.route,bus:b.dataset.bus};}
    if(b.dataset.gc){const score=b.dataset.gc==='score';action='gc';data={kind:score?'score':'lower',on:b.dataset.on==='true',data:score?{teamHome:el('team-home').value,teamAway:el('team-away').value,minutes:Number(el('minutes').value),period:el('period').value}:{title:el('title').value,subtitle:el('subtitle').value}};}
    if(b.dataset.team){action='score';data={team:b.dataset.team,delta:Number(b.dataset.delta)};}
    if(action){b.disabled=true;cmd(action,data).catch(()=>{}).finally(()=>b.disabled=false);}
  });
  document.addEventListener('change',e=>{const t=e.target;let action,data;
    if(t.closest('#iso-options')){isoDirty=true;return;}
    if(t.dataset.iso){t.checked?isoSelection.add(t.dataset.iso):isoSelection.delete(t.dataset.iso);return;}
    if(t.id==='media-select'){localStorage.setItem('freemix.remote.media',t.value);render();return;}
    if(t.dataset.volume){action='audio_volume';data={input:t.dataset.volume,volume:Number(t.value)};}
    if(['speed','loop','autonext'].includes(t.id)){action='media_settings';data={input:el('media-select').value,...(t.id==='speed'?{speed:Number(t.value)}:t.id==='loop'?{loop:t.checked}:{autoNext:t.checked})};}
    if(t.id==='seek'){action='media_seek';data={input:el('media-select').value,position:Number(t.value)};}
    if(action)cmd(action,data).catch(()=>{});
  });
  let tbarSending=false,tbarLatest=null;
  async function sendTbar(){if(tbarSending)return;tbarSending=true;try{while(tbarLatest){const d=tbarLatest;tbarLatest=null;await cmd('tbar',d);}}finally{tbarSending=false;}}
  el('tbar')?.addEventListener('input',e=>{tbarLatest={position:Number(e.target.value)/100,release:false};sendTbar().catch(()=>{});});
  el('tbar')?.addEventListener('change',e=>{tbarLatest={position:Number(e.target.value)/100,release:true};sendTbar().catch(()=>{});});
  if(page==='hub')request('/api/access').then(a=>{window.dispatchEvent(new CustomEvent('3mix-acesso',{detail:a}));}).catch(()=>{});
  function isoOptions(){return Object.fromEntries(['format','directory','prefix','encoder','crf','audio'].map(k=>[k,el('iso-'+k).value]).concat([['splitSeconds',Number(el('iso-split').value)*60],['audioSourceUUID',el('iso-audio-source')?.value||'']]));}
  async function saveIsoOptions(){const r=await request('/api/iso',{action:'configure',options:isoOptions()});state.iso=r.iso;isoDirty=false;render();return r;}
  el('iso-options')?.addEventListener('input',()=>{isoDirty=true;});
  el('iso-save')?.addEventListener('click',async e=>{e.target.disabled=true;try{await saveIsoOptions();message('Opções da MultiGravação salvas.');}catch(e){message(e.message,true);}finally{e.target.disabled=!!state.iso?.rec;}});
  for(const action of ['start','stop'])el('iso-'+action)?.addEventListener('click',async e=>{e.target.disabled=true;try{if(action==='start'&&isoDirty)await saveIsoOptions();const r=await request('/api/iso',{action,cams:[...isoSelection]});state.iso=r.iso;render();message('ISO confirmado pelo motor e pelo arquivo.');}catch(e){message(e.message,true);}finally{render();}});
  connect();window.FreeMixRemote={command:cmd,getState:()=>state};
})();
