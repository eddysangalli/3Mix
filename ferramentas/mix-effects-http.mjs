// Shared route handler: exercised through real HTTP in the isolated QA harness.
export async function handleMixEffects({req,res,path,local,authorized,originAllowed,json,body,mixes}){
 if(!['/api/mix-effects','/api/mix-effects/check'].includes(path))return false;
 if(!originAllowed(req)||!(authorized?authorized(req):local(req))){json(res,403,{success:false,error:'M/E: dispositivo não autorizado ou origem recusada'});return true;}
 const checking=path.endsWith('/check');
 if(req.method!==(checking?'POST':'GET')){json(res,405,{success:false});return true;}
 const result=checking?await mixes.reconcile(await body(req)):await mixes.read();
 json(res,200,{success:true,...result});return true;
}
