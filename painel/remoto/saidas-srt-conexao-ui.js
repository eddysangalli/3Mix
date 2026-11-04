// Local draft editor only. No network discovery, saving or output start.
(()=>{'use strict';
 const el=id=>document.getElementById(id),server=el('server'),protocol=el('protocol');if(!server||!protocol||el('srt-connection'))return;
 const box=document.createElement('fieldset');box.id='srt-connection';box.innerHTML='<legend>Conexão SRT (v1.5.7 Pro)</legend>'
   +'<label>Modo<select id="srt-connection-mode">'
   +'<option value="caller">Caller · conectar ao receptor remoto</option>'
   +'<option value="listener">Listener · aguardar conexão de câmera/encoder</option>'
   +'<option value="rendezvous">Rendezvous · conexão peer-to-peer (P2P firewall)</option>'
   +'</select></label>'
   +'<label><span id="srt-host-label">IP ou nome do receptor</span><input id="srt-connection-host" value="127.0.0.1" placeholder="Ex.: 192.168.1.50" spellcheck="false"></label>'
   +'<label>Porta SRT<input id="srt-connection-port" type="number" min="1" max="65535" value="18360"></label>'
   +'<label>Latência (ms)<input id="srt-connection-latency" type="number" min="20" max="8000" value="120" step="1"></label>'
   +'<label>Criptografia AES / Senha<input id="srt-connection-passphrase" type="password" placeholder="Passphrase opcional" autocomplete="new-password"></label>'
   +'<label>Cifra AES (Chave)<select id="srt-connection-pbkeylen">'
   +'<option value="">Padrão (Auto / AES-128)</option>'
   +'<option value="16">AES-128 bits (16 bytes)</option>'
   +'<option value="24">AES-192 bits (24 bytes)</option>'
   +'<option value="32">AES-256 bits (32 bytes - Máxima Segurança)</option>'
   +'</select></label>'
   +'<label>Stream ID (Multiplexação / vMix)<input id="srt-connection-streamid" placeholder="Ex.: live/feed1 ou #!::u=operador" spellcheck="false"></label>'
   +'<label>IPs deste computador<select id="srt-local-ips"><option value="">Consultar lista local</option></select></label>'
   +'<p id="srt-local-ip-note"></p>'
   +'<p id="srt-connection-help">Compatível com OBS, vMix e Haivision SRT 1.5.7. Em Caller conecte ao IP remoto; em Listener selecione o IP local. A criptografia AES e Stream ID são sincronizados automaticamente na URL.</p>'
   +'<label>URL da conexão SRT<input id="srt-connection-url" readonly spellcheck="false"></label>'
   +'<div class="row"><button id="srt-connection-use" type="button">Usar esta conexão</button><button id="srt-connection-copy" type="button">Copiar URL</button></div>'
   +'<p id="srt-connection-message" role="status"></p>';

 const label=server.closest('label'),advanced=document.createElement('details');advanced.id='srt-connection-advanced';const summary=document.createElement('summary');summary.textContent='URL avançada · parâmetros adicionais';advanced.append(summary);if(label){label.before(box,advanced);advanced.append(label);}else server.before(box,advanced);
 let base=null,lastURL=null,lastIndex=null,localSignature='',invalid=false,wasSRT=null;
 const saved=()=>typeof outputs==='undefined'?null:outputs?.destinations?.[typeof index==='undefined'?-1:index];
 const selected=()=>typeof index==='undefined'?0:index;
 const isSRT=()=>protocol.value==='srt'||protocol.value==='auto'&&/^srt:/i.test(server.value.trim());
 function parse(text){try{const u=new URL(text);return u.protocol==='srt:'?u:null;}catch{return null;}}
 function sync(){
   const text=server.value.trim(),id=selected();if(text===lastURL&&id===lastIndex)return;lastURL=text;lastIndex=id;base=parse(text);invalid=!!text&&!base;
   el('srt-connection-host').value=base?.hostname.replace(/^\[|\]$/g,'')||'127.0.0.1';
   el('srt-connection-port').value=base?.port||'18360';
   el('srt-connection-latency').value=base?.searchParams.has('latency')?String(Number(base.searchParams.get('latency'))/1000):'120';
   el('srt-connection-passphrase').value=base?.searchParams.get('passphrase')||'';
   el('srt-connection-pbkeylen').value=base?.searchParams.get('pbkeylen')||'';
   el('srt-connection-streamid').value=base?.searchParams.get('streamid')||'';
   const mode=base?.searchParams.get('mode')||'caller',select=el('srt-connection-mode');
   select.querySelector('[data-advanced-mode]')?.remove();
   if(!['caller','listener','rendezvous'].includes(mode)){const o=new Option('Modo avançado salvo · '+mode,mode);o.dataset.advancedMode='true';select.add(o);}
   select.value=mode;
 }
 function make(changed){
   const host=el('srt-connection-host').value.trim(),port=Number(el('srt-connection-port').value),latency=Number(el('srt-connection-latency').value);
   if(!host||/[\s/?#@]/.test(host))throw Error('Informe somente o IP ou nome do receptor, sem URL.');
   if(!Number.isInteger(port)||port<1||port>65535)throw Error('A porta deve estar entre 1 e 65535.');
   if(!Number.isFinite(latency)||latency<20||latency>8000)throw Error('A latência deve estar entre 20 e 8000 ms.');
   if(invalid)throw Error('A URL avançada não é SRT. Corrija ou limpe esse campo antes de usar o assistente.');
   const u=base?new URL(base.href):new URL('srt://127.0.0.1:18360');
   u.hostname=host.includes(':')&&!host.startsWith('[')?'['+host+']':host;
   u.port=String(port);
   u.searchParams.set('mode',el('srt-connection-mode').value);
   u.searchParams.set('latency',String(Math.round(latency*1000)));
   const pass=el('srt-connection-passphrase').value.trim();
   if(pass){
     if(pass.length<10||pass.length>79)throw Error('A senha SRT deve ter entre 10 e 79 caracteres.');
     u.searchParams.set('passphrase',pass);
     const keylen=el('srt-connection-pbkeylen').value;
     if(keylen)u.searchParams.set('pbkeylen',keylen);else u.searchParams.delete('pbkeylen');
   }else{
     u.searchParams.delete('passphrase');
     u.searchParams.delete('pbkeylen');
   }
   const streamid=el('srt-connection-streamid').value.trim();
   if(streamid)u.searchParams.set('streamid',streamid);else u.searchParams.delete('streamid');
   return u.href;
 }
 function preview(){try{el('srt-connection-url').value=make();el('srt-connection-message').textContent='Confira os dados; Salvar ou Transmitir aplica o rascunho.';return true;}catch(e){el('srt-connection-url').value=server.value;el('srt-connection-message').textContent=e.message;return false;}}
 function write(changed){if(saved()?.active||selected()<0)return;try{const url=make(changed);server.value=url;server.dispatchEvent(new Event('input',{bubbles:true}));server.dispatchEvent(new Event('change',{bubbles:true}));sync();preview();}catch(e){el('srt-connection-message').textContent=e.message;}}
 function paint(){
   sync();const srt=isSRT(),active=!!saved()?.active,missing=selected()<0;box.hidden=!srt;advanced.hidden=srt?false:!label;summary.hidden=!srt;
   if(wasSRT!==srt){advanced.open=!srt;wasSRT=srt;}
   for(const f of box.querySelectorAll('input,select,button'))f.disabled=active||missing;server.disabled=active||missing;
   const mode=el('srt-connection-mode').value;
   el('srt-host-label').textContent=mode==='listener'?'IP local para aguardar conexão':(mode==='rendezvous'?'IP do par Rendezvous':'IP ou nome do receptor');
   el('srt-local-ips').disabled=active||missing||mode!=='listener';
   let ips=[];try{ips=window.FreeMixRemote?.getState()?.ips||[];}catch{}ips=ips.filter(ip=>typeof ip==='string');const sig=JSON.stringify(ips);
   if(sig!==localSignature){localSignature=sig;el('srt-local-ips').replaceChildren(new Option('Escolher IP local para Listener',''),...ips.map(ip=>new Option(ip,ip)));}
   el('srt-local-ip-note').textContent=(ips.length?'IPs locais: '+ips.join(' · '):'Nenhum IP de rede local informado pelo serviço.')+' Estes são os IPs deste 3Mix.';
   preview();
   if(active)el('srt-connection-message').textContent='Saída ativa. Pare antes de alterar a conexão.';
   if(missing)el('srt-connection-message').textContent='Selecione uma saída SRT ou uma saída livre para preparar a conexão.';
 }
 for(const [id,part]of[
   ['srt-connection-host','host'],['srt-connection-port','port'],['srt-connection-latency','latency'],
   ['srt-connection-mode','mode'],['srt-connection-passphrase','passphrase'],['srt-connection-pbkeylen','pbkeylen'],
   ['srt-connection-streamid','streamid']
 ]){
   el(id).addEventListener('input',()=>{write(part);paint();});
   el(id).addEventListener('change',()=>{write(part);paint();});
 }
 el('srt-local-ips').addEventListener('change',()=>{if(el('srt-local-ips').value){el('srt-connection-host').value=el('srt-local-ips').value;write('host');paint();}});
 el('srt-connection-use').onclick=()=>write();
 el('srt-connection-copy').onclick=async()=>{try{await navigator.clipboard.writeText(el('srt-connection-url').value);el('srt-connection-message').textContent='URL copiada.';}catch{el('srt-connection-url').focus();el('srt-connection-url').select();el('srt-connection-message').textContent='Selecione e copie a URL com Ctrl+C.';}};
 server.addEventListener('input',paint);server.addEventListener('change',paint);protocol.addEventListener('change',paint);
 if(typeof fields==='function'){const before=fields;fields=function(){const result=before.apply(this,arguments);paint();return result;};}
 if(typeof paintStatus==='function'){const before=paintStatus;paintStatus=function(){const result=before.apply(this,arguments);paint();return result;};}
 window.FreeMixSRTConnection={paint,make};paint();
})();
