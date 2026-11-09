// One entry point: installation preparation, local control, engine, then readiness check.
import {execFile,execFileSync,spawn} from 'node:child_process';import {promisify} from 'node:util';
import {existsSync} from 'node:fs';import {fileURLToPath} from 'node:url';import {resolve,join} from 'node:path';import {stat,readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {connect,sleep} from './obsws.mjs';import {preparePortable} from './preparar-portatil.mjs';
import {prepareNdiRuntime} from './ndi-runtime.mjs';
import {acquireStartupLock,startupRecord} from './recuperacao-inicializacao.mjs';
import {applyPendingPlugins} from './plugin-manager.mjs';
import {createUpdateOpening} from './update-opening-session.mjs';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
import {configureOwnedLifecycle} from './api-lifecycle-handshake-client.mjs';
import {superviseOwnedEngine} from './api-lifecycle-supervisor.mjs';
import {waitApiBrokerReady} from './api-broker-readiness.mjs';
import {waitOwnedProcessExit} from './wait-owned-process-exit.mjs';
import {watchApiChildExit} from './watch-api-child-exit.mjs';
const run=promisify(execFile),root=resolve(process.env.FREEMIX_ROOT||fileURLToPath(new URL('../',import.meta.url))),exe=join(root,'bin/64bit/3Mix.exe');
process.env.FREEMIX_ROOT=root;
// Process-local runtime paths: never change the computer's global environment.
process.env.OMT_STORAGE_PATH=join(root,'config/omt');
let releaseLock=async()=>{};
let splashState=null;
let apiBroker=null;
let apiChildExit=null;
let lifecycleCompletion=null;
const lifecycleQualification=!process.argv.includes('--no-api-lifecycle');
async function reportSplash(status,message,extra={}){if(!splashState)return;const tmp=splashState+'.tmp';await writeFile(tmp,JSON.stringify({...extra,status,message,at:new Date().toISOString()}));await rename(tmp,splashState);}

async function stateResponse(port){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),2000);try{const response=await fetch('http://127.0.0.1:'+port+'/api/json',{signal:controller.signal}),data=await response.json();return {ok:response.ok,json:async()=>data};}finally{clearTimeout(timer);}}
async function startQualifiedApiBroker(){
 const installationId=createHash('sha256').update(root.toLowerCase()).digest('hex');
 apiBroker=spawn(process.execPath,[join(root,'ferramentas/iniciar-api.mjs'),'--lifecycle-broker'],{cwd:root,windowsHide:true,stdio:['ignore','ignore','ignore','ipc'],env:process.env});
 try{return await waitApiBrokerReady(apiBroker,installationId);}catch(error){if(apiBroker.connected)apiBroker.disconnect();throw error;}
}
async function api(check=false){const result=await run(process.execPath,[join(root,'ferramentas/iniciar-api.mjs'),...(check?['--check']:[])],{windowsHide:true,env:process.env,timeout:45000});return JSON.parse(result.stdout.trim());}
try{
 await stat(exe);const brandedPanel=await readFile(join(root,'painel/mesa.html'),'utf8');
 if(!/\b3Mix\b/.test(brandedPanel))throw Error('A interface instalada não está identificada como 3Mix; nenhum processo foi iniciado.');
 await stat(join(root,'data/obs-studio/themes/Yami_Default.ovt'));
 if(await stat(join(root,'installation-error.txt')).catch(e=>{if(e.code==='ENOENT')return null;throw e;}))throw Error('Esta instala��o tem uma prepara��o/importa��o incompleta. Confira installation-error.txt antes de abrir; nenhum processo foi iniciado.');
 if(process.argv.includes('--check')){const ndiRuntime=await prepareNdiRuntime(root,{writeReceipt:false});console.log(JSON.stringify({success:true,root,ndiRuntime,...await api(true)}));process.exit(0);}
 releaseLock=await acquireStartupLock(root);await startupRecord(root,'launcher-begin',{check:false});
 try{const recovered=await (await import('./atualizar-freemix.mjs')).recoverInterrupted(root);if(recovered.length)await startupRecord(root,'update-recovered',{versions:recovered});}catch(e){await startupRecord(root,'update-recovery-pending',{error:e.message});}await mkdir(process.env.OMT_STORAGE_PATH,{recursive:true});
 let existing;try{existing=await connect({root,restrito:true});}catch{}
 if(existing){try{const result=await existing.req('CallVendorRequest',{vendorName:'freemix',requestType:'get_interface',requestData:{}});const path=result.responseData?.executable;if(!path||resolve(path).toLowerCase()!==exe.toLowerCase())throw Error('Uma janela j� usa o controle desta instala��o. Feche-a pelo pr�prio 3Mix antes de atualizar.');const kinds=await existing.req('GetInputKindList');if(!kinds.inputKinds.includes('ndi_source'))throw Error('Esta janela j� est� aberta sem o NDI carregado. Feche-a pelo 3Mix e abra pelo atalho integrado para carregar o runtime validado; nenhuma janela foi reiniciada.');const info=await api();process.env.FREEMIX_API_PORT=String(info.port);let ready=false;for(let attempt=0;attempt<60;attempt++){const state=await stateResponse(info.port).then(r=>r.json());if(state.connected){ready=true;break;}await sleep(500);}if(!ready)throw Error('O 3Mix j� aberto ainda n�o conectou ao controle local.');await startupRecord(root,'launcher-reused',{apiPort:info.port,ndiLoaded:true});console.log('3Mix j� aberto; controle local conectado na porta '+info.port+'. Use a janela existente.'+(info.reopenMesa?' A porta do painel mudou. Reabra somente a Mesa/janela web pelo 3Mix para carregar o novo endere�o; o motor n�o foi reiniciado.':''));}finally{existing.close();}await releaseLock();process.exit(0);}
 const nativeList=execFileSync('tasklist.exe',['/FO','CSV'],{encoding:'utf8',windowsHide:true});
 const pids=nativeList.split(/\r?\n/).map(line=>line.match(/^"(?:FreeMix|3Mix|obs64)\.exe","(\d+)"/i)?.[1]).filter(Boolean);
 if(pids.length){
  const result=await run(join(root,'runtime/freemix-process-info.exe'),pids,{windowsHide:true,timeout:5000});
  const all=JSON.parse(result.stdout.trim());
  if(all.some(info=>!info.exited&&(!info.path||resolve(info.path).toLowerCase()===exe.toLowerCase())))throw Error('Esta instala��o j� est� aberta sem conex�o confirmada. Nenhuma janela foi alterada. Feche-a pelo pr�prio 3Mix antes de iniciar.');
 }
 // Independent startup window: only after ownership checks ruled out an existing instance.
 await mkdir(join(root,'config/obs-studio/plugin_config/freemix-control'),{recursive:true});
 splashState=join(root,'config/obs-studio/plugin_config/freemix-control','splash-'+process.pid+'.json');
 await reportSplash('preparing','Preparando o 3Mix…');
 const splash=spawn(join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',join(root,'ferramentas/splash.ps1'),'-StateFile',splashState],{cwd:root,windowsHide:true,detached:false,stdio:['ignore','pipe','pipe'],env:process.env});
 let splashFailure=null,splashOutput='';
 const captureSplash=chunk=>{splashOutput=(splashOutput+chunk.toString()).slice(-12000);};
 splash.stdout.on('data',captureSplash);splash.stderr.on('data',captureSplash);
 splash.on('error',error=>{splashFailure=error.message;});
 splash.on('exit',(code,signal)=>{splashFailure='PowerShell exit='+code+' signal='+(signal||'none');});splash.unref();
 // Wait for WPF ContentRendered before advancing startup; never stop the engine.
 const splashDeadline=Date.now()+10000;
 while(!existsSync(splashState+'.visible')&&!splashFailure&&Date.now()<splashDeadline)await sleep(100);
 if(!existsSync(splashState+'.visible')){await startupRecord(root,'splash-failed',{reason:splashFailure||'render-timeout',diagnostic:splashOutput});await writeFile(splashState+'.error.txt',splashOutput||splashFailure||'render-timeout','utf8');throw Error('A janela de abertura não confirmou exibição; motor não iniciado.');}
 splash.stdout.destroy();splash.stderr.destroy();
 const ndiRuntime=await prepareNdiRuntime(root);
 const prepared=await preparePortable(root);
 // The launcher lock and the process check above ensure no engine in this installation
 // can be using these files. No third-party DLL is loaded by this step.
 const pluginChanges=await applyPendingPlugins(root);
 if(pluginChanges.applied.length)await startupRecord(root,'plugins-applied',{plugins:pluginChanges.applied});
 const apiInfo=await (lifecycleQualification?startQualifiedApiBroker():api());prepared.apiPort=Number(apiInfo.port);process.env.FREEMIX_API_PORT=String(prepared.apiPort);
 const opening=await createUpdateOpening(root);
 await reportSplash('checking','Consultando atualizações…');
 let openingUpdate;
 try{
  const response=await fetch('http://127.0.0.1:'+prepared.apiPort+'/api/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'update_check',openingCheck:true}),signal:AbortSignal.timeout(20000)});
  const result=await response.json();if(!response.ok||!result.success)throw Error(result.error||'Consulta indisponível');openingUpdate=result.update;
 }catch(error){await startupRecord(root,'opening-update-unavailable',{error:error.message});}
 if(openingUpdate?.status==='available'){
  await reportSplash('update-available','Versão '+openingUpdate.version+' disponível',{opening:opening.id});
  let choice=null;const deadline=Date.now()+90000;
  while(Date.now()<deadline){
   try{const candidate=JSON.parse(await readFile(splashState+'.choice.json','utf8'));if(candidate.opening===opening.id&&['update','skip'].includes(candidate.action)){choice=candidate.action;break;}}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
   await sleep(200);
  }
  if(!choice)throw Error('Escolha Atualizar ou Ignorar nesta abertura. Nenhum motor foi iniciado.');
  await startupRecord(root,'opening-update-choice',{opening:opening.id,choice,version:openingUpdate.version});
  if(choice==='update'){
   await reportSplash('updating','Encaminhando atualização verificada…');
   const response=await fetch('http://127.0.0.1:'+prepared.apiPort+'/api/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'update_install'}),signal:AbortSignal.timeout(120000)});
   const result=await response.json();if(!response.ok||!result.success)throw Error(result.error||'Atualização não foi aceita');
   if(result.update?.status!=='installing')throw Error('Atualização não confirmou encaminhamento; consulte os logs.');
   await reportSplash('ready','Atualização encaminhada');await releaseLock();process.exit(0);
  }
 }

 await reportSplash('starting','Abrindo o motor de vídeo…');
 const app=spawn(exe,['--portable','--multi','--disable-updater','--disable-missing-files-check','--enable-media-stream',...(process.argv.includes('--safe-mode')?['--safe-mode']:[]),...(process.argv.includes('--disable-3p-plugins')?['--disable-3p-plugins']:[]),...(process.argv.includes('--bandeja')?['--minimize-to-tray']:[])],{cwd:join(root,'bin/64bit'),windowsHide:false,detached:true,stdio:'ignore',env:{...process.env,THREEMIX_QA_INTEGRATED_TITLEBAR:'1'}});let appError;app.on('error',e=>{appError=e;});app.unref();

 if(lifecycleQualification&&apiInfo.reused===false){
  const owner={reused:false,apiPid:apiInfo.pid,enginePid:app.pid,installationId:apiInfo.installationId,instanceId:randomUUID(),token:randomBytes(32).toString('hex')};
  const endpoint=[String.fromCharCode(92).repeat(2)+'.','pipe','3mix-lifecycle-'+randomUUID()].join(String.fromCharCode(92));
  app.ref();
  try{
   apiChildExit=watchApiChildExit(apiBroker,apiInfo.pid);
   const configured=await configureOwnedLifecycle(apiBroker,{endpoint,owner,expectedExe:exe});
   if(!configured)throw Error('O vínculo privado da API não foi confirmado; nenhum processo foi encerrado.');
   lifecycleCompletion=superviseOwnedEngine({child:app,owner,endpoint});
  }catch(error){
   app.unref();apiChildExit?.close();throw error;
  }
 }
 await startupRecord(root,'engine-spawned',{nativePid:app.pid,apiPort:prepared.apiPort,wsPort:prepared.wsPort});
 // Compatibility helper remains asynchronous. Its reused API is not stopped by a second helper.
 const helper=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',join(root,'ferramentas/ajudante.ps1')],{cwd:root,windowsHide:true,detached:true,stdio:'ignore',env:process.env});helper.on('error',()=>{});helper.unref();
 for(let attempt=0;attempt<90;attempt++){if(appError)throw appError;if(app.exitCode!=null||app.signalCode!=null)throw Error('O motor encerrou antes de confirmar prontidão; nenhum processo foi reiniciado.');try{const r=await stateResponse(prepared.apiPort);const state=await r.json();if(app.exitCode!=null||app.signalCode!=null)throw Error('O motor conectou, mas encerrou durante a consulta de prontidão.');if(r.ok&&state.connected){if(!state.buses&&!state.recording&&!state.streaming){if(state.busSetupError)throw Error('O motor conectou, mas os barramentos falharam: '+state.busSetupError);await sleep(500);continue;}const bridge=await connect({root,restrito:true});try{const kinds=await bridge.req('GetInputKindList');if(!kinds.inputKinds.includes('ndi_source'))throw Error('O motor conectou, mas DistroAV n�o carregou o runtime NDI validado. Consulte o log; a abertura n�o foi confirmada.');}finally{bridge.close();}if(app.exitCode!=null||app.signalCode!=null)throw Error('O motor conectou, mas encerrou durante a validação de prontidão.');await reportSplash('ready','3Mix pronto');await startupRecord(root,'launcher-ready',{nativePid:app.pid,apiPort:prepared.apiPort,ndiLoaded:true,buses:state.buses});await releaseLock();console.log(JSON.stringify({success:true,root,pid:app.pid,apiPort:prepared.apiPort,buses:state.buses,ndiRuntime,ndiLoaded:true,ready:true}));if(lifecycleCompletion){try{const outcome=await lifecycleCompletion;await startupRecord(root,'api-lifecycle-finished',{requested:outcome.requested,accepted:outcome.accepted===true});if(outcome.requested!==true||outcome.accepted!==true){console.error('3Mix: encerramento privado da API não confirmado.');process.exitCode=1;}}catch{console.error('3Mix: não foi possível registrar a conclusão do ciclo privado da API.');process.exitCode=1;}finally{if(apiChildExit){const apiExit=await apiChildExit.wait();apiChildExit.close();if(!apiExit.exited||apiExit.code!==0||apiExit.signal){console.error('3Mix: saída normal da API filha não confirmada.');process.exitCode=1;}}if(apiBroker?.connected)apiBroker.disconnect();if(apiBroker){const brokerExit=await waitOwnedProcessExit(apiBroker);if(!brokerExit.exited||brokerExit.code!==0){console.error('3Mix: saída normal do intermediário da API não confirmada.');process.exitCode=1;}}}if(process.exitCode===1)process.exit(1);}process.exit(0);}}catch(e){if(e.message.startsWith('O motor conectou'))throw e;}await sleep(500);}
 throw Error('O motor n�o confirmou a conex�o completa. Confira config/obs-studio/plugin_config/freemix-control/api-error.log.');
}catch(e){await reportSplash('failed',e.message).catch(()=>{});await startupRecord(root,'launcher-failed',{error:e.message}).catch(()=>{console.error('3Mix: não foi possível registrar a falha de abertura.');});console.error('3Mix: '+e.message);process.exitCode=1;
 // A readiness failure must not abandon a lifecycle already bound to our engine.
 // Release startup ownership while the operator closes that engine normally.
 await releaseLock();
 if(lifecycleCompletion){
  try{
   const outcome=await lifecycleCompletion;
   await startupRecord(root,'api-lifecycle-after-launch-failure',{requested:outcome.requested,accepted:outcome.accepted===true}).catch(()=>{console.error('3Mix: não foi possível registrar a limpeza após falha de abertura.');});
   if(outcome.requested!==true||outcome.accepted!==true)console.error('3Mix: limpeza privada após falha de abertura foi recusada ou não confirmada.');
   if(apiChildExit){
    const apiExit=await apiChildExit.wait();
    if(!apiExit.exited||apiExit.code!==0||apiExit.signal)console.error('3Mix: saída normal da API após falha de abertura não confirmada.');
   }
  }catch{console.error('3Mix: limpeza privada após falha de abertura não confirmada.');}
 }
}finally{apiChildExit?.close();if(apiBroker?.connected)apiBroker.disconnect();await releaseLock();}

