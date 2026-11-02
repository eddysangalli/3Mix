export function speakerOptions(value,slots){
 if(!value||typeof value.enabled!=='boolean')throw Error('Estado do enquadramento automático inválido');
 const thresholdDb=Number(value.thresholdDb??-35),marginDb=Number(value.marginDb??6),holdMs=Number(value.holdMs??1800),debounceMs=Number(value.debounceMs??450);
 if(!Number.isFinite(thresholdDb)||thresholdDb< -60||thresholdDb> -6||!Number.isFinite(marginDb)||marginDb<3||marginDb>20||!Number.isInteger(holdMs)||holdMs<800||holdMs>10000||!Number.isInteger(debounceMs)||debounceMs<200||debounceMs>3000)throw Error('Sensibilidade ou tempos do locutor fora do intervalo');
 const mappings=value.mappings;if(!Array.isArray(mappings)||mappings.length>16||value.enabled&&mappings.length<2||new Set(mappings.map(m=>m.slot)).size!==mappings.length||new Set(mappings.map(m=>m.audioKey)).size!==mappings.length||mappings.some(m=>!slots.some(s=>s.id===m.slot)||typeof m.audioKey!=='string'||!m.audioKey))throw Error('Associe pelo menos dois slots a fontes de áudio diferentes');
 return {enabled:value.enabled,thresholdDb,marginDb,holdMs,debounceMs,mappings:mappings.map(m=>({slot:m.slot,audioKey:m.audioKey}))};
}
export function chooseSpeaker(config,state,context,now=Date.now()){
 const candidates=config.mappings.map(m=>{const input=context.sourceInputs?.find(i=>i.key===m.audioKey),audio=context.audioInputs?.find(a=>a.name===input?.name||a.key===m.audioKey),director=context.calls?.director,protectedInput=!input||audio?.bus||input.key===director?.key||input.name===director?.name||/^3Mix (?:Master|Bus|Retorno|N1)(?:\s|$)/.test(input.name);const level=!protectedInput&&!audio?.muted&&Array.isArray(audio?.levels)?Math.max(0,...audio.levels.filter(Number.isFinite)):0;return {...m,db:level>0?20*Math.log10(level):-120};}).sort((a,b)=>b.db-a.db);
 const best=candidates[0],active=candidates.find(m=>m.slot===state.active);if(!best||best.db<config.thresholdDb||best.slot===state.active){state.pending=null;return null;}
 if(active&&best.db<active.db+config.marginDb||now-(state.changedAt??-Infinity)<config.holdMs){state.pending=null;return null;}
 if(state.pending!==best.slot){state.pending=best.slot;state.since=now;return null;}
 if(now-state.since<config.debounceMs)return null;state.pending=null;state.active=best.slot;state.changedAt=now;return best.slot;
}
export function speakerRects(slots,active,viewport=[0,0,1,1]){
 const [x,y,w,h]=viewport,others=slots.filter(s=>s.id!==active),railWidth=others.length ? .23 : 0,gap=.015;
 return slots.map(s=>{if(s.id===active)return {id:s.id,rect:[x+w*.02,y+h*.02,w*(.96-railWidth),h*.96]};const n=others.indexOf(s),height=Math.min(.3,(.96-gap*(others.length-1))/others.length);return {id:s.id,rect:[x+w*.76,y+h*(.02+n*(height+gap)),w*.22,h*height]};});
}
