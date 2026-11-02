#pragma once

#define LOG(level, message, ...) blog(level, "%s: " message, "decklink", ##__VA_ARGS__)

#include <obs-module.h>
#include <media-io/video-scaler.h>
#include "decklink-device.hpp"
#include "OBSVideoFrame.h"
#include <atomic>
#include <vector>
#include <mutex>

class AudioRepacker;
class DecklinkBase;

template<typename T> class RenderDelegate : public IDeckLinkVideoOutputCallback {
private:
	std::atomic<unsigned long> m_refCount = 1;
	T *m_pOwner;

	~RenderDelegate();

public:
	RenderDelegate(T *pOwner);

	// IUnknown
	virtual HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid, LPVOID *ppv);
	virtual ULONG STDMETHODCALLTYPE AddRef();
	virtual ULONG STDMETHODCALLTYPE Release();

	// IDeckLinkVideoOutputCallback
	virtual HRESULT STDMETHODCALLTYPE ScheduledFrameCompleted(IDeckLinkVideoFrame *completedFrame,
								  BMDOutputFrameCompletionResult result);
	virtual HRESULT STDMETHODCALLTYPE ScheduledPlaybackHasStopped();
};

/*
Bounded SPSC ring; three reusable frame buffers, plus one sentinel slot.
The former node-cache queue exhausted its cache after three pushes. Indices
now wrap, a full queue returns false, and reset requires stopped producers.
Original queue reference and license retained below:
https://www.1024cores.net/home/lock-free-algorithms/queues/unbounded-spsc-queue
The license text has been copied below.
Copyright (c) 2010-2011 Dmitry Vyukov. All rights reserved.
Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:
   1. Redistributions of source code must retain the above copyright notice,
      this list of conditions and the following disclaimer.
   2. Redistributions in binary form must reproduce the above copyright notice,
      this list of conditions and the following disclaimer in the documentation
      and/or other materials provided with the distribution.
THIS SOFTWARE IS PROVIDED BY DMITRY VYUKOV "AS IS" AND ANY EXPRESS OR IMPLIED
WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT
SHALL DMITRY VYUKOV OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE
OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF
ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
The views and conclusions contained in the software and documentation are those
of the authors and should not be interpreted as representing official policies,
either expressed or implied, of Dmitry Vyukov.
*/
static constexpr size_t FrameQueueFrameCount = 3;
class FrameQueue {
private:
	static constexpr size_t Capacity = FrameQueueFrameCount + 1;
	uint8_t *frames[Capacity]{};
	alignas(128) std::atomic<size_t> readIndex{0};
	alignas(128) std::atomic<size_t> writeIndex{0};

public:
	FrameQueue() { reset(); }

	void reset()
	{
		readIndex.store(0, std::memory_order_relaxed);
		writeIndex.store(0, std::memory_order_relaxed);
	}

	bool push(uint8_t *v)
	{
		const auto write = writeIndex.load(std::memory_order_relaxed);
		const auto next = (write + 1) % Capacity;
		if (next == readIndex.load(std::memory_order_acquire)) return false;
		frames[write] = v;
		writeIndex.store(next, std::memory_order_release);
		return true;
	}

	uint8_t *pop()
	{
		const auto read = readIndex.load(std::memory_order_relaxed);
		if (read == writeIndex.load(std::memory_order_acquire)) return nullptr;
		auto *frame = frames[read];
		readIndex.store((read + 1) % Capacity, std::memory_order_release);
		return frame;
	}
};

class DeckLinkDeviceInstance : public IDeckLinkInputCallback {
protected:
	ComPtr<IDeckLinkConfiguration> deckLinkConfiguration;
	struct obs_source_frame2 currentFrame;
	struct obs_source_audio currentPacket;
	struct obs_source_cea_708 currentCaptions;
	DecklinkBase *decklink = nullptr;
	DeckLinkDevice *device = nullptr;
	DeckLinkDeviceMode *mode = nullptr;
	BMDVideoConnection videoConnection;
	BMDAudioConnection audioConnection;
	BMDDisplayMode displayMode = bmdModeNTSC;
	BMDPixelFormat pixelFormat = bmdFormat8BitYUV;
	video_colorspace colorSpace = VIDEO_CS_DEFAULT;
	video_colorspace activeColorSpace = VIDEO_CS_DEFAULT;
	video_range_type colorRange = VIDEO_RANGE_DEFAULT;
	ComPtr<IDeckLinkInput> input;
	ComPtr<IDeckLinkOutput> output;
	volatile long refCount = 1;
	int64_t audioOffset = 0;
	uint64_t nextAudioTS = 0;
	uint64_t lastVideoTS = 0;
	AudioRepacker *audioRepacker = nullptr;
	speaker_layout channelFormat = SPEAKERS_STEREO;
	bool swap;
	bool allow10Bit;

	OBSVideoFrame *convertFrame = nullptr;
	std::vector<uint8_t> frameBlobs[FrameQueueFrameCount];
	FrameQueue frameQueueObsToDecklink;
	FrameQueue frameQueueDecklinkToObs;
	uint8_t *activeBlob = nullptr;
	BMDTimeValue frameDuration;
	BMDTimeScale frameTimescale;
	BMDTimeScale totalFramesScheduled;
	ComPtr<RenderDelegate<DeckLinkDeviceInstance>> renderDelegate;
	std::mutex outputMutex;
	bool outputRunning = false;
	size_t outputRowBytes = 0;
	int64_t outputPrerollFrames = 0;

	void FinalizeStream();
	void SetupVideoFormat(DeckLinkDeviceMode *mode_);

	void HandleAudioPacket(IDeckLinkAudioInputPacket *audioPacket, const uint64_t timestamp);
	void HandleVideoFrame(IDeckLinkVideoInputFrame *videoFrame, const uint64_t timestamp);

public:
	DeckLinkDeviceInstance(DecklinkBase *decklink, DeckLinkDevice *device);
	virtual ~DeckLinkDeviceInstance();

	inline DeckLinkDevice *GetDevice() const { return device; }
	inline long long GetActiveModeId() const { return mode ? mode->GetId() : 0; }

	inline BMDPixelFormat GetActivePixelFormat() const { return pixelFormat; }
	inline video_colorspace GetActiveColorSpace() const { return colorSpace; }
	inline video_range_type GetActiveColorRange() const { return colorRange; }
	inline speaker_layout GetActiveChannelFormat() const { return channelFormat; }
	inline bool GetActiveSwapState() const { return swap; }
	inline BMDVideoConnection GetVideoConnection() const { return videoConnection; }
	inline BMDAudioConnection GetAudioConnection() const { return audioConnection; }

	inline DeckLinkDeviceMode *GetMode() const { return mode; }

	bool StartCapture(DeckLinkDeviceMode *mode, bool allow10Bit, BMDVideoConnection bmdVideoConnection,
			  BMDAudioConnection bmdAudioConnection);
	bool StopCapture(void);

	bool StartOutput(DeckLinkDeviceMode *mode_);
	bool StopOutput(void);

	HRESULT STDMETHODCALLTYPE VideoInputFrameArrived(IDeckLinkVideoInputFrame *videoFrame,
							 IDeckLinkAudioInputPacket *audioPacket);
	HRESULT STDMETHODCALLTYPE VideoInputFormatChanged(BMDVideoInputFormatChangedEvents events,
							  IDeckLinkDisplayMode *newMode,
							  BMDDetectedVideoInputFormatFlags detectedSignalFlags);

	ULONG STDMETHODCALLTYPE AddRef(void);
	HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid, LPVOID *ppv);
	ULONG STDMETHODCALLTYPE Release(void);

	void UpdateVideoFrame(video_data *frame);
	void ScheduleVideoFrame(IDeckLinkVideoFrame *frame);
	void WriteAudio(audio_data *frames);
	void HandleCaptionPacket(IDeckLinkAncillaryPacket *packet, const uint64_t timestamp);
};
