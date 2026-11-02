#pragma once
#include <obs.h>
void FreeMixCallAudioRequest(obs_data_t *request, obs_data_t *response, void *);
void FreeMixCallAudioStop();
void FreeMixCallAudioTick();
void FreeMixCallAudioDirector(const char *uuid, const char *lease);

// includeClock=true: decimal-u64 session/privacy generation, per-tap epochs and drain snapshot.
// Observability only; no PCM format/payload change, no autostart and no certified audiovisual PTS.
