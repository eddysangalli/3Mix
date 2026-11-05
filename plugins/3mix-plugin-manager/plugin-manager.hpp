/******************************************************************************
    3Mix Plugin Manager — Native OBS plugin for plugin lifecycle management.

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

#include <obs-module.h>
#include <obs-frontend-api.h>
#include <obs.hpp>
#include <util/platform.h>
#include <util/dstr.h>
#include <util/threading.h>
#include <vector>
#include <string>
#include <map>
#include <mutex>
#include <atomic>
#include <json/json.h>

#ifdef _WIN32
#define PLUGIN_MANAGER_EXPORT __declspec(dllexport)
#else
#define PLUGIN_MANAGER_EXPORT
#endif

// Plugin state enum
enum class PluginState {
    UNKNOWN,
    PENDING_INSTALL,
    PENDING_UPDATE,
    PENDING_DISABLE,
    PENDING_ENABLE,
    PENDING_REMOVE,
    PENDING_ROLLBACK,
    ACTIVE,
    DISABLED,
    FAILED,
    REMOVED
};

// Safe mode state
extern std::atomic<bool> g_safeMode;
extern std::mutex g_safeModeMutex;

// Plugin metadata
struct PluginMetadata {
    std::string id;
    std::string name;
    std::string version;
    std::string developer;
    std::string description;
    std::string license;
    std::string sha256;
    std::vector<std::string> dependencies;
    std::string signatureStatus;
    std::string installedAt;
    std::string operationId;
    Json::Value resources; // inputs, outputs, encoders, services
};

// Plugin info from load report
struct PluginLoadReport {
    std::string id;
    std::string name;
    std::string version;
    std::string status; // "loaded", "failed", "missing"
    std::vector<std::string> sourceTypes;
    std::vector<std::string> outputs;
    std::vector<std::string> encoders;
    std::vector<std::string> services;
    std::string errorMessage;
};

// Pending operation
struct PendingOperation {
    std::string id;
    std::string opId;
    std::string action; // install, update, disable, enable, remove, rollback
    std::string stage;
    std::string backup;
    std::string at;
};

// Forward declarations
bool plugin_manager_init();
void plugin_manager_shutdown();
void plugin_manager_set_safe_mode(bool enabled);
bool plugin_manager_get_safe_mode();
bool plugin_manager_is_production_active();

// Vendor request handler
OBSDataAutoRelease plugin_manager_vendor_request(const char* requestType, obs_data_t* requestData);

// Internal: called on startup to apply pending operations
bool plugin_manager_apply_pending();

// Internal: load report from last startup
bool plugin_manager_load_report(Json::Value& report);

// Internal: get list of managed plugins
void plugin_manager_get_plugins(Json::Value& plugins, const char* obsVersion);

// Internal: get protected plugin IDs (factory plugins)
std::set<std::string> plugin_manager_get_protected_ids();

// Internal: inspect plugin zip compatibility
bool plugin_manager_inspect_compatibility(const char* zipPath, Json::Value& result);

// Internal: install/update plugin from zip
bool plugin_manager_install_plugin(const char* zipPath, const char* targetId, Json::Value& result);

// Internal: queue operation
bool plugin_manager_queue_operation(const char* action, const char* id, const char* stage, const char* backup, Json::Value& result);