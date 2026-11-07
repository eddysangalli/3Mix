import {existsSync} from 'node:fs';
import {join} from 'node:path';
export function packageExecutable(root){
 for(const relative of ['bin/64bit/3Mix.exe','bin/64bit/FreeMix.exe']){
  if(existsSync(join(root,relative)))return relative;
 }
 throw Error('Pacote sem executável 3Mix (ou legado reconhecido)');
}
