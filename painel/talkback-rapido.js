// Momentary private talkback, sharing the same leases and native watchdog as Calls.
(() => {
  if(new URLSearchParams(location.search).get('mode')!=='clocks')return;
  const button=document.getElementById('talk-hold'),status=document.getElementById('talk-status');
  const cfg=window.MESA_LOCAL||{},base=(cfg.replayUrl||'http://'+new URL(cfg.url||'ws://127.0.0.1:4466').hostname+':8088/api/replay').replace(/replay$/,'');
  let calls=null,held=false,starting=false,lease=null,heartbeat=null,pinging=false,polling=false;
  const targets=()=>calls?.rapidTargets===null||calls?.rapidTargets===undefined?(calls?.guests||[]).map(g=>g.key):calls.rapidTargets;
  function hint(message){status.textContent=message;button.title=message+' Segure para falar; soltar fecha o mic privado.';}
  async function command(action,data={}) {
    const response=await fetch(base+'control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data}),keepalive:action==='call_talk_stop',signal:AbortSignal.timeout(5000)});
    const value=await response.json();if(!response.ok||!value.success)throw Error(value.error||'Talkback indisponível');return value;
  }
  function stop() {
    held=false;clearInterval(heartbeat);heartbeat=null;button.classList.remove('active');button.textContent='Talkback';
    const previous=lease;lease=null;if(previous)command('call_talk_stop',{lease:previous}).catch(e=>hint(e.message));
  }
  async function start() {
    if(held||starting||button.disabled)return;held=true;starting=true;
    try {
      const result=await command('call_talk_start',{targets:targets()});lease=result.call?.lease;
      if(!held){stop();return;}if(!lease)throw Error('O motor não confirmou talkback');
      button.classList.add('active');button.textContent='FALANDO';hint('Mic privado, fora do Master.');
      heartbeat=setInterval(async()=>{if(pinging||!lease)return;pinging=true;try{await command('call_talk_ping',{lease});}catch(e){stop();hint(e.message);}finally{pinging=false;}},350);
    }catch(e){stop();hint(e.message);}finally{starting=false;}
  }
  button.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();button.setPointerCapture(e.pointerId);start();});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,stop);
  button.addEventListener('keydown',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();if(!e.repeat)start();}});
  button.addEventListener('keyup',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();stop();}});
  document.addEventListener('keydown',e=>{if(e.ctrlKey&&e.code==='Space'&&!e.repeat&&!/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)){e.preventDefault();start();}});
  document.addEventListener('keyup',e=>{if(e.code==='Space')stop();});
  for(const event of ['blur','pagehide'])window.addEventListener(event,stop);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  async function poll() {
    if(polling)return;polling=true;
    try {
      const response=await fetch(base+'json',{signal:AbortSignal.timeout(4000)});if(!response.ok)throw Error('Sem conexão com Calls');const state=await response.json();calls=state.calls;
      const individual=calls?.capability==='individual-PCM-WebRTC',keys=targets();
      const ready=individual&&keys.length>0&&keys.every(key=>calls.guests?.some(g=>g.key===key)&&calls.returns?.some(r=>r.key===key&&r.publisher==='publishing'));
      const elsewhere=calls?.talking&&!lease&&!starting;
      button.disabled=!calls?.director||!calls.nativeWatchdog||!ready||elsewhere;
      if(button.disabled&&held)stop();
      if(!held)hint(!calls?.director?'Configure o microfone em Calls.':!calls.nativeWatchdog?'Atualize o motor para usar talkback seguro.':!ready?'Abra Calls, prepare os retornos e escolha quem recebe.':elsewhere?'O diretor está falando em outro controle. Aguarde soltar.':'Convidados: '+keys.map(key=>calls.guests.find(g=>g.key===key)?.person?.name||calls.guests.find(g=>g.key===key)?.name||key).join(', ')+'.');
    }catch(e){button.disabled=true;stop();hint('Controle local desconectado. Abra pelo atalho 3Mix Studio.');}finally{polling=false;}
  }
  poll();setInterval(poll,1000);
})();
