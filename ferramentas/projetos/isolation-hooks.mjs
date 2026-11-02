// Root-only install BEFORE enabling host apply. No instances are constructed here.
export function installIsolationHooks(gate,{production,replay,iso,onlineUpdate,diagnostics}){
 const installed=[];
 const wrap=(object,label,keys)=>{for(const key of keys){if(typeof object?.[key]!=='function')throw Error('ISOLATION_HOOK_MISSING '+label+'.'+key);const original=object[key];object[key]=function(...args){return gate.publicRun(()=>original.apply(this,args));};installed.push(label+'.'+key);}};
 wrap(production,'production',[...new Set(['run','runRealtime','runTickerUpdate','checkOperation','runMacroStep','tick','refresh','execute','routeLegacyAudio','publishData','title','overlay',...Object.getOwnPropertyNames(Object.getPrototypeOf(production)).filter(k=>k!=='constructor'&&typeof production[k]==='function'&&production[k].constructor.name==='AsyncFunction')])]);
 const owners={replay,iso,onlineUpdate,diagnostics,...Object.fromEntries(['macroEngine','controllerEngine','globalHotkeys','callEngine','networkEngine','queueEngine','sessionRecovery','recoveryEngine','signalEngine','dataSources','inputEngine','gcCompatible','gcLibrary','outputEngine','audioRoutingEngine','settingsEngine','effectsEngine','overlayEngine'].map(k=>[k,production[k]]))};
 for(const [label,object] of Object.entries(owners)){
  if(!object)throw Error('ISOLATION_OWNER_MISSING '+label);
  const methods=Object.getOwnPropertyNames(Object.getPrototypeOf(object)).filter(k=>k!=='constructor'&&typeof object[k]==='function'&&object[k].constructor.name==='AsyncFunction');wrap(object,label,methods);
 }
 if(!production.callEngine.returns)throw Error('CALL_RETURNS_OWNER_MISSING');const returns=production.callEngine.returns;wrap(returns,'callReturns',Object.getOwnPropertyNames(Object.getPrototypeOf(returns)).filter(k=>k!=='constructor'&&typeof returns[k]==='function'&&returns[k].constructor.name==='AsyncFunction'));
 return Object.freeze({installed,qualificationRequired:true,externalEventAndApiGuardsStillRequired:true});
}
