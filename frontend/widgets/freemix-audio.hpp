/******************************************************************************
    3Mix Pro — Bounded PCM history for independent destination encoders.
    These types are used by Multi-M/E, SRT HDR, and multistream outputs.

    This header is internal to the 3Mix frontend widgets and should not be
    included by libobs or other plugins directly.
******************************************************************************/

#pragma once

#include <obs.hpp>
#include <obs-frontend-api.h>
#include <util/platform.h>
#include <mutex>
#include <deque>
#include <vector>
#include <memory>
#include <algorithm>
#include <cstdint>
#include <cmath>

/* Bounded PCM history for independent destination encoders.
 * Used by Multi-M/E (Mix 2-4), SRT HDR outputs, and multistream destinations.
 * Nothing in this path writes to an OBS bus, monitor, virtual device or Call return.
 */
struct MixAudioPacket {
	uint64_t timestamp = 0;
	uint32_t frames = 0;
	std::vector<float> pcm;
};

struct MixAudioTape {
	std::mutex mutex;
	std::deque<MixAudioPacket> packets;
	uint32_t rate = 48000, channels = 2;
	int64_t offset = 0;
	uint64_t lastTimestamp = 0;
	bool clockStarted = false;
	uint64_t capturedPackets = 0;
	float capturedPeak = 0;
};

struct MixStingerTap {
	OBSSourceAutoRelease source;
	std::shared_ptr<MixAudioTape> tape;
};

/* Forward declaration — defined in FreeMixMultistream.cpp */
inline void StoreMixAudio(MixAudioTape &tape, const audio_data *data, float gain, bool alignClock);

/* Capture callback for stinger transition audio.
 * The source is our private clone, muted in every global bus.
 * Capture the pre-mute samples deliberately; never attach this callback to input scenes. */
inline void CaptureStingerAudio(void *param, obs_source_t *source, const audio_data *data, bool)
{
	auto *tap = static_cast<MixStingerTap *>(param);
	StoreMixAudio(*tap->tape, data, obs_source_get_volume(source), true);
}

/* Store audio data into the tape with optional clock alignment.
 * Defined inline here to avoid ODR issues across translation units. */
inline void StoreMixAudio(MixAudioTape &tape, const audio_data *data, float gain, bool alignClock)
{
	if (!data || !data->frames || data->frames > 8192) return;
	MixAudioPacket packet;
	packet.timestamp = data->timestamp;
	packet.frames = data->frames;
	packet.pcm.resize(size_t(data->frames) * tape.channels);
	for (uint32_t ch = 0; ch < tape.channels; ch++)
		for (uint32_t f = 0; f < data->frames; f++)
			packet.pcm[size_t(ch) * data->frames + f] = data->data[ch] ? reinterpret_cast<const float *>(data->data[ch])[f] * gain : 0.0f;
	std::lock_guard<std::mutex> lock(tape.mutex);
	++tape.capturedPackets;
	for (float sample : packet.pcm) tape.capturedPeak = std::max(tape.capturedPeak, std::abs(sample));
	if (alignClock) {
		const uint64_t now = os_gettime_ns(), duration = audio_frames_to_ns(tape.rate, data->frames);
		int64_t aligned = int64_t(data->timestamp) + tape.offset;
		if (!tape.clockStarted || data->timestamp < tape.lastTimestamp || aligned > int64_t(now) + 100000000LL || aligned < int64_t(now) - 750000000LL) {
			tape.offset = int64_t(now > duration ? now - duration : 0) - int64_t(data->timestamp);
			tape.clockStarted = true;
		}
		tape.lastTimestamp = data->timestamp;
		aligned = int64_t(data->timestamp) + tape.offset;
		packet.timestamp = uint64_t(std::max<int64_t>(0, aligned));
	}
	while (tape.packets.size() >= 96) tape.packets.pop_front();
	tape.packets.push_back(std::move(packet));
}