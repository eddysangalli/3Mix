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
