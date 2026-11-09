import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isAbsolute} from 'node:path';
import {lstatSync} from 'node:fs';
import {join} from 'node:path';
export function packageExecutable(root){
 for(const relative of ['bin/64bit/3Mix.exe','bin/64bit/FreeMix.exe']){
  let info;
  try { info=lstatSync(join(root,relative)); }
  catch(error){if(error.code==='ENOENT')continue;throw error;}
  if(!info.isFile()||info.isSymbolicLink())throw Error('Executável do pacote deve ser arquivo regular, sem link: '+relative);
  return relative;
 }
 throw Error('Pacote sem executável 3Mix (ou legado reconhecido)');
}

export function packageFfmpegModule(root){
 for(const relative of ['core/obs-ffmpeg/obs-ffmpeg.dll','obs-plugins/64bit/obs-ffmpeg.dll']){
  let info;
  try{info=lstatSync(join(root,relative));}catch(error){if(error.code==='ENOENT')continue;throw error;}
  if(!info.isFile()||info.isSymbolicLink())throw Error('Módulo FFmpeg deve ser arquivo regular, sem link: '+relative);
  return relative;
 }
 throw Error('Pacote sem módulo nativo obs-ffmpeg');
}

export function validateNativePackage(root){
 const executable=packageExecutable(root);
 const ffmpegModule=packageFfmpegModule(root);
 const required=[executable,'bin/64bit/obs.dll','bin/64bit/obs-frontend-api.dll',ffmpegModule];
 for(const relative of required){
  let info;
  try{info=lstatSync(join(root,relative));}catch(error){if(error.code==='ENOENT')throw Error('Rundir nativo incompleto: '+relative);throw error;}
  if(!info.isFile()||info.isSymbolicLink())throw Error('Componente nativo inválido: '+relative);
 }
 return {executable,ffmpegModule,required};
}

// Copy-time predicate only. Never removes a file from its source installation.
export function legacyFfmpegReplaced(relativePath,nativeRoot){
 if(String(relativePath).split(String.fromCharCode(92)).join('/').toLowerCase()!=='obs-plugins/64bit/obs-ffmpeg.dll'||!nativeRoot)return false;
 try{const info=lstatSync(join(nativeRoot,'core/obs-ffmpeg/obs-ffmpeg.dll'));return info.isFile()&&!info.isSymbolicLink();}catch(e){if(e.code==='ENOENT')return false;throw e;}
}

export async function validateFrontendArtifact(source,expectedHash){
 if(typeof source!=='string'||!isAbsolute(source)||!(/^[a-f0-9]{64}$/i.test(expectedHash||'')))throw Error('Frontend exige origem absoluta e SHA256 explícito');
 const info=lstatSync(source);if(!info.isFile()||info.isSymbolicLink())throw Error('Frontend deve ser arquivo regular');
 const actual=createHash('sha256').update(await readFile(source)).digest('hex');if(actual!==expectedHash.toLowerCase())throw Error('Frontend diverge do recibo de build');
 return {source,sha256:actual,bytes:info.size};
}
