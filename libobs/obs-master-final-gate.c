#include "obs-final-gate-internal.h"
#ifdef FREEMIX_FINAL_GATE_MODEL
#include "util/threading-windows.h"
#else
#include "util/threading.h"
#endif
#include <limits.h>
#include <string.h>

/* All shared fields use OBS atomics; no mix/GPU mutex, heap, or callback on UI reads/writes. */
static volatile long identity_counter, generation=1, available;
static struct {
 volatile long seq, serial, identity, generation, enabled, active, duration;
} command;
static struct {
 volatile long seq, identity, generation, command_serial, enabled, active, running, fault, target_supported;
 volatile long gain, frame_seq, pts_lo, pts_hi;
} observed;
static uint32_t load(const volatile long *p){return (uint32_t)os_atomic_load_long(p);}
static void store(volatile long *p,uint32_t value){os_atomic_store_long(p,(long)value);}
static bool lock_seq(volatile long *p,uint32_t *seq){*seq=load(p);return !(*seq&1)&&*seq<INT_MAX-2&&os_atomic_compare_swap_long(p,(long)*seq,(long)(*seq+1));}
static void unlock_seq(volatile long *p,uint32_t seq){store(p,seq+2);}
static bool read_command(struct obs_master_final_gate_request *r,uint32_t *serial){
 for(unsigned attempt=0;attempt<4;attempt++){
  const uint32_t a=load(&command.seq);if(a&1)continue;
  r->expected_mix_identity=load(&command.identity);r->expected_generation=load(&command.generation);
  r->enabled=load(&command.enabled)!=0;r->active=load(&command.active)!=0;r->duration_ms=load(&command.duration);
  const uint32_t ticket=load(&command.serial);
  if(a==load(&command.seq)){*serial=ticket;return true;}
 }return false;
}
uint32_t obs_final_gate_new_identity(void){
 long old=os_atomic_load_long(&identity_counter);
 for(unsigned attempt=0;attempt<8;attempt++){
  if(old<0||old>=INT_MAX-1)return 0;
  if(os_atomic_compare_exchange_long(&identity_counter,&old,old+1))return (uint32_t)(old+1);
 }return 0;
}
void obs_final_gate_invalidate_identity(uint32_t identity){if(identity==load(&observed.identity))store(&available,0);}
void obs_master_final_gate_reset(void){
 store(&available,0);
 long old=os_atomic_load_long(&generation);
 for(unsigned attempt=0;attempt<8;attempt++){
  if(old<0||old>=INT_MAX-1){store(&generation,0);return;}
  if(os_atomic_compare_exchange_long(&generation,&old,old+1))return;
 }store(&generation,0); /* Exhaustion/contention fails closed, never reuse an old epoch. */
}
bool obs_master_final_gate_get(struct obs_master_final_gate_state *s){
 if(!s)return false;memset(s,0,sizeof(*s));s->contract_version=2;
 for(unsigned attempt=0;attempt<4;attempt++){
  const uint32_t a=load(&observed.seq);if(a&1)continue;
  s->mix_identity=load(&observed.identity);s->generation=load(&observed.generation);s->command_serial=load(&observed.command_serial);
  s->enabled=load(&observed.enabled)!=0;s->requested_active=load(&observed.active)!=0;s->running=load(&observed.running)!=0;s->clock_fault=load(&observed.fault)!=0;
  s->target_supported=load(&observed.target_supported)!=0;
  s->gain_q24=load(&observed.gain);s->frame_seq=load(&observed.frame_seq);s->frame_pts_ns=((uint64_t)load(&observed.pts_hi)<<32)|load(&observed.pts_lo);
  if(a!=load(&observed.seq))continue;
  s->available=load(&available)!=0&&s->target_supported&&s->mix_identity!=0&&s->generation==load(&generation)&&!s->clock_fault;
  s->black_observed=s->available&&s->enabled&&s->requested_active&&!s->running&&s->gain_q24==0;
  s->normal_observed=s->available&&!s->running&&s->gain_q24==16777216u;
  return true;
 }return false;
}
bool obs_master_final_gate_set(const struct obs_master_final_gate_request *r,uint32_t *serial){
 if(!r||!serial||r->active&&!r->enabled||r->duration_ms<50||r->duration_ms>20000)return false;
 struct obs_master_final_gate_state s;if(!obs_master_final_gate_get(&s)||!s.available||s.running||s.mix_identity!=r->expected_mix_identity||s.generation!=r->expected_generation)return false;
 uint32_t seq;if(!lock_seq(&command.seq,&seq))return false;
 /* Pending acceptance is not an observed frame. Refuse to overwrite it. */
 const uint32_t ticket=load(&command.serial);
 if(ticket>=INT_MAX-1||ticket!=s.command_serial&&load(&command.identity)==s.mix_identity&&load(&command.generation)==s.generation){unlock_seq(&command.seq,seq);return false;}
 if(load(&generation)!=r->expected_generation||load(&observed.identity)!=r->expected_mix_identity||!load(&available)){unlock_seq(&command.seq,seq);return false;}
 store(&command.identity,r->expected_mix_identity);store(&command.generation,r->expected_generation);
 store(&command.enabled,r->enabled);store(&command.active,r->active);store(&command.duration,r->duration_ms);
 store(&command.serial,ticket+1);unlock_seq(&command.seq,seq);*serial=ticket+1;return true;
}
void obs_final_gate_prepare(struct obs_final_gate_runtime *r,bool master,uint64_t pts){
 r->master=master;if(!master)return;
 const uint32_t epoch=load(&generation);
 if(r->generation!=epoch){
  r->generation=epoch;r->enabled=false;r->requested_active=false;r->running=false;r->clock_fault=false;
  r->gain=r->from_gain=r->to_gain=1;r->applied_serial=0;r->last_pts_ns=pts;r->duration_ns=0;
 }
 if(!r->identity||!epoch){r->enabled=false;r->gain=1;r->clock_fault=true;return;}
 if(r->last_pts_ns&&pts<r->last_pts_ns){r->clock_fault=true;r->enabled=false;r->requested_active=false;r->running=false;r->gain=1;return;}
 r->last_pts_ns=pts;
 struct obs_master_final_gate_request c;uint32_t serial;
 if(!r->clock_fault&&read_command(&c,&serial)&&serial!=r->applied_serial&&c.expected_mix_identity==r->identity&&c.expected_generation==epoch){
  r->applied_serial=serial;r->enabled=c.enabled||r->gain<1;r->requested_active=c.active;
  r->from_gain=r->gain;r->to_gain=c.enabled&&c.active?0:1;r->start_pts_ns=pts;r->duration_ns=(uint64_t)c.duration_ms*1000000u;
  r->running=r->from_gain!=r->to_gain;
 }
 if(r->running){
  const uint64_t elapsed=pts-r->start_pts_ns;
  const double t=elapsed>=r->duration_ns?1:(double)elapsed/(double)r->duration_ns;
  r->gain=r->from_gain+(r->to_gain-r->from_gain)*t;
  if(t==1){r->running=false;r->gain=r->to_gain;}
 }
 /* Disabled commands keep the gate until a full identity frame; then no work remains. */
 if(!r->running&&r->gain==1&&!r->requested_active){struct obs_master_final_gate_request c;uint32_t serial;if(read_command(&c,&serial)&&serial==r->applied_serial&&!c.enabled)r->enabled=false;}
}
/* Render-thread only. No command acceptance, clock advance, or global observation by a follower. */
void obs_final_gate_inherit(struct obs_final_gate_runtime *r,const struct obs_final_gate_runtime *m,uint64_t pts){
 r->master=false;
 if(!r->follows_master)return;
 if(m&&(r->generation!=m->generation||r->parent_identity!=m->identity)){
  r->generation=m->generation;r->parent_identity=m->identity;r->clock_fault=false;r->frame_seq=0;
 }
 if(!m||!m->master||!m->identity||!m->generation||m->generation!=load(&generation)||m->last_pts_ns!=pts||m->clock_fault||r->clock_fault){
  r->enabled=false;r->requested_active=false;r->running=false;r->gain=1;r->clock_fault=true;r->last_pts_ns=pts;return;
 }
 r->applied_serial=m->applied_serial;r->enabled=m->enabled;r->requested_active=m->requested_active;
 r->running=m->running;r->gain=m->gain;r->from_gain=m->from_gain;r->to_gain=m->to_gain;
 r->start_pts_ns=m->start_pts_ns;r->duration_ns=m->duration_ns;r->last_pts_ns=pts;
}
void obs_final_gate_finish_inherited(struct obs_final_gate_runtime *r,bool applied){
 if(!r->follows_master||r->master)return;
 if(!applied||r->frame_seq==UINT32_MAX){r->clock_fault=true;r->running=false;return;}
 ++r->frame_seq;
}
bool obs_final_gate_reuse_blocked(const struct obs_final_gate_runtime *r){
 if(r->enabled||r->gain<1||r->clock_fault)return true;
 struct obs_master_final_gate_request c;uint32_t serial;
 return (r->master||r->follows_master)&&read_command(&c,&serial)&&c.expected_mix_identity==(r->master?r->identity:r->parent_identity)&&c.expected_generation==load(&generation)&&c.enabled;
}
void obs_final_gate_publish(struct obs_final_gate_runtime *r,uint64_t pts,bool draw_applied){
 if(!r->master)return;
 if(!draw_applied||r->frame_seq==UINT32_MAX){r->clock_fault=true;r->running=false;}
 uint32_t seq;if(!lock_seq(&observed.seq,&seq)){store(&available,0);return;}
 store(&observed.identity,r->identity);store(&observed.generation,r->generation);store(&observed.command_serial,r->applied_serial);
 store(&observed.enabled,r->enabled);store(&observed.active,r->requested_active);store(&observed.running,r->running);store(&observed.fault,r->clock_fault);
 store(&observed.target_supported,r->target_supported);
 store(&observed.gain,(uint32_t)(r->gain*16777216.0));store(&observed.frame_seq,++r->frame_seq);store(&observed.pts_lo,(uint32_t)pts);store(&observed.pts_hi,(uint32_t)(pts>>32));
 unlock_seq(&observed.seq,seq);store(&available,r->target_supported&&r->identity&&r->generation==load(&generation)&&!r->clock_fault);
}
