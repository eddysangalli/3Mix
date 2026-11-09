import {lstat} from 'node:fs/promises';import {resolve,relative,dirname,isAbsolute} from 'node:path';
export async function validarDestinoQa(root,value){
 const base=resolve(root,'qa-finalizacao'),dest=resolve(value),rel=relative(base,dest);
 if(!rel||rel==='..'||rel.startsWith('..'+String.fromCharCode(92))||rel.startsWith('../')||isAbsolute(rel))throw Error('Destino QA deve ser subpasta de qa-finalizacao');
 let current=dest;
 while(true){try{const info=await lstat(current);if(info.isSymbolicLink())throw Error('Link em ancestral do destino QA');if(current===dest)throw Error('Destino QA deve ser novo');if(!info.isDirectory())throw Error('Ancestral QA não é diretório');}catch(e){if(e.code!=='ENOENT')throw e;}
 const parent=dirname(current);if(parent===current)break;current=parent;
 }
 return dest;
}
