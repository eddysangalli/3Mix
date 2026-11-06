// Uses the original OBS DeckLink output; only advertised devices/modes/keyers.
#pragma once
#include "FreeMixVideoTransports.hpp"
#include "FreeMixAudioRouting.hpp"
#include <obs-frontend-api.h>
#include <string>
#include <memory>
#include <callback/proc.h>
namespace freemix_sdi {
inline OBSDataAutoRelease Settings(obs_data_t *config){OBSDataAutoRelease s=obs_data_create();obs_data_set_string(s,"device_hash",obs_data_get_string(config,"deviceHash"));obs_data_set_int(s,"mode_id",obs_data_get_int(config,"modeId"));obs_data_set_int(s,"keyer",obs_data_get_int(config,"keyer"));obs_data_set_bool(s,"force_sdr",!obs_data_get_bool(config,"hdr"));obs_data_set_bool(s,"freemix_hdr",obs_data_get_bool(config,"hdr"));obs_data_set_string(s,"hdr_transfer",obs_data_get_string(config,"hdrTransfer"));OBSDataAutoRelease m=obs_data_get_obj(config,"hdrMetadata");if(m)obs_data_set_obj(s,"hdr_metadata",m);obs_data_set_bool(s,"auto_start",false);return s;}
inline std::string HdrPreflight(obs_data_t *config,bool (*isPrivate)(obs_source_t *),obs_data_t *proof){
 if(obs_data_get_int(config,"audioTrack")<0||obs_data_get_int(config,"audioTrack")>2)return "Áudio HDR deve ser Master/A/B ou bus público";
 if(obs_data_get_int(config,"keyer")||obs_data_get_bool(config,"alpha")||obs_data_get_bool(config,"fillKey"))return "HDR SDI é opaco: alpha e keyer Fill+Key são incompatíveis";
 OBSSourceAutoRelease source=obs_get_source_by_uuid(obs_data_get_string(config,"sourceUuid"));if(!source||isPrivate(source))return "Selecione uma fonte HDR pública por UUID";
 const auto space=obs_source_get_color_space(source,0,nullptr);if(space!=GS_CS_709_EXTENDED&&space!=GS_CS_709_SCRGB)return "A fonte não declara HDR/float; SDR não pode ser rotulado PQ/HLG";
 const auto w=obs_source_get_width(source),h=obs_source_get_height(source);if(!w||!h||w>7680||h>4320)return "Dimensões da fonte HDR inválidas";
 const std::string audioUuid=obs_data_get_string(config,"audioSourceUuid");if(!audioUuid.empty()){OBSSourceAutoRelease audio=obs_get_source_by_uuid(audioUuid.c_str());if(!FreeMixAudioBusAllowed(audio))return "Áudio independente deve ser um bus público com tracks globais desligadas";}
 OBSDataAutoRelease settings=Settings(config);calldata_t call;calldata_init(&call);calldata_set_ptr(&call,"config",settings.Get());calldata_set_ptr(&call,"response",proof);
 const bool found=proc_handler_call(obs_get_proc_handler(),"freemix_decklink_hdr_preflight",&call);calldata_free(&call);
 if(!found)return "Plugin/driver DeckLink não inicializou ou esta versão não expõe o contrato HDR. Verifique Desktop Video/placa e a versão do FreeMix";
 if(!obs_data_get_bool(proof,"success"))return obs_data_get_string(proof,"error");
 if(obs_data_get_int(proof,"width")<=0||obs_data_get_int(proof,"height")<=0||obs_data_get_int(proof,"width")>7680||obs_data_get_int(proof,"height")>4320||obs_data_get_int(proof,"fpsNum")<=0||obs_data_get_int(proof,"fpsDen")<=0)return "Driver retornou dimensões/FPS HDR inválidos";
 return "";
}
inline OBSOutputAutoRelease &Output(){static OBSOutputAutoRelease value;return value;}
inline obs_view_t *&View(){static obs_view_t *value=nullptr;return value;}
inline OBSSceneAutoRelease &Scene(){static OBSSceneAutoRelease value;return value;}
inline std::unique_ptr<FreeMixSourceAudio> &Audio(){static std::unique_ptr<FreeMixSourceAudio> value;return value;}
inline void Stop(){if(Output()&&obs_output_active(Output()))obs_output_force_stop(Output());Output()=nullptr;Audio().reset();if(View()){obs_view_remove(View());obs_view_set_source(View(),0,nullptr);obs_view_destroy(View());View()=nullptr;}Scene()=nullptr;}
inline std::string Path(){char *folder=obs_frontend_get_current_profile_path();const std::string path=folder?std::string(folder)+"/freemix-sdi.json":"";bfree(folder);return path;}
inline void Request(obs_data_t *request,obs_data_t *response,bool (*isPrivate)(obs_source_t *)){
 const std::string action=obs_data_get_string(request,"action"),path=Path();OBSDataAutoRelease config=path.empty()?nullptr:obs_data_create_from_json_file(path.c_str());if(!config)config=obs_data_create();
 std::string error;const bool active=Output()&&obs_output_active(Output());OBSDataAutoRelease hdrProof=obs_data_create();
 if(action=="configure"){
  if(active)error="Pare SDI antes de configurar";
  else{OBSDataAutoRelease proposed=obs_data_get_obj(request,"config");if(!proposed)error="Configuração SDI ausente";else{
   OBSDataAutoRelease transports=FreeMixRefreshVideoTransportInventory(),deck=obs_data_get_obj(transports,"decklink");OBSDataArrayAutoRelease devices=obs_data_get_array(deck,"devices");bool valid=false;
   for(size_t n=0;n<obs_data_array_count(devices);n++){OBSDataAutoRelease device=obs_data_array_item(devices,n);if(std::string(obs_data_get_string(device,"hash"))!=obs_data_get_string(proposed,"deviceHash"))continue;OBSDataArrayAutoRelease modes=obs_data_get_array(device,obs_data_get_bool(proposed,"hdr")?"hdrModes":"modes"),keyers=obs_data_get_array(device,"keyers");bool mode=false,key=false;for(size_t i=0;i<obs_data_array_count(modes);i++){OBSDataAutoRelease v=obs_data_array_item(modes,i);mode|=obs_data_get_int(v,"value")==obs_data_get_int(proposed,"modeId");}for(size_t i=0;i<obs_data_array_count(keyers);i++){OBSDataAutoRelease v=obs_data_array_item(keyers,i);key|=obs_data_get_int(v,"value")==obs_data_get_int(proposed,"keyer");}valid=mode&&key;}
   OBSSourceAutoRelease selected=obs_get_source_by_uuid(obs_data_get_string(proposed,"sourceUuid"));
   if(selected&&isPrivate(selected))error="SDI recusado: fonte contém áudio privado";
   else if(!obs_data_get_bool(deck,"inventorySnapshotUsable")||!obs_data_get_bool(deck,"inventoryProbeAccepted"))error="Inventário SDI desconhecido, contexto alterado ou sondagem inconclusiva; consulte placas e modos explicitamente";
   else if(!valid)error="Dispositivo, modo FPS ou keyer SDI não anunciado pelo driver";
   else if(obs_data_get_bool(proposed,"hdr"))error=HdrPreflight(proposed,isPrivate,hdrProof);
   else if(obs_data_get_int(proposed,"audioTrack")<0||obs_data_get_int(proposed,"audioTrack")>2)error="Áudio SDI deve ser Master/A/B ou UUID de bus isolado";
   if(error.empty()){config=obs_data_get_obj(request,"config");obs_data_erase(config,"active");obs_data_set_bool(config,"autoStart",false);if(path.empty()||!obs_data_save_json_safe(config,path.c_str(),"tmp","bak"))error="Não foi possível salvar configuração SDI no perfil";}
  }}
 }else if(action=="start"){
  if(!active){OBSDataAutoRelease validate=obs_data_create(),validated=obs_data_create();obs_data_set_string(validate,"action","configure");obs_data_set_obj(validate,"config",config);Request(validate,validated,isPrivate);if(!obs_data_get_bool(validated,"success"))error=obs_data_get_string(validated,"error");
   if(error.empty()){Stop();OBSDataAutoRelease settings=Settings(config);const bool hdr=obs_data_get_bool(config,"hdr");video_t *video=obs_get_video();const std::string uuid=obs_data_get_string(config,"sourceUuid"),audioUuid=obs_data_get_string(config,"audioSourceUuid");
    if(hdr)error=HdrPreflight(config,isPrivate,hdrProof);
    if(error.empty()&&!uuid.empty()){OBSSourceAutoRelease source=obs_get_source_by_uuid(uuid.c_str());obs_video_info info={};if(!source||!obs_get_video_info(&info))error="Fonte SDI ausente";else{
     info.base_width=info.output_width=obs_source_get_width(source);info.base_height=info.output_height=obs_source_get_height(source);info.output_format=VIDEO_FORMAT_BGRA;info.colorspace=VIDEO_CS_709;info.range=VIDEO_RANGE_FULL;
     if(hdr){info.output_width=uint32_t(obs_data_get_int(hdrProof,"width"));info.output_height=uint32_t(obs_data_get_int(hdrProof,"height"));info.fps_num=uint32_t(obs_data_get_int(hdrProof,"fpsNum"));info.fps_den=uint32_t(obs_data_get_int(hdrProof,"fpsDen"));info.output_format=VIDEO_FORMAT_P416;info.colorspace=std::string(obs_data_get_string(config,"hdrTransfer"))=="hlg"?VIDEO_CS_2100_HLG:VIDEO_CS_2100_PQ;info.range=VIDEO_RANGE_PARTIAL;}
     if(!info.base_width||!info.base_height||info.base_width>7680||info.base_height>4320)error="Dimensões SDI inválidas";
     else{obs_source_t *renderSource=source.Get();if(!hdr){Scene()=obs_scene_create_private("FreeMix SDI scene");if(!obs_scene_add(Scene(),source))error="Não foi possível criar cena SDI";else renderSource=obs_scene_get_source(Scene());}
      if(error.empty()){View()=obs_view_create();if(!View())error="View SDI indisponível";else{obs_view_set_source(View(),0,renderSource);video=obs_view_add2(View(),&info);if(!video)error="View SDI indisponível";}}
     }
    }}
    if(error.empty()&&!audioUuid.empty())Audio()=FreeMixSourceAudio::Open(audioUuid,"FreeMix SDI PCM",error);
    if(error.empty()){Output()=obs_output_create("decklink_output","FreeMix SDI Output",settings,nullptr);if(!Output())error="Plugin DeckLink indisponível";else{obs_output_set_media(Output(),video,Audio()?Audio()->Audio():obs_get_audio());obs_output_set_mixers(Output(),Audio()?1ULL:1ULL<<uint32_t(obs_data_get_int(config,"audioTrack")));if(!obs_output_start(Output()))error="Driver não iniciou SDI; confira dispositivo e modo/FPS";}}
    if(!error.empty())Stop();
   }
  }
 }else if(action=="refresh"){
  if(active)error="Pare SDI antes de consultar placas e modos";
  else{OBSDataAutoRelease transports=FreeMixRefreshVideoTransportInventory(),deck=obs_data_get_obj(transports,"decklink");if(!obs_data_get_bool(deck,"inventorySnapshotUsable")||!obs_data_get_bool(deck,"inventoryProbeAccepted"))error="Sondagem SDI inconclusiva ou contexto alterado; inventário não confirmado";}
 }else if(action=="preflight"){OBSDataAutoRelease proposed=obs_data_get_obj(request,"config");auto *c=proposed?proposed.Get():config.Get();
  if(active)error="Pare SDI antes de verificar fonte e driver";
  else if(!obs_data_get_bool(c,"hdr"))error="Preflight HDR requer HDR habilitado";
  else{OBSDataAutoRelease transports=FreeMixRefreshVideoTransportInventory(),deck=obs_data_get_obj(transports,"decklink");if(!obs_data_get_bool(deck,"inventorySnapshotUsable")||!obs_data_get_bool(deck,"inventoryProbeAccepted"))error="Inventário SDI desconhecido, contexto alterado ou sondagem inconclusiva";else error=HdrPreflight(c,isPrivate,hdrProof);}
 }else if(action=="stop")Stop();else if(action!="state")error="Ação SDI inválida";
 obs_data_set_obj(response,"hdrPreflight",hdrProof);obs_data_set_bool(response,"hdrAlphaSupported",false);obs_data_set_bool(response,"physicalHdrVerified",false);
 struct Sources{obs_data_array_t *rows;bool (*privateSource)(obs_source_t *);};OBSDataArrayAutoRelease hdrSources=obs_data_array_create();Sources list{hdrSources.Get(),isPrivate};auto enumerate=[](void *p,obs_source_t *s){auto &l=*static_cast<Sources *>(p);const auto cs=obs_source_get_color_space(s,0,nullptr);if(!l.privateSource(s)&&(cs==GS_CS_709_EXTENDED||cs==GS_CS_709_SCRGB)&&obs_source_get_width(s)&&obs_source_get_height(s)){OBSDataAutoRelease row=obs_data_create();obs_data_set_string(row,"uuid",obs_source_get_uuid(s));obs_data_set_string(row,"name",obs_source_get_name(s));obs_data_array_push_back(l.rows,row);}return true;};obs_enum_sources(enumerate,&list);obs_enum_scenes(enumerate,&list);obs_data_set_array(response,"hdrSources",hdrSources);
 obs_data_set_bool(response,"success",error.empty());if(!error.empty())obs_data_set_string(response,"error",error.c_str());obs_data_set_bool(response,"active",Output()&&obs_output_active(Output()));obs_data_set_obj(response,"config",config);OBSDataAutoRelease transports=FreeMixVideoTransports();obs_data_set_obj(response,"capabilities",transports);obs_data_set_bool(response,"autoStart",false);
}
}
