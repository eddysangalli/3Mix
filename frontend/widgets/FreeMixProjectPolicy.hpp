#pragma once
#include <obs.h>
// OFFSIDE only. Root registers this finite read-only function on the UI thread.
bool FreeMixReadProjectCreationPolicy(obs_data_t *response);
