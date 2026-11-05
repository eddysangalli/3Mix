// FreeMix audio routing utilities for OMT outputs
#pragma once

#include <obs.hpp>
#include <string>
#include <vector>

namespace freemix_fill_key {
inline void StraightRgb(void *data, size_t pixels){
    // Straight alpha: RGB already pre-multiplied, no conversion needed
    (void)data; (void)pixels;
}
inline void MakeKey(const void *rgba, size_t stride, uint32_t width, uint32_t height, std::vector<uint8_t> &key){
    key.resize(width * height);
    const uint8_t *src = static_cast<const uint8_t *>(rgba);
    uint8_t *dst = key.data();
    for(uint32_t y = 0; y < height; y++){
        const uint8_t *row = static_cast<const uint8_t *>(rgba) + y * stride;
        for(uint32_t x = 0; x < width; x++){
            dst[x] = row[x * 4 + 3]; // Alpha channel
        }
        dst += width;
    }
}
} // namespace freemix_fill_key

namespace freemix_audio_routing {
// Audio routing utilities for OMT outputs
inline void RouteAudio(const audio_data *data, std::vector<float> &out, float gain = 1.0f){
    if(!data || !data->frames) return;
    out.resize(size_t(data->frames) * 2);
    for(size_t ch = 0; ch < 2; ch++){
        float *dest = out.data() + ch * data->frames;
        if(data->data[ch]){
            const float *src = static_cast<const float *>(data->data[ch]);
            for(uint32_t i = 0; i < data->frames; i++)
                dest[i] = src[i] * gain;
        }else{
            std::fill_n(dest, data->frames, 0.0f);
        }
    }
}
} // namespace freemix_audio_routing