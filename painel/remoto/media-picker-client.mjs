// Single-flight native picker; no source creation or automatic retry on uncertain start.

export function createMediaPickerClient({request,wait=ms=>new Promise(r=>setTimeout(r,ms)),maxPolls=600}){

 let active=null,uncertain=false,token=null,operationKind=null;

 async function select(kind){

  if(!['video','audio'].includes(kind))throw Error('Tipo de mídia inválido');

  if(operationKind&&operationKind!==kind)throw Error('Há uma seleção de outro tipo pendente. Retome a seleção original antes de trocar o tipo de mídia.');

  if(active)return active;

  if(uncertain&&!token)throw Error('Seleção anterior com resultado incerto. Confira e feche a janela antes de iniciar outra operação.');

  active=(async()=>{

   uncertain=true;operationKind=kind;

   if(!token){
   const started=await request({action:'start',kind});

   if(started?.success===false){uncertain=false;operationKind=null;throw Error(started.error||'Seleção nativa recusada');}

   if(!started?.success||typeof started.token!=='string'||!started.token)throw Error(started?.error||'Seleção nativa não confirmada');

   token=started.token;
   }

   for(let i=0;i<maxPolls;i++){

    const result=await request({action:'status',token});

    if(!result?.success)throw Error(result?.error||'Não foi possível consultar a seleção');

    if(result.state==='cancelled'){uncertain=false;token=null;operationKind=null;return null;}
    if(result.state==='error'){uncertain=false;token=null;operationKind=null;throw Error(result.error||'O motor confirmou falha na seleção do arquivo.');}

    if(result.state==='selected'){

     if(typeof result.path!=='string'||!result.path)throw Error('Seleção sem caminho confirmado');

     uncertain=false;token=null;operationKind=null;return result.path;

    }

    if(result.state!=='pending')throw Error(result.error||'Estado de seleção inválido');

    await wait(250);

   }

   throw Error('A seleção ainda não foi confirmada. Não crie outro input; confira a janela aberta.');

  })();

  try{return await active;}finally{active=null;}

 }

 return {select};

}

