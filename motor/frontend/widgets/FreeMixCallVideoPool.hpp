// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once
// Own draft. No OBS/Qt dependency. Three fixed slots, one serialized producer.
#include <array>
#include <atomic>
#include <cstdint>
#include <cstring>
#include <memory>

namespace freemix_call_video {
static_assert(std::atomic<uint32_t>::is_always_lock_free&&std::atomic<uint64_t>::is_always_lock_free,"Capture pool requires lock-free counters on this target");
constexpr uint32_t Width=640,Height=360,Stride=Width*4,Payload=Stride*Height,HeaderSize=64;
inline void Put16(uint8_t *p,uint16_t v){p[0]=uint8_t(v);p[1]=uint8_t(v>>8);}
inline void Put32(uint8_t *p,uint32_t v){for(int i=0;i<4;i++)p[i]=uint8_t(v>>(i*8));}
inline void Put64(uint8_t *p,uint64_t v){for(int i=0;i<8;i++)p[i]=uint8_t(v>>(i*8));}
inline std::array<uint8_t,HeaderSize> Header(uint32_t slot,uint32_t generation,uint64_t sequence,uint64_t pts,uint32_t fpsNum=30,uint32_t fpsDen=1){
 std::array<uint8_t,HeaderSize> h{};std::memcpy(h.data(),"FMVF",4);Put16(h.data()+4,1);Put16(h.data()+6,HeaderSize);
 Put16(h.data()+8,Width);Put16(h.data()+10,Height);Put16(h.data()+12,1);Put32(h.data()+16,Stride);Put32(h.data()+20,Payload);
 Put32(h.data()+24,slot);Put32(h.data()+28,generation);Put64(h.data()+32,sequence);Put64(h.data()+40,pts);Put32(h.data()+48,fpsNum);Put32(h.data()+52,fpsDen);return h;
}
class Pool {
 enum State : uint32_t {Free,Writing,Ready,Reading};
 struct Cell {std::atomic<uint32_t> state{Free};std::unique_ptr<uint8_t[]> rgba{new uint8_t[Payload]};std::atomic<uint64_t> sequence{0};uint64_t pts=0;};
 std::array<Cell,3> cells;
 uint64_t sequence=0,lastPts=0,callbacks=0;
public:
 struct Lease {int index=-1;const uint8_t *rgba=nullptr;uint64_t sequence=0,pts=0;};
 std::atomic<bool> accepting{false};
 std::atomic<uint64_t> captured{0},replaced{0},busyDropped{0},clockDropped{0},invalid{0},consumed{0};
 unsigned divisor=1;uint32_t fpsNum=30,fpsDen=1; // Set while idle; derived actual rational, never relabel PTS.
 bool Capture(const uint8_t *rgba,uint32_t stride,uint64_t pts) noexcept {
  if(!accepting.load(std::memory_order_relaxed))return false;
  if(!rgba||stride<Stride||!pts){invalid++;return false;}
  if(++callbacks%divisor!=0)return false;
  if(pts<=lastPts){clockDropped++;return false;}lastPts=pts;
  int chosen=-1;
  for(int i=0;i<3;i++){uint32_t expected=Free;if(cells[i].state.compare_exchange_strong(expected,Writing,std::memory_order_acquire)){chosen=i;break;}}
  if(chosen<0)for(int i=0;i<3;i++){uint32_t expected=Ready;if(cells[i].state.compare_exchange_strong(expected,Writing,std::memory_order_acquire)){chosen=i;replaced++;break;}}
  if(chosen<0){busyDropped++;return false;}
  auto &cell=cells[chosen];
  for(uint32_t y=0;y<Height;y++){auto *row=cell.rgba.get()+y*Stride;std::memcpy(row,rgba+uint64_t(y)*stride,Stride);for(uint32_t x=3;x<Stride;x+=4)row[x]=255;}
  cell.sequence=++sequence;cell.pts=pts;captured++;cell.state.store(Ready,std::memory_order_release);return true;
 }
 Lease TakeLatest() noexcept {
  Lease best;
  for(int i=0;i<3;i++){
   uint32_t expected=Ready;if(!cells[i].state.compare_exchange_strong(expected,Reading,std::memory_order_acquire))continue;
   auto &cell=cells[i];
   if(best.index<0||cell.sequence.load()>best.sequence){if(best.index>=0){cells[best.index].state.store(Free,std::memory_order_release);replaced++;}best={i,cell.rgba.get(),cell.sequence.load(),cell.pts};}
   else {cell.state.store(Free,std::memory_order_release);replaced++;}
  }
  if(best.index>=0)consumed++;return best;
 }
 bool Release(Lease &lease) noexcept {
  if(lease.index<0||lease.index>2||lease.rgba!=cells[lease.index].rgba.get()||lease.sequence!=cells[lease.index].sequence.load())return false;
  uint32_t expected=Reading;if(!cells[lease.index].state.compare_exchange_strong(expected,Free,std::memory_order_release))return false;
  lease={};return true;
 }
};
} // namespace freemix_call_video
