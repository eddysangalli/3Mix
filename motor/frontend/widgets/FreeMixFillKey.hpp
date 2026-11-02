// FreeMix software Fill+Key: BGRA8 premultiplied fill and opaque grayscale key.
// Both frames must keep the source timestamp. This does not imply SDI genlock.
#pragma once
#include <cstdint>
#include <cstddef>
#include <vector>

namespace freemix_fill_key {
// Official NDI BGRA/BGRX requires straight RGB. OBS is premultiplied.
// Keep alpha unchanged for the matching matte.
inline void StraightRgb(uint8_t *pixels, size_t count)
{
 for(size_t i=0;i<count;++i){uint8_t *p=pixels+i*4;const unsigned a=p[3];
  for(size_t c=0;c<3;++c){const unsigned value=a?(unsigned(p[c])*255+a/2)/a:0;p[c]=uint8_t(value>255?255:value);}
 }
}
inline void MakeKey(const uint8_t *bgra, size_t stride, uint32_t width,
                    uint32_t height, std::vector<uint8_t> &key)
{
 key.resize(size_t(width) * height * 4);
 for (uint32_t y = 0; y < height; ++y) {
  const uint8_t *src = bgra + stride * y;
  uint8_t *dst = key.data() + size_t(width) * 4 * y;
  for (uint32_t x = 0; x < width; ++x) {
   const uint8_t alpha = src[x * 4 + 3];
   dst[x * 4] = dst[x * 4 + 1] = dst[x * 4 + 2] = alpha;
   dst[x * 4 + 3] = 255;
  }
 }
}
}
