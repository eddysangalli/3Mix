// FreeMix per-instance OMT output using the official SDK (MIT).
// The original omtplugin output and its global settings remain available.
#pragma once
#include "vendor/freemix-omt/libomt.h"
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
#include "FreeMixPrecisionVideo.hpp"

namespace freemix_omt {
struct Sdk {
 QLibrary dll;
 decltype(&omt_send_create) create=nullptr;decltype(&omt_send_destroy) destroy=nullptr;decltype(&omt_send) send=nullptr;decltype(&omt_send_connections) connections=nullptr;decltype(&omt_send_getvideostatistics) videoStats=nullptr;decltype(&omt_send_getaudiostatistics) audioStats=nullptr;
 bool Ready(){
  if(create)return true;
  const QString path=QDir(QCoreApplication::applicationDirPath()).absoluteFilePath("../../obs-plugins/64bit/libomt.dll");
  dll.setFileName(QDir::cleanPath(path));dll.setLoadHints(QLibrary::PreventUnloadHint);if(!dll.load())return false;
  create=reinterpret_cast<decltype(create)>(dll.resolve("omt_send_create"));destroy=reinterpret_cast<decltype(destroy)>(dll.resolve("omt_send_destroy"));send=reinterpret_cast<decltype(send)>(dll.resolve("omt_send"));connections=reinterpret_cast<decltype(connections)>(dll.resolve("omt_send_connections"));videoStats=reinterpret_cast<decltype(videoStats)>(dll.resolve("omt_send_getvideostatistics"));audioStats=reinterpret_cast<decltype(audioStats)>(dll.resolve("omt_send_getaudiostatistics"));
  if(!create||!destroy||!send||!connections||!videoStats||!audioStats){create=nullptr;return false;}return true;
 }
};
inline Sdk &Api(){static Sdk api;return api;}
struct Sender;
inline std::mutex &RegistryMutex(){static std::mutex mutex;return mutex;}
inline std::map<obs_output_t *,Sender *> &Registry(){static std::map<obs_output_t *,Sender *> registry;return registry;}
struct Sender {
 obs_output_t *output=nullptr;omt_send_t *sender=nullptr,*keySender=nullptr;std::mutex mutex;std::string name,keyName,sourceUuid;int precisionBits=8;std::unique_ptr<FreeMixPrecisionVideo> precise;uint64_t lastPreciseTime=0;bool alpha=false,fillKey=false;uint32_t width=0,height=0;int fpsN=0,fpsD=1;std::vector<uint8_t> pixels,keyPixels;std::vector<float> samples;
 void DestroySenders(){if(keySender){Api().destroy(keySender);keySender=nullptr;}if(sender){Api().destroy(sender);sender=nullptr;}}
 void Stop(){obs_output_end_data_capture(output);precise.reset();std::lock_guard<std::mutex> lock(mutex);DestroySenders();}
 bool Start(){
  if(!Api().Ready()){obs_output_set_last_error(output,"Official OMT SDK libomt.dll is missing or incompatible");return false;}
  video_t *video=obs_output_video(output);audio_t *audio=obs_output_audio(output);if(!video||!audio){obs_output_set_last_error(output,"Video or audio is unavailable");return false;}
  width=video_output_get_width(video);height=video_output_get_height(video);const auto *vi=video_output_get_info(video);fpsN=int(vi->fps_num);fpsD=int(vi->fps_den);
  video_scale_info convert={};convert.format=VIDEO_FORMAT_BGRA;convert.width=width;convert.height=height;convert.colorspace=VIDEO_CS_709;convert.range=VIDEO_RANGE_FULL;obs_output_set_video_conversion(output,&convert);
  audio_convert_info ac={};ac.format=AUDIO_FORMAT_FLOAT_PLANAR;ac.speakers=SPEAKERS_STEREO;ac.samples_per_sec=48000;obs_output_set_audio_conversion(output,&ac);
  if(fillKey&&(keyName.empty()||keyName==name||keyName.size()>120)){obs_output_set_last_error(output,"Fill+Key requires a distinct Key name (up to 120 characters)");return false;}
  {std::lock_guard<std::mutex> lock(mutex);sender=Api().create(name.c_str(),OMTQuality_Default);if(sender&&fillKey)keySender=Api().create(keyName.c_str(),OMTQuality_Default);if(!sender||(fillKey&&!keySender)){DestroySenders();obs_output_set_last_error(output,"Official OMT SDK failed to create Fill+Key senders");return false;}}
  if(precisionBits==16){precise=std::make_unique<FreeMixPrecisionVideo>();if(!precise->Start(sourceUuid.c_str(),width,height)){precise.reset();std::lock_guard<std::mutex> lock(mutex);DestroySenders();obs_output_set_last_error(output,"RGBA16F render/staging unavailable");return false;}}
  if(!obs_output_begin_data_capture(output,0)){precise.reset();std::lock_guard<std::mutex> lock(mutex);DestroySenders();obs_output_set_last_error(output,"Could not attach OMT capture");return false;}return true;
 }
 void Video(video_data *data){std::lock_guard<std::mutex> lock(mutex);if(!sender||!data||!data->data[0])return;const size_t stride=size_t(width)*(precisionBits==16?2:4);uint64_t pts=data->timestamp;if(precise){if(!precise->Copy(pixels,pts)||pts==lastPreciseTime)return;lastPreciseTime=pts;}else{pixels.resize(stride*height);for(uint32_t y=0;y<height;y++)std::memcpy(pixels.data()+stride*y,data->data[0]+size_t(data->linesize[0])*y,stride);}if(fillKey&&precisionBits==8)freemix_fill_key::StraightRgb(pixels.data(),size_t(width)*height); OMTMediaFrame f={};f.Type=OMTFrameType_Video;f.Timestamp=int64_t(pts/100);f.Codec=precisionBits==16?OMTCodec_PA16:OMTCodec_BGRA;f.Width=int(width);f.Height=int(height);f.Stride=int(stride);f.FrameRateN=fpsN;f.FrameRateD=fpsD;f.AspectRatio=float(width)/float(height);f.ColorSpace=OMTColorSpace_BT709;f.Flags=(alpha||precisionBits==16)&&!fillKey?OMTVideoFlags(OMTVideoFlags_Alpha|OMTVideoFlags_PreMultiplied):OMTVideoFlags_None;f.Data=pixels.data();f.DataLength=int(pixels.size());Api().send(sender,&f);if(keySender){freemix_fill_key::MakeKey(pixels.data(),stride,width,height,keyPixels);f.Flags=OMTVideoFlags_None;f.Data=keyPixels.data();f.DataLength=int(keyPixels.size());Api().send(keySender,&f);}}
 void Audio(audio_data *data){std::lock_guard<std::mutex> lock(mutex);if(!sender||!data||!data->frames)return;samples.resize(size_t(data->frames)*2);for(size_t ch=0;ch<2;ch++){float *dest=samples.data()+ch*data->frames;if(data->data[ch])std::memcpy(dest,data->data[ch],size_t(data->frames)*sizeof(float));else std::memset(dest,0,size_t(data->frames)*sizeof(float));}OMTMediaFrame f={};f.Type=OMTFrameType_Audio;f.Timestamp=int64_t(data->timestamp/100);f.Codec=OMTCodec_FPA1;f.SampleRate=48000;f.Channels=2;f.SamplesPerChannel=int(data->frames);f.Data=samples.data();f.DataLength=int(samples.size()*sizeof(float));Api().send(sender,&f);}
 uint64_t Bytes(){std::lock_guard<std::mutex> lock(mutex);if(!sender)return 0;OMTStatistics v={},a={},k={};Api().videoStats(sender,&v);Api().audioStats(sender,&a);if(keySender)Api().videoStats(keySender,&k);return uint64_t(std::max<int64_t>(0,v.BytesSent+a.BytesSent+k.BytesSent));}
 int Connections(){std::lock_guard<std::mutex> lock(mutex);return sender?Api().connections(sender):0;}
};
inline bool Available(){return Api().Ready();}
inline int Connections(obs_output_t *output){if(!output||std::string(obs_output_get_id(output))!="freemix_omt_output")return -1;std::lock_guard<std::mutex> lock(RegistryMutex());const auto found=Registry().find(output);return found!=Registry().end()?found->second->Connections():-1;}
inline void Register(){
 static bool registered=false;if(registered)return;registered=true;obs_output_info info={};info.id="freemix_omt_output";info.flags=OBS_OUTPUT_AV;info.get_name=[](void *){return "3Mix OMT SDK (independent sender)";};
 info.create=[](obs_data_t *settings,obs_output_t *output)->void *{auto *s=new Sender();s->output=output;s->name=obs_data_get_string(settings,"name");s->keyName=obs_data_get_string(settings,"key_name");s->fillKey=obs_data_get_bool(settings,"fill_key");s->alpha=obs_data_get_bool(settings,"alpha");s->sourceUuid=obs_data_get_string(settings,"source_uuid");s->precisionBits=int(obs_data_get_int(settings,"precision_bits"));if(s->precisionBits!=16)s->precisionBits=8;{std::lock_guard<std::mutex> lock(RegistryMutex());Registry()[output]=s;}return s;};
 info.destroy=[](void *data){auto *s=static_cast<Sender *>(data);{std::lock_guard<std::mutex> lock(RegistryMutex());Registry().erase(s->output);}{std::lock_guard<std::mutex> lock(s->mutex);s->DestroySenders();}s->precise.reset();delete s;};
 info.update=[](void *data,obs_data_t *settings){auto *s=static_cast<Sender *>(data);if(obs_output_active(s->output))return;s->name=obs_data_get_string(settings,"name");s->keyName=obs_data_get_string(settings,"key_name");s->fillKey=obs_data_get_bool(settings,"fill_key");s->alpha=obs_data_get_bool(settings,"alpha");s->sourceUuid=obs_data_get_string(settings,"source_uuid");s->precisionBits=int(obs_data_get_int(settings,"precision_bits"));if(s->precisionBits!=16)s->precisionBits=8;};
 info.start=[](void *data){return static_cast<Sender *>(data)->Start();};info.stop=[](void *data,uint64_t){static_cast<Sender *>(data)->Stop();};info.raw_video=[](void *data,video_data *v){static_cast<Sender *>(data)->Video(v);};info.raw_audio=[](void *data,audio_data *a){static_cast<Sender *>(data)->Audio(a);};info.get_total_bytes=[](void *data){return static_cast<Sender *>(data)->Bytes();};obs_register_output(&info);
}
}
