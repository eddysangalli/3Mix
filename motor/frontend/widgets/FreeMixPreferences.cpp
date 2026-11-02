#include "FreeMixPreferences.hpp"
#include "OBSBasic.hpp"
#include "../../plugins/obs-websocket/lib/obs-websocket-api.h"
#include <obs-frontend-api.h>
#include <obs.hpp>
#include <util/config-file.h>
#include <QMetaObject>
#include <QFileDialog>
#include <QPointer>
#include <QUuid>
#include <QMenu>
#include <QAction>
#include <atomic>
#include <cmath>
#include <cstdlib>
#include <set>
#include <string>
#include <vector>
#include <exception>
#include <cstdio>
#include "FreeMixEncoderPreferences.hpp"

namespace {
enum Target { PROFILE, USER, APP };
struct Field { const char *category, *name, *label; Target target; const char *section, *key, *type, *fallback, *choices; double min=0,max=0; };
const Field fields[] = {
 {"general","warnStartStream","Confirmar antes de transmitir",USER,"BasicWindow","WarnBeforeStartingStream","bool","true",""},
 {"general","warnStopStream","Confirmar antes de parar transmissão",USER,"BasicWindow","WarnBeforeStoppingStream","bool","true",""},
 {"general","warnStopRecord","Confirmar antes de parar gravação",USER,"BasicWindow","WarnBeforeStoppingRecord","bool","true",""},
 {"general","confirmExit","Confirmar ao fechar",USER,"General","ConfirmOnExit","bool","true",""},
 {"general","doubleClickTransition","Transição com duplo clique",USER,"BasicWindow","TransitionOnDoubleClick","bool","false",""},
 {"general","snapping","Encaixe automático de fontes",USER,"BasicWindow","SnappingEnabled","bool","true",""},
 {"general","snapDistance","Distância de encaixe (px)",USER,"BasicWindow","SnapDistance","number","10","",0,100},
 {"general","safeAreas","Guias de área segura",USER,"BasicWindow","ShowSafeAreas","bool","false",""},
 {"general","projectorOnTop","Projetores sempre à frente",USER,"BasicWindow","ProjectorAlwaysOnTop","bool","false",""},
 {"general","hideProjectorCursor","Ocultar cursor no projetor",USER,"BasicWindow","HideProjectorCursor","bool","true",""},
 {"appearance","fontScale","Escala das fontes do motor",USER,"Appearance","FontScale","integer","10","",-5,50},
 {"appearance","density","Densidade dos controles",USER,"Appearance","Density","integer","1","",0,2},
 {"audio","sampleRate","Taxa de amostragem (Hz)",PROFILE,"Audio","SampleRate","string","48000","44100|48000"},
 {"audio","channels","Canais da produção",PROFILE,"Audio","ChannelSetup","string","Stereo","Mono|Stereo|2.1|4.0|4.1|5.1|7.1"},
 {"audio","meterDecay","Decaimento dos medidores",PROFILE,"Audio","MeterDecayRate","number","23.53","",1,100},
 {"audio","peakMeter","Medidor de pico",PROFILE,"Audio","PeakMeterType","integer","0","",0,1},
 {"audio","lowLatency","Buffer de áudio com baixa latência",USER,"Audio","LowLatencyAudioBuffering","bool","false",""},
 {"advanced","priority","Prioridade do processo",APP,"General","ProcessPriority","string","Normal","Normal|AboveNormal|High|BelowNormal|Idle"},
 {"advanced","browserAcceleration","Aceleração de hardware do navegador",APP,"General","BrowserHWAccel","bool","true",""},
 {"advanced","disableDucking","Impedir redução automática do áudio no Windows",APP,"Audio","DisableAudioDucking","bool","true",""},
 {"advanced","hotkeyFocus","Atalhos conforme foco",USER,"General","HotkeyFocusType","string","NeverDisableHotkeys","NeverDisableHotkeys|DisableHotkeysInFocus|DisableHotkeysOutOfFocus"},
 {"advanced","colorFormat","Formato de cor",PROFILE,"Video","ColorFormat","string","NV12","NV12|I420|I444|P010|I010|P216|P416|BGRA"},
 {"advanced","colorSpace","Espaço de cor",PROFILE,"Video","ColorSpace","string","709","601|709|sRGB|2100PQ|2100HLG"},
 {"advanced","colorRange","Faixa de cor",PROFILE,"Video","ColorRange","string","Partial","Partial|Full"},
 {"outputAdvanced","mode","Modo de saída",PROFILE,"Output","Mode","string","Simple","Simple|Advanced"},
 {"outputAdvanced","streamVideoEncoder","Encoder de vídeo da transmissão avançada",PROFILE,"AdvOut","Encoder","string","obs_x264","@video"},
 {"outputAdvanced","recordVideoEncoder","Encoder de vídeo da gravação avançada",PROFILE,"AdvOut","RecEncoder","string","none","@recordVideo"},
 {"outputAdvanced","streamAudioEncoder","Encoder de áudio da transmissão avançada",PROFILE,"AdvOut","AudioEncoder","string","ffmpeg_aac","@audio"},
 {"outputAdvanced","recordAudioEncoder","Encoder de áudio da gravação avançada",PROFILE,"AdvOut","RecAudioEncoder","string","ffmpeg_aac","@audio"},
 {"outputAdvanced","streamTrack","Trilha de áudio da transmissão",PROFILE,"AdvOut","TrackIndex","integer","1","",1,6},
 {"outputAdvanced","recordTracks","Trilhas da gravação (máscara 1 a 63)",PROFILE,"AdvOut","RecTracks","integer","1","",1,63},
 {"outputAdvanced","recordFormat","Formato avançado de gravação",PROFILE,"AdvOut","RecFormat2","string","mkv","flv|mkv|mp4|mov|hybrid_mp4|hybrid_mov|fragmented_mp4|fragmented_mov|mpegts|hls"},
 {"outputAdvanced","rescaleRecord","Reescalar gravação avançada",PROFILE,"AdvOut","RecRescale","bool","false",""},
 {"outputAdvanced","replaySeconds","Replay buffer (segundos)",PROFILE,"AdvOut","RecRBTime","integer","20","",1,3600},
 {"outputAdvanced","replayMegabytes","Replay buffer (MB)",PROFILE,"AdvOut","RecRBSize","integer","512","",1,32768},
 {"general","snapScreen","Encaixar nas bordas do quadro",USER,"BasicWindow","ScreenSnapping","bool","true",""},
 {"general","snapSources","Encaixar nas outras fontes",USER,"BasicWindow","SourceSnapping","bool","true",""},
 {"general","snapCenters","Encaixar no centro",USER,"BasicWindow","CenterSnapping","bool","false",""},
 {"general","spacingHelpers","Mostrar distâncias entre fontes",USER,"BasicWindow","SpacingHelpersEnabled","bool","true",""},
 {"general","automaticSearch","Buscar arquivos da coleção automaticamente",USER,"General","AutomaticCollectionSearch","bool","false",""},
 {"general","recordWhenStreaming","Gravar ao iniciar transmissão",USER,"BasicWindow","RecordWhenStreaming","bool","false",""},
 {"general","keepRecording","Continuar gravando ao parar transmissão",USER,"BasicWindow","KeepRecordingWhenStreamStops","bool","false",""},
 {"general","replayWhileStreaming","Replay buffer ao transmitir",USER,"BasicWindow","ReplayBufferWhileStreaming","bool","false",""},
 {"general","keepReplay","Continuar buffer ao parar transmissão",USER,"BasicWindow","KeepReplayBufferStreamStops","bool","false",""},
 {"appearance","trayEnabled","Ícone na bandeja do Windows",USER,"BasicWindow","SysTrayEnabled","bool","true",""},
 {"appearance","trayAtStart","Iniciar minimizado na bandeja",USER,"BasicWindow","SysTrayWhenStarted","bool","false",""},
 {"appearance","minimizeTray","Minimizar para bandeja",USER,"BasicWindow","SysTrayMinimizeToTray","bool","false",""},
 {"appearance","studioPortrait","Organização vertical do modo estúdio",USER,"BasicWindow","StudioPortraitLayout","bool","false",""},
 {"appearance","studioLabels","Nomes de Preview e Programa",USER,"BasicWindow","StudioModeLabels","bool","true",""},
 {"projectors","saveProjectors","Restaurar projetores ao abrir",USER,"BasicWindow","SaveProjectors","bool","false",""},
 {"projectors","closeProjectors","Fechar projetor existente ao abrir outro",USER,"BasicWindow","CloseExistingProjectors","bool","false",""},
 {"projectors","multiviewSwitch","Trocar entrada com mouse no multiview",USER,"BasicWindow","MultiviewMouseSwitch","bool","true",""},
 {"projectors","multiviewNames","Nomes no multiview",USER,"BasicWindow","MultiviewDrawNames","bool","true",""},
 {"projectors","multiviewAreas","Áreas seguras no multiview",USER,"BasicWindow","MultiviewDrawAreas","bool","true",""},
 {"projectors","multiviewLayout","Layout do multiview",USER,"BasicWindow","MultiviewLayout","integer","0","",0,7},
 {"advanced","sdrWhiteLevel","Branco SDR (nits)",PROFILE,"Video","SdrWhiteLevel","integer","300","",80,480},
 {"advanced","hdrPeakLevel","Pico nominal HDR (nits)",PROFILE,"Video","HdrNominalPeakLevel","integer","1000","",400,10000},
 {"performance","scaleType","Filtro de redução de imagem",PROFILE,"Video","ScaleType","string","bicubic","bilinear|bicubic|lanczos|area"},
 {"performance","newSocketLoop","Loop de socket otimizado (Windows)",PROFILE,"Output","NewSocketLoopEnable","bool","false",""},
 {"performance","networkLowLatency","Baixa latência de rede",PROFILE,"Output","LowLatencyEnable","bool","false",""},
 {"networkOutput","dynamicBitrate","Bitrate dinâmico em congestionamento",PROFILE,"Output","DynamicBitrate","bool","false",""},
 {"networkOutput","reconnectEnabled","Reconectar automaticamente",PROFILE,"Output","Reconnect","bool","true",""},
 {"networkOutput","reconnectDelay","Espera entre reconexões (s)",PROFILE,"Output","RetryDelay","integer","2","",1,120},
 {"networkOutput","reconnectRetries","Tentativas de reconexão",PROFILE,"Output","MaxRetries","integer","25","",0,10000},
 {"networkOutput","streamDelayEnabled","Atraso de transmissão",PROFILE,"Output","DelayEnable","bool","false",""},
 {"networkOutput","streamDelaySeconds","Atraso (s)",PROFILE,"Output","DelaySec","integer","20","",0,1800},
 {"networkOutput","preserveDelay","Preservar atraso ao reconectar",PROFILE,"Output","DelayPreserve","bool","true",""},
 {"networkOutput","ipFamily","Família de endereços",PROFILE,"Output","IPFamily","string","IPv4+IPv6","IPv4+IPv6|IPv4|IPv6"},
 {"files","filenamePattern","Padrão do nome do arquivo",PROFILE,"Output","FilenameFormatting","text","%CCYY-%MM-%DD %hh-%mm-%ss",""},
 {"files","overwriteFiles","Sobrescrever arquivo existente",PROFILE,"Output","OverwriteIfExists","bool","false",""},
 {"files","autoRemux","Remux automático para MP4",PROFILE,"Video","AutoRemux","bool","false",""},
 {"files","replayPrefix","Prefixo dos clipes de buffer",PROFILE,"SimpleOutput","RecRBPrefix","text","Replay",""},
 {"files","replaySuffix","Sufixo dos clipes de buffer",PROFILE,"SimpleOutput","RecRBSuffix","text","",""},
 {"outputAdvanced","recordPath","Pasta da gravação avançada",PROFILE,"AdvOut","RecFilePath","text","",""},
 {"outputAdvanced","recordNoSpaces","Nome sem espaços",PROFILE,"AdvOut","RecFileNameWithoutSpace","bool","false",""},
 {"outputAdvanced","recordRescaleSize","Resolução reescalada (LxA)",PROFILE,"AdvOut","RecRescaleRes","text","1920x1080",""},
 {"outputAdvanced","recordRescaleFilter","Filtro de reescala da gravação",PROFILE,"AdvOut","RecRescaleFilter","integer","0","",0,4},
 {"outputAdvanced","streamRescaleSize","Resolução da transmissão avançada (LxA)",PROFILE,"AdvOut","RescaleRes","text","1920x1080",""},
 {"outputAdvanced","streamRescaleFilter","Filtro de reescala da transmissão",PROFILE,"AdvOut","RescaleFilter","integer","0","",0,4},
 {"outputAdvanced","recordSplit","Dividir arquivos da gravação",PROFILE,"AdvOut","RecSplitFile","bool","false",""},
 {"outputAdvanced","recordSplitType","Divisão por",PROFILE,"AdvOut","RecSplitFileType","string","Time","Time|Size|Manual"},
 {"outputAdvanced","recordSplitMinutes","Novo arquivo a cada (min)",PROFILE,"AdvOut","RecSplitFileTime","integer","15","",1,1440},
 {"outputAdvanced","recordSplitMegabytes","Tamanho por arquivo (MB)",PROFILE,"AdvOut","RecSplitFileSize","integer","2048","",1,1048576},
 {"outputAdvanced","replayEnabled","Habilitar buffer de replay avançado",PROFILE,"AdvOut","RecRB","bool","false",""},
 {"outputAdvanced","vodTrackEnabled","Trilha separada para VOD",PROFILE,"AdvOut","VodTrackEnabled","bool","false",""},
 {"outputAdvanced","vodTrack","Trilha do VOD",PROFILE,"AdvOut","VodTrackIndex","integer","2","",1,6},
 {"audioTracks","track1Bitrate","Trilha 1 · bitrate (kbps)",PROFILE,"AdvOut","Track1Bitrate","string","160","64|96|128|160|192|256|320"},
 {"audioTracks","track2Bitrate","Trilha 2 · bitrate (kbps)",PROFILE,"AdvOut","Track2Bitrate","string","160","64|96|128|160|192|256|320"},
 {"audioTracks","track3Bitrate","Trilha 3 · bitrate (kbps)",PROFILE,"AdvOut","Track3Bitrate","string","160","64|96|128|160|192|256|320"},
 {"audioTracks","track4Bitrate","Trilha 4 · bitrate (kbps)",PROFILE,"AdvOut","Track4Bitrate","string","160","64|96|128|160|192|256|320"},
 {"audioTracks","track5Bitrate","Trilha 5 · bitrate (kbps)",PROFILE,"AdvOut","Track5Bitrate","string","160","64|96|128|160|192|256|320"},
 {"audioTracks","track6Bitrate","Trilha 6 · bitrate (kbps)",PROFILE,"AdvOut","Track6Bitrate","string","160","64|96|128|160|192|256|320"},
 {"audioTracks","track1Name","Nome da trilha 1",PROFILE,"AdvOut","Track1Name","text","",""},
 {"audioTracks","track2Name","Nome da trilha 2",PROFILE,"AdvOut","Track2Name","text","",""},
 {"audioTracks","track3Name","Nome da trilha 3",PROFILE,"AdvOut","Track3Name","text","",""},
 {"audioTracks","track4Name","Nome da trilha 4",PROFILE,"AdvOut","Track4Name","text","",""},
 {"audioTracks","track5Name","Nome da trilha 5",PROFILE,"AdvOut","Track5Name","text","",""},
 {"audioTracks","track6Name","Nome da trilha 6",PROFILE,"AdvOut","Track6Name","text","",""},
};
std::atomic_bool closing{false}; obs_websocket_vendor preferencesVendor=nullptr;
QPointer<QFileDialog> imagePicker;QString imagePickerId,imagePickerPath,imagePickerState;
config_t *Config(Target target) { return target==USER?obs_frontend_get_user_config():target==APP?obs_frontend_get_app_config():obs_frontend_get_profile_config(); }
std::string Choices(const Field &field)
{
 const std::string selector=field.choices;if(selector.empty()||selector[0]!='@')return selector;
 const bool audio=selector=="@audio";std::string choices=selector=="@recordVideo"?"none":"";const char *id=nullptr;
 for(size_t i=0;obs_enum_encoder_types(i,&id);++i){if(obs_get_encoder_type(id)!=(audio?OBS_ENCODER_AUDIO:OBS_ENCODER_VIDEO)||obs_get_encoder_caps(id)&(OBS_ENCODER_CAP_DEPRECATED|OBS_ENCODER_CAP_INTERNAL))continue;if(!choices.empty())choices+='|';choices+=id;}
 return choices;
}
void Value(obs_data_t *data,const Field &field,const char *name,bool defaults=false)
{
 auto *config=Config(field.target);const bool exists=defaults?config_has_default_value(config,field.section,field.key):config_has_user_value(config,field.section,field.key)||config_has_default_value(config,field.section,field.key);
 const std::string type=field.type;
 if(type=="bool")obs_data_set_bool(data,name,exists?(defaults?config_get_default_bool(config,field.section,field.key):config_get_bool(config,field.section,field.key)):std::string(field.fallback)=="true");
 else if(type=="integer")obs_data_set_int(data,name,exists?(defaults?config_get_default_int(config,field.section,field.key):config_get_int(config,field.section,field.key)):std::atoll(field.fallback));
 else if(type=="number")obs_data_set_double(data,name,exists?(defaults?config_get_default_double(config,field.section,field.key):config_get_double(config,field.section,field.key)):std::atof(field.fallback));
 else {const char *value=exists?(defaults?config_get_default_string(config,field.section,field.key):config_get_string(config,field.section,field.key)):field.fallback;obs_data_set_string(data,name,value?value:field.fallback);}
}
void Write(config_t *config,const Field &field,obs_data_t *values)
{
 const std::string type=field.type;if(type=="bool")config_set_bool(config,field.section,field.key,obs_data_get_bool(values,field.name));
 else if(type=="integer")config_set_int(config,field.section,field.key,obs_data_get_int(values,field.name));
 else if(type=="number")config_set_double(config,field.section,field.key,obs_data_get_double(values,field.name));
 else config_set_string(config,field.section,field.key,obs_data_get_string(values,field.name));
}
bool Idle()
{
 bool active=false;obs_enum_outputs([](void *data,obs_output_t *output){if(obs_output_active(output))*static_cast<bool *>(data)=true;return true;},&active);
 return !active&&!obs_frontend_recording_active()&&!obs_frontend_streaming_active()&&!obs_frontend_replay_buffer_active()&&!obs_frontend_virtualcam_active();
}
void Read(const std::string &category,obs_data_t *response)
{
 OBSDataArrayAutoRelease array=obs_data_array_create();OBSDataAutoRelease values=obs_data_create();bool found=false;
 for(const auto &field:fields)if(category.empty()||category==field.category){found=true;OBSDataAutoRelease row=obs_data_create();obs_data_set_string(row,"category",field.category);obs_data_set_string(row,"name",field.name);obs_data_set_string(row,"label",field.label);obs_data_set_string(row,"type",field.type);obs_data_set_string(row,"choices",Choices(field).c_str());obs_data_set_double(row,"min",field.min);obs_data_set_double(row,"max",field.max);Value(row,field,"value");Value(row,field,"default",true);Value(values,field,field.name);obs_data_array_push_back(array,row);}
 obs_data_set_array(response,"fields",array);obs_data_set_obj(response,"values",values);obs_data_set_string(response,"category",category.c_str());obs_data_set_bool(response,"requiresRestart",true);obs_data_set_bool(response,"success",found);
}
void Request(obs_data_t *request,obs_data_t *response,void *)
{
 if(closing){obs_data_set_bool(response,"success",false);return;}
 QMetaObject::invokeMethod(OBSBasic::Get(),[request,response](){
  const std::string action=obs_data_get_string(request,"action"),category=obs_data_get_string(request,"category");
  if(action=="plugin_tools"||action=="plugin_tool_open"){
   auto *main=OBSBasic::Get();auto *menu=main?main->findChild<QMenu *>("menuTools"):nullptr;
   if(!menu){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","Native tools menu unavailable");return;}
   const auto actions=menu->actions();
   if(action=="plugin_tools"){
    OBSDataArrayAutoRelease list=obs_data_array_create();
    for(int index=0;index<actions.size();index++){auto *item=actions[index];if(item->isSeparator()||item->menu()||!item->isVisible())continue;OBSDataAutoRelease row=obs_data_create();obs_data_set_int(row,"id",index);obs_data_set_string(row,"label",item->text().remove('&').toUtf8().constData());obs_data_set_bool(row,"enabled",item->isEnabled());obs_data_array_push_back(list,row);}
    obs_data_set_array(response,"tools",list);obs_data_set_bool(response,"success",true);return;
   }
   const auto id=obs_data_get_int(request,"id");const QString label=QString::fromUtf8(obs_data_get_string(request,"label"));
   if(!Idle()||id<0||id>=actions.size()){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","Stop outputs and refresh the tools list before opening");return;}
   auto *item=actions[static_cast<int>(id)];
   if(item->isSeparator()||item->menu()||!item->isVisible()||!item->isEnabled()||item->text().remove('&')!=label){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","Tool changed or unavailable; refresh the list");return;}
   QPointer<QAction> selected=item;QMetaObject::invokeMethod(main,[selected](){if(selected&&selected->isEnabled())selected->trigger();},Qt::QueuedConnection);
   obs_data_set_bool(response,"success",true);obs_data_set_bool(response,"scheduled",true);return;
  }
  if(action=="pick_image_start"){
   if(imagePicker){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","An image chooser is already open");return;}
   imagePickerId=QUuid::createUuid().toString(QUuid::WithoutBraces);imagePickerPath.clear();imagePickerState="pending";
   auto *dialog=new QFileDialog(OBSBasic::Get(),QString::fromUtf8("Escolher imagem de fundo"));imagePicker=dialog;dialog->setAttribute(Qt::WA_DeleteOnClose);dialog->setFileMode(QFileDialog::ExistingFile);dialog->setAcceptMode(QFileDialog::AcceptOpen);dialog->setNameFilter(QString::fromUtf8("Imagens (*.png *.jpg *.jpeg *.webp *.bmp *.gif)"));dialog->setWindowModality(Qt::WindowModal);
   QObject::connect(dialog,&QFileDialog::accepted,dialog,[dialog](){const auto files=dialog->selectedFiles();imagePickerPath=files.isEmpty()?QString():files.front();imagePickerState=imagePickerPath.isEmpty()?"cancelled":"selected";});
   QObject::connect(dialog,&QFileDialog::rejected,dialog,[](){imagePickerState="cancelled";});dialog->open();
   obs_data_set_string(response,"id",imagePickerId.toUtf8().constData());obs_data_set_string(response,"state","pending");obs_data_set_bool(response,"success",true);return;
  }
  if(action=="pick_image_read"){
   if(imagePickerId.isEmpty()||QString::fromUtf8(obs_data_get_string(request,"id"))!=imagePickerId){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","Unknown image chooser");return;}
   obs_data_set_string(response,"id",imagePickerId.toUtf8().constData());obs_data_set_string(response,"state",imagePickerState.toUtf8().constData());if(imagePickerState=="selected")obs_data_set_string(response,"path",imagePickerPath.toUtf8().constData());obs_data_set_bool(response,"success",true);return;
  }
  if(action=="runtime_outputs"){for(const auto &type:{"stream","record"}){OBSOutputAutoRelease output=std::string(type)=="stream"?obs_frontend_get_streaming_output():obs_frontend_get_recording_output();auto *encoder=output?obs_output_get_video_encoder(output):nullptr;OBSDataAutoRelease row=obs_data_create();obs_data_set_string(row,"encoder",encoder?obs_encoder_get_id(encoder):"");obs_data_set_string(row,"codec",encoder?obs_encoder_get_codec(encoder):"");obs_data_set_obj(response,type,row);}obs_data_set_bool(response,"success",true);return;}
  if(action=="reset_outputs"){if(!Idle()){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","Stop outputs before reloading encoders");return;}try{OBSBasic::Get()->ResetOutputs();obs_data_set_bool(response,"success",true);}catch(const char *error){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error",error);}catch(const std::exception &error){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error",error.what());}catch(...){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","Could not reload native encoders");}return;}
   if(action=="read"){Read(category,response);return;}
   if(action=="encoder_read"||action=="encoder_preview"||action=="encoder_apply"){FreeMixEncoderPreferences(request,response,Idle());return;}
  OBSDataAutoRelease values=obs_data_get_obj(request,"values");
  if(action!="apply"||category.empty()||!values||!Idle()){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","Stop outputs before applying preferences");return;}
  std::vector<const Field *> selected;bool valid=true;
  for(obs_data_item_t *item=obs_data_first(values);item;){const std::string name=obs_data_item_get_name(item);const Field *field=nullptr;for(const auto &candidate:fields)if(category==candidate.category&&name==candidate.name)field=&candidate;
   if(!field){valid=false;obs_data_item_release(&item);break;}
   const std::string type=field->type;const auto dataType=obs_data_item_gettype(item);
   if(type=="bool")valid=dataType==OBS_DATA_BOOLEAN;
    else if(type=="text"){const std::string value=obs_data_get_string(values,field->name);valid=dataType==OBS_DATA_STRING&&value.size()<=2048&&value.find_first_of("\r\n") == std::string::npos;if(valid&&(name=="recordRescaleSize"||name=="streamRescaleSize")){unsigned w=0,h=0;char tail=0;valid=std::sscanf(value.c_str(),"%ux%u%c",&w,&h,&tail)==2&&w>=240&&h>=240&&w<=7680&&h<=7680&&!(w%2)&&!(h%2);}}
    else if(type=="string"){const std::string value=obs_data_get_string(values,field->name),choices="|"+Choices(*field)+"|";valid=dataType==OBS_DATA_STRING&&value.size()<=100&&value.find('|')==std::string::npos&&choices.find("|"+value+"|")!=std::string::npos;}
   else {const double value=obs_data_get_double(values,field->name);valid=dataType==OBS_DATA_NUMBER&&std::isfinite(value)&&value>=field->min&&value<=field->max&&(type!="integer"||std::floor(value)==value);}
   if(!valid){obs_data_item_release(&item);break;}selected.push_back(field);obs_data_item_next(&item);
  }
  if(!valid||selected.empty()){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","Invalid preferences or unsupported field");return;}
  OBSDataAutoRelease before=obs_data_create();std::set<const Field *> existed;std::set<config_t *> targets;
  for(const auto *field:selected){auto *config=Config(field->target);Value(before,*field,field->name);if(config_has_user_value(config,field->section,field->key))existed.insert(field);targets.insert(config);}
  for(const auto *field:selected)Write(Config(field->target),*field,values);
  bool saved=true;for(auto *config:targets)if(config_save_safe(config,"tmp",nullptr)!=CONFIG_SUCCESS)saved=false;
  if(!saved){for(const auto *field:selected){auto *config=Config(field->target);if(existed.count(field))Write(config,*field,before);else config_remove_value(config,field->section,field->key);}bool restored=true;for(auto *config:targets)if(config_save_safe(config,"tmp",nullptr)!=CONFIG_SUCCESS)restored=false;obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error",restored?"Could not save; changes restored":"Could not save; rollback incomplete");return;}
  Read(category,response);
 },Qt::BlockingQueuedConnection);
}
void FrontendEvent(enum obs_frontend_event event,void *) {if(event==OBS_FRONTEND_EVENT_EXIT)closing=true;}
}
void FreeMixPreferencesInit()
{
 if(preferencesVendor)return;preferencesVendor=obs_websocket_register_vendor("freemix-preferences");if(!preferencesVendor)return;
 obs_websocket_vendor_register_request(preferencesVendor,"control",Request,nullptr);obs_frontend_add_event_callback(FrontendEvent,nullptr);
}
