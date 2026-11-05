#include "FreeMixAsioOutput.hpp"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <set>
#pragma comment(lib,"ole32.lib")
#pragma comment(lib,"advapi32.lib")

std::atomic<FreeMixAsioOutput *> FreeMixAsioOutput::active{nullptr};
namespace {
bool Okay(ASIOError e){return e==ASE_OK||e==ASE_SUCCESS;}
std::string UTF8(const wchar_t *s){int n=WideCharToMultiByte(CP_UTF8,0,s,-1,nullptr,0,nullptr,nullptr);if(n<2)return {};std::string out(size_t(n),0);WideCharToMultiByte(CP_UTF8,0,s,-1,out.data(),n,nullptr,nullptr);out.pop_back();return out;}
}
std::vector<FreeMixAsioDriver> FreeMixAsioOutput::Drivers(bool *complete){
 if(complete)*complete=false;
 std::vector<FreeMixAsioDriver> list;HKEY root=nullptr;
 const auto opened=RegOpenKeyExW(HKEY_LOCAL_MACHINE,L"SOFTWARE\\ASIO",0,KEY_READ|KEY_WOW64_64KEY,&root);
 if(opened!=ERROR_SUCCESS){if(complete)*complete=opened==ERROR_FILE_NOT_FOUND;return list;}
 bool okay=true,ended=false;
 for(DWORD index=0;index<256;index++){
  wchar_t name[256]{};DWORD len=256;const auto enumerated=RegEnumKeyExW(root,index,name,&len,nullptr,nullptr,nullptr,nullptr);
  if(enumerated==ERROR_NO_MORE_ITEMS){ended=true;break;}if(enumerated!=ERROR_SUCCESS){okay=false;break;}
  // An entry that cannot be read or has no valid CLSID is what an uninstalled driver leaves behind. It is not a
  // driver, so it is left out; it does not make the list of the drivers that are there unusable.
  HKEY key=nullptr;if(RegOpenKeyExW(root,name,0,KEY_READ,&key)!=ERROR_SUCCESS)continue;
  wchar_t clsid[128]{},description[512]{};DWORD bytes=sizeof(clsid);const auto result=RegGetValueW(key,nullptr,L"CLSID",RRF_RT_REG_SZ,nullptr,clsid,&bytes);
  bytes=sizeof(description);RegGetValueW(key,nullptr,L"Description",RRF_RT_REG_SZ,nullptr,description,&bytes);RegCloseKey(key);
  CLSID guid{};if(result==ERROR_SUCCESS&&SUCCEEDED(CLSIDFromString(clsid,&guid)))list.push_back({UTF8(clsid),UTF8(*description?description:name)});
 }
 RegCloseKey(root);if(complete)*complete=okay&&ended;return list;
}
size_t FreeMixAsioOutput::SampleBytes(ASIOSampleType t){switch(t){case ASIOSTInt16MSB:case ASIOSTInt16LSB:return 2;case ASIOSTInt24MSB:case ASIOSTInt24LSB:return 3;case ASIOSTFloat64MSB:case ASIOSTFloat64LSB:return 8;case ASIOSTInt32MSB:case ASIOSTInt32LSB:case ASIOSTFloat32MSB:case ASIOSTFloat32LSB:case ASIOSTInt32MSB16:case ASIOSTInt32MSB18:case ASIOSTInt32MSB20:case ASIOSTInt32MSB24:case ASIOSTInt32LSB16:case ASIOSTInt32LSB18:case ASIOSTInt32LSB20:case ASIOSTInt32LSB24:return 4;default:return 0;}}
bool FreeMixAsioOutput::Encode(ASIOSampleType t,float x,void *output){
 const size_t bytes=SampleBytes(t);if(!bytes)return false;x=std::isfinite(x)?std::clamp(x,-1.f,1.f):0.f;
 const bool little=t>=ASIOSTInt16LSB;uint64_t bits=0;
 if(t==ASIOSTFloat32MSB||t==ASIOSTFloat32LSB){uint32_t value;std::memcpy(&value,&x,4);bits=value;}
 else if(t==ASIOSTFloat64MSB||t==ASIOSTFloat64LSB){double value=x;std::memcpy(&bits,&value,8);}
 else {int precision=int(bytes*8);if(t>=ASIOSTInt32MSB16&&t<=ASIOSTInt32MSB24)precision=16+int(t-ASIOSTInt32MSB16)*2+(t==ASIOSTInt32MSB24?2:0);if(t>=ASIOSTInt32LSB16&&t<=ASIOSTInt32LSB24)precision=16+int(t-ASIOSTInt32LSB16)*2+(t==ASIOSTInt32LSB24?2:0);const int64_t maximum=(int64_t(1)<<(precision-1))-1,minimum=-(int64_t(1)<<(precision-1));const int64_t value=x<=-1?minimum:std::clamp<int64_t>(std::llround(double(x)*double(maximum)),minimum,maximum);bits=uint64_t(value);}
 auto *dest=static_cast<uint8_t *>(output);for(size_t n=0;n<bytes;n++)dest[little?n:bytes-1-n]=uint8_t(bits>>(n*8));return true;
}
FreeMixAsioOutput::~FreeMixAsioOutput(){Stop();}
bool FreeMixAsioOutput::Start(const std::string &id,const std::vector<FreeMixAsioRoute> &r,uint32_t sampleRate,long buffer,void *window,std::string &error){
 if(running||driver||active.load()){error="Pare a saída ASIO antes de alterar driver ou canais";return false;}
 if(id.size()>80){error="Identificador ASIO inválido";return false;}std::wstring wide(id.begin(),id.end());CLSID guid{};if(FAILED(CLSIDFromString(wide.c_str(),&guid))){error="CLSID ASIO inválido";return false;}
 const auto known=Drivers();if(std::none_of(known.begin(),known.end(),[&](const auto &d){return d.id==id;})){error="Driver ASIO instalado não encontrado";return false;}
 const auto co=CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);if(FAILED(co)&&co!=RPC_E_CHANGED_MODE){error="COM indisponível para o driver ASIO";return false;}comOwned=SUCCEEDED(co);
 IASIO *instance=nullptr;const HRESULT opened=CoCreateInstance(guid,nullptr,CLSCTX_INPROC_SERVER,guid,reinterpret_cast<void **>(&instance));if(FAILED(opened)||!instance){if(comOwned)CoUninitialize();comOwned=false;error="Não foi possível abrir o driver ASIO";return false;}
 ownsReference=true;if(!StartInjected(instance,r,sampleRate,buffer,window,error)){if(!driver&&ownsReference)instance->Release();Stop();return false;}return true;
}
bool FreeMixAsioOutput::StartInjected(IASIO *instance,const std::vector<FreeMixAsioRoute> &r,uint32_t sampleRate,long requested,void *window,std::string &error){
 if(driver||running||active.load()||!instance||r.empty()||r.size()>8||sampleRate<8000||sampleRate>192000){error="ASIO: driver, taxa ou rotas inválidas";return false;}
 driver=instance;auto fail=[&](const char *message){error=message;Stop();return false;};
 if(!driver->init(window))return fail("Driver ASIO recusou inicialização");
 long inputs=0;if(!Okay(driver->getChannels(&inputs,&outputs))||outputs<2||outputs>256)return fail("Driver ASIO sem canais de saída válidos");
 if(!Okay(driver->canSampleRate(sampleRate)))return fail("Driver não aceita a taxa de áudio do projeto");ASIOSampleRate current=0;if(!Okay(driver->getSampleRate(&current)))return fail("Driver não informou sample rate");if(current!=sampleRate&&!Okay(driver->setSampleRate(sampleRate)))return fail("Driver recusou sample rate");if(!Okay(driver->getSampleRate(&current))||current!=sampleRate)return fail("Sample rate ASIO diferente do projeto");
 long minimum=0,maximum=0,preferred=0,granularity=0;if(!Okay(driver->getBufferSize(&minimum,&maximum,&preferred,&granularity)))return fail("Buffer ASIO indisponível");frames=requested?requested:preferred;if(frames<minimum||frames>maximum||frames<16||frames>8192||(granularity==-1&&(frames&(frames-1)))||(granularity>0&&(frames-minimum)%granularity))return fail("Tamanho de buffer inválido para o driver");
 std::set<int> used;routeCount=r.size();rate=sampleRate;fault=0;callbackCount=rendered=underruns=overruns=invalid=clipped=0;
 for(size_t i=0;i<routeCount;i++){const auto &route=r[i];if(route.uuid.empty()||!std::isfinite(route.gain)||route.gain<0||route.gain>2||route.left<0||route.right<0||route.left>=outputs||route.right>=outputs||!used.insert(route.left).second||!used.insert(route.right).second)return fail("Rotas ASIO inválidas ou canais sobrepostos");routes[i]=route;queues[i].read=queues[i].write=0;for(size_t ch=0;ch<2;ch++){auto &b=buffers[i*2+ch];b={};b.isInput=ASIOFalse;b.channelNum=ch?route.right:route.left;ASIOChannelInfo info{};info.channel=b.channelNum;info.isInput=ASIOFalse;if(!Okay(driver->getChannelInfo(&info))||!SampleBytes(info.type))return fail("Formato ASIO não suportado (PCM necessário)");types[i*2+ch]=info.type;}}
 FreeMixAsioOutput *empty=nullptr;if(!active.compare_exchange_strong(empty,this))return fail("Outra saída ASIO já controla os callbacks");
 callbacks={Switch,RateChanged,Message,SwitchTime};if(!Okay(driver->createBuffers(buffers.data(),long(routeCount*2),frames,&callbacks)))return fail("Driver recusou buffers de reprodução");created=true;
 for(size_t i=0;i<routeCount*2;i++)for(size_t half=0;half<2;half++){if(!buffers[i].buffers[half])return fail("Driver devolveu buffer nulo");std::memset(buffers[i].buffers[half],0,size_t(frames)*SampleBytes(types[i]));}
 long inputLatency=0;driver->getLatencies(&inputLatency,&latency);outputReadySupported=Okay(driver->outputReady());running=true;if(!Okay(driver->start()))return fail("Driver recusou iniciar playback ASIO");return true;
}
void FreeMixAsioOutput::Stop(){running=false;if(driver){driver->stop();FreeMixAsioOutput *mine=this;active.compare_exchange_strong(mine,nullptr);if(created)driver->disposeBuffers();if(ownsReference)driver->Release();driver=nullptr;}created=false;ownsReference=false;if(comOwned)CoUninitialize();comOwned=false;}
bool FreeMixAsioOutput::ControlPanel(std::string &error){if(!driver){error="Inicie explicitamente a saída antes de abrir o painel do driver";return false;}if(!Okay(driver->controlPanel())){error="Driver recusou seu painel";return false;}return true;}
void FreeMixAsioOutput::Silence(int reason){fault=reason;}
void FreeMixAsioOutput::Push(size_t route,const float *left,const float *right,uint32_t count,float gain){
 if(!running||fault||route>=routeCount||!left||!count)return;auto &queue=queues[route];const uint64_t w=queue.write.load(std::memory_order_relaxed),r=queue.read.load(std::memory_order_acquire);if(count>Capacity||w-r+count>Capacity){overruns+=count;return;}
 gain=std::isfinite(gain)?std::clamp(gain,0.f,2.f):0;for(size_t frame=0;frame<count;frame++)for(size_t ch=0;ch<2;ch++){float x=(ch&&right?right:left)[frame]*gain*routes[route].gain;if(!std::isfinite(x)){invalid++;x=0;}else if(x< -1||x>1){clipped++;x=std::clamp(x,-1.f,1.f);}queue.pcm[((w+frame)%Capacity)*2+ch]=x;}
 queue.write.store(w+count,std::memory_order_release);
}
void FreeMixAsioOutput::render(long half){
 if(half<0||half>1||!created)return;callbackCount++;rendered+=frames;
 for(size_t i=0;i<routeCount;i++){auto &queue=queues[i];const uint64_t r=queue.read.load(std::memory_order_relaxed),w=queue.write.load(std::memory_order_acquire);const size_t available=running&&!fault?size_t(std::min<uint64_t>(w-r,uint64_t(frames))):0;if(running&&!fault&&available<size_t(frames))underruns+=size_t(frames)-available;
  for(size_t ch=0;ch<2;ch++){auto *dest=static_cast<uint8_t *>(buffers[i*2+ch].buffers[half]);const size_t bytes=SampleBytes(types[i*2+ch]);for(size_t frame=0;frame<size_t(frames);frame++)Encode(types[i*2+ch],frame<available?queue.pcm[((r+frame)%Capacity)*2+ch]:0,dest+frame*bytes);}
  queue.read.store(fault?w:r+available,std::memory_order_release);
 }
 if(outputReadySupported&&driver)driver->outputReady();
}
void FreeMixAsioOutput::Switch(long half,ASIOBool){if(auto *host=active.load(std::memory_order_acquire))host->render(half);}
ASIOTime *FreeMixAsioOutput::SwitchTime(ASIOTime *time,long half,ASIOBool direct){if(time&&(time->timeInfo.flags&kSampleRateValid))if(auto *host=active.load())if(time->timeInfo.sampleRate!=host->rate)host->Silence(1);Switch(half,direct);return time;}
void FreeMixAsioOutput::RateChanged(ASIOSampleRate rate){if(auto *host=active.load())if(rate!=host->rate)host->Silence(1);}
long FreeMixAsioOutput::Message(long selector,long value,void *,double *){if(selector==kAsioSelectorSupported)return value==kAsioResetRequest||value==kAsioResyncRequest||value==kAsioBufferSizeChange||value==kAsioEngineVersion||value==kAsioSupportsTimeInfo;if(selector==kAsioEngineVersion)return 2;if(selector==kAsioSupportsTimeInfo)return 1;if(selector==kAsioResetRequest||selector==kAsioResyncRequest||selector==kAsioBufferSizeChange){if(auto *host=active.load())host->Silence(2);return 1;}return 0;}
FreeMixAsioMetrics FreeMixAsioOutput::Metrics()const{FreeMixAsioMetrics out;out.running=running;out.sampleRate=rate;out.bufferFrames=frames;out.outputs=outputs;out.outputLatency=latency;out.callbacks=callbackCount;out.frames=rendered;out.underrunFrames=underruns;out.overrunFrames=overruns;out.invalidSamples=invalid;out.clippedSamples=clipped;out.fault=fault;for(size_t i=0;i<routeCount;i++){const uint64_t read=queues[i].read.load(),write=queues[i].write.load();out.queued[i]=std::min<uint64_t>(write>=read?write-read:0,Capacity);}return out;}
