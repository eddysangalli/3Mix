// Frente 3MIX STUDIO & SOCIAL — agregador das três trilhas.
// Uma única instância por processo de controle; as três compartilham o mesmo projeto (scope),
// o mesmo motor (obs-websocket) e os mesmos artefatos de cena/fonte do 3Mix.
//
// Falha ao construir qualquer trilha não derruba as outras: a trilha que falhar fica indisponível
// com a mensagem do erro, e a mesa continua operando.
import {ChromaEngine} from './croma-producao.mjs';
import {StudioEngine} from './estudio-virtual.mjs';
import {SocialEngine} from './social-producao.mjs';

export function createStudioSocial(production){
 const module={
  chroma:null,estudio:null,social:null,errors:{},
  ready:false,
  scope:null,
  async setScope(scope){
   if(module.scope===scope&&module.ready)return;
   module.scope=scope;
   for(const [name,engine] of [['chroma',module.chroma],['estudio',module.estudio],['social',module.social]]){
    if(!engine)continue;
    try{await engine.setScope(scope);delete module.errors[name];}
    catch(e){module.errors[name]=e.message;}
   }
   module.ready=true;
  },
  async summary(key){
   const result={};
   if(module.chroma)result.chroma=await module.chroma.summary(key).catch(e=>({error:e.message}));
   if(module.estudio)result.studio=await module.estudio.summary(key).catch(e=>({error:e.message}));
   if(module.social)result.social=module.social.summary();
   if(Object.keys(module.errors).length)result.errors={...module.errors};
   return result;
  },
  async execute(action,d={}){
   const text=String(action);
   if(text.startsWith('chroma_')){if(!module.chroma)throw Error('Chroma indisponível: '+module.errors.chroma);return module.chroma.execute(text,d);}
   if(text.startsWith('studio_')){if(!module.estudio)throw Error('Estúdio virtual indisponível: '+module.errors.estudio);return module.estudio.execute(text,d);}
   if(text.startsWith('social_')){if(!module.social)throw Error('Social indisponível: '+module.errors.social);return module.social.execute(text,d);}
   throw Error('Ação de Studio & Social inválida: '+action);
  }
 };
 try{module.chroma=new ChromaEngine(production);}catch(e){module.errors.chroma=e.message;}
 try{module.estudio=new StudioEngine(production);}catch(e){module.errors.estudio=e.message;}
 try{module.social=new SocialEngine(production);}catch(e){module.errors.social=e.message;}
 return module;
}
