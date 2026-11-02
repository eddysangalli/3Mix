/******************************************************************************
    FreeMix: extra streaming destinations (multistream).

    The engine streams to one destination. This adds up to four more, which go on air together with it: each one
    is an output of its own that reuses the video and audio encoders of the main stream, so the picture is encoded
    once and sent to every destination. They start when the main stream starts and stop when it stops.

    The list is kept per profile in "freemix-destinos.json". The interface reaches it through the control server,
    vendor "freemix":
      get_destinations                      -> { destinations: [...], main_active, max }
      set_destinations { destinations: [] } -> saves the list and applies it at once (a destination switched on
                                               while the main stream is live starts right away)
    and is told about every change of state by the vendor event "destinations_changed".

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
******************************************************************************/

#include "FreeMixMultistream.hpp"
#include "FreeMixProjectPolicy.hpp"
#include "FreeMixProjectInventory.hpp"
#include "FreeMixOmtOutput.hpp"
#include "FreeMixOmtHdrOutput.hpp"
#include "FreeMixSrtHdrLifecycle.hpp"
#include "FreeMixNdiOutput.hpp"
#include "FreeMixSdiOutput.hpp"
#include "FreeMixSrtAlpha.hpp"
#include <chrono>
#include <QTimer>
#include <QUuid>
#include "FreeMixCenterColumn.hpp"
#include "FreeMixCallAudio.hpp"
#include "FreeMixCallVideo.hpp"
#include "FreeMixAudioRouting.hpp"
#include "FreeMixVideoTransports.hpp"
#include "OBSBasic.hpp"
#include <QBuffer>
#include <QDockWidget>
#include <QPixmap>
#include <QDialog>
#include <QSpinBox>
#include <QApplication>
#include <QDir>
#include <QFileInfo>
#include <QFile>
#include <QPointer>
#include <QScreen>
#include <QUrl>
#include <QVBoxLayout>
#ifdef BROWSER_AVAILABLE
#include <docks/BrowserDock.hpp>
#endif

#include <obs.hpp>
#include <obs-frontend-api.h>
#include <obs-service.h>
#include <graphics/vec2.h>
#include <util/dstr.h>

#include "../../plugins/obs-websocket/lib/obs-websocket-api.h"

#include <QCoreApplication>
#include <QMetaObject>

#include <array>
#include <atomic>
#include <algorithm>
#include <cmath>
#include <functional>
#include <mutex>
#include <map>
#include <set>
#include <string>
#include <deque>
#include <memory>
#include <vector>
#include <util/platform.h>

namespace {

constexpr size_t kMaxDestinations = 4;
bool KnownVideoCodec(const char *codec){return codec&&(std::string(codec)=="h264"||std::string(codec)=="hevc"||std::string(codec)=="av1");}
bool CodecIn(const char *list,const char *codec){if(!list||!*list)return true;const std::string all=std::string(";")+list+";";return codec&&all.find(std::string(";")+codec+";")!=std::string::npos;}
bool OutputLoaded(const char *wanted){const char *id;for(size_t i=0;obs_enum_output_types(i,&id);i++)if(std::string(id)==wanted)return true;return false;}
OBSDataArrayAutoRelease CodecList(const char *list){OBSDataArrayAutoRelease result=obs_data_array_create();for(const char *codec:{"h264","hevc","av1"})if(CodecIn(list,codec)){OBSDataAutoRelease item=obs_data_create();obs_data_set_string(item,"codec",codec);obs_data_array_push_back(result,item);}return result;}
struct HlsService {std::string server,key;};
void HlsUpdate(void *data,obs_data_t *settings){auto &s=*static_cast<HlsService *>(data);s.server=obs_data_get_string(settings,"server");s.key=obs_data_get_string(settings,"key");}
void RegisterHlsService(){
	static bool registered=false;if(registered)return;registered=true;
	obs_service_info info={};info.id="freemix_hls";
	info.get_name=[](void *){return "3Mix HLS (HTTP PUT)";};
	info.create=[](obs_data_t *settings,obs_service_t *)->void *{auto *s=new HlsService();HlsUpdate(s,settings);return s;};info.destroy=[](void *data){delete static_cast<HlsService *>(data);};info.update=HlsUpdate;
	info.get_protocol=[](void *){return "HLS";};info.get_output_type=[](void *){return "ffmpeg_hls_muxer";};
	info.get_url=[](void *data){return static_cast<HlsService *>(data)->server.c_str();};info.get_key=[](void *data){return static_cast<HlsService *>(data)->key.c_str();};
	info.get_connect_info=[](void *data,uint32_t type)->const char *{auto &s=*static_cast<HlsService *>(data);if(type==OBS_SERVICE_CONNECT_INFO_SERVER_URL)return s.server.c_str();if(type==OBS_SERVICE_CONNECT_INFO_STREAM_KEY)return s.key.c_str();return nullptr;};
	info.get_supported_video_codecs=[](void *)->const char **{static const char *h264[]={"h264",nullptr};static const char *hevc[]={"h264","hevc",nullptr};return CodecIn(obs_get_output_supported_video_codecs("ffmpeg_hls_muxer"),"hevc")?hevc:h264;};
	info.get_supported_audio_codecs=[](void *)->const char **{static const char *codecs[]={"aac",nullptr};return codecs;};
	info.apply_encoder_settings=[](void *,obs_data_t *video,obs_data_t *){if(video)obs_data_set_bool(video,"repeat_headers",true);};
	info.can_try_to_connect=[](void *data){const QUrl url(QString::fromStdString(static_cast<HlsService *>(data)->server));return url.isValid()&&(url.scheme()=="http"||url.scheme()=="https")&&!url.host().isEmpty();};
	info.get_properties=[](void *){auto *p=obs_properties_create();obs_properties_add_text(p,"server","URL HLS (.m3u8)",OBS_TEXT_DEFAULT);obs_properties_add_text(p,"key","Stream key ({stream_key} in URL)",OBS_TEXT_PASSWORD);return p;};
	obs_register_service(&info);
}
std::atomic<bool> frontendClosing = false;
QTimer *srtHdrTimer = nullptr;
bool IsPrivateSource(obs_source_t *source);
struct NetworkMedia {
 obs_view_t *view=nullptr;
 OBSSceneAutoRelease scene;
 std::string mode="program",sourceUuid,audioSourceUuid,name,groups,keyName;
 std::unique_ptr<FreeMixSourceAudio> sourceAudio;
 bool alpha=false,fillKey=false;int precisionBits=8;
 uint32_t audioTrack=0,width=0,height=0;
 void ClearView(){sourceAudio.reset();if(view){obs_view_remove(view);obs_view_set_source(view,0,nullptr);obs_view_destroy(view);view=nullptr;}scene=nullptr;}
 ~NetworkMedia(){ClearView();}
};
std::map<std::string, OBSOutputAutoRelease> networkOutputs;
std::map<std::string,std::unique_ptr<NetworkMedia>> networkMedia;
// GUI thread: startup/explicit start probes SDKs; state only reads these flags.
bool networkOmtSdkAvailable=false,networkNdiSdkAvailable=false;
void RetireStoppedNetworkMedia(obs_output_t *output,NetworkMedia &media)
{
 // Same terminal predicate/sequence as the former request cleanup.
 if(!(output&&obs_output_active(output))&&(media.view||media.sourceAudio)){
  if(output)obs_output_set_media(output,obs_get_video(),obs_get_audio());
  media.ClearView();
 }
}
void StopNetworkOutputs()
{
 FreeMixCallVideoStop();
 freemix_omt_hdr::StopAll();
 freemix_srt_hdr::StopAll();
 // Force stop/join the raw plugin callbacks before destroying their video view.
 for(auto &entry:networkOutputs)if(entry.second&&obs_output_active(entry.second))obs_output_force_stop(entry.second);
 networkOutputs.clear();networkMedia.clear();freemix_sdi::Stop();
 FreeMixResetVideoTransportInventory(); // metadata only; profile/collection/exit invalidate, never scan
}
void RequestFadeToBlack(obs_data_t *request,obs_data_t *response,void *)
{
 const QPointer<OBSBasic> main=OBSBasic::Get();
 const auto fail=[response](){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","O 3Mix está encerrando ou mudou de contexto. Nenhum FTB será enviado.");};
 if(!main||frontendClosing){fail();return;}
 const auto work=[main,request,response,fail](){if(!main||frontendClosing||main->isClosing()){fail();return;}main->FreeMixFadeToBlackRequest(request,response);};
 if(QThread::currentThread()==main->thread())work();
 else if(!QMetaObject::invokeMethod(main.data(),work,Qt::BlockingQueuedConnection))fail();
}

void RequestFinalProgramGate(obs_data_t *request,obs_data_t *response,void *)
{
 const QPointer<OBSBasic> main=OBSBasic::Get();
 const auto fail=[response](){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","O 3Mix está encerrando ou mudou de contexto. Nenhum FTB será enviado.");};
 if(!main||frontendClosing){fail();return;}
 const auto work=[main,request,response,fail](){if(!main||frontendClosing||main->isClosing()){fail();return;}main->FreeMixFinalProgramGateRequest(request,response);};
 if(QThread::currentThread()==main->thread())work();
 else if(!QMetaObject::invokeMethod(main.data(),work,Qt::BlockingQueuedConnection))fail();
}

// Abre a janela de um plugin VST pelo botão do próprio filtro. Só aceita filtro VST; não executa outro botão.
void RequestOpenVstEditor(obs_data_t *request,obs_data_t *response,void *){
	const std::string sourceName=obs_data_get_string(request,"sourceName"),filterName=obs_data_get_string(request,"filterName");
	QMetaObject::invokeMethod(OBSBasic::Get(),[&](){
		std::string error;
		if(frontendClosing)error="closing";
		else{
			OBSSourceAutoRelease source=obs_get_source_by_name(sourceName.c_str());
			OBSSourceAutoRelease filter=source?obs_source_get_filter_by_name(source,filterName.c_str()):nullptr;
			if(!filter||std::string(obs_source_get_id(filter))!="vst_filter")error="VST filter not found";
			else{
				obs_properties_t *props=obs_source_properties(filter);
				obs_property_t *button=props?obs_properties_get(props,"open_vst_settings"):nullptr;
				if(!button)error="VST filter has no editor";
				else obs_property_button_clicked(button,filter);
				obs_properties_destroy(props);
			}
		}
		obs_data_set_bool(response,"success",error.empty());
		if(!error.empty())obs_data_set_string(response,"error",error.c_str());
	},Qt::BlockingQueuedConnection);
}
void RequestSdiOutput(obs_data_t *request,obs_data_t *response,void *){QMetaObject::invokeMethod(OBSBasic::Get(),[=](){if(frontendClosing){obs_data_set_bool(response,"success",false);return;}freemix_sdi::Request(request,response,IsPrivateSource);},Qt::BlockingQueuedConnection);}
void RequestSrtHdrOutput(obs_data_t *request,obs_data_t *response,void *){
 auto *main=OBSBasic::Get();if(!main){obs_data_set_bool(response,"success",false);return;}
 const auto work=[=](){if(frontendClosing){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","frontend is closing or changing context");return;}freemix_srt_hdr::Request(request,response,IsPrivateSource);};
 if(QThread::currentThread()==main->thread())work();else QMetaObject::invokeMethod(main,work,Qt::BlockingQueuedConnection);
}
void RequestCallVideo(obs_data_t *request,obs_data_t *response,void *){
 auto *main=OBSBasic::Get();if(!main){obs_data_set_bool(response,"success",false);return;}
 const auto work=[=](){
  const std::string action=obs_data_get_string(request,"action");
  if(frontendClosing&&action!="state"&&action!="stop"){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","frontend is closing or changing context");return;}
  FreeMixCallVideoRequest(request,response,IsPrivateSource);
 };
 if(QThread::currentThread()==main->thread())work();else QMetaObject::invokeMethod(main,work,Qt::BlockingQueuedConnection);
}
void RequestOmtHdrOutput(obs_data_t *request,obs_data_t *response,void *){QMetaObject::invokeMethod(OBSBasic::Get(),[=](){if(frontendClosing){obs_data_set_bool(response,"success",false);return;}freemix_omt_hdr::Request(request,response,IsPrivateSource);},Qt::BlockingQueuedConnection);}
void RequestNetworkOutput(obs_data_t *request, obs_data_t *response, void *)
{
 const std::string protocol=obs_data_get_string(request,"protocol"),action=obs_data_get_string(request,"action");
 const std::string requestedName=obs_data_get_string(request,"name"),groups=obs_data_get_string(request,"groups");
 const std::string requestedMode=obs_data_has_user_value(request,"mode")?obs_data_get_string(request,"mode"):"program",requestedUuid=obs_data_get_string(request,"sourceUuid");
 const int64_t requestedTrack=obs_data_has_user_value(request,"audioTrack")?obs_data_get_int(request,"audioTrack"):0;
 const std::string requestedAudioUuid=obs_data_get_string(request,"audioSourceUuid");
 const bool hasGroups=obs_data_has_user_value(request,"groups");
 const int64_t senderId=obs_data_has_user_value(request,"senderId")?obs_data_get_int(request,"senderId"):0;
 const bool requestedAlpha=obs_data_get_bool(request,"alpha");
 const int precision=obs_data_has_user_value(request,"precisionBits")?int(obs_data_get_int(request,"precisionBits")):8;const bool hdr=obs_data_get_bool(request,"hdr");
 const bool requestedFillKey=obs_data_get_bool(request,"fillKey");const std::string requestedKeyName=obs_data_get_string(request,"keyName");
 QMetaObject::invokeMethod(OBSBasic::Get(),[=](){
  if(frontendClosing){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","frontend is closing");return;}
  if(action=="start"){
   if(protocol=="OMT")networkOmtSdkAvailable=freemix_omt::Available();
   else if(protocol=="NDI")networkNdiSdkAvailable=freemix_ndi::Available();
  }
  const bool omtSdk=protocol=="OMT"&&networkOmtSdkAvailable;const bool ndiSdk=protocol=="NDI"&&networkNdiSdkAvailable;
  const char *type=protocol=="NDI"?(requestedFillKey?"freemix_ndi_output":"ndi_output"):protocol=="OMT"?(senderId>0||!requestedName.empty()||requestedFillKey||precision==16?"freemix_omt_output":"omtoutput"):nullptr;
  const std::string outputName="3Mix "+protocol+(senderId==0?" Main Output":" Sender "+std::to_string(senderId+1));std::string error;
  const std::string senderKey=protocol+":"+std::to_string(senderId);
  const bool available=type&&OutputLoaded(type)&&(std::string(type)!="freemix_omt_output"||omtSdk);
  obs_data_set_bool(response,"available",available);obs_data_set_string(response,"outputName",outputName.c_str());
  obs_data_set_bool(response,"fillKeySupported",omtSdk||ndiSdk);obs_data_set_int(response,"precisionBits",8);obs_data_set_bool(response,"pa16Supported",omtSdk);obs_data_set_bool(response,"hdrSupported",false);
  obs_data_set_bool(response,"sourceIndependent",true);obs_data_set_bool(response,"audioSourceSelectable",true);obs_data_set_bool(response,"audioTrackSelectable",true);obs_data_set_int(response,"maxAudioTrack",2);obs_data_set_int(response,"sendersPerProtocol",protocol=="NDI"||omtSdk?4:1);obs_data_set_bool(response,"alphaSupported",true);obs_data_set_bool(response,"networkNameEditable",protocol=="NDI"||omtSdk);
  if(!type||senderId<0||senderId>3||(senderId>0&&protocol=="OMT"&&!omtSdk)||!(action=="state"||action=="start"||action=="stop")){obs_data_set_bool(response,"active",false);obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","invalid network output request");return;}
  // Empty stack defaults own no view/audio/output and do not alter either map.
  OBSOutputAutoRelease missingOutput;NetworkMedia missingMedia;
  const auto outputFound=networkOutputs.find(senderKey);
  const auto mediaFound=networkMedia.find(senderKey);
  OBSOutputAutoRelease &output=action=="state"?(outputFound!=networkOutputs.end()?outputFound->second:missingOutput):networkOutputs[senderKey];
  NetworkMedia *selectedMedia=nullptr;
  if(action=="state"){
   if(mediaFound!=networkMedia.end()&&mediaFound->second)selectedMedia=mediaFound->second.get();
  }else{
   auto &holder=networkMedia[senderKey];if(!holder)holder=std::make_unique<NetworkMedia>();selectedMedia=holder.get();
  }
  auto &media=selectedMedia?*selectedMedia:missingMedia;
  if(action=="start"&&(hdr||!(precision==8||precision==16)||precision==16&&(!omtSdk||requestedMode!="source"||requestedFillKey)))error="PA16 requires OMT SDR independent source, without Fill+Key; HDR metadata unsupported by SDK";
  else if(action=="start"&&requestedFillKey&&(!(omtSdk||ndiSdk)||requestedMode!="source"))error="Fill+Key requires official NDI/OMT SDK and independent source";
  else if(action=="start"&&requestedAlpha&&requestedMode!="source")error="alpha requires an independent source or composition";
  else if(action=="start"&&!available)error="network backend or runtime not loaded";
  else if(action=="start"&&(requestedName.size()>120||groups.size()>300))error="network name or groups too long";
  else if(action=="start"&&(requestedMode!="program"&&requestedMode!="source"))error="select Program or a source UUID for this network output";
  else if(action=="start"&&(requestedTrack<0||requestedTrack>2))error="select Master, Bus A or Bus B for this network output";
  if(error.empty()&&action=="start"){
   if(output&&obs_output_active(output)){
    OBSDataAutoRelease current=obs_output_get_settings(output);
    if(media.mode!=requestedMode||media.sourceUuid!=(requestedMode=="source"?requestedUuid:"")||media.audioSourceUuid!=requestedAudioUuid||media.audioTrack!=uint32_t(requestedTrack)||media.alpha!=requestedAlpha||media.fillKey!=requestedFillKey||media.precisionBits!=precision||(requestedFillKey&&!requestedKeyName.empty()&&media.keyName!=requestedKeyName)||(protocol=="OMT"&&!requestedName.empty()&&media.name!=requestedName)||(protocol=="NDI"&&((!requestedName.empty()&&requestedName!=obs_data_get_string(current,"ndi_name"))||(hasGroups&&groups!=obs_data_get_string(current,"ndi_groups")))))error="stop output before changing network content, audio or settings";
   }else{
    OBSDataAutoRelease settings=obs_data_create();
    const std::string networkName=requestedName.empty()?(protocol=="NDI"?(senderId==0?"3Mix Programa":"3Mix NDI "+std::to_string(senderId+1)):"3Mix OMT "+std::to_string(senderId+1)):requestedName;
    const std::string keyName=requestedFillKey?(requestedKeyName.empty()?networkName+" Key":requestedKeyName):"";
    if(requestedFillKey&&(keyName.empty()||keyName.size()>120||keyName==networkName))error="Fill and Key require different names up to 120 characters";
    if(protocol=="OMT"&&(freemix_omt_hdr::IdentityInUse(networkName,output)||(requestedFillKey&&freemix_omt_hdr::IdentityInUse(keyName,output))))error="choose a unique OMT SDR/Key/HDR network name for each active sender";
    if(protocol=="OMT"&&std::string(type)=="freemix_omt_output"){obs_data_set_string(settings,"name",networkName.c_str());obs_data_set_bool(settings,"alpha",requestedAlpha||requestedFillKey);obs_data_set_bool(settings,"fill_key",requestedFillKey);obs_data_set_string(settings,"key_name",keyName.c_str());obs_data_set_int(settings,"precision_bits",precision);obs_data_set_string(settings,"source_uuid",requestedUuid.c_str());}
    for(const auto &entry:networkMedia){if(entry.first!=senderKey&&entry.first.rfind(protocol+":",0)==0&&entry.second->name==networkName){const auto existing=networkOutputs.find(entry.first);if(existing!=networkOutputs.end()&&existing->second&&obs_output_active(existing->second))error="choose a unique network name for each active sender";}}
    for(const auto &entry:networkMedia)if(entry.first!=senderKey&&entry.first.rfind(protocol+":",0)==0){const auto existing=networkOutputs.find(entry.first);if(existing!=networkOutputs.end()&&existing->second&&obs_output_active(existing->second)){const auto &other=*entry.second;if((!other.keyName.empty()&&other.keyName==networkName)||(requestedFillKey&&(other.name==keyName||other.keyName==keyName)))error="Fill/Key names must be unique across active senders";}}
    if(protocol=="NDI"){
     obs_data_set_bool(settings,"fill_key",requestedFillKey);obs_data_set_string(settings,"key_name",keyName.c_str());
     OBSDataAutoRelease previous=output?obs_output_get_settings(output):nullptr;
     obs_data_set_string(settings,"ndi_name",requestedName.empty()?(previous?obs_data_get_string(previous,"ndi_name"):networkName.c_str()):requestedName.c_str());
     obs_data_set_string(settings,"ndi_groups",hasGroups?groups.c_str():previous?obs_data_get_string(previous,"ndi_groups"):"");
     obs_data_set_bool(settings,"uses_video",true);obs_data_set_bool(settings,"uses_audio",true);
    }
    // Raw outputs store video pointers. Detach the old view before releasing it.
    if(output)obs_output_set_media(output,obs_get_video(),obs_get_audio());media.ClearView();
    video_t *video=obs_get_video();obs_video_info info={};
    if(!obs_get_video_info(&info)||!obs_get_audio())error="video or audio context unavailable";
    OBSSourceAutoRelease source;
    if(error.empty()&&requestedMode=="source"){
     source=obs_get_source_by_uuid(requestedUuid.c_str());
     if(!source||IsPrivateSource(source))error="select a source outside private director audio";
     else{
      const uint32_t width=obs_source_get_width(source),height=obs_source_get_height(source);
      if(!width||!height||width>3840||height>3840||width%2||height%2)error="source dimensions must be even, nonzero and at most 3840";
      else{
       info.base_width=info.output_width=width;info.base_height=info.output_height=height;info.output_format=requestedAlpha||requestedFillKey?VIDEO_FORMAT_BGRA:VIDEO_FORMAT_NV12;
       info.colorspace=VIDEO_CS_709;info.range=VIDEO_RANGE_FULL;
       media.scene=obs_scene_create_private(outputName.c_str());
       if(!media.scene||!obs_scene_add(media.scene,source))error="could not create independent network scene";
       else{
        media.view=obs_view_create();
        if(!media.view)error="could not create independent network view";
        else{obs_view_set_source(media.view,0,obs_scene_get_source(media.scene));video=obs_view_add2(media.view,&info);if(!video)error="could not create independent network video";}
       }
      }
     }
    }
    if(error.empty()&&!requestedAudioUuid.empty())media.sourceAudio=FreeMixSourceAudio::Open(requestedAudioUuid,outputName+" PCM",error);
    if(error.empty()){
     if(output&&std::string(obs_output_get_id(output))!=type)output=nullptr;
     if(!output)output=obs_output_create(type,outputName.c_str(),settings,nullptr);else obs_output_update(output,settings);
     if(!output)error="network output creation failed";
     else{
      obs_output_set_media(output,video,media.sourceAudio?media.sourceAudio->Audio():obs_get_audio());obs_output_set_mixers(output,media.sourceAudio?1ULL:1ULL<<uint32_t(requestedTrack));
      if(!obs_output_start(output)){const char *last=obs_output_get_last_error(output);error=last&&*last?last:"network output did not start";}
      else{media.mode=requestedMode;media.sourceUuid=requestedMode=="source"?requestedUuid:"";media.audioSourceUuid=requestedAudioUuid;media.audioTrack=uint32_t(requestedTrack);media.width=video_output_get_width(video);media.height=video_output_get_height(video);media.name=protocol=="NDI"?obs_data_get_string(settings,"ndi_name"):std::string(type)=="freemix_omt_output"?networkName:"";media.groups=groups;media.alpha=requestedAlpha;media.fillKey=requestedFillKey;media.keyName=keyName;media.precisionBits=precision;}
     }
    }
    if(!error.empty()){if(output&&!obs_output_active(output))obs_output_set_media(output,obs_get_video(),obs_get_audio());media.ClearView();}
   }
  }else if(error.empty()&&action=="stop"&&output&&obs_output_active(output))obs_output_stop(output);
  const bool active=output&&obs_output_active(output);
  // A stopped raw plugin has ended data capture; its view can now be released.
  if(action!="state")RetireStoppedNetworkMedia(output,media);
  obs_data_set_bool(response,"active",active);obs_data_set_string(response,"mode",media.mode.c_str());obs_data_set_string(response,"sourceUuid",media.sourceUuid.c_str());obs_data_set_int(response,"audioTrack",media.audioTrack);obs_data_set_int(response,"width",media.width);obs_data_set_int(response,"height",media.height);
  obs_data_set_string(response,"audioSourceUuid",media.audioSourceUuid.c_str());
  obs_data_set_int(response,"precisionBits",media.precisionBits);obs_data_set_bool(response,"fillKey",media.fillKey);obs_data_set_string(response,"keyName",media.keyName.c_str());
  obs_data_set_int(response,"senderId",senderId);obs_data_set_bool(response,"alpha",media.alpha);obs_data_set_int(response,"capturedFrames",output?int64_t(obs_output_get_total_frames(output)):0);
  const int connections=protocol=="NDI"?freemix_ndi::Connections(output):freemix_omt::Connections(output);obs_data_set_int(response,"connections",connections);obs_data_set_string(response,"receiverStatus",connections<0?"unknown":connections>0?"connected":"disconnected");obs_data_set_string(response,"backend",output?obs_output_get_id(output):type);
  if(output&&protocol=="NDI"){OBSDataAutoRelease settings=obs_output_get_settings(output);obs_data_set_string(response,"networkName",obs_data_get_string(settings,"ndi_name"));obs_data_set_string(response,"groups",obs_data_get_string(settings,"ndi_groups"));}
  else if(protocol=="OMT"&&output&&std::string(obs_output_get_id(output))=="freemix_omt_output")obs_data_set_string(response,"networkName",media.name.c_str());
  else if(protocol=="OMT"){
   OBSDataAutoRelease settings;OBSSourceAutoRelease config=obs_get_source_by_name("OMT Output Settings");
   if(config)settings=obs_source_get_settings(config);
   else if(auto *module=obs_get_module("omtplugin")){char *path=obs_module_get_config_path(module,"omtplugin.json");if(path){settings=obs_data_create_from_json_file(path);bfree(path);}}
   const char *name=settings?obs_data_get_string(settings,"nameProperty"):nullptr;obs_data_set_string(response,"networkName",name&&*name?name:"OBS Output");
  }
  else obs_data_set_string(response,"networkName","3Mix Programa");
  OBSDataArrayAutoRelease senders=obs_data_array_create();for(int n=0;n<(protocol=="NDI"||omtSdk?4:1);n++){const std::string key=protocol+":"+std::to_string(n);const auto o=networkOutputs.find(key);const auto m=networkMedia.find(key);OBSDataAutoRelease item=obs_data_create();obs_data_set_int(item,"senderId",n);const bool on=o!=networkOutputs.end()&&o->second&&obs_output_active(o->second);obs_data_set_bool(item,"active",on);obs_data_set_bool(item,"outputCreated",o!=networkOutputs.end()&&o->second);obs_data_set_string(item,"backend",o!=networkOutputs.end()&&o->second?obs_output_get_id(o->second):type);if(m!=networkMedia.end()||n==senderId){const auto &state=m!=networkMedia.end()?*m->second:missingMedia;obs_data_set_string(item,"mode",state.mode.c_str());obs_data_set_string(item,"sourceUuid",state.sourceUuid.c_str());obs_data_set_string(item,"networkName",state.name.c_str());obs_data_set_int(item,"audioTrack",state.audioTrack);obs_data_set_string(item,"audioSourceUuid",state.audioSourceUuid.c_str());obs_data_set_bool(item,"alpha",state.alpha);obs_data_set_int(item,"precisionBits",state.precisionBits);obs_data_set_string(item,"groups",state.groups.c_str());obs_data_set_bool(item,"fillKey",state.fillKey);obs_data_set_string(item,"keyName",state.keyName.c_str());obs_data_set_int(item,"width",state.width);obs_data_set_int(item,"height",state.height);}const int connected=o!=networkOutputs.end()?(protocol=="NDI"?freemix_ndi::Connections(o->second):freemix_omt::Connections(o->second)):-1;obs_data_set_int(item,"connections",connected);obs_data_set_string(item,"receiverStatus",connected<0?"unknown":connected>0?"connected":"disconnected");obs_data_set_int(item,"capturedFrames",o!=networkOutputs.end()&&o->second?int64_t(obs_output_get_total_frames(o->second)):0);obs_data_array_push_back(senders,item);}obs_data_set_array(response,"senders",senders);
  obs_data_set_bool(response,"success",error.empty());if(!error.empty())obs_data_set_string(response,"error",error.c_str());
 },Qt::BlockingQueuedConnection);
}

// Bounded PCM history used only by independent destination encoders. Nothing
// in this path writes to an OBS bus, monitor, virtual device or Call return.
struct MixAudioPacket {
	uint64_t timestamp=0;
	uint32_t frames=0;
	std::vector<float> pcm;
};
struct MixAudioTape {
	std::mutex mutex;
	std::deque<MixAudioPacket> packets;
	uint32_t rate=48000,channels=2;
	int64_t offset=0;
	uint64_t lastTimestamp=0;
	bool clockStarted=false;
	uint64_t capturedPackets=0;
	float capturedPeak=0;
};
void StoreMixAudio(MixAudioTape &tape,const audio_data *data,float gain,bool alignClock)
{
	if(!data||!data->frames||data->frames>8192)return;
	MixAudioPacket packet;packet.timestamp=data->timestamp;packet.frames=data->frames;packet.pcm.resize(size_t(data->frames)*tape.channels);
	for(uint32_t ch=0;ch<tape.channels;ch++)for(uint32_t f=0;f<data->frames;f++)packet.pcm[size_t(ch)*data->frames+f]=data->data[ch]?reinterpret_cast<const float *>(data->data[ch])[f]*gain:0.0f;
	std::lock_guard<std::mutex> lock(tape.mutex);
	++tape.capturedPackets;for(float sample:packet.pcm)tape.capturedPeak=std::max(tape.capturedPeak,std::abs(sample));
	if(alignClock){
		const uint64_t now=os_gettime_ns(),duration=audio_frames_to_ns(tape.rate,data->frames);
		int64_t aligned=int64_t(data->timestamp)+tape.offset;
		if(!tape.clockStarted||data->timestamp<tape.lastTimestamp||aligned>int64_t(now)+100000000LL||aligned<int64_t(now)-750000000LL){tape.offset=int64_t(now>duration?now-duration:0)-int64_t(data->timestamp);tape.clockStarted=true;}
		tape.lastTimestamp=data->timestamp;aligned=int64_t(data->timestamp)+tape.offset;packet.timestamp=uint64_t(std::max<int64_t>(0,aligned));
	}
	while(tape.packets.size()>=96)tape.packets.pop_front();tape.packets.push_back(std::move(packet));
}
struct MixStingerTap {
	OBSSourceAutoRelease source;
	std::shared_ptr<MixAudioTape> tape;
};
void CaptureStingerAudio(void *param,obs_source_t *source,const audio_data *data,bool)
{
	auto *tap=static_cast<MixStingerTap *>(param);
	// The source is our private clone, muted in every global bus. Capture the
	// pre-mute samples deliberately; never attach this callback to input scenes.
	StoreMixAudio(*tap->tape,data,obs_source_get_volume(source),true);
}
#include "FreeMixMixEffectManager.hpp"

struct DestinationAudioMix {
	std::string name;
	MixAudioTape bus;
	std::shared_ptr<MixAudioTape> stinger;
	uint32_t track=0;
};
void CaptureDestinationBus(void *param,size_t,audio_data *data)
{
	StoreMixAudio(static_cast<DestinationAudioMix *>(param)->bus,data,1.0f,false);
}
void AddTapeSamples(MixAudioTape &tape,uint64_t timestamp,float **target)
{
	std::lock_guard<std::mutex> lock(tape.mutex);
	for(const auto &packet:tape.packets){
		const int64_t begin=int64_t((static_cast<long double>(packet.timestamp)-static_cast<long double>(timestamp))*tape.rate/1000000000.0L);
		if(begin>=AUDIO_OUTPUT_FRAMES||begin+packet.frames<=0)continue;
		const uint32_t first=uint32_t(std::max<int64_t>(0,-begin)),last=uint32_t(std::min<int64_t>(packet.frames,AUDIO_OUTPUT_FRAMES-begin));
		for(uint32_t ch=0;ch<tape.channels;ch++)if(target[ch])for(uint32_t f=first;f<last;f++)target[ch][begin+f]+=packet.pcm[size_t(ch)*packet.frames+f];
	}
}
bool ReadDestinationAudio(void *param,uint64_t start,uint64_t,uint64_t *newTimestamp,uint32_t activeMixers,audio_output_data *data)
{
	auto &mix=*static_cast<DestinationAudioMix *>(param);*newTimestamp=start;
	// A short bounded buffer lets the global bus and private media producer
	// reach this encoder's clock. The selected destination alone gets this delay.
	const uint64_t readTimestamp=start>80000000ULL?start-80000000ULL:0;
	for(size_t n=0;n<MAX_AUDIO_MIXES;n++)if(activeMixers&(1u<<n)){
		AddTapeSamples(mix.bus,readTimestamp,data[n].data);if(mix.stinger)AddTapeSamples(*mix.stinger,readTimestamp,data[n].data);
		for(uint32_t ch=0;ch<mix.bus.channels;ch++)if(data[n].data[ch])for(size_t f=0;f<AUDIO_OUTPUT_FRAMES;f++)data[n].data[ch][f]=std::clamp(data[n].data[ch][f],-1.0f,1.0f);
	}
	return true;
}

// Key is a matte, not a second audible programme. Keep a silent AAC track for
// MPEG-TS compatibility while preventing doubled audio in Fill/Key receivers.
bool ReadSilentKeyAudio(void *,uint64_t start,uint64_t,uint64_t *newTimestamp,uint32_t activeMixers,audio_output_data *data)
{
 *newTimestamp=start;
 for(size_t n=0;n<MAX_AUDIO_MIXES;n++)if(activeMixers&(1u<<n))
  for(size_t ch=0;ch<MAX_AV_PLANES;ch++)if(data[n].data[ch])
   std::fill_n(data[n].data[ch],AUDIO_OUTPUT_FRAMES,0.0f);
 return true;
}

struct Destination {
	/* Saved with the profile. */
	std::string name;
	std::string server;
	std::string key;
	std::string protocol="auto";
	bool enhancedRtmp=false;
	bool enabled = false;
	// Missing fields preserve the original shared-encoder behavior.
	std::string mode = "shared"; // shared, program, source
	std::string sourceUuid;
	std::string audioSourceUuid;
	uint32_t width = 1280, height = 720;
	uint32_t bitrate = 4000, audioTrack = 0, mixId = 2;
	bool stingerAudio=true;
	std::string encoder = "obs_x264";
	std::string chroma = "420", alphaMode = "none";
	uint32_t fpsDivisor = 1, overlaysMask = 0;
	std::array<uint32_t,8> overlayChannels = {7,8,9,10,11,12,13,14};
	bool autoStart = true;
	bool fill = false;
	bool manuallyStarted = false;
	bool manuallyStopped = false;
	std::string recordPath;

	/* While running. Outputs are created and released on the interface thread only. */
	OBSOutputAutoRelease output;
	std::atomic<uint64_t> outputGeneration = 0;
	OBSServiceAutoRelease service;
	OBSEncoderAutoRelease videoEncoder;
	OBSEncoderAutoRelease audioEncoder;
	audio_t *independentAudio=nullptr;
	std::unique_ptr<DestinationAudioMix> audioMix;
	std::unique_ptr<FreeMixSourceAudio> sourceAudio;
	obs_view_t *view = nullptr;
	obs_scene_t *renderScene = nullptr;
	OBSSourceAutoRelease packedAlphaSource;
	obs_sceneitem_t *contentItem = nullptr;
	std::array<obs_scene_t *,8> overlayFrames = {};
	std::array<obs_sceneitem_t *,8> packedOverlayItems = {};
	std::array<std::string,8> overlayUuids;
	std::string renderedUuid;
	bool restart = false;
	std::string state = "idle"; /* idle, starting, live, error */
	std::string error;
};

void WriteVideoConfig(obs_data_t *item, const Destination &d)
{
	obs_data_set_string(item, "mode", d.mode.c_str());
	obs_data_set_string(item,"protocol",d.protocol.c_str());
	obs_data_set_bool(item,"enhancedRtmp",d.enhancedRtmp);
	obs_data_set_string(item, "sourceUuid", d.sourceUuid.c_str());
	obs_data_set_int(item, "width", d.width);
	obs_data_set_int(item, "height", d.height);
	obs_data_set_int(item, "bitrate", d.bitrate);
	obs_data_set_int(item, "audioTrack", d.audioTrack);
	obs_data_set_string(item,"audioSourceUuid",d.audioSourceUuid.c_str());
	obs_data_set_int(item,"mixId",d.mixId);
	obs_data_set_bool(item,"stingerAudio",d.stingerAudio);
	obs_data_set_string(item, "encoder", d.encoder.c_str());
	obs_data_set_string(item,"chroma",d.chroma.c_str());
	obs_data_set_string(item,"alphaMode",d.alphaMode.c_str());
	obs_data_set_int(item, "fpsDivisor", d.fpsDivisor);
	obs_data_set_int(item, "overlaysMask", d.overlaysMask);
	OBSDataArrayAutoRelease channels=obs_data_array_create();for(const auto channel:d.overlayChannels){OBSDataAutoRelease c=obs_data_create();obs_data_set_int(c,"channel",channel);obs_data_array_push_back(channels,c);}obs_data_set_array(item,"overlayChannels",channels);
	obs_data_set_bool(item, "autoStart", d.autoStart);
	obs_data_set_bool(item, "fill", d.fill);
}
void ReadVideoConfig(obs_data_t *item, Destination &d)
{
	d.mode = obs_data_has_user_value(item, "mode") ? obs_data_get_string(item, "mode") : "shared";
	d.protocol=obs_data_has_user_value(item,"protocol")?obs_data_get_string(item,"protocol"):"auto";
	d.enhancedRtmp=obs_data_get_bool(item,"enhancedRtmp");
	d.sourceUuid = obs_data_get_string(item, "sourceUuid");
	d.width = obs_data_has_user_value(item, "width") ? uint32_t(obs_data_get_int(item, "width")) : 1280;
	d.height = obs_data_has_user_value(item, "height") ? uint32_t(obs_data_get_int(item, "height")) : 720;
	d.bitrate = obs_data_has_user_value(item, "bitrate") ? uint32_t(obs_data_get_int(item, "bitrate")) : 4000;
	d.audioTrack = uint32_t(obs_data_get_int(item, "audioTrack"));
	d.audioSourceUuid=obs_data_get_string(item,"audioSourceUuid");
	d.mixId=obs_data_has_user_value(item,"mixId")?uint32_t(obs_data_get_int(item,"mixId")):2;
	d.stingerAudio=!obs_data_has_user_value(item,"stingerAudio")||obs_data_get_bool(item,"stingerAudio");
	d.encoder = obs_data_has_user_value(item, "encoder") ? obs_data_get_string(item, "encoder") : "obs_x264";
	d.chroma = obs_data_has_user_value(item,"chroma") ? obs_data_get_string(item,"chroma") : "420";
	d.alphaMode = obs_data_has_user_value(item,"alphaMode") ? obs_data_get_string(item,"alphaMode") : "none";
	d.fpsDivisor = obs_data_has_user_value(item, "fpsDivisor") ? uint32_t(obs_data_get_int(item, "fpsDivisor")) : 1;
	d.overlaysMask = uint32_t(obs_data_get_int(item, "overlaysMask"));
	OBSDataArrayAutoRelease channels=obs_data_get_array(item,"overlayChannels");if(channels&&obs_data_array_count(channels)==8){for(size_t i=0;i<8;i++){OBSDataAutoRelease c=obs_data_array_item(channels,i);d.overlayChannels[i]=uint32_t(obs_data_get_int(c,"channel"));}}else d.overlayChannels={7,8,9,10,11,12,13,14};
	d.autoStart = !obs_data_has_user_value(item, "autoStart") || obs_data_get_bool(item, "autoStart");
	d.fill = obs_data_get_bool(item, "fill");
}
bool SameVideoConfig(const Destination &a, const Destination &b)
{
	return a.chroma==b.chroma&&a.alphaMode==b.alphaMode&&a.audioSourceUuid==b.audioSourceUuid&&a.enhancedRtmp==b.enhancedRtmp&&a.protocol==b.protocol&&a.mode == b.mode && a.sourceUuid == b.sourceUuid && a.width == b.width && a.height == b.height && a.bitrate == b.bitrate && a.audioTrack == b.audioTrack && a.mixId==b.mixId && a.stingerAudio==b.stingerAudio && a.fill == b.fill && a.encoder == b.encoder && a.fpsDivisor == b.fpsDivisor && a.overlaysMask == b.overlaysMask && a.overlayChannels == b.overlayChannels;
}
std::string ValidateVideoConfig(const Destination &d)
{
	if (d.mode != "shared" && d.mode != "source" && d.mode != "program" && d.mode != "preview" && d.mode != "clean" && d.mode != "mix") return "unknown video mode";
	for(const auto channel:d.overlayChannels)if(channel&&(channel<7||channel>=64))return "invalid overlay channel";
	if(d.mixId<2||d.mixId>4)return "select Mix 2, 3 or 4";
	if (d.fpsDivisor < 1 || d.fpsDivisor > 8 || d.overlaysMask > 255) return "invalid FPS divisor or overlay mask";
	const char *codec = obs_get_encoder_codec(d.encoder.c_str());
	if (!KnownVideoCodec(codec) || obs_get_encoder_type(d.encoder.c_str()) != OBS_ENCODER_VIDEO) return "selected H264/HEVC/AV1 encoder is not loaded";
	if(d.protocol!="auto"&&d.protocol!="rtmp"&&d.protocol!="rtmps"&&d.protocol!="srt"&&d.protocol!="rist"&&d.protocol!="hls")return "unknown output protocol";
	if(d.chroma!="420"&&d.chroma!="444")return "select chroma 420 or 444";
	if(d.alphaMode!="none"&&d.alphaMode!="packed"&&d.alphaMode!="fill"&&d.alphaMode!="key")return "select alpha none, packed, fill or key";
	if(d.chroma=="444"||d.alphaMode!="none"){
	 const bool srt=d.protocol=="srt"||(d.protocol=="auto"&&QUrl(QString::fromStdString(d.server)).scheme().compare("srt",Qt::CaseInsensitive)==0);
	 if(!srt)return "4:4:4 and Fill/Key alpha require SRT";
	 if(d.encoder!="obs_x264")return "SRT 4:4:4/Fill/Key alpha requires the verified obs_x264 encoder";
	 if(d.alphaMode=="packed"&&d.width>1920)return "packed alpha logical width must not exceed 1920 (encoded width is doubled)";
	 if((d.alphaMode=="fill"||d.alphaMode=="key")&&d.chroma!="420")return "separate Fill/Key requires explicit compatible 4:2:0 chroma";
	}
	if (d.width < 128 || d.width > 3840 || d.height < 128 || d.height > 3840 || d.width % 2 || d.height % 2) return "resolution must be even, between 128 and 3840";
	if (d.bitrate < 100 || d.bitrate > 50000) return "video bitrate must be between 100 and 50000 kbps";
	if (d.audioTrack > 2) return "select Master, A or B";
	if(!d.audioSourceUuid.empty()){
	 if(d.mode=="shared"&&d.chroma!="444"&&d.alphaMode=="none")return "independent audio requires independent video encoders";
	 OBSSourceAutoRelease audio=obs_get_source_by_uuid(d.audioSourceUuid.c_str());if(!FreeMixAudioBusAllowed(audio))return "select an independent public audio bus with global tracks disabled";
	}
	if (d.enabled && d.mode == "source" && d.sourceUuid.empty()) return "select a source";
	return "";
}

std::array<Destination, kMaxDestinations> destinations;
/* Guards the saved fields and the state texts; signal callbacks of the outputs arrive on other threads. */
std::recursive_mutex destinationsMutex;
obs_websocket_vendor vendor = nullptr;

bool IsPrivateSource(obs_source_t *source)
{
	if (!source) return false;
	OBSDataAutoRelease data = obs_source_get_private_settings(source);
	bool found = obs_data_get_bool(data, "freemix_director_private");
	obs_source_enum_full_tree(source, [](obs_source_t *, obs_source_t *child, void *p) {
		OBSDataAutoRelease settings = obs_source_get_private_settings(child);
		if (obs_data_get_bool(settings, "freemix_director_private")) *static_cast<bool *>(p) = true;
	}, &found);
	return found;
}
std::string ConfigPath();
MixEffectManager mixEffectManager = [] {
 MixEffectManager manager;
 manager.IsPrivateSource = IsPrivateSource;
 manager.ConfigPath = ConfigPath;
 manager.outputBusy = [](uint32_t mixId) {
  for (const auto &d : destinations)
   if (d.mode == "mix" && d.mixId == mixId && d.output) return true;
  return false;
 };
 return manager;
}();
void RequestMix(obs_data_t *request, obs_data_t *response, void *)
{
 const auto work = [=]() {
  if (frontendClosing) {
   obs_data_set_bool(response,"success",false);
   obs_data_set_string(response,"error","frontend is closing");
   return;
  }
  mixEffectManager.RequestMix(request,response,nullptr);
 };
 auto *main = OBSBasic::Get();
 if (!main) { obs_data_set_bool(response,"success",false); return; }
 if (QThread::currentThread() == main->thread()) work();
 else QMetaObject::invokeMethod(main,work,Qt::BlockingQueuedConnection);
}

void RunOnInterfaceThread(std::function<void()> task)
{
	QMetaObject::invokeMethod(qApp, std::move(task), Qt::QueuedConnection);
}

std::string ConfigPath()
{
	char *dir = obs_frontend_get_current_profile_path();
	std::string path = dir ? dir : "";
	bfree(dir);
	if (!path.empty()) {
		path += "/freemix-destinos.json";
	}
	return path;
}

void Describe(obs_data_t *out)
{
	OBSDataArrayAutoRelease list = obs_data_array_create();
	{
		std::lock_guard<std::recursive_mutex> lock(destinationsMutex);
		for (const Destination &d : destinations) {
			OBSDataAutoRelease item = obs_data_create();
			obs_data_set_string(item, "name", d.name.c_str());
			obs_data_set_string(item, "server", d.server.c_str());
			obs_data_set_string(item, "key", d.key.c_str());
			obs_data_set_bool(item, "enabled", d.enabled);
			obs_data_set_string(item, "state", d.state.c_str());
			obs_data_set_string(item, "error", d.error.c_str());
			WriteVideoConfig(item, d);
			obs_data_set_bool(item, "active", d.output && obs_output_active(d.output));
			obs_data_set_bool(item, "recording", !d.recordPath.empty() && d.output);
			obs_data_set_string(item, "renderedUuid", d.renderedUuid.c_str());
			obs_data_set_int(item,"encodedWidth",d.alphaMode=="packed"?d.width*2:d.width);obs_data_set_int(item,"encodedHeight",d.height);obs_data_set_string(item,"alphaLayout",d.alphaMode=="packed"?"fill-left-key-right":d.alphaMode=="fill"?"fill-only":d.alphaMode=="key"?"key-only":"none");
			obs_data_array_push_back(list, item);
		}
	}
	obs_data_set_array(out, "destinations", list);
	obs_data_set_bool(out, "main_active", !frontendClosing && obs_frontend_streaming_active());
	obs_data_set_int(out, "max", (long long)kMaxDestinations);
	obs_data_set_bool(out, "independentVideo", true);
	obs_data_set_bool(out, "independentAudio", true);
	obs_data_set_bool(out,"audioSourceSelectable",true);
	const bool srt444=OutputLoaded("ffmpeg_mpegts_muxer")&&obs_get_encoder_type("obs_x264")==OBS_ENCODER_VIDEO&&KnownVideoCodec(obs_get_encoder_codec("obs_x264"));
	obs_data_set_bool(out,"srtChroma444Supported",srt444);obs_data_set_bool(out,"srtPackedAlphaSupported",srt444);obs_data_set_int(out,"srtPackedAlphaMaxWidth",1920);obs_data_set_string(out,"srt444Encoder","obs_x264");obs_data_set_string(out,"srtAlphaLayout","fill-left-key-right");
	obs_data_set_bool(out,"srtPackedAlpha420Supported",srt444);
	obs_data_set_bool(out,"srtSeparateAlphaSupported",srt444);obs_data_set_bool(out,"srtSeparateFillKeySupported",srt444);obs_data_set_string(out,"srtSeparateFillKeyEncoder","obs_x264");obs_data_set_string(out,"srtSeparateFillKeyChroma","420");obs_data_set_bool(out,"srtSeparateFillKeyFrameLocked",false);obs_data_set_bool(out,"srtSeparateKeyAudioSilent",true);
	OBSDataAutoRelease videoTransports=FreeMixVideoTransports();obs_data_set_obj(out,"videoTransports",videoTransports);
	OBSDataArrayAutoRelease audioSources=obs_data_array_create();
	obs_enum_sources([](void *param,obs_source_t *source){if(FreeMixAudioBusAllowed(source)){OBSDataAutoRelease row=obs_data_create();obs_data_set_string(row,"uuid",obs_source_get_uuid(source));obs_data_set_string(row,"name",obs_source_get_name(source));obs_data_array_push_back(static_cast<obs_data_array_t *>(param),row);}return true;},audioSources.Get());
	obs_data_set_array(out,"audioSources",audioSources);
	OBSDataArrayAutoRelease encoders = obs_data_array_create(); const char *encoderId;
	for (size_t i=0; obs_enum_encoder_types(i, &encoderId); i++) {
		const char *codec = obs_get_encoder_codec(encoderId);
		if (!KnownVideoCodec(codec) || obs_get_encoder_type(encoderId)!=OBS_ENCODER_VIDEO||(obs_get_encoder_caps(encoderId)&(OBS_ENCODER_CAP_INTERNAL|OBS_ENCODER_CAP_DEPRECATED))) continue;
		OBSDataAutoRelease item = obs_data_create(); obs_data_set_string(item,"id",encoderId);
		obs_data_set_string(item,"codec",codec);
		obs_data_set_string(item,"name",obs_encoder_get_display_name(encoderId)); obs_data_array_push_back(encoders,item);
	}
	obs_data_set_array(out,"encoders",encoders);
	OBSDataArrayAutoRelease protocols=obs_data_array_create();
	for(const char *protocol:{"rtmp","rtmps","srt","rist","hls"}){
		const std::string p=protocol;const char *type=p=="hls"?"ffmpeg_hls_muxer":p=="srt"||p=="rist"?"ffmpeg_mpegts_muxer":"rtmp_output";
		OBSDataAutoRelease row=obs_data_create();obs_data_set_string(row,"id",protocol);obs_data_set_string(row,"outputId",type);obs_data_set_bool(row,"available",OutputLoaded(type));
		obs_data_set_string(row,"videoCodecs",obs_get_output_supported_video_codecs(type));obs_data_set_string(row,"audioCodecs",obs_get_output_supported_audio_codecs(type));obs_data_set_bool(row,"enhancedRtmp",p=="rtmp"||p=="rtmps");obs_data_array_push_back(protocols,row);
	}
	obs_data_set_array(out,"protocols",protocols);obs_data_set_array(out,"recordingVideoCodecs",CodecList(obs_get_output_supported_video_codecs("ffmpeg_muxer")));obs_data_set_int(out,"capabilitiesVersion",2);obs_data_set_string(out,"hlsService","freemix_hls");
	obs_video_info info; if(obs_get_video_info(&info)) { obs_data_set_int(out,"fpsNum",info.fps_num); obs_data_set_int(out,"fpsDen",info.fps_den); }
	obs_data_set_int(out,"maxFpsDivisor",8); obs_data_set_bool(out,"overlaySelection",true);
}

void EmitChanged()
{
	RunOnInterfaceThread([]() {
		if (!vendor || frontendClosing) {
			return;
		}
		OBSDataAutoRelease data = obs_data_create();
		Describe(data);
		obs_websocket_vendor_emit_event(vendor, "destinations_changed", data);
	});
}

void Load()
{
	mixEffectManager.LoadIndependentMix();
	const std::string path = ConfigPath();
	OBSDataAutoRelease data;
	if (!path.empty()) {
		data = obs_data_create_from_json_file_safe(path.c_str(), "bak");
	}

	std::lock_guard<std::recursive_mutex> lock(destinationsMutex);
	for (Destination &d : destinations) {
		d.name.clear();
		d.server.clear();
		d.key.clear();
		d.enabled = false;
		ReadVideoConfig(nullptr, d);
		d.manuallyStarted = false;
		d.manuallyStopped = false;
	}
	if (!data) {
		return;
	}

	OBSDataArrayAutoRelease list = obs_data_get_array(data, "destinations");
	const size_t count = list ? obs_data_array_count(list) : 0;
	for (size_t i = 0; i < count && i < kMaxDestinations; i++) {
		OBSDataAutoRelease item = obs_data_array_item(list, i);
		destinations[i].name = obs_data_get_string(item, "name");
		destinations[i].server = obs_data_get_string(item, "server");
		destinations[i].key = obs_data_get_string(item, "key");
		destinations[i].enabled = obs_data_get_bool(item, "enabled");
		ReadVideoConfig(item, destinations[i]);
	}
}

void Save()
{
	const std::string path = ConfigPath();
	if (path.empty()) {
		return;
	}

	OBSDataAutoRelease data = obs_data_create();
	OBSDataArrayAutoRelease list = obs_data_array_create();
	{
		std::lock_guard<std::recursive_mutex> lock(destinationsMutex);
		for (const Destination &d : destinations) {
			OBSDataAutoRelease item = obs_data_create();
			obs_data_set_string(item, "name", d.name.c_str());
			obs_data_set_string(item, "server", d.server.c_str());
			obs_data_set_string(item, "key", d.key.c_str());
			obs_data_set_bool(item, "enabled", d.enabled);
			WriteVideoConfig(item, d);
			obs_data_array_push_back(list, item);
		}
	}
	obs_data_set_array(data, "destinations", list);
	obs_data_save_json_safe(data, path.c_str(), "tmp", "bak");
}

const char *StopReason(int code)
{
	switch (code) {
	case OBS_OUTPUT_BAD_PATH:
		return "bad address";
	case OBS_OUTPUT_CONNECT_FAILED:
		return "could not connect";
	case OBS_OUTPUT_INVALID_STREAM:
		return "refused by the server (check the key)";
	case OBS_OUTPUT_DISCONNECTED:
		return "connection lost";
	case OBS_OUTPUT_UNSUPPORTED:
		return "not supported";
	case OBS_OUTPUT_NO_SPACE:
		return "no space left";
	case OBS_OUTPUT_ENCODE_ERROR:
		return "encoder error";
	default:
		return "error";
	}
}

void OnOutputStart(void *param, calldata_t *)
{
	Destination *d = static_cast<Destination *>(param);
	{
		std::lock_guard<std::recursive_mutex> lock(destinationsMutex);
		d->state = "live";
		d->error.clear();
	}
	EmitChanged();
}

void ReleaseOutput(Destination &d);

void OnOutputStop(void *param, calldata_t *data)
{
	Destination *d = static_cast<Destination *>(param);
	const int code = (int)calldata_int(data, "code");
	obs_output_t *output = (obs_output_t *)calldata_ptr(data, "output");
	const char *last = output ? obs_output_get_last_error(output) : nullptr;
	{
		std::lock_guard<std::recursive_mutex> lock(destinationsMutex);
		if (code == OBS_OUTPUT_SUCCESS) {
			d->state = "idle";
			d->error.clear();
		} else {
			d->state = "error";
			d->error = StopReason(code);
			if (last && *last) {
				d->error += ": ";
				d->error += last;
			}
		}
	}
	/* The destination owns the output until interface-thread cleanup. Capturing
	 * a strong ref here postpones destruction until after its view is removed;
	 * the generation instead rejects stale callbacks without retaining encoders. */
	const uint64_t generation=d->outputGeneration.load();
	RunOnInterfaceThread([d, output, generation]() {
		if(d->outputGeneration.load()==generation && d->output==output)ReleaseOutput(*d);
	});
	EmitChanged();
}

void ReleaseOutput(Destination &d)
{
	if (!d.output) {
		return;
	}
	d.outputGeneration.fetch_add(1);
	signal_handler_t *handler = obs_output_get_signal_handler(d.output);
	signal_handler_disconnect(handler, "start", OnOutputStart, &d);
	signal_handler_disconnect(handler, "stop", OnOutputStop, &d);
	if (obs_output_active(d.output)) {
		obs_output_force_stop(d.output);
	}
	d.output = nullptr;
	d.service = nullptr;
	d.videoEncoder = nullptr;
	d.audioEncoder = nullptr;
	if(d.audioMix)audio_output_disconnect(d.sourceAudio?d.sourceAudio->Audio():obs_get_audio(),d.audioMix->track,CaptureDestinationBus,d.audioMix.get());
	if(d.independentAudio){audio_output_close(d.independentAudio);d.independentAudio=nullptr;}d.audioMix.reset();
	d.sourceAudio.reset();
	if (d.view) { obs_view_remove(d.view); obs_view_destroy(d.view); d.view = nullptr; }
	d.packedAlphaSource=nullptr;
	for(auto &item:d.packedOverlayItems){if(item)obs_sceneitem_remove(item);item=nullptr;}
	d.contentItem=nullptr;
	for(size_t i=0;i<8;i++){if(d.overlayFrames[i])obs_scene_release(d.overlayFrames[i]);d.overlayFrames[i]=nullptr;d.overlayUuids[i].clear();}
	if (d.renderScene) { obs_scene_release(d.renderScene); d.renderScene = nullptr; }
	d.renderedUuid.clear();
	d.recordPath.clear();
}

void StopOne(Destination &d, bool force = false)
{
	if (!d.output) {
		return;
	}
	if(!force && obs_output_active(d.output)) {
		{
			std::lock_guard<std::recursive_mutex> lock(destinationsMutex);
			d.state="stopping";d.error.clear();
		}
		// A transport stop can wait for its worker; never hold the mutex that
		// the worker's stop signal needs while requesting that operation.
		obs_output_stop(d.output);return;
	}
	ReleaseOutput(d);
	std::lock_guard<std::recursive_mutex> lock(destinationsMutex);
	d.state = "idle";
	d.error.clear();
}

void Fail(Destination &d, const std::string &message)
{
	ReleaseOutput(d);
	std::lock_guard<std::recursive_mutex> lock(destinationsMutex);
	d.state = "error";
	d.error = message;
}

bool UpdateOutputOverlay(Destination &d, uint32_t channel, obs_source_t *overlay)
{
	const size_t i=channel-1;
	const std::string uuid=overlay?obs_source_get_uuid(overlay):"";
	if(uuid==d.overlayUuids[i]&&(!overlay||d.overlayFrames[i]))return true;
	if(d.alphaMode!="none"){if(d.packedOverlayItems[i])obs_sceneitem_remove(d.packedOverlayItems[i]);d.packedOverlayItems[i]=nullptr;}else obs_view_set_source(d.view,channel,nullptr);
	if(d.overlayFrames[i])obs_scene_release(d.overlayFrames[i]);
	d.overlayFrames[i]=nullptr;d.overlayUuids[i].clear();
	if(!overlay)return true;
	const uint32_t sw=obs_source_get_width(overlay),sh=obs_source_get_height(overlay);
	if(!sw||!sh)return true;
	obs_scene_t *frame=obs_scene_create_private("3Mix output overlay frame");
	OBSDataAutoRelease settings=obs_source_get_settings(obs_scene_get_source(frame));
	obs_data_set_bool(settings,"custom_size",true);obs_data_set_int(settings,"cx",d.width);obs_data_set_int(settings,"cy",d.height);
	obs_source_load(obs_scene_get_source(frame));
	obs_sceneitem_t *item=obs_scene_add(frame,overlay);
	if(!item){obs_scene_release(frame);return false;}
	const float factor=std::min(float(d.width)/sw,float(d.height)/sh);
	vec2 scale,pos;vec2_set(&scale,factor,factor);vec2_set(&pos,(float(d.width)-sw*factor)/2,(float(d.height)-sh*factor)/2);
	obs_sceneitem_set_scale(item,&scale);obs_sceneitem_set_pos(item,&pos);obs_sceneitem_set_alignment(item,OBS_ALIGN_LEFT|OBS_ALIGN_TOP);
	d.overlayFrames[i]=frame;d.overlayUuids[i]=uuid;
	if(d.alphaMode!="none"){
	 d.packedOverlayItems[i]=obs_scene_add(d.renderScene,obs_scene_get_source(frame));
	 if(!d.packedOverlayItems[i])return false;
	 obs_sceneitem_set_alignment(d.packedOverlayItems[i],OBS_ALIGN_LEFT|OBS_ALIGN_TOP);
	}else obs_view_set_source(d.view,channel,obs_scene_get_source(frame));
	return true;
}

void StartOne(Destination &d, size_t index)
{
	const std::string validation=ValidateVideoConfig(d);if(!validation.empty()){Fail(d,validation);return;}
	const bool independent=d.mode!="shared"||d.chroma=="444"||d.alphaMode!="none";
	std::string server, key;
	{
		std::lock_guard<std::recursive_mutex> lock(destinationsMutex);
		server = d.server;
		key = d.key;
	}

	OBSOutputAutoRelease main = obs_frontend_get_streaming_output();
	obs_encoder_t *video = main ? obs_output_get_video_encoder(main) : nullptr;
	obs_encoder_t *audio = main ? obs_output_get_audio_encoder(main, 0) : nullptr;
	if (!independent && (!video || !audio)) {
		Fail(d, "the encoders of the main stream are not available");
		return;
	}

	OBSDataAutoRelease settings = obs_data_create();
	obs_data_set_string(settings, "server", server.c_str());
	obs_data_set_string(settings, "key", key.c_str());
	obs_data_set_bool(settings, "use_auth", false);

	const std::string id = "freemix_destino_" + std::to_string(index + 1);
	std::string protocol=d.protocol;
	const QUrl url(QString::fromStdString(server));const std::string scheme=url.scheme().toLower().toStdString();if(protocol=="auto")protocol=scheme;
	const char *type = "rtmp_output";
	if (!d.recordPath.empty()) type = "ffmpeg_muxer";
	else if(protocol=="hls")type="ffmpeg_hls_muxer";
	else if (protocol=="srt"||protocol=="rist") {
		type = "ffmpeg_mpegts_muxer";
	}
	if(d.recordPath.empty()&&(!url.isValid()||url.host().isEmpty()||(protocol=="hls"?scheme!="http"&&scheme!="https":scheme!=protocol)||(protocol!="rtmp"&&protocol!="rtmps"&&protocol!="srt"&&protocol!="rist"&&protocol!="hls"))){Fail(d,"server URL does not match the selected output protocol");return;}
	if(!OutputLoaded(type)){Fail(d,"selected output backend is not loaded");return;}
	const char *videoCodec=!independent?obs_encoder_get_codec(video):obs_get_encoder_codec(d.encoder.c_str());
	if(!videoCodec){Fail(d,"selected video encoder is no longer loaded");return;}
	if(d.recordPath.empty()&&(protocol=="rtmp"||protocol=="rtmps")&&std::string(videoCodec)!="h264"&&!d.enhancedRtmp){Fail(d,"confirm that this destination supports Enhanced RTMP for HEVC/AV1");return;}
	if(!CodecIn(obs_get_output_supported_video_codecs(type),videoCodec)||!CodecIn(obs_get_output_supported_audio_codecs(type),!independent?obs_encoder_get_codec(audio):"aac")){Fail(d,"selected codec is not supported by this output protocol/container");return;}

	if (d.recordPath.empty()) d.service = obs_service_create(protocol=="hls"?"freemix_hls":"rtmp_custom", id.c_str(), settings, nullptr);
	if(d.service){const char **supported=obs_service_get_supported_video_codecs(d.service);if(supported){bool valid=false;for(size_t n=0;supported[n];n++)if(std::string(supported[n])==videoCodec)valid=true;if(!valid){Fail(d,"selected codec is not supported by this streaming service");return;}}}
	OBSDataAutoRelease outputSettings = obs_data_create();
	if (!d.recordPath.empty()) obs_data_set_string(outputSettings, "path", d.recordPath.c_str());
	d.output = obs_output_create(type, id.c_str(), outputSettings, nullptr);
	if ((d.recordPath.empty() && !d.service) || !d.output) {
		Fail(d, "could not create the output");
		return;
	}
	if (independent) {
		OBSSourceAutoRelease source = (d.mode == "shared" || d.mode == "program" || d.mode == "clean") ? obs_frontend_get_current_scene() : d.mode == "preview" ? obs_frontend_get_current_preview_scene() : d.mode == "mix" && mixEffectManager.EnsureIndependentMix(mixEffectManager.independentMixes[d.mixId-2], d.mixId) ? obs_source_get_ref(mixEffectManager.independentMixes[d.mixId-2].transition) : obs_get_source_by_uuid(d.sourceUuid.c_str());
		bool privateSource = false;
		if (source) {
			OBSDataAutoRelease data = obs_source_get_private_settings(source);
			privateSource = obs_data_get_bool(data, "freemix_director_private");
			obs_source_enum_full_tree(source, [](obs_source_t *, obs_source_t *child, void *param) {
				OBSDataAutoRelease data = obs_source_get_private_settings(child);
				if (obs_data_get_bool(data, "freemix_director_private")) *static_cast<bool *>(param) = true;
			}, &privateSource);
		}
		if (!source || privateSource) { Fail(d, privateSource ? "private director source cannot be sent" : "source no longer exists"); return; }
		obs_video_info info;
		if (!obs_get_video_info(&info)) { Fail(d, "video is unavailable"); return; }
		info.base_width = info.output_width = d.alphaMode=="packed"?d.width*2:d.width;
		info.base_height = info.output_height = d.height;
		info.output_format = d.chroma=="444"?VIDEO_FORMAT_I444:VIDEO_FORMAT_NV12;
		if(d.chroma=="444"){info.colorspace=VIDEO_CS_709;info.range=VIDEO_RANGE_FULL;}
		// Use a conventional SDR 4:2:0 signal for separate vMix Fill/Key.
		// Both renders are opaque; only Key carries the original alpha as luma.
		if(d.alphaMode!="none"&&d.chroma=="420"){info.colorspace=VIDEO_CS_709;info.range=VIDEO_RANGE_PARTIAL;}
		d.renderScene = obs_scene_create_private(id.c_str());
		if(d.alphaMode!="none"){OBSDataAutoRelease frameSettings=obs_source_get_settings(obs_scene_get_source(d.renderScene));obs_data_set_bool(frameSettings,"custom_size",true);obs_data_set_int(frameSettings,"cx",d.width);obs_data_set_int(frameSettings,"cy",d.height);obs_source_load(obs_scene_get_source(d.renderScene));}
		obs_sceneitem_t *item = obs_scene_add(d.renderScene, source);
		d.contentItem=item;
		if (!item) { Fail(d, "could not compose source"); return; }
		// Transition cached dimensions update on the next video tick. Mix 2 already
		// has validated, fixed frame dimensions, including an immediate Cut/start.
		const uint32_t sw = d.mode == "mix" ? mixEffectManager.independentMixes[d.mixId-2].width : obs_source_get_width(source);
		const uint32_t sh = d.mode == "mix" ? mixEffectManager.independentMixes[d.mixId-2].height : obs_source_get_height(source);
		if (!sw || !sh) { Fail(d, "source has no video dimensions"); return; }
		const float factor = d.fill ? std::max(float(d.width)/sw, float(d.height)/sh) : std::min(float(d.width)/sw, float(d.height)/sh);
		vec2 scale, position; vec2_set(&scale, factor, factor);
		vec2_set(&position, (float(d.width)-sw*factor)/2, (float(d.height)-sh*factor)/2);
		obs_sceneitem_set_scale(item, &scale); obs_sceneitem_set_pos(item, &position);
		obs_sceneitem_set_alignment(item, OBS_ALIGN_LEFT | OBS_ALIGN_TOP);
		d.view = obs_view_create();
		if (!d.view) { Fail(d, "could not create view"); return; }
		if(d.alphaMode!="none"){d.packedAlphaSource=freemix_srt_alpha::Create(obs_scene_get_source(d.renderScene),d.width,d.height,d.alphaMode);if(!d.packedAlphaSource){Fail(d,"could not create SRT Fill/Key alpha renderer");return;}}
		obs_view_set_source(d.view, 0, d.packedAlphaSource?d.packedAlphaSource.Get():obs_scene_get_source(d.renderScene));
		// Explicit opaque Program composition inherits Master at the final stage.
		// Packed/Fill/Key masks must not be blackened after packing; their routes remain excluded.
		video_t *viewVideo = d.mode == "program" && d.alphaMode == "none" ? obs_view_add_program_final_gate(d.view, &info) : obs_view_add2(d.view, &info);
		if (!viewVideo) { Fail(d, "could not create independent video"); return; }
		OBSDataAutoRelease videoSettings = obs_data_create();
		obs_data_set_string(videoSettings, "rate_control", "CBR");
		obs_data_set_int(videoSettings, "bitrate", d.bitrate);
		obs_data_set_int(videoSettings, "keyint_sec", 2);
		obs_data_set_string(videoSettings, "preset", d.encoder == "obs_x264" ? "veryfast" : d.encoder.find("nvenc") != std::string::npos ? "p5" : "balanced");
		if(d.service)obs_service_apply_encoder_settings(d.service,videoSettings,nullptr);
		if(d.encoder=="obs_x264")obs_data_set_string(videoSettings,"tune","zerolatency");
		if(d.chroma=="444")obs_data_set_string(videoSettings,"profile","high444");
		if(d.alphaMode!="none"&&d.chroma=="420")obs_data_set_string(videoSettings,"profile","high");
		d.videoEncoder = obs_video_encoder_create(d.encoder.c_str(), (id+"_video").c_str(), videoSettings, nullptr);
		OBSDataAutoRelease audioSettings = obs_data_create(); obs_data_set_int(audioSettings, "bitrate", 160);
		if(d.service)obs_service_apply_encoder_settings(d.service,videoSettings,audioSettings);
		if(d.chroma=="444")obs_data_set_string(videoSettings,"profile","high444");
		if(!d.audioSourceUuid.empty()){std::string error;d.sourceAudio=FreeMixSourceAudio::Open(d.audioSourceUuid,id+" PCM",error);if(!d.sourceAudio){Fail(d,error.c_str());return;}}
		d.audioEncoder = obs_audio_encoder_create("ffmpeg_aac", (id+"_audio").c_str(), audioSettings, d.sourceAudio?0:d.audioTrack, nullptr);
		if (!d.videoEncoder || !d.audioEncoder) { Fail(d, "could not create independent encoders"); return; }
		obs_encoder_set_video(d.videoEncoder, viewVideo);
		if(d.chroma=="444")obs_encoder_set_preferred_video_format(d.videoEncoder,VIDEO_FORMAT_I444);
		if(d.alphaMode!="none"&&d.chroma=="420")obs_encoder_set_preferred_video_format(d.videoEncoder,VIDEO_FORMAT_NV12);
		if (!obs_encoder_set_frame_rate_divisor(d.videoEncoder, d.fpsDivisor)) { Fail(d, "could not set output FPS divisor"); return; }
		if(d.alphaMode=="key"){
			obs_audio_info audioInfo;if(!obs_get_audio_info(&audioInfo)){Fail(d,"audio is unavailable");return;}
			audio_output_info outputInfo={};outputInfo.name=id.c_str();outputInfo.samples_per_sec=audioInfo.samples_per_sec;outputInfo.speakers=audioInfo.speakers;outputInfo.format=AUDIO_FORMAT_FLOAT_PLANAR;outputInfo.input_callback=ReadSilentKeyAudio;
			if(d.sourceAudio)outputInfo.speakers=SPEAKERS_STEREO;
			if(audio_output_open(&d.independentAudio,&outputInfo)!=AUDIO_OUTPUT_SUCCESS){Fail(d,"could not create silent Key audio");return;}
			obs_encoder_set_audio(d.audioEncoder,d.independentAudio);
		}else if(d.mode=="mix"&&d.stingerAudio){
			obs_audio_info audioInfo;if(!obs_get_audio_info(&audioInfo)){Fail(d,"audio is unavailable");return;}
			d.audioMix=std::make_unique<DestinationAudioMix>();d.audioMix->name=id;d.audioMix->track=d.sourceAudio?0:d.audioTrack;d.audioMix->bus.rate=audioInfo.samples_per_sec;d.audioMix->bus.channels=d.sourceAudio?2:get_audio_channels(audioInfo.speakers);d.audioMix->stinger=mixEffectManager.independentMixes[d.mixId-2].stingerTape;
			audio_output_info outputInfo={};outputInfo.name=d.audioMix->name.c_str();outputInfo.samples_per_sec=audioInfo.samples_per_sec;outputInfo.speakers=audioInfo.speakers;outputInfo.format=AUDIO_FORMAT_FLOAT_PLANAR;outputInfo.input_callback=ReadDestinationAudio;outputInfo.input_param=d.audioMix.get();
			if(d.sourceAudio)outputInfo.speakers=SPEAKERS_STEREO;
			if(audio_output_open(&d.independentAudio,&outputInfo)!=AUDIO_OUTPUT_SUCCESS||!audio_output_connect(d.sourceAudio?d.sourceAudio->Audio():obs_get_audio(),d.audioMix->track,nullptr,CaptureDestinationBus,d.audioMix.get())){Fail(d,"could not create independent bus and Stinger audio");return;}
			obs_encoder_set_audio(d.audioEncoder,d.independentAudio);
		}else obs_encoder_set_audio(d.audioEncoder,d.sourceAudio?d.sourceAudio->Audio():obs_get_audio());
		// FreeMix numbered DSK overlays occupy main canvas channels 7 through 14; 1-6 are global audio devices.
		for (uint32_t channel=1; channel<=8; channel++) {
			OBSSourceAutoRelease overlay = (d.overlaysMask & (1u<<(channel-1))) && d.overlayChannels[channel-1] ? obs_get_output_source(d.overlayChannels[channel-1]) : nullptr;
			if (overlay && IsPrivateSource(overlay)) { Fail(d,"overlay contains private director source"); return; }
			if(!UpdateOutputOverlay(d,channel,overlay)){Fail(d,"could not frame output overlay");return;}
		}
		video = d.videoEncoder; audio = d.audioEncoder;
		d.renderedUuid = obs_source_get_uuid(source);
	}

	obs_output_set_video_encoder(d.output, video);
	obs_output_set_audio_encoder(d.output, audio, 0);
	if (d.service) obs_output_set_service(d.output, d.service);
	obs_output_set_reconnect_settings(d.output, 20, 5);

	signal_handler_t *handler = obs_output_get_signal_handler(d.output);
	signal_handler_connect(handler, "start", OnOutputStart, &d);
	signal_handler_connect(handler, "stop", OnOutputStop, &d);

	{
		std::lock_guard<std::recursive_mutex> lock(destinationsMutex);
		d.state = "starting";
		d.error.clear();
	}

	if (!obs_output_start(d.output)) {
		const char *last = obs_output_get_last_error(d.output);
		Fail(d, last && *last ? last : "could not start");
	}
}

void RefreshProgramVideos()
{
	OBSSourceAutoRelease program=obs_frontend_get_current_scene();
	if(!program)return;
	for(Destination &d:destinations){
		if((d.mode!="program"&&d.mode!="clean"&&d.mode!="preview"&&!(d.mode=="shared"&&(d.chroma=="444"||d.alphaMode!="none")))||!d.view||!d.renderScene)continue;
		OBSSourceAutoRelease source=d.mode=="preview"?obs_frontend_get_current_preview_scene():obs_source_get_ref(program);
		if(!source||d.renderedUuid==obs_source_get_uuid(source))continue;
		bool privateSource=false;
		obs_source_enum_full_tree(source,[](obs_source_t *,obs_source_t *child,void *p){OBSDataAutoRelease data=obs_source_get_private_settings(child);if(obs_data_get_bool(data,"freemix_director_private"))*static_cast<bool *>(p)=true;},&privateSource);
		if(privateSource){Fail(d,"private director source cannot be sent");continue;}
		const uint32_t sw=obs_source_get_width(source),sh=obs_source_get_height(source);
		if(!sw||!sh){Fail(d,"source has no video dimensions");continue;}
		if(d.alphaMode!="none"){if(d.contentItem)obs_sceneitem_remove(d.contentItem);d.contentItem=nullptr;}else obs_scene_enum_items(d.renderScene,[](obs_scene_t *,obs_sceneitem_t *item,void *){obs_sceneitem_remove(item);return true;},nullptr);
		obs_sceneitem_t *item=obs_scene_add(d.renderScene,source);
		d.contentItem=item;
		if(!item){Fail(d,"could not compose source");continue;}
		if(d.alphaMode!="none")obs_sceneitem_set_order(item,OBS_ORDER_MOVE_BOTTOM);
		const float factor=d.fill?std::max(float(d.width)/sw,float(d.height)/sh):std::min(float(d.width)/sw,float(d.height)/sh);
		vec2 scale,position;vec2_set(&scale,factor,factor);vec2_set(&position,(float(d.width)-sw*factor)/2,(float(d.height)-sh*factor)/2);
		obs_sceneitem_set_scale(item,&scale);obs_sceneitem_set_pos(item,&position);obs_sceneitem_set_alignment(item,OBS_ALIGN_LEFT|OBS_ALIGN_TOP);
		d.renderedUuid=obs_source_get_uuid(source);
	}
}

/* Makes what is running match the list: interface thread only. */
void Apply()
{
	const bool mainActive = obs_frontend_streaming_active();

	for (size_t i = 0; i < kMaxDestinations; i++) {
		Destination &d = destinations[i];
		bool want, restart;
		{
			std::lock_guard<std::recursive_mutex> lock(destinationsMutex);
			want = d.enabled && !d.manuallyStopped && (d.manuallyStarted || (d.autoStart && mainActive)) && (!d.server.empty() || !d.recordPath.empty());
			restart = d.restart;
			d.restart = false;
		}

		if (d.output && (!want || restart)) {
			StopOne(d);
		}
		if (want && !d.output) {
			StartOne(d, i);
		}
		if (!want) {
			std::lock_guard<std::recursive_mutex> lock(destinationsMutex);
			if ((!mainActive && !d.manuallyStarted) || !d.enabled) {
				d.state = "idle";
				d.error.clear();
			}
		}
	}

	EmitChanged();
}

void StopAll()
{
	for (Destination &d : destinations) {
		StopOne(d, true);
	}
	EmitChanged();
}

void RequestGet(obs_data_t *, obs_data_t *response, void *)
{
	QMetaObject::invokeMethod(OBSBasic::Get(), [response]() {
		Describe(response);
		obs_data_set_bool(response, "success", true);
	}, Qt::BlockingQueuedConnection);
}

void RequestSet(obs_data_t *request, obs_data_t *response, void *)
{
	OBSDataArrayAutoRelease list = obs_data_get_array(request, "destinations");
	if (!list) {
		obs_data_set_string(response, "error", "'destinations' not set");
		obs_data_set_bool(response, "success", false);
		return;
	}

	QMetaObject::invokeMethod(OBSBasic::Get(), [&list, response]() {
		if(frontendClosing){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","frontend is closing");return;}
		const size_t count = obs_data_array_count(list);
		std::array<Destination, kMaxDestinations> proposed;
		for (size_t i = 0; i < kMaxDestinations; i++) {
			Destination &next = proposed[i];
			OBSDataAutoRelease item = i < count ? obs_data_array_item(list, i) : nullptr;
			ReadVideoConfig(item, next);
			next.name = obs_data_get_string(item, "name"); next.server = obs_data_get_string(item, "server"); next.key = obs_data_get_string(item, "key"); next.enabled = obs_data_get_bool(item, "enabled");
			std::string error = ValidateVideoConfig(next);
			const Destination &current = destinations[i];
			if (error.empty() && current.output && next.enabled && (!SameVideoConfig(current,next) || current.server != next.server || current.key != next.key)) error = "stop this destination before changing its video, audio or address";
			if (!error.empty()) { obs_data_set_bool(response,"success",false); obs_data_set_string(response,"error",error.c_str()); return; }
		}
		{
			std::lock_guard<std::recursive_mutex> lock(destinationsMutex);
			for (size_t i = 0; i < kMaxDestinations; i++) {
				Destination &d = destinations[i]; const Destination &next = proposed[i];
				d.name=next.name; d.server=next.server; d.key=next.key; d.enabled=next.enabled;d.protocol=next.protocol;d.enhancedRtmp=next.enhancedRtmp;
				d.mode=next.mode; d.sourceUuid=next.sourceUuid; d.audioSourceUuid=next.audioSourceUuid; d.width=next.width; d.height=next.height; d.bitrate=next.bitrate; d.audioTrack=next.audioTrack; d.mixId=next.mixId; d.autoStart=next.autoStart; d.fill=next.fill;
				d.encoder=next.encoder; d.fpsDivisor=next.fpsDivisor; d.overlaysMask=next.overlaysMask; d.overlayChannels=next.overlayChannels;d.stingerAudio=next.stingerAudio;
				d.chroma=next.chroma;d.alphaMode=next.alphaMode;
				if (!d.enabled) { d.manuallyStarted=false; d.manuallyStopped=false; }
			}
		}
		Save(); Apply(); Describe(response); obs_data_set_bool(response,"success",true);
	}, Qt::BlockingQueuedConnection);
}

void RequestControlDestination(obs_data_t *request, obs_data_t *response, void *)
{
	const int index = int(obs_data_get_int(request,"index"));
	const std::string action = obs_data_get_string(request,"action");
	const QString path = QString::fromUtf8(obs_data_get_string(request,"path"));
	QMetaObject::invokeMethod(OBSBasic::Get(), [index, action, path, response]() {
		if(frontendClosing){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","frontend is closing");return;}
		std::string error;
		if (index < 0 || index >= int(kMaxDestinations)) error="invalid destination index";
		else {
			Destination &d=destinations[size_t(index)];
			if (action=="stop") { d.manuallyStarted=false; d.manuallyStopped=true; StopOne(d); }
			else if (action=="start" || action=="record") {
				if (d.output) error="destination already running";
				else if (!d.enabled) error="enable this destination first";
				else if (action=="record" && ((d.mode=="shared"&&d.chroma!="444"&&d.alphaMode=="none") || !QFileInfo(path).isAbsolute() || !path.endsWith(".mkv",Qt::CaseInsensitive) || QFileInfo::exists(path) || !QFileInfo(QFileInfo(path).absolutePath()).isDir())) error="select independent video and a new absolute MKV path";
				else {
					d.manuallyStarted=true; d.manuallyStopped=false;
					if(action=="record") d.recordPath=path.toStdString();
					StartOne(d,size_t(index));
					if(d.state=="error") { error=d.error; d.manuallyStarted=false; }
				}
			} else error="unknown action";
		}
		Describe(response);obs_data_set_bool(response,"success",error.empty());
		if(!error.empty())obs_data_set_string(response,"error",error.c_str());
	}, Qt::BlockingQueuedConnection);
}

/* The preset as a document (FreeMixPreset.cpp), for the Save button of the interface. Requests arrive on the
 * thread of the control server; the work is done on the interface thread. */
void RequestProjectPolicy(obs_data_t *, obs_data_t *response, void *)
{
 auto *main = OBSBasic::Get();
 if (!main || frontendClosing) { obs_data_set_bool(response, "success", false); return; }
 auto work = [response]() {
  if (frontendClosing) { obs_data_set_bool(response, "success", false); return; }
  FreeMixReadProjectCreationPolicy(response);
 };
 if (QThread::currentThread() == main->thread()) work();
 else QMetaObject::invokeMethod(main, work, Qt::BlockingQueuedConnection);
}
void RequestProjectInventory(obs_data_t *request, obs_data_t *response, void *)
{
 if (!obs_data_get_bool(request, "confirmDriverMetadataQuery")) {
  obs_data_set_bool(response, "success", false);
  obs_data_set_string(response, "error", "SCAN_CONSENT_REQUIRED"); return;
 }
 auto *main = OBSBasic::Get();
 if (!main || frontendClosing) { obs_data_set_bool(response, "success", false); return; }
 auto work = [response]() {
  if (frontendClosing) { obs_data_set_bool(response, "success", false); return; }
  FreeMixReadProjectDeviceInventory(response);
 };
 if (QThread::currentThread() == main->thread()) work();
 else QMetaObject::invokeMethod(main, work, Qt::BlockingQueuedConnection);
}

void RequestSavePreset(obs_data_t *, obs_data_t *response, void *)
{
	QMetaObject::invokeMethod(OBSBasic::Get(), []() { OBSBasic::Get()->SavePresetAsDocument(); },
				  Qt::BlockingQueuedConnection);
	obs_data_set_bool(response, "success", true);
}

void RequestGetPreset(obs_data_t *, obs_data_t *response, void *)
{
	bool changed = false;
	QMetaObject::invokeMethod(OBSBasic::Get(), [&changed]() { changed = OBSBasic::Get()->PresetHasChanges(); },
				  Qt::BlockingQueuedConnection);
	obs_data_set_bool(response, "changed", changed);
	obs_data_set_bool(response, "success", true);
}

/* Waveform and vectorscope of the Preview (FreeMixScope.cpp):
 *   get_scope                              -> { mode, name, with_preview, frames_drawn, width, height, modes: [] }
 *   set_scope { mode?, with_preview? }     -> the same, after the change */
void RequestGetScope(obs_data_t *, obs_data_t *response, void *)
{
	QMetaObject::invokeMethod(OBSBasic::Get(), [response]() { OBSBasic::Get()->DescribeScope(response); },
				  Qt::BlockingQueuedConnection);
	obs_data_set_bool(response, "success", true);
}

void RequestSetScope(obs_data_t *request, obs_data_t *response, void *)
{
	QMetaObject::invokeMethod(
		OBSBasic::Get(),
		[request, response]() {
			OBSBasic *main = OBSBasic::Get();
			OBSDataAutoRelease now = obs_data_create();
			main->DescribeScope(now);
			const int mode = obs_data_has_user_value(request, "mode") ? int(obs_data_get_int(request, "mode"))
										   : int(obs_data_get_int(now, "mode"));
			const bool withPreview = obs_data_has_user_value(request, "with_preview")
							 ? obs_data_get_bool(request, "with_preview")
							 : obs_data_get_bool(now, "with_preview");
			main->SetScopeMode(mode, withPreview);
			main->DescribeScope(response);
		},
		Qt::BlockingQueuedConnection);
	obs_data_set_bool(response, "success", true);
}

/* Master meter of the column between Preview and Output (FreeMixCenterColumn.cpp):
 *   get_master_level -> { present, left_db, right_db }   (-60 = silence) */
void RequestGetMasterLevel(obs_data_t *, obs_data_t *response, void *)
{
	float left = 0.0f;
	float right = 0.0f;
	bool present = false;
	QMetaObject::invokeMethod(OBSBasic::Get(), [&]() { present = FreeMixMasterLevel(left, right); },
				  Qt::BlockingQueuedConnection);
	obs_data_set_bool(response, "present", present);
	if (present) {
		obs_data_set_double(response, "left_db", left);
		obs_data_set_double(response, "right_db", right);
	}
	obs_data_set_bool(response, "success", true);
}

std::map<std::string, QPointer<QDialog>> panelWindows;
unsigned panelDeletionDepth = 0;
bool pendingMainClose = false;
void RequestOpenPanel(obs_data_t *request, obs_data_t *response, void *)
{
 const QString raw = QString::fromUtf8(obs_data_get_string(request, "url"));
 const QString title = QString::fromUtf8(obs_data_get_string(request, "title")).left(100);
 // Optional size of the window's content, for the small dialogs; without it the window opens large as before.
 const int wantWidth = int(obs_data_get_int(request, "width")), wantHeight = int(obs_data_get_int(request, "height"));
 QMetaObject::invokeMethod(OBSBasic::Get(), [raw, title, response, wantWidth, wantHeight]() {
#ifdef BROWSER_AVAILABLE
  auto *main = OBSBasic::Get();
  if (!main || main->isClosing() || frontendClosing) { obs_data_set_bool(response, "success", false); obs_data_set_string(response, "error", "O 3Mix está encerrando. Nenhuma janela será aberta."); return; }
  if (panelDeletionDepth) { obs_data_set_bool(response, "success", false); obs_data_set_string(response, "error", "Uma janela está sendo fechada. Tente abrir novamente."); return; }
  const QUrl url(raw);
  const QString panelRoot = QDir(QCoreApplication::applicationDirPath() + "/../../painel").canonicalPath();
  const bool file = url.isLocalFile() && !panelRoot.isEmpty() &&
   QFileInfo(url.toLocalFile()).canonicalFilePath().startsWith(panelRoot + "/", Qt::CaseInsensitive);
  const bool local = url.scheme() == "http" && (url.host() == "127.0.0.1" || url.host() == "localhost") && url.userInfo().isEmpty();
  if (!cef || (!file && !local)) { obs_data_set_bool(response, "success", false); obs_data_set_string(response, "error", !cef ? "O navegador interno não está disponível." : "A janela precisa usar um endereço local do FreeMix."); return; }
  auto &window = panelWindows[raw.toStdString()];
  if (!window) {
   // True top-level window: no owner, so it can live on another monitor,
   // minimize and focus independently from the desk.
   window = new QDialog(nullptr, Qt::Window | Qt::WindowMinMaxButtonsHint | Qt::WindowCloseButtonHint);
   window->setObjectName("freemixPanelWindow");
   window->setWindowTitle(title.isEmpty() ? "3Mix" : title);
   // CEF destruction pumps Qt events. Hide/remove the window first, then
   // delete it under a guard so reentrant diagnostics cannot inspect it.
   window->setAttribute(Qt::WA_DeleteOnClose, false);
   const QPointer<QDialog> owned = window;
   const std::string key = raw.toStdString();
   const std::string geometryKey = raw.toUtf8().toBase64().toStdString();
   QObject::connect(window, &QDialog::finished, OBSBasic::Get(), [owned, key, geometryKey](int) {
    if (!owned || owned->property("freemixDeletionQueued").toBool()) return;
    const QByteArray geometry = owned->saveGeometry().toBase64();
    config_set_string(App()->GetUserConfig(), "PanelWindows", geometryKey.c_str(), geometry.constData());
    owned->setProperty("freemixDeletionQueued", true);
    const auto found = panelWindows.find(key);
    if (found != panelWindows.end() && found->second == owned) panelWindows.erase(found);
    QTimer::singleShot(0, OBSBasic::Get(), [owned]() {
     // Parent teardown and CEF destruction run nested Qt event loops.
     // A queued close must never delete a dialog already being torn down.
     if (frontendClosing || !owned) return;
     ++panelDeletionDepth;
     owned->setProperty("freemixDeleting", true);
     delete owned.data();
     --panelDeletionDepth;
     if (!panelDeletionDepth && pendingMainClose && !frontendClosing) {
      pendingMainClose = false;
      QPointer<OBSBasic> main = OBSBasic::Get();
      QTimer::singleShot(0, main.data(), [main]() { if (main) main->close(); });
     }
    });
   });
   window->setAttribute(Qt::WA_NativeWindow);
   auto *layout = new QVBoxLayout(window);
   layout->setContentsMargins(0, 0, 0, 0);
   QCefWidget *browser = cef->create_widget(window, raw.toUtf8().constData(), nullptr);
   if (!browser) { delete window.data(); obs_data_set_bool(response, "success", false); obs_data_set_string(response, "error", "O navegador interno não conseguiu criar a janela."); return; }
   browser->allowAllPopups(true);
   layout->addWidget(browser);
   QScreen *targetScreen = (OBSBasic::Get() && OBSBasic::Get()->screen()) ? OBSBasic::Get()->screen() : QApplication::primaryScreen();
   const QRect screen = targetScreen ? targetScreen->availableGeometry() : QRect(0, 0, 1280, 720);
   const bool sized = wantWidth >= 360 && wantWidth <= 4000 && wantHeight >= 240 && wantHeight <= 3000;
   const int width = std::min(sized ? wantWidth : 1200, screen.width() - 40), height = std::min(sized ? wantHeight : 850, screen.height() - 80);
   window->setMinimumSize(std::min(sized ? width : 800, screen.width() - 40), std::min(sized ? height : 600, screen.height() - 80));
   const char *savedGeometry = config_get_string(App()->GetUserConfig(), "PanelWindows", geometryKey.c_str());
   const QByteArray geometry = savedGeometry && *savedGeometry ? QByteArray::fromBase64(QByteArray(savedGeometry)) : QByteArray();
   if (geometry.isEmpty() || !window->restoreGeometry(geometry)) {
    window->resize(width, height);
    window->move(screen.center() - window->rect().center());
   }
  }
  window->show(); window->raise(); window->activateWindow();
  obs_data_set_bool(response, "success", true);
#else
  obs_data_set_bool(response, "success", false);
  obs_data_set_string(response, "error", "Esta compilação não inclui o navegador interno.");
#endif
 }, Qt::BlockingQueuedConnection);
}
void RequestSetTransitionDuration(obs_data_t *request, obs_data_t *response, void *)
{
 const int value = int(obs_data_get_int(request, "duration"));
 QMetaObject::invokeMethod(OBSBasic::Get(), [value, response]() {
  OBSBasic *main = OBSBasic::Get();
  auto *spin = main ? main->findChild<QSpinBox *>("freemixTransitionDuration") : nullptr;
  if (!spin || value < 50 || value > 2000) { obs_data_set_bool(response, "success", false); return; }
  spin->setValue(value);
  obs_data_set_int(response, "duration", spin->value());
  obs_data_set_bool(response, "success", true);
 }, Qt::BlockingQueuedConnection);
}

void RequestSetPanelTitle(obs_data_t *request, obs_data_t *response, void *)
{
 const QString url = QString::fromUtf8(obs_data_get_string(request, "url"));
 const QString title = QString::fromUtf8(obs_data_get_string(request, "title")).trimmed().left(100);
 QMetaObject::invokeMethod(OBSBasic::Get(), [url, title, response]() {
  const auto found = panelWindows.find(url.toStdString());
  const QPointer<QDialog> window = found == panelWindows.end() ? nullptr : found->second;
  if (!window || title.isEmpty()) { obs_data_set_bool(response, "success", false); return; }
  window->setWindowTitle(title);
  obs_data_set_bool(response, "success", true);
 }, Qt::BlockingQueuedConnection);
}

void RequestReorderInputs(obs_data_t *request, obs_data_t *response, void *)
{
 OBSDataArrayAutoRelease keys = obs_data_get_array(request, "keys");
 QMetaObject::invokeMethod(OBSBasic::Get(), [response, &keys]() {
  obs_data_set_bool(response, "success", OBSBasic::Get()->ReorderFreeMixInputs(keys));
 }, Qt::BlockingQueuedConnection);
}
// UI handoff: validate first; closing a CEF page must not require a second request from that page.
void RequestFinishInputPanel(obs_data_t *request, obs_data_t *response, void *)
{
 const std::string key = obs_data_get_string(request, "url");
 const std::string editor = obs_data_get_string(request, "editor");
 const std::string name = obs_data_get_string(request, "inputName");
 QMetaObject::invokeMethod(OBSBasic::Get(), [key, editor, name, response]() {
  auto *main = OBSBasic::Get();
  if (!main || main->isClosing() || frontendClosing || panelDeletionDepth) { obs_data_set_bool(response,"success",false); obs_data_set_string(response,"error","O 3Mix está encerrando ou fechando outra janela. Tente novamente."); return; }
  if (!editor.empty() && editor != "properties" && editor != "filters") { obs_data_set_bool(response,"success",false); obs_data_set_string(response,"error","Editor de entrada inválido."); return; }
  const auto found = panelWindows.find(key);
  const QPointer<QDialog> panel = found == panelWindows.end() ? nullptr : found->second;
  OBSSourceAutoRelease retained = editor.empty() ? nullptr : obs_get_source_by_name(name.c_str());
  OBSSource source(retained);
  if (!panel || (!editor.empty() && (!source || obs_source_removed(source)))) { obs_data_set_bool(response,"success",false); obs_data_set_string(response,"error","Janela ou entrada não encontrada. A mesa foi preservada."); return; }
  const QPointer<OBSBasic> owner = main;
  QTimer::singleShot(0, main, [owner, panel, editor, source]() {
   if (!owner || owner->isClosing() || frontendClosing || !panel) return;
   if (!panel->close()) { blog(LOG_WARNING,"3Mix input handoff: panel refused close; input preserved"); return; }
   if (editor.empty()) return;
   // Wait for the existing cooperative CEF destructor, including its nested Qt event loops.
   auto *timer = new QTimer(owner);
   timer->setInterval(25);
   QObject::connect(timer, &QTimer::timeout, owner, [owner, panel, editor, source, timer, tries=0]() mutable {
    if (!owner || owner->isClosing() || frontendClosing || ++tries > 160 || obs_source_removed(source)) { blog(LOG_WARNING,"3Mix input handoff cancelled or timed out; input preserved"); timer->stop(); timer->deleteLater(); return; }
    if (panel || panelDeletionDepth) return;
    timer->stop(); timer->deleteLater();
    if (editor == "properties") owner->CreatePropertiesWindow(source);
    else owner->CreateFiltersWindow(source);
   });
   timer->start();
  });
  obs_data_set_bool(response,"success",true); obs_data_set_bool(response,"queued",true);
 }, Qt::BlockingQueuedConnection);
}

void RequestClosePanel(obs_data_t *request, obs_data_t *response, void *)
{
 const std::string key = obs_data_get_string(request, "url");
 QMetaObject::invokeMethod(OBSBasic::Get(), [key, response]() {
  auto *main = OBSBasic::Get();
  if (!main || main->isClosing() || frontendClosing) { obs_data_set_bool(response, "success", false); obs_data_set_string(response, "error", "O 3Mix está encerrando."); return; }
  const auto found = panelWindows.find(key);
  const QPointer<QDialog> window = found == panelWindows.end() ? nullptr : found->second;
  obs_data_set_bool(response, "success", window && !panelDeletionDepth);
  if (window && !panelDeletionDepth) window->close();
 }, Qt::BlockingQueuedConnection);
}
void RequestGetInterface(obs_data_t *request, obs_data_t *response, void *)
{
 const bool capture = obs_data_get_bool(request, "screenshot");
 const bool show = obs_data_get_bool(request, "show");
 const bool sourceEditors = obs_data_get_bool(request, "sourceEditors");
 QMetaObject::invokeMethod(OBSBasic::Get(), [response, capture, show, sourceEditors]() {
  auto *main = OBSBasic::Get();
   if (!main || main->isClosing() || frontendClosing || panelDeletionDepth) {
    obs_data_set_int(response, "pid", QCoreApplication::applicationPid());
    obs_data_set_string(response, "executable", QCoreApplication::applicationFilePath().toUtf8().constData());
    obs_data_set_bool(response, "interfaceBusy", true);
    if (sourceEditors) obs_data_set_bool(response, "sourceEditorsObserved", false);
    obs_data_set_bool(response, "closing", !main || main->isClosing() || frontendClosing);
    obs_data_set_bool(response, "success", true);
    return;
   }
  if (show) {
   main->showNormal();
   QMetaObject::invokeMethod(main, "EnablePreviewDisplay", Qt::DirectConnection, Q_ARG(bool, true));
  }
  OBSDataArrayAutoRelease geometry = obs_data_array_create();
  for (const char *name : {"preview", "previewLabel", "freemixTransitionColumn", "freemixOverlayButtons", "freemixProductionClocks", "Mesa_extraBrowser"}) {
   // Search only the persistent desk, never transient browser dialogs.
   QWidget *widget = main->centralWidget() ? main->centralWidget()->findChild<QWidget *>(name) : nullptr;
   if (!widget) {
    for (auto *dock : main->findChildren<QDockWidget *>(QString(), Qt::FindDirectChildrenOnly)) {
     if (dock->objectName() == name) widget = dock;
     else if (dock->widget()) widget = dock->widget()->objectName() == name ? dock->widget() : dock->widget()->findChild<QWidget *>(name);
     if (widget) break;
    }
   }
   if (!widget) continue;
   OBSDataAutoRelease item = obs_data_create();
   const QPoint position = widget->mapTo(main, QPoint(0, 0));
   obs_data_set_string(item, "name", name);
   obs_data_set_int(item, "x", position.x()); obs_data_set_int(item, "y", position.y());
   obs_data_set_int(item, "width", widget->width()); obs_data_set_int(item, "height", widget->height());
   obs_data_set_bool(item, "visible", widget->isVisible());
   const QVariant background = widget->property("displayBackgroundColor");
   if (background.isValid()) obs_data_set_string(item, "background", background.value<QColor>().name().toUtf8().constData());
   obs_data_array_push_back(geometry, item);
  }
  obs_data_set_array(response, "layout", geometry);
  obs_data_set_int(response, "switcherLayoutVersion", 2);
  if (auto *duration = main->findChild<QSpinBox *>("freemixTransitionDuration"))
   obs_data_set_int(response, "transitionDuration", duration->value());
  OBSDataArrayAutoRelease docks = obs_data_array_create();
   for (auto *dock : main->findChildren<QDockWidget *>(QString(), Qt::FindDirectChildrenOnly)) {
   OBSDataAutoRelease item = obs_data_create();
   obs_data_set_string(item, "title", dock->windowTitle().toUtf8().constData());
   obs_data_set_string(item, "name", dock->objectName().toUtf8().constData());
   obs_data_set_bool(item, "visible", dock->isVisible());
   obs_data_set_int(item, "titleBarHeight", dock->titleBarWidget() ? dock->titleBarWidget()->height() : -1);
   obs_data_array_push_back(docks, item);
  }
  obs_data_set_array(response, "docks", docks);
  OBSDataArrayAutoRelease windows = obs_data_array_create();
  for (const auto &[url, window] : panelWindows) {
   if (!window) continue;
   OBSDataAutoRelease item = obs_data_create();
   obs_data_set_string(item, "title", window->windowTitle().toUtf8().constData());
   obs_data_set_int(item, "width", window->width());
   obs_data_set_int(item, "height", window->height());
   obs_data_set_int(item, "x", window->x());
   obs_data_set_int(item, "y", window->y());
   obs_data_set_bool(item, "visible", window->isVisible());
   obs_data_set_bool(item, "independent", !window->parentWidget());
   obs_data_set_string(item, "url", url.c_str());
   obs_data_array_push_back(windows, item);
  }
  obs_data_set_array(response, "panels", windows);
  // Optional Qt observations only: never interpret visibility as external z-order proof.
  if (sourceEditors) {
   OBSDataArrayAutoRelease editors = obs_data_array_create();
   QWidget *focus = QApplication::focusWidget();
   size_t editorCount = 0;
   bool truncated = false;
   for (auto *dialog : main->findChildren<QDialog *>(QString(), Qt::FindDirectChildrenOnly)) {
    const QString type = QString::fromLatin1(dialog->metaObject()->className());
    const char *kind = type == "OBSBasicProperties" ? "properties" : type == "OBSBasicFilters" ? "filters" : nullptr;
    if (!kind) continue;
    if (editorCount++ >= 8) { truncated = true; break; }
    OBSDataAutoRelease item = obs_data_create();
    const QString sourceUuid = dialog->property("freemixSourceUuid").toString();
    obs_data_set_string(item, "kind", kind);
    obs_data_set_string(item, "sourceUuid", sourceUuid.toUtf8().constData());
    obs_data_set_bool(item, "identityKnown", !sourceUuid.isEmpty());
    obs_data_set_bool(item, "visible", dialog->isVisible());
    obs_data_set_bool(item, "minimized", dialog->isMinimized());
    obs_data_set_bool(item, "activeWindow", dialog->isActiveWindow());
    obs_data_set_bool(item, "focusWithin", focus && (focus == dialog || dialog->isAncestorOf(focus)));
    obs_data_array_push_back(editors, item);
   }
   obs_data_set_array(response, "sourceEditors", editors);
   obs_data_set_bool(response, "sourceEditorsObserved", true);
   obs_data_set_bool(response, "sourceEditorsTruncated", truncated);
   obs_data_set_bool(response, "sourceEditorsZOrderVerified", false);
  }
  bool settingsOpen = false;
   for (auto *dialog : main->findChildren<QDialog *>(QString(), Qt::FindDirectChildrenOnly)) {
   if (QString::fromLatin1(dialog->metaObject()->className()) == "OBSBasicSettings" && dialog->isVisible()) settingsOpen = true;
  }
  obs_data_set_bool(response, "nativeSettingsOpen", settingsOpen);
  obs_data_set_string(response, "title", main->windowTitle().toUtf8().constData());
  obs_data_set_int(response, "pid", QCoreApplication::applicationPid());
   obs_data_set_string(response, "executable", QCoreApplication::applicationFilePath().toUtf8().constData());
  if (capture) {
   QByteArray bytes;
   QBuffer buffer(&bytes);
   buffer.open(QIODevice::WriteOnly);
   main->grab().save(&buffer, "PNG");
   obs_data_set_string(response, "imageData", ("data:image/png;base64," + bytes.toBase64()).constData());
  }
  obs_data_set_bool(response, "success", true);
 }, Qt::BlockingQueuedConnection);
}

void RequestSourcesStatus(obs_data_t *, obs_data_t *response, void *)
{
	QMetaObject::invokeMethod(OBSBasic::Get(), [response]() {
		if(frontendClosing){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","frontend is closing");return;}
		OBSDataArrayAutoRelease sources=obs_data_array_create();
		struct StatusContext {obs_data_array_t *sources;std::set<std::string> ids;};
		StatusContext context{sources,{}};
		auto enumerate=[](void *param,obs_source_t *source){
			auto *context=static_cast<StatusContext *>(param);const char *uuid=obs_source_get_uuid(source);
			if(context->ids.size()>=2000 || !context->ids.insert(uuid).second)return true;
			OBSDataAutoRelease item=obs_data_create();obs_data_set_string(item,"uuid",uuid);obs_data_set_string(item,"name",obs_source_get_name(source));obs_data_set_string(item,"kind",obs_source_get_id(source));
			obs_data_set_int(item,"width",obs_source_get_width(source));obs_data_set_int(item,"height",obs_source_get_height(source));
			const auto flags=obs_source_get_output_flags(source);obs_data_set_bool(item,"video",(flags&OBS_SOURCE_VIDEO)!=0);obs_data_set_bool(item,"audio",(flags&OBS_SOURCE_AUDIO)!=0);
			obs_data_set_bool(item,"active",obs_source_active(source));obs_data_set_bool(item,"showing",obs_source_showing(source));obs_data_set_bool(item,"enabled",obs_source_enabled(source));
			// Dimensions/visibility are observations, not proof of a live camera signal.
			obs_data_set_string(item,"signal","unknown");obs_data_set_string(item,"freeze","unknown");obs_data_array_push_back(context->sources,item);return true;
		};
		obs_enum_sources(enumerate,&context);obs_enum_scenes(enumerate,&context);
		obs_data_set_array(response,"sources",sources);obs_data_set_bool(response,"success",true);
	},Qt::BlockingQueuedConnection);
}

void RequestOpenSettings(obs_data_t *, obs_data_t *response, void *)
{
 // Queue the existing Settings action: it owns the modal dialog and duplicate-open guard.
 const bool queued = QMetaObject::invokeMethod(OBSBasic::Get(), "on_action_Settings_triggered", Qt::QueuedConnection);
 obs_data_set_bool(response, "success", queued);
}

// Native watchdog: private mic closes even if the browser or Node controller dies.
std::string directorUuid;
std::string talkLease;
bool isolatedTalk = false;
std::chrono::steady_clock::time_point talkUntil;
QTimer *talkTimer = nullptr;
QTimer *callVideoTimer = nullptr;
bool frontendDrainActive=false;
void ApplyTalkback(bool on)
{
 FreeMixCallAudioDirector(directorUuid.c_str(), on ? talkLease.c_str() : "");
 OBSSourceAutoRelease source = obs_get_source_by_uuid(directorUuid.c_str());
 if (!source) { talkLease.clear(); return; }
 // B is the private return. It must never feed Master (track 4) or its recorded output (track 1).
 OBSSourceAutoRelease returnBus = obs_get_source_by_name("3Mix Bus B");
 if (returnBus) obs_source_set_audio_mixers(returnBus, 1u << 2);
 obs_source_set_audio_mixers(source, on && !isolatedTalk ? (1u << 5) : 0u);
 obs_source_set_monitoring_type(source, OBS_MONITORING_TYPE_NONE);
 obs_source_set_muted(source, !on);
}
void RequestShutdownIdle(obs_data_t *request, obs_data_t *response, void *)
{
 const bool qaClose=obs_data_get_bool(request,"qaClose");
 QMetaObject::invokeMethod(OBSBasic::Get(), [response,qaClose]() {
  bool active = false;
  obs_enum_outputs([](void *param, obs_output_t *output) {
   if (obs_output_active(output)) *static_cast<bool *>(param) = true;
   return true;
  }, &active);
  if (active||freemix_srt_hdr::Pending()) { obs_data_set_bool(response, "success", false); return; }
  if(qaClose){QDir root(QCoreApplication::applicationDirPath());root.cdUp();root.cdUp();if(!QFileInfo(root.absolutePath()).fileName().startsWith("FreeMix-QA-")){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","qaClose requires an isolated QA root");return;}}
  talkLease.clear(); ApplyTalkback(false);
  OBSBasic::Get()->SavePresetAsDocument();
  if(qaClose)OBSBasic::Get()->setProperty("freemixQaCloseSaved",true);
  obs_data_set_bool(response, "success", true);
  QTimer::singleShot(250, OBSBasic::Get(), []() { OBSBasic::Get()->close(); });
 }, Qt::BlockingQueuedConnection);
}
void RequestTalkback(obs_data_t *request, obs_data_t *response, void *)
{
 const std::string action = obs_data_get_string(request, "action");
 const std::string uuid = obs_data_get_string(request, "uuid");
 const std::string lease = obs_data_get_string(request, "lease");
 const bool isolated = obs_data_get_bool(request, "isolated");
 QMetaObject::invokeMethod(OBSBasic::Get(), [response, action, uuid, lease, isolated]() {
  bool success = true;
  const auto now = std::chrono::steady_clock::now();
  if (action == "prepare") {
   OBSSourceAutoRelease source = obs_get_source_by_uuid(uuid.c_str());
   const std::string kind = source ? obs_source_get_id(source) : "";
   if (!source || (kind != "wasapi_input_capture" && kind != "ffmpeg_source")) success = false;
   else {
    ApplyTalkback(false);
    OBSSourceAutoRelease previous = obs_get_source_by_uuid(directorUuid.c_str());
    if (previous) { OBSDataAutoRelease data = obs_source_get_private_settings(previous); obs_data_set_bool(data, "freemix_director_private", false); }
    OBSDataAutoRelease data = obs_source_get_private_settings(source);
    obs_data_set_bool(data, "freemix_director_private", true);
    directorUuid = uuid; talkLease.clear(); ApplyTalkback(false);
   }
  } else if (action == "start") {
   if (directorUuid != uuid || lease.empty() || !talkLease.empty()) success = false;
   else { isolatedTalk = isolated; talkLease = lease; talkUntil = now + std::chrono::milliseconds(1500); ApplyTalkback(true); }
  } else if (action == "ping") {
   if (talkLease.empty() || talkLease != lease || now >= talkUntil) success = false;
   else talkUntil = now + std::chrono::milliseconds(1500);
  } else if (action == "stop") { talkLease.clear(); ApplyTalkback(false); }
  else if (action != "state") success = false;
  const bool on = !talkLease.empty() && now < talkUntil;
  if (action != "state" && !on) { talkLease.clear(); ApplyTalkback(false); }
  obs_data_set_bool(response, "talking", on);
  obs_data_set_bool(response, "watchdog", true);
  obs_data_set_bool(response, "isolated", isolatedTalk);
  obs_data_set_string(response, "director_uuid", directorUuid.c_str());
  obs_data_set_bool(response, "success", success);
 }, Qt::BlockingQueuedConnection);
}

void RegisterVendor()
{
 FreeMixAudioRoutingRegister();
 FreeMixCallVideoRegister();
	if (vendor) {
		return;
	}
	vendor = obs_websocket_register_vendor("freemix");
	if (!vendor) {
		blog(LOG_WARNING, "[freemix] control server not available: extra destinations cannot be edited");
		return;
	}
	obs_websocket_vendor_register_request(vendor, "fade_to_black", RequestFadeToBlack, nullptr);
	obs_websocket_vendor_register_request(vendor, "final_program_gate", RequestFinalProgramGate, nullptr);
	obs_websocket_vendor_register_request(vendor, "get_destinations", RequestGet, nullptr);
	obs_websocket_vendor_register_request(vendor, "set_destinations", RequestSet, nullptr);
	obs_websocket_vendor_register_request(vendor, "control_destination", RequestControlDestination, nullptr);
 // Probe before publishing network_output: reading its state never loads SDKs.
 networkOmtSdkAvailable=freemix_omt::Available();networkNdiSdkAvailable=freemix_ndi::Available();
 obs_websocket_vendor_register_request(vendor, "network_output", RequestNetworkOutput, nullptr);
 obs_websocket_vendor_register_request(vendor, "omt_hdr_output", RequestOmtHdrOutput, nullptr);
 obs_websocket_vendor_register_request(vendor,"srt_hdr_output",RequestSrtHdrOutput,nullptr);
 obs_websocket_vendor_register_request(vendor,"sdi_output",RequestSdiOutput,nullptr);
 obs_websocket_vendor_register_request(vendor,"open_vst_editor",RequestOpenVstEditor,nullptr);
 obs_websocket_vendor_register_request(vendor, "control_mix", RequestMix, nullptr);
 obs_websocket_vendor_register_request(vendor, "get_mixes", RequestMix, nullptr);
	obs_websocket_vendor_register_request(vendor, "project_creation_policy", RequestProjectPolicy, nullptr);
obs_websocket_vendor_register_request(vendor, "project_device_inventory", RequestProjectInventory, nullptr);
	obs_websocket_vendor_register_request(vendor, "save_preset", RequestSavePreset, nullptr);
	obs_websocket_vendor_register_request(vendor, "get_preset", RequestGetPreset, nullptr);
	obs_websocket_vendor_register_request(vendor, "get_scope", RequestGetScope, nullptr);
	obs_websocket_vendor_register_request(vendor, "set_scope", RequestSetScope, nullptr);
	obs_websocket_vendor_register_request(vendor, "get_master_level", RequestGetMasterLevel, nullptr);
 obs_websocket_vendor_register_request(vendor, "get_interface", RequestGetInterface, nullptr);
 obs_websocket_vendor_register_request(vendor, "get_sources_status", RequestSourcesStatus, nullptr);
 obs_websocket_vendor_register_request(vendor, "open_settings", RequestOpenSettings, nullptr);
 obs_websocket_vendor_register_request(vendor, "open_panel", RequestOpenPanel, nullptr);
	obs_websocket_vendor_register_request(vendor, "close_panel", RequestClosePanel, nullptr);
	obs_websocket_vendor_register_request(vendor, "set_panel_title", RequestSetPanelTitle, nullptr);
	obs_websocket_vendor_register_request(vendor, "set_transition_duration", RequestSetTransitionDuration, nullptr);
 obs_websocket_vendor_register_request(vendor, "finish_input_panel", RequestFinishInputPanel, nullptr);
 obs_websocket_vendor_register_request(vendor, "reorder_inputs", RequestReorderInputs, nullptr);
 obs_websocket_vendor_register_request(vendor, "talkback", RequestTalkback, nullptr);
 obs_websocket_vendor_register_request(vendor, "call_audio", FreeMixCallAudioRequest, nullptr);
 obs_websocket_vendor_register_request(vendor,"call_video",RequestCallVideo,nullptr);
 obs_websocket_vendor_register_request(vendor, "audio_capabilities", FreeMixAudioCapabilitiesRequest, nullptr);
 obs_websocket_vendor_register_request(vendor, "shutdown_idle", RequestShutdownIdle, nullptr);
 callVideoTimer = new QTimer(OBSBasic::Get());
 QObject::connect(callVideoTimer,&QTimer::timeout,OBSBasic::Get(),[](){if(frontendClosing)FreeMixCallVideoStop();FreeMixCallVideoTick(IsPrivateSource);});
 callVideoTimer->start(100); // Poll retirement even while frontendClosing/talkTimer stopped.
 talkTimer = new QTimer(OBSBasic::Get());
 QObject::connect(talkTimer, &QTimer::timeout, OBSBasic::Get(), []() {
  if(frontendClosing)return;
  FreeMixCallAudioTick();
  for(auto &d:destinations)if(d.sourceAudio&&!d.sourceAudio->Valid())Fail(d,"independent audio bus became private, removed or globally routed");
  for(auto &entry:networkMedia)if(entry.second->sourceAudio&&!entry.second->sourceAudio->Valid()){auto found=networkOutputs.find(entry.first);if(found!=networkOutputs.end()&&found->second&&obs_output_active(found->second))obs_output_stop(found->second);}
  // Retire completed asynchronous stops even when no browser polls state.
  for(auto &entry:networkMedia)if(entry.second){const auto found=networkOutputs.find(entry.first);RetireStoppedNetworkMedia(found!=networkOutputs.end()?found->second.Get():nullptr,*entry.second);}
  for(auto &d : destinations) if(d.view) for(uint32_t channel=1;channel<=8;channel++) {
   OBSSourceAutoRelease overlay=(d.overlaysMask & (1u<<(channel-1)))&&d.overlayChannels[channel-1]?obs_get_output_source(d.overlayChannels[channel-1]):nullptr;
   if(overlay && IsPrivateSource(overlay)) { Fail(d,"overlay contains private director source"); break; }
   if(!UpdateOutputOverlay(d,channel,overlay)){Fail(d,"could not frame output overlay");break;}
  }
  const bool on = !talkLease.empty() && std::chrono::steady_clock::now() < talkUntil;
  if (!on) talkLease.clear();
  if (!directorUuid.empty()) ApplyTalkback(on);
 });
 talkTimer->start(100);
 srtHdrTimer=new QTimer(OBSBasic::Get());
 QObject::connect(srtHdrTimer,&QTimer::timeout,OBSBasic::Get(),[](){freemix_srt_hdr::Tick(IsPrivateSource);});
 srtHdrTimer->start(100);
}

void RestorePrivateDirector()
{
 FreeMixCallAudioStop();
 talkLease.clear(); ApplyTalkback(false); directorUuid.clear();
 obs_enum_sources([](void *, obs_source_t *source) {
  OBSDataAutoRelease data = obs_source_get_private_settings(source);
  if (obs_data_get_bool(data, "freemix_director_private")) {
   obs_source_set_audio_mixers(source, 0);
   obs_source_set_monitoring_type(source, OBS_MONITORING_TYPE_NONE);
   obs_source_set_muted(source, true);
   directorUuid = obs_source_get_uuid(source);
  }
  return true;
 }, nullptr);
}

void OnFrontendEvent(enum obs_frontend_event event, void *)
{
	switch (event) {
	case OBS_FRONTEND_EVENT_SCENE_COLLECTION_CLEANUP:
  frontendClosing=true;
  if(auto *main=OBSBasic::Get())main->ResetFreeMixFtbContext();
  if(talkTimer)talkTimer->stop();
  StopNetworkOutputs(); StopAll();
  mixEffectManager.Clear();
  FreeMixCallAudioStop(); talkLease.clear();
  break;
	case OBS_FRONTEND_EVENT_PREVIEW_SCENE_CHANGED:
	case OBS_FRONTEND_EVENT_SCENE_CHANGED:
		RefreshProgramVideos();
		break;
	case OBS_FRONTEND_EVENT_SCENE_COLLECTION_CHANGED:
  StopNetworkOutputs();
  StopAll();
  mixEffectManager.Clear();
  RestorePrivateDirector();
  mixEffectManager.LoadIndependentMix(); frontendClosing=false; if(talkTimer)talkTimer->start(100);
  break;
	case OBS_FRONTEND_EVENT_FINISHED_LOADING:
		frontendClosing=false;
		RegisterVendor();
		mixEffectManager.RestoreIndependentMixes();
   for(QDockWidget *dock : OBSBasic::Get()->findChildren<QDockWidget *>()) {
   if(dock->objectName()=="Menu_extraBrowser"||dock->objectName()=="Mesa_extraBrowser") {
    auto *title=new QWidget(dock);title->setFixedHeight(0);dock->setTitleBarWidget(title);
    if(dock->objectName()=="Menu_extraBrowser") dock->setFixedHeight(24);
   }
   // Rebalance the existing native displays and desk, not a second web switcher.
   QTimer::singleShot(500, OBSBasic::Get(), []() {
    auto *main = OBSBasic::Get();
    if (!main || main->isClosing()) return;
    if (config_get_int(App()->GetUserConfig(), "BasicWindow", "FreeMixLayoutVersion") >= 2) return;
    for (auto *dock : main->findChildren<QDockWidget *>(QString(), Qt::FindDirectChildrenOnly)) {
     if (dock->objectName() == "Mesa_extraBrowser") {
      main->resizeDocks({dock}, {std::max(280, main->height() * 52 / 100)}, Qt::Vertical);
      config_set_int(App()->GetUserConfig(), "BasicWindow", "FreeMixLayoutVersion", 2);
      break;
     }
    }
   });
  }
  RestorePrivateDirector();
		Load();
		break;
	case OBS_FRONTEND_EVENT_PROFILE_CHANGING:
  frontendClosing=true; if(auto *main=OBSBasic::Get())main->ResetFreeMixFtbContext(); if(talkTimer)talkTimer->stop();
  StopNetworkOutputs();
		StopAll();
  mixEffectManager.Clear();
		break;
	case OBS_FRONTEND_EVENT_PROFILE_CHANGED:
		frontendClosing=false; if(talkTimer)talkTimer->start(100);
		Load();
		EmitChanged();
		break;
	case OBS_FRONTEND_EVENT_STREAMING_STARTED:
		Apply();
		break;
	case OBS_FRONTEND_EVENT_STREAMING_STOPPING:
	case OBS_FRONTEND_EVENT_STREAMING_STOPPED:
	case OBS_FRONTEND_EVENT_EXIT:
  if(event==OBS_FRONTEND_EVENT_EXIT){frontendClosing=true;if(talkTimer)talkTimer->stop();}
  if(event==OBS_FRONTEND_EVENT_EXIT)StopNetworkOutputs();
  FreeMixCallAudioStop();
  talkLease.clear(); ApplyTalkback(false);
		StopAll();
  if(event==OBS_FRONTEND_EVENT_EXIT){mixEffectManager.Clear();}
		break;
	default:
		break;
	}
}

} // namespace

/* Center-column talkback. It uses the same director source and ApplyTalkback path as Calls, without a
 * browser widget and without a second audio engine. The native watchdog still closes it after 1.5 s. */
void FreeMixTalkbackPress(bool on)
{
 if (on) {
  if (directorUuid.empty()) return;
  talkLease = QUuid::createUuid().toString(QUuid::WithoutBraces).toStdString();
  isolatedTalk = false;
  talkUntil = std::chrono::steady_clock::now() + std::chrono::milliseconds(1500);
  ApplyTalkback(true);
 } else {
  talkLease.clear();
  ApplyTalkback(false);
 }
}
bool FreeMixTalkbackReady()
{
 return !directorUuid.empty();
}
bool FreeMixTalkbackActive()
{
 return !talkLease.empty() && std::chrono::steady_clock::now() < talkUntil;
}
void FreeMixTalkbackKeepAlive()
{
 if (!talkLease.empty()) talkUntil = std::chrono::steady_clock::now() + std::chrono::milliseconds(1500);
}

bool FreeMixMultistreamDrainSrtHdr(unsigned timeoutMs)
{
 // Existing guarded close/profile/collection/video-reset callsites also drain Calls.
 if(frontendDrainActive)return false; // Nested context change must not clear outer gate.
 if(!FreeMixCallVideoPending()&&!freemix_srt_hdr::Pending())return true;
 auto *main=OBSBasic::Get();if(!main||QThread::currentThread()!=main->thread())return false;
 frontendDrainActive=true;
 const bool wasClosing=frontendClosing.exchange(true);
 const uint64_t started=os_gettime_ns();
 const bool callsDone=FreeMixCallVideoDrain(timeoutMs);
 const uint64_t elapsed=(os_gettime_ns()-started)/1000000ULL;
 const unsigned remaining=elapsed>=timeoutMs?0:timeoutMs-unsigned(elapsed);
 const bool completed=callsDone&&freemix_srt_hdr::Drain(remaining);
 frontendClosing=wasClosing;frontendDrainActive=false;
 if(!completed){if(!wasClosing&&talkTimer)talkTimer->start(100);blog(LOG_WARNING,"3Mix network drain timed out: resources retained; context change/close refused");}
 return completed;
}

bool FreeMixMultistreamDeferClose()
{
 if (!panelDeletionDepth) return false;
 pendingMainClose = true;
 return true;
}

void FreeMixMultistreamBeginClose()
{
 frontendClosing = true;
 if (talkTimer) talkTimer->stop();
 // Panels are true top-level windows, so collect them from the registry
 // before clearing it; keep the legacy child search as a safety net.
 std::vector<QPointer<QDialog>> closingPanels;
 for (auto &[url, dialog] : panelWindows) {
  if (dialog && !dialog->property("freemixDeleting").toBool()) closingPanels.emplace_back(dialog);
 }
 panelWindows.clear();
 auto *main = OBSBasic::Get();
 if (main) for (auto *dialog : main->findChildren<QDialog *>(QString(), Qt::FindDirectChildrenOnly)) {
  if (dialog->objectName() == "freemixPanelWindow" && !dialog->property("freemixDeleting").toBool()) closingPanels.emplace_back(dialog);
 }
 ++panelDeletionDepth;
 for (const auto &dialog : closingPanels) {
  if (!dialog || dialog->property("freemixDeleting").toBool()) continue;
  dialog->setProperty("freemixDeletionQueued", true);
  dialog->setProperty("freemixDeleting", true);
  dialog->hide();
  delete dialog.data();
 }
 --panelDeletionDepth;
}

void FreeMixMultistreamInit()
{
	RegisterHlsService();
 FreeMixAudioRoutingRegister();
 freemix_omt::Register();freemix_ndi::Register();
 freemix_omt_hdr::Register();
	obs_frontend_add_event_callback(OnFrontendEvent, nullptr);
}
