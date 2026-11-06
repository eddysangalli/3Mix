#pragma once
#include <obs.h>
// OFFSIDE only; Root must register/serialize on the UI thread and require explicit scan consent.
// Enumerates properties by source kind with owned defaults. No sources are created.
bool FreeMixReadProjectDeviceInventory(obs_data_t *response);
