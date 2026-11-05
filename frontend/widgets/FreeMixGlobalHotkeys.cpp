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

void Scope(const std::string &scope)
{
 if (currentScope == scope) return;
 if (!currentScope.empty()) {
  for (auto &b : bindings) {
   if (binding->scope == currentScope) obs_hotkey_unregister(binding->nativeId);
  }
 }
 currentScope = scope;
}
void Register(const std::string &id, const std::string &name, const std::string &scope, obs_key_combination_t combo)
{
 auto b = std::make_unique<Binding>();
 b->id = id; b->name = name; b->scope = scope; b->combo = combo;
 b->nativeId = obs_hotkey_register_frontend(id.c_str(), name.c_str(), Callback, b.get());
 bindings.push_back(std::move(b));
}
void Load()
{
 if (hotkeyVendor) return;
 obs_websocket_vendor_register(&hotkeyVendor, "3mix-hotkeys", [](void *, const char *type, obs_data_t *data) {
  if (std::string(type) == "hotkey") {
   const char *id = obs_data_get_string(data, "id");
   const char *scope = obs_data_get_string(data, "scope");
   bool pressed = obs_data_get_bool(data, "pressed");
   for (auto &b : bindings) {
    if (b->id == id && b->scope == scope) {
     b->pressed = pressed;
     break;
    }
   }
 });
}
void FreeMixGlobalHotkeysInit()
{
 Load();
}