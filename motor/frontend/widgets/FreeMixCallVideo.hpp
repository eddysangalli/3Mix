// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once
#include <obs.h>
// GUI-thread functions. Root owns queued vendor wrapper and close/context gates.
void FreeMixCallVideoRegister();
void FreeMixCallVideoRequest(obs_data_t *,obs_data_t *,bool (*isPrivate)(obs_source_t *));
void FreeMixCallVideoTick(bool (*isPrivate)(obs_source_t *));
void FreeMixCallVideoStop();
bool FreeMixCallVideoPending();
bool FreeMixCallVideoDrain(unsigned timeoutMs);
