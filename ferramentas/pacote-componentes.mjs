import {readFile,lstat,mkdir,copyFile} from 'node:fs/promises';
import {isAbsolute,join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const safeTarget=target=>{
 if(typeof target!=='string'||target.includes(String.fromCharCode(92))||target.includes(':')||[...target].some(c=>c.charCodeAt(0)<32))return false;
 const parts=target.split('/');if(parts.some(p=>!p||p==='.'||p==='..'||/[ .]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:[.]|$)/i.test(p)))return false;
 if(/^(?:obs-plugins\/64bit\/[a-zA-Z0-9_-]+\.dll|licenses\/[a-zA-Z0-9_/.-]+)$/.test(target))return true;
 if(parts[0]!=='3mix-plugins'||!/^[a-zA-Z0-9_-]+$/.test(parts[1]||''))return false;
 return parts.length===3&&parts[2]===parts[1]+'.dll'||parts.length>3&&parts[2]==='data'&&!/\.(exe|dll|sys|com|bat|cmd|ps1|pdb)$/i.test(parts.at(-1));
};

async function rejectLinkedAncestors(value){
 for(let current=resolve(value);;current=dirname(current)){
  try{if((await lstat(current)).isSymbolicLink())throw Error('Link em destino de componente');}catch(e){if(e.code!=='ENOENT')throw e;}
  if(dirname(current)===current)break;
 }
}

// Rebuilt third-party components and their source/licenses are staged into
// a new package only. The source installation is never overwritten.
export async function inspectPackageComponents(manifestPath) {
  if(!manifestPath)return [];
  if(!isAbsolute(manifestPath))throw Error('Manifesto de componentes deve ser absoluto');
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  if(manifest.format!==1||!Array.isArray(manifest.files)||!manifest.files.length||manifest.files.length>4096)throw Error('Manifesto de componentes inválido');
  const targets=new Set();
  for(const file of manifest.files) {
    if(!safeTarget(file.target)||targets.has(file.target.toLowerCase()))throw Error('Destino de componente inválido/duplicado');
    targets.add(file.target.toLowerCase());
    if(typeof file.source!=='string'||!isAbsolute(file.source)||!(/^[a-f0-9]{64}$/.test(file.sha256)))throw Error('Componente exige origem absoluta e SHA256');
    if(typeof file.component!=='string'||typeof file.sourceVersion!=='string')throw Error('Componente sem proveniência');
    const info=await lstat(file.source);
    if(!info.isFile()||info.isSymbolicLink()||info.size>256*1024*1024)throw Error('Origem de componente inválida');
    if(digest(await readFile(file.source))!==file.sha256)throw Error('Hash de componente divergiu: '+file.target);
  }
  return manifest.files;
}

export async function copyPackageComponents(newPackage,files) {
  const receipt=[];
  // Refuse ambiguous packages before copying anything; never delete legacy files implicitly.
  const destinations=new Set();
  for(const file of files){
    const key=typeof file.target==='string'?file.target.toLowerCase():'';
    if(destinations.has(key))throw Error('Destino de componente duplicado');
    destinations.add(key);
    if(!safeTarget(file.target))throw Error('Destino de componente inválido');
    await rejectLinkedAncestors(join(newPackage,file.target));
    const match=/^3mix-plugins\/([^/]+)\/[^/]+[.]dll$/.exec(file.target);
    if(!match)continue;
    const names=match[1]==='color-monitor'?['color-monitor','obs-color-monitor']:[match[1]];
    for(const name of names){
      const legacy=join(newPackage,'obs-plugins/64bit',name+'.dll');
      try{await lstat(legacy);throw Error('Plugin duplicado no pacote: '+name+'; preserve e exclua explicitamente a cópia legada antes do overlay');}catch(e){if(e.code!=='ENOENT')throw e;}
    }
  }
  for(const file of files){
    if(typeof file.source!=='string'||!isAbsolute(file.source)||!(/^[a-f0-9]{64}$/.test(file.sha256||'')))throw Error('Componente exige origem absoluta e SHA256');
    const info=await lstat(file.source);
    if(!info.isFile()||info.isSymbolicLink()||info.size>256*1024*1024)throw Error('Origem de componente inválida');
    if(digest(await readFile(file.source))!==file.sha256)throw Error('Hash de componente divergiu: '+file.target);
  }
  for(const file of files) {
    // Keep validation here too; callers cannot bypass inspect with traversal.
    if(!safeTarget(file.target))throw Error('Destino de componente inválido');
    const target=join(newPackage,file.target);await rejectLinkedAncestors(target);await mkdir(dirname(target),{recursive:true});await rejectLinkedAncestors(target);
    await copyFile(file.source,target);
    if(digest(await readFile(target))!==file.sha256)throw Error('Componente mudou durante a cópia: '+file.target);
    receipt.push({target:file.target,sha256:file.sha256,component:file.component,sourceVersion:file.sourceVersion});
  }
  return receipt;
}

// Pure copy filter: excludes duplicates only when their managed replacement is explicit.
export function legacyPluginReplaced(relativePath,files){
 const normalized=String(relativePath).split(String.fromCharCode(92)).join('/').toLowerCase();
 const ids=new Set(files.map(f=>/^3mix-plugins\/([^/]+)\/([^/]+)[.]dll$/.exec(f.target)).filter(m=>m&&m[1]===m[2]).map(m=>m[1].toLowerCase()));
 for(const id of ids){const aliases=id==='color-monitor'?['color-monitor','obs-color-monitor']:[id];if(aliases.some(name=>normalized==='obs-plugins/64bit/'+name+'.dll'))return true;}
 return false;
}
