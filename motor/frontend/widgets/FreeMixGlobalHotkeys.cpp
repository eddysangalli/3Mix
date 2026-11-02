#include "FreeMixGlobalHotkeys.hpp"
#include "OBSBasic.hpp"
#include "../../plugins/obs-websocket/lib/obs-websocket-api.h"
#include <obs-frontend-api.h>
#include <obs-hotkey.h>
#include <obs-interaction.h>
#include <obs.hpp>
#include <QMetaObject>
#include <QString>
#include <atomic>
#include <memory>
#include <set>
#include <string>
#include <vector>

namespace {
struct Binding {
 std::string id, name, scope;
 obs_key_combination_t combo{};
 obs_hotkey_id nativeId = OBS_INVALID_HOTKEY_ID;
 bool pressed = false;
};
std::vector<std::unique_ptr<Binding>> bindings;
obs_websocket_vendor hotkeyVendor = nullptr;
std::string currentScope;
std::atomic_bool closing{false};

void Emit(Binding &binding, bool pressed)
{
 if (!hotkeyVendor || closing) return;
 OBSDataAutoRelease event = obs_data_create();
 obs_data_set_string(event, "id", binding.id.c_str());
 obs_data_set_string(event, "scope", binding.scope.c_str());
 obs_data_set_bool(event, "pressed", pressed);
 obs_websocket_vendor_emit_event(hotkeyVendor, "hotkey", event);
}
void Callback(void *data, obs_hotkey_id, obs_hotkey_t *, bool pressed)
{
 auto &binding = *static_cast<Binding *>(data);
 if (closing || binding.pressed == pressed) return;
 binding.pressed = pressed;
 Emit(binding, pressed);
}
void Clear()
{
 for (auto &binding : bindings) {
  if (binding->pressed) Emit(*binding, false);
  obs_hotkey_unregister(binding->nativeId);
 }
 bindings.clear(); currentScope.clear();
}
obs_key_t ParseKey(const std::string &code)
{
 std::string name;
 if (code.size() == 4 && code.rfind("Key", 0) == 0 && code[3] >= 'A' && code[3] <= 'Z') name = code.substr(3);
 else if (code.size() == 6 && code.rfind("Digit", 0) == 0 && code[5] >= '0' && code[5] <= '9') name = code.substr(5);
 else if (code.rfind("Numpad", 0) == 0 && code.size() == 7 && code[6] >= '0' && code[6] <= '9') name = "NUM" + code.substr(6);
 else if (code.size() <= 3 && code[0] == 'F') {
  bool digits = code.size() > 1; for (size_t i = 1; i < code.size(); i++) digits = digits && code[i] >= '0' && code[i] <= '9';
  if (digits) { const int n = std::stoi(code.substr(1)); if (n >= 1 && n <= 24) name = code; }
 } else if (code == "Space") name = "SPACE";
 else if (code == "Enter") name = "RETURN";
 else if (code == "Escape") name = "ESCAPE";
 else if (code == "ArrowUp") name = "UP";
 else if (code == "ArrowDown") name = "DOWN";
 else if (code == "ArrowLeft") name = "LEFT";
 else if (code == "ArrowRight") name = "RIGHT";
 return name.empty() ? OBS_KEY_NONE : obs_key_from_name(("OBS_KEY_" + name).c_str());
}
void Status(obs_data_t *response)
{
 OBSDataArrayAutoRelease entries = obs_data_array_create();
 for (auto &binding : bindings) {
  OBSDataAutoRelease entry = obs_data_create();
  obs_data_set_string(entry, "id", binding->id.c_str());
  obs_data_set_string(entry, "name", binding->name.c_str());
  obs_data_set_bool(entry, "pressed", binding->pressed);
  obs_data_set_bool(entry, "registered", binding->nativeId != OBS_INVALID_HOTKEY_ID);
  obs_data_array_push_back(entries, entry);
 }
 obs_data_set_array(response, "bindings", entries);
 obs_data_set_string(response, "scope", currentScope.c_str());
 obs_data_set_bool(response, "global", true);
 obs_data_set_bool(response, "success", true);
}
void Request(obs_data_t *request, obs_data_t *response, void *)
{
 if (closing) { obs_data_set_bool(response, "success", false); return; }
 QMetaObject::invokeMethod(OBSBasic::Get(), [request, response]() {
  const std::string action = obs_data_get_string(request, "action");
  if (action == "status") { Status(response); return; }
  if (action == "clear") { Clear(); Status(response); return; }
  if (action != "configure") { obs_data_set_bool(response, "success", false); obs_data_set_string(response, "error", "invalid hotkey command"); return; }
  const std::string scope = obs_data_get_string(request, "scope");
  OBSDataArrayAutoRelease array = obs_data_get_array(request, "bindings");
  const size_t count = array ? obs_data_array_count(array) : 0;
  std::vector<std::unique_ptr<Binding>> next; std::set<std::string> ids; std::set<std::pair<uint32_t, obs_key_t>> combinations;
  bool valid = !scope.empty() && scope.size() <= 200 && count <= 200;
  for (size_t i = 0; valid && i < count; i++) {
   OBSDataAutoRelease data = obs_data_array_item(array, i);
   auto binding = std::make_unique<Binding>(); binding->id = obs_data_get_string(data, "id"); binding->name = obs_data_get_string(data, "name"); binding->scope = scope;
   const std::string code = obs_data_get_string(data, "code");
   if (code.empty()) { valid = false; break; }
   binding->combo.key = ParseKey(code);
   binding->combo.modifiers = (obs_data_get_bool(data,"ctrl") ? INTERACT_CONTROL_KEY : 0) | (obs_data_get_bool(data,"alt") ? INTERACT_ALT_KEY : 0) | (obs_data_get_bool(data,"shift") ? INTERACT_SHIFT_KEY : 0) | (obs_data_get_bool(data,"meta") ? INTERACT_COMMAND_KEY : 0);
   valid = !binding->id.empty() && binding->id.size() <= 100 && !binding->name.empty() && binding->name.size() <= 300 && binding->combo.key != OBS_KEY_NONE && ids.insert(binding->id).second && combinations.insert({binding->combo.modifiers,binding->combo.key}).second;
   if (valid) next.push_back(std::move(binding));
  }
  if (!valid) { obs_data_set_bool(response, "success", false); obs_data_set_string(response, "error", "invalid or duplicate global hotkey"); return; }
  Clear(); currentScope = scope;
  for (auto &binding : next) {
   const std::string name = "FreeMix.Global." + binding->id;
   binding->nativeId = obs_hotkey_register_frontend(name.c_str(), binding->name.c_str(), Callback, binding.get());
   if (binding->nativeId == OBS_INVALID_HOTKEY_ID) { for(auto &registered:next)if(registered->nativeId!=OBS_INVALID_HOTKEY_ID)obs_hotkey_unregister(registered->nativeId);currentScope.clear();obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","could not register global hotkey");return; }
   obs_hotkey_load_bindings(binding->nativeId, &binding->combo, 1);
  }
  bindings = std::move(next); Status(response);
 }, Qt::BlockingQueuedConnection);
}
void FrontendEvent(enum obs_frontend_event event, void *)
{
 if (event == OBS_FRONTEND_EVENT_SCENE_COLLECTION_CHANGING || event == OBS_FRONTEND_EVENT_PROFILE_CHANGING) Clear();
 if (event == OBS_FRONTEND_EVENT_SCENE_COLLECTION_CHANGED || event == OBS_FRONTEND_EVENT_PROFILE_CHANGED) {
  OBSDataAutoRelease data = obs_data_create();
  obs_websocket_vendor_emit_event(hotkeyVendor, "bindings_reset", data);
 }
 if (event == OBS_FRONTEND_EVENT_EXIT) { Clear(); closing = true; }
}
}
void FreeMixGlobalHotkeysInit()
{
 if (hotkeyVendor) return;
 hotkeyVendor = obs_websocket_register_vendor("freemix-hotkeys");
 if (!hotkeyVendor) return;
 obs_websocket_vendor_register_request(hotkeyVendor, "control", Request, nullptr);
 obs_frontend_add_event_callback(FrontendEvent, nullptr);
}
