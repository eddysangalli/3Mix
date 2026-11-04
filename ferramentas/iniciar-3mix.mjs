// One entry point: installation preparation, local control, engine, then readiness check.
import {execFile,execFileSync,spawn} from 'node:child_process';import {promisify} from 'node:util';
import {existsSync} from 'node:fs';import {fileURLToPath} from 'node:url';import {resolve,join} from 'node:path';import {stat,readFile,mkdir} from 'node:fs/promises';
import {connect,sleep} from './obsws.mjs';import {preparePortable} from './preparar-portatil.mjs';
import {prepareNdiRuntime} from './ndi-runtime.mjs';
import {acquireStartupLock,startupRecord} from './recuperacao-inicializacao.mjs';
const run=promisify(execFile),root=resolve(process.env.FREEMIX_ROOT||fileURLToPath(new URL('../',import.meta.url))),exe=(existsSync(join(root,'bin/64bit/3Mix.exe'))?join(root,'bin/64bit/3Mix.exe'):join(root,'bin/64bit/FreeMix.exe'));
process.env.FREEMIX_ROOT=root;
// Process-local runtime paths: never change the computer's global environment.
process.env.OMT_STORAGE_PATH=join(root,'config/omt');
let releaseLock=async()=>{};
async function stateResponse(port){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),2000);try{const response=await fetch('http://127.0.0.1:'+port+'/api/json',{signal:controller.signal}),data=await response.json();return {ok:response.ok,json:async()=>data};}finally{clearTimeout(timer);}}
async function api(check=false){const result=await run(process.execPath,[join(root,'ferramentas/iniciar-api.mjs'),...(check?['--check']:[])],{windowsHide:true,env:process.env,timeout:45000});return JSON.parse(result.stdout.trim());}
try{
 await stat(exe);await stat(join(root,'painel/mesa.html'));
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
 const ndiRuntime=await prepareNdiRuntime(root);
 const prepared=await preparePortable(root),apiInfo=await api();prepared.apiPort=Number(apiInfo.port);process.env.FREEMIX_API_PORT=String(prepared.apiPort);
 const app=spawn(exe,['--portable','--multi','--disable-updater','--disable-missing-files-check','--enable-media-stream',...(process.argv.includes('--bandeja')?['--minimize-to-tray']:[])],{cwd:join(root,'bin/64bit'),windowsHide:true,detached:true,stdio:'ignore'});let appError;app.on('error',e=>{appError=e;});app.unref();
 await startupRecord(root,'engine-spawned',{nativePid:app.pid,apiPort:prepared.apiPort,wsPort:prepared.wsPort});
 // Compatibility helper remains asynchronous. Its reused API is not stopped by a second helper.
 const helper=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',join(root,'ferramentas/ajudante.ps1')],{cwd:root,windowsHide:true,detached:true,stdio:'ignore',env:process.env});helper.on('error',()=>{});helper.unref();
 for(let attempt=0;attempt<90;attempt++){if(appError)throw appError;try{const r=await stateResponse(prepared.apiPort);const state=await r.json();if(r.ok&&state.connected){if(!state.buses&&!state.recording&&!state.streaming){if(state.busSetupError)throw Error('O motor conectou, mas os barramentos falharam: '+state.busSetupError);await sleep(500);continue;}const bridge=await connect({root,restrito:true});try{const kinds=await bridge.req('GetInputKindList');if(!kinds.inputKinds.includes('ndi_source'))throw Error('O motor conectou, mas DistroAV n�o carregou o runtime NDI validado. Consulte o log; a abertura n�o foi confirmada.');}finally{bridge.close();}await startupRecord(root,'launcher-ready',{nativePid:app.pid,apiPort:prepared.apiPort,ndiLoaded:true,buses:state.buses});await releaseLock();console.log(JSON.stringify({success:true,root,pid:app.pid,apiPort:prepared.apiPort,buses:state.buses,ndiRuntime,ndiLoaded:true,ready:true}));process.exit(0);}}catch(e){if(e.message.startsWith('O motor conectou'))throw e;}await sleep(500);}
 throw Error('O motor n�o confirmou a conex�o completa. Confira config/obs-studio/plugin_config/freemix-control/api-error.log.');
}catch(e){await startupRecord(root,'launcher-failed',{error:e.message});console.error('3Mix: '+e.message);process.exitCode=1;}finally{await releaseLock();}

