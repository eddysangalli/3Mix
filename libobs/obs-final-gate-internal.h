#pragma once
#include "obs-final-gate.h"
/* Render-thread owned, zero initialized on every video-mix allocation. */
struct obs_final_gate_runtime {
 uint32_t identity, generation, applied_serial, frame_seq;
 bool master, follows_master, enabled, requested_active, running, clock_fault, target_supported;
 uint32_t parent_identity;
 double gain, from_gain, to_gain;
 uint64_t start_pts_ns, last_pts_ns, duration_ns;
};
#ifdef __cplusplus
extern "C" {
#endif
uint32_t obs_final_gate_new_identity(void);
void obs_final_gate_invalidate_identity(uint32_t identity);
void obs_final_gate_prepare(struct obs_final_gate_runtime *r, bool master, uint64_t pts_ns);
void obs_final_gate_inherit(struct obs_final_gate_runtime *r, const struct obs_final_gate_runtime *master, uint64_t pts_ns);
void obs_final_gate_finish_inherited(struct obs_final_gate_runtime *r, bool draw_applied);
bool obs_final_gate_reuse_blocked(const struct obs_final_gate_runtime *r);
void obs_final_gate_publish(struct obs_final_gate_runtime *r, uint64_t pts_ns, bool draw_applied);
#ifdef __cplusplus
}
#endif
