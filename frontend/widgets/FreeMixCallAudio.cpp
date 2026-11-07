/* FreeMix: bounded native PCM tap for independently mixed Call returns.
 * No tap writes to an OBS mix, monitor, recording, or virtual audio device.
 * Audio remains local until the controller explicitly starts a return publisher.
 * GPL-2.0-or-later, same license as the fork. */
#include "FreeMixCallAudio.hpp"
#include "FreeMixCallAudioClock.hpp"
#include <obs.hpp>
#include <obs-frontend-api.h>
#include <QByteArray>
#include <QCoreApplication>
#include <QMetaObject>
#include <util/platform.h>
#include <chrono>
#include <deque>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

namespace {
struct Packet {
 std::string uuid;
 uint64_t timestamp;
 uint32_t frames, rate;
 uint32_t channels;
 QByteArray pcm;
 std::string lease;
 uint64_t generation = 0, privacyGeneration = 0, clockEpoch = 0, sourceTimestamp = 0, capturedAt = 0;
 int64_t timestampOffset = 0;
 uint32_t anchorReason = 0;
};
struct Tap {
 obs_source_t *source = nullptr;
 std::string uuid;
 size_t channels = 0;
 uint32_t rate = 0;
 freemix_call_audio::Clock clock;
 uint64_t generation = 0;
};
std::mutex queueMutex;
std::deque<Packet> packets;
std::vector<std::unique_ptr<Tap>> taps;
size_t queuedBytes = 0;
uint64_t dropped = 0, clockFaults = 0;
freemix_call_audio::Epoch captureGeneration, privacyGeneration;
std::string privateUuid, privateLease;
std::chrono::steady_clock::time_point deadline;

void Capture(void *param, obs_source_t *source, const struct audio_data *audio, bool muted)
{
 auto *tap = static_cast<Tap *>(param);
 if (muted || !audio || !audio->frames || audio->frames > 8192) return;
 freemix_call_audio::CaptureIdentity identity;
 {
  std::lock_guard<std::mutex> lock(queueMutex);
  identity = {captureGeneration.value, privacyGeneration.value};
  if (!identity.Matches(captureGeneration, privacyGeneration, tap->generation)) return;
 }
 const float gain = obs_source_get_volume(source);
 if (!(gain > 0)) return;
 Packet p{tap->uuid, audio->timestamp, audio->frames, tap->rate, uint32_t(tap->channels), {}, {}};
 p.pcm.resize(int(audio->frames * tap->channels * sizeof(float)));
 auto *out = reinterpret_cast<float *>(p.pcm.data());
 for (size_t frame = 0; frame < audio->frames; frame++)
  for (size_t ch = 0; ch < tap->channels; ch++)
   out[frame * tap->channels + ch] = audio->data[ch] ? reinterpret_cast<const float *>(audio->data[ch])[frame] * gain : 0;
 std::lock_guard<std::mutex> lock(queueMutex);
 // Discard PCM copied across a stop/configure or Director lease/privacy change.
 if (!identity.Matches(captureGeneration, privacyGeneration, tap->generation)) return;
 // Browser and file sources can use epoch and monotonic clocks respectively.
 // Keep each source's sample spacing, anchored to a common monotonic clock.
 const uint64_t now = os_gettime_ns();
 if (captureGeneration.exhausted || privacyGeneration.exhausted || tap->generation != captureGeneration.value ||
     !tap->clock.Align(audio->timestamp, now, audio->frames, tap->rate, p.timestamp, p.anchorReason)) {
  if (clockFaults != UINT64_MAX) ++clockFaults;
  return;
 }
 p.generation = captureGeneration.value; p.privacyGeneration = privacyGeneration.value;
 p.clockEpoch = tap->clock.epoch; p.sourceTimestamp = audio->timestamp;
 p.capturedAt = now; p.timestampOffset = tap->clock.offset;
 if (p.uuid == privateUuid) {
  if (privateLease.empty()) return;
  p.lease = privateLease;
 }
 constexpr size_t limit = 4 * 1024 * 1024;
 while (!packets.empty() && queuedBytes + size_t(p.pcm.size()) > limit) {
  queuedBytes -= size_t(packets.front().pcm.size()); packets.pop_front(); dropped++;
 }
 queuedBytes += size_t(p.pcm.size()); packets.push_back(std::move(p));
}
void Stop()
{
 for (auto &tap : taps) {
  obs_source_remove_audio_capture_callback(tap->source, Capture, tap.get());
  obs_source_release(tap->source);
 }
 taps.clear();
 std::lock_guard<std::mutex> lock(queueMutex);
 packets.clear(); queuedBytes = 0;
 captureGeneration.Advance();
}
obs_data_t *ClockSnapshot(bool drain) // caller holds queueMutex; packet swap and tap epochs share this instant
{
 obs_data_t *clock = obs_data_create();
 obs_data_set_int(clock, "schema", 1);
 obs_data_set_string(clock, "domain", "obs-monotonic-callback-anchored");
 obs_data_set_bool(clock, "sourceTimingCertified", false);
 obs_data_set_string(clock, "snapshotMonotonicNs", std::to_string(os_gettime_ns()).c_str());
 obs_data_set_bool(clock, "drainSnapshot", drain);
 obs_data_set_string(clock, "generation", std::to_string(captureGeneration.value).c_str());
 obs_data_set_string(clock, "privacyGeneration", std::to_string(privacyGeneration.value).c_str());
 obs_data_set_bool(clock, "generationExhausted", captureGeneration.exhausted || privacyGeneration.exhausted);
 obs_data_set_string(clock, "faults", std::to_string(clockFaults).c_str());
 obs_data_set_string(clock, "dropped", std::to_string(dropped).c_str());
 OBSDataArrayAutoRelease rows = obs_data_array_create();
 for (const auto &tap : taps) {
  OBSDataAutoRelease row = obs_data_create();
  obs_data_set_string(row, "uuid", tap->uuid.c_str());
  obs_data_set_string(row, "generation", std::to_string(tap->generation).c_str());
  obs_data_set_string(row, "epoch", std::to_string(tap->clock.epoch).c_str());
  obs_data_set_bool(row, "started", tap->clock.started);
  obs_data_set_bool(row, "exhausted", tap->clock.exhausted);
  obs_data_set_string(row, "sourceTimestampNs", std::to_string(tap->clock.lastRaw).c_str());
  obs_data_set_string(row, "alignedTimestampNs", std::to_string(tap->clock.lastAligned).c_str());
  obs_data_set_string(row, "timestampOffsetNs", std::to_string(tap->clock.offset).c_str());
  obs_data_set_int(row, "lastAnchorReason", tap->clock.lastAnchorReason);
  obs_data_set_int(row, "rate", tap->rate); obs_data_set_int(row, "channels", tap->channels);
  obs_data_array_push_back(rows, row);
 }
 obs_data_set_array(clock, "taps", rows);
 return clock;
}
}
void FreeMixCallAudioStop()
{
 Stop();
}
void FreeMixCallAudioTick()
{
 if (!taps.empty() && std::chrono::steady_clock::now() > deadline) Stop();
}
void FreeMixCallAudioDirector(const char *uuid, const char *lease)
{
 std::lock_guard<std::mutex> lock(queueMutex);
 const std::string nextUuid = uuid ? uuid : "", nextLease = lease ? lease : "";
 if (nextUuid == privateUuid && nextLease == privateLease) return;
 packets.clear(); queuedBytes = 0;
 privateUuid = nextUuid; privateLease = nextLease;
 privacyGeneration.Advance();
}
void FreeMixCallAudioRequest(obs_data_t *request, obs_data_t *response, void *)
{
 const std::string action = obs_data_get_string(request, "action");
 const bool includeClock = obs_data_get_bool(request, "includeClock");
 QMetaObject::invokeMethod(qApp, [request, response, action, includeClock]() {
  bool success = true;
  OBSDataAutoRelease clock;
  if (action == "configure") {
   OBSDataArrayAutoRelease sources = obs_data_get_array(request, "sources");
   struct obs_audio_info info;
   std::vector<std::unique_ptr<Tap>> next;
   if (!sources || obs_data_array_count(sources) > 32 || !obs_get_audio_info(&info) ||
       info.samples_per_sec < 8000 || info.samples_per_sec > 192000 ||
       get_audio_channels(info.speakers) < 1 || get_audio_channels(info.speakers) > 8) success = false;
   else for (size_t i = 0; i < obs_data_array_count(sources); i++) {
    OBSDataAutoRelease row = obs_data_array_item(sources, i);
    const std::string uuid = obs_data_get_string(row, "uuid");
    obs_source_t *source = obs_get_source_by_uuid(uuid.c_str());
    if (!source || !(obs_source_get_output_flags(source) & OBS_SOURCE_AUDIO) ||
        (obs_source_get_output_flags(source) & OBS_SOURCE_COMPOSITE)) {
     if (source) obs_source_release(source);
     success = false; break;
    }
    auto tap = std::make_unique<Tap>();
    tap->source = source; tap->uuid = uuid;
    tap->rate = info.samples_per_sec;
    tap->channels = get_audio_channels(info.speakers);
    next.push_back(std::move(tap));
   }
   if (!success) {
    for (auto &tap : next) obs_source_release(tap->source);
   } else {
    Stop();
    bool generationReady;
    uint64_t generation;
    { std::lock_guard<std::mutex> lock(queueMutex); generationReady = !captureGeneration.exhausted && !privacyGeneration.exhausted; generation = captureGeneration.value; }
    if (!generationReady) {
     for (auto &tap : next) obs_source_release(tap->source);
     success = false;
    } else {
     taps = std::move(next);
     for (auto &tap : taps) {
      tap->generation = generation;
      obs_source_add_audio_capture_callback(tap->source, Capture, tap.get());
     }
     deadline = std::chrono::steady_clock::now() + std::chrono::seconds(3);
    }
   }
  } else if (action == "stop") Stop();
  else if (action == "drain") {
   deadline = std::chrono::steady_clock::now() + std::chrono::seconds(3);
   OBSDataArrayAutoRelease list = obs_data_array_create();
   std::deque<Packet> batch;
   {
    std::lock_guard<std::mutex> lock(queueMutex);
    batch.swap(packets); queuedBytes = 0;
    if (includeClock) clock = ClockSnapshot(true);
   }
   for (auto &p : batch) {
    OBSDataAutoRelease row = obs_data_create();
    obs_data_set_string(row, "uuid", p.uuid.c_str());
    obs_data_set_string(row, "timestamp", std::to_string(p.timestamp).c_str());
    obs_data_set_int(row, "frames", p.frames);
    obs_data_set_int(row, "rate", p.rate);
    obs_data_set_int(row, "channels", p.channels);
    obs_data_set_string(row, "pcm", p.pcm.toBase64().constData());
    obs_data_set_string(row, "lease", p.lease.c_str());
    if (includeClock) {
     obs_data_set_string(row, "generation", std::to_string(p.generation).c_str());
     obs_data_set_string(row, "privacyGeneration", std::to_string(p.privacyGeneration).c_str());
     obs_data_set_string(row, "clockEpoch", std::to_string(p.clockEpoch).c_str());
     obs_data_set_string(row, "sourceTimestampNs", std::to_string(p.sourceTimestamp).c_str());
     obs_data_set_string(row, "captureMonotonicNs", std::to_string(p.capturedAt).c_str());
     obs_data_set_string(row, "timestampOffsetNs", std::to_string(p.timestampOffset).c_str());
     obs_data_set_int(row, "anchorReason", p.anchorReason);
    }
    obs_data_array_push_back(list, row);
   }
   obs_data_set_array(response, "packets", list);
  } else if (action == "watchdog") {
   if (!taps.empty() && std::chrono::steady_clock::now() > deadline) Stop();
  } else if (action != "state") success = false;
  if (includeClock) {
   if (!clock) { std::lock_guard<std::mutex> lock(queueMutex); clock = ClockSnapshot(false); }
   obs_data_set_string(clock, "serializedMonotonicNs", std::to_string(os_gettime_ns()).c_str());
   obs_data_set_obj(response, "clock", clock);
  }
  obs_data_set_int(response, "sources", taps.size());
  obs_data_set_int(response, "dropped", dropped);
  obs_data_set_bool(response, "success", success);
 }, Qt::BlockingQueuedConnection);
}
