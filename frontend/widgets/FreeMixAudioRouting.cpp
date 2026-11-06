// Independent stereo submixes. No implicit connection to global recording mixes.
#include "FreeMixAudioRouting.hpp"
#include "FreeMixAsioOutput.hpp"
#include <obs-frontend-api.h>
#include <obs.hpp>
#include <util/platform.h>
#include <QCoreApplication>
#include <QMetaObject>
#include <QTimer>
#include <QWidget>
#include <mmdeviceapi.h>
#include <propsys.h>
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <mutex>
#include <set>
#include <string>
#include <thread>
#include <vector>

namespace {
struct Bus;
struct Tap { Bus *bus; obs_source_t *source; float gain; int64_t offset=0; uint64_t last=0; bool aligned=false,blocked=false,activeLease=false; };
struct Bus {
 obs_source_t *source; uint32_t rate; size_t capacity; std::mutex mutex;
 std::vector<float> samples; std::vector<int64_t> tags; std::vector<Tap *> taps;
 std::atomic<bool> stopping{false}; std::thread worker;
 Bus(obs_source_t *s,uint32_t r):source(s),rate(r),capacity(r*2),samples(capacity*2),tags(capacity,-1){}
};
bool Private(obs_source_t *s){
 const std::string name=obs_source_get_name(s),kind=obs_source_get_id(s);
 OBSDataAutoRelease settings=obs_source_get_private_settings(s);
 return obs_data_get_bool(settings,"freemix_director_private")||kind=="freemix_audio_bus"||kind=="mix-track-to-source"||
  name.rfind("FreeMix Retorno",0)==0||name.rfind("FreeMix N1",0)==0||name.rfind("FreeMix Bus",0)==0||name=="FreeMix Master";
}
void Capture(void *param,obs_source_t *source,const audio_data *audio,bool muted){
 auto *tap=static_cast<Tap *>(param);auto &bus=*tap->bus;
 if(Private(source)){if(!tap->blocked){std::lock_guard<std::mutex> lock(bus.mutex);std::fill(bus.tags.begin(),bus.tags.end(),-1);tap->blocked=true;}return;}
 tap->blocked=false;if(muted||!audio||!audio->frames||audio->frames>8192)return;
 const float gain=tap->gain*obs_source_get_volume(source);if(!(gain>0))return;
 const uint64_t now=os_gettime_ns(),duration=uint64_t(audio->frames)*1000000000ULL/bus.rate;
 int64_t time=int64_t(audio->timestamp)+tap->offset;
 if(!tap->aligned||audio->timestamp<tap->last||time>int64_t(now)+100000000LL||time<int64_t(now)-750000000LL){tap->offset=int64_t(now>duration?now-duration:0)-int64_t(audio->timestamp);tap->aligned=true;time=int64_t(audio->timestamp)+tap->offset;}
 tap->last=audio->timestamp;const int64_t first=(time/1000000000LL)*bus.rate+(time%1000000000LL)*bus.rate/1000000000LL;
 std::lock_guard<std::mutex> lock(bus.mutex);
 for(uint32_t f=0;f<audio->frames;f++){const int64_t frame=first+f;if(frame<0)continue;const size_t index=size_t(frame)%bus.capacity;if(bus.tags[index]!=frame){bus.tags[index]=frame;bus.samples[index*2]=bus.samples[index*2+1]=0;}
  for(size_t ch=0;ch<2;ch++){const float value=audio->data[ch]?reinterpret_cast<const float *>(audio->data[ch])[f]:audio->data[0]?reinterpret_cast<const float *>(audio->data[0])[f]:0;if(std::isfinite(value))bus.samples[index*2+ch]+=value*gain;}}
}
void Clear(Bus &bus){for(auto *tap:bus.taps){obs_source_remove_audio_capture_callback(tap->source,Capture,tap);if(tap->activeLease)obs_source_dec_active(tap->source);obs_source_release(tap->source);delete tap;}bus.taps.clear();std::lock_guard<std::mutex> lock(bus.mutex);std::fill(bus.tags.begin(),bus.tags.end(),-1);}
void Update(void *data,obs_data_t *settings){
 auto &bus=*static_cast<Bus *>(data);std::vector<Tap *> next;std::set<std::string> seen;std::string error;
 OBSDataArrayAutoRelease rows=obs_data_get_array(settings,"sources");
 if(rows&&obs_data_array_count(rows)>32)error="At most 32 public sources per bus";
 else for(size_t n=0;rows&&n<obs_data_array_count(rows);n++){
  OBSDataAutoRelease row=obs_data_array_item(rows,n);const std::string uuid=obs_data_get_string(row,"uuid");const float gain=float(obs_data_get_double(row,"gain"));
  obs_source_t *s=obs_get_source_by_uuid(uuid.c_str());
  if(!s||!seen.insert(uuid).second||!std::isfinite(gain)||gain<0||gain>2||!(obs_source_get_output_flags(s)&OBS_SOURCE_AUDIO)||(obs_source_get_output_flags(s)&OBS_SOURCE_COMPOSITE)||Private(s)){if(s)obs_source_release(s);error="Private, missing, duplicate or cyclic audio source";break;}
  next.push_back(new Tap{&bus,s,gain});
 }
 if(!error.empty()){for(auto *tap:next){obs_source_release(tap->source);delete tap;}OBSDataAutoRelease status=obs_source_get_private_settings(bus.source);obs_data_set_string(status,"freemix_bus_error",error.c_str());return;}
 Clear(bus);bus.taps=std::move(next);for(auto *tap:bus.taps){
  // Activating a shared input with global routes could open its sound on air.
  // Only hold isolated (mixers=0) inputs active. Routed inputs follow their
  // existing scene activation; the bus never changes their public routes.
  if(obs_source_get_audio_mixers(tap->source)==0){obs_source_inc_active(tap->source);tap->activeLease=true;}
  obs_source_add_audio_capture_callback(tap->source,Capture,tap);
 }
 OBSDataAutoRelease status=obs_source_get_private_settings(bus.source);obs_data_set_string(status,"freemix_bus_error","");obs_data_set_int(status,"freemix_bus_sources",bus.taps.size());
}
void Render(Bus &bus){
 const size_t frames=bus.rate/100;std::vector<float> left(frames),right(frames);auto next=std::chrono::steady_clock::now();int64_t readFrame=-1;uint64_t timestamp=0;
 while(!bus.stopping){next+=std::chrono::milliseconds(10);const uint64_t now=os_gettime_ns();
  if(!timestamp||now>timestamp+250000000ULL){timestamp=now;const uint64_t read=now>50000000ULL?now-50000000ULL:0;readFrame=int64_t(read/1000000000ULL*bus.rate+read%1000000000ULL*bus.rate/1000000000ULL);}
  {std::lock_guard<std::mutex> lock(bus.mutex);for(size_t f=0;f<frames;f++){const int64_t frame=readFrame+int64_t(f);const size_t index=size_t(frame)%bus.capacity;const bool present=bus.tags[index]==frame;left[f]=present?std::clamp(bus.samples[index*2],-1.f,1.f):0;right[f]=present?std::clamp(bus.samples[index*2+1],-1.f,1.f):0;}}
  obs_source_audio audio{};audio.data[0]=reinterpret_cast<uint8_t *>(left.data());audio.data[1]=reinterpret_cast<uint8_t *>(right.data());audio.frames=uint32_t(frames);audio.speakers=SPEAKERS_STEREO;audio.format=AUDIO_FORMAT_FLOAT_PLANAR;audio.samples_per_sec=bus.rate;audio.timestamp=timestamp;obs_source_output_audio(bus.source,&audio);
  readFrame+=int64_t(frames);timestamp+=uint64_t(frames)*1000000000ULL/bus.rate;std::this_thread::sleep_until(next);
 }
}
void *Create(obs_data_t *settings,obs_source_t *source){obs_audio_info info{};if(!obs_get_audio_info(&info))return nullptr;auto *bus=new Bus(source,info.samples_per_sec);obs_source_set_audio_mixers(source,0);Update(bus,settings);bus->worker=std::thread([bus](){Render(*bus);});return bus;}
void Destroy(void *data){auto *bus=static_cast<Bus *>(data);bus->stopping=true;if(bus->worker.joinable())bus->worker.join();Clear(*bus);delete bus;}
bool List(obs_data_t *response,const char *key,const char *kind,const char *property){
 obs_properties_t *props=obs_get_source_properties(kind);OBSDataArrayAutoRelease rows=obs_data_array_create();
 auto *p=props?obs_properties_get(props,property):nullptr;
 if(p&&obs_property_get_type(p)==OBS_PROPERTY_LIST)for(size_t n=0;n<obs_property_list_item_count(p);n++){
  const char *id=obs_property_list_item_string(p,n);if(!id||!*id||std::string(id)=="VBAN"||obs_property_list_item_disabled(p,n))continue;
  OBSDataAutoRelease row=obs_data_create();obs_data_set_string(row,"id",id);obs_data_set_string(row,"name",obs_property_list_item_name(p,n));obs_data_array_push_back(rows,row);
 }
 const bool complete=p&&obs_property_get_type(p)==OBS_PROPERTY_LIST;obs_data_set_array(response,key,rows);if(props)obs_properties_destroy(props);return complete;
}
}
bool FreeMixAudioBusAllowed(obs_source_t *source){
 if(!source||obs_source_removed(source)||!obs_source_enabled(source)||std::string(obs_source_get_id(source))!="freemix_audio_bus"||obs_source_get_audio_mixers(source)!=0)return false;
 OBSDataAutoRelease settings=obs_source_get_private_settings(source);
 return !obs_data_get_bool(settings,"freemix_director_private");
}
struct FreeMixSourceAudio::Impl {
 OBSSourceAutoRelease source;audio_t *audio=nullptr;std::string name;
 uint32_t rate=48000;size_t capacity=0;std::vector<float> samples;std::vector<int64_t> tags;std::mutex mutex;
 bool attached=false,activeLease=false;std::atomic<bool> closing{false};
 static void Capture(void *param,obs_source_t *source,const audio_data *data,bool muted){
  auto &self=*static_cast<Impl *>(param);if(self.closing)return;
  std::lock_guard<std::mutex> lock(self.mutex);
  if(!FreeMixAudioBusAllowed(source)||muted||!data||!data->frames||data->frames>8192){std::fill(self.tags.begin(),self.tags.end(),-1);return;}
  const float gain=obs_source_get_volume(source);const int64_t first=int64_t(data->timestamp/1000000000ULL*self.rate+data->timestamp%1000000000ULL*self.rate/1000000000ULL);
  for(uint32_t f=0;f<data->frames;f++){const int64_t frame=first+f;if(frame<0)continue;const size_t at=size_t(frame)%self.capacity;self.tags[at]=frame;
   for(size_t ch=0;ch<2;ch++){const float sample=data->data[ch]?reinterpret_cast<const float *>(data->data[ch])[f]:data->data[0]?reinterpret_cast<const float *>(data->data[0])[f]:0;self.samples[at*2+ch]=std::isfinite(sample)?std::clamp(sample*gain,-1.f,1.f):0;}}
 }
 static bool Read(void *param,uint64_t start,uint64_t,uint64_t *timestamp,uint32_t mixes,audio_output_data *data){
  auto &self=*static_cast<Impl *>(param);*timestamp=start;
  if(self.closing||!FreeMixAudioBusAllowed(self.source)||obs_source_muted(self.source))return true;
  const uint64_t time=start>50000000ULL?start-50000000ULL:0;
  const int64_t first=int64_t(time/1000000000ULL*self.rate+time%1000000000ULL*self.rate/1000000000ULL);
  std::lock_guard<std::mutex> lock(self.mutex);
  for(size_t mix=0;mix<MAX_AUDIO_MIXES;mix++)if(mixes&(1u<<mix))for(size_t f=0;f<AUDIO_OUTPUT_FRAMES;f++){
   const int64_t frame=first+int64_t(f);const size_t at=size_t(frame)%self.capacity;const bool present=self.tags[at]==frame;
   for(size_t ch=0;ch<2;ch++)if(data[mix].data[ch])data[mix].data[ch][f]=present?self.samples[at*2+ch]:0;
  }
  return true;
 }
 ~Impl(){
  closing=true;
  // libobs removes the callback under its capture mutex, waiting for in-flight
  // calls. Keep this context alive until callback removal and audio thread join.
  if(attached)obs_source_remove_audio_capture_callback(source,Capture,this);
  if(audio)audio_output_close(audio);
  if(activeLease)obs_source_dec_active(source);
 }
};
FreeMixSourceAudio::FreeMixSourceAudio(std::unique_ptr<Impl> p):impl(std::move(p)){}
FreeMixSourceAudio::~FreeMixSourceAudio()=default;
std::unique_ptr<FreeMixSourceAudio> FreeMixSourceAudio::Open(const std::string &uuid,const std::string &name,std::string &error){
 auto p=std::make_unique<Impl>();p->source=obs_get_source_by_uuid(uuid.c_str());
 if(!FreeMixAudioBusAllowed(p->source)){error="select a public independent audio bus with all global tracks disabled";return nullptr;}
 obs_audio_info info{};if(!obs_get_audio_info(&info)){error="audio context unavailable";return nullptr;}
 p->rate=info.samples_per_sec;p->capacity=p->rate*2;p->samples.resize(p->capacity*2);p->tags.assign(p->capacity,-1);p->name=name;
 audio_output_info output{};output.name=p->name.c_str();output.samples_per_sec=p->rate;output.speakers=SPEAKERS_STEREO;output.format=AUDIO_FORMAT_FLOAT_PLANAR;output.input_callback=Impl::Read;output.input_param=p.get();
 if(audio_output_open(&p->audio,&output)!=AUDIO_OUTPUT_SUCCESS){error="could not create independent PCM context";return nullptr;}
 obs_source_inc_active(p->source);p->activeLease=true;obs_source_add_audio_capture_callback(p->source,Impl::Capture,p.get());p->attached=true;
 return std::unique_ptr<FreeMixSourceAudio>(new FreeMixSourceAudio(std::move(p)));
}
audio_t *FreeMixSourceAudio::Audio()const{return impl->audio;}
bool FreeMixSourceAudio::Valid()const{return FreeMixAudioBusAllowed(impl->source);}

namespace {
bool AsioPublicSource(obs_source_t *s){
 if(!s||obs_source_removed(s)||!obs_source_enabled(s)||!(obs_source_get_output_flags(s)&OBS_SOURCE_AUDIO)||(obs_source_get_output_flags(s)&OBS_SOURCE_COMPOSITE))return false;
 const std::string kind=obs_source_get_id(s);if(kind=="asio_input_capture"||kind=="wasapi_output_capture"||kind=="wasapi_process_output_capture")return false; // prevent hardware feedback loops
 if(FreeMixAudioBusAllowed(s)){
  OBSDataAutoRelease settings=obs_source_get_settings(s);OBSDataArrayAutoRelease members=obs_data_get_array(settings,"sources");if(!members||obs_data_array_count(members)>32)return false;
  for(size_t i=0;i<obs_data_array_count(members);i++){OBSDataAutoRelease row=obs_data_array_item(members,i);OBSSourceAutoRelease member=obs_get_source_by_uuid(obs_data_get_string(row,"uuid"));if(!member||Private(member)||std::string(obs_source_get_id(member))=="asio_input_capture"||std::string(obs_source_get_id(member))=="wasapi_output_capture"||std::string(obs_source_get_id(member))=="wasapi_process_output_capture")return false;}
  return true;
 }
 return !Private(s);
}
// Separate process-local inventories: output CLSIDs are not capture-plugin IDs.
struct AsioInventory {
 std::vector<FreeMixAsioDriver> outputs,inputs,render;
 bool outputsKnown=false,inputsKnown=false,renderKnown=false,sourceRecordBusCapture=false,sourceRecordBusCaptureKnown=false;std::string outputError,inputError,renderError;
};
AsioInventory &Inventory(){static AsioInventory value;return value;}
bool RenderInventory(std::vector<FreeMixAsioDriver> &rows){
 // Explicit GUI-thread discovery only. Unlike the void libobs enumerator, a
 // failed or partial enumeration is observable and never becomes known-empty.
 const auto initialized=CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);const bool uninit=SUCCEEDED(initialized);
 if(FAILED(initialized)&&initialized!=RPC_E_CHANGED_MODE)return false;
 const PROPERTYKEY friendlyName={{0xa45c254e,0xdf1c,0x4efd,{0x80,0x20,0x67,0xd1,0x46,0xa8,0x50,0xe0}},14}; // PKEY_Device_FriendlyName, no new link dependency.
 IMMDeviceEnumerator *enumerator=nullptr;IMMDeviceCollection *collection=nullptr;UINT count=0;bool okay=false;
 HRESULT hr=CoCreateInstance(__uuidof(MMDeviceEnumerator),nullptr,CLSCTX_ALL,__uuidof(IMMDeviceEnumerator),reinterpret_cast<void **>(&enumerator));
 if(SUCCEEDED(hr))hr=enumerator->EnumAudioEndpoints(eRender,DEVICE_STATE_ACTIVE,&collection);
 if(SUCCEEDED(hr))hr=collection->GetCount(&count);
 if(SUCCEEDED(hr)&&count<=256){okay=true;for(UINT i=0;i<count;i++){
  IMMDevice *device=nullptr;IPropertyStore *properties=nullptr;LPWSTR id=nullptr;PROPVARIANT name{};
  hr=collection->Item(i,&device);if(SUCCEEDED(hr))hr=device->GetId(&id);if(SUCCEEDED(hr))hr=device->OpenPropertyStore(STGM_READ,&properties);if(SUCCEEDED(hr))hr=properties->GetValue(friendlyName,&name);
  if(SUCCEEDED(hr)&&id&&name.vt==VT_LPWSTR&&name.pwszVal){
   const auto utf8=[](const wchar_t *value){const int size=WideCharToMultiByte(CP_UTF8,0,value,-1,nullptr,0,nullptr,nullptr);std::string result(size>1&&size<=4096?size:0,0);if(!result.empty()){if(WideCharToMultiByte(CP_UTF8,0,value,-1,result.data(),size,nullptr,nullptr)!=size)return std::string{};result.pop_back();}return result;};
   // One endpoint that cannot be described is left out; the other endpoints stay usable. Only a failure of the
   // enumeration itself (above) makes the inventory unknown.
   auto deviceId=utf8(id),deviceName=utf8(name.pwszVal);if(!deviceId.empty()&&!deviceName.empty())rows.push_back({std::move(deviceId),std::move(deviceName)});
  }
  PropVariantClear(&name);if(id)CoTaskMemFree(id);if(properties)properties->Release();if(device)device->Release();
 }}
 if(okay&&count&&rows.empty())okay=false; // endpoints exist and none could be described: unknown, not "no devices"
 if(collection)collection->Release();if(enumerator)enumerator->Release();if(uninit)CoUninitialize();return okay;
}
void ObserveSourceRecordCapability(){
	auto &cache=Inventory();
	OBSDataAutoRelease recordDefaults=obs_get_source_defaults("source_record_filter");
	cache.sourceRecordBusCapture=recordDefaults&&obs_data_get_bool(recordDefaults,"freemix_premix_bus_capture");
	cache.sourceRecordBusCaptureKnown=true;
}

void DiscoverAsio(){
 auto &cache=Inventory();bool complete=false;auto outputs=FreeMixAsioOutput::Drivers(&complete);
 cache.outputsKnown=complete;cache.outputError=complete?"":"Inventário ASIO de saída incompleto; atualize dispositivos";
 if(complete)cache.outputs=std::move(outputs); // Preserve last good choices after a failed scan.
 OBSDataAutoRelease result=obs_data_create();const bool inputComplete=List(result,"drivers","asio_input_capture","device_id");
 cache.inputsKnown=inputComplete;cache.inputError=inputComplete?"":"Inventário ASIO de entrada indisponível; atualize dispositivos";
 if(inputComplete){std::vector<FreeMixAsioDriver> next;OBSDataArrayAutoRelease rows=obs_data_get_array(result,"drivers");for(size_t i=0;i<obs_data_array_count(rows);i++){OBSDataAutoRelease row=obs_data_array_item(rows,i);next.push_back({obs_data_get_string(row,"id"),obs_data_get_string(row,"name")});}cache.inputs=std::move(next);}
 std::vector<FreeMixAsioDriver> render;cache.renderKnown=RenderInventory(render);cache.renderError=cache.renderKnown?"":"Inventário de reprodução incompleto; atualize dispositivos";if(cache.renderKnown)cache.render=std::move(render);
	ObserveSourceRecordCapability();
}
struct AsioSession {
 struct Tap { AsioSession *owner; size_t route; obs_source_t *source; bool lease=false; };
 FreeMixAsioOutput output;std::vector<FreeMixAsioRoute> routes;std::vector<Tap *> taps;
 std::string driverId,error;long buffer=0;uint32_t rate=0;QTimer *timer=nullptr;bool lifecycleRegistered=false,configured=false;uint64_t lastCallbacks=0,lastCallbackAt=0;
 static void Capture(void *param,obs_source_t *source,const audio_data *audio,bool muted){
  auto *tap=static_cast<Tap *>(param);if(!audio||!audio->frames||audio->frames>8192)return;
  OBSDataAutoRelease privateSettings=obs_source_get_private_settings(source);if(obs_source_removed(source)||!obs_source_enabled(source)||obs_data_get_bool(privateSettings,"freemix_director_private")){tap->owner->output.Silence(3);return;}
  auto *left=reinterpret_cast<const float *>(audio->data[0]);auto *right=reinterpret_cast<const float *>(audio->data[1]);
  tap->owner->output.Push(tap->route,left,right,audio->frames,muted?0.f:obs_source_get_volume(source));
 }
 void Stop(){if(timer)timer->stop();for(auto *tap:taps)obs_source_remove_audio_capture_callback(tap->source,Capture,tap);output.Stop();for(auto *tap:taps){if(tap->lease)obs_source_dec_active(tap->source);obs_source_release(tap->source);delete tap;}taps.clear();}
 static void Event(enum obs_frontend_event event,void *param){if(event==OBS_FRONTEND_EVENT_SCENE_COLLECTION_CHANGING||event==OBS_FRONTEND_EVENT_SCENE_COLLECTION_CLEANUP||event==OBS_FRONTEND_EVENT_PROFILE_CHANGING||event==OBS_FRONTEND_EVENT_EXIT){auto &self=*static_cast<AsioSession *>(param);self.Stop();self.configured=false;self.routes.clear();}}
 void InitLifecycle(){if(lifecycleRegistered)return;lifecycleRegistered=true;QObject::connect(qApp,&QCoreApplication::aboutToQuit,qApp,[this](){Stop();});obs_frontend_add_event_callback(Event,this);}
 void Init(){if(timer){timer->start();return;}timer=new QTimer(qApp);timer->setInterval(250);QObject::connect(timer,&QTimer::timeout,qApp,[this](){const auto status=output.Metrics();if(!status.running)return;const uint64_t now=os_gettime_ns();if(status.callbacks!=lastCallbacks){lastCallbacks=status.callbacks;lastCallbackAt=now;}if(now-lastCallbackAt>2000000000ULL){error="Saída parada: driver sem callbacks por dois segundos";output.Silence(4);Stop();return;}obs_audio_info info{};if(status.fault||!obs_get_audio_info(&info)||info.samples_per_sec!=rate){error=status.fault==3?"Saída parada: fonte removida ou mic privado":"Saída parada por mudança de clock, buffer ou taxa de áudio";Stop();return;}for(auto *tap:taps)if(!AsioPublicSource(tap->source)){output.Silence(3);error="Saída parada: fonte removida, privada ou rota de feedback";Stop();return;}});timer->start();}
 bool Configure(obs_data_t *request){
  if(output.Metrics().running){error="Pare ASIO antes de editar as rotas";return false;}
  const std::string id=obs_data_get_string(request,"driverId");const auto drivers=FreeMixAsioOutput::Drivers();if(std::none_of(drivers.begin(),drivers.end(),[&](const auto &d){return d.id==id;})){error="Driver ASIO instalado não encontrado";return false;}
  OBSDataArrayAutoRelease rows=obs_data_get_array(request,"routes");if(!rows||!obs_data_array_count(rows)||obs_data_array_count(rows)>8){error="Escolha de uma até oito rotas estéreo";return false;}
  std::vector<FreeMixAsioRoute> next;std::set<int> used;for(size_t i=0;i<obs_data_array_count(rows);i++){OBSDataAutoRelease row=obs_data_array_item(rows,i);FreeMixAsioRoute route;route.uuid=obs_data_get_string(row,"uuid");route.left=int(obs_data_get_int(row,"left"));route.right=int(obs_data_get_int(row,"right"));route.gain=float(obs_data_has_user_value(row,"gain")?obs_data_get_double(row,"gain"):1);OBSSourceAutoRelease source=obs_get_source_by_uuid(route.uuid.c_str());if(!AsioPublicSource(source)||route.left<0||route.right<0||route.left>255||route.right>255||!used.insert(route.left).second||!used.insert(route.right).second||!std::isfinite(route.gain)||route.gain<0||route.gain>2){error="Fonte ASIO privada/ausente, feedback, ganho inválido ou canais repetidos";return false;}next.push_back(route);}
  const int64_t requested=obs_data_get_int(request,"bufferFrames");if(requested<0||requested>8192||(requested>0&&requested<16)){error="Buffer deve ser automático (0) ou 16–8192 frames";return false;}
  obs_audio_info info{};if(!obs_get_audio_info(&info)){error="Áudio do projeto indisponível";return false;}driverId=id;routes=std::move(next);buffer=long(requested);rate=info.samples_per_sec;configured=true;error.clear();return true;
 }
 bool Start(){if(!configured){error="Configure driver, fonte e canais antes de iniciar";return false;}if(output.Metrics().running){error="ASIO já está ativo";return false;}obs_audio_info info{};if(!obs_get_audio_info(&info)||info.samples_per_sec!=rate){error="Taxa do projeto mudou; configure ASIO novamente";return false;}
  for(size_t i=0;i<routes.size();i++){auto *source=obs_get_source_by_uuid(routes[i].uuid.c_str());if(!AsioPublicSource(source)){if(source)obs_source_release(source);error="Fonte ASIO removida, privada ou com feedback";Stop();return false;}taps.push_back(new Tap{this,i,source});}
  auto *window=static_cast<QWidget *>(obs_frontend_get_main_window());if(!output.Start(driverId,routes,rate,buffer,window?reinterpret_cast<void *>(window->winId()):nullptr,error)){Stop();return false;}
  Init();lastCallbacks=0;lastCallbackAt=os_gettime_ns();for(auto *tap:taps){if(obs_source_get_audio_mixers(tap->source)==0){obs_source_inc_active(tap->source);tap->lease=true;}obs_source_add_audio_capture_callback(tap->source,Capture,tap);}error.clear();return true;
 }
 static void State(obs_data_t *response,const AsioSession *session){
  const auto metrics=session?session->output.Metrics():FreeMixAsioMetrics{};
  const bool configured=session&&session->configured;const uint32_t rate=session?session->rate:0;const long buffer=session?session->buffer:0;
  static const std::string empty;static const std::vector<FreeMixAsioRoute> noRoutes;
  const auto &driverId=session?session->driverId:empty;const auto &error=session?session->error:empty;const auto &routes=session?session->routes:noRoutes;
  const auto &cache=Inventory();OBSDataAutoRelease status=obs_data_create();obs_data_set_bool(status,"supported",true);obs_data_set_bool(status,"running",metrics.running);obs_data_set_bool(status,"configured",configured);obs_data_set_bool(status,"hardwareVerified",false);obs_data_set_bool(status,"autostart",false);obs_data_set_string(status,"driverId",driverId.c_str());obs_data_set_string(status,"error",error.c_str());obs_data_set_int(status,"sampleRate",metrics.running?metrics.sampleRate:rate);obs_data_set_int(status,"bufferFrames",metrics.bufferFrames);obs_data_set_int(status,"configuredBufferFrames",buffer);obs_data_set_int(status,"outputChannels",metrics.outputs);obs_data_set_int(status,"outputLatencyFrames",metrics.outputLatency);obs_data_set_double(status,"outputLatencyMs",metrics.sampleRate?double(metrics.outputLatency)*1000/metrics.sampleRate:0);obs_data_set_int(status,"callbacks",metrics.callbacks);obs_data_set_int(status,"frames",metrics.frames);obs_data_set_int(status,"underrunFrames",metrics.underrunFrames);obs_data_set_int(status,"overrunFrames",metrics.overrunFrames);obs_data_set_int(status,"invalidSamples",metrics.invalidSamples);obs_data_set_int(status,"clippedSamples",metrics.clippedSamples);obs_data_set_int(status,"fault",metrics.fault);
  OBSDataArrayAutoRelease devices=obs_data_array_create();for(const auto &driver:cache.outputs){OBSDataAutoRelease row=obs_data_create();obs_data_set_string(row,"id",driver.id.c_str());obs_data_set_string(row,"name",driver.name.c_str());obs_data_array_push_back(devices,row);}obs_data_set_array(status,"drivers",devices);obs_data_set_bool(status,"inventoryKnown",cache.outputsKnown);obs_data_set_string(status,"inventoryError",cache.outputError.c_str());
  OBSDataArrayAutoRelease rows=obs_data_array_create();for(size_t i=0;i<routes.size();i++){const auto &route=routes[i];OBSDataAutoRelease row=obs_data_create();obs_data_set_string(row,"uuid",route.uuid.c_str());obs_data_set_int(row,"left",route.left);obs_data_set_int(row,"right",route.right);obs_data_set_double(row,"gain",route.gain);obs_data_set_int(row,"queuedFrames",metrics.queued[i]);obs_data_array_push_back(rows,row);}obs_data_set_array(status,"routes",rows);obs_data_set_obj(response,"asioOutputCapabilities",status);
 }
};
AsioSession *&AsioPointer(){static AsioSession *session=nullptr;return session;}
AsioSession &Asio(){auto *&session=AsioPointer();if(!session){session=new AsioSession;session->InitLifecycle();}return *session;} // explicit actions only; lifecycle owns stop, no getter allocation
}
void FreeMixAudioRoutingRegister(){static bool registered=false;if(registered)return;registered=true;obs_source_info info{};info.id="freemix_audio_bus";info.type=OBS_SOURCE_TYPE_INPUT;info.output_flags=OBS_SOURCE_AUDIO|OBS_SOURCE_DO_NOT_DUPLICATE;info.get_name=[](void *){return "FreeMix Independent Audio Bus";};info.create=Create;info.destroy=Destroy;info.update=Update;info.icon_type=OBS_ICON_TYPE_AUDIO_OUTPUT;obs_register_source(&info);
	obs_frontend_add_event_callback([](enum obs_frontend_event event, void *) {
		if (event == OBS_FRONTEND_EVENT_FINISHED_LOADING && !Inventory().sourceRecordBusCaptureKnown) {
			ObserveSourceRecordCapability();
		}
	}, nullptr);
}
void FreeMixAudioCapabilitiesRequest(obs_data_t *request,obs_data_t *response,void *){
 QMetaObject::invokeMethod(qApp,[request,response](){
  const std::string asioAction=obs_data_get_string(request,"asioAction");bool asioOkay=true;std::string actionError;
  if(!asioAction.empty()&&asioAction!="state"&&asioAction!="configure"&&asioAction!="start"&&asioAction!="stop"&&asioAction!="control-panel"){
   AsioSession::State(response,AsioPointer());obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","Ação ASIO inválida");return;
  }
  const bool discover=obs_data_get_bool(request,"discoverAsio");
  if(discover&&(!asioAction.empty()&&asioAction!="state")){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","Separe a atualização de dispositivos da operação ASIO");return;}
  if(discover)DiscoverAsio(); // Only the explicitly authorized refresh request probes inventories.
  if(asioAction=="configure"||asioAction=="start"){auto &asio=Asio();asioOkay=asioAction=="configure"?asio.Configure(request):asio.Start();actionError=asio.error;}
  else if(auto *asio=AsioPointer()){
   if(asioAction=="stop"){asio->Stop();asio->error.clear();}else if(asioAction=="control-panel"){asioOkay=asio->output.ControlPanel(asio->error);actionError=asio->error;}
  }else if(asioAction=="control-panel"){asioOkay=false;actionError="Inicie ASIO antes de abrir o painel do driver";}
  AsioSession::State(response,AsioPointer());if(!asioOkay){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error",actionError.c_str());return;}
  // No WASAPI/COM discovery during state/open/poll. The explicit scan above
  // updates a separate render inventory without touching any saved route.
  const auto &renderInventory=Inventory();OBSDataArrayAutoRelease devices=obs_data_array_create();
  for(const auto &device:renderInventory.render){OBSDataAutoRelease row=obs_data_create();obs_data_set_string(row,"id",device.id.c_str());obs_data_set_string(row,"name",device.name.c_str());obs_data_array_push_back(devices,row);}obs_data_set_array(response,"renderDevices",devices);
  obs_data_set_bool(response,"renderInventoryKnown",renderInventory.renderKnown);obs_data_set_string(response,"renderInventoryError",renderInventory.renderError.c_str());
  obs_data_set_bool(response,"source_record_bus_capture",Inventory().sourceRecordBusCapture);
  obs_data_set_bool(response,"source_record_bus_capture_known",Inventory().sourceRecordBusCaptureKnown);
  const auto &inventory=Inventory();OBSDataArrayAutoRelease captured=obs_data_array_create();
  for(const auto &driver:inventory.inputs){OBSDataAutoRelease row=obs_data_create();obs_data_set_string(row,"id",driver.id.c_str());obs_data_set_string(row,"name",driver.name.c_str());obs_data_array_push_back(captured,row);}obs_data_set_array(response,"asioDrivers",captured);
  obs_data_set_bool(response,"asioInventoryKnown",inventory.inputsKnown);obs_data_set_string(response,"asioInventoryError",inventory.inputError.c_str());
  const char *uuid=obs_data_get_string(request,"busUuid");if(uuid&&*uuid){OBSSourceAutoRelease source=obs_get_source_by_uuid(uuid);if(source&&std::string(obs_source_get_id(source))=="freemix_audio_bus"){OBSDataAutoRelease status=obs_source_get_private_settings(source);obs_data_set_string(response,"busError",obs_data_get_string(status,"freemix_bus_error"));obs_data_set_int(response,"busSources",obs_data_get_int(status,"freemix_bus_sources"));}}
  obs_data_set_bool(response,"success",true);
 },Qt::BlockingQueuedConnection);
}
