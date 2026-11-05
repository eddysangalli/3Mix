// Explicit manual HDR contract, matching the official OMT P216 workflow.
// Transfer is NOT announced by OMT1.0: receiver must select PQ/HLG itself.
#pragma once
#include "FreeMixOmtOutput.hpp"
#include "FreeMixAudioRouting.hpp"
#include <obs-frontend-api.h>
#include <array>

namespace freemix_omt_hdr {
inline bool Transfer(const std::string &value){return value=="pq"||value=="hlg";}
inline video_colorspace ColorSpace(const std::string &value){return value=="pq"?VIDEO_CS_2100_PQ:VIDEO_CS_2100_HLG;}
// SDK identities are shared by SDR Fill/Key and dedicated opaque HDR senders.
inline bool IdentityInUse(const std::string &name,obs_output_t *ignore=nullptr){
 struct Context {const std::string &name;obs_output_t *ignore;bool found=false;};
 obs_enum_outputs([](void *param,obs_output_t *output){
  auto &c=*static_cast<Context *>(param);
  if(output==c.ignore||!obs_output_active(output))return true;
  const std::string id=obs_output_get_id(output);
  if(id!="freemix_omt_output"&&id!="freemix_omt_hdr_output")return true;
  OBSDataAutoRelease settings=obs_output_get_settings(output);
  c.found=std::string(obs_data_get_string(settings,"name"))==c.name||(obs_data_get_bool(settings,"fill_key")&&std::string(obs_data_get_string(settings,"key_name"))==c.name);
  return !c.found;
 },&context);return context.found;
}
struct Sender {
 obs_output_t *output=nullptr;omt_send_t *sender=nullptr;std::mutex mutex;
 std::string name,transfer;uint32_t width=0,height=0;int fpsN=0,fpsD=1;
 std::vector<uint8_t> pixels;std::vector<float> samples;uint64_t bytes=0;
 void Destroy(){if(sender){freemix_omt::Api().destroy(sender);sender=nullptr;}}
 void Stop(){obs_output_end_data_capture(output);std::lock_guard<std::mutex> lock(mutex);Destroy();}
 bool Start(){
  video_t *video=obs_output_video(output);const auto *v=video?video_output_get_info(video):nullptr;
  if(!freemix_omt::Available()||!v||!obs_output_audio(output)||!Transfer(transfer)||v->format!=VIDEO_FORMAT_P216||v->colorspace!=ColorSpace(transfer)||v->range!=VIDEO_RANGE_PARTIAL){obs_output_set_last_error(output,"OMT HDR requires native P216 limited-range PQ/HLG view and official SDK");return false;}
  width=v->width;height=v->height;fpsN=int(v->fps_num);fpsD=int(v->fps_den);
  video_scale_info conversion={};conversion.format=VIDEO_FORMAT_P216;conversion.width=width;conversion.height=height;conversion.colorspace=ColorSpace(transfer);conversion.range=VIDEO_RANGE_PARTIAL;obs_output_set_video_conversion(output,&conversion);
  audio_convert_info audio={};audio.format=AUDIO_FORMAT_FLOAT_PLANAR;audio.speakers=SPEAKERS_STEREO;audio.samples_per_sec=48000;obs_output_set_audio_conversion(output,&audio);
  {std::lock_guard<std::mutex> lock(mutex);sender=freemix_omt::Api().create(name.c_str(),OMTQuality_High);if(!sender){obs_output_set_last_error(output,"OMT HDR sender creation failed");return false;}}
  if(!obs_output_begin_data_capture(output,0)){std::lock_guard<std::mutex> lock(mutex);Destroy();obs_output_set_last_error(output,"OMT HDR capture failed");return false;}return true;
 }
 void Video(video_data *data){
  std::lock_guard<std::mutex> lock(mutex);const size_t stride=size_t(width)*2;
  if(!sender||!data||!data->data[0]||!data->data[1]||data->linesize[0]<stride||data->linesize[1]<stride)return;
  // Copy original 16-bit luma/chroma planes, never go through BGRA8/PA16 SDR.
  pixels.resize(stride*height*2);for(size_t plane=0;plane<2;plane++)for(uint32_t y=0;y<height;y++)std::memcpy(pixels.data()+stride*(size_t(plane)*height+y),data->data[plane]+size_t(data->linesize[plane])*y,stride);
  OMTMediaFrame frame={};frame.Type=OMTFrameType_Video;frame.Timestamp=int64_t(data->timestamp/100);frame.Codec=OMTCodec_P216;frame.Width=int(width);frame.Height=int(height);frame.Stride=int(stride);frame.FrameRateN=fpsN;frame.FrameRateD=fpsD;frame.AspectRatio=float(width)/height;frame.ColorSpace=OMTColorSpace_Undefined;frame.Flags=OMTVideoFlags_HighBitDepth;frame.Data=pixels.data();frame.DataLength=int(pixels.size());freemix_omt::Api().send(sender,&frame);bytes+=pixels.size();
 }
 void Audio(audio_data *data){
  std::lock_guard<std::mutex> lock(mutex);if(!sender||!data||!data->frames)return;samples.resize(size_t(data->frames)*2);for(size_t ch=0;ch<2;ch++){auto *dest=samples.data()+ch*data->frames;if(data->data[ch])std::memcpy(dest,data->data[ch],data->frames*sizeof(float));else std::fill_n(dest,data->frames,0.0f);}
  OMTMediaFrame frame={};frame.Type=OMTFrameType_Audio;frame.Timestamp=int64_t(data->timestamp/100);frame.Codec=OMTCodec_FPA1;frame.SampleRate=48000;frame.Channels=2;frame.SamplesPerChannel=int(data->frames);frame.Data=samples.data();frame.DataLength=int(samples.size()*sizeof(float));freemix_omt::Api().send(sender,&frame);bytes+=samples.size()*sizeof(float);
 }
 uint64_t Bytes(){std::lock_guard<std::mutex> lock(mutex);return bytes;}
};
inline void Register(){
 static bool registered=false;if(registered)return;registered=true;obs_output_info info={};info.id="freemix_omt_hdr_output";info.flags=OBS_OUTPUT_AV;info.get_name=[](void *){return "3Mix OMT HDR (manual PQ/HLG receiver)";};
 info.create=[](obs_data_t *settings,obs_output_t *output)->void *{auto *s=new Sender();s->output=output;s->name=obs_data_get_string(settings,"name");s->transfer=obs_data_get_string(settings,"transfer");return s;};
 info.destroy=[](void *data){auto *s=static_cast<Sender *>(data);{std::lock_guard<std::mutex> lock(s->mutex);s->Destroy();}delete s;};
 info.start=[](void *data){return static_cast<Sender *>(data)->Start();};info.stop=[](void *data,uint64_t){static_cast<Sender *>(data)->Stop();};info.raw_video=[](void *data,video_data *v){static_cast<Sender *>(data)->Video(v);};info.raw_audio=[](void *data,audio_data *a){static_cast<Sender *>(data)->Audio(a);};info.get_total_bytes=[](void *data){return static_cast<Sender *>(data)->Bytes();};obs_register_output(&info);
}
}