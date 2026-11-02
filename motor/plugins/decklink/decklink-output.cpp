#include <obs-module.h>
#include <obs.hpp>
#include <obs-avc.h>

#include "const.h"

#include "DecklinkOutput.hpp"
#include "decklink-device.hpp"
#include "decklink-device-discovery.hpp"
#include "decklink-devices.hpp"

#include <media-io/video-scaler.h>
#include <util/util_uint64.h>
#include <callback/proc.h>

static freemix_decklink_hdr::Metadata freemix_hdr_metadata(obs_data_t *settings)
{
 using namespace freemix_decklink_hdr;
 Metadata m;m.transfer=Parse(obs_data_get_string(settings,"hdr_transfer"));
 OBSDataAutoRelease data=obs_data_get_obj(settings,"hdr_metadata");
 if(!data)return m;
 m.confirmed=obs_data_get_bool(data,"confirmed");
 m.redX=obs_data_get_double(data,"redX");m.redY=obs_data_get_double(data,"redY");
 m.greenX=obs_data_get_double(data,"greenX");m.greenY=obs_data_get_double(data,"greenY");
 m.blueX=obs_data_get_double(data,"blueX");m.blueY=obs_data_get_double(data,"blueY");
 m.whiteX=obs_data_get_double(data,"whiteX");m.whiteY=obs_data_get_double(data,"whiteY");
 m.maxMastering=obs_data_get_double(data,"maxMastering");m.minMastering=obs_data_get_double(data,"minMastering");
 m.maxContent=obs_data_get_double(data,"maxContent");m.maxAverage=obs_data_get_double(data,"maxAverage");return m;
}

static std::string freemix_hdr_driver_preflight(DeckLinkDevice *device, DeckLinkDeviceMode *mode,
 const freemix_decklink_hdr::Metadata &metadata,int keyer,obs_data_t *response=nullptr)
{
 using namespace freemix_decklink_hdr;
 if(!device||!mode)return "DeckLink device/mode unavailable";
 Capabilities c;c.hdrMetadata=device->GetSupportsHDRMetadata();c.colorspaceMetadata=device->GetSupportsColorspaceMetadata();
 const auto ranges=device->GetSupportedDynamicRange();c.pq=(ranges&bmdDynamicRangeHDRStaticPQ)!=0;c.hlg=(ranges&bmdDynamicRangeHDRStaticHLG)!=0;
 c.rec2020Mode=(mode->GetDisplayModeFlags()&bmdDisplayModeColorspaceRec2020)!=0;
 ComPtr<IDeckLinkConfiguration> configuration;int64_t connection=0;
 c.sdiConnection=(device->GetVideoOutputConnections()&bmdVideoConnectionSDI)!=0&&device->GetConfiguration(&configuration)&&
  configuration->GetInt(bmdDeckLinkConfigVideoOutputConnection,&connection)==S_OK&&(connection&bmdVideoConnectionSDI)!=0;
 ComPtr<IDeckLinkOutput> output;BMDDisplayMode actual=bmdModeUnknown;decklink_bool_t supported=false;
 if(device->GetOutput(&output)&&output->DoesSupportVideoMode(bmdVideoConnectionSDI,mode->GetDisplayMode(),bmdFormat10BitRGBXLE,
  bmdNoVideoOutputConversion,bmdSupportedVideoModeDefault,&actual,&supported)==S_OK){c.tenBitRgbMode=!!supported;c.exactMode=actual==mode->GetDisplayMode();}
 if(response){
  obs_data_set_bool(response,"hdrMetadata",c.hdrMetadata);obs_data_set_bool(response,"colorspaceMetadata",c.colorspaceMetadata);
  obs_data_set_bool(response,"pqSupported",c.pq);obs_data_set_bool(response,"hlgSupported",c.hlg);obs_data_set_bool(response,"rec2020Mode",c.rec2020Mode);
  obs_data_set_bool(response,"tenBitRgbMode",c.tenBitRgbMode);obs_data_set_bool(response,"exactMode",c.exactMode);obs_data_set_bool(response,"configuredSdiConnection",c.sdiConnection);
  obs_data_set_int(response,"width",mode->GetWidth());obs_data_set_int(response,"height",mode->GetHeight());BMDTimeValue duration=0;BMDTimeScale scale=0;
  if(mode->GetFrameRate(&duration,&scale)){obs_data_set_int(response,"fpsNum",scale);obs_data_set_int(response,"fpsDen",duration);}
 }
 return Preflight(metadata,c,true,false,keyer);
}

static void freemix_hdr_query(void *,calldata_t *call)
{
 auto *settings=static_cast<obs_data_t*>(calldata_ptr(call,"config"));auto *response=static_cast<obs_data_t*>(calldata_ptr(call,"response"));
 if(!response)return;obs_data_set_int(response,"contractVersion",1);
 if(!settings){obs_data_set_bool(response,"success",false);obs_data_set_string(response,"error","SDI HDR settings missing");return;}
 ComPtr<DeckLinkDevice> device;device.Set(deviceEnum->FindByHash(obs_data_get_string(settings,DEVICE_HASH)));
 auto *mode=device?device->FindOutputMode(obs_data_get_int(settings,MODE_ID)):nullptr;
 const auto error=freemix_hdr_driver_preflight(device.Get(),mode,freemix_hdr_metadata(settings),int(obs_data_get_int(settings,KEYER)),response);
 obs_data_set_bool(response,"success",error.empty());if(!error.empty())obs_data_set_string(response,"error",error.c_str());
}

static void decklink_output_destroy(void *data)
{
	auto *decklink = (DeckLinkOutput *)data;
	delete decklink;
}

static void *decklink_output_create(obs_data_t *settings, obs_output_t *output)
{
	auto *decklinkOutput = new DeckLinkOutput(output, deviceEnum);

	decklinkOutput->deviceHash = obs_data_get_string(settings, DEVICE_HASH);
	decklinkOutput->modeID = obs_data_get_int(settings, MODE_ID);
	decklinkOutput->keyerMode = (int)obs_data_get_int(settings, KEYER);
	decklinkOutput->force_sdr = obs_data_get_bool(settings, FORCE_SDR);
	decklinkOutput->freemixHdr = obs_data_get_bool(settings,"freemix_hdr");
	decklinkOutput->hdrMetadata = freemix_hdr_metadata(settings);

	ComPtr<DeckLinkDevice> device;
	device.Set(deviceEnum->FindByHash(decklinkOutput->deviceHash));
	if (device) {
		DeckLinkDeviceMode *mode = device->FindOutputMode(decklinkOutput->modeID);
		if (!mode) return decklinkOutput;

		struct video_scale_info to = {};
		to.format = VIDEO_FORMAT_BGRA;
		to.width = mode->GetWidth();
		to.height = mode->GetHeight();
		to.range = VIDEO_RANGE_FULL;
		to.colorspace = (device->GetSupportsHDRMetadata() && !decklinkOutput->force_sdr) ? VIDEO_CS_2100_PQ
												 : VIDEO_CS_709;
		if(decklinkOutput->freemixHdr){to.format=VIDEO_FORMAT_P416;to.range=VIDEO_RANGE_PARTIAL;
		 to.colorspace=decklinkOutput->hdrMetadata.transfer==freemix_decklink_hdr::Transfer::Hlg?VIDEO_CS_2100_HLG:VIDEO_CS_2100_PQ;}

		obs_output_set_video_conversion(output, &to);
	}

	return decklinkOutput;
}

static void decklink_output_update(void *data, obs_data_t *settings)
{
	auto *decklink = (DeckLinkOutput *)data;

	decklink->deviceHash = obs_data_get_string(settings, DEVICE_HASH);
	decklink->modeID = obs_data_get_int(settings, MODE_ID);
	decklink->keyerMode = (int)obs_data_get_int(settings, KEYER);
	decklink->force_sdr = obs_data_get_bool(settings, FORCE_SDR);
	decklink->freemixHdr=obs_data_get_bool(settings,"freemix_hdr");decklink->hdrMetadata=freemix_hdr_metadata(settings);
}

static bool decklink_output_start(void *data)
{
	auto *decklink = (DeckLinkOutput *)data;
	struct obs_audio_info aoi;

	if (!obs_get_audio_info(&aoi)) {
		blog(LOG_WARNING, "No active audio");
		return false;
	}

	if (!decklink->deviceHash || !*decklink->deviceHash) {
		return false;
	}

	// Raw callback receives the explicit conversion below: interleaved stereo48k.
	decklink->audio_samplerate = 48000;
	decklink->audio_planes = 1;
	decklink->audio_size = get_audio_size(AUDIO_FORMAT_16BIT, SPEAKERS_STEREO, 1);

	decklink->start_timestamp = 0;

	ComPtr<DeckLinkDevice> device;

	device.Set(deviceEnum->FindByHash(decklink->deviceHash));

	if (!device) {
		return false;
	}

	DeckLinkDeviceMode *mode = device->FindOutputMode(decklink->modeID);
	if (!mode) return false;
	if(decklink->freemixHdr){
	 const auto error=freemix_hdr_driver_preflight(device.Get(),mode,decklink->hdrMetadata,decklink->keyerMode);
	 if(!error.empty()){obs_output_set_last_error(decklink->GetOutput(),error.c_str());return false;}
	 const auto *v=video_output_get_info(obs_output_video(decklink->GetOutput()));
	 const auto cs=decklink->hdrMetadata.transfer==freemix_decklink_hdr::Transfer::Hlg?VIDEO_CS_2100_HLG:VIDEO_CS_2100_PQ;
	 if(!v||v->format!=VIDEO_FORMAT_P416||v->colorspace!=cs||v->range!=VIDEO_RANGE_PARTIAL||v->width!=uint32_t(mode->GetWidth())||v->height!=uint32_t(mode->GetHeight())||!mode->IsEqualFrameRate(v->fps_num,v->fps_den)){
	  obs_output_set_last_error(decklink->GetOutput(),"SDI HDR requires independent P416 limited-range PQ/HLG view matching device dimensions/FPS");return false;}
	}

	struct obs_video_info ovi;
	if (!obs_get_video_info(&ovi)) {
		LOG(LOG_ERROR, "Start failed: could not retrieve obs_video_info!");
		return false;
	}

	if (!decklink->freemixHdr && !mode->IsEqualFrameRate(ovi.fps_num, ovi.fps_den)) {
		LOG(LOG_ERROR, "Start failed: FPS mismatch!");
		return false;
	}

	decklink->SetSize(mode->GetWidth(), mode->GetHeight());

	device->SetKeyerMode(decklink->keyerMode);

	if (!decklink->Activate(device, decklink->modeID)) {
		return false;
	}

	struct audio_convert_info conversion = {};
	conversion.format = AUDIO_FORMAT_16BIT;
	conversion.speakers = SPEAKERS_STEREO;
	conversion.samples_per_sec = 48000; // Only format the decklink supports

	obs_output_set_audio_conversion(decklink->GetOutput(), &conversion);

	if (!obs_output_begin_data_capture(decklink->GetOutput(), 0)) {
		decklink->Deactivate();
		return false;
	}

	return true;
}

static void decklink_output_stop(void *data, uint64_t)
{
	auto *decklink = (DeckLinkOutput *)data;

	obs_output_end_data_capture(decklink->GetOutput());

	decklink->Deactivate();
}

static void decklink_output_raw_video(void *data, struct video_data *frame)
{
	auto *decklink = (DeckLinkOutput *)data;

	if (!decklink->start_timestamp) {
		decklink->start_timestamp = frame->timestamp;
	}

	decklink->UpdateVideoFrame(frame);
}

static bool prepare_audio(DeckLinkOutput *decklink, const struct audio_data *frame, struct audio_data *output)
{
	*output = *frame;

	if (frame->timestamp < decklink->start_timestamp) {
		uint64_t duration = util_mul_div64(frame->frames, 1000000000ULL, decklink->audio_samplerate);
		uint64_t end_ts = frame->timestamp + duration;
		uint64_t cutoff;

		if (end_ts <= decklink->start_timestamp) {
			return false;
		}

		cutoff = decklink->start_timestamp - frame->timestamp;
		output->timestamp += cutoff;

		cutoff = util_mul_div64(cutoff, decklink->audio_samplerate, 1000000000ULL);

		for (size_t i = 0; i < decklink->audio_planes; i++) {
			output->data[i] += decklink->audio_size * (uint32_t)cutoff;
		}

		output->frames -= (uint32_t)cutoff;
	}

	return true;
}

static void decklink_output_raw_audio(void *data, struct audio_data *frames)
{
	auto *decklink = (DeckLinkOutput *)data;
	struct audio_data in;

	if (!decklink->start_timestamp) {
		return;
	}

	if (!prepare_audio(decklink, frames, &in)) {
		return;
	}

	decklink->WriteAudio(&in);
}

static bool decklink_output_device_changed(obs_properties_t *props, obs_property_t *list, obs_data_t *settings)
{
	const char *hash = obs_data_get_string(settings, DEVICE_HASH);
	if (*hash) {
		const char *name = obs_data_get_string(settings, DEVICE_NAME);
		const char *mode = obs_data_get_string(settings, MODE_NAME);
		long long modeId = obs_data_get_int(settings, MODE_ID);

		size_t itemCount = obs_property_list_item_count(list);
		bool itemFound = false;

		for (size_t i = 0; i < itemCount; i++) {
			const char *curHash = obs_property_list_item_string(list, i);
			if (strcmp(hash, curHash) == 0) {
				itemFound = true;
				break;
			}
		}

		if (!itemFound) {
			obs_property_list_insert_string(list, 0, name, hash);
			obs_property_list_item_disable(list, 0, true);
		}

		obs_property_t *modeList = obs_properties_get(props, MODE_ID);
		obs_property_t *keyerList = obs_properties_get(props, KEYER);

		obs_property_list_clear(modeList);
		obs_property_list_clear(keyerList);
		auto *hdrModeList=obs_properties_get(props,"freemix_hdr_modes");if(hdrModeList)obs_property_list_clear(hdrModeList);

		ComPtr<DeckLinkDevice> device;
		device.Set(deviceEnum->FindByHash(hash));

		if (!device) {
			obs_property_list_add_int(modeList, mode, modeId);
			obs_property_list_item_disable(modeList, 0, true);
			obs_property_list_item_disable(keyerList, 0, true);
		} else {
			const std::vector<DeckLinkDeviceMode *> &modes = device->GetOutputModes();
			auto *hdrModes = obs_properties_get(props,"freemix_hdr_modes");
			if(hdrModes){obs_property_list_clear(hdrModes);for(auto *mode:modes)obs_property_list_add_int(hdrModes,mode->GetName().c_str(),mode->GetId());}

			struct obs_video_info ovi;
			if (obs_get_video_info(&ovi)) {
				for (DeckLinkDeviceMode *mode : modes) {
					if (mode->IsEqualFrameRate(ovi.fps_num, ovi.fps_den)) {
						obs_property_list_add_int(modeList, mode->GetName().c_str(),
									  mode->GetId());
					}
				}
			}

			obs_property_list_add_int(keyerList, "Disabled", 0);

			if (device->GetSupportsExternalKeyer()) {
				obs_property_list_add_int(keyerList, "External", 1);
			}

			if (device->GetSupportsInternalKeyer()) {
				obs_property_list_add_int(keyerList, "Internal", 2);
			}
		}
	}

	return true;
}

static obs_properties_t *decklink_output_properties(void *unused)
{
	UNUSED_PARAMETER(unused);
	obs_properties_t *props = obs_properties_create();

	obs_property_t *list =
		obs_properties_add_list(props, DEVICE_HASH, TEXT_DEVICE, OBS_COMBO_TYPE_LIST, OBS_COMBO_FORMAT_STRING);
	obs_property_set_modified_callback(list, decklink_output_device_changed);

	fill_out_devices(list);

	obs_properties_add_list(props, MODE_ID, TEXT_MODE, OBS_COMBO_TYPE_LIST, OBS_COMBO_FORMAT_INT);
	auto *hdrModes=obs_properties_add_list(props,"freemix_hdr_modes","FreeMix HDR driver modes",OBS_COMBO_TYPE_LIST,OBS_COMBO_FORMAT_INT);obs_property_set_visible(hdrModes,false);

	obs_properties_add_bool(props, AUTO_START, TEXT_AUTO_START);
	obs_properties_add_bool(props, FORCE_SDR, TEXT_FORCE_SDR);

	obs_properties_add_list(props, KEYER, TEXT_ENABLE_KEYER, OBS_COMBO_TYPE_LIST, OBS_COMBO_FORMAT_INT);
	// Capability marker only; a driver/mode preflight is required before HDR start.
	auto *hdr=obs_properties_add_bool(props,"freemix_hdr_contract","FreeMix explicit HDR contract1");obs_property_set_visible(hdr,false);

	return props;
}

static const char *decklink_output_get_name(void *)
{
	return obs_module_text("BlackmagicDevice");
}

struct obs_output_info create_decklink_output_info()
{
	static bool registered=false;if(!registered){registered=true;proc_handler_add(obs_get_proc_handler(),"void freemix_decklink_hdr_preflight(in ptr config, in ptr response)",freemix_hdr_query,nullptr);}
	struct obs_output_info decklink_output_info = {};

	decklink_output_info.id = "decklink_output";
	decklink_output_info.flags = OBS_OUTPUT_AV;
	decklink_output_info.get_name = decklink_output_get_name;
	decklink_output_info.create = decklink_output_create;
	decklink_output_info.destroy = decklink_output_destroy;
	decklink_output_info.start = decklink_output_start;
	decklink_output_info.stop = decklink_output_stop;
	decklink_output_info.get_properties = decklink_output_properties;
	decklink_output_info.raw_video = decklink_output_raw_video;
	decklink_output_info.raw_audio = decklink_output_raw_audio;
	decklink_output_info.update = decklink_output_update;

	return decklink_output_info;
}
