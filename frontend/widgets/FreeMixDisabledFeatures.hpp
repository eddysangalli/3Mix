// Stub implementations for disabled FreeMix features
// TODO: Implement these features properly

#pragma once

#include <obs-frontend-api.h>
#include <obs.hpp>
#include <QTimer>
#include <memory>
#include <string>
#include <vector>

namespace freemix_call_video {
inline void FreeMixCallVideoStop() {}
inline void FreeMixCallVideoRequest(obs_data_t *, obs_data_t *, bool (*)(obs_source_t *)) {}
inline void FreeMixCallVideoRegister() {}
inline void FreeMixCallVideoTick(bool (*)(obs_source_t *)) {}
inline void FreeMixCallVideoTick() {}
inline bool FreeMixCallVideoPending() { return false; }
inline bool FreeMixCallVideoDrain(unsigned) { return true; }
} // namespace freemix_call_video

namespace freemix_call_audio {
inline void FreeMixCallAudioDirector(const char *, const char *) {}
inline void FreeMixCallAudioTick() {}
inline void FreeMixCallAudioStop() {}
inline void FreeMixCallAudioRequest(obs_data_t *, obs_data_t *) {}
inline void FreeMixCallAudioTick() {}
inline void FreeMixCallAudioStop() {}
inline void FreeMixAudioCapabilitiesRequest(obs_data_t *, obs_data_t *, void *) {}
} // namespace freemix_call_audio

namespace freemix_srt_hdr {
inline void Request(obs_data_t *, obs_data_t *, bool (*)(obs_source_t *)) {}
inline bool Pending() { return false; }
inline bool Drain(unsigned) { return true; }
inline void Stop() {}
inline void Register() {}
} // namespace freemix_srt_hdr

namespace freemix_ndi {
inline bool Available() { return false; }
inline int Connections(obs_output_t *) { return 0; }
inline void Register() {}
} // namespace freemix_ndi

namespace freemix_sdi {
inline void Request(obs_data_t *, obs_data_t *, bool (*)(obs_source_t *)) {}
inline void Register() {}
} // namespace freemix_sdi

namespace freemix_srt_alpha {
inline void Register() {}
inline obs_source_t* Create(obs_source_t *, uint32_t, uint32_t, const std::string &) { return nullptr; }
} // namespace freemix_srt_alpha

namespace freemix_omt_hdr {
inline void Request(obs_data_t *, obs_data_t *, bool (*)(obs_source_t *)) {}
inline bool IdentityInUse(const std::string &, obs_output_t *) { return false; }
inline void Register() {}
} // namespace freemix_omt_hdr

// Audio routing stubs
inline bool FreeMixAudioBusAllowed(obs_source_t *) { return false; }
inline void FreeMixAudioRoutingRegister() {}

// OBS view stub
inline obs_source_t* obs_view_add_program_final_gate(obs_view_t *, obs_video_info *) { return nullptr; }

// Stub for FreeMixSourceAudio used by disabled network media features
struct FreeMixSourceAudio {
    static std::unique_ptr<FreeMixSourceAudio> Open(const std::string &, const std::string &, std::string &) { return nullptr; }
    audio_t *Audio() { return obs_get_audio(); }
    bool Valid() const { return false; }
    ~FreeMixSourceAudio() = default;
};

// Timer for call video tick
extern QTimer *callVideoTimer;