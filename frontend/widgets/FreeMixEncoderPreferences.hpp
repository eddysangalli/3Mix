#pragma once
#include <obs.hpp>
#include <obs-frontend-api.h>
#include <util/config-file.h>
#include <util/bmem.h>
#include <QCryptographicHash>
#include <QFile>
#include <QByteArray>
#include <cmath>
#include <string>
#include <stdexcept>

namespace FreeMixEncoderSettings {
inline std::string Revision(obs_data_t *settings,const std::string &profile,const std::string &id)
{
 const char *json=obs_data_get_json(settings);QByteArray bytes(profile.c_str());bytes+='\0';bytes+=id.c_str();bytes+='\0';bytes+=json?json:"{}";
 return QCryptographicHash::hash(bytes,QCryptographicHash::Sha256).toHex().toStdString();
}
inline void PropertyValue(obs_data_t *row,const char *key,obs_property_t *p,obs_data_t *values)
{
 const char *name=obs_property_name(p);const auto type=obs_property_get_type(p);
 if(type==OBS_PROPERTY_BOOL)obs_data_set_bool(row,key,obs_data_get_bool(values,name));
 else if(type==OBS_PROPERTY_INT)obs_data_set_int(row,key,obs_data_get_int(values,name));
 else if(type==OBS_PROPERTY_FLOAT)obs_data_set_double(row,key,obs_data_get_double(values,name));
 else if(type==OBS_PROPERTY_LIST){switch(obs_property_list_format(p)){
  case OBS_COMBO_FORMAT_INT:obs_data_set_int(row,key,obs_data_get_int(values,name));break;
  case OBS_COMBO_FORMAT_FLOAT:obs_data_set_double(row,key,obs_data_get_double(values,name));break;
  case OBS_COMBO_FORMAT_BOOL:obs_data_set_bool(row,key,obs_data_get_bool(values,name));break;
  default:obs_data_set_string(row,key,obs_data_get_string(values,name));break;
 }}else obs_data_set_string(row,key,obs_data_get_string(values,name));
}
inline void Schema(obs_properties_t *props,obs_data_t *values,obs_data_array_t *fields,const std::string &group={},unsigned depth=0)
{
 if(!props||depth>8)return;
 for(auto *p=obs_properties_first(props);p;obs_property_next(&p)){
  const auto type=obs_property_get_type(p);const char *name=obs_property_name(p),*description=obs_property_description(p);
  if(type==OBS_PROPERTY_GROUP){Schema(obs_property_group_content(p),values,fields,description?description:group,depth+1);continue;}
  OBSDataAutoRelease row=obs_data_create();obs_data_set_string(row,"name",name);obs_data_set_string(row,"label",description?description:name);obs_data_set_string(row,"group",group.c_str());obs_data_set_bool(row,"visible",obs_property_visible(p));obs_data_set_bool(row,"enabled",obs_property_enabled(p));
  const bool supported=type==OBS_PROPERTY_BOOL||type==OBS_PROPERTY_INT||type==OBS_PROPERTY_FLOAT||type==OBS_PROPERTY_LIST||(type==OBS_PROPERTY_TEXT&&obs_property_text_type(p)!=OBS_TEXT_PASSWORD&&obs_property_text_type(p)!=OBS_TEXT_INFO);
  obs_data_set_bool(row,"supported",supported);const char *fieldType=type==OBS_PROPERTY_BOOL?"bool":type==OBS_PROPERTY_INT?"integer":type==OBS_PROPERTY_FLOAT?"number":type==OBS_PROPERTY_LIST?"list":type==OBS_PROPERTY_TEXT?"text":"native";obs_data_set_string(row,"type",fieldType);
  if(supported)PropertyValue(row,"value",p,values);
  if(type==OBS_PROPERTY_INT||type==OBS_PROPERTY_FLOAT){obs_data_set_double(row,"min",type==OBS_PROPERTY_INT?obs_property_int_min(p):obs_property_float_min(p));obs_data_set_double(row,"max",type==OBS_PROPERTY_INT?obs_property_int_max(p):obs_property_float_max(p));obs_data_set_double(row,"step",type==OBS_PROPERTY_INT?obs_property_int_step(p):obs_property_float_step(p));}
  if(type==OBS_PROPERTY_LIST){OBSDataArrayAutoRelease choices=obs_data_array_create();const auto format=obs_property_list_format(p);obs_data_set_int(row,"format",format);obs_data_set_bool(row,"editable",obs_property_list_type(p)==OBS_COMBO_TYPE_EDITABLE);for(size_t i=0;i<obs_property_list_item_count(p)&&i<2048;i++){OBSDataAutoRelease choice=obs_data_create();obs_data_set_string(choice,"label",obs_property_list_item_name(p,i));obs_data_set_bool(choice,"disabled",obs_property_list_item_disabled(p,i));if(format==OBS_COMBO_FORMAT_INT)obs_data_set_int(choice,"value",obs_property_list_item_int(p,i));else if(format==OBS_COMBO_FORMAT_FLOAT)obs_data_set_double(choice,"value",obs_property_list_item_float(p,i));else if(format==OBS_COMBO_FORMAT_BOOL)obs_data_set_bool(choice,"value",obs_property_list_item_bool(p,i));else obs_data_set_string(choice,"value",obs_property_list_item_string(p,i));obs_data_array_push_back(choices,choice);}obs_data_set_array(row,"choices",choices);}
  obs_data_array_push_back(fields,row);
 }
}
inline bool ValidValue(obs_property_t *p,obs_data_t *proposed,const char *name,obs_data_type dataType,bool requireActive=true)
{
 if(!p||(requireActive&&(!obs_property_visible(p)||!obs_property_enabled(p))))return false;const auto type=obs_property_get_type(p);
 if(type==OBS_PROPERTY_BOOL)return dataType==OBS_DATA_BOOLEAN;
 if(type==OBS_PROPERTY_INT||type==OBS_PROPERTY_FLOAT){const double v=obs_data_get_double(proposed,name);return dataType==OBS_DATA_NUMBER&&std::isfinite(v)&&(type!=OBS_PROPERTY_INT||std::floor(v)==v)&&v>=(type==OBS_PROPERTY_INT?obs_property_int_min(p):obs_property_float_min(p))&&v<=(type==OBS_PROPERTY_INT?obs_property_int_max(p):obs_property_float_max(p));}
 if(type==OBS_PROPERTY_TEXT){const std::string v=obs_data_get_string(proposed,name);return dataType==OBS_DATA_STRING&&obs_property_text_type(p)!=OBS_TEXT_PASSWORD&&obs_property_text_type(p)!=OBS_TEXT_INFO&&v.size()<=4096;}
 if(type!=OBS_PROPERTY_LIST)return false;
 const auto format=obs_property_list_format(p);if((format==OBS_COMBO_FORMAT_STRING&&dataType!=OBS_DATA_STRING)||((format==OBS_COMBO_FORMAT_INT||format==OBS_COMBO_FORMAT_FLOAT)&&dataType!=OBS_DATA_NUMBER)||(format==OBS_COMBO_FORMAT_BOOL&&dataType!=OBS_DATA_BOOLEAN))return false;
 for(size_t i=0;i<obs_property_list_item_count(p);i++){if(obs_property_list_item_disabled(p,i))continue;bool match=false;switch(format){case OBS_COMBO_FORMAT_STRING:match=std::string(obs_data_get_string(proposed,name))==obs_property_list_item_string(p,i);break;case OBS_COMBO_FORMAT_INT:match=obs_data_get_double(proposed,name)==static_cast<double>(obs_property_list_item_int(p,i));break;case OBS_COMBO_FORMAT_FLOAT:match=obs_data_get_double(proposed,name)==obs_property_list_item_float(p,i);break;case OBS_COMBO_FORMAT_BOOL:match=obs_data_get_bool(proposed,name)==obs_property_list_item_bool(p,i);break;default:break;}if(match)return true;}
 return format==OBS_COMBO_FORMAT_STRING&&obs_property_list_type(p)==OBS_COMBO_TYPE_EDITABLE&&std::string(obs_data_get_string(proposed,name)).size()<=4096;
}
inline void Handle(obs_data_t *request,obs_data_t *response,bool idle)
{
 const std::string action=obs_data_get_string(request,"action"),target=obs_data_get_string(request,"target");
 if(target!="stream"&&target!="record")throw std::runtime_error("Escolha transmissão ou gravação");
 auto *config=obs_frontend_get_profile_config();const char *configured=config_get_string(config,"AdvOut",target=="stream"?"Encoder":"RecEncoder");
 std::string id=configured?configured:"";if(id.empty()||id=="none")throw std::runtime_error("Escolha um encoder próprio em Saída avançada e aplique antes de editar seus parâmetros");
 if(obs_get_encoder_type(id.c_str())!=OBS_ENCODER_VIDEO||!obs_encoder_get_display_name(id.c_str()))throw std::runtime_error("Encoder não está disponível neste motor");
 char *rawPath=obs_frontend_get_current_profile_path();std::string profile=rawPath?rawPath:"";bfree(rawPath);if(profile.empty())throw std::runtime_error("Perfil indisponível");
 const std::string path=profile+"/"+(target=="stream"?"streamEncoder.json":"recordEncoder.json");
 OBSDataAutoRelease settings=obs_encoder_defaults(id.c_str()),stored=obs_data_create_from_json_file_safe(path.c_str(),"bak");if(!settings)settings=obs_data_create();if(stored)obs_data_apply(settings,stored);
 const std::string revision=Revision(settings,profile,id);OBSDataAutoRelease before=obs_data_create();obs_data_apply(before,settings);
 OBSProperties props=obs_get_encoder_properties(id.c_str());if(!props)throw std::runtime_error("Encoder não expõe propriedades");obs_properties_apply_settings(props,settings);
 if(action!="encoder_read"){
  if(!idle)throw std::runtime_error("Pare as saídas antes de configurar encoder");
  if(std::string(obs_data_get_string(request,"encoder"))!=id||std::string(obs_data_get_string(request,"revision"))!=revision)throw std::runtime_error("O perfil ou encoder mudou. Atualize os parâmetros antes de aplicar");
  OBSDataAutoRelease proposed=obs_data_get_obj(request,"values");if(!proposed)throw std::runtime_error("Parâmetros ausentes");
  bool valid=true;size_t count=0;for(auto *item=obs_data_first(proposed);item;){const char *name=obs_data_item_get_name(item);auto *p=obs_properties_get(props,name);valid=++count<=200&&ValidValue(p,proposed,name,obs_data_item_gettype(item),false);if(!valid){obs_data_item_release(&item);break;}obs_data_item_next(&item);}if(!valid)throw std::runtime_error("Parâmetro não disponível, tipo ou valor fora da faixa");
  obs_data_apply(settings,proposed);obs_properties_apply_settings(props,settings);
  for(auto *item=obs_data_first(proposed);item;){const char *name=obs_data_item_get_name(item);if(!ValidValue(obs_properties_get(props,name),proposed,name,obs_data_item_gettype(item))){valid=false;obs_data_item_release(&item);break;}obs_data_item_next(&item);}if(!valid)throw std::runtime_error("Parâmetro não disponível na configuração preparada");
  if(action=="encoder_apply"){
   if(std::string(config_get_string(config,"Output","Mode")?config_get_string(config,"Output","Mode"):"")!="Advanced")throw std::runtime_error("Ative a saída avançada antes de aplicar parâmetros do encoder");
   if(!count)throw std::runtime_error("Nenhuma alteração preparada");
   const bool existed=QFile::exists(QString::fromUtf8(path.c_str()));if(!obs_data_save_json_safe(settings,path.c_str(),"tmp","bak"))throw std::runtime_error("Falha ao salvar parâmetros");
   try{OBSBasic::Get()->ResetOutputs();}catch(...){bool restored=existed?obs_data_save_json_safe(before,path.c_str(),"tmp","bak"):QFile::remove(QString::fromUtf8(path.c_str()));try{OBSBasic::Get()->ResetOutputs();}catch(...){restored=false;}throw std::runtime_error(restored?"Falha ao recarregar encoder; parâmetros anteriores restaurados":"Falha ao recarregar encoder e restauração incompleta; confira o perfil");}
   OBSDataAutoRelease readback=obs_data_create_from_json_file_safe(path.c_str(),"bak");if(!readback)throw std::runtime_error("Parâmetros salvos sem readback; confira o perfil");obs_data_apply(settings,readback);obs_data_set_bool(response,"applied",true);
  }
 }
 OBSDataArrayAutoRelease schema=obs_data_array_create();Schema(props,settings,schema);obs_data_set_array(response,"fields",schema);obs_data_set_string(response,"target",target.c_str());obs_data_set_string(response,"encoder",id.c_str());obs_data_set_string(response,"label",obs_encoder_get_display_name(id.c_str()));obs_data_set_string(response,"revision",action=="encoder_apply"?Revision(settings,profile,id).c_str():revision.c_str());obs_data_set_bool(response,"draft",action=="encoder_preview");obs_data_set_bool(response,"advancedMode",std::string(config_get_string(config,"Output","Mode")?config_get_string(config,"Output","Mode"):"")=="Advanced");obs_data_set_bool(response,"success",true);
}
}
inline void FreeMixEncoderPreferences(obs_data_t *request,obs_data_t *response,bool idle)
{
 try{FreeMixEncoderSettings::Handle(request,response,idle);}catch(const std::exception &error){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error",error.what());}
}
