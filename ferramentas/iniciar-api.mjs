// Starts only this installation's local API. Never kills a process or takes another installation's port.
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {mkdir,open,readFile,lstat,rename,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {selectApiPort,persistApiPort} from './api-porta-local.mjs';
import {acquireStartupLock,startupRecord} from './recuperacao-inicializacao.mjs';
const root=resolve(process.env.FREEMIX_ROOT||fileURLToPath(new URL('../',import.meta.url)));
let configuredPort=8088;
try{const panelConfig=await readFile(join(root,'painel/local.js'),'utf8');const encoded=/window\.MESA_LOCAL\s*=\s*(\{[^;]+\})\s*;?/.exec(panelConfig);if(encoded){const config=JSON.parse(encoded[1]);if(config.replayUrl){const address=new URL(config.replayUrl);if(!['127.0.0.1','localhost'].includes(address.hostname)||address.protocol!=='http:')throw Error('O painel local precisa apontar para o controle local desta instalação.');configuredPort=Number(address.port||80);}}}catch(error){if(error.code!=='ENOENT')throw error;}
const explicitPort=!!process.env.FREEMIX_API_PORT;let port=Number(process.env.FREEMIX_API_PORT||configuredPort);
let configuredHost='127.0.0.1';try{const network=JSON.parse((await readFile(join(root,'config/obs-studio/plugin_config/freemix-control/network.json'),'utf8')).replace(/^\ufeff/,''));if(network.allowLan===true)configuredHost='0.0.0.0';}catch(e){if(e.code!=='ENOENT')throw e;}
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Porta do controle local inválida.');
const id=createHash('sha256').update(root.toLowerCase()).digest('hex');
let releaseLock=async()=>{};
async function health(candidate=port){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),1200);try{const response=await fetch('http://127.0.0.1:'+candidate+'/api/health',{signal:controller.signal});if(!response.ok)return null;const data=await response.json();return ['FreeMix','3Mix'].includes(data.app)&&data.installationId===id&&Number(data.port)===candidate?data:null;}catch{return null;}finally{clearTimeout(timer);}}
async function occupied(candidate){return new Promise(done=>{const server=net.createServer();server.once('error',()=>done(true));server.listen({host:process.env.FREEMIX_API_HOST||configuredHost,port:candidate},()=>server.close(()=>done(false)));});}
try{
 const req=createRequire(join(root,'package.json'));
 for(const name of ['ws','qrcode','exceljs'])req.resolve(name);
 await import(pathToFileURL(join(root,'ferramentas/controle-producao.mjs')));
 const websocket=JSON.parse(await readFile(join(root,'config/obs-studio/plugin_config/obs-websocket/config.json'),'utf8'));
 if(!websocket.server_enabled||!Number.isInteger(websocket.server_port)||websocket.server_port<1||websocket.server_port>65535)throw Error('O controle do motor nao esta configurado nesta instalacao.');
 if(process.argv.includes('--check')){console.log(JSON.stringify({success:true,dependenciesReady:true,websocketConfigured:true,apiPort:port}));process.exit(0);}
 releaseLock=await acquireStartupLock(root,{name:'api',timeoutMs:30000});await startupRecord(root,'api-dependencies-ready',{apiPort:port,wsPort:websocket.server_port});
 const selection=await selectApiPort({configuredPort:port,explicit:explicitPort,probe:async candidate=>{const current=await health(candidate);return{health:current,occupied:current?true:await occupied(candidate)};}});port=selection.port;
 let current=selection.health;
 if(current){const panelUrlChanged=await persistApiPort(root,port,current);await startupRecord(root,'api-reused',{apiPort:port,portChanged:selection.changed});console.log(JSON.stringify({...current,reused:true,portChanged:selection.changed,panelUrlChanged,previousPort:selection.previousPort,reopenMesa:panelUrlChanged}));await releaseLock();process.exit(0);}
 const logDir=join(root,'config/obs-studio/plugin_config/freemix-control');await mkdir(logDir,{recursive:true});
 // Rotate only at launch, after ownership/port checks; never touch a reused running API.
 for(const name of ['api','api-error']){const path=join(logDir,name+'.log'),info=await lstat(path).catch(()=>null);if(info?.isFile()&&!info.isSymbolicLink()&&info.size>8*1024*1024){try{const last=join(logDir,name+'.3.log');if((await lstat(last).catch(()=>null))?.isFile())await unlink(last);for(let n=2;n>=1;n--){const old=join(logDir,name+'.'+n+'.log');if((await lstat(old).catch(()=>null))?.isFile())await rename(old,join(logDir,name+'.'+(n+1)+'.log'));}await rename(path,join(logDir,name+'.1.log'));}catch{console.warn('FreeMix: log de lançamento ainda em uso, rotação adiada.');}}}
 const log=await open(join(logDir,'api.log'),'a'),errorLog=await open(join(logDir,'api-error.log'),'a');
 const child=spawn(process.execPath,[join(root,'ferramentas/servidor-api.mjs')],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',log.fd,errorLog.fd],env:{...process.env,FREEMIX_ROOT:root,FREEMIX_PANEL_DIR:join(root,'painel'),FREEMIX_API_PORT:String(port),FREEMIX_API_HOST:process.env.FREEMIX_API_HOST||configuredHost}});
 let launchError;child.once('error',error=>{launchError=error;});child.unref();await log.close();await errorLog.close();
 await startupRecord(root,'api-spawned',{apiPid:child.pid,apiPort:port,host:process.env.FREEMIX_API_HOST||configuredHost});
 for(let attempt=0;attempt<30;attempt++){if(launchError)throw launchError;current=await health();if(current){const panelUrlChanged=await persistApiPort(root,port,current);await startupRecord(root,'api-ready',{apiPid:child.pid,apiPort:port,portChanged:selection.changed});await releaseLock();console.log(JSON.stringify({...current,reused:false,portChanged:selection.changed,panelUrlChanged,previousPort:selection.previousPort,reopenMesa:panelUrlChanged}));process.exit(0);}await new Promise(r=>setTimeout(r,300));}
 throw Error('O servidor nao respondeu. Confira '+join(logDir,'api-error.log'));
}catch(error){await startupRecord(root,'api-failed',{error:error.message});console.error('3Mix: falha ao iniciar as janelas extras. '+error.message);process.exitCode=1;}finally{await releaseLock();}
