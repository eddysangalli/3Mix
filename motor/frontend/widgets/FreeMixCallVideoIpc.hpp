// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once
// Qt socket worker only. No OBS, callback, GUI/network wait or global environment.
#include "FreeMixCallVideoPool.hpp"
#include <QHostAddress>
#include <QTcpSocket>
#include <chrono>
#include <algorithm>
#include <thread>
namespace freemix_call_video {
struct Ipc {
 std::atomic<bool> stop{false},ready{false};std::atomic<uint32_t> fault{0};
 std::atomic<uint64_t> sent{0},bytes{0},backpressure{0},socketHighWater{0};
};
inline void RunIpc(Pool &pool,Ipc &state,uint16_t port,uint32_t slot,uint32_t generation,std::array<uint8_t,32> &token){
 constexpr qint64 packetBytes=HeaderSize+Payload,bound=2*packetBytes;
 QTcpSocket socket;socket.connectToHost(QHostAddress::LocalHost,port);
 if(!socket.waitForConnected(250)||state.stop.load()){if(!state.stop.load())state.fault=1;token.fill(0);socket.abort();return;}
 socket.setSocketOption(QAbstractSocket::SendBufferSizeSocketOption,int(packetBytes));
 std::array<uint8_t,48> auth{};std::memcpy(auth.data(),"FMVA",4);Put32(auth.data()+4,1);Put32(auth.data()+8,slot);Put32(auth.data()+12,generation);std::memcpy(auth.data()+16,token.data(),32);
 const auto accepted=socket.write(reinterpret_cast<const char *>(auth.data()),auth.size());auth.fill(0);token.fill(0);
 if(accepted!=48){state.fault=2;socket.abort();return;}state.ready=true;
 auto lastProgress=std::chrono::steady_clock::now();qint64 previousPending=socket.bytesToWrite();
 while(!state.stop.load()){
  if(socket.state()!=QAbstractSocket::ConnectedState){state.fault=3;break;}
  const auto pending=socket.bytesToWrite();
  if(pending<previousPending||pending==0)lastProgress=std::chrono::steady_clock::now();previousPending=pending;
  if(pending+packetBytes>bound){
   state.backpressure++;socket.waitForBytesWritten(10);
   if(std::chrono::steady_clock::now()-lastProgress>std::chrono::milliseconds(500)){state.fault=6;break;}
   continue;
  }
  auto lease=pool.TakeLatest();
  if(lease.index<0){socket.waitForReadyRead(1);if(socket.bytesAvailable()){state.fault=4;break;}std::this_thread::sleep_for(std::chrono::milliseconds(1));continue;}
  const auto h=Header(slot,generation,lease.sequence,lease.pts,pool.fpsNum,pool.fpsDen);
  const bool sent=socket.write(reinterpret_cast<const char *>(h.data()),h.size())==qint64(h.size())&&socket.write(reinterpret_cast<const char *>(lease.rgba),Payload)==Payload;
  pool.Release(lease);if(!sent){state.fault=2;break;}state.sent++;state.bytes+=packetBytes;
  state.socketHighWater.store(std::max<uint64_t>(state.socketHighWater.load(),uint64_t(socket.bytesToWrite())));
  socket.waitForBytesWritten(1);
 }socket.abort();
}
}
