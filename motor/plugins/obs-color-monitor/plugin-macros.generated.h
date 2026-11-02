/*
OBS Color Monitor
Copyright (C) 2021 Norihiro Kamae

This program is free software; you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation; either version 2 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License along
with this program. If not, see <https://www.gnu.org/licenses/>
*/

/* Upstream generates this file from src/plugin-macros.h.in; written by hand for the in-tree FreeMix build. */

#ifndef PLUGINNAME_H
#define PLUGINNAME_H

#define PLUGIN_NAME "obs-color-monitor"
#define PLUGIN_VERSION "0.9.6"
#define ID_PREFIX "net.nagater.obs-color-monitor."

#define blog(level, msg, ...) blog(level, "[" PLUGIN_NAME "] " msg, ##__VA_ARGS__)

#endif // PLUGINNAME_H
