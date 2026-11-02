// Explicit, separate beta kit. Never overlays an installation or opens a network.
import {readFile,writeFile,mkdir,cp,readdir,access} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve,join,dirname,basename} from 'node:path';
import {createHash,sign,verify} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const workspace=resolve('.'),build=join(process.env.TEMP,'FreeMix-QA-NativeAlpha-Final-Counters-Build');
const candidate=JSON.parse(await readFile('qa-finalizacao/candidate-release.json','utf8'));
assert(candidate.status==='PACKAGE_VERIFIED'||candidate.status==='SETUP_VERIFIED');
const stamp=new Date().toISOString().replace(/\D/g,'').slice(0,14),root=join(workspace,'entregas','FreeMix-Ponte-Alpha-Beta-'+stamp);
assert(!(await access(root).then(()=>true,()=>false)));
const digest=async file=>{const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');};
const exe=join(build,'FreeMix-Alpha-Bridge.exe'),expected='d75aa9b586f70d292e83c916e7a624b1d69634a85fdbcc3444d6be6e839432aa';assert.equal(await digest(exe),expected);
await mkdir(root,{recursive:true});
const copied=[],systems=new Set(),queue=[];
async function copy(src,name){const target=join(root,name);await mkdir(dirname(target),{recursive:true});await cp(src,target);copied.push({path:name,sha256:await digest(target)});return target;}
queue.push(await copy(exe,'runtime/FreeMix-Alpha-Bridge.exe'));
queue.push(await copy(join(candidate.packageRoot,'runtime/node.exe'),'runtime/node.exe'));
const ndiName='Processing.NDI.Lib.x64.dll';queue.push(await copy(join(candidate.packageRoot,'runtime/ndi-v6',ndiName),'runtime/ndi-v6/'+ndiName));
const redist='C:/Program Files/Microsoft Visual Studio/18/Community/VC/Redist/MSVC/14.51.36231/x64/Microsoft.VC145.CRT';
const dumpbin='C:/Program Files/Microsoft Visual Studio/18/Community/VC/Tools/MSVC/14.51.36231/bin/Hostx64/x64/dumpbin.exe';
const seen=new Set();
for(let i=0;i<queue.length;i++){
 const dependencies=execFileSync(dumpbin,['/dependents',queue[i]],{encoding:'utf8',windowsHide:true}).split(/\r?\n/).map(x=>x.trim()).filter(x=>/^[\w.-]+\.dll$/i.test(x));
 for(const name of dependencies){const key=name.toLowerCase();if(seen.has(key))continue;seen.add(key);let src;
  for(const base of [build,redist]){const files=await readdir(base);const match=files.find(f=>f.toLowerCase()===key);if(match){src=join(base,match);break;}}
  if(src){queue.push(await copy(src,'bin/64bit/'+basename(src)));continue;}
  assert(/^api-ms-win-|^ext-ms-win-/i.test(name)||await access(join(process.env.WINDIR,'System32',name)).then(()=>true,()=>false),'Missing dependency '+name);systems.add(name);
 }
}
for(const name of ['NDI SDK License Agreement.pdf','Processing.NDI.Lib.Licenses.txt','PROVENANCE.json','TERMS.md'])await copy(join(candidate.packageRoot,'licenses/ndi-runtime',name),'licenses/ndi-runtime/'+name);
for(const name of ['LICENSE-Node.txt','LICENSE-FFmpeg.txt'])await copy(join(candidate.packageRoot,'runtime',name),'licenses/'+name);
for(const name of ['alpha-bridge-nativo.mjs','ndi-runtime.mjs'])await copy('FreeMix/ferramentas/'+name,'ferramentas/'+name);
await copy('FreeMix/ferramentas/native-alpha-bridge/main.cpp','source/main.cpp');
await copy('FreeMix/LICENSE','licenses/LICENSE-FreeMix.txt');
for(const name of await readdir('freemix-app/frontend/widgets/vendor/freemix-ndi'))if(name.endsWith('.h'))await copy(join('freemix-app/frontend/widgets/vendor/freemix-ndi',name),'source/ndi/'+name);
await copy('FreeMix/docs/RECEPTOR-NATIVO-ALPHA.md','GUIA.md');
await copy('FreeMix/docs/evidencias-transportes-conclusao/resultado-native-alpha-endurance-20261009.json','evidencias/endurance.json');
await copy('FreeMix/docs/evidencias-transportes-conclusao/smoke-final-default-orchestrator.json','evidencias/smoke-final.json');
await writeFile(join(root,'ABRIR-PONTE-ALPHA.cmd'),'@echo off\r\nsetlocal\r\nchcp 65001 >nul\r\n"%~dp0runtime\\node.exe" "%~dp0ferramentas\\alpha-bridge-nativo.mjs" %*\r\npause\r\n');
await writeFile(join(root,'LEIA-ME.md'),"# Ponte alpha — beta separada\n\nExtraia este ZIP numa pasta nova e abra ABRIR-PONTE-ALPHA.cmd. Ele escuta somente 127.0.0.1:18460.\n\nNo FreeMix: Externo → SRT, x264/H.264, 4:2:0, cor+máscara lado a lado, Caller para 127.0.0.1:18460. No vMix: adicionar NDI → FreeMix SRT Alpha. A ponte reconstrói a transparência e envia áudio; não aplique recorte ou outro Luma Key nessa entrada.\n\nPara outra máquina, execute ABRIR-PONTE-ALPHA.cmd --host 0.0.0.0 e envie ao IP alcançável do receptor. Consulte GUIA.md. O kit não configura VPN, firewall ou NAT e não recebe OMT/HDR. Ctrl+C encerra apenas a ponte.\n\nNDI, FFmpeg, Node e o CRT app-local estão incluídos; não requer instalar um programa à parte. Requer Windows x64 suportado e um receptor NDI. Não é homologação de Windows limpo, vMix, câmera física ou WAN. Não altera a mesa e não envia diagnósticos.\n\nA endurance de 20 minutos pertence ao binário 3dcc8003; o smoke de 40 segundos pertence ao binário final d75aa9b5 deste kit, com descoberta NDI padrão e contadores separados. O receptor WebBrowser foi abortado.\n");
await writeFile(join(root,'source/BUILD.md'),'# Fontes\n\nmain.cpp é a ponte separada do repositório https://github.com/eddysangalli/3Mix (GPL-2.0-or-later). Compilar MSVCx64 C++17 /O2 /EHsc /MD com headers/include e libs/lib do obs-deps2026-07-15-x64 fixado pelo checkout FreeMix Native e source/ndi; link avformat.lib avcodec.lib avutil.lib swscale.lib swresample.lib. O SDK/runtimeNDI e suas condições estão em licenses/ndi-runtime. FFmpeg/Node: termos incluídos, fontes e receitas oficiais em https://github.com/obsproject/obs-deps e https://github.com/nodejs/node. CRT app-local vem exclusivamente da pasta redistribuível Microsoft.VC145.CRT14.51.36231x64 do VisualStudio Community instalado. Dependências e hashes exatos: manifest.json.\n');
const tests=[{args:[],exit:2},{args:['--input','srt://127.0.0.1:18961?mode=listener','--ndi-runtime',join(root,'runtime/missing.dll'),'--seconds','1'],exit:1}];
for(const test of tests){const r=spawnSync(join(root,'runtime/FreeMix-Alpha-Bridge.exe'),test.args,{env:{...process.env,PATH:join(root,'bin/64bit')},cwd:join(root,'runtime'),windowsHide:true,timeout:8000,encoding:'utf8'});assert.equal(r.error,undefined);assert.equal(r.status,test.exit,r.stderr);}
await cp('obs-vmix/update-public.pem',join(root,'update-public.pem'));
const files=[];async function walk(folder){for(const e of await readdir(folder,{withFileTypes:true})){const p=join(folder,e.name);assert(!e.isSymbolicLink());if(e.isDirectory())await walk(p);else files.push({path:p.slice(root.length+1).replaceAll('\\','/'),sha256:await digest(p)});}}await walk(root);
const raw=Buffer.from(JSON.stringify({format:1,kind:'freemix-native-alpha-beta',createdAt:new Date().toISOString(),binarySha256:expected,files,systemDependencies:[...systems].sort(),networkOpened:false,operatorTouched:false,limits:['Standalone beta, not integrated into full installer','20min evidence and final40s smoke have distinct EXE hashes','No physical/WAN/vMix/clean-Windows acceptance']},null,2));
const sig=sign(null,raw,await readFile('release-keys/ed25519-private.pem'));assert(verify(null,raw,await readFile('obs-vmix/update-public.pem'),sig));
await writeFile(join(root,'manifest.json'),raw);await writeFile(join(root,'manifest.sig'),sig);
const receipt={status:'PASS',root,exeSha256:expected,files:files.length,dependencyClosureVerified:true,isolatedCliExitCodes:[2,1],networkOpened:false,operatorTouched:false,at:new Date().toISOString()};await writeFile('qa-finalizacao/resultado-alpha-beta-kit.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
