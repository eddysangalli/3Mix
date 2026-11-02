#pragma once
// SDK manual: RGBX10LE uses limited RGB64..940, R[31:22]/G[21:12]/B[11:2].
// Its rows must be aligned to256 bytes. Input P416 is native16-bit Y + UV444.
// This contract never decodes PQ/HLG into SDR or passes pixels through8bits.
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <string>
#if defined(_M_X64) || defined(__SSE2__)
#include <emmintrin.h>
#endif

namespace freemix_decklink_hdr {
enum class Transfer : int64_t { Invalid = -1, Pq = 2, Hlg = 3 };
inline Transfer Parse(const std::string &s) { return s == "pq" ? Transfer::Pq : s == "hlg" ? Transfer::Hlg : Transfer::Invalid; }
struct Metadata {
 Transfer transfer = Transfer::Invalid;
 bool confirmed = false;
 double redX=.708, redY=.292, greenX=.170, greenY=.797, blueX=.131, blueY=.046, whiteX=.3127, whiteY=.329;
 double maxMastering=0, minMastering=0, maxContent=0, maxAverage=0;
};
inline bool FiniteRange(double x,double lo,double hi) { return std::isfinite(x)&&x>=lo&&x<=hi; }
inline std::string Validate(const Metadata &m) {
 if(m.transfer!=Transfer::Pq&&m.transfer!=Transfer::Hlg)return "Select PQ or HLG transfer";
 if(!m.confirmed)return "Confirm the output mastering metadata; source metadata is not inferred";
 const double coords[]={m.redX,m.redY,m.greenX,m.greenY,m.blueX,m.blueY,m.whiteX,m.whiteY};
 for(double x:coords)if(!FiniteRange(x,0.,1.))return "HDR primaries and white point must be finite0..1";
 if(m.redX+m.redY>1.||m.greenX+m.greenY>1.||m.blueX+m.blueY>1.||m.whiteX+m.whiteY>1.||m.redY<=0||m.greenY<=0||m.blueY<=0||m.whiteY<=0)return "HDR primary/white chromaticities are invalid";
 if(!FiniteRange(m.maxMastering,1.,10000.)||!FiniteRange(m.minMastering,.0001,6.5535)||m.minMastering>=m.maxMastering)return "Explicit mastering luminance required in nits";
 if(!FiniteRange(m.maxContent,1.,10000.)||!FiniteRange(m.maxAverage,1.,10000.)||m.maxAverage>m.maxContent)return "Explicit valid MaxCLL/MaxFALL required in nits";
 return {};
}
struct Capabilities { bool hdrMetadata=false, colorspaceMetadata=false, pq=false, hlg=false, rec2020Mode=false, tenBitRgbMode=false, exactMode=false, sdiConnection=false; };
inline std::string Preflight(const Metadata &m,const Capabilities &c,bool hdrSource,bool privateSource,int keyer) {
 if(const auto error=Validate(m);!error.empty())return error;
 if(privateSource)return "Private director audio cannot leave via SDI";
 if(!hdrSource)return "Select a real HDR/float source; SDR relabeling is refused";
 if(keyer!=0)return "HDR alpha/keyer is unsupported in RGBX10LE";
 if(!c.hdrMetadata||!c.colorspaceMetadata)return "Driver must advertise HDR and colorspace metadata";
 if(!(m.transfer==Transfer::Pq?c.pq:c.hlg))return "Driver does not advertise the selected PQ/HLG dynamic range";
 if(!c.sdiConnection||!c.rec2020Mode)return "Selected SDI mode must advertise Rec2020";
 if(!c.tenBitRgbMode||!c.exactMode)return "DoesSupportVideoMode must accept exact RGBX10LE without conversion";
 return {};
}
inline size_t RowBytes(size_t width) { return ((width+63)/64)*256; }
inline uint16_t Quantize(double component) { return uint16_t(64+uint16_t(std::clamp(component,0.,1.)*876.+.5)); }
inline uint32_t Pack(double r,double g,double b) { return uint32_t(Quantize(r))<<22|uint32_t(Quantize(g))<<12|uint32_t(Quantize(b))<<2; }
inline uint16_t Read16(const uint8_t *p) { return uint16_t(p[0])|uint16_t(p[1])<<8; }
inline int64_t AudioStreamTime(uint64_t timestamp,uint64_t start,int64_t preroll,int64_t duration,int64_t scale) {
 if(timestamp<start||preroll<0||duration<=0||scale<=0)return -1;
 const auto ns=timestamp-start;
 return int64_t((ns/1000000000ULL)*48000ULL+(ns%1000000000ULL)*48000ULL/1000000000ULL)+preroll*duration*48000/scale;
}
// Incomplete explicit HDR starts must not leave connector/audio/callback on.
template<class Output> struct StartupRollback {
 Output *output;
 bool video=false,audio=false,callback=false,playbackAttempted=false,committed=false;
 explicit StartupRollback(Output *value):output(value){}
 ~StartupRollback(){
  if(committed||!output)return;
  if(callback)output->SetScheduledFrameCompletionCallback(nullptr);
  if(playbackAttempted){int64_t actual=0;output->StopScheduledPlayback(0,&actual,1000);}
  if(audio)output->DisableAudioOutput();
  if(video)output->DisableVideoOutput();
 }
};
inline bool ConvertP416(const uint8_t *y,const uint8_t *uv,size_t yStride,size_t uvStride,uint8_t *dest,size_t destStride,size_t width,size_t height) {
 if(!y||!uv||!dest||!width||width>7680||!height||height>4320||yStride<width*2||uvStride<width*4||destStride<RowBytes(width))return false;
 for(size_t row=0;row<height;row++) {
  const auto *luma=y+row*yStride,*chroma=uv+row*uvStride;auto *out=dest+row*destStride;
  size_t x=0;
#if defined(_M_X64) || defined(__SSE2__)
  const auto zero=_mm_setzero_si128();
  const auto uvCenter=_mm_set1_epi32(32768),yBlack=_mm_set1_epi32(4096);
  const auto yScale=_mm_set1_ps(1.f/56064.f),uvScale=_mm_set1_ps(1.f/57344.f);
  const auto clamp0=_mm_setzero_ps(),clamp1=_mm_set1_ps(1.f),rgbScale=_mm_set1_ps(876.f),rgbBlackAndRound=_mm_set1_ps(64.5f);
  for(;x+4<=width;x+=4) {
   const auto yy16=_mm_loadl_epi64(reinterpret_cast<const __m128i*>(luma+x*2));
   const auto yy=_mm_mul_ps(_mm_cvtepi32_ps(_mm_sub_epi32(_mm_unpacklo_epi16(yy16,zero),yBlack)),yScale);
   const auto chroma16=_mm_loadu_si128(reinterpret_cast<const __m128i*>(chroma+x*4));
   const auto lo=_mm_unpacklo_epi16(chroma16,zero),hi=_mm_unpackhi_epi16(chroma16,zero);
   const auto cb32=_mm_unpacklo_epi64(_mm_shuffle_epi32(lo,_MM_SHUFFLE(2,0,2,0)),_mm_shuffle_epi32(hi,_MM_SHUFFLE(2,0,2,0)));
   const auto cr32=_mm_unpacklo_epi64(_mm_shuffle_epi32(lo,_MM_SHUFFLE(3,1,3,1)),_mm_shuffle_epi32(hi,_MM_SHUFFLE(3,1,3,1)));
   const auto cb=_mm_mul_ps(_mm_cvtepi32_ps(_mm_sub_epi32(cb32,uvCenter)),uvScale),cr=_mm_mul_ps(_mm_cvtepi32_ps(_mm_sub_epi32(cr32,uvCenter)),uvScale);
   const auto r=_mm_add_ps(yy,_mm_mul_ps(cr,_mm_set1_ps(1.4746f))),b=_mm_add_ps(yy,_mm_mul_ps(cb,_mm_set1_ps(1.8814f)));
   const auto g=_mm_sub_ps(_mm_sub_ps(yy,_mm_mul_ps(cb,_mm_set1_ps(.1645531268f))),_mm_mul_ps(cr,_mm_set1_ps(.5713531268f)));
   const auto quant=[&](__m128 c){return _mm_cvttps_epi32(_mm_add_ps(_mm_mul_ps(_mm_min_ps(clamp1,_mm_max_ps(clamp0,c)),rgbScale),rgbBlackAndRound));};
   const auto words=_mm_or_si128(_mm_or_si128(_mm_slli_epi32(quant(r),22),_mm_slli_epi32(quant(g),12)),_mm_slli_epi32(quant(b),2));
   _mm_storeu_si128(reinterpret_cast<__m128i*>(out+x*4),words);
  }
#endif
  for(;x<width;x++) {
   const double yy=(double(Read16(luma+x*2))-4096.)/56064.;
   const double cb=(double(Read16(chroma+x*4))-32768.)/57344.,cr=(double(Read16(chroma+x*4+2))-32768.)/57344.;
   const double r=yy+1.4746*cr,b=yy+1.8814*cb,g=(yy-.2627*r-.0593*b)/.678;
   const auto word=Pack(r,g,b);std::memcpy(out+x*4,&word,sizeof word);
  }
  std::memset(out+width*4,0,destStride-width*4);
 }
 return true;
}
}
