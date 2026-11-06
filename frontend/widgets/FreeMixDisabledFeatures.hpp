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













// Audio routing stubs




// OBS view stub


// Timer for call video tick
extern QTimer *callVideoTimer;