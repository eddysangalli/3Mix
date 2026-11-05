#pragma once
#include <obs.h>
#include <memory>
#include <string>
void FreeMixAudioRoutingRegister();
void FreeMixAudioCapabilitiesRequest(obs_data_t *, obs_data_t *, void *);
// Owned PCM context for one independent bus. Destroy only after consumers have
// disconnected their encoder/raw output. Never changes any global audio route.
class FreeMixSourceAudio {
 struct Impl;
 std::unique_ptr<Impl> impl;
 explicit FreeMixSourceAudio(std::unique_ptr<Impl>);
public:
 ~FreeMixSourceAudio();
 static std::unique_ptr<FreeMixSourceAudio> Open(const std::string &uuid,const std::string &name,std::string &error);
 audio_t *Audio() const;
 bool Valid() const;
};
bool FreeMixAudioBusAllowed(obs_source_t *source);
