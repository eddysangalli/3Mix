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
 struct Context {const std::string &name;obs_output_t *ignore;bool found=false;};Context context={name,ignore};
 obs_enum_outputs([](void *param,obs_output_t *output){auto &c=*static_cast<Context *>(param);if(output==c.ignore||!obs_output_active(output))return true;const std::string id=obs_output_get_id(output);if(id!="freemix_omt_output"&&id!="freemix_omt_hdr_output")return true;OBSDataAutoRelease settings=obs_output_get_settings(output);c.found=std::string(obs_data_get_string(settings,"name"))==c.name||(obs_data_get_bool(settings,"fill_key")&&std::string(obs_data_get_string(settings,"key_name"))==c.name);return !c.found;},&context);return context.found;
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
 static bool registered=false;if(registered)return;registered=true;obs_output_info info={};info.id="freemix_omt_hdr_output";info.flags=OBS_OUTPUT_AV;info.get_name=[](void *){return "FreeMix OMT HDR (manual PQ/HLG receiver)";};
 info.create=[](obs_data_t *settings,obs_output_t *output)->void *{auto *s=new Sender();s->output=output;s->name=obs_data_get_string(settings,"name");s->transfer=obs_data_get_string(settings,"transfer");return s;};
 info.destroy=[](void *data){auto *s=static_cast<Sender *>(data);{std::lock_guard<std::mutex> lock(s->mutex);s->Destroy();}delete s;};
 info.start=[](void *data){return static_cast<Sender *>(data)->Start();};info.stop=[](void *data,uint64_t){static_cast<Sender *>(data)->Stop();};info.raw_video=[](void *data,video_data *v){static_cast<Sender *>(data)->Video(v);};info.raw_audio=[](void *data,audio_data *a){static_cast<Sender *>(data)->Audio(a);};info.get_total_bytes=[](void *data){return static_cast<Sender *>(data)->Bytes();};obs_register_output(&info);
}
struct Slot {
 OBSOutputAutoRelease output;obs_view_t *view=nullptr;OBSSourceAutoRelease source;std::unique_ptr<FreeMixSourceAudio> audio;
 void Stop(){if(output&&obs_output_active(output))obs_output_force_stop(output);output=nullptr;audio.reset();if(view){obs_view_remove(view);obs_view_set_source(view,0,nullptr);obs_view_destroy(view);view=nullptr;}source=nullptr;}
};
inline std::array<Slot,4> &Slots(){static std::array<Slot,4> hdrOutputs;return hdrOutputs;}
inline void StopAll(){for(auto &slot:Slots())slot.Stop();}
inline std::string Path(int id){char *folder=obs_frontend_get_current_profile_path();const std::string path=folder?std::string(folder)+"/freemix-omt-hdr-"+std::to_string(id)+".json":"";bfree(folder);return path;}
inline std::string Preflight(obs_data_t *config,bool (*isPrivate)(obs_source_t *)){
 if(!freemix_omt::Available())return "Official OMT SDK unavailable";
 const std::string transfer=obs_data_get_string(config,"transfer"),name=obs_data_get_string(config,"name");
 if(!Transfer(transfer)||!obs_data_get_bool(config,"manualReceiverConfirmed")||std::string(obs_data_get_string(config,"receiverTransfer"))!=transfer)return "Confirm the receiver's matching manual PQ/HLG transfer; OMT does not signal it automatically";
 if(obs_data_get_bool(config,"alpha")||obs_data_get_bool(config,"fillKey"))return "HDR alpha/FillKey is not supported by this P216 route; use SDR alpha or opaque HDR";
 if(name.empty()||name.size()>120)return "Unique HDR sender name required, up to120 characters";
 if(obs_data_get_int(config,"audioTrack")<0||obs_data_get_int(config,"audioTrack")>2)return "Select Master/A/B or a public independent audio UUID";
 OBSSourceAutoRelease source=obs_get_source_by_uuid(obs_data_get_string(config,"sourceUuid"));if(!source||isPrivate(source))return "Select an HDR source outside private director audio";
 const auto width=obs_source_get_width(source),height=obs_source_get_height(source);if(!width||!height||width%2||height%2||width>3840||height>3840)return "HDR source dimensions must be even, nonzero and at most3840";
 const auto space=obs_source_get_color_space(source,0,nullptr);if(space!=GS_CS_709_EXTENDED&&space!=GS_CS_709_SCRGB)return "Source does not declare HDR/float HDR; an SDR image must not be relabeled PQ/HLG. Wait for HDR media to load";
 const std::string audioUuid=obs_data_get_string(config,"audioSourceUuid");if(!audioUuid.empty()){OBSSourceAutoRelease audio=obs_get_source_by_uuid(audioUuid.c_str());if(!FreeMixAudioBusAllowed(audio))return "Select a public independent audio bus with global tracks disabled";}
 return "";
}
// Called exclusively on the interface thread by the FreeMix vendor wrapper.
inline void Request(obs_data_t *request,obs_data_t *response,bool (*isPrivate)(obs_source_t *)){
 struct SourceList {obs_data_array_t *rows;bool (*isPrivate)(obs_source_t *);};
 OBSDataArrayAutoRelease hdrSources=obs_data_array_create();SourceList list={hdrSources.Get(),isPrivate};
 auto enumerate=[](void *param,obs_source_t *source){auto &list=*static_cast<SourceList *>(param);if(list.isPrivate(source))return true;const auto space=obs_source_get_color_space(source,0,nullptr);const auto width=obs_source_get_width(source),height=obs_source_get_height(source);if((space==GS_CS_709_EXTENDED||space==GS_CS_709_SCRGB)&&width&&height&&!(width%2)&&!(height%2)&&width<=3840&&height<=3840){OBSDataAutoRelease row=obs_data_create();obs_data_set_string(row,"uuid",obs_source_get_uuid(source));obs_data_set_string(row,"name",obs_source_get_name(source));obs_data_set_int(row,"width",width);obs_data_set_int(row,"height",height);obs_data_array_push_back(list.rows,row);}return true;};
 obs_enum_sources(enumerate,&list);obs_enum_scenes(enumerate,&list);obs_data_set_array(response,"hdrSources",hdrSources);
 const auto id=obs_data_get_int(request,"senderId");
 if(id<0||id>3){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","Select HDR sender0..3");return;}
 auto &slot=Slots()[size_t(id)];const auto path=Path(int(id));
 OBSDataAutoRelease config=path.empty()?nullptr:obs_data_create_from_json_file(path.c_str());
 if(!config)config=obs_data_create();
 const std::string action=obs_data_get_string(request,"action");std::string error;
 if(action=="configure"){
  if(slot.output&&obs_output_active(slot.output))error="Stop HDR output before configuring";
  else{
   OBSDataAutoRelease proposed=obs_data_get_obj(request,"config");
   if(!proposed)error="HDR configuration missing";
   else{
    error=Preflight(proposed,isPrivate);
    if(error.empty()){
     if(IdentityInUse(obs_data_get_string(proposed,"name")))error="Choose a unique active OMT SDR/Key/HDR sender name";
     if(error.empty()){
      if(path.empty()||!obs_data_save_json_safe(proposed,path.c_str(),"tmp","bak"))error="Could not persist HDR config";
      else{config=obs_data_create();obs_data_apply(config,proposed);}
     }
    }
   }
  }
 }else if(action=="start"){
  if(!slot.output||!obs_output_active(slot.output)){
   error=Preflight(config,isPrivate);
   if(error.empty()){
    if(IdentityInUse(obs_data_get_string(config,"name")))error="Choose a unique active OMT SDR/Key/HDR sender name";
   }
   if(error.empty()){
    slot.Stop();slot.source=obs_get_source_by_uuid(obs_data_get_string(config,"sourceUuid"));
    obs_video_info info={};
    if(!obs_get_video_info(&info))error="Video context unavailable";
    else{
     info.base_width=info.output_width=obs_source_get_width(slot.source);info.base_height=info.output_height=obs_source_get_height(slot.source);
     info.output_format=VIDEO_FORMAT_P216;info.colorspace=ColorSpace(obs_data_get_string(config,"transfer"));info.range=VIDEO_RANGE_PARTIAL;
     slot.view=obs_view_create();
     if(!slot.view)error="HDR view unavailable";
     else{
      obs_view_set_source(slot.view,0,slot.source);auto *video=obs_view_add2(slot.view,&info);
      if(!video)error="Native HDR P216 view unavailable";
      else{
       const std::string audioUuid=obs_data_get_string(config,"audioSourceUuid");
       if(!audioUuid.empty())slot.audio=FreeMixSourceAudio::Open(audioUuid,"FreeMix OMT HDR PCM",error);
       if(error.empty()){
        slot.output=obs_output_create("freemix_omt_hdr_output",("FreeMix OMT HDR "+std::to_string(id+1)).c_str(),config,nullptr);
        if(!slot.output)error="HDR output unavailable";
        else{
         obs_output_set_media(slot.output,video,slot.audio?slot.audio->Audio():obs_get_audio());
         obs_output_set_mixers(slot.output,slot.audio?1ULL:1ULL<<uint32_t(obs_data_get_int(config,"audioTrack")));
         if(!obs_output_start(slot.output)){const char *last=obs_output_get_last_error(slot.output);error=last&&*last?last:"HDR output failed to start";}
        }
       }
      }
     }
    }
   }
   if(!error.empty())slot.Stop();
  }
 }else if(action=="stop")slot.Stop();else if(action!="state"&&action!="preflight")error="Invalid HDR action";
 if(action=="preflight"){OBSDataAutoRelease proposed=obs_data_get_obj(request,"config");error=Preflight(proposed?proposed.Get():config.Get(),isPrivate);}
 obs_data_set_bool(response,"success",error.empty());if(!error.empty())obs_data_set_string(response,"error",error.c_str());obs_data_set_bool(response,"available",freemix_omt::Available());obs_data_set_bool(response,"active",slot.output&&obs_output_active(slot.output));obs_data_set_obj(response,"config",config);obs_data_set_int(response,"senderId",id);obs_data_set_bool(response,"hdrSupported",freemix_omt::Available());obs_data_set_bool(response,"hdrAlphaSupported",false);obs_data_set_bool(response,"hdrTransferSignaled",false);obs_data_set_bool(response,"autoStart",false);obs_data_set_string(response,"pixelFormat","P216 limited-range16-bit native view");obs_data_set_string(response,"receiverContract","manual-matching-pq-or-hlg");obs_data_set_int(response,"capturedFrames",slot.output?int64_t(obs_output_get_total_frames(slot.output)):0);
}
}
