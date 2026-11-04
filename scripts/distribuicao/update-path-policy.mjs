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
