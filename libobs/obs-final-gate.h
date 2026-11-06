#pragma once
#include <stdbool.h>
#include <stdint.h>
#include "util/c99defs.h"
#ifdef __cplusplus
extern "C" {
#endif
/* Experimental v2 final stage: linear-light sRGB on GS_CS_SRGB RGBA/BGRA8.
 * Audio unchanged. Followers require their own supported target; no HDR/16F support. */
struct obs_master_final_gate_state {
 uint32_t contract_version, mix_identity, generation, command_serial;
 bool available, enabled, requested_active, running, black_observed, normal_observed, clock_fault, target_supported;
 uint32_t gain_q24, frame_seq;
 uint64_t frame_pts_ns;
};
struct obs_master_final_gate_request {
 uint32_t expected_mix_identity, expected_generation;
 bool enabled, active;
 uint32_t duration_ms;
};
/* Bounded atomic snapshots. false means unavailable/busy; it is never a physical-black proof. */
EXPORT bool obs_master_final_gate_get(struct obs_master_final_gate_state *state);
EXPORT bool obs_master_final_gate_set(const struct obs_master_final_gate_request *request, uint32_t *command_serial);
/* Invalidate pending commands and make the next frame identity. No GUI wait for GPU. */
EXPORT void obs_master_final_gate_reset(void);
#ifdef __cplusplus
}
#endif
