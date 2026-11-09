// Structural evidence checks only: never certifies hardware or validates claimed measurements.
export function validarReciboAlpha(d){
 const errors=[];
 if(!d||typeof d!=='object'||Array.isArray(d))return ['Recibo deve ser objeto'];
 if(d.format!==1)errors.push('Formato inválido');
 if(!['PASSOU','FALHOU','NAO_TESTADO','BLOQUEADO'].includes(d.status))errors.push('Estado inválido');
 if(d.status==='PASSOU'){
  for(const [name,value] of Object.entries({version:d.release?.version,engineVersion:d.release?.engineVersion,model:d.equipment?.model,mission:d.mission}))if(typeof value!=='string'||!value.trim())errors.push('Campo obrigatório: '+name);
  if(!/^[a-f0-9]{64}$/i.test(d.release?.installerSha256||''))errors.push('SHA-256 ausente ou inválido');
  if(!Array.isArray(d.executedSteps)||!d.executedSteps.length||d.executedSteps.some(x=>typeof x!=='string'||!x.trim()))errors.push('Passos executados ausentes');
  if(!Array.isArray(d.evidence)||!d.evidence.length||d.evidence.some(x=>typeof x!=='string'||!x.trim()))errors.push('Evidências ausentes');
  if(!Number.isFinite(d.durationSeconds)||d.durationSeconds<=0)errors.push('Duração medida ausente');
  if(d.normalReopenVerified!==true)errors.push('Reabertura normal não confirmada');
  if(d.originalStateRestored!==true)errors.push('Restauração não confirmada');
  if(d.privacyReviewed!==true)errors.push('Revisão de privacidade pendente');
 }
 return errors;
}

import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==3)throw Error('Uso: node ferramentas/validar-recibo-alpha.mjs CAMINHO_JSON');
  const bytes=await readFile(resolve(process.argv[2]));if(bytes.length>1048576)throw Error('Recibo excede 1 MiB');
  const data=JSON.parse(bytes.toString('utf8'));const errors=validarReciboAlpha(data);
  console.log(JSON.stringify({structurallyValid:!errors.length,hardwareHomologated:false,status:data?.status,errors},null,2));
  if(errors.length)process.exitCode=1;
 }catch(e){console.error(e.message);process.exitCode=1;}
}
