import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join,dirname} from 'node:path';
export const workspaceDefaults=Object.freeze({cardWidth:180,audioLeft:false,modulesStacked:false,sideWidth:0});
const writers=new Map();
export function validateWorkspace(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['cardWidth','audioLeft','modulesStacked','sideWidth','dockTabs','expectedRevision'].includes(key)))throw Error('Campos de workspace inválidos');
 if(!Number.isInteger(value.cardWidth)||value.cardWidth<120||value.cardWidth>320)throw Error('Miniaturas: use um valor inteiro entre 120 e 320 px');
 if(typeof value.audioLeft!=='boolean'||typeof value.modulesStacked!=='boolean')throw Error('Organização dos módulos inválida');
 if(!Number.isInteger(value.sideWidth)||value.sideWidth<0||value.sideWidth>4000||(value.sideWidth>0&&value.sideWidth<280))throw Error('Largura lateral: automática (0) ou entre 280 e 4000 px');
 const result=Object.fromEntries(Object.keys(workspaceDefaults).map(key=>[key,value[key]]));
 if(value.dockTabs!==undefined){
  const ids=['list','replay','mixer','slides','dsk','rundown','ptz'],seen=new Set();
  if(!Array.isArray(value.dockTabs)||value.dockTabs.length!==2||value.dockTabs.some(tabs=>!Array.isArray(tabs)||tabs.some(id=>!ids.includes(id)||seen.has(id)||(seen.add(id),false))))throw Error('Abas dos docks inválidas ou duplicadas');
  result.dockTabs=value.dockTabs.map(tabs=>[...tabs]);
 }
 return result;
}
async function readWorkspace(file){
 try{const value=JSON.parse(await readFile(file,'utf8'));if(value.schema!==1||!Number.isInteger(value.revision)||value.revision<0)throw Error('Formato inválido');return {schema:1,revision:value.revision,...validateWorkspace(Object.fromEntries(Object.keys(workspaceDefaults).map(key=>[key,value[key]]))),...(value.dockTabs!==undefined?{dockTabs:validateWorkspace({...Object.fromEntries(Object.keys(workspaceDefaults).map(key=>[key,value[key]])),dockTabs:value.dockTabs}).dockTabs}:{}),exists:true};}
 catch(error){if(error.code==='ENOENT')return {schema:1,revision:0,...workspaceDefaults,exists:false};throw Error('Não foi possível ler o workspace salvo; o arquivo foi preservado.');}
}
export async function handleWorkspaceRequest({path,req,res,root,local,body,json,production}){
 if(path!=='/api/workspace')return false;
 if(!local(req)){json(res,403,{success:false,error:'Workspace disponível somente no computador do 3Mix'});return true;}
 const file=join(root,'config/3mix-workspace.json');
 if(req.method==='GET'){json(res,200,{success:true,workspace:await readWorkspace(file)});return true;}
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');json(res,405,{success:false,error:'Método inválido'});return true;}
 const data=await body(req),values=validateWorkspace(data);
 if(!Number.isInteger(data.expectedRevision)||data.expectedRevision<0)throw Error('Revisão do workspace não informada');
 const previous=writers.get(file)||Promise.resolve();
 const task=previous.catch(()=>{}).then(async()=>{
  const current=await readWorkspace(file);if(current.revision!==data.expectedRevision){json(res,409,{success:false,error:'O workspace foi alterado em outra janela. Atualize antes de aplicar.',revision:current.revision});return;}
  const saved={schema:1,revision:current.revision+1,...(current.dockTabs?{dockTabs:current.dockTabs}:{}),...values};await mkdir(dirname(file),{recursive:true});await writeFile(file+'.next',JSON.stringify(saved,null,2));await rename(file+'.next',file);
  await production.optional('BroadcastCustomEvent',{eventData:{freemix:{workspace:saved}}});
  json(res,200,{success:true,workspace:{...saved,exists:true}});
 });
 writers.set(file,task);try{await task;}finally{if(writers.get(file)===task)writers.delete(file);}return true;
}
