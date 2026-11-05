// Operator-owned paths remain excluded. Only explicit built-in GC code is updateable.
import path from 'node:path';
export function updateRoots(scriptDir){const repo=path.resolve(scriptDir,'../..');return {repo,ws:path.dirname(repo)};}
const gcCode=new Set(['core.js','modelos.js','modelos.mjs','render.js','render.mjs','player.mjs']);
export function excludedFromUpdate(value){
 const p=String(value).split(String.fromCharCode(92)).join('/');
 if(p.startsWith('/')||/^[a-z]:/i.test(p)||p.split('/').some(s=>s==='..'||s==='.'))return true;
 if(/^painel\/gc\/biblioteca\//i.test(p))return !gcCode.has(p.slice('painel/gc/biblioteca/'.length));
 return /^(config|gravacoes|capturas|originais|updates|projetos|logs|crashes|diagnosticos)\//i.test(p)||/^painel\/local\.js$/i.test(p)||/^painel\/gc\/(catalogo\.js$|gt_titles\/)/i.test(p)||/^(manifest\.json|manifest\.sig|hashes\.json|version\.json|installation\.json|portable_mode\.txt)$/i.test(p)||/\.(pdb|ilk|log|dmp|bak|salvo)$/i.test(p);
}

// Dependency traversal may legitimately use ../painel, but the final destination must
// still respect operator ownership after normalization.
export function dependencyUpdatePath(name){
 if(typeof name!=='string'||!name||name.includes(String.fromCharCode(92))||name.includes(':')||name.startsWith('/'))throw Error('Dependência de atualização inválida');
 const target=path.posix.normalize('ferramentas/'+name);
 if(excludedFromUpdate(target))throw Error('Dependência protegida na atualização: '+target);
 return target;
}

// Operational alpha instructions must travel with the implementation, not remain only
// in the development checkout. Internal evidence can still link out to larger receipts.
export const alphaReleaseDocuments=Object.freeze([
 'docs/PEDIDO-COMUNIDADE-ALPHA.md','docs/ALPHA-SUPLEMENTO-HARDWARE-VMIX30.md',
 'docs/MATRIZ-HARDWARE-HOMOLOGADO.md','docs/LIMITES-CONHECIDOS.md','docs/LEIA-ME-BETA.md'
]);


// A freeze is an integrity receipt, not merely a list of paths.
export function validateFrozenFile(entry, actualSize, actualHash){
 if(!entry || typeof entry.path!=='string' || !entry.path || excludedFromUpdate(entry.path))throw Error('Arquivo nativo inválido no freeze');
 const expectedSize=entry.bytes ?? entry.size;
 if(!Number.isSafeInteger(expectedSize)||expectedSize<0||typeof entry.sha256!=='string'||!/^[a-f0-9]{64}$/i.test(entry.sha256))throw Error('Recibo nativo incompleto: '+entry.path);
 if(actualSize!==expectedSize||actualHash.toLowerCase()!==entry.sha256.toLowerCase())throw Error('Binário diverge do freeze: '+entry.path);
}


// Panel-only payloads must never replace native binaries, dependencies or operator data.
export function panelOnlyUpdatePath(value){
 if(typeof value!=='string'||!value||excludedFromUpdate(value))return false;
 if(value.includes(String.fromCharCode(92))||value.includes(':')||value.split('/').some(part=>!part))return false;
 if(/\.(exe|dll|sys|pdb|lib|node)$/i.test(value))return false;
 return /^(painel|ferramentas)\//.test(value)||alphaReleaseDocuments.includes(value);
}
