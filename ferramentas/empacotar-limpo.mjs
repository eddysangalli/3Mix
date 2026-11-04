// Builds a NEW distribution from an explicit allowlist. Never copies operator config/recordings.
import {cp,mkdir,readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join,resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {runtimeDependencyClosure} from './pacote-dependencias.mjs';
import {inspectPackageComponents,copyPackageComponents} from './pacote-componentes.mjs';
import {prepareNdiRuntime,NDI_DLL} from './ndi-runtime.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url))),workspace=dirname(root);
const runtimeRoot=existsSync(join(root,'runtime/ndi-v6'))?root:(existsSync(join(workspace,'3mix-runtime/runtime/ndi-v6'))?join(workspace,'3mix-runtime'):root);
if(process.argv.slice(2).some(arg=>arg!=='--check'))throw Error('Opção desconhecida; use --check para conferir sem gerar pacote');
const checkOnly=process.argv.includes('--check');
const sourceRoot=process.env.FREEMIX_SOURCE_ROOT?resolve(process.env.FREEMIX_SOURCE_ROOT):(existsSync(join(workspace,'FreeMix/fork/manifest.json'))?join(workspace,'FreeMix'):root);
const nativeSources=JSON.parse(await readFile(join(sourceRoot,'fork/manifest.json'),'utf8'));
const version=process.env.FREEMIX_PACKAGE_VERSION||nativeSources.version||('0.1.0-local.'+new Date().toISOString().replace(/\D/g,'').slice(0,14));
if(!/^(?:0\.1\.0-local\.\d{14}|\d+\.\d+\.\d+-(?:alpha|beta))$/.test(version))throw Error('Versão inválida: '+version);
const dest=join(workspace,'entregas','3Mix-Completo-'+version);if(existsSync(dest))throw Error('Destino já existe; não substituir entrega');
const nativeRundir=process.env.FREEMIX_NATIVE_RUNDIR?resolve(process.env.FREEMIX_NATIVE_RUNDIR):null;
const nativeCommit=process.env.FREEMIX_NATIVE_COMMIT||null;
if(nativeCommit&&!/^[a-f0-9]{40}$/i.test(nativeCommit))throw Error('Commit nativo inválido');
if(nativeRundir&&(!nativeCommit||!existsSync(join(nativeRundir,'bin/64bit/FreeMix.exe'))))throw Error('Rundir nativo explícito exige EXE e commit correspondentes');
if(nativeSources.version!==version)throw Error('Versão do manifesto de fontes diferente do pacote; exporte as fontes para a versão solicitada');
if(nativeCommit&&nativeSources.head!==nativeCommit)throw Error('Fontes e commit do Native são diferentes');
for(const patch of nativeSources.patches){const file=join(sourceRoot,'fork',patch.path);if(createHash('sha256').update(await readFile(file)).digest('hex')!==patch.sha256)throw Error('Patch nativo divergente: '+patch.path);}
// Schema 2 includes local submodule commits; validate their patches and source snapshots too.
if(nativeSources.sourceSchema===2)execFileSync(process.execPath,[join(sourceRoot,'scripts/reconstruir-motor.mjs'),'--check'],{windowsHide:true,stdio:'pipe',maxBuffer:4*1024*1024});
const runtimeTools=['midia-preview-http.mjs','replay-preview.mjs','recuperacao-importacao.mjs','recuperacao-inicializacao.mjs','recuperacao-saidas.mjs','saidas-hdr.mjs','omt-hdr-producao.mjs','recuperacao-estados.mjs','audio-buses-producao.mjs','efeitos-producao.mjs','sinais-producao.mjs','replay-sincronia.mjs','controller-osc.mjs','multi-rtmp-adapter.mjs','atualizacao-online.mjs','gc-assets.mjs','gerar-biblioteca-gc.mjs','composicao-advanced-masks.mjs','plugins-defaults.mjs',"capacidades-motor.mjs","composicao-presets.mjs","composicao-fundo.mjs","gc-biblioteca-producao.mjs",'composicao-locutor.mjs','composicao-estilos.mjs','automacao-operacional.mjs','recuperacao-inventario.mjs','recuperacao-dependencias.mjs','preferencias-producao.mjs','atalhos-globais.mjs','abrir-configuracoes.ps1','ajudante.ps1','splash.ps1','preparar.ps1','fechar.ps1','importar-gt-dialog.ps1','importar-gt-packs.mjs','gtzip_converter.mjs','gt_utils.mjs','gerar-catalogo-gc.mjs','servidor-api.mjs','iniciar-api.mjs','obsws.mjs','replay-disco.mjs','controle-producao.mjs','entradas-producao.mjs','configuracoes-producao.mjs','calls-producao.mjs','audio-routing-producao.mjs','retornos-calls.mjs','fontes-dados.mjs','clonar-preset.mjs','iniciar-freemix.mjs','preparar-portatil.mjs','macros-producao.mjs','recuperacao-producao.mjs','saidas-producao.mjs','sessao-producao.mjs','controlador-producao.mjs','fila-producao.mjs','bonding-producao.mjs','instalar-portatil.mjs','src/FreeMixNetworkSetup.cs','configurar-rede.ps1','ndi-producao.mjs','omt-producao.mjs','src/FreeMixProcessInfo.cs','verificar-atualizacoes.mjs','verificar-atualizacoes.ps1','atualizar-freemix.mjs','atualizar-freemix.ps1','empacotar.ps1','empacotar-limpo.mjs','audio-tap-registry.mjs','crew-intercom-producao.mjs','crew-intercom-transport-ws.mjs','crew-tally-producao.mjs','croma-producao.mjs','estudio-virtual.mjs','freed-bridge.mjs','social-producao.mjs','social-twitch.mjs','studio-social-engine.mjs','studio-social-http.mjs','preflight-producao.mjs','blackbox-producao.mjs','midia-imagem.mjs','disco-producao.mjs'];
runtimeTools.push('coletar-diagnostico.mjs');
const runtimeModules=await runtimeDependencyClosure(join(root,'ferramentas'),runtimeTools,{copiedModuleRoots:[join(root,'painel')]});
const componentOverlays=await inspectPackageComponents(process.env.FREEMIX_PLUGIN_MANIFEST);
await prepareNdiRuntime(runtimeRoot,{env:{},writeReceipt:false});
if(checkOnly){console.log(JSON.stringify({status:'SOURCE_READY',version,nativeCommit,nativePatches:nativeSources.patches.length,runtimeModules:runtimeModules.length,componentOverlays:componentOverlays.length,destinationCreated:false,operatorTouched:false}));process.exit(0);}
await mkdir(dest,{recursive:true});
const filter=p=>!p.replaceAll('\\','/').includes('/painel/gc/biblioteca/assets/')&&!p.replaceAll('\\','/').endsWith('/painel/gc/biblioteca/assets')&&!/(?:^|[\\/])(?:originais|gt_titles|ndi-v6|logs|crashes|profiler_data)(?:[\\/]|$)/i.test(p)&&!/(?:^|[\\/])qa-[^\\/]+\.(?:dll|exe)$/i.test(p)&&!/(?:\.pdb|\.ilk|\.log|\.dmp|\.anterior\.exe|\.bak|\.salvo|stdout\.txt|stderr\.txt)$/i.test(p);
for(const folder of ['bin','data','obs-plugins','plugins-audio','assets','painel','node_modules','firmware','extensao-social'])if(existsSync(join(root,folder)))await cp(join(root,folder),join(dest,folder),{recursive:true,filter});else if(existsSync(join(runtimeRoot,folder)))await cp(join(runtimeRoot,folder),join(dest,folder),{recursive:true,filter});
// Overlay only the NEW package, never the operator installation.
if(nativeRundir)for(const folder of ['bin','data','obs-plugins'])if(existsSync(join(nativeRundir,folder)))await cp(join(nativeRundir,folder),join(dest,folder),{recursive:true,filter});
const rebuiltComponents=await copyPackageComponents(dest,componentOverlays);
await mkdir(join(dest,'data/obs-plugins/obs-browser'),{recursive:true});
await cp(join(root,'painel/recursos/erro-browser.html'),join(dest,'data/obs-plugins/obs-browser/error.html'));
await mkdir(join(dest,'ferramentas'),{recursive:true});
for(const f of runtimeModules){await mkdir(dirname(join(dest,'ferramentas',f)),{recursive:true});await cp(existsSync(join(root,'ferramentas',f))?join(root,'ferramentas',f):join(runtimeRoot,'ferramentas',f),join(dest,'ferramentas',f));}for(const folder of ['licenses','docs'])if(existsSync(join(root,folder)))await cp(join(root,folder),join(dest,folder),{recursive:true,filter});else if(existsSync(join(runtimeRoot,folder)))await cp(join(runtimeRoot,folder),join(dest,folder),{recursive:true,filter});
await cp(join(sourceRoot,'fork'),join(dest,'fork'),{recursive:true,filter});
await mkdir(join(dest,'scripts'),{recursive:true});await cp(join(sourceRoot,'scripts/reconstruir-motor.mjs'),join(dest,'scripts/reconstruir-motor.mjs'));
await cp(join(sourceRoot,'docs/BUILD-FROM-SOURCE.md'),join(dest,'docs/BUILD-FROM-SOURCE.md'));
// Manuais da entrega vêm da fonte: a instalação pode ter versões antigas (ex.: manual do operador sem o DUMP).
for(const f of ['LEIA-ME-BETA.md','GUIA-RAPIDO.md','LIMITES-CONHECIDOS.md','SOLICITAR-SUPORTE.md','CHANGELOG.md','MANUAIS.md','API.md','EULA.txt','THIRD-PARTY-NOTICES.txt'])if(existsSync(join(sourceRoot,'docs',f)))await cp(join(sourceRoot,'docs',f),join(dest,'docs',f));
for(const d of ['docs/capturas/manual','docs/capturas/3mix','docs/api','painel/docs/usuario'])if(existsSync(join(sourceRoot,d)))await cp(join(sourceRoot,d),join(dest,d),{recursive:true,filter});
await cp(join(sourceRoot,'docs/native-source'),join(dest,'docs/native-source'),{recursive:true,filter});
for(const f of ['package.json','package-lock.json','componentes.json','portable_mode.txt','LEIA-ME.md','VALIDACAO.md','FONTES.md','Iniciar Mesa.cmd','Empacotar.cmd','Verificar Complementos.cmd','Atualizar Complementos.cmd','update-public.pem'])if(existsSync(join(root,f)))await cp(join(root,f),join(dest,f));else if(existsSync(join(runtimeRoot,f)))await cp(join(runtimeRoot,f),join(dest,f));

await cp(existsSync(join(root,'INSTALAR-FREEMIX.cmd'))?join(root,'INSTALAR-FREEMIX.cmd'):(existsSync(join(runtimeRoot,'INSTALAR-3MIX.cmd'))?join(runtimeRoot,'INSTALAR-3MIX.cmd'):join(runtimeRoot,'INSTALAR-FREEMIX.cmd')),join(dest,'INSTALAR-3MIX.cmd'));
await writeFile(join(dest,'3Mix Studio.cmd'),'@echo off\r\nsetlocal\r\nchcp 65001 >nul\r\ntitle 3Mix Studio\r\nset "FREEMIX_ROOT=%~dp0"\r\n"%~dp0runtime\\node.exe" "%~dp0ferramentas\\iniciar-freemix.mjs" %*\r\nif errorlevel 1 pause\r\nexit /b\r\n');
await writeFile(join(dest,'Atualizar 3Mix.cmd'),(await readFile(existsSync(join(root,'Atualizar FreeMix.cmd'))?join(root,'Atualizar FreeMix.cmd'):join(runtimeRoot,'Atualizar 3Mix.cmd'),'utf8')).replaceAll('FreeMix.cmd','3Mix.cmd').replaceAll('Feche o FreeMix','Feche o 3Mix'));
await writeFile(join(dest,'CONFIGURAR-REDE-3MIX.cmd'),'@echo off\r\nsetlocal\r\n"%~dp0runtime\\freemix-network-setup.exe" --root "%~dp0" %*\r\npause\r\n');
await writeFile(join(dest,'COLETAR-LOGS.cmd'),'@echo off\r\nsetlocal\r\nchcp 65001 >nul\r\n"%~dp0runtime\\node.exe" "%~dp0ferramentas\\coletar-diagnostico.mjs" "%~dp0." --mostrar\r\npause\r\n');
for(const f of ['CONTINUAR.md','PENDENCIAS.md','PENDENCIAS-REAIS.md','ENTREGA-ATUAL.md'])if(existsSync(join(workspace,'docs',f)))await cp(join(workspace,'docs',f),join(dest,'docs',f));
await mkdir(join(dest,'runtime'),{recursive:true});await cp(existsSync(join(root,'runtime/node.exe'))?join(root,'runtime/node.exe'):join(runtimeRoot,'runtime/node.exe'),join(dest,'runtime/node.exe'));await cp(existsSync(join(root,'runtime/LICENSE-Node.txt'))?join(root,'runtime/LICENSE-Node.txt'):join(runtimeRoot,'runtime/LICENSE-Node.txt'),join(dest,'runtime/LICENSE-Node.txt'));
await cp(existsSync(join(root,'runtime/freemix-process-info.exe'))?join(root,'runtime/freemix-process-info.exe'):join(runtimeRoot,'runtime/freemix-process-info.exe'),join(dest,'runtime/freemix-process-info.exe'));await cp(existsSync(join(root,'runtime/freemix-network-setup.exe'))?join(root,'runtime/freemix-network-setup.exe'):join(runtimeRoot,'runtime/freemix-network-setup.exe'),join(dest,'runtime/freemix-network-setup.exe'));
await mkdir(join(dest,'runtime/ndi-v6'),{recursive:true});await cp(existsSync(join(root,'runtime/ndi-v6',NDI_DLL))?join(root,'runtime/ndi-v6',NDI_DLL):join(runtimeRoot,'runtime/ndi-v6',NDI_DLL),join(dest,'runtime/ndi-v6',NDI_DLL));
await prepareNdiRuntime(dest,{env:{},writeReceipt:false});
for(const name of ['ffmpeg','ffprobe']){
 const path=process.env['FREEMIX_'+name.toUpperCase()]||(existsSync(join(root,'runtime',name+'.exe'))?join(root,'runtime',name+'.exe'):null)||(existsSync(join(runtimeRoot,'runtime',name+'.exe'))?join(runtimeRoot,'runtime',name+'.exe'):null)||execFileSync('where.exe',[name],{encoding:'utf8'}).trim().split(/\r?\n/)[0];
 if(!path)throw Error(name+' ausente');await cp(path,join(dest,'runtime',name+'.exe'));
}
await writeFile(join(dest,'runtime/LICENSE-FFmpeg.txt'),execFileSync(join(dest,'runtime/ffmpeg.exe'),['-L'],{encoding:'utf8',windowsHide:true}));
const componentFile=join(dest,'componentes.json'),metadata=JSON.parse(await readFile(componentFile,'utf8'));
for(const c of metadata.componentes){c.sha256={};for(const file of c.arquivos)if(existsSync(join(dest,file)))c.sha256[file]=createHash('sha256').update(await readFile(join(dest,file))).digest('hex');}
const runtimeFiles=['bin/64bit/FreeMix.exe','bin/64bit/obs.dll','bin/64bit/obs-frontend-api.dll','runtime/node.exe','runtime/ffmpeg.exe','runtime/ffprobe.exe','runtime/ndi-v6/'+NDI_DLL,'obs-plugins/64bit/obs-ffmpeg.dll'],runtimeHashes={};
for(const file of runtimeFiles)runtimeHashes[file]=createHash('sha256').update(await readFile(join(dest,file))).digest('hex');
metadata.runtimeLocal={arquivos:runtimeFiles,sha256:runtimeHashes,node:execFileSync(join(dest,'runtime/node.exe'),['--version'],{encoding:'utf8',windowsHide:true}).trim(),ffmpeg:execFileSync(join(dest,'runtime/ffmpeg.exe'),['-version'],{encoding:'utf8',windowsHide:true}).split(/\r?\n/)[0],npm:{ws:'8.22.0',qrcode:'1.5.4',exceljs:'4.4.0'},nativeCommit,nativeBuildSource:nativeRundir?'explicit-rundir':'existing-installation',nativePatchSource:'fork/manifest.json',runtimeModules};
metadata.rebuiltComponents=rebuiltComponents;
await writeFile(componentFile,JSON.stringify(metadata,null,2));
let catalog=await readFile(join(dest,'painel/gc/catalogo.js'),'utf8');let models=JSON.parse(catalog.slice(catalog.indexOf('[')).replace(/;\s*$/,''));models=models.filter(x=>x.collection!=='Importados');await writeFile(join(dest,'painel/gc/catalogo.js'),'window.GC_CATALOG = '+JSON.stringify(models,null,2)+';\n');
const cfg=join(dest,'config/obs-studio');await mkdir(join(cfg,'basic/profiles/Estudio'),{recursive:true});await mkdir(join(cfg,'basic/scenes'),{recursive:true});await mkdir(join(cfg,'plugin_config/obs-websocket'),{recursive:true});
await mkdir(join(cfg,'themes'),{recursive:true});await cp(join(root,'painel/tema-padrao.ovt'),join(cfg,'themes/Yami_MesaDeCorte.ovt'));
await cp(join(root,'ferramentas/restaurar-layout.ps1'),join(dest,'ferramentas/restaurar-layout.ps1'));await cp(join(root,'ferramentas/atualizar-e-reabrir.ps1'),join(dest,'ferramentas/atualizar-e-reabrir.ps1'));await cp(join(root,'Restaurar Visual FreeMix.cmd'),join(dest,'Restaurar Visual 3Mix.cmd'));
const visual=JSON.parse(await readFile(join(root,'painel/layout-padrao.json'),'utf8'));
const base=root.replaceAll('\\','/');
await writeFile(join(cfg,'global.ini'),'[General]\nFirstRun=true\nEnableAutoUpdates=false\nLanguage=pt-BR\n\n[Video]\nRenderer=Direct3D 11\n\n[Locations]\nConfiguration=../../config\nSceneCollections=../../config\nProfiles=../../config\nPluginManagerSettings=../../config\n');
await writeFile(join(cfg,'user.ini'),'[General]\nFirstRun=true\nEnableAutoUpdates=false\nLanguage=pt-BR\n\n[BasicWindow]\nPreviewProgramMode=true\nSwapScenesMode=true\nPreviewEnabled=true\nExtraBrowserDocks='+JSON.stringify([{title:'Menu',url:'file:///'+base+'/painel/topbar.html',uuid:'20bf6dbdbaf74e81a157e4f7f1621f8f'},{title:'Mesa',url:'file:///'+base+'/painel/mesa.html',uuid:'10bf6dbdbaf74e81a157e4f7f1621f8e'}])+'\n\n[Basic]\nProfile=Estudio\nProfileDir=Estudio\nSceneCollection=3Mix\nSceneCollectionFile=3Mix.json\n');
await writeFile(join(cfg,'basic/profiles/Estudio/basic.ini'),'[General]\nName=Estudio\n\n[Video]\nBaseCX=1920\nBaseCY=1080\nOutputCX=1280\nOutputCY=720\nFPSType=0\nFPSCommon=30\n\n[Output]\nMode=Simple\n\n[SimpleOutput]\nRecEncoder=x264\nRecQuality=Small\nRecFormat2=mkv\nFilePath='+base+'/gravacoes\n\n[Audio]\nSampleRate=48000\nChannelSetup=Stereo\n');
await writeFile(join(cfg,'basic/scenes/3Mix.json'),JSON.stringify({name:'3Mix',current_scene:'CAM 1',current_program_scene:'CAM 1',scene_order:[{name:'CAM 1'}],sources:[{name:'Fundo',id:'color_source_v3',settings:{color:4280631310,width:1920,height:1080}},{name:'CAM 1',id:'scene',settings:{items:[{name:'Fundo',visible:true,locked:false,pos:{x:0,y:0},scale:{x:1,y:1},rot:0,align:5,bounds_type:0,bounds:{x:0,y:0},crop_left:0,crop_top:0,crop_right:0,crop_bottom:0,id:1}],id_counter:1}}],transitions:[],transition:'Fade',transition_duration:500},null,2));
await writeFile(join(cfg,'plugin_config/obs-websocket/config.json'),JSON.stringify({server_enabled:true,server_port:4466,auth_required:true,server_password:'FIRST-LAUNCH-GENERATES-NEW-SECRET',alerts_enabled:false}));
let userIni=await readFile(join(cfg,'user.ini'),'utf8');userIni=userIni.replace('[BasicWindow]\n','[BasicWindow]\nDockState='+visual.dockState+'\ngeometry='+visual.geometry+'\nShowContextToolbars=false\nShowStatusBar=false\nSideDocks=false\nDocksLocked=true\n');userIni+='\n[Appearance]\nTheme=local.mesadecorte.Yami\n';await writeFile(join(cfg,'user.ini'),userIni);
const {pluginDefaults}=await import('./plugins-defaults.mjs');const freshCollectionFile=join(cfg,'basic/scenes/3Mix.json');await writeFile(freshCollectionFile,JSON.stringify(pluginDefaults(JSON.parse(await readFile(freshCollectionFile,'utf8')),{advancedSceneSwitcher:existsSync(join(dest,'obs-plugins/64bit/advanced-scene-switcher.dll')),cloudCaptions:existsSync(join(dest,'obs-plugins/64bit/obs_google_caption_plugin.dll'))}).collection,null,2));
 await writeFile(join(cfg,'raiz.txt'),root);await writeFile(join(dest,'painel/local.js'),'// Gerado na primeira inicialização pelo preparar.ps1.\n');
await writeFile(join(dest,'config/suporte.json'),JSON.stringify({destino:'WhatsApp do Eddy'},null,2));
await writeFile(join(dest,'LEIA-ME.md'),'# 3Mix\n\nVersão alpha para testes. As instruções estão em LEIA-ME-ALPHA.txt.\n\nFontes: https://github.com/eddysangalli/3Mix\n');
await writeFile(join(dest,'LEIA-ME-ALPHA.txt'),'3Mix - versão alpha para testes\r\n\r\nCOMO ABRIR\r\n1. Extraia este ZIP inteiro para uma pasta sua, por exemplo Documentos\\3Mix. Não abra de dentro do ZIP.\r\n2. Dê dois cliques em "3Mix Studio.cmd".\r\n3. Se o Windows mostrar "O Windows protegeu o computador", clique em "Mais informações" e em "Executar assim mesmo". Esta versão ainda não tem assinatura digital.\r\n\r\nDEU ERRO?\r\nNo 3Mix: menu > Relatar problema. Escreva o que você estava fazendo e gere o pacote de diagnóstico.\r\nSe o 3Mix nem abrir: dê dois cliques em "COLETAR-LOGS.cmd".\r\nMande o arquivo ZIP gerado para o Eddy no WhatsApp.\r\n\r\nO pacote traz logs e dados técnicos do computador, sem suas gravações. Veja o conteúdo antes de enviar, se quiser.\r\n');
await mkdir(join(dest,'gravacoes'),{recursive:true});await writeFile(join(dest,'version.json'),JSON.stringify({version,createdAt:new Date().toISOString(),channel:/-alpha$/.test(version)?'alpha':/-beta$/.test(version)?'beta':'local-candidate'}));
const files={};async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())await walk(p);else files[relative(dest,p).replaceAll('\\','/')]=createHash('sha256').update(await readFile(p)).digest('hex');}}
await walk(dest);await writeFile(join(dest,'hashes.json'),JSON.stringify({version,files},null,2));
await mkdir(join(workspace,'qa-finalizacao'),{recursive:true});await writeFile(join(workspace,'qa-finalizacao/ultima-entrega.json'),JSON.stringify({version,root:dest},null,2));console.log(JSON.stringify({version,root:dest,fileCount:Object.keys(files).length}));
