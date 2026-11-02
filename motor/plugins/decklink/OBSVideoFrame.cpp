#include "OBSVideoFrame.h"

OBSVideoFrame::OBSVideoFrame(long width, long height, BMDPixelFormat pixelFormat)
{
	this->width = width;
	this->height = height;
	this->rowBytes = pixelFormat == bmdFormat10BitRGBXLE ? long(freemix_decklink_hdr::RowBytes(width)) :
		pixelFormat == bmdFormat10BitYUV ? ((width + 47) / 48) * 128 :
		pixelFormat == bmdFormat8BitBGRA ? width * 4 : width * 2;
	this->data = new unsigned char[size_t(this->rowBytes) * size_t(height) + 1]{};
	this->flags = bmdFrameFlagDefault;
	this->pixelFormat = pixelFormat;
}

OBSVideoFrame::~OBSVideoFrame()
{
	delete[] this->data;
}

HRESULT OBSVideoFrame::SetFlags(BMDFrameFlags newFlags)
{
	flags = newFlags;
	return S_OK;
}

HRESULT OBSVideoFrame::SetTimecode(BMDTimecodeFormat format, IDeckLinkTimecode *timecode)
{
	UNUSED_PARAMETER(format);
	UNUSED_PARAMETER(timecode);
	return 0;
}

HRESULT
OBSVideoFrame::SetTimecodeFromComponents(BMDTimecodeFormat format, uint8_t hours, uint8_t minutes, uint8_t seconds,
					 uint8_t frames, BMDTimecodeFlags flags)
{
	UNUSED_PARAMETER(format);
	UNUSED_PARAMETER(hours);
	UNUSED_PARAMETER(minutes);
	UNUSED_PARAMETER(seconds);
	UNUSED_PARAMETER(frames);
	UNUSED_PARAMETER(flags);
	return 0;
}

HRESULT OBSVideoFrame::SetAncillaryData(IDeckLinkVideoFrameAncillary *ancillary)
{
	UNUSED_PARAMETER(ancillary);
	return 0;
}

HRESULT OBSVideoFrame::SetTimecodeUserBits(BMDTimecodeFormat format, BMDTimecodeUserBits userBits)
{
	UNUSED_PARAMETER(format);
	UNUSED_PARAMETER(userBits);
	return 0;
}

long OBSVideoFrame::GetWidth()
{
	return width;
}

long OBSVideoFrame::GetHeight()
{
	return height;
}

long OBSVideoFrame::GetRowBytes()
{
	return rowBytes;
}

BMDPixelFormat OBSVideoFrame::GetPixelFormat()
{
	return pixelFormat;
}

BMDFrameFlags OBSVideoFrame::GetFlags()
{
	return flags;
}

HRESULT OBSVideoFrame::GetBytes(void **buffer)
{
	*buffer = this->data;
	return S_OK;
}

#define CompareREFIID(iid1, iid2) (memcmp(&iid1, &iid2, sizeof(REFIID)) == 0)

HDRVideoFrame::HDRVideoFrame(IDeckLinkMutableVideoFrame *frame, const freemix_decklink_hdr::Metadata *metadata)
	: m_videoFrame(frame), m_refCount(1), explicitMetadata(metadata != nullptr)
{
	if (metadata) hdrMetadata = *metadata;
}

HRESULT HDRVideoFrame::QueryInterface(REFIID iid, LPVOID *ppv)
{
	if (ppv == nullptr) {
		return E_INVALIDARG;
	}

	CFUUIDBytes unknown = CFUUIDGetUUIDBytes(IUnknownUUID);
	if (CompareREFIID(iid, unknown)) {
		*ppv = static_cast<IDeckLinkVideoFrame *>(this);
	} else if (CompareREFIID(iid, IID_IDeckLinkVideoFrame)) {
		*ppv = static_cast<IDeckLinkVideoFrame *>(this);
	} else if (CompareREFIID(iid, IID_IDeckLinkVideoFrameMetadataExtensions)) {
		*ppv = static_cast<IDeckLinkVideoFrameMetadataExtensions *>(this);
	} else {
		*ppv = nullptr;
		// Preserve SDK ancillary interfaces on the underlying output frame.
		return m_videoFrame->QueryInterface(iid, ppv);
	}

	AddRef();
	return S_OK;
}

ULONG HDRVideoFrame::AddRef(void)
{
	return ++m_refCount;
}

ULONG HDRVideoFrame::Release(void)
{
	ULONG newRefValue = --m_refCount;

	if (newRefValue == 0) {
		delete this;
	}

	return newRefValue;
}

HRESULT HDRVideoFrame::GetInt(BMDDeckLinkFrameMetadataID metadataID, int64_t *value)
{
	if (!value) return E_INVALIDARG;
	HRESULT result = S_OK;

	switch (metadataID) {
	case bmdDeckLinkFrameMetadataHDRElectroOpticalTransferFunc:
		*value = explicitMetadata ? int64_t(hdrMetadata.transfer) : 2;
		break;

	case bmdDeckLinkFrameMetadataColorspace:
		// Colorspace is fixed for this sample
		*value = bmdColorspaceRec2020;
		break;

	default:
		result = E_INVALIDARG;
	}

	return result;
}

HRESULT HDRVideoFrame::GetFloat(BMDDeckLinkFrameMetadataID metadataID, double *value)
{
	if (!value) return E_INVALIDARG;
	if (explicitMetadata) {
		switch (metadataID) {
		case bmdDeckLinkFrameMetadataHDRDisplayPrimariesRedX: *value=hdrMetadata.redX; break;
		case bmdDeckLinkFrameMetadataHDRDisplayPrimariesRedY: *value=hdrMetadata.redY; break;
		case bmdDeckLinkFrameMetadataHDRDisplayPrimariesGreenX: *value=hdrMetadata.greenX; break;
		case bmdDeckLinkFrameMetadataHDRDisplayPrimariesGreenY: *value=hdrMetadata.greenY; break;
		case bmdDeckLinkFrameMetadataHDRDisplayPrimariesBlueX: *value=hdrMetadata.blueX; break;
		case bmdDeckLinkFrameMetadataHDRDisplayPrimariesBlueY: *value=hdrMetadata.blueY; break;
		case bmdDeckLinkFrameMetadataHDRWhitePointX: *value=hdrMetadata.whiteX; break;
		case bmdDeckLinkFrameMetadataHDRWhitePointY: *value=hdrMetadata.whiteY; break;
		case bmdDeckLinkFrameMetadataHDRMaxDisplayMasteringLuminance: *value=hdrMetadata.maxMastering; break;
		case bmdDeckLinkFrameMetadataHDRMinDisplayMasteringLuminance: *value=hdrMetadata.minMastering; break;
		case bmdDeckLinkFrameMetadataHDRMaximumContentLightLevel: *value=hdrMetadata.maxContent; break;
		case bmdDeckLinkFrameMetadataHDRMaximumFrameAverageLightLevel: *value=hdrMetadata.maxAverage; break;
		default: return E_INVALIDARG;
		}
		return S_OK;
	}
	HRESULT result = S_OK;

	switch (metadataID) {
	case bmdDeckLinkFrameMetadataHDRDisplayPrimariesRedX:
		*value = 0.708;
		break;

	case bmdDeckLinkFrameMetadataHDRDisplayPrimariesRedY:
		*value = 0.292;
		break;

	case bmdDeckLinkFrameMetadataHDRDisplayPrimariesGreenX:
		*value = 0.17;
		break;

	case bmdDeckLinkFrameMetadataHDRDisplayPrimariesGreenY:
		*value = 0.797;
		break;

	case bmdDeckLinkFrameMetadataHDRDisplayPrimariesBlueX:
		*value = 0.131;
		break;

	case bmdDeckLinkFrameMetadataHDRDisplayPrimariesBlueY:
		*value = 0.046;
		break;

	case bmdDeckLinkFrameMetadataHDRWhitePointX:
		*value = 0.3127;
		break;

	case bmdDeckLinkFrameMetadataHDRWhitePointY:
		*value = 0.329;
		break;

	case bmdDeckLinkFrameMetadataHDRMaxDisplayMasteringLuminance:
		*value = obs_get_video_hdr_nominal_peak_level();
		break;

	case bmdDeckLinkFrameMetadataHDRMinDisplayMasteringLuminance:
		*value = 0.0001;
		break;

	case bmdDeckLinkFrameMetadataHDRMaximumContentLightLevel:
		*value = obs_get_video_hdr_nominal_peak_level();
		break;

	case bmdDeckLinkFrameMetadataHDRMaximumFrameAverageLightLevel:
		*value = obs_get_video_hdr_nominal_peak_level();
		break;

	default:
		result = E_INVALIDARG;
	}

	return result;
}

HRESULT HDRVideoFrame::GetFlag(BMDDeckLinkFrameMetadataID, decklink_bool_t *)
{
	// Not expecting GetFlag
	return E_INVALIDARG;
}

HRESULT HDRVideoFrame::GetString(BMDDeckLinkFrameMetadataID, decklink_string_t *)
{
	// Not expecting GetString
	return E_INVALIDARG;
}

HRESULT HDRVideoFrame::GetBytes(BMDDeckLinkFrameMetadataID, void *, uint32_t *bufferSize)
{
	if (!bufferSize) return E_INVALIDARG;
	*bufferSize = 0;
	// Not expecting GetBytes
	return E_INVALIDARG;
}
