import {lstatSync} from 'node:fs';
import {join} from 'node:path';
export function packageExecutable(root){
 for(const relative of ['bin/64bit/3Mix.exe','bin/64bit/FreeMix.exe']){
  let info;
  try { info=lstatSync(join(root,relative)); }
  catch(error){if(error.code==='ENOENT')continue;throw error;}
  if(!info.isFile()||info.isSymbolicLink())throw Error('Execut√°vel do pacote deve ser arquivo regular, sem link: '+relative);
  return relative;
 }
 throw Error('Pacote sem execut√°vel 3Mix (ou legado reconhecido)');
}

export function packageFfmpegModule(root){
 for(const relative of ['core/obs-ffmpeg/obs-ffmpeg.dll','obs-plugins/64bit/obs-ffmpeg.dll']){
  let info;
  try{info=lstatSync(join(root,relative));}catch(error){if(error.code==='ENOENT')continue;throw error;}
  if(!info.isFile()||info.isSymbolicLink())throw Error('MÛdulo FFmpeg deve ser arquivo regular, sem link: '+relative);
  return relative;
 }
 throw Error('Pacote sem mÛdulo nativo obs-ffmpeg');
}
