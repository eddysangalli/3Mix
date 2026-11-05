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

#include "plugin-manager.hpp"
#include <obs-frontend-api.h>
#include <obs.hpp>
#include <util/platform.h>
#include <util/dstr.h>
#include <util/threading.h>
#include <util/json.h>
#include <util/zip.h>
#include <util/windows-dirent.h>
#include <util/windows-file.h>
#include <util/windows-crypto.h>
#include <json/json.h>
#include <mutex>
#include <atomic>
#include <vector>
#include <string>
#include <map>
#include <set>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <algorithm>
#include <thread>
#include <chrono>

namespace fs = std::filesystem;

static std::atomic<bool> g_safeMode{false};
static std::mutex g_safeModeMutex;
static std::string g_rootPath;
static std::string g_managedPath;
static std::string g_configPath;
static std::string g_queuePath;
static std::string g_reportPath;
static std::string g_logPath;
static std::string g_catalogPath;
static std::mutex g_stateMutex;
static std::mutex g_queueMutex;
static std::mutex g_logMutex;

static const char* const kStateFile = "state.json";
static const char* const kQueueFile = "queue.json";
static const char* const kReportFile = "load-report.json";
static const char* const kLogFile = "operations.jsonl";
static const char* const kCatalogFile = "plugin-catalog.json";
static const char* const kManagedDir = "3mix-plugins";
static const char* const kConfigDir = "config/3mix-plugin-manager";
static const char* const kStagingDir = ".staging";
static const char* const kBackupsDir = ".backups";

static const char* const kObsPluginsDir = "obs-plugins/64bit";
static const char* const kProtectedPrefix = "freemix";

static bool g_initialized = false;

// Safe mode accessors
bool plugin_manager_get_safe_mode() {
    return g_safeMode.load();
}

void plugin_manager_set_safe_mode(bool enabled) {
    std::lock_guard<std::mutex> lock(g_safeModeMutex);
    g_safeMode.store(enabled);
}

bool plugin_manager_is_production_active() {
    // Check if streaming/recording is active
    if (!obs_frontend_streaming_active() && !obs_frontend_recording_active()) {
        return false;
    }
    return true;
}

static void write_log(const std::string& action, const std::string& id, const Json::Value& detail = Json::Value()) {
    std::lock_guard<std::mutex> lock(g_logMutex);
    std::ofstream log(g_logPath, std::ios::app);
    if (log.is_open()) {
        Json::Value entry;
        entry["at"] = os_gettime_ns(); // ISO timestamp would be better
        entry["action"] = action;
        entry["id"] = id;
        for (const auto& key : detail.getMemberNames()) {
            entry[key] = detail[key];
        }
        Json::StreamWriterBuilder builder;
        builder["indentation"] = "";
        log << Json::writeString(builder, entry) << "\n";
        log.close();
    }
}

static std::string read_file(const std::string& path) {
    std::ifstream file(path);
    if (!file.is_open()) return "";
    return std::string((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
}

static void write_file_atomic(const std::string& path, const std::string& content) {
    fs::create_directories(fs::path(path).parent_path());
    std::string temp = path + "." + std::to_string(os_gettime_ns()) + ".tmp";
    std::ofstream file(temp);
    if (file.is_open()) {
        file << content;
        file.close();
        fs::rename(temp, path);
    }
}

static Json::Value read_json(const std::string& path, const Json::Value& fallback = Json::Value()) {
    std::string content = read_file(path);
    if (content.empty()) return fallback;
    Json::Value root;
    Json::CharReaderBuilder builder;
    std::string errs;
    std::istringstream stream(content);
    if (Json::parseFromStream(builder, stream, &root, &errs)) {
        return root;
    }
    return fallback;
}

static void write_json_atomic(const std::string& path, const Json::Value& value) {
    Json::StreamWriterBuilder builder;
    builder["indentation"] = "  ";
    std::string content = Json::writeString(builder, value) + "\n";
    write_file_atomic(path, content);
}

static std::set<std::string> get_protected_ids() {
    std::set<std::string> protectedIds;
    std::string obsPluginsPath = fs::path(g_rootPath) / kObsPluginsDir;
    if (fs::exists(obsPluginsPath)) {
        for (const auto& entry : fs::directory_iterator(obsPluginsPath)) {
            if (entry.is_regular_file() && entry.path().extension() == ".dll") {
                std::string name = entry.path().stem().string();
                std::transform(name.begin(), name.end(), name.begin(), ::tolower);
                protectedIds.insert(name);
            }
        }
    }
    return protectedIds;
}

static bool is_valid_id(const std::string& id) {
    static const std::regex id_regex("^[a-z0-9][a-z0-9._-]{0,79}$");
    return std::regex_match(id, id_regex) && id != "." && id != "..";
}

static std::string safe_id(const std::string& id) {
    std::string lower = id;
    std::transform(lower.begin(), lower.end(), lower.begin(), ::tolower);
    if (!is_valid_id(lower)) {
        throw std::runtime_error("Identificador de plugin inválido");
    }
    return lower;
}

static bool path_within(const std::string& base, const std::string& child) {
    fs::path basePath = fs::absolute(base);
    fs::path childPath = fs::absolute(child);
    try {
        fs::path rel = fs::relative(childPath, basePath);
        if (rel.empty() || rel.string().find("..") == 0) return false;
        return true;
    } catch (...) {
        return false;
    }
}

static std::string get_managed_path(const std::string& id) {
    return (fs::path(g_managedPath) / id).string();
}

static std::string get_staging_path(const std::string& opId) {
    return (fs::path(g_managedPath) / kStagingDir / opId).string();
}

static std::string get_backup_path(const std::string& id, const std::string& opId) {
    return (fs::path(g_managedPath) / kBackupsDir / id / opId).string();
}

static Json::Value read_state() {
    std::lock_guard<std::mutex> lock(g_stateMutex);
    std::string path = fs::path(g_configPath) / kStateFile;
    Json::Value state = read_json(path, Json::Value());
    if (state.isNull() || !state.isObject()) {
        state["format"] = 1;
        state["safeMode"] = false;
        state["plugins"] = Json::Value(Json::objectValue);
        state["lastChangedPlugin"] = Json::Value(Json::nullValue);
    }
    return state;
}

static void write_state(const Json::Value& state) {
    std::lock_guard<std::mutex> lock(g_stateMutex);
    std::string path = fs::path(g_configPath) / kStateFile;
    write_json_atomic(path, state);
}

static Json::Value read_queue() {
    std::lock_guard<std::mutex> lock(g_queueMutex);
    std::string path = fs::path(g_configPath) / kQueueFile;
    Json::Value queue = read_json(path, Json::Value(Json::arrayValue));
    if (!queue.isArray()) return Json::Value(Json::arrayValue);
    return queue;
}

static void write_queue(const Json::Value& queue) {
    std::lock_guard<std::mutex> lock(g_queueMutex);
    std::string path = fs::path(g_configPath) / kQueueFile;
    write_json_atomic(path, queue);
}

static Json::Value read_report() {
    std::string path = fs::path(g_configPath) / kReportFile;
    return read_json(path, Json::Value());
}

static void write_report(const Json::Value& report) {
    std::string path = fs::path(g_configPath) / kReportFile;
    write_json_atomic(path, report);
}

static std::string generate_op_id() {
    return std::to_string(os_gettime_ns());
}

static void log_operation(const std::string& action, const std::string& id, const Json::Value& detail = Json::Value()) {
    std::lock_guard<std::mutex> lock(g_logMutex);
    Json::Value entry;
    entry["at"] = std::to_string(os_gettime_ns());
    entry["action"] = action;
    entry["id"] = id;
    for (const auto& key : detail.getMemberNames()) {
        entry[key] = detail[key];
    }
    std::string logPath = fs::path(g_configPath) / kLogFile;
    fs::create_directories(fs::path(logPath).parent_path());
    std::ofstream log(logPath, std::ios::app);
    if (log.is_open()) {
        Json::StreamWriterBuilder builder;
        builder["indentation"] = "";
        log << Json::writeString(builder, entry) << "\n";
        log.close();
    }
}

// Vendor request handler
static OBSDataAutoRelease handle_vendor_request(const char* requestType, obs_data_t* requestData) {
    if (!requestType || !requestData) return nullptr;
    
    std::string type(requestType);
    
    if (type == "list_modules") {
        // Return list of managed plugins
        Json::Value plugins(Json::arrayValue);
        std::string obsVersion = "33.0.1"; // Get from libobs
        
        fs::create_directories(g_managedPath);
        for (const auto& entry : fs::directory_iterator(g_managedPath)) {
            if (entry.is_directory()) {
                std::string id = entry.path().filename().string();
                std::transform(id.begin(), id.end(), id.begin(), ::tolower);
                
                std::string metadataPath = (entry.path() / ".3mix.json").string();
                Json::Value metadata = read_json(metadataPath, Json::Value());
                
                Json::Value plugin;
                plugin["id"] = id;
                plugin["name"] = metadata["name"].asString();
                plugin["version"] = metadata["version"].asString();
                plugin["enabled"] = true;
                plugins.append(plugin);
            }
        }
        
        obs_data_t* response = obs_data_create();
        obs_data_set_string(response, "vendorName", "3mix-plugin-manager");
        obs_data_set_string(response, "requestType", "list_modules_response");
        
        Json::StreamWriterBuilder builder;
        builder["indentation"] = "";
        std::string json = Json::writeString(builder, plugins);
        obs_data_set_string(response, "plugins", json.c_str());
        
        return OBSDataAutoRelease(response);
    }
    
    if (type == "safe_mode") {
        bool enabled = obs_data_get_bool(requestData, "enabled");
        plugin_manager_set_safe_mode(enabled);
        
        obs_data_t* response = obs_data_create();
        obs_data_set_string(response, "vendorName", "3mix-plugin-manager");
        obs_data_set_string(response, "requestType", "safe_mode_response");
        obs_data_set_bool(response, "success", true);
        obs_data_set_bool(response, "enabled", enabled);
        
        return OBSDataAutoRelease(response);
    }
    
    if (type == "apply_pending") {
        bool success = plugin_manager_apply_pending();
        
        obs_data_t* response = obs_data_create();
        obs_data_set_string(response, "vendorName", "3mix-plugin-manager");
        obs_data_set_string(response, "requestType", "apply_pending_response");
        obs_data_set_bool(response, "success", success);
        
        return OBSDataAutoRelease(response);
    }
    
    if (type == "get_report") {
        Json::Value report = read_report();
        
        obs_data_t* response = obs_data_create();
        obs_data_set_string(response, "vendorName", "3mix-plugin-manager");
        obs_data_set_string(response, "requestType", "get_report_response");
        
        Json::StreamWriterBuilder builder;
        builder["indentation"] = "";
        std::string json = Json::writeString(builder, report);
        obs_data_set_string(response, "report", json.c_str());
        
        return OBSDataAutoRelease(response);
    }
    
    if (type == "inspect_compatibility") {
        const char* zipPath = obs_data_get_string(requestData, "zipPath");
        if (!zipPath) {
            obs_data_t* response = obs_data_create();
            obs_data_set_string(response, "vendorName", "3mix-plugin-manager");
            obs_data_set_string(response, "requestType", "inspect_compatibility_response");
            obs_data_set_bool(response, "success", false);
            obs_data_set_string(response, "error", "zipPath required");
            return OBSDataAutoRelease(response);
        }
        
        Json::Value result;
        bool success = plugin_manager_inspect_compatibility(zipPath, result);
        
        obs_data_t* response = obs_data_create();
        obs_data_set_string(response, "vendorName", "3mix-plugin-manager");
        obs_data_set_string(response, "requestType", "inspect_compatibility_response");
        obs_data_set_bool(response, "success", success);
        
        Json::StreamWriterBuilder builder;
        builder["indentation"] = "";
        std::string json = Json::writeString(builder, result);
        obs_data_set_string(response, "result", json.c_str());
        
        return OBSDataAutoRelease(response);
    }
    
    if (type == "install_plugin") {
        const char* zipPath = obs_data_get_string(requestData, "zipPath");
        const char* targetId = obs_data_get_string(requestData, "targetId");
        
        if (!zipPath) {
            obs_data_t* response = obs_data_create();
            obs_data_set_string(response, "vendorName", "3mix-plugin-manager");
            obs_data_set_string(response, "requestType", "install_plugin_response");
            obs_data_set_bool(response, "success", false);
            obs_data_set_string(response, "error", "zipPath required");
            return OBSDataAutoRelease(response);
        }
        
        Json::Value result;
        bool success = plugin_manager_install_plugin(zipPath, targetId ? targetId : "", result);
        
        obs_data_t* response = obs_data_create();
        obs_data_set_string(response, "vendorName", "3mix-plugin-manager");
        obs_data_set_string(response, "requestType", "install_plugin_response");
        obs_data_set_bool(response, "success", success);
        
        Json::StreamWriterBuilder builder;
        builder["indentation"] = "";
        std::string json = Json::writeString(builder, result);
        obs_data_set_string(response, "result", json.c_str());
        
        return OBSDataAutoRelease(response);
    }
    
    if (type == "queue_operation") {
        const char* action = obs_data_get_string(requestData, "action");
        const char* id = obs_data_get_string(requestData, "id");
        const char* stage = obs_data_get_string(requestData, "stage");
        const char* backup = obs_data_get_string(requestData, "backup");
        
        if (!action || !id) {
            obs_data_t* response = obs_data_create();
            obs_data_set_string(response, "vendorName", "3mix-plugin-manager");
            obs_data_set_string(response, "requestType", "queue_operation_response");
            obs_data_set_bool(response, "success", false);
            obs_data_set_string(response, "error", "action and id required");
            return OBSDataAutoRelease(response);
        }
        
        Json::Value result;
        bool success = plugin_manager_queue_operation(action, id, stage ? stage : "", backup ? backup : "", result);
        
        obs_data_t* response = obs_data_create();
        obs_data_set_string(response, "vendorName", "3mix-plugin-manager");
        obs_data_set_string(response, "requestType", "queue_operation_response");
        obs_data_set_bool(response, "success", success);
        
        Json::StreamWriterBuilder builder;
        builder["indentation"] = "";
        std::string json = Json::writeString(builder, result);
        obs_data_set_string(response, "result", json.c_str());
        
        return OBSDataAutoRelease(response);
    }
    
    // Unknown request type
    obs_data_t* response = obs_data_create();
    obs_data_set_string(response, "vendorName", "3mix-plugin-manager");
    obs_data_set_string(response, "requestType", "error");
    obs_data_set_bool(response, "success", false);
    obs_data_set_string(response, "error", "Unknown request type");
    return OBSDataAutoRelease(response);
}

// Apply pending operations on startup
static bool plugin_manager_apply_pending() {
    Json::Value queue = read_queue();
    if (!queue.isArray() || queue.size() == 0) return true;
    
    Json::Value state = read_state();
    std::set<std::string> protectedIds = get_protected_ids();
    Json::Value remaining(Json::arrayValue);
    
    for (const auto& op : queue) {
        std::string id = op["id"].asString();
        std::string opId = op["opId"].asString();
        std::string action = op["action"].asString();
        std::string stage = op["stage"].asString();
        std::string backup = op["backup"].asString();
        
        if (protectedIds.count(id)) {
            log_operation("apply-skipped-protected", id, {{"opId", opId}});
            remaining.append(op);
            continue;
        }
        
        std::string binPath = get_managed_path(id);
        std::string backupPath = get_backup_path(id, opId);
        
        if (action == "install" || action == "update") {
            std::string stagePath = get_staging_path(stage);
            std::string stageBin = (fs::path(stagePath) / "bin").string();
            
            // Backup current if exists and different operationId
            if (fs::exists(binPath)) {
                std::string metadataPath = (fs::path(binPath) / ".3mix.json").string();
                Json::Value marker = read_json(metadataPath, Json::Value());
                if (marker["operationId"].asString() != opId) {
                    fs::create_directories(backupPath);
                    fs::rename(binPath, (fs::path(backupPath) / "plugin").string());
                }
            }
            
            if (fs::exists(stageBin)) {
                fs::rename(stageBin, binPath);
            }
            
            std::string stageData = (fs::path(stagePath) / "data").string();
            std::string dataPath = (fs::path(binPath) / "data").string();
            if (fs::exists(stageData) && !fs::exists(dataPath)) {
                fs::rename(stageData, dataPath);
            }
            
            // Verify marker
            std::string markerPath = (fs::path(binPath) / ".3mix.json").string();
            Json::Value marker = read_json(markerPath, Json::Value());
            if (marker["operationId"].asString() != opId) {
                log_operation("apply-failed-marker", id, {{"opId", opId}});
                remaining.append(op);
                continue;
            }
            
            fs::remove_all(stagePath);
            state["plugins"][id] = Json::Value();
            state["plugins"][id]["enabled"] = true;
            state["plugins"][id]["metadata"] = marker;
            log_operation("apply-" + action, id, {{"opId", opId}});
            
        } else if (action == "remove") {
            fs::create_directories(backupPath);
            if (fs::exists(binPath)) {
                fs::rename(binPath, (fs::path(backupPath) / "plugin").string());
            }
            state["plugins"][id] = Json::Value();
            state["plugins"][id]["enabled"] = false;
            log_operation("apply-remove", id, {{"opId", opId}});
            
        } else if (action == "rollback") {
            std::string oldPath = (fs::path(g_managedPath) / kBackupsDir / id / backup / "plugin").string();
            if (!fs::exists(oldPath)) {
                log_operation("apply-rollback-failed", id, {{"opId", opId}, {"backup", backup}});
                remaining.append(op);
                continue;
            }
            
            fs::create_directories(backupPath);
            if (fs::exists(binPath)) {
                fs::rename(binPath, (fs::path(backupPath) / "plugin").string());
            }
            fs::rename(oldPath, binPath);
            
            std::string markerPath = (fs::path(binPath) / ".3mix.json").string();
            Json::Value marker = read_json(markerPath, Json::Value());
            state["plugins"][id] = Json::Value();
            state["plugins"][id]["enabled"] = true;
            state["plugins"][id]["metadata"] = marker;
            log_operation("apply-rollback", id, {{"opId", opId}, {"backup", backup}});
        }
        
        state["plugins"][id]["appliedAt"] = std::to_string(os_gettime_ns());
    }
    
    write_state(state);
    write_queue(remaining);
    return true;
}

bool plugin_manager_init() {
    if (g_initialized) return true;
    
    // Get root path from libobs
    char* libobsPath = os_get_executable_path();
    if (!libobsPath) return false;
    
    fs::path root = fs::path(libobsPath).parent_path().parent_path();
    bfree(libobsPath);
    
    g_rootPath = root.string();
    g_managedPath = (root / kManagedDir).string();
    g_configPath = (root / kConfigDir).string();
    g_queuePath = (fs::path(g_configPath) / kQueueFile).string();
    g_reportPath = (fs::path(g_configPath) / kReportFile).string();
    g_logPath = (fs::path(g_configPath) / kLogFile).string();
    g_catalogPath = (root / kCatalogFile).string();
    
    // Create directories
    fs::create_directories(g_managedPath);
    fs::create_directories(g_configPath);
    
    // Apply pending operations on startup
    plugin_manager_apply_pending();
    
    // Register vendor request handler
    obs_register_vendor_request("3mix", "plugin_manager", [](void*, const char* type, obs_data_t* data) -> obs_data_t* {
        OBSDataAutoRelease result = handle_vendor_request(type, data);
        return result ? obs_data_get_ref(result) : nullptr;
    }, nullptr);
    
    g_initialized = true;
    return true;
}

void plugin_manager_shutdown() {
    if (!g_initialized) return;
    obs_unregister_vendor_request("3mix", "plugin_manager");
    g_initialized = false;
}

bool plugin_manager_load_report(Json::Value& report) {
    report = read_report();
    return !report.isNull();
}

void plugin_manager_get_plugins(Json::Value& plugins, const char* obsVersion) {
    plugins = Json::Value(Json::arrayValue);
    std::set<std::string> protectedIds = get_protected_ids();
    
    if (!fs::exists(g_managedPath)) return;
    
    Json::Value queue = read_queue();
    Json::Value state = read_state();
    Json::Value report = read_report();
    bool reportFresh = report["phase"].asString() == "complete";
    
    std::set<std::string> allIds;
    for (const auto& entry : fs::directory_iterator(g_managedPath)) {
        if (entry.is_directory()) {
            std::string id = entry.path().filename().string();
            std::transform(id.begin(), id.end(), id.begin(), ::tolower);
            if (is_valid_id(id) && !protectedIds.count(id)) {
                allIds.insert(id);
            }
        }
    }
    
    for (const auto& op : queue) {
        allIds.insert(op["id"].asString());
    }
    for (const auto& key : state["plugins"].getMemberNames()) {
        allIds.insert(key);
    }
    
    for (const auto& id : allIds) {
        if (protectedIds.count(id)) continue;
        
        std::string metadataPath = (fs::path(g_managedPath) / id / ".3mix.json").string();
        Json::Value metadata = read_json(metadataPath, Json::Value());
        
        Json::Value pending = Json::Value(Json::nullValue);
        for (const auto& op : queue) {
            if (op["id"].asString() == id) {
                pending = op;
                break;
            }
        }
        
        const Json::Value& item = state["plugins"][id];
        const Json::Value* loaded = nullptr;
        if (reportFresh && report["plugins"].isArray()) {
            for (const auto& m : report["plugins"]) {
                if (m["id"].asString() == id) {
                    loaded = &m;
                    break;
                }
            }
        }
        
        std::string stateName;
        if (!pending.isNull()) {
            stateName = "pending-" + pending["action"].asString();
        } else if (!item.isNull() && item["pendingAction"].isString()) {
            stateName = "pending-" + item["pendingAction"]["action"].asString();
        } else if (!fs::exists(get_managed_path(id))) {
            stateName = "removed";
        } else if (loaded && loaded->isObject() && loaded->isMember("status")) {
            stateName = loaded->get("status", "unknown").asString();
        } else if (item["enabled"].asBool() == false) {
            stateName = "disabled";
        } else {
            stateName = "unknown";
        }
        
        Json::Value plugin;
        plugin["id"] = id;
        plugin["name"] = metadata["name"].asString();
        plugin["version"] = metadata["version"].asString();
        plugin["developer"] = metadata["developer"].asString();
        plugin["description"] = metadata["description"].asString();
        plugin["state"] = stateName;
        plugin["managed"] = true;
        plugins.append(plugin);
    }
}

std::set<std::string> plugin_manager_get_protected_ids() {
    return get_protected_ids();
}

bool plugin_manager_inspect_compatibility(const char* zipPath, Json::Value& result) {
    // TODO: Implement ZIP inspection with PE validation
    result["staticCheck"] = "pending";
    result["nativeLoad"] = "pending";
    return true;
}

bool plugin_manager_install_plugin(const char* zipPath, const char* targetId, Json::Value& result) {
    // TODO: Implement plugin installation
    result["id"] = "";
    result["opId"] = "";
    return true;
}

bool plugin_manager_queue_operation(const char* action, const char* id, const char* stage, const char* backup, Json::Value& result) {
    // TODO: Implement operation queueing
    result["opId"] = generate_op_id();
    return true;
}

// OBS module entry points
extern "C" PLUGIN_MANAGER_EXPORT bool obs_module_load(void) {
    if (!plugin_manager_init()) return false;
    blog(LOG_INFO, "3Mix Plugin Manager loaded");
    return true;
}

extern "C" PLUGIN_MANAGER_EXPORT void obs_module_unload(void) {
    plugin_manager_shutdown();
    blog(LOG_INFO, "3Mix Plugin Manager unloaded");
}

extern "C" PLUGIN_MANAGER_EXPORT const char* obs_module_description(void) {
    return "3Mix Plugin Manager — Plugin lifecycle management with Safe Mode";
}

extern "C" PLUGIN_MANAGER_EXPORT const char* obs_module_author(void) {
    return "3Mix Team";
}

extern "C" PLUGIN_MANAGER_EXPORT const char* obs_module_version(void) {
    return "1.0.0";
}