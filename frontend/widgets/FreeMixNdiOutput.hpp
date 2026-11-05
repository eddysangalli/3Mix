// FreeMix per-instance NDI Fill+Key output using the official SDK. See licenses/ndi-runtime/TERMS.md.
// The original omtplugin output and its global settings remain available.
#pragma once
#include "vendor/freemix-ndi/Processing.NDI.Lib.h"
#include <QLibrary>
#include <QCoreApplication>
#include <QDir>
#include <obs.hpp>
#include <mutex>
#include <vector>
#include <cstring>
#include <algorithm>
#include <string>
#include <map>
#include "FreeMixFillKey.hpp"

namespace freemix_ndi {
struct Sdk {
 QLibrary dll;
 decltype(&NDIlib_send_create) create=nullptr;decltype(&NDIlib_send_destroy) destroy=nullptr;decltype(&NDIlib_send_send_video_v2) sendVideo=nullptr;decltype(&NDIlib_send_send_audio_v2) sendAudio=nullptr;decltype(&NDIlib_send_get_no_connections) connections=nullptr;
 bool Ready(){if(create)return true;const QString folder=qEnvironmentVariable("NDI_RUNTIME_DIR_V6");if(folder.isEmpty())return false;dll.setFileName(QDir(folder).absoluteFilePath("Processing.NDI.Lib.x64.dll"));dll.setLoadHints(QLibrary::PreventUnloadHint);if(!dll.load())return false;
 create=reinterpret_cast<decltype(create)>(dll.resolve("NDIlib_send_create"));destroy=reinterpret_cast<decltype(destroy)>(dll.resolve("NDIlib_send_destroy"));sendVideo=reinterpret_cast<decltype(sendVideo)>(dll.resolve("NDIlib_send_send_video_v2"));sendAudio=reinterpret_cast<decltype(sendAudio)>(dll.resolve("NDIlib_send_send_audio_v2"));connections=reinterpret_cast<decltype(connections)>(dll.resolve("NDIlib_send_get_no_connections"));if(!create||!destroy||!sendVideo||!sendAudio||!connections){create=nullptr;return false;}return true;}
 NDIlib_send_instance_t NewSender(const std::string &name,const std::string &groups){NDIlib_send_create_t settings={};settings.p_ndi_name=name.c_str();settings.p_groups=groups.empty()?nullptr:groups.c_str();settings.clock_video=false;settings.clock_audio=false;return create(&settings);}
};
inline Sdk &Api(){static Sdk api;return api;}
struct Sender;
inline std::mutex &RegistryMutex(){static std::mutex mutex;return mutex;}
inline std::map<obs_output_t *,Sender *> &Registry(){static std::map<obs_output_t *,Sender *> registry;return registry;}
struct Sender {
 obs_output_t *output=nullptr;NDIlib_send_instance_t sender=nullptr,keySender=nullptr;std::mutex mutex;std::string name,keyName,groups;bool alpha=false,fillKey=false;uint32_t width=0,height=0;int fpsN=0,fpsD=1;std::vector<uint8_t> pixels,keyPixels;std::vector<float> samples;uint64_t bytes=0;
 void DestroySenders(){if(keySender){Api().destroy(keySender);keySender=nullptr;}if(sender){Api().destroy(sender);sender=nullptr;}}
 void Stop(){obs_output_end_data_capture(output);std::lock_guard<std::mutex> lock(mutex);DestroySenders();}
 bool Start(){
  if(!Api().Ready()){obs_output_set_last_error(output,"Official NDI SDK Processing.NDI.Lib.x64.dll is missing or incompatible");return false;}
  video_t *video=obs_output_video(output);audio_t *audio=obs_output_audio(output);if(!video||!audio){obs_output_set_last_error(output,"Video or audio is unavailable");return false;}
  width=video_output_get_width(video);height=video_output_get_height(video);const auto *vi=video_output_get_info(video);fpsN=int(vi->fps_num);fpsD=int(vi->fps_den);
  video_scale_info convert={};convert.format=VIDEO_FORMAT_BGRA;convert.width=width;convert.height=height;convert.colorspace=VIDEO_CS_709;convert.range=VIDEO_RANGE_FULL;obs_output_set_video_conversion(output,&convert);
  audio_convert_info ac={};ac.format=AUDIO_FORMAT_FLOAT_PLANAR;ac.speakers=SPEAKERS_STEREO;ac.samples_per_sec=48000;obs_output_set_audio_conversion(output,&ac);
  if(fillKey&&(keyName.empty()||keyName==name||keyName.size()>120)){obs_output_set_last_error(output,"Fill+Key requires a distinct Key name (up to 120 characters)");return false;}
  {std::lock_guard<std::mutex> lock(mutex);sender=Api().NewSender(name,groups);if(sender&&fillKey)keySender=Api().NewSender(keyName,groups);if(!sender||(fillKey&&!keySender)){DestroySenders();obs_output_set_last_error(output,"Official NDI SDK failed to create Fill+Key senders");return false;}}
  if(!obs_output_begin_data_capture(output,0)){std::lock_guard<std::mutex> lock(mutex);DestroySenders();obs_output_set_last_error(output,"Could not attach NDI capture");return false;}return true;
 }
 void Video(video_data *data){std::lock_guard<std::mutex> lock(mutex);if(!sender||!data||!data->data[0])return;const size_t stride=size_t(width)*4;pixels.resize(stride*height);for(uint32_t y=0;y<height;y++)std::memcpy(pixels.data()+stride*y,data->data[0]+size_t(data->linesize[0])*y,stride);
 freemix_fill_key::StraightRgb(pixels.data(),size_t(width)*height); NDIlib_video_frame_v2_t f={};f.xres=int(width);f.yres=int(height);f.FourCC=NDIlib_FourCC_type_BGRX;f.frame_rate_N=fpsN;f.frame_rate_D=fpsD;f.picture_aspect_ratio=float(width)/float(height);f.frame_format_type=NDIlib_frame_format_type_progressive;f.timecode=int64_t(data->timestamp/100);f.p_data=pixels.data();f.line_stride_in_bytes=int(stride);Api().sendVideo(sender,&f);bytes+=pixels.size();if(keySender){freemix_fill_key::MakeKey(pixels.data(),stride,width,height,keyPixels);f.p_data=keyPixels.data();Api().sendVideo(keySender,&f);bytes+=keyPixels.size();}}
 void Audio(audio_data *data){std::lock_guard<std::mutex> lock(mutex);if(!sender||!data||!data->frames)return;samples.resize(size_t(data->frames)*2);for(size_t ch=0;ch<2;ch++){float *dest=samples.data()+ch*data->frames;if(data->data[ch])std::memcpy(dest,data->data[ch],size_t(data->frames)*sizeof(float));else std::memset(dest,0,size_t(data->frames)*sizeof(float));}NDIlib_audio_frame_v2_t f={};f.sample_rate=48000;f.no_channels=2;f.no_samples=int(data->frames);f.timecode=int64_t(data->timestamp/100);f.p_data=samples.data();f.channel_stride_in_bytes=int(data->frames*sizeof(float));Api().sendAudio(sender,&f);bytes+=samples.size()*sizeof(float);}
 uint64_t Bytes(){std::lock_guard<std::mutex> lock(mutex);return bytes;}
 int Connections(){std::lock_guard<std::mutex> lock(mutex);return sender?Api().connections(sender,0):0;}
};
inline bool Available(){return Api().Ready();}
inline int Connections(obs_output_t *output){if(!output||std::string(obs_output_get_id(output))!="freemix_ndi_output")return -1;std::lock_guard<std::mutex> lock(RegistryMutex());const auto found=Registry().find(output);return found!=Registry().end()?found->second->Connections():-1;}
inline void Register(){
 static bool registered=false;if(registered)return;registered=true;obs_output_info info={};info.id="freemix_ndi_output";info.flags=OBS_OUTPUT_AV;info.get_name=[](void *){return "FreeMix NDI SDK (independent sender)";};
 info.create=[](obs_data_t *settings,obs_output_t *output)->void *{auto *s=new Sender();s->output=output;s->name=obs_data_get_string(settings,"ndi_name");s->groups=obs_data_get_string(settings,"ndi_groups");s->keyName=obs_data_get_string(settings,"key_name");s->fillKey=obs_data_get_bool(settings,"fill_key");s->alpha=obs_data_get_bool(settings,"alpha");{std::lock_guard<std::mutex> lock(RegistryMutex());Registry()[output]=s;}return s;};
 info.destroy=[](void *data){auto *s=static_cast<Sender *>(data);{std::lock_guard<std::mutex> lock(RegistryMutex());Registry().erase(s->output);}{std::lock_guard<std::mutex> lock(s->mutex);s->DestroySenders();}delete s;};
 info.update=[](void *data,obs_data_t *settings){auto *s=static_cast<Sender *>(data);if(obs_output_active(s->output))return;s->name=obs_data_get_string(settings,"ndi_name");s->groups=obs_data_get_string(settings,"ndi_groups");s->keyName=obs_data_get_string(settings,"key_name");s->fillKey=obs_data_get_bool(settings,"fill_key");s->alpha=obs_data_get_bool(settings,"alpha");};
 info.start=[](void *data){return static_cast<Sender *>(data)->Start();};info.stop=[](void *data,uint64_t){static_cast<Sender *>(data)->Stop();};info.raw_video=[](void *data,video_data *v){static_cast<Sender *>(data)->Video(v);};info.raw_audio=[](void *data,audio_data *a){static_cast<Sender *>(data)->Audio(a);};info.get_total_bytes=[](void *data){return static_cast<Sender *>(data)->Bytes();};obs_register_output(&info);
}
}
