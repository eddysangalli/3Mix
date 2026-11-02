/******************************************************************************
    FreeMix: extra streaming destinations (multistream).

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
******************************************************************************/

#pragma once

/* Call once, on the interface thread, after the frontend API exists and before the first scene collection is
 * loaded. See FreeMixMultistream.cpp for what it sets up. */
void FreeMixMultistreamInit();
// Mark shutdown before browser docks enter their nested Qt event loop.
void FreeMixMultistreamBeginClose();
// Defer main-window close until a CEF panel destructor has returned.
bool FreeMixMultistreamDeferClose();
// Check before source/video/config clearing; false refuses close/context change.
bool FreeMixMultistreamDrainSrtHdr(unsigned timeoutMs=10000);
