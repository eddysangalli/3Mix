// DRAFT: local bounded Qt drain, no forced release on timeout.
#pragma once
#include "FreeMixSrtHdrOutput.hpp"
#include <QElapsedTimer>
#include <QEventLoop>
#include <QTimer>
#include <QThread>

namespace freemix_srt_hdr {
// GUI only. Root must check false and abort before any source/video/config clear.
// Call after close was confirmed; exclude user input while pumping completion.
inline bool Drain(unsigned timeoutMs=10000){
 if(QThread::currentThread()!=QCoreApplication::instance()->thread())return false;
 if(Draining())return false;
 if(!Pending())return true;
 Draining()=true;QElapsedTimer elapsed;elapsed.start();QEventLoop loop;QTimer poll;
 StopAll();
 QObject::connect(&poll,&QTimer::timeout,&loop,[&](){PollStopped();if(!Pending()||elapsed.elapsed()>=qint64(timeoutMs))loop.quit();});
 poll.start(25);loop.exec(QEventLoop::ExcludeUserInputEvents);poll.stop();PollStopped();Draining()=false;
 if(Pending()){for(auto &slot:Slots())if(HasResources(slot))slot.error="HDR stop timed out; resources retained. Close/change refused; wait for stop and try explicitly again";return false;}
 return true;
}
}
