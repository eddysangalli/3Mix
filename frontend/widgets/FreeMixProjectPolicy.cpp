#include "FreeMixProjectPolicy.hpp"
#include "OBSApp.hpp"
#include <obs-frontend-api.h>
#include <obs.hpp>
#include <util/config-file.h>
#include <string>
#include <set>
namespace {
struct ReloadState { bool safe = true; size_t count = 0; };
void FilterFound(obs_source_t *, obs_source_t *, void *param) { static_cast<ReloadState *>(param)->safe = false; }
bool InspectSource(void *param, obs_source_t *source)
{
 auto &state = *static_cast<ReloadState *>(param);
 if (++state.count > 1000) { state.safe = false; return false; }
 const char *raw = obs_source_get_id(source); if (!raw) { state.safe = false; return true; }
 const std::string kind = raw;
 const std::set<std::string> software = {"scene", "group", "color_source", "color_source_v2", "color_source_v3", "image_source", "text_gdiplus", "text_gdiplus_v2", "text_ft2_source", "text_ft2_source_v2", "mix-track-to-source", "freemix_audio_bus"};
 if (!software.count(kind)) {
  if (kind == "dshow_input") {
   OBSDataAutoRelease settings = obs_source_get_settings(source); // Read only; never apply properties to existing context.
   if (!settings || obs_data_get_bool(settings, "active")) state.safe = false;
  } else state.safe = false; // WASAPI, capture/network/media/unknown require a separate reload contract.
 }
 obs_source_enum_filters(source, FilterFound, &state); // Even known sources with automation filters are not presumed safe.
 return true;
}
}
bool FreeMixReadProjectCreationPolicy(obs_data_t *response)
{
 if (!response || !App()) return false;
 obs_data_set_string(response, "evidence", "native-creation-policy-read-only");
 auto *user = App()->GetUserConfig(); auto *profile = obs_frontend_get_profile_config();
 if (!user || !profile) { obs_data_set_bool(response, "success", false); return false; }
 const bool firstRun = config_get_bool(user, "General", "FirstRun");
 const auto sampleRate = config_get_uint(profile, "Audio", "SampleRate");
 const char *channels = config_get_string(profile, "Audio", "ChannelSetup"), *monitor = config_get_string(profile, "Audio", "MonitoringDeviceId");
 const char *runtimeMonitor = nullptr, *runtimeName = nullptr; obs_get_audio_monitoring_device(&runtimeName, &runtimeMonitor);
 obs_audio_info audio{}; const bool runtimeAudio = obs_get_audio_info(&audio);
 const bool audioCompatible = sampleRate == 48000 && channels && std::string(channels) == "Stereo" && runtimeAudio && audio.samples_per_sec == 48000 && audio.speakers == SPEAKERS_STEREO;
 const bool monitorCompatible = monitor && std::string(monitor) == "default" && runtimeMonitor && std::string(runtimeMonitor) == "default";
 ReloadState reload; obs_enum_sources(InspectSource, &reload);
 obs_data_set_bool(response, "firstRunCompleted", firstRun);
 obs_data_set_bool(response, "profileAudioDefaultsCompatible", audioCompatible);
 obs_data_set_bool(response, "monitoringDefaultsCompatible", monitorCompatible);
 obs_data_set_bool(response, "contextReloadSafe", reload.safe);
 obs_data_set_int(response, "sourceCount", (long long)reload.count);
 obs_data_set_bool(response, "success", true);
 return true; // No source creation, settings writes, audio reset, hardware activation or profile activation.
}
