// DRAFT: own HDR view/encoders. Include in the GUI vendor TU only after review.
// No global video reset, no auto-start, no SDR relabel, no alpha transport.
#pragma once
#include "FreeMixAudioRouting.hpp"
#include <obs.hpp>
#include <obs-frontend-api.h>
#include <QCoreApplication>
#include <QMetaObject>
#include <QUrl>
#include <QUrlQuery>
#include <array>
#include <atomic>
#include <cstring>
#include <memory>
#include <string>
#include <utility>
#include <thread>
#include <mutex>
#include <system_error>

namespace freemix_srt_hdr {
inline constexpr std::array<const char *,9> EncoderIds={
 "obs_nvenc_hevc_tex","obs_nvenc_hevc_soft","jim_hevc_nvenc",
 "obs_nvenc_hevc_cuda","ffmpeg_hevc_nvenc","obs_qsv11_hevc",
 "obs_qsv11_hevc_soft","h265_texture_amf","h265_fallback_amf"};
inline bool EncoderSupported(const std::string &id){
 bool recognized=false;for(auto candidate:EncoderIds)if(id==candidate)recognized=true;
 if(!recognized)return false;const char *loaded=nullptr;
 for(size_t i=0;obs_enum_encoder_types(i,&loaded);i++)if(id==loaded){
  const char *codec=obs_get_encoder_codec(loaded);return codec&&std::strcmp(codec,"hevc")==0;
 }return false;
}
inline bool MuxerAvailable(){
 const char *id=nullptr;bool found=false;
 for(size_t i=0;obs_enum_output_types(i,&id);i++)if(std::strcmp(id,"ffmpeg_mpegts_muxer")==0)found=true;
 if(!found)return false;const char *codecs=obs_get_output_supported_video_codecs("ffmpeg_mpegts_muxer");
 if(!codecs)return false;std::string list=";"+std::string(codecs)+";";return list.find(";hevc;")!=std::string::npos;
}
inline bool Available(){if(!MuxerAvailable())return false;for(auto id:EncoderIds)if(EncoderSupported(id))return true;return false;}
inline std::string Url(obs_data_t *config){
 QUrl url;url.setScheme("srt");url.setHost(QString::fromUtf8(obs_data_get_string(config,"host")));
 url.setPort(int(obs_data_get_int(config,"port")));QUrlQuery query;
 query.addQueryItem("mode","caller");query.addQueryItem("latency",QString::number(obs_data_get_int(config,"latencyMs")*1000));
 url.setQuery(query);return url.toString(QUrl::FullyEncoded).toStdString();
}
inline bool IsHdrSource(obs_source_t *source){
 if(!source)return false;const auto color=obs_source_get_color_space(source,0,nullptr);
 return color==GS_CS_709_EXTENDED||color==GS_CS_709_SCRGB;
}
inline std::string Preflight(obs_data_t *config,bool (*isPrivate)(obs_source_t *)){
 if(!config)return "SRT HDR configuration missing";
 if(std::string(obs_data_get_string(config,"contract"))!="pq-bt2020-p010-main10"||
  obs_data_get_bool(config,"alpha")||obs_data_get_bool(config,"fillKey")||obs_data_get_bool(config,"autoStart"))
  return "Only manual opaque HEVC Main10/P010/PQ BT.2020 is supported";
 if(!MuxerAvailable())return "MPEG-TS output with HEVC support unavailable";
 if(!EncoderSupported(obs_data_get_string(config,"encoder")))return "Selected loaded encoder has no recognized HEVC/P010 path";
 const std::string host=obs_data_get_string(config,"host");const auto port=obs_data_get_int(config,"port"),latency=obs_data_get_int(config,"latencyMs"),bitrate=obs_data_get_int(config,"bitrateKbps"),track=obs_data_get_int(config,"audioTrack");
 QUrl url(QString::fromStdString(Url(config)));
 if(host.empty()||host.size()>253||host=="0.0.0.0"||host=="::"||host.find_first_of(" /?#@\\\t\r\n")!=std::string::npos||
  !url.isValid()||url.host().isEmpty()||url.host().compare(QString::fromStdString(host),Qt::CaseInsensitive)!=0||port<1||port>65535||latency<20||latency>8000)
  return "Valid receiver host, port1..65535 and latency20..8000ms required";
 if(bitrate<200||bitrate>100000||track<0||track>2)return "Select bitrate200..100000kbps and Master/A/B";
 OBSSourceAutoRelease source=obs_get_source_by_uuid(obs_data_get_string(config,"sourceUuid"));
 if(!source||obs_source_removed(source)||isPrivate(source))return "Select a public HDR source outside private director audio";
 const auto width=obs_source_get_width(source),height=obs_source_get_height(source);
 if(!width||!height||width%2||height%2||width>3840||height>2160)return "HDR source must have even dimensions up to3840x2160";
 if(!IsHdrSource(source))return "Source does not declare HDR/float HDR; SDR must not be relabeled PQ. Wait for media to load";
 const std::string audioUuid=obs_data_get_string(config,"audioSourceUuid");
 if(!audioUuid.empty()){OBSSourceAutoRelease audio=obs_get_source_by_uuid(audioUuid.c_str());if(!FreeMixAudioBusAllowed(audio))return "Use a public independent audio bus with global tracks disabled";}
 return "";
}
struct Slot {
 OBSOutputAutoRelease output;OBSServiceAutoRelease service;OBSEncoderAutoRelease videoEncoder,audioEncoder;
 OBSSourceAutoRelease source;std::unique_ptr<FreeMixSourceAudio> audio;obs_view_t *view=nullptr;
 std::atomic<uint64_t> generation{0};std::string state="idle",error;
 std::string audioUuid;uint32_t width=0,height=0;
 std::thread retiringWorker;std::atomic<bool> workerGate{false},workerFinished{false};
 bool retiring=false;std::atomic<bool> stopRequested{false},stopSignaled{false};
 std::mutex stopErrorMutex;std::string stopError;
};
inline std::array<Slot,4> &Slots(){static std::array<Slot,4> senders;return senders;}
inline bool &Draining(){static bool value=false;return value;}
inline bool HasResources(const Slot &slot){return slot.output||slot.retiring||slot.view||slot.source||slot.audio;}
inline void Release(Slot &slot);
inline void OnStart(void *param,calldata_t *data){
 auto *slot=static_cast<Slot *>(param);const auto generation=slot->generation.load();
 auto *output=static_cast<obs_output_t *>(calldata_ptr(data,"output"));
 QMetaObject::invokeMethod(QCoreApplication::instance(),[slot,generation,output](){
  if(slot->generation.load()==generation&&slot->output==output&&!slot->stopRequested.load()){slot->state="live";slot->error.clear();}
 },Qt::QueuedConnection);
}
inline void OnStop(void *param,calldata_t *data){
 auto *slot=static_cast<Slot *>(param);auto *output=static_cast<obs_output_t *>(calldata_ptr(data,"output"));
 const int code=int(calldata_int(data,"code"));const char *last=output?obs_output_get_last_error(output):nullptr;
 if(code!=OBS_OUTPUT_SUCCESS){std::lock_guard<std::mutex> lock(slot->stopErrorMutex);slot->stopError=last&&*last?last:"SRT HDR transport/encoder stopped with error";}
 // stop can precede complete end_data_capture. It does NOT release video/audio.
 slot->stopSignaled.store(true);
}
// GUI only, after retiringWorker has completed output destruction/join.
inline void Release(Slot &slot){
 if(slot.retiring)return;
 if(slot.output){auto *handler=obs_output_get_signal_handler(slot.output);signal_handler_disconnect(handler,"start",OnStart,&slot);signal_handler_disconnect(handler,"stop",OnStop,&slot);}
 slot.generation.fetch_add(1);slot.output=nullptr;slot.service=nullptr;slot.videoEncoder=nullptr;slot.audioEncoder=nullptr;slot.audio.reset();
 if(slot.view){obs_view_remove(slot.view);obs_view_set_source(slot.view,0,nullptr);obs_view_destroy(slot.view);slot.view=nullptr;}
 slot.source=nullptr;slot.audioUuid.clear();slot.width=slot.height=0;
 slot.stopRequested.store(false);slot.stopSignaled.store(false);
 {std::lock_guard<std::mutex> lock(slot.stopErrorMutex);slot.stopError.clear();}
}
inline void Stop(Slot &slot){
 if(slot.retiring)return;
 if(!slot.output){Release(slot);slot.state=slot.error.empty()?"idle":"error";return;}
 auto *output=obs_output_get_ref(slot.output);if(!output){slot.error="Could not retain HDR output for safe stop";return;}
 slot.stopRequested.store(true);slot.workerGate.store(false);slot.workerFinished.store(false);
 try{
  slot.retiringWorker=std::thread([&slot,output](){
   // Transfer the last owned ref off the GUI before stopping; destruction can
   // join MPEGTS/reconnect/end_capture workers. All view/audio/source refs stay.
   while(!slot.workerGate.load())std::this_thread::yield();
   if(!slot.stopSignaled.load()||obs_output_active(output))obs_output_force_stop(output);
   auto *handler=obs_output_get_signal_handler(output);signal_handler_disconnect(handler,"start",OnStart,&slot);signal_handler_disconnect(handler,"stop",OnStop,&slot);
   obs_output_release(output);
   slot.workerFinished.store(true);
  });
 }catch(const std::system_error &e){obs_output_release(output);slot.stopRequested.store(false);slot.error="Could not create HDR stop worker: "+std::string(e.what());return;}
 slot.retiring=true;slot.state="stopping";slot.output=nullptr;slot.workerGate.store(true);
}
inline void PollStopped(){
 for(auto &slot:Slots()){
  if(slot.retiring&&slot.workerFinished.load()){
   slot.retiringWorker.join();slot.retiring=false;
   {std::lock_guard<std::mutex> lock(slot.stopErrorMutex);if(!slot.stopError.empty())slot.error=slot.stopError;}
   Release(slot);slot.state=slot.error.empty()?"idle":"error";
  }else if(slot.output&&slot.stopSignaled.load())Stop(slot);
 }
}
inline void StopAll(){for(auto &slot:Slots())Stop(slot);}
inline bool Pending(){for(auto &slot:Slots())if(HasResources(slot))return true;return false;}
// Timer remains alive during frontendClosing; first poll resources, then guards.
inline void Tick(bool (*isPrivate)(obs_source_t *)){
 PollStopped();
 for(auto &slot:Slots()){
  if(!slot.output||slot.stopRequested.load())continue;
  bool invalid=obs_source_removed(slot.source)||isPrivate(slot.source)||!IsHdrSource(slot.source)||obs_source_get_width(slot.source)!=slot.width||obs_source_get_height(slot.source)!=slot.height;
  if(slot.audio&&!slot.audio->Valid())invalid=true;
  if(!slot.audioUuid.empty()){OBSSourceAutoRelease audio=obs_get_source_by_uuid(slot.audioUuid.c_str());invalid=invalid||!FreeMixAudioBusAllowed(audio);}
  if(invalid){slot.error="HDR source/audio contract changed; output stopped. Select and start explicitly again";Stop(slot);}
 }
}

inline std::string Path(int id){char *folder=obs_frontend_get_current_profile_path();const std::string path=folder?std::string(folder)+"/freemix-srt-hdr-"+std::to_string(id)+".json":"";bfree(folder);return path;}
inline std::string Start(Slot &slot,obs_data_t *config,int id,bool (*isPrivate)(obs_source_t *)){
 auto error=Preflight(config,isPrivate);if(!error.empty())return error;
 if(HasResources(slot))return "Stop the current SRT HDR output and wait for idle before starting";
 slot.source=obs_get_source_by_uuid(obs_data_get_string(config,"sourceUuid"));obs_video_info info={};
 if(!obs_get_video_info(&info))return "Native video context unavailable";
 info.base_width=info.output_width=obs_source_get_width(slot.source);info.base_height=info.output_height=obs_source_get_height(slot.source);
 slot.width=info.output_width;slot.height=info.output_height;
 info.output_format=VIDEO_FORMAT_P010;info.colorspace=VIDEO_CS_2100_PQ;info.range=VIDEO_RANGE_PARTIAL;
 slot.view=obs_view_create();if(!slot.view)return "HDR view unavailable";obs_view_set_source(slot.view,0,slot.source);
 auto *video=obs_view_add2(slot.view,&info);if(!video)return "Native 10-bit HDR P010 view unavailable";
 const std::string name="FreeMix SRT HDR "+std::to_string(id+1),url=Url(config),encoder=obs_data_get_string(config,"encoder");
 OBSDataAutoRelease serviceSettings=obs_data_create();obs_data_set_string(serviceSettings,"server",url.c_str());obs_data_set_string(serviceSettings,"key","");
 slot.service=obs_service_create("rtmp_custom",(name+" service").c_str(),serviceSettings,nullptr);
 if(!slot.service)return "SRT service unavailable";
 OBSDataAutoRelease videoSettings=obs_encoder_defaults(encoder.c_str());if(!videoSettings)videoSettings=obs_data_create();
 obs_data_set_string(videoSettings,"rate_control","CBR");obs_data_set_int(videoSettings,"bitrate",obs_data_get_int(config,"bitrateKbps"));
 obs_data_set_int(videoSettings,"keyint_sec",2);obs_data_set_string(videoSettings,"profile","main10");
 if(encoder.find("nvenc")!=std::string::npos)obs_data_set_string(videoSettings,"preset","p5");
 slot.videoEncoder=obs_video_encoder_create(encoder.c_str(),(name+" video").c_str(),videoSettings,nullptr);
 const std::string audioUuid=obs_data_get_string(config,"audioSourceUuid");
 slot.audioUuid=audioUuid;
 if(!audioUuid.empty()){slot.audio=FreeMixSourceAudio::Open(audioUuid,name+" PCM",error);if(!slot.audio)return error.empty()?"Independent audio unavailable":error;}
 OBSDataAutoRelease audioSettings=obs_data_create();obs_data_set_int(audioSettings,"bitrate",160);
 slot.audioEncoder=obs_audio_encoder_create("ffmpeg_aac",(name+" audio").c_str(),audioSettings,slot.audio?0:obs_data_get_int(config,"audioTrack"),nullptr);
 if(!slot.videoEncoder||!slot.audioEncoder)return "HEVC/AAC encoder creation failed; no SDR fallback";
 obs_encoder_set_video(slot.videoEncoder,video);obs_encoder_set_preferred_video_format(slot.videoEncoder,VIDEO_FORMAT_P010);obs_encoder_set_preferred_color_space(slot.videoEncoder,VIDEO_CS_2100_PQ);
 obs_encoder_set_audio(slot.audioEncoder,slot.audio?slot.audio->Audio():obs_get_audio());
 slot.output=obs_output_create("ffmpeg_mpegts_muxer",name.c_str(),nullptr,nullptr);if(!slot.output)return "SRT MPEG-TS output unavailable";
 obs_output_set_video_encoder(slot.output,slot.videoEncoder);obs_output_set_audio_encoder(slot.output,slot.audioEncoder,0);
 obs_output_set_service(slot.output,slot.service);obs_output_set_reconnect_settings(slot.output,20,2);
 obs_output_set_reconnect_callback(slot.output,[](void *param,obs_output_t *,int){return !static_cast<Slot *>(param)->stopRequested.load();},&slot);
 auto *handler=obs_output_get_signal_handler(slot.output);signal_handler_connect(handler,"start",OnStart,&slot);signal_handler_connect(handler,"stop",OnStop,&slot);
 slot.state="starting";slot.error.clear();slot.stopSignaled.store(false);slot.stopRequested.store(false);{std::lock_guard<std::mutex> lock(slot.stopErrorMutex);slot.stopError.clear();}
 if(!obs_output_start(slot.output)){const char *last=obs_output_get_last_error(slot.output);return last&&*last?last:"HEVC Main10/P010 could not start on this hardware or SRT endpoint";}
 return "";
}
// GUI thread only. Vendor wrapper/local-only HTTP integration is owned by root.
inline void Request(obs_data_t *request,obs_data_t *response,bool (*isPrivate)(obs_source_t *)){
 const auto id=obs_data_get_int(request,"senderId");if(id<0||id>3){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","Select SRT HDR sender0..3");return;}
 auto &slot=Slots()[size_t(id)];const auto path=Path(int(id));OBSDataAutoRelease config=path.empty()?nullptr:obs_data_create_from_json_file(path.c_str());if(!config)config=obs_data_create();
 const std::string action=obs_data_get_string(request,"action");std::string error;
 if(Draining()&&action!="state"&&action!="stop"){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","HDR context is draining; start/configure refused");return;}
 if(action=="configure"){
  if(HasResources(slot))error="Stop output and wait for idle before configuring";
  else{OBSDataAutoRelease proposed=obs_data_get_obj(request,"config");error=Preflight(proposed,isPrivate);
   if(error.empty()){if(path.empty()||!obs_data_save_json_safe(proposed,path.c_str(),"tmp","bak"))error="Could not persist SRT HDR configuration";else config=std::move(proposed);}}
 }else if(action=="preflight"){OBSDataAutoRelease proposed=obs_data_get_obj(request,"config");error=Preflight(proposed?proposed.Get():config.Get(),isPrivate);
 }else if(action=="start"){const bool hadResources=HasResources(slot);error=Start(slot,config,int(id),isPrivate);if(!error.empty()&&!hadResources){slot.error=error;if(slot.output)Stop(slot);else{Release(slot);slot.state="error";}}
 }else if(action=="stop")Stop(slot);else if(action!="state")error="Invalid SRT HDR action";
 OBSDataArrayAutoRelease encoders=obs_data_array_create();for(auto encoder:EncoderIds)if(EncoderSupported(encoder)){OBSDataAutoRelease row=obs_data_create();obs_data_set_string(row,"id",encoder);obs_data_set_bool(row,"runtimeValidationRequired",true);obs_data_array_push_back(encoders,row);}obs_data_set_array(response,"encoders",encoders);
 OBSDataArrayAutoRelease sources=obs_data_array_create();struct Sources{obs_data_array_t *rows;bool (*isPrivate)(obs_source_t *);};Sources list={sources.Get(),isPrivate};
 auto enumerate=[](void *context,obs_source_t *source){auto &list=*static_cast<Sources *>(context);if(!IsHdrSource(source)||list.isPrivate(source))return true;OBSDataAutoRelease row=obs_data_create();obs_data_set_string(row,"uuid",obs_source_get_uuid(source));obs_data_set_string(row,"name",obs_source_get_name(source));obs_data_set_int(row,"width",obs_source_get_width(source));obs_data_set_int(row,"height",obs_source_get_height(source));obs_data_array_push_back(list.rows,row);return true;};obs_enum_sources(enumerate,&list);obs_enum_scenes(enumerate,&list);obs_data_set_array(response,"hdrSources",sources);
 obs_data_set_bool(response,"success",error.empty());if(!error.empty())obs_data_set_string(response,"error",error.c_str());else if(!slot.error.empty())obs_data_set_string(response,"error",slot.error.c_str());
 obs_data_set_string(response,"state",slot.output&&obs_output_reconnecting(slot.output)&&slot.state!="stopping"?"reconnecting":slot.state.c_str());
 obs_data_set_bool(response,"active",slot.output&&obs_output_active(slot.output));obs_data_set_bool(response,"pending",HasResources(slot));
 obs_data_set_bool(response,"available",Available());obs_data_set_bool(response,"runtimeValidationRequired",true);
 obs_data_set_bool(response,"hdrAlphaSupported",false);obs_data_set_bool(response,"autoStart",false);obs_data_set_string(response,"contract","pq-bt2020-p010-main10");
 obs_data_set_int(response,"senderId",id);obs_data_set_obj(response,"config",config);
 obs_data_set_int(response,"frames",slot.output?int64_t(obs_output_get_total_frames(slot.output)):0);obs_data_set_int(response,"bytes",slot.output?int64_t(obs_output_get_total_bytes(slot.output)):0);obs_data_set_int(response,"droppedFrames",slot.output?obs_output_get_frames_dropped(slot.output):0);
}
}
