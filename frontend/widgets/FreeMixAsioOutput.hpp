#pragma once
// GPL-3.0-or-later. SDK interfaces use the official GPLv3 licensing option.
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <unknwn.h>
#include "../../deps/asio-sdk/common/iasiodrv.h"
#include <array>
#include <atomic>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

struct FreeMixAsioRoute { std::string uuid; int left=0,right=1; float gain=1; };
struct FreeMixAsioDriver { std::string id,name; };
struct FreeMixAsioMetrics {
 bool running=false; uint32_t sampleRate=0; long bufferFrames=0,outputs=0,outputLatency=0;
 uint64_t callbacks=0,frames=0,underrunFrames=0,overrunFrames=0,invalidSamples=0,clippedSamples=0;
 int fault=0; std::array<uint64_t,8> queued{};
};

// One dedicated output driver. GUI owns lifecycle; audio callbacks never open a
// device, allocate, block, call libobs or perform logging/registry operations.
class FreeMixAsioOutput {
 static constexpr uint64_t Capacity=16384;
 struct Queue { std::vector<float> pcm=std::vector<float>(Capacity*2); std::atomic<uint64_t> read{0},write{0}; };
 std::array<Queue,8> queues;
 std::array<ASIOBufferInfo,16> buffers{};
 std::array<ASIOSampleType,16> types{};
 ASIOCallbacks callbacks{};
 std::array<FreeMixAsioRoute,8> routes;
 IASIO *driver=nullptr; size_t routeCount=0; long frames=0,outputs=0,latency=0; uint32_t rate=0;
 bool ownsReference=false,created=false,outputReadySupported=false,comOwned=false;
 std::atomic<bool> running{false}; std::atomic<int> fault{0};
 std::atomic<uint64_t> callbackCount{0},rendered{0},underruns{0},overruns{0},invalid{0},clipped{0};
 static std::atomic<FreeMixAsioOutput *> active;
 static void Switch(long,ASIOBool);
 static ASIOTime *SwitchTime(ASIOTime *,long,ASIOBool);
 static void RateChanged(ASIOSampleRate);
 static long Message(long,long,void *,double *);
 void render(long);
public:
 ~FreeMixAsioOutput();
 static std::vector<FreeMixAsioDriver> Drivers(bool *complete=nullptr); // explicit registry inventory; never opens COM
 bool Start(const std::string &,const std::vector<FreeMixAsioRoute> &,uint32_t,long,void *,std::string &);
 // Test seam: same native IASIO interface and callback path; no registration.
 bool StartInjected(IASIO *,const std::vector<FreeMixAsioRoute> &,uint32_t,long,void *,std::string &);
 void Stop();
 bool ControlPanel(std::string &);
 void Push(size_t,const float *,const float *,uint32_t,float gain=1);
 void Silence(int reason=3); // latch fault until an explicit stop/start
 FreeMixAsioMetrics Metrics() const;
 static size_t SampleBytes(ASIOSampleType);
 static bool Encode(ASIOSampleType,float,void *);
};
