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
inline void FreeMixCallAudioRequest(obs_data_t *, obs_data_t *) {}
inline void FreeMixCallAudioTick() {}
inline void FreeMixCallAudioStop() {}

} // namespace freemix_call_audio

namespace freemix_srt_hdr {
inline void Request(obs_data_t *, obs_data_t *, bool (*)(obs_source_t *)) {}
inline bool Pending() { return false; }
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
inline void Create(obs_source_t *, uint32_t, uint32_t, const std::string &) {}
} // namespace freemix_srt_alpha

namespace freemix_omt_hdr {
inline void Request(obs_data_t *, obs_data_t *, bool (*)(obs_source_t *)) {}
inline bool IdentityInUse(const std::string &, obs_output_t *) { return false; }
inline void Register() {}
} // namespace freemix_omt_hdr

// Audio routing stubs




// OBS view stub
inline void obs_view_add_program_final_gate(obs_view_t *, obs_source_t *) {}

// Timer for call video tick
extern QTimer *callVideoTimer;