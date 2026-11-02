// Explicit standalone native tool. No operator API connection or scene edits.
import {spawn} from 'node:child_process';
import {resolve,join,dirname,delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';
import {access,mkdir} from 'node:fs/promises';
import {prepareNdiRuntime,NDI_DLL} from './ndi-runtime.mjs';
export function bridgeOptions(args=[]){
 const options={port:18460,host:'127.0.0.1',name:'3Mix SRT Alpha',latencyMs:120};
 for(let i=0;i<args.length;i++){const key=args[i];if(!['--port','--host','--name','--latency-ms'].includes(key)||i+1>=args.length)throw Error('Use --port, --host, --name, --latency-ms');const value=args[++i];if(key==='--port')options.port=Number(value);if(key==='--host')options.host=value;if(key==='--name')options.name=value;if(key==='--latency-ms')options.latencyMs=Number(value);}
 if(!Number.isInteger(options.port)||options.port<1024||options.port>65535)throw Error('Porta inválida');
 if(!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(options.host)||options.host.split('.').some(n=>Number(n)>255))throw Error('Informe IP local IPv4 ou 0.0.0.0 para receber externamente');
 if(!options.name.trim()||options.name.length>100||/[\x00-\x1f]/.test(options.name))throw Error('Nome NDI inválido');
 if(!Number.isInteger(options.latencyMs)||options.latencyMs<40||options.latencyMs>5000)throw Error('Latência de 40 até 5000 ms');
 return {...options,url:`srt://${options.host}:${options.port}?mode=listener&latency=${options.latencyMs*1000}`};
}
export async function runBridge(args=process.argv.slice(2),root=resolve(dirname(fileURLToPath(import.meta.url)),'..')){
 const options=bridgeOptions(args),exe=join(root,'runtime/FreeMix-Alpha-Bridge.exe'),env={...process.env};
 await access(exe).catch(()=>{throw Error('Receptor nativo não incluído nesta instalação. Instale a entrega que inclui FreeMix-Alpha-Bridge.exe.');});
 await prepareNdiRuntime(root,{env,writeReceipt:false});
 // FFmpeg/MSVC dependencies already belong to the application bin directory.
 // Resolve them for this process only; never change the system PATH.
 env.PATH=join(root,'bin/64bit')+delimiter+(env.PATH||'');
 const folder=join(root,'logs/alpha-bridge');await mkdir(folder,{recursive:true});const receipt=join(folder,`sessao-${Date.now()}.json`);
 console.log(`Receptor SRT: ${options.url}\nNo FreeMix: Externo → SRT → cor+máscara lado a lado, 4:2:0, x264. Envie como Caller ao IP desta máquina e porta ${options.port}.\nNo vMix: adicionar entrada NDI chamada ${options.name}. Transparência e áudio vêm nessa entrada. Ctrl+C encerra somente este receptor.\nDiagnóstico: ${receipt}`);
 const child=spawn(exe,['--input',options.url,'--ndi-runtime',join(env.NDI_RUNTIME_DIR_V6,NDI_DLL),'--name',options.name,'--receipt',receipt],{cwd:join(root,'runtime'),env,stdio:'inherit',windowsHide:true});
 child.once('error',e=>{console.error(e.message);process.exitCode=1;});
 // Windows console Ctrl+C reaches both processes; allow normal native cleanup.
 process.on('SIGINT',()=>{});child.once('exit',code=>{process.exitCode=code??1;});return child;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))runBridge().catch(e=>{console.error(e.message);process.exitCode=1;});
