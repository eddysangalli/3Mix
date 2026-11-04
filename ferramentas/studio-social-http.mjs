// Roteador HTTP da frente 3MIX STUDIO & SOCIAL.
//
// Carregado opcionalmente por servidor-api.mjs, no mesmo padrão do mix-effects-http.mjs: se este
// arquivo não existir ou falhar ao importar, o servidor continua subindo sem as três trilhas.
// Toda rota de escrita é local (127.0.0.1). Nada aqui roda dentro do processo do motor: um erro de
// chroma, de cenário ou de rede social vira resposta HTTP, nunca queda do Programa.
const UUID=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const parseUrl=req=>new URL(req.url||'/', 'http://127.0.0.1');
const MODULE_PATHS=['/api/chroma','/api/chroma-frame','/api/studio','/api/studio-frame','/api/social'];

export async function handleStudioSocial(ctx){
 const {req,res,path,local,json,body,production}=ctx;
 if(!MODULE_PATHS.some(p=>path===p||path.startsWith(p+'/')))return false;
 const module=production.studioSocial;
 if(!module){json(res,503,{success:false,error:'Módulo Studio & Social não carregado neste processo'});return true;}
 const u=parseUrl(req);
 const isLocal=local(req);
 const key=u.searchParams.get('key')||'';
 const method=req.method;
 const deny=(message,code=403)=>{json(res,code,{success:false,error:message});return true;};
 const image=(buffer,contentType)=>{res.writeHead(200,{'Content-Type':contentType,'Cache-Control':'no-store','Content-Length':buffer.length});res.end(buffer);return true;};

 // ---------- 3Mix Chroma ----------
 if(path==='/api/chroma'){
  if(!isLocal)return deny('Chroma disponível somente neste computador');
  if(method==='GET'){
   if(key&&!UUID.test(key))return deny('Entrada inválida',400);
   if(!module.chroma)return deny('Chroma indisponível: '+(module.errors?.chroma||'módulo não montado'),503);
   return json(res,200,{success:true,chroma:await module.chroma.summary(key||undefined)}),true;
  }
  if(method==='POST'){
   const d=await body(req);
   const result=await module.execute(String(d.action||''),d);
   return json(res,200,{success:true,chroma:result,state:await module.chroma?.summary(d.key)}),true;
  }
  return deny('Método não suportado',405);
 }
 if(path==='/api/chroma-frame'){
  if(!isLocal)return deny('Chroma disponível somente neste computador');
  if(method!=='GET')return deny('Método não suportado',405);
  if(!UUID.test(key))return deny('Entrada inválida',400);
  if(!module.chroma)return deny('Chroma indisponível',503);
  if(u.searchParams.get('mode')==='raw'){
   const raw=await module.chroma.rawImage(key,960);
   return image(raw.buffer,raw.contentType);
  }
  const shot=await module.chroma.rawShot(key,960);
  return image(shot.buffer,shot.contentType);
 }

 // ---------- 3Mix Virtual Studio ----------
 if(path==='/api/studio'){
  if(!isLocal)return deny('Estúdio virtual disponível somente neste computador');
  if(!module.estudio)return deny('Estúdio virtual indisponível: '+(module.errors?.estudio||'módulo não montado'),503);
  if(method==='GET'){
   if(key&&!UUID.test(key))return deny('Entrada inválida',400);
   return json(res,200,{success:true,studio:await module.estudio.summary(key||undefined)}),true;
  }
  if(method==='POST'){
   const d=await body(req);
   const action=String(d.action||'');
   if(!action.startsWith('studio_'))return deny('Ação de estúdio virtual inválida',400);
   const result=await module.estudio.execute(action,d);
   return json(res,200,{success:true,result,state:await module.estudio.summary(d.key)}),true;
  }
  return deny('Método não suportado',405);
 }
 if(path==='/api/studio-frame'){
  if(!isLocal)return deny('Estúdio virtual disponível somente neste computador');
  if(method!=='GET')return deny('Método não suportado',405);
  if(!UUID.test(key))return deny('Entrada inválida',400);
  if(!module.estudio)return deny('Estúdio virtual indisponível',503);
  const shot=await module.estudio.shot(await module.estudio.frameTarget(key),960);
  return image(shot.buffer,shot.contentType);
 }

 // ---------- 3Mix Social ----------
 if(path==='/api/social'){
  if(!isLocal)return deny('Social disponível somente neste computador');
  if(!module.social)return deny('Módulo Social indisponível: '+(module.errors?.social||'não montado'),503);
  if(method==='GET'){
   const section=u.searchParams.get('section')||'all';
   return json(res,200,{success:true,social:module.social.summary(),list:module.social.list(section)}),true;
  }
  if(method==='POST'){
   const d=await body(req);
   const action=String(d.action||'');
   if(!action.startsWith('social_'))return deny('Ação Social inválida',400);
   const result=await module.social.execute(action,d);
   return json(res,200,{success:true,result,state:module.social.summary(),list:module.social.list('all')}),true;
  }
  return deny('Método não suportado',405);
 }

 return deny('Rota desconhecida',404);
}
