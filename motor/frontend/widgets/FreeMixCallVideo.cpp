// SPDX-License-Identifier: GPL-2.0-or-later
// Isolated Native draft, not installed. Public-only AUX video; no audio or Master capture.
#include "FreeMixCallVideo.hpp"
#include "FreeMixCallVideoPool.hpp"
#include "FreeMixCallVideoIpc.hpp"
#include "FreeMixCallVideoPolicy.hpp"
#include <obs.hpp>
#include <QCoreApplication>
#include <QEventLoop>
#include <QHostAddress>
#include <QTcpSocket>
#include <QThread>
#include <array>
#include <algorithm>
#include <climits>
#include <chrono>
#include <memory>
#include <new>
#include <string>
#include <thread>
#include <util/platform.h>

namespace {
using namespace freemix_call_video;
constexpr uint64_t LeaseNs=5000000000ULL;
struct Session;
struct RawContext {
 obs_output_t *output=nullptr;
 std::atomic<Session *> owner{nullptr};std::atomic<unsigned> readers{0};
};
// SC ordering: a reader that observed old owner was counted before detach.
// Detach waits for all readers before Session can be retired.
struct OwnerRead {
 RawContext &context;Session *owner;
 explicit OwnerRead(void *data):context(*static_cast<RawContext *>(data)){
  context.readers.fetch_add(1);owner=context.owner.load();
 }
 ~OwnerRead(){context.readers.fetch_sub(1);}
};
struct Session {
 uint32_t slot=0,generation=0,baseWidth=0,baseHeight=0,fpsNum=0,fpsDen=0;uint16_t port=0;
 std::string uuid;std::array<uint8_t,32> token{};Pool pool;
 obs_source_t *source=nullptr;obs_scene_t *scene=nullptr;obs_view_t *view=nullptr;video_t *video=nullptr;
 // Created output ref belongs to worker. External observers may retain their own refs.
 obs_output_t *output=nullptr;RawContext *raw=nullptr;std::thread worker;
 Ipc ipc;std::atomic<bool> startSettled{false},finished{false},allowStart{false};
 uint64_t until=0;bool started=false;
 void RequestStop(){pool.accepting.store(false);ipc.stop.store(true);if(!started)startSettled.store(true);}
 bool ReleaseGui(){
  if(worker.joinable()&&!finished.load(std::memory_order_acquire))return false;
  if(worker.joinable()){try{worker.detach();}catch(...){return false;}}output=nullptr;raw=nullptr;video=nullptr;
  if(view){obs_view_remove(view);obs_view_set_source(view,0,nullptr);obs_view_destroy(view);view=nullptr;}
  if(scene){obs_scene_release(scene);scene=nullptr;}if(source){obs_source_release(source);source=nullptr;}
  token.fill(0);return true;
 }
 // No destructor touches OBS or joins. Session is deleted only after safe explicit retirement.
};
// Plain registry has no exit destructor: never free live OBS refs after obs_shutdown.
// Root gates MUST refuse context teardown while Pending; this is not a force-close fallback.
std::array<Session *,2> &Sessions(){static std::array<Session *,2> value{};return value;}
std::array<uint32_t,2> generations{};
thread_local Session *creating=nullptr;
bool registered=false,draining=false;
struct Completion{uint32_t generation=0,fault=0;uint64_t sent=0,captured=0;};
std::array<Completion,2> completed{};
void Retire(Session *&s){if(!s->finished.load(std::memory_order_acquire)||!s->ReleaseGui())return;completed[s->slot]={s->generation,s->ipc.fault.load(),s->ipc.sent.load(),s->pool.captured.load()};delete s;s=nullptr;}
bool Gui(){auto *app=QCoreApplication::instance();return app&&QThread::currentThread()==app->thread();}
bool OwnReturn(obs_source_t *source){
 if(!source)return true;bool found=false;
 auto check=[](obs_source_t *child,bool &found){OBSDataAutoRelease settings=obs_source_get_private_settings(child);if(obs_data_get_bool(settings,"freemix_call_video_return_private"))found=true;};
 check(source,found);obs_source_enum_full_tree(source,[](obs_source_t *,obs_source_t *child,void *param){OBSDataAutoRelease settings=obs_source_get_private_settings(child);if(obs_data_get_bool(settings,"freemix_call_video_return_private"))*static_cast<bool *>(param)=true;},&found);return found;
}
const char *Name(void *){return "3Mix Calls continuous return video";}
void *Create(obs_data_t *,obs_output_t *output){
 if(!creating)return nullptr;auto *context=new(std::nothrow) RawContext;
 if(!context)return nullptr;context->output=output;context->owner=creating;
 creating->output=output;creating->raw=context;return context;
}
void Destroy(void *data){delete static_cast<RawContext *>(data);}
bool StartRaw(void *data){
 OwnerRead read(data);auto *s=read.owner;
 return s&&Gui()&&s->allowStart.exchange(false)&&!s->ipc.stop.load()&&obs_output_begin_data_capture(read.context.output,OBS_OUTPUT_VIDEO);
}
void StopRaw(void *data,uint64_t){
 OwnerRead read(data);if(read.owner)read.owner->pool.accepting.store(false);
 obs_output_end_data_capture(read.context.output);
}
void RawVideo(void *data,video_data *frame){OwnerRead read(data);if(read.owner&&frame)read.owner->pool.Capture(frame->data[0],frame->linesize[0],frame->timestamp);}
uint64_t Bytes(void *data){OwnerRead read(data);return read.owner?read.owner->ipc.bytes.load():0;}
int PoolDropped(Session &s){auto &p=s.pool;return int(std::min<uint64_t>(INT_MAX,p.replaced.load()+p.busyDropped.load()+p.clockDropped.load()));}
int Dropped(void *data){OwnerRead read(data);return read.owner?PoolDropped(*read.owner):0;}
void Worker(Session &s){
 auto finish=[&](){
  s.pool.accepting.store(false);
  // GUI start cannot race teardown: stop request settles a never-started session.
  while(!s.startSettled.load())std::this_thread::sleep_for(std::chrono::milliseconds(1));
  if(s.output){
   obs_output_force_stop(s.output);
   // active=false follows stop_raw_video/disconnect in libobs, which joins raw callbacks.
   // A stuck OBS worker is NOT forcibly freed: GUI Drain deadline refuses context teardown.
   while(obs_output_active(s.output))std::this_thread::sleep_for(std::chrono::milliseconds(1));
   s.raw->owner.exchange(nullptr);
   while(s.raw->readers.load()!=0)std::this_thread::sleep_for(std::chrono::milliseconds(1));
   s.raw=nullptr;obs_output_set_media(s.output,nullptr,nullptr);obs_output_release(s.output); // External output ref no longer exposes released AUX video.
  }
  s.token.fill(0);s.finished.store(true,std::memory_order_release); // Last Session access; remaining thread exit touches no OBS/Session.
 };
 try{RunIpc(s.pool,s.ipc,s.port,s.slot,s.generation,s.token);}catch(...){s.ipc.fault=7;}
 finish();
}
std::string Build(Session &s,bool (*isPrivate)(obs_source_t *)){
 s.source=obs_get_source_by_uuid(s.uuid.c_str());
 if(!s.source||obs_source_removed(s.source)||!isPrivate||isPrivate(s.source)||OwnReturn(s.source)||(obs_source_get_output_flags(s.source)&OBS_SOURCE_VIDEO)==0||!obs_source_get_width(s.source)||!obs_source_get_height(s.source))return "Public loaded video source outside private audio/return loops required";
 const auto cs=obs_source_get_color_space(s.source,0,nullptr);if(cs!=GS_CS_SRGB&&cs!=GS_CS_SRGB_16F)return "This finite return supports SDR sources only";
 obs_video_info info{};if(!obs_get_video_info(&info)||!info.base_width||!info.base_height||!info.fps_den)return "Native video context unavailable";
 const auto fps=DeriveFps(info.fps_num,info.fps_den);if(!fps.divisor)return "Continuous return requires Main25/50,30/60 or30000/60000 over1001; no video reset or FPS relabel";
 s.pool.divisor=fps.divisor;s.pool.fpsNum=fps.numerator;s.pool.fpsDen=fps.denominator;s.fpsNum=info.fps_num;s.fpsDen=info.fps_den;s.baseWidth=info.base_width;s.baseHeight=info.base_height;
 s.scene=obs_scene_create_private("3Mix Calls auxiliary frame");if(!s.scene)return "Could not allocate private frame";
 {OBSDataAutoRelease settings=obs_source_get_private_settings(obs_scene_get_source(s.scene));obs_data_set_bool(settings,"freemix_call_video_return_private",true);}
 obs_source_set_audio_mixers(obs_scene_get_source(s.scene),0);obs_source_set_monitoring_type(obs_scene_get_source(s.scene),OBS_MONITORING_TYPE_NONE);
 auto *item=obs_scene_add(s.scene,s.source);if(!item)return "Could not frame video source";
 vec2 size{},position{};vec2_set(&size,float(info.base_width),float(info.base_height));vec2_set(&position,size.x/2,size.y/2);
 obs_sceneitem_set_alignment(item,OBS_ALIGN_CENTER);obs_sceneitem_set_pos(item,&position);obs_sceneitem_set_bounds_type(item,OBS_BOUNDS_SCALE_INNER);obs_sceneitem_set_bounds_alignment(item,OBS_ALIGN_CENTER);obs_sceneitem_set_bounds(item,&size);
 info.output_width=Width;info.output_height=Height;info.output_format=VIDEO_FORMAT_BGRA;info.colorspace=VIDEO_CS_709;info.range=VIDEO_RANGE_FULL;info.gpu_conversion=false;
 s.view=obs_view_create();if(!s.view)return "Could not create AUX view";obs_view_set_source(s.view,0,obs_scene_get_source(s.scene));s.video=obs_view_add2(s.view,&info);if(!s.video)return "AUX video context unavailable";
 creating=&s;s.output=obs_output_create("freemix_calls_return_video","3Mix Calls auxiliary video",nullptr,nullptr);creating=nullptr;if(!s.output)return "Raw AUX output unavailable";
 obs_output_set_media(s.output,s.video,nullptr);
 video_scale_info conversion{};conversion.format=VIDEO_FORMAT_RGBA;conversion.width=Width;conversion.height=Height;conversion.colorspace=VIDEO_CS_709;conversion.range=VIDEO_RANGE_FULL;obs_output_set_video_conversion(s.output,&conversion);
 try{s.worker=std::thread([&s](){Worker(s);});}catch(...){obs_output_release(s.output);s.output=nullptr;return "Could not create bounded IPC worker";}
 return "";
}
void State(obs_data_t *response){
 obs_video_info info{};const bool context=obs_get_video_info(&info);const auto fps=context?DeriveFps(info.fps_num,info.fps_den):FpsPlan{};const bool compatible=fps.divisor!=0;
 obs_data_set_bool(response,"available",registered&&compatible);obs_data_set_bool(response,"registered",registered);obs_data_set_bool(response,"mainFpsCompatible",compatible);obs_data_set_int(response,"mainFpsNumerator",context?info.fps_num:0);obs_data_set_int(response,"mainFpsDenominator",context?info.fps_den:0);obs_data_set_int(response,"outputFpsNumerator",fps.numerator);obs_data_set_int(response,"outputFpsDenominator",fps.denominator);obs_data_set_int(response,"frameDivisor",fps.divisor);obs_data_set_bool(response,"experimental",true);obs_data_set_bool(response,"autoStart",false);obs_data_set_bool(response,"audioIncluded",false);obs_data_set_int(response,"maxUniqueSources",2);obs_data_set_string(response,"contract","rgba640x360-derived-fps-opaque-pts-v1");
 OBSDataArrayAutoRelease rows=obs_data_array_create();
 for(auto &s:Sessions())if(s){OBSDataAutoRelease row=obs_data_create();obs_data_set_int(row,"slot",s->slot);obs_data_set_int(row,"generation",s->generation);obs_data_set_string(row,"sourceUuid",s->uuid.c_str());obs_data_set_int(row,"mainFpsNumerator",s->fpsNum);obs_data_set_int(row,"mainFpsDenominator",s->fpsDen);obs_data_set_int(row,"outputFpsNumerator",s->pool.fpsNum);obs_data_set_int(row,"outputFpsDenominator",s->pool.fpsDen);obs_data_set_int(row,"frameDivisor",s->pool.divisor);obs_data_set_string(row,"state",s->ipc.stop.load()?"stopping":s->started?"capturing":"starting");obs_data_set_int(row,"faultCode",s->ipc.fault.load());obs_data_set_int(row,"captured",s->pool.captured.load());obs_data_set_int(row,"sent",s->ipc.sent.load());obs_data_set_int(row,"dropped",PoolDropped(*s));obs_data_set_int(row,"socketBackpressure",s->ipc.backpressure.load());obs_data_array_push_back(rows,row);}
 obs_data_set_array(response,"sessions",rows);obs_data_set_bool(response,"pending",FreeMixCallVideoPending());
 OBSDataArrayAutoRelease receipts=obs_data_array_create();for(uint32_t slot=0;slot<2;slot++)if(completed[slot].generation){OBSDataAutoRelease row=obs_data_create();obs_data_set_int(row,"slot",slot);obs_data_set_int(row,"generation",completed[slot].generation);obs_data_set_int(row,"faultCode",completed[slot].fault);obs_data_set_int(row,"sent",completed[slot].sent);obs_data_set_int(row,"captured",completed[slot].captured);obs_data_set_string(row,"stage","retired");obs_data_array_push_back(receipts,row);}obs_data_set_array(response,"completed",receipts);
}
} // namespace
void FreeMixCallVideoRegister(){if(!Gui()||registered)return;obs_output_info info{};info.id="freemix_calls_return_video";info.flags=OBS_OUTPUT_VIDEO;info.get_name=Name;info.create=Create;info.destroy=Destroy;info.start=StartRaw;info.stop=StopRaw;info.raw_video=RawVideo;info.get_total_bytes=Bytes;info.get_dropped_frames=Dropped;obs_register_output(&info);registered=true;}
void FreeMixCallVideoRequest(obs_data_t *r,obs_data_t *response,bool (*isPrivate)(obs_source_t *)){
 if(!Gui()){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","GUI-thread wrapper required");return;}
 const std::string action=obs_data_get_string(r,"action");std::string error;
 if(action=="state"){State(response);obs_data_set_bool(response,"success",true);return;}
 error=ActionGuard(action,obs_data_get_bool(r,"experimentalContinuousVideo"),draining);
 if(error.empty()&&action=="start"){
  const std::string uuid=obs_data_get_string(r,"sourceUuid");const auto port=obs_data_get_int(r,"loopbackPort");std::array<uint8_t,32> token{};
  if(uuid.empty()||uuid.size()>128||port<1||port>65535||!ParseToken(obs_data_get_string(r,"secretHex"),token))error="Public UUID, loopback port and ephemeral32byte secret required";
  else {
   bool duplicate=false;for(auto &s:Sessions())if(s&&s->uuid==uuid)duplicate=true;
   if(duplicate)error="Source UUID already captured; reuse its slot/generation, no new view";
   else {int free=-1;for(int i=0;i<2;i++)if(!Sessions()[i]){free=i;break;}
    if(free<0)error="Conservative limit2unique return sources reached";
    else if(!registered||generations[free]==UINT32_MAX)error="Raw output unavailable or generation exhausted";
    else {auto s=std::make_unique<Session>();s->slot=uint32_t(free);s->generation=++generations[free];s->uuid=uuid;s->port=uint16_t(port);s->token=token;s->until=os_gettime_ns()+LeaseNs;
     error=Build(*s,isPrivate);if(error.empty()){obs_data_set_int(response,"slot",s->slot);obs_data_set_int(response,"generation",s->generation);Sessions()[free]=s.release();}else s->ReleaseGui();
    }
   }
  }token.fill(0);
 }else if(error.empty()&&(action=="stop"||action=="pulse")){
  const auto slot=obs_data_get_int(r,"slot"),generation=obs_data_get_int(r,"generation");
  if(slot<0||slot>1||!Sessions()[slot]||generation!=Sessions()[slot]->generation)error="Current owned slot/generation required";
  else if(action=="stop")Sessions()[slot]->RequestStop();
  else if(Sessions()[slot]->ipc.stop.load())error="Session stopping; start explicitly after idle";
  else Sessions()[slot]->until=os_gettime_ns()+LeaseNs;
 }
 State(response);obs_data_set_bool(response,"success",error.empty());if(!error.empty())obs_data_set_string(response,"error",error.c_str());
}
void FreeMixCallVideoTick(bool (*isPrivate)(obs_source_t *)){
 if(!Gui())return;
 for(auto &s:Sessions())if(s){
  if(s->finished.load(std::memory_order_acquire)){Retire(s);continue;}
  const auto color=obs_source_get_color_space(s->source,0,nullptr);
  obs_video_info info{};const bool invalid=!obs_get_video_info(&info)||info.base_width!=s->baseWidth||info.base_height!=s->baseHeight||info.fps_num!=s->fpsNum||info.fps_den!=s->fpsDen||obs_source_removed(s->source)||!obs_source_get_width(s->source)||!obs_source_get_height(s->source)||(color!=GS_CS_SRGB&&color!=GS_CS_SRGB_16F)||!isPrivate||isPrivate(s->source)||OwnReturn(s->source)||os_gettime_ns()>=s->until;
  if(invalid&&!s->ipc.fault.load())s->ipc.fault=os_gettime_ns()>=s->until?9:8;
  if(invalid||s->ipc.fault.load())s->RequestStop();
  if(!s->ipc.stop.load()&&s->ipc.ready.load()&&!s->started){s->started=true;s->pool.accepting.store(true);s->allowStart.store(true);if(!obs_output_start(s->output)){s->ipc.fault=5;s->RequestStop();}s->startSettled=true;}
 }
}
void FreeMixCallVideoStop(){if(Gui())for(auto &s:Sessions())if(s)s->RequestStop();}
bool FreeMixCallVideoPending(){for(auto &s:Sessions())if(s)return true;return false;}
bool FreeMixCallVideoDrain(unsigned timeoutMs){
 if(!FreeMixCallVideoPending())return true;if(!Gui())return false;draining=true;FreeMixCallVideoStop();const auto end=std::chrono::steady_clock::now()+std::chrono::milliseconds(std::min(timeoutMs,5000u));
 while(FreeMixCallVideoPending()&&std::chrono::steady_clock::now()<end){
  for(auto &s:Sessions())if(s&&s->finished.load(std::memory_order_acquire)){Retire(s);}
  QCoreApplication::processEvents(QEventLoop::ExcludeUserInputEvents|QEventLoop::ExcludeSocketNotifiers,2);std::this_thread::sleep_for(std::chrono::milliseconds(1));
 }draining=false;return !FreeMixCallVideoPending(); // Timeout retains refs: Root must refuse context change/close.
}
