import {stat} from 'node:fs/promises';
import {join} from 'node:path';
export async function selectDependencyRoot(source,runtime){
 for(const root of [...new Set([source,runtime])]){
  try{if((await stat(join(root,'node_modules/ws/package.json'))).isFile())return root;}
  catch(error){if(!['ENOENT','ENOTDIR'].includes(error.code))throw error;}
 }
 throw Error('Dependencias de distribuicao ausentes: node_modules/ws/package.json');
}
