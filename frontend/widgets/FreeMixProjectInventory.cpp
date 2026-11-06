#include "FreeMixProjectInventory.hpp"
#include <obs.hpp>
#include <memory>
#include <string>
#include <vector>
#include <cstdio>
#include <stdexcept>

namespace {
using Properties = std::unique_ptr<obs_properties_t, decltype(&obs_properties_destroy)>;
struct Item { std::string id, label; bool disabled; };
std::vector<Item> Strings(obs_properties_t *props, const char *key, size_t bound)
{
 auto *p = props ? obs_properties_get(props, key) : nullptr;
 if (!p || obs_property_get_type(p) != OBS_PROPERTY_LIST || obs_property_list_format(p) != OBS_COMBO_FORMAT_STRING) return {};
 const size_t count = obs_property_list_item_count(p);
 if (count > bound) throw std::runtime_error("PROPERTY_LIMIT");
 std::vector<Item> rows;
 for (size_t i = 0; i < count; ++i) {
  const char *id = obs_property_list_item_string(p, i), *label = obs_property_list_item_name(p, i);
  if (!id || !*id || std::string(id) == "default") continue;
  if (std::string(id).size() > 4096 || !label || std::string(label).size() > 512) throw std::runtime_error("PROPERTY_STRING_LIMIT");
  rows.push_back({id, label, obs_property_list_item_disabled(p, i)});
 }
 return rows; // Copy before any callback changes property storage.
}
void Cameras(obs_data_t *response)
{
 Properties props(obs_get_source_properties("dshow_input"), obs_properties_destroy);
 OBSDataArrayAutoRelease cameras = obs_data_array_create();
 for (const auto &device : Strings(props.get(), "video_device_id", 64)) {
  OBSDataAutoRelease row = obs_data_create(); OBSDataArrayAutoRelease modes = obs_data_array_create();
  obs_data_set_string(row, "kind", "dshow_input"); obs_data_set_string(row, "stableId", device.id.c_str());
  obs_data_set_string(row, "label", device.label.c_str()); obs_data_set_bool(row, "disabled", device.disabled);
  if (!device.disabled) {
   OBSDataAutoRelease settings = obs_get_source_defaults("dshow_input");
   if (!settings) throw std::runtime_error("DSHOW_DEFAULTS_UNAVAILABLE");
   obs_data_set_bool(settings, "active", false); obs_data_set_int(settings, "res_type", 1);
   obs_data_set_string(settings, "video_device_id", device.id.c_str());
   obs_data_set_string(settings, "last_video_device_id", "");
   obs_properties_apply_settings(props.get(), settings); // Applies only our owned defaults, never source context settings.
   for (const auto &resolution : Strings(props.get(), "resolution", 256)) {
    int width = 0, height = 0; char extra = 0;
    if (resolution.disabled || std::sscanf(resolution.id.c_str(), "%dx%d%c", &width, &height, &extra) != 2 || width < 2 || height < 2 || width > 7680 || height > 7680) continue;
    obs_data_set_string(settings, "resolution", resolution.id.c_str()); obs_data_set_int(settings, "frame_interval", 0);
    obs_properties_apply_settings(props.get(), settings);
    auto *fps = obs_properties_get(props.get(), "frame_interval");
    if (!fps || obs_property_get_type(fps) != OBS_PROPERTY_LIST || obs_property_list_format(fps) != OBS_COMBO_FORMAT_INT) continue;
    if (obs_property_list_item_count(fps) > 256) throw std::runtime_error("FPS_LIMIT");
    for (size_t i = 0; i < obs_property_list_item_count(fps); ++i) {
     const auto interval = obs_property_list_item_int(fps, i);
     if (obs_property_list_item_disabled(fps, i) || interval < 41667 || interval > 10000000) continue; // No default/matching/highest pseudo-mode.
     if (obs_data_array_count(modes) >= 256) throw std::runtime_error("MODE_LIMIT");
     OBSDataAutoRelease mode = obs_data_create(); obs_data_set_int(mode, "width", width); obs_data_set_int(mode, "height", height);
     obs_data_set_int(mode, "frameInterval", interval); obs_data_array_push_back(modes, mode);
    }
   }
  }
  obs_data_set_array(row, "modes", modes); obs_data_array_push_back(cameras, row);
 }
 obs_data_set_array(response, "cameras", cameras);
}
}
bool FreeMixReadProjectDeviceInventory(obs_data_t *response)
{
 if (!response) return false;
 obs_data_set_string(response, "contract", "freemix-project-device-inventory-v1");
 obs_data_set_bool(response, "captureStarted", false); obs_data_set_bool(response, "existingSourceSettingsTouched", false);
 obs_data_set_bool(response, "driverMetadataMayOpen", true); obs_data_set_bool(response, "success", false);
 try {
  Cameras(response);
  Properties audioProps(obs_get_source_properties("wasapi_input_capture"), obs_properties_destroy);
  OBSDataArrayAutoRelease audio = obs_data_array_create();
  for (const auto &device : Strings(audioProps.get(), "device_id", 128)) {
   OBSDataAutoRelease row = obs_data_create(); obs_data_set_string(row, "kind", "wasapi_input_capture");
   obs_data_set_string(row, "stableId", device.id.c_str()); obs_data_set_string(row, "label", device.label.c_str());
   obs_data_set_bool(row, "disabled", device.disabled); obs_data_array_push_back(audio, row);
  }
  obs_data_set_array(response, "audio", audio);
  OBSDataArrayAutoRelease filters = obs_data_array_create(); const char *kind = nullptr;
  for (size_t i = 0; obs_enum_filter_types(i, &kind); ++i) {
   if (i >= 256) throw std::runtime_error("FILTER_LIMIT");
   OBSDataAutoRelease row = obs_data_create(); obs_data_set_string(row, "id", kind); obs_data_array_push_back(filters, row);
  }
  obs_data_set_array(response, "filterKindsNative", filters); // Host maps rows to filterKinds strings, never infer Speex.
  obs_data_set_bool(response, "success", true); return true;
 } catch (const std::exception &error) { obs_data_set_string(response, "error", error.what()); return false; }
}
