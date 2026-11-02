#pragma once

#include "DecklinkBase.h"

#include <media-io/video-scaler.h>
#include "FreeMixDecklinkHdrContract.hpp"

class DeckLinkOutput : public DecklinkBase {
protected:
	obs_output_t *output;
	int width;
	int height;

	static void DevicesChanged(void *param, DeckLinkDevice *device, bool added);

public:
	const char *deviceHash;
	long long modeID;
	std::atomic<uint64_t> start_timestamp{0};
	uint32_t audio_samplerate;
	size_t audio_planes;
	size_t audio_size;
	int keyerMode;
	bool force_sdr;
	bool freemixHdr = false;
	freemix_decklink_hdr::Metadata hdrMetadata;

	DeckLinkOutput(obs_output_t *output, DeckLinkDeviceDiscovery *discovery);
	virtual ~DeckLinkOutput(void);
	obs_output_t *GetOutput(void) const;
	bool Activate(DeckLinkDevice *device, long long modeId) override;
	void Deactivate() override;
	void UpdateVideoFrame(video_data *pData);
	void WriteAudio(audio_data *frames);
	void SetSize(int width, int height);
	int GetWidth();
	int GetHeight();
};
